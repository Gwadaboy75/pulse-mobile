#!/usr/bin/env bash
# Copies pulse's pure code into this repo byte for byte, then runs the checks. Never edit the copies here.
# Usage: scripts/sync-core.sh [path to a pulse checkout, default ../pulse]
set -euo pipefail

# The src/lib files the app uses, plus every src/lib file they import. Each one's .test.ts comes along when it exists.
LIB=(format url bands reasons behaviors dashboard extraMetrics)

pulse="$(cd "${1:-../pulse}" && pwd)"
cd "$(dirname "$0")/.."
[ -d "$pulse/src/core" ] || { echo "no src/core in $pulse" >&2; exit 1; }

rm -rf src/core && cp -R "$pulse/src/core" src/core
mkdir -p src/lib
for name in "${LIB[@]}"; do
  for f in "src/lib/$name.ts" "src/lib/$name.test.ts"; do
    if [ -e "$pulse/$f" ]; then cp "$pulse/$f" "$f"; else rm -f "$f"; fi
  done
done

git status --short src/core src/lib
pnpm typecheck && pnpm test
