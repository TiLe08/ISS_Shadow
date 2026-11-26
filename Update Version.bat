@echo off
rem Aktualisiert diese Kopie auf den neuesten Stand von GitHub (Branch main). Die eigentliche
rem Arbeit macht server\update.ps1: git pull bei einem Git-Klon, sonst ZIP laden und Programmordner
rem ersetzen. logs\, cache\, .deps_ok und Dokumentation\ bleiben erhalten.
rem Alles steht in einem Klammerblock: cmd liest ihn vollstaendig ein, bevor er laeuft. Das Update
rem ueberschreibt auch diese Datei, und cmd wuerde sonst mitten in der neuen Fassung weiterlesen.
(
  cd /d "%~dp0"
  if not exist "%~dp0server\update.ps1" (
    echo server\update.ps1 is missing. Download the project once more from
    echo https://github.com/TiLe08/ISS_Shadow and run this file again.
    pause
    exit /b 1
  )
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\update.ps1"
  if errorlevel 1 (
    echo.
    pause
    exit /b 1
  )
  echo.
  choice /c YN /n /m "Start ISS Shadow now? [Y/N] "
  if errorlevel 2 exit /b 0
  call "%~dp0Start ISS Shadow.bat"
  exit /b 0
)
