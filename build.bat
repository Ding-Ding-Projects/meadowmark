@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM ============================================================================
REM build.bat -- one-click build for Meadowmark. Gets a fresh checkout with
REM nothing installed to a built, runnable program.
REM
REM Supports silent/no-prompt operation via /s, --silent, or SILENT=1. In
REM silent mode this never launches the app and never waits on input.
REM ============================================================================

set "SILENT_MODE=0"
if /I "%~1"=="/s" set "SILENT_MODE=1"
if /I "%~1"=="--silent" set "SILENT_MODE=1"
if "%SILENT%"=="1" set "SILENT_MODE=1"

set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"

echo [build] Meadowmark build
echo [build] Repository root: %REPO_ROOT%
echo.

echo [build] Step 1/2: dependencies
call "%REPO_ROOT%\download-dependencies.bat" %*
if not %ERRORLEVEL%==0 (
    echo [build] ERROR: dependency bootstrap failed. See output above.
    exit /b 1
)
echo.

echo [build] Step 2/2: workspace build
pushd "%REPO_ROOT%"
call npm run build
set "BUILD_RESULT=%ERRORLEVEL%"
popd

if not %BUILD_RESULT%==0 (
    echo [build] ERROR: build failed ^(exit %BUILD_RESULT%^). Name of the exact failing
    echo [build]        workspace is above.
    exit /b %BUILD_RESULT%
)

echo.
echo [build] Build complete. Meadowmark is unsigned software with no purchases
echo [build] of any kind; running it from an unpackaged build never shows a
echo [build] publisher warning, but a packaged Setup.exe will ^(see
echo [build] build-installer.bat^) -- that warning is expected, not a defect.
echo.

if "%SILENT_MODE%"=="1" (
    echo [build] Silent mode: skipping the run prompt.
    exit /b 0
)

REM The prompt is the LAST thing this script does, never the first, so a
REM build that failed never gets as far as offering to launch nothing.
set /p "RUN_NOW=Run Meadowmark now? [y/N] "
if /I "%RUN_NOW%"=="y" (
    pushd "%REPO_ROOT%"
    call npm run start
    popd
)

exit /b 0
