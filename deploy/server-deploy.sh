#!/usr/bin/env bash
set -Eeuo pipefail

commit_sha="${1:-}"
if [[ ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full Git commit SHA is required." >&2
  exit 2
fi

app_root="/srv/ykamina"
releases_dir="$app_root/releases"
release_dir="$releases_dir/$commit_sha"
current_link="$app_root/current"
repository="https://github.com/leader2869/ykamina.ru.git"
environment_file="/etc/ykamina/ykamina.env"
certificate_file="/etc/ssl/certs/ykamina-timeweb-db.crt"
previous_release="$(readlink -f "$current_link" 2>/dev/null || true)"

install -d -m 755 "$app_root" "$releases_dir"

if [[ ! -d "$release_dir/.git" ]]; then
  git clone --filter=blob:none --no-checkout "$repository" "$release_dir"
fi

git -C "$release_dir" fetch --depth 1 origin "$commit_sha"
git -C "$release_dir" checkout --detach --force "$commit_sha"
ln -sfn "$environment_file" "$release_dir/frontend/.env.local"

pushd "$release_dir/frontend" >/dev/null
npm ci
npm run lint
env NODE_EXTRA_CA_CERTS="$certificate_file" npm run build
env NODE_EXTRA_CA_CERTS="$certificate_file" npm run db:migrate
popd >/dev/null

ln -sfn "$release_dir" "$app_root/current.next"
mv -Tf "$app_root/current.next" "$current_link"
sudo /usr/bin/systemctl restart ykamina.service

healthy=false
for _ in {1..20}; do
  if systemctl is-active --quiet ykamina.service && curl --fail --silent --max-time 5 http://127.0.0.1:3000/ >/dev/null; then
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
    echo "Rolled back to $previous_release." >&2
  fi
  exit 1
fi

echo "Deployed $commit_sha successfully."
