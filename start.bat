@echo off
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

echo Starting Frontend Server (Node http-server) on http://localhost:8081...
start "Frontend Server" npx http-server . -p 8081 -c-1

echo Starting Backend Server (Node.js)...
node backend/server.js
