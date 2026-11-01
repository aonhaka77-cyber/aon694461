@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto install_node
goto check_node_version

:install_node
where winget >nul 2>nul
if errorlevel 1 (
    echo Node.js 22.13 or newer is required, and winget was not found.
    echo Install the LTS version from https://nodejs.org/ and click run.bat again.
    pause
    exit /b 1
)

echo Node.js is missing. Starting the official Node.js LTS installation with winget...
winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo Node.js installation did not complete. Install Node.js LTS and click run.bat again.
    pause
    exit /b 1
)

set "PATH=%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was installed, but this window cannot find it yet.
    echo Close this window and click run.bat again.
    pause
    exit /b 1
)

:check_node_version
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)"
if errorlevel 1 (
    echo Node.js 22.13 or newer is required for the built-in SQLite support.
    echo Install the current Node.js LTS version, then click run.bat again.
    pause
    exit /b 1
)

if not exist ".env" goto create_env
goto check_site

:create_env
echo Creating private .env settings for the first run...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $editorBytes = New-Object byte[] 24; $sessionBytes = New-Object byte[] 32; $rng.GetBytes($editorBytes); $rng.GetBytes($sessionBytes); $editor = [BitConverter]::ToString($editorBytes).Replace('-', ''); $session = [BitConverter]::ToString($sessionBytes).Replace('-', ''); @('PORT=3000', ('SITE_EDIT_KEY=' + $editor), ('SESSION_SECRET=' + $session), 'NODE_ENV=development') | Set-Content -Encoding Ascii '.env'; Write-Host ''; Write-Host 'Your one-time editor key is:' -ForegroundColor Yellow; Write-Host $editor -ForegroundColor Cyan; Write-Host 'Save this key. You can change SITE_EDIT_KEY later in .env.'"
if errorlevel 1 (
    echo Could not create .env.
    pause
    exit /b 1
)

:check_site
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/editor/session' -TimeoutSec 2; if ($null -ne $r.authenticated) { Start-Process 'http://localhost:3000'; exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 (
    echo Aon is already running. Opening the site...
    exit /b 0
)

if not exist "node_modules\.aon-sqlite-ready" goto run_npm_install
if not exist "node_modules\express" goto run_npm_install
goto start_server

:run_npm_install
    echo Installing required packages. This can take a few minutes on the first run...
    call npm install
    if errorlevel 1 (
        echo Package installation failed. Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo ready>"node_modules\.aon-sqlite-ready"

:start_server
echo Starting Aon...
start "Aon server" /D "%~dp0" cmd /k "npm start"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ready = $false; for ($i = 0; $i -lt 45; $i++) { try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/editor/session' -TimeoutSec 2; if ($null -ne $r.authenticated) { $ready = $true; break } } catch {}; Start-Sleep -Seconds 1 }; if ($ready) { Start-Process 'http://localhost:3000'; exit 0 }; exit 1"
if errorlevel 1 (
    echo Aon did not start. Check the separate Aon server window for the error.
    pause
    exit /b 1
)
echo Aon is open at http://localhost:3000
exit /b 0
