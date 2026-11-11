@echo off
REM ============================================================
REM  ANES AI Backend - Katilimsiz Kurulum
REM  - Python yoksa indirir ve PATH'e ekler
REM  - Sanal ortam .venv olusturur
REM  - Bagimliliklari kurar (NVIDIA varsa CUDA llama-cpp-python)
REM  - Tum adimlar KONSOLA ANLIK yazdirilir ve install.log'a kaydedilir
REM  Etiket-tabanli akis; parantezli blok yok, soru sormaz.
REM  NOT: Bu backend yalnizca Python kullanir; Node.js gerekmez.
REM ============================================================
setlocal enableextensions
title ANES AI Backend - Kurulum
cd /d "%~dp0"

set "PY_EXE="
set "HAS_NVIDIA="
set "LCP_OK="
set "LOG=install.log"
set "DL=%TEMP%\anes_dl"
if not exist "%DL%" mkdir "%DL%" >nul 2>&1

REM Her kurulumda taze log dosyasi
del "%LOG%" >nul 2>&1

echo.
echo ============================================================
echo   ANES AI Backend - Otomatik Kurulum
echo   %DATE% %TIME%
echo ============================================================
echo.

where powershell >nul 2>&1
if errorlevel 1 goto :no_powershell

REM ---------- 1) PYTHON ----------
echo [1/6] Python kontrol ediliyor...
call :find_python
if defined PY_EXE goto :python_ok

echo    [i] Python bulunamadi. Indiriliyor...
set "PY_URL=https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
set "PY_INST=%DL%\python-3.11.9-amd64.exe"
if not exist "%PY_INST%" call :download "%PY_URL%" "%PY_INST%" "Python 3.11.9"
if not exist "%PY_INST%" goto :no_python
echo    [i] Python sessiz kuruluyor - birkac dakika surebilir...
"%PY_INST%" /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_test=0 Include_launcher=1
call :refresh_path
call :find_python
if not defined PY_EXE goto :no_python
echo    [OK] Python kuruldu: %PY_EXE%

:python_ok
if not defined PY_EXE echo    [OK] Python: %PY_EXE%
goto :venv

:no_python
echo    [!] Python bulunamadi/kurulamadi. Kurulum durduruluyor.
goto :done

:venv
REM ---------- 2) SANAL ORTAM ----------
echo.
echo [2/6] Sanal ortam .venv hazirlaniyor...
if exist ".venv\Scripts\python.exe" goto :venv_ok
echo    [i] .venv olusturuluyor...
"%PY_EXE%" -m venv .venv
if not exist ".venv\Scripts\python.exe" goto :venv_warn
echo    [OK] .venv olusturuldu.
goto :venv_set

:venv_warn
echo    [!] venv olusturulamadi - log: %LOG%
goto :venv_set

:venv_ok
echo    [OK] .venv zaten mevcut.

:venv_set
set "VENV_PY=%~dp0.venv\Scripts\python.exe"
if not exist "%VENV_PY%" set "VENV_PY=%PY_EXE%"
echo    [i] pip guncelleniyor...
call :run_tee "%VENV_PY%" -m pip install --upgrade pip setuptools wheel

REM ---------- 3) TEMEL BAGIMLILIKLAR ----------
echo.
echo [3/6] Temel bagimliliklar kuruluyor: fastapi, uvicorn, pydantic, psutil
call :run_tee "%VENV_PY%" -m pip install "fastapi>=0.115.0" "uvicorn[standard]>=0.30.0" "pydantic>=2.7.0" "psutil>=5.9.0"
"%VENV_PY%" -c "import fastapi,uvicorn,pydantic,psutil" >nul 2>&1
if errorlevel 1 goto :base_warn
echo    [OK] Temel bagimliliklar kuruldu.
goto :gpu_check

:base_warn
echo    [!] Temel bagimliliklarda hata - log: %LOG%

:gpu_check
REM ---------- 4) GPU ----------
echo.
echo [4/6] GPU - NVIDIA kontrol ediliyor...
where nvidia-smi >nul 2>&1
if errorlevel 1 goto :no_nvidia
nvidia-smi >nul 2>&1
if errorlevel 1 goto :no_nvidia
set "HAS_NVIDIA=1"
echo    [OK] NVIDIA GPU tespit edildi.
goto :lcp

:no_nvidia
echo    [i] NVIDIA bulunamadi; CPU surumu kurulacak.

:lcp
REM ---------- 5) LLAMA-CPP-PYTHON ----------
echo.
echo [5/6] llama-cpp-python kuruluyor - bu adim uzun surebilir...
if not defined HAS_NVIDIA goto :lcp_cpu

echo    [i] CUDA surumu deneniyor - cu122
call :run_tee "%VENV_PY%" -m pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu122 --only-binary=:all:
call :lcp_check_import
if defined LCP_OK goto :lcp_check

echo    [i] cu122 olmadi, cu121 deneniyor...
call :run_tee "%VENV_PY%" -m pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121 --only-binary=:all:
call :lcp_check_import
if defined LCP_OK goto :lcp_check

:lcp_cpu
echo    [i] Onceden derlenmis CPU surumu (hazir wheel) deneniyor...
call :run_tee "%VENV_PY%" -m pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu --only-binary=:all:
call :lcp_check_import
if defined LCP_OK goto :lcp_check

echo    [i] Hazir wheel olmadi, PyPI binary deneniyor...
call :run_tee "%VENV_PY%" -m pip install llama-cpp-python --only-binary=:all:
call :lcp_check_import
if defined LCP_OK goto :lcp_check

echo    [i] Kaynaktan derleme deneniyor - build araclari gerekebilir...
call :run_tee "%VENV_PY%" -m pip install llama-cpp-python
call :lcp_check_import

:lcp_check
if defined LCP_OK goto :lcp_ok
echo    [!] llama-cpp-python kurulamadi - log: %LOG%
echo        GPU icin CUDA Toolkit + Visual Studio Build Tools gerekebilir.
goto :verify

:lcp_ok
echo    [OK] llama-cpp-python kuruldu.

:verify
REM ---------- 6) DOGRULAMA ----------
echo.
echo [6/6] Dogrulama yapiliyor...
"%VENV_PY%" -c "import fastapi,uvicorn,pydantic,psutil;print('    [OK] cekirdek paketler hazir')"
"%VENV_PY%" -c "import llama_cpp;print('    [OK] llama_cpp hazir')"
if errorlevel 1 echo    [!] llama_cpp import edilemedi.

echo.
if exist "Models" goto :models_list
echo    [i] Models klasoru yok. Sunucu /v1/models/download ile model indirebilir.
goto :finish

:models_list
echo    [i] Models klasoru mevcut:
dir /b "Models\*.gguf" 2>nul

:finish
echo.
echo ============================================================
echo   KURULUM TAMAMLANDI
echo   Baslatmak icin: start.bat
echo   Adres: http://127.0.0.1:8493
echo   Log: %LOG%
echo ============================================================
echo.
if /i "%~1"=="--no-pause" goto :done
echo Cikmak icin bir tusa basin...
pause >nul
goto :done

:no_powershell
echo [!] PowerShell bulunamadi. Kurulum devam edemez.

:done
endlocal
exit /b 0

REM ============================================================
REM  YARDIMCI RUTINLER
REM ============================================================

:run_tee
REM Kullanim: call :run_tee <komut...>
REM Komutu calistirir; cikti HEM konsola (anlik) HEM %LOG% dosyasina yazilir.
%* 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%LOG%' -Append"
exit /b 0

:lcp_check_import
set "LCP_OK="
"%VENV_PY%" -c "import llama_cpp" >nul 2>&1
if not errorlevel 1 set "LCP_OK=1"
exit /b 0

:find_python
set "PY_EXE="
for /f "delims=" %%q in ('where python.exe 2^>nul') do if not defined PY_EXE set "PY_EXE=%%q"
if defined PY_EXE exit /b 0
for /f "delims=" %%q in ('where python 2^>nul') do if not defined PY_EXE set "PY_EXE=%%q"
if defined PY_EXE exit /b 0
for /f "delims=" %%v in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do set "PY_EXE=%%v"
if defined PY_EXE exit /b 0
for %%d in (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    "%ProgramFiles%\Python311\python.exe"
    "C:\Python311\python.exe"
) do if not defined PY_EXE if exist %%d set "PY_EXE=%%~d"
exit /b 0

:refresh_path
set "UPATH="
set "MPATH="
for /f "usebackq tokens=2,*" %%a in (`reg query "HKCU\Environment" /v Path 2^>nul ^| findstr /i "Path"`) do set "UPATH=%%b"
for /f "usebackq tokens=2,*" %%a in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| findstr /i "Path"`) do set "MPATH=%%b"
set "PATH=%MPATH%;%UPATH%;%PATH%"
set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts"
exit /b 0

:download
set "DL_URL=%~1"
set "DL_DEST=%~2"
set "DL_LABEL=%~3"
echo    [i] Indiriliyor: %DL_LABEL%
echo        %DL_URL%
curl -L --fail --retry 2 -# -o "%DL_DEST%" "%DL_URL%"
if exist "%DL_DEST%" echo        [OK] Indirildi.
exit /b 0
