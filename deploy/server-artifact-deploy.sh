#!/usr/bin/env bash
set -Eeuo pipefail

commit_sha="${1:-}"
archive_file="${2:-}"

if [[ ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full Git commit SHA is required." >&2
  exit 2
fi

if [[ ! -f "$archive_file" ]]; then
  echo "The release archive was not found." >&2
  exit 2
fi

app_root="/srv/ykamina"
releases_dir="$app_root/releases"
release_dir="$releases_dir/$commit_sha"
current_link="$app_root/current"
staging_dir="$app_root/.staging-$commit_sha-$$"
superseded_dir="$app_root/.superseded-$commit_sha-$$"
certificate_file="/etc/ssl/certs/ykamina-timeweb-db.crt"
previous_release="$(readlink -f "$current_link" 2>/dev/null || true)"

if [[ "$release_dir" == "$previous_release" ]]; then
  release_dir="$releases_dir/$commit_sha-$(date +%s)"
fi

cleanup() {
  rm -rf -- "$staging_dir"
  rm -rf -- "$superseded_dir" || true
  rm -f -- "$archive_file"
}
trap cleanup EXIT

install -d -m 755 "$app_root" "$releases_dir" "$staging_dir"
tar -xzf "$archive_file" -C "$staging_dir"

umask 077
environment_file="$staging_dir/frontend/.env.production"
: > "$environment_file"
for expected_key in DATABASE_URL DATABASE_PUBLIC_HOST DATABASE_SSL_REJECT_UNAUTHORIZED; do
  IFS= read -r line || {
    echo "Missing database configuration." >&2
    exit 2
  }
  if [[ "$line" != "$expected_key="* ]]; then
    echo "Invalid database configuration." >&2
    exit 2
  fi
  printf '%s\n' "$line" >> "$environment_file"
done
chmod 600 "$environment_file"
ln -sfn .env.production "$staging_dir/frontend/.env.local"

pushd "$staging_dir/frontend" >/dev/null
npm ci --omit=dev
env NODE_EXTRA_CA_CERTS="$certificate_file" npm run db:migrate
popd >/dev/null

if [[ -e "$release_dir" && "$release_dir" != "$previous_release" ]]; then
  mv "$release_dir" "$superseded_dir"
fi
mv "$staging_dir" "$release_dir"

ln -sfn "$release_dir" "$app_root/current.next"
mv -Tf "$app_root/current.next" "$current_link"
sudo /usr/bin/systemctl restart ykamina.service

healthy=false
for _ in {1..20}; do
  if systemctl is-active --quiet ykamina.service \
    && curl --fail --silent --max-time 5 http://127.0.0.1:3000/ >/dev/null \
    && curl --fail --silent --max-time 10 http://127.0.0.1:3000/api/products \
      | node -e 'let input=""; process.stdin.on("data", chunk => input += chunk).on("end", () => { try { const response = JSON.parse(input); process.exit(Array.isArray(response.data) && response.data.length > 20 ? 0 : 1); } catch { process.exit(1); } });'; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  echo "The new release failed its health check." >&2
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    ln -sfn "$previous_release" "$app_root/current.next"
    mv -Tf "$app_root/current.next" "$current_link"
    sudo /usr/bin/systemctl restart ykamina.service
    echo "Rolled back to the previous release." >&2
  fi
  exit 1
fi

echo "Deployed $commit_sha successfully."
