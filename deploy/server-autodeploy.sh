#!/usr/bin/env bash
set -Eeuo pipefail

repository="https://github.com/leader2869/ykamina.ru.git"
current_link="/srv/ykamina/current"

remote_sha="$(git ls-remote "$repository" refs/heads/main | awk '{print $1}')"
if [[ ! "$remote_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Could not resolve the current main commit." >&2
  exit 1
fi

current_release="$(readlink -f "$current_link" 2>/dev/null || true)"
current_sha="${current_release##*/}"
if [[ "$current_sha" == "$remote_sha" ]]; then
  echo "Production already runs $remote_sha."
  exit 0
fi

exec /usr/local/bin/deploy-ykamina "$remote_sha"
