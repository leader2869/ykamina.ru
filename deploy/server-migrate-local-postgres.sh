#!/usr/bin/env bash
set -Eeuo pipefail

app_root="/srv/ykamina"
current_link="$app_root/current"
shared_dir="$app_root/shared"
backup_dir="$shared_dir/database-backups"
bin_dir="$shared_dir/bin"
local_environment="$shared_dir/database.env"
candidate_environment="$shared_dir/database.env.candidate"
postgres_version="18"
database_name="ykamina"
database_user="ykamina"
service_name="ykamina.service"
service_environment="/etc/ykamina/ykamina.env"

if [[ ! -d "$current_link/frontend" ]]; then
  echo "The current production release was not found." >&2
  exit 2
fi

remote_environment="$(mktemp)"
cleanup() {
  rm -f -- "$remote_environment"
}
trap cleanup EXIT

umask 077
: > "$remote_environment"
declare -A remote_values=()
for expected_key in DATABASE_URL DATABASE_PUBLIC_HOST DATABASE_SSL_REJECT_UNAUTHORIZED; do
  IFS= read -r line || {
    echo "Missing remote database configuration." >&2
    exit 2
  }
  if [[ "$line" != "$expected_key="* ]]; then
    echo "Invalid remote database configuration." >&2
    exit 2
  fi
  remote_values["$expected_key"]="${line#*=}"
  printf '%s\n' "$line" >> "$remote_environment"
done

if [[ -s "$local_environment" ]]; then
  echo "Local PostgreSQL is already configured; validating the existing migration."
  set -a
  # shellcheck disable=SC1090
  source "$local_environment"
  set +a
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'SELECT 1' >/dev/null
  sudo ln -sfn "$local_environment" "$service_environment"
  sudo systemctl restart "$service_name"
  echo "Existing local PostgreSQL configuration is healthy."
  exit 0
fi

install -d -m 700 "$shared_dir" "$backup_dir" "$bin_dir"

if [[ ! -x "/usr/lib/postgresql/$postgres_version/bin/postgres" ]] || ! command -v pg_conftool >/dev/null 2>&1; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg
  sudo install -d -m 755 /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor \
    | sudo tee /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg >/dev/null
  distribution_codename="$(. /etc/os-release && printf '%s' "$VERSION_CODENAME")"
  printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' "$distribution_codename" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "postgresql-$postgres_version" "postgresql-client-$postgres_version"
fi

# pg_conftool writes string values verbatim on Ubuntu 26.04. Writing the
# address through it either omits the required quotes or double-escapes them.
sudo sed -Ei "s|^[#[:space:]]*listen_addresses[[:space:]]*=.*|listen_addresses = '127.0.0.1'|" \
  "/etc/postgresql/$postgres_version/main/postgresql.conf"
sudo pg_conftool "$postgres_version" main set max_connections '40'
sudo pg_conftool "$postgres_version" main set shared_buffers '128MB'
sudo pg_conftool "$postgres_version" main set effective_cache_size '512MB'
sudo pg_conftool "$postgres_version" main set maintenance_work_mem '64MB'
sudo pg_conftool "$postgres_version" main set work_mem '4MB'
sudo pg_conftool "$postgres_version" main set wal_compression 'on'
sudo systemctl enable --now postgresql
sudo systemctl restart "postgresql@$postgres_version-main"

if ! swapon --show=NAME --noheadings | grep -q .; then
  if [[ ! -f /swapfile ]]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile >/dev/null
  fi
  sudo swapon /swapfile
  if ! grep -q '^/swapfile ' /etc/fstab; then
    printf '/swapfile none swap sw 0 0\n' | sudo tee -a /etc/fstab >/dev/null
  fi
fi

local_password="$(openssl rand -hex 24)"
if ! sudo -u postgres psql -Atqc "SELECT 1 FROM pg_roles WHERE rolname='$database_user'" | grep -qx 1; then
  sudo -u postgres createuser --login "$database_user"
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE $database_user WITH LOGIN PASSWORD '$local_password';" >/dev/null
if sudo -u postgres psql -Atqc "SELECT 1 FROM pg_database WHERE datname='$database_name'" | grep -qx 1; then
  echo "Removing an incomplete local migration database from an earlier attempt."
  sudo -u postgres dropdb --if-exists "$database_name"
fi
sudo -u postgres createdb --owner="$database_user" "$database_name"

export DATABASE_URL="${remote_values[DATABASE_URL]}"
export DATABASE_PUBLIC_HOST="${remote_values[DATABASE_PUBLIC_HOST]}"
export DATABASE_SSL_REJECT_UNAUTHORIZED="${remote_values[DATABASE_SSL_REJECT_UNAUTHORIZED]}"
remote_database_url="$(node - <<'NODE'
const url = new URL(process.env.DATABASE_URL);
if (process.env.DATABASE_PUBLIC_HOST) url.hostname = process.env.DATABASE_PUBLIC_HOST;
url.searchParams.set('sslmode', 'require');
process.stdout.write(url.toString());
NODE
)"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
remote_backup="$backup_dir/remote-before-local-$timestamp.dump"
current_environment="$current_link/frontend/.env.production"
previous_environment="$backup_dir/remote-environment-$timestamp"
previous_service_environment="$backup_dir/remote-service-environment-$timestamp"
cp "$current_environment" "$previous_environment"
sudo cp -L "$service_environment" "$previous_service_environment"
chmod 600 "$previous_environment"
sudo chmod 600 "$previous_service_environment"

service_was_stopped=false
restore_remote_service() {
  if [[ "$service_was_stopped" == true ]]; then
    set +e
    rm -f -- "$local_environment" "$candidate_environment"
    rm -f -- "$current_environment"
    install -m 600 "$previous_environment" "$current_environment"
    sudo rm -f -- "$service_environment"
    sudo install -m 600 "$previous_service_environment" "$service_environment"
    ln -sfn .env.production "$current_link/frontend/.env.local"
    sudo systemctl restart "$service_name" || true
    sudo -u postgres dropdb --if-exists "$database_name" || true
    set -e
  fi
}
trap 'restore_remote_service; cleanup' ERR

sudo systemctl stop "$service_name"
service_was_stopped=true

PGCONNECT_TIMEOUT=20 "/usr/lib/postgresql/$postgres_version/bin/pg_dump" \
  --format=custom --compress=6 --no-owner --no-acl \
  --file="$remote_backup" "$remote_database_url"

local_database_url="postgresql://$database_user:$local_password@127.0.0.1:5432/$database_name?sslmode=disable"
PGCONNECT_TIMEOUT=10 "/usr/lib/postgresql/$postgres_version/bin/pg_restore" \
  --exit-on-error --no-owner --no-acl --dbname="$local_database_url" "$remote_backup"

tables=(products users payment_orders sales_clients sales_deals sales_tasks company_expenses)
for table in "${tables[@]}"; do
  remote_count="$(PGCONNECT_TIMEOUT=20 psql "$remote_database_url" -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM $table")"
  local_count="$(PGCONNECT_TIMEOUT=10 psql "$local_database_url" -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM $table")"
  if [[ "$remote_count" != "$local_count" ]]; then
    echo "Row count mismatch for $table: remote=$remote_count local=$local_count" >&2
    exit 1
  fi
  echo "Verified $table: $local_count rows."
done

{
  printf 'DATABASE_URL=%s\n' "$local_database_url"
  printf 'DATABASE_PUBLIC_HOST=\n'
  printf 'DATABASE_SSL_REJECT_UNAUTHORIZED=false\n'
} > "$candidate_environment"
chmod 600 "$candidate_environment"

install -m 600 "$candidate_environment" "$current_environment"
sudo install -m 600 "$candidate_environment" "$service_environment"
ln -sfn .env.production "$current_link/frontend/.env.local"
sudo systemctl restart "$service_name"

healthy=false
for _ in {1..30}; do
  if systemctl is-active --quiet "$service_name" \
    && curl --fail --silent --max-time 5 http://127.0.0.1:3000/ >/dev/null \
    && curl --fail --silent --max-time 10 http://127.0.0.1:3000/catalog >/dev/null \
    && curl --fail --silent --max-time 10 http://127.0.0.1:3000/account/login >/dev/null \
    && curl --fail --silent --max-time 10 http://127.0.0.1:3000/api/products \
      | node -e 'let input=""; process.stdin.on("data", chunk => input += chunk).on("end", () => { try { const response = JSON.parse(input); process.exit(Array.isArray(response.data) && response.data.length > 20 ? 0 : 1); } catch { process.exit(1); } });'; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  echo "The application failed its local PostgreSQL health check." >&2
  restore_remote_service
  exit 1
fi

mv "$candidate_environment" "$local_environment"
rm -f "$current_environment"
ln -s "$local_environment" "$current_environment"
sudo rm -f "$service_environment"
sudo ln -s "$local_environment" "$service_environment"
ln -sfn .env.production "$current_link/frontend/.env.local"

backup_script="$bin_dir/backup-local-postgres"
cat > "$backup_script" <<'BACKUP'
#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
shared_dir="/srv/ykamina/shared"
backup_dir="$shared_dir/database-backups"
set -a
source "$shared_dir/database.env"
set +a
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
/usr/lib/postgresql/18/bin/pg_dump --format=custom --compress=6 --no-owner --no-acl \
  --file="$backup_dir/local-$timestamp.dump" "$DATABASE_URL"
find "$backup_dir" -type f -name 'local-*.dump' -mtime +7 -delete
BACKUP
chmod 700 "$backup_script"
deploy_user="$(stat -Lc '%U' "$current_link")"
printf '15 3 * * * %s %s\n' "$deploy_user" "$backup_script" \
  | sudo tee /etc/cron.d/ykamina-local-postgres-backup >/dev/null
sudo chmod 644 /etc/cron.d/ykamina-local-postgres-backup
"$backup_script"

service_was_stopped=false
trap - ERR

echo "Migrated production to local PostgreSQL successfully."
echo "The managed database was preserved for rollback."
