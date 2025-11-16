@echo off
title VMSP PTZ Server
cd /d "%~dp0"
echo Building project...
call npm run build
echo.
echo Starting server with auto-restart...
call npm run start:watch
