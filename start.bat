@echo off
cd /d "%~dp0"
set PORT=8765
echo Artefact Sim  http://127.0.0.1:%PORT%/index.html
echo 이 창을 닫으면 서버가 종료됩니다.
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/index.html"
py -m http.server %PORT%
if errorlevel 1 python -m http.server %PORT%
pause
