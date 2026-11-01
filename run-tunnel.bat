@echo off
setlocal
cd /d "%~dp0"

if not exist ".env.wiki" (
    echo Wiki.js is not configured yet. Run run.bat first.
    pause
    exit /b 1
)

findstr /R /C:"^CLOUDFLARE_TUNNEL_TOKEN=." ".env.wiki" >nul
if errorlevel 1 (
    echo Add the Cloudflare Tunnel token to .env.wiki before starting the tunnel.
    pause
    exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
    echo Docker Desktop must be installed and running.
    pause
    exit /b 1
)

docker compose --env-file ".env.wiki" --profile tunnel up -d
if errorlevel 1 (
    echo The Cloudflare Tunnel did not start. Check the token and Docker logs.
    pause
    exit /b 1
)

echo Cloudflare Tunnel is running. Configure its public hostname in Cloudflare Zero Trust.
exit /b 0
