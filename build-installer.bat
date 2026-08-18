@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM ============================================================================
REM build-installer.bat -- produces the real Squirrel.Windows installer, the
REM same artifact CI publishes, built through the same electron-builder.yml
REM config. Never publishes, tags, or creates a release: building the
REM installer and shipping it are different actions with different authority.
REM
REM Supports silent/no-prompt operation via /s, --silent, or SILENT=1.
REM
REM CODE SIGNING IS PERMANENTLY PROHIBITED for this project. This script
REM produces an UNSIGNED installer on purpose and says so in its own output,
REM rather than leaving the user to discover the unknown-publisher warning
REM for themselves.
REM ============================================================================

set "SILENT_MODE=0"
if /I "%~1"=="/s" set "SILENT_MODE=1"
if /I "%~1"=="--silent" set "SILENT_MODE=1"
if "%SILENT%"=="1" set "SILENT_MODE=1"

set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"

echo [build-installer] Meadowmark installer build
echo [build-installer] Repository root: %REPO_ROOT%
echo.

echo [build-installer] Step 1/3: dependencies
call "%REPO_ROOT%\download-dependencies.bat" %*
if not %ERRORLEVEL%==0 (
    echo [build-installer] ERROR: dependency bootstrap failed. See output above.
    exit /b 1
)
echo.

echo [build-installer] Step 2/3: package ^(electron-builder, Squirrel.Windows, UNSIGNED^)
pushd "%REPO_ROOT%"
call npm run dist
set "DIST_RESULT=%ERRORLEVEL%"
popd

if not %DIST_RESULT%==0 (
    echo [build-installer] ERROR: packaging failed ^(exit %DIST_RESULT%^). See output above.
    exit /b %DIST_RESULT%
)
echo.

echo [build-installer] Step 3/3: verify the artifact
set "SETUP_EXE="
for /r "%REPO_ROOT%\release" %%f in (*Setup*.exe) do (
    if not defined SETUP_EXE set "SETUP_EXE=%%f"
)

if not defined SETUP_EXE (
    echo [build-installer] ERROR: no *Setup*.exe found under release\. Packaging
    echo [build-installer]        reported success but produced no installer -- this
    echo [build-installer]        is a release blocker, not something to work around.
    exit /b 1
)

for %%f in ("%SETUP_EXE%") do set "SETUP_SIZE=%%~zf"

REM A plausible-size floor is a cheap second signal that the bundle
REM actually landed, not just that a zero-byte file exists where one was
REM expected. Squirrel setups for an Electron app are realistically tens
REM of megabytes; anything under 1 MB means something is badly wrong.
set /a "SETUP_SIZE_MB=%SETUP_SIZE% / 1048576"
if %SETUP_SIZE% LSS 1048576 (
    echo [build-installer] ERROR: %SETUP_EXE% is only %SETUP_SIZE% bytes -- far too
    echo [build-installer]        small to be a real Electron installer. Treating this
    echo [build-installer]        as a packaging failure rather than reporting success.
    exit /b 1
)

echo [build-installer]   Artifact:  %SETUP_EXE%
echo [build-installer]   Size:      %SETUP_SIZE% bytes ^(~%SETUP_SIZE_MB% MB^)

for /f "skip=1 tokens=* delims=" %%h in ('certutil -hashfile "%SETUP_EXE%" SHA256 ^| findstr /v "hash"') do (
    if not defined SHA256_HASH set "SHA256_HASH=%%h"
)
set "SHA256_HASH=%SHA256_HASH: =%"
echo [build-installer]   SHA-256:   %SHA256_HASH%
echo.

echo [build-installer] ============================================================
echo [build-installer]  THIS INSTALLER IS UNSIGNED.
echo [build-installer]  Code signing is permanently disabled for this project.
echo [build-installer]  Windows will show an "unknown publisher" / SmartScreen
echo [build-installer]  warning when it is run. That is expected -- Meadowmark is
echo [build-installer]  free, with no purchases of any kind, and was never signed.
echo [build-installer] ============================================================
echo.
echo [build-installer] This script does not publish, tag, or create a release.
echo [build-installer] It only builds and verifies the local artifact above.

exit /b 0
