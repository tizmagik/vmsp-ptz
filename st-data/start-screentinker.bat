@echo off
title ScreenTinker
set "SCREENTINKER_DIR=%~dp0..\..\screentinker\server"

if not exist "%SCREENTINKER_DIR%\package.json" (
	echo Could not find ScreenTinker server at:
	echo %SCREENTINKER_DIR%
	pause
	exit /b 1
)

cd /d "%SCREENTINKER_DIR%"
echo Starting ScreenTinker server...
call npm start
