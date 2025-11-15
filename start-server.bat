@echo off
title VMSP PTZ Server
cd /d "%~dp0"
echo Starting VMSP PTZ Server...
echo.
npm run build && npm start
pause
