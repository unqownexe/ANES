@echo off
REM ============================================================
REM  ANES AI Backend - Node.js CLI Test ISTEMCISI baslatici
REM  Kullanim: start.bat [ek argumanlar]
REM  Ornek   : start.bat --thinking --web
REM  Ornek   : start.bat --port 8493 --once "merhaba"
REM ============================================================
setlocal enableextensions
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [!] Node.js bulunamadi. Lutfen Node.js kurun ^(https://nodejs.org^).
    pause
    exit /b 1
)

node "%~dp0cli.js" %*
endlocal
