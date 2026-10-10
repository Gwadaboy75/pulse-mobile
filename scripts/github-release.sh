#!/usr/bin/env bash
# Publishes APKs to a GitHub release (docs/releases.md).
# usage: scripts/github-release.sh <tag> <apk>...
# Creates the release <tag> on HEAD (or reuses it if it exists) and uploads each APK as an asset, named as the file is.
# The token is $GITHUB_TOKEN, else the github.com password git's credential helper holds.
set -euo pipefail
REPO=adityaongit/pulse-mobile
tag=${1:?usage: scripts/github-release.sh <tag> <apk>...}
shift
[ $# -gt 0 ] || { echo "no APKs given" >&2; exit 1; }
TOKEN=${GITHUB_TOKEN:-$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')}
[ -n "$TOKEN" ] || { echo "No token: set GITHUB_TOKEN." >&2; exit 1; }
api() { curl -fsS -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

id=$(api "https://api.github.com/repos/$REPO/releases/tags/$tag" 2>/dev/null | jq -r .id || true)
if [ -z "$id" ] || [ "$id" = null ]; then
  body=$(jq -n --arg t "$tag" --arg c "$(git rev-parse HEAD)" '{tag_name: $t, target_commitish: $c, name: $t, generate_release_notes: true}')
  id=$(api -X POST "https://api.github.com/repos/$REPO/releases" -d "$body" | jq -r .id) || {
    echo "Could not create the release. The token needs write access to $REPO: a classic token with the repo scope, or a fine-grained one with Contents read and write. Pass it as GITHUB_TOKEN." >&2
    exit 1
  }
fi
for apk in "$@"; do
  api -X POST -H "Content-Type: application/vnd.android.package-archive" --data-binary @"$apk" \
    "https://uploads.github.com/repos/$REPO/releases/$id/assets?name=$(basename "$apk")" | jq -r .browser_download_url
done
