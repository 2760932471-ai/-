@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js 22 or newer, then run this file again.
 pause
 exit /b 1
)
echo Open http://127.0.0.1:3000 after the server starts.
if exist .env (
 node --env-file=.env src/server.js
) else (
 node src/server.js
)
pause
