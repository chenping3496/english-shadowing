@echo off
title English Shadowing - One-click Launcher

cd /d "%~dp0"

echo ==================================================
echo    English Shadowing - One-click Launcher
echo ==================================================
echo.

echo [1/2] Starting dev server...
start "english-shadowing-server" cmd /k "npm run dev"

echo       Waiting 12s for the server to come up...
timeout /t 12 /nobreak >nul

echo [2/2] Starting HTTPS tunnel...
start "english-shadowing-tunnel" cmd /k "%~dp0data\tools\cloudflared.exe tunnel --url http://localhost:3000"

echo.
echo Done. Two new windows are now open:
echo   - "english-shadowing-server" : your dev server
echo   - "english-shadowing-tunnel" : Cloudflare tunnel (shows the URL)
echo.
echo Steps:
echo   1. Wait until the server window prints "Ready".
echo   2. In the tunnel window, copy the URL:  https://xxxx.trycloudflare.com
echo   3. Open that URL on your phone and log in (mic/camera work over HTTPS).
echo.
echo NOTE: The URL changes every time you run this script.
echo       To stop everything: close both windows.
echo.
pause
