@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM ============================================================================
REM download-dependencies.bat -- obtains every dependency Meadowmark needs to
REM build, from a machine that has nothing installed, with no manual steps.
REM
REM Supports silent/no-prompt operation via /s, --silent, or SILENT=1.
REM Exits non-zero on the first real failure.
REM
REM Phases:
REM   1. Node.js       -- via winget (user-scoped) if `node` is not already
REM                        on PATH. Refreshes THIS process's PATH afterward,
REM                        because winget only updates PATH for FUTURE shells;
REM                        the very next command in this same script would
REM                        otherwise fail to find node, which reads as "the
REM                        install failed" when it in fact succeeded.
REM   2. npm packages   -- `npm ci` if a lockfile is present, else `npm install`.
REM ============================================================================

set "SILENT_MODE=0"
if /I "%~1"=="/s" set "SILENT_MODE=1"
if /I "%~1"=="--silent" set "SILENT_MODE=1"
if "%SILENT%"=="1" set "SILENT_MODE=1"

set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"

echo [download-dependencies] Repository root: %REPO_ROOT%
echo [download-dependencies] Silent mode: %SILENT_MODE%
echo.

REM ---- Phase 1: Node.js ------------------------------------------------------

echo [download-dependencies] Phase 1/2: Node.js
where node >nul 2>nul
if %ERRORLEVEL%==0 (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VERSION=%%v"
    echo [download-dependencies]   Already present: node !NODE_VERSION!
) else (
    echo [download-dependencies]   Not found on PATH. Installing via winget ^(user scope^)...
    where winget >nul 2>nul
    if not %ERRORLEVEL%==0 (
        echo [download-dependencies] ERROR: winget is not available, and node is not installed.
        echo [download-dependencies]        Install Node.js LTS from https://nodejs.org/ and re-run this script.
        exit /b 1
    )

    winget install --id OpenJS.NodeJS.LTS --scope user --accept-source-agreements --accept-package-agreements --silent
    if not %ERRORLEVEL%==0 (
        echo [download-dependencies] ERROR: winget install of Node.js LTS failed ^(exit %ERRORLEVEL%^).
        exit /b 1
    )

    REM winget only writes the registry PATH entry for FUTURE shells. This
    REM process's PATH is stale until we refresh it from the registry
    REM ourselves -- otherwise the very next command below fails to find
    REM node, which looks like the install silently didn't happen.
    echo [download-dependencies]   Refreshing current-process PATH...
    for /f "usebackq tokens=2,*" %%A in (`reg query "HKCU\Environment" /v Path 2^>nul`) do set "USER_PATH=%%B"
    for /f "usebackq tokens=2,*" %%A in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul`) do set "SYSTEM_PATH=%%B"
    if defined USER_PATH if defined SYSTEM_PATH set "PATH=%SYSTEM_PATH%;%USER_PATH%"

    where node >nul 2>nul
    if not %ERRORLEVEL%==0 (
        echo [download-dependencies] ERROR: node still not found on PATH after install and PATH refresh.
        echo [download-dependencies]        Open a new terminal and re-run this script.
        exit /b 1
    )
    for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VERSION=%%v"
    echo [download-dependencies]   Installed: node !NODE_VERSION!
)
echo.

REM ---- Phase 2: npm packages --------------------------------------------------

echo [download-dependencies] Phase 2/2: npm packages
pushd "%REPO_ROOT%"

if exist "package-lock.json" (
    echo [download-dependencies]   Lockfile found. Running: npm ci
    call npm ci
) else (
    echo [download-dependencies]   No lockfile yet. Running: npm install
    call npm install
)
set "NPM_RESULT=%ERRORLEVEL%"
popd

if not %NPM_RESULT%==0 (
    echo [download-dependencies] ERROR: npm dependency install failed ^(exit %NPM_RESULT%^).
    exit /b %NPM_RESULT%
)

echo.
echo [download-dependencies] Done. All dependencies present.
exit /b 0
