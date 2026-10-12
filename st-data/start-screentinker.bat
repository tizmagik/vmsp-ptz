@echo off
setlocal
title ScreenTinker
set "SCREENTINKER_DIR=%~dp0..\..\screentinker"
set "SCREENTINKER_SERVER=%SCREENTINKER_DIR%\server"

if not exist "%SCREENTINKER_SERVER%\package.json" (
	echo Could not find ScreenTinker server at:
	echo %SCREENTINKER_SERVER%
	exit /b 1
)

echo Checking for a ScreenTinker release update...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0upgrade-screentinker.ps1" -AppDir "%SCREENTINKER_DIR%"
if errorlevel 1 (
	echo Update failed. ScreenTinker was not started.
	exit /b 1
)

cd /d "%SCREENTINKER_SERVER%"
echo Starting ScreenTinker server...
call npm start
exit /b %errorlevel%
