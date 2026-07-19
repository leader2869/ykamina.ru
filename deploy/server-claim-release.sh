#!/usr/bin/env bash
set -Eeuo pipefail

commit_sha="${1:-}"
if [[ ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full Git commit SHA is required." >&2
  exit 2
fi

app_root="/srv/ykamina"
releases_dir="$app_root/releases"
current_link="$app_root/current"
claim_dir="$releases_dir/$commit_sha"
previous_release="$(readlink -f "$current_link" 2>/dev/null || true)"
superseded_dir="$app_root/.superseded-claim-$commit_sha-$$"

install -d -m 755 "$app_root" "$releases_dir"

if [[ "$previous_release" == "$claim_dir" ]]; then
  echo "Release $commit_sha is already claimed."
  exit 0
fi

# The legacy timer runs as the same deploy user. Stop a build for this exact SHA
# before it can continue writing into the artifact release directory.
pkill -TERM -u "$(id -u)" -f "/usr/local/bin/deploy-ykamina $commit_sha" 2>/dev/null || true
sleep 1

if [[ -e "$claim_dir" ]]; then
  mv "$claim_dir" "$superseded_dir"
fi

install -d -m 755 "$claim_dir"
if [[ -n "$previous_release" && -d "$previous_release/frontend" ]]; then
  ln -s "$previous_release/frontend" "$claim_dir/frontend"
  printf '%s\n' "$previous_release" > "$claim_dir/.artifact-previous-release"
fi

ln -sfn "$claim_dir" "$app_root/current.next"
mv -Tf "$app_root/current.next" "$current_link"
rm -rf -- "$superseded_dir" || true

echo "Claimed release $commit_sha for the verified artifact deployment."
