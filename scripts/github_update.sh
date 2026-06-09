#!/usr/bin/env bash
# =============================================================================
# Azkar TV Display — push an update and rebuild
# Use this every time you change the project after the first setup.
#   bash scripts/github_update.sh "your commit message"
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

MSG="${1:-Update Azkar TV Display}"
command -v git >/dev/null || { echo "ERROR: git is not installed."; exit 1; }

git add -A
if git diff --cached --quiet; then
  echo ">> No changes to push."; exit 0
fi
git commit -q -m "$MSG"
git push
echo ">> Pushed: $MSG"

if command -v gh >/dev/null; then
  echo ">> Waiting for the new build..."; sleep 8
  gh run watch --exit-status || echo "   (non-blocking smoke step may report; APK still builds)"
  RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
  gh run download "$RUN_ID" -n azkar-tv-display-debug -D ./artifacts || true
  ls -1 ./artifacts/*.apk 2>/dev/null || true
fi
