@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 goto use_launcher

python server.py
goto finish

:use_launcher
py server.py

:finish
if errorlevel 1 (
    echo.
    echo The Booklyst viewer stopped with an error.
    pause
)
