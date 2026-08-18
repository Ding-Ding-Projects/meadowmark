@echo off
setlocal EnableExtensions
REM Canonical unsigned Squirrel.Windows installer path. This script never
REM publishes, tags, pushes, or signs. It bootstraps exact dependencies, clears
REM generated release output, builds, stages, and verifies publishable files.

set "SILENT_MODE=0"
if /I "%~1"=="/s" set "SILENT_MODE=1"
if /I "%~1"=="--silent" set "SILENT_MODE=1"
if "%SILENT%"=="1" set "SILENT_MODE=1"
set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"

set "CSC_IDENTITY_AUTO_DISCOVERY=false"
set "USE_SYSTEM_SIGNCODE=false"
set "CSC_LINK="
set "WIN_CSC_LINK="
set "CSC_NAME="
set "WIN_CSC_NAME="
set "CSC_KEY_PASSWORD="
set "WIN_CSC_KEY_PASSWORD="

echo [build-installer] Meadowmark unsigned Squirrel.Windows release build
call "%REPO_ROOT%\download-dependencies.bat" %*
if errorlevel 1 (
    echo [build-installer] ERROR: exact dependency bootstrap failed.
    exit /b 1
)

if "%SILENT_MODE%"=="1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%\tools\release\build-installer.ps1" -Silent
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%\tools\release\build-installer.ps1"
)
set "BUILD_RESULT=%ERRORLEVEL%"
if not "%BUILD_RESULT%"=="0" (
    echo [build-installer] ERROR: release build or verification failed ^(exit %BUILD_RESULT%^).
    exit /b %BUILD_RESULT%
)

echo [build-installer] Complete. Artifacts are unsigned by permanent project policy.
echo [build-installer] This script did not publish, tag, push, or create a release.
exit /b 0
