#!/usr/bin/env bash
set -Eeuo pipefail

commit_sha="${1:-}"
[[ "$commit_sha" =~ ^[0-9a-f]{40}$ ]] || exit 2
archive="/tmp/ykamina-image-repair-$commit_sha.tgz"
work="/srv/ykamina/shared/image-repair-tools/$commit_sha"
reports="/srv/ykamina/shared/image-repair"

# GitHub serializes repair jobs, but an interrupted SSH connection can leave
# its worker running. Only stop this workflow's precisely identified workers.
for previous_pid in $(pgrep -u "$(id -u)" -x node || true); do
  previous_dir="$(readlink "/proc/$previous_pid/cwd" 2>/dev/null || true)"
  if [[ "$previous_dir" == /srv/ykamina/shared/image-repair-tools/*/frontend ]]; then
    previous_command="$(tr '\0' ' ' < "/proc/$previous_pid/cmdline" 2>/dev/null || true)"
    if [[ "$previous_command" == *"scripts/repair-product-images.mjs --apply"* ]]; then
      kill -TERM "$previous_pid"
      for _ in {1..10}; do
        kill -0 "$previous_pid" 2>/dev/null || break
        sleep 1
      done
      if kill -0 "$previous_pid" 2>/dev/null; then
        echo 'Previous recovery worker has not stopped; refusing to run concurrently.' >&2
        exit 1
      fi
    fi
  fi
done

mkdir -p "$work" "$reports"
tar -xzf "$archive" -C "$work"
cd "$work/frontend"
ln -sfn /srv/ykamina/current/frontend/node_modules node_modules
mkdir -p public
ln -sfn /srv/ykamina/shared/media public/media
IMAGE_REPAIR_REPORT_DIR="$reports" node --env-file=/srv/ykamina/shared/database.env scripts/repair-product-images.mjs --apply > >(tee "$reports/current.log") 2>&1 &
worker_pid=$!
trap 'kill -TERM "$worker_pid" 2>/dev/null || true' EXIT HUP INT TERM
wait "$worker_pid"
trap - EXIT HUP INT TERM
