@echo off
REM ===========================================================================
REM  Azkar TV Display - push an update and rebuild (Windows)
REM  Usage:  scripts\github_update.bat "your commit message"
REM ===========================================================================
setlocal
cd /d "%~dp0.."
set "MSG=%~1"
if "%MSG%"=="" set "MSG=Update Azkar TV Display"

where git >nul 2>&1 || (echo ERROR: git is not installed. & pause & exit /b 1)
git add -A
git commit -q -m "%MSG%" || (echo ^>^> No changes to push. & pause & exit /b 0)
git push
echo ^>^> Pushed: %MSG%

where gh >nul 2>&1 && (
  timeout /t 8 >nul
  gh run watch --exit-status
  for /f "delims=" %%i in ('gh run list --limit 1 --json databaseId --jq ".[0].databaseId"') do set "RUN_ID=%%i"
  gh run download %RUN_ID% -n azkar-tv-display-debug -D ".\artifacts"
)
echo.
pause
