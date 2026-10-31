@echo off
setlocal
cd /d "%~dp0"
echo Open http://127.0.0.1:8000/ in your browser.
echo Press Ctrl+C in this window to stop the local preview server.
py -3 -m http.server 8000 --bind 127.0.0.1
if errorlevel 1 pause
