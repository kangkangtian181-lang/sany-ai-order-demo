@echo off
cd /d "%~dp0"
echo 正在启动对画课时打卡…
py -3 server.py 2>nul
if errorlevel 1 python server.py
pause
