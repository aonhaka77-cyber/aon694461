@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
    echo Docker Desktop is required to run Wiki.js and PostgreSQL.
    echo Install Docker Desktop for Windows, start it, then click run.bat again.
    echo https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
    echo Docker Desktop is installed but is not running. Start it and click run.bat again.
    pause
    exit /b 1
)

if not exist ".env.wiki" goto create_env
goto start_wiki

:create_env
echo Creating a private database password in .env.wiki...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $bytes = New-Object byte[] 48; $rng.GetBytes($bytes); $password = [Convert]::ToBase64String($bytes).Replace('+', 'A').Replace('/', 'B').TrimEnd('='); @(('WIKI_DB_PASSWORD=' + $password), 'WIKI_LOCAL_PORT=3030', 'CLOUDFLARE_TUNNEL_TOKEN=') | Set-Content -Encoding Ascii '.env.wiki'"
if errorlevel 1 (
    echo Could not create .env.wiki.
    pause
    exit /b 1
)

:start_wiki
echo Starting Wiki.js and PostgreSQL. The first run downloads container images...
docker compose --env-file ".env.wiki" up -d
if errorlevel 1 (
    echo Wiki.js did not start. Run "docker compose --env-file .env.wiki logs" to inspect the error.
    pause
    exit /b 1
)

start "" "http://localhost:3030"
echo Configure the initial Wiki.js administrator account in the browser.
echo Local site: http://localhost:3030
exit /b 0
