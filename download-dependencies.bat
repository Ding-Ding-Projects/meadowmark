@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM Exact, unattended dependency bootstrap for Meadowmark.
REM The pinned version, canonical URL, and SHA-256 live in release-gate.json.
REM No signing material or credentials are requested or installed.

set "SILENT_MODE=0"
if /I "%~1"=="/s" set "SILENT_MODE=1"
if /I "%~1"=="--silent" set "SILENT_MODE=1"
if "%SILENT%"=="1" set "SILENT_MODE=1"

set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"
set "NODE_RESULT=%TEMP%\meadowmark-node-%RANDOM%-%RANDOM%-%RANDOM%.txt"

echo [download-dependencies] Repository root: %REPO_ROOT%
echo [download-dependencies] Silent mode: %SILENT_MODE%
echo [download-dependencies] Phase 1/2: exact Node bootstrap

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%\tools\release\bootstrap-node.ps1" -ResultPath "%NODE_RESULT%"
set "BOOTSTRAP_RESULT=%ERRORLEVEL%"
if not "%BOOTSTRAP_RESULT%"=="0" (
    if exist "%NODE_RESULT%" del /q "%NODE_RESULT%" >nul 2>nul
    echo [download-dependencies] ERROR: pinned Node bootstrap failed ^(exit %BOOTSTRAP_RESULT%^).
    exit /b %BOOTSTRAP_RESULT%
)

if not exist "%NODE_RESULT%" (
    echo [download-dependencies] ERROR: Node bootstrap returned no verified toolchain path.
    exit /b 1
)
set /p "NODE_DIR="<"%NODE_RESULT%"
del /q "%NODE_RESULT%" >nul 2>nul
if not exist "%NODE_DIR%\node.exe" (
    echo [download-dependencies] ERROR: verified node.exe is missing from %NODE_DIR%.
    exit /b 1
)
if not exist "%NODE_DIR%\npm.cmd" (
    echo [download-dependencies] ERROR: verified npm.cmd is missing from %NODE_DIR%.
    exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
for /f "tokens=*" %%v in ('"%NODE_DIR%\node.exe" --version') do set "NODE_VERSION=%%v"
echo [download-dependencies]   Active Node: !NODE_VERSION! from %NODE_DIR%
echo.

echo [download-dependencies] Phase 2/2: locked npm dependencies
if not exist "%REPO_ROOT%\package-lock.json" (
    echo [download-dependencies] ERROR: package-lock.json is required; an unlocked install is not release reproducible.
    exit /b 1
)
pushd "%REPO_ROOT%"
call "%NODE_DIR%\npm.cmd" ci --no-audit --no-fund
set "NPM_RESULT=%ERRORLEVEL%"
popd
if not "%NPM_RESULT%"=="0" (
    echo [download-dependencies] ERROR: npm ci failed ^(exit %NPM_RESULT%^).
    exit /b %NPM_RESULT%
)

echo.
echo [download-dependencies] Done. Exact Node and locked npm dependencies are present.
endlocal & set "MEADOWMARK_NODE_DIR=%NODE_DIR%" & set "PATH=%PATH%" & exit /b 0
