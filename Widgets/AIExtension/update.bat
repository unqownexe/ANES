@echo off
setlocal
cd /d "%~dp0"
title ANES AIExtension - Guncelleme
chcp 65001 >nul

echo ==^> GitHub'dan guncelleme denetleniyor...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
echo.
echo Chrome'da chrome://extensions sayfasini acin ve eklentinin "Yenile"
echo dugmesine basin (ANES acikken bu adim otomatik yapilir).
echo.
pause
