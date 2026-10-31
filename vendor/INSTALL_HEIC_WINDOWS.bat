@echo off
cd /d "%~dp0"
py -3 download_heif.py
if errorlevel 1 echo Optional decoder was not installed. See the message above.
pause
