# GitHub scripts

Automates pushing Azkar TV Display to GitHub and building the APK via Actions.
Uses the GitHub CLI (`gh`) for the full flow; falls back to plain git if `gh`
is not installed.

## Install GitHub CLI (one time)
- Windows: `winget install GitHub.cli`
- macOS:   `brew install gh`
- Linux:   https://github.com/cli/cli#installation

## First time
- Windows: double-click `scripts\github_setup.bat`
- macOS / Linux: `bash scripts/github_setup.sh`

This creates the repo (private by default), pushes, waits for the build, and
downloads the debug APK into `./artifacts/`. Edit `REPO_NAME` / `VISIBILITY`
and the git name/email at the top of the script first if needed.

## Every update afterwards
- Windows: `scripts\github_update.bat "what I changed"`
- macOS / Linux: `bash scripts/github_update.sh "what I changed"`

## Release signing (optional)
Keep your `.jks` out of git. Register it as repo secrets once:
`bash scripts/set_release_secrets.sh path/to/azkar-release.jks`

## Manual download (anytime)
`gh run list` then `gh run download <run-id> -n azkar-tv-display-debug -D ./artifacts`
