#!/usr/bin/env bash
# Fetch the contributor's front end (github.com/thirumald/IntelliTwin, branch main) at the commit pinned in
# frontend.lock into ./frontend. The server serves it and patches two things at serve time (config.js and
# js/tomtom.js), so the files themselves stay exactly as published.
# Usage: tools/fetch_frontend.sh [commit]     (default: the commit in frontend.lock)
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${FRONTEND_REPO:-https://github.com/thirumald/IntelliTwin.git}"
SHA="${1:-$(tr -d '[:space:]' < frontend.lock)}"
if [ -f frontend/.commit ] && [ "$(cat frontend/.commit)" = "$SHA" ]; then echo "frontend already at $SHA"; exit 0; fi
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
git clone --quiet --filter=blob:none --no-checkout "$REPO" "$tmp/r"
git -C "$tmp/r" checkout --quiet "$SHA"
rm -rf frontend && mkdir frontend
for p in index.html config.js css js vendor assets data; do cp -R "$tmp/r/$p" "frontend/$p"; done
echo "$SHA" > frontend/.commit
echo "frontend ready at $SHA ($(du -sh frontend | cut -f1))"
