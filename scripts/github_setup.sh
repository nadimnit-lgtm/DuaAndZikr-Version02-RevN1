#!/usr/bin/env bash
# =============================================================================
# Azkar TV Display — one-time GitHub setup + build + APK download
# Creates the repo, pushes, waits for GitHub Actions, downloads the debug APK.
# Run this ONCE from the project root:  bash scripts/github_setup.sh
# =============================================================================
set -euo pipefail

REPO_NAME="AzkarTvDisplay"
VISIBILITY="private"          # change to "public" if you prefer
ARTIFACT="azkar-tv-display-debug"

cd "$(dirname "$0")/.."       # always operate from the project root
echo ">> Project root: $(pwd)"

# 1. Pre-flight checks ---------------------------------------------------------
command -v git >/dev/null || { echo "ERROR: git is not installed."; exit 1; }
HAVE_GH=1; command -v gh >/dev/null || HAVE_GH=0

# 2. Git identity (set once if missing) ---------------------------------------
git config user.name  >/dev/null 2>&1 || git config user.name  "Ahmed Nadim"
git config user.email >/dev/null 2>&1 || git config user.email "you@example.com"
echo ">> Committer: $(git config user.name) <$(git config user.email)>"
echo "   (edit the script if these are wrong)"

# 3. Initialise + first commit ------------------------------------------------
[ -d .git ] || { git init -q; echo ">> git init done"; }
git add -A
if git diff --cached --quiet; then
  echo ">> Nothing new to commit."
else
  git commit -q -m "Azkar TV Display — Version 02"
  echo ">> Committed."
fi
git branch -M main

# 4. Create remote + push -----------------------------------------------------
if [ "$HAVE_GH" -eq 1 ]; then
  gh auth status >/dev/null 2>&1 || { echo ">> Logging in to GitHub..."; gh auth login; }
  if git remote get-url origin >/dev/null 2>&1; then
    echo ">> Remote 'origin' already set: $(git remote get-url origin)"
    git push -u origin main
  else
    echo ">> Creating $VISIBILITY repo '$REPO_NAME' and pushing..."
    gh repo create "$REPO_NAME" --"$VISIBILITY" --source=. --remote=origin --push
  fi

  # 5. Watch the build and grab the APK ---------------------------------------
  echo ">> Waiting for GitHub Actions to start..."; sleep 8
  gh run watch --exit-status || echo "   (build finished with a non-zero step; smoke test is non-blocking)"
  echo ">> Downloading APK artifact -> ./artifacts/"
  RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
  gh run download "$RUN_ID" -n "$ARTIFACT" -D ./artifacts || \
    echo "   Could not auto-download. Get it from the Actions tab > latest run > Artifacts."
  echo ">> Done. APK(s):"; ls -1 ./artifacts/*.apk 2>/dev/null || true
else
  echo ""
  echo ">> GitHub CLI (gh) not found. Install it for the full automated flow:"
  echo "     https://cli.github.com/   (or: winget install GitHub.cli)"
  echo ""
  echo ">> Manual fallback — create an EMPTY repo on github.com, then run:"
  echo "     git remote add origin https://github.com/<you>/$REPO_NAME.git"
  echo "     git push -u origin main"
fi
