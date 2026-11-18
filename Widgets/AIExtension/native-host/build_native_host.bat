@echo off
setlocal
rem ANES Browser Agent — native messaging ana bilgisayarını derler.
set "VSBASE=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
if not exist "%VSBASE%\VC\Auxiliary\Build\vcvars64.bat" (
  echo Visual Studio 2022 Build Tools bulunamadi.
  exit /b 1
)
call "%VSBASE%\VC\Auxiliary\Build\vcvars64.bat" >nul
set "CMAKE=%VSBASE%\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
set "NINJA=%VSBASE%\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe"
set "HERE=%~dp0"
set "HERE=%HERE:~0,-1%"
"%CMAKE%" -S "%HERE%" -B "%HERE%\build" -G Ninja -DCMAKE_MAKE_PROGRAM="%NINJA%" -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 exit /b 1
"%CMAKE%" --build "%HERE%\build"
if errorlevel 1 exit /b 1
echo.
echo Native host: %~dp0bin\anes_native_host.exe
