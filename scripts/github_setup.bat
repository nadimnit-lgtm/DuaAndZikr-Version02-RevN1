@echo off
REM ===========================================================================
REM  Azkar TV Display - one-time GitHub setup + build + APK download (Windows)
REM  Double-click, or run from the project root:  scripts\github_setup.bat
REM ===========================================================================
setlocal
set "REPO_NAME=AzkarTvDisplay"
set "VISIBILITY=private"
set "ARTIFACT=azkar-tv-display-debug"

REM move to project root (parent of this script's folder)
cd /d "%~dp0.."
echo. & echo ^>^> Project root: %CD%

where git >nul 2>&1 || (echo ERROR: git is not installed. & pause & exit /b 1)
set "HAVE_GH=1"
where gh >nul 2>&1 || set "HAVE_GH=0"

REM git identity (edit if wrong)
git config user.name  >nul 2>&1 || git config user.name  "Ahmed Nadim"
git config user.email >nul 2>&1 || git config user.email "you@example.com"

if not exist ".git" ( git init -q & echo ^>^> git init done )
git add -A
git commit -q -m "Azkar TV Display - Version 02" || echo ^>^> Nothing new to commit.
git branch -M main

if "%HAVE_GH%"=="1" (
  gh auth status >nul 2>&1 || gh auth login
  git remote get-url origin >nul 2>&1 && (
     git push -u origin main
  ) || (
     echo ^>^> Creating %VISIBILITY% repo "%REPO_NAME%" and pushing...
     gh repo create "%REPO_NAME%" --%VISIBILITY% --source=. --remote=origin --push
  )
  echo ^>^> Waiting for GitHub Actions...
  timeout /t 8 >nul
  gh run watch --exit-status
  for /f "delims=" %%i in ('gh run list --limit 1 --json databaseId --jq ".[0].databaseId"') do set "RUN_ID=%%i"
  echo ^>^> Downloading APK to .\artifacts\
  gh run download %RUN_ID% -n "%ARTIFACT%" -D ".\artifacts"
  echo ^>^> Done. Check the .\artifacts folder.
) else (
  echo.
  echo ^>^> GitHub CLI not found. Install:  winget install GitHub.cli
  echo ^>^> Or create an EMPTY repo on github.com, then run:
  echo      git remote add origin https://github.com/^<you^>/%REPO_NAME%.git
  echo      git push -u origin main
)
echo.
pause
