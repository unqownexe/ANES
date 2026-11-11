@echo off
REM ============================================================
REM  ANES AI Backend - Baslatici
REM  Port: 8493
REM ============================================================
setlocal enableextensions
title ANES AI Backend - Port 8493
cd /d "%~dp0"

REM Sanal ortam varsa kullan
if exist ".venv\Scripts\python.exe" (
    set "PY=.venv\Scripts\python.exe"
) else (
    set "PY=python"
)

echo [i] Python: %PY%
"%PY%" --version >nul 2>&1
if errorlevel 1 (
    echo [!] Python bulunamadi. Lutfen once install.bat calistirin.
    pause
    exit /b 1
)

REM Bagimlilik kontrolu
"%PY%" -c "import fastapi, uvicorn, pydantic" >nul 2>&1
if errorlevel 1 (
    echo [!] Bagimliliklar eksik. install.bat calistiriliyor...
    call install.bat
)

echo.
echo ============================================================
echo   ANES AI Backend baslatiliyor...
echo   Adres : http://127.0.0.1:8493
echo   Docs  : http://127.0.0.1:8493/docs
echo ============================================================
echo.

"%PY%" run.py %*
endlocal
