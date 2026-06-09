#!/usr/bin/env bash
# =============================================================================
# Optional: register signing secrets for the release workflow (needs gh).
# Run from project root AFTER the repo exists. Keep your .jks OUT of git.
#   bash scripts/set_release_secrets.sh path/to/azkar-release.jks
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
command -v gh >/dev/null || { echo "ERROR: install GitHub CLI (gh) first."; exit 1; }

JKS="${1:?Usage: set_release_secrets.sh <keystore.jks>}"
[ -f "$JKS" ] || { echo "ERROR: keystore not found: $JKS"; exit 1; }

read -rp "Key alias: " ALIAS
read -rsp "Keystore password: " STOREPW; echo
read -rsp "Key password: " KEYPW; echo

gh secret set KEYSTORE_FILE     < "$JKS"               # uploads the file bytes
gh secret set KEY_ALIAS        --body "$ALIAS"
gh secret set KEYSTORE_PASSWORD --body "$STOREPW"
gh secret set KEY_PASSWORD     --body "$KEYPW"
echo ">> Secrets set. The release workflow will sign automatically."
