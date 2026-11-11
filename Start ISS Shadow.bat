@echo off
setlocal
rem Startdatei fuer Windows: sucht Python, installiert beim ersten Start die Pakete aus
rem requirements.txt und startet launcher.py (Broker, Bridge, Webserver, Browser).
cd /d "%~dp0"

rem --- Python 3.10+ suchen (zuerst der py-Launcher, dann python im PATH) ---
set "PY="
where py >nul 2>nul && (set "PY=py" & set "PYW=pyw")
if not defined PY (where pythonw >nul 2>nul && (set "PY=python" & set "PYW=pythonw"))
if not defined PY goto nopython
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul || goto nopython

rem --- einmalige Paketinstallation (Merker-Datei .deps_ok; zum Neuinstallieren loeschen) ---
if not exist ".deps_ok" (
  echo ISS Digital Shadow - first start
  echo Installing Python packages, this takes about a minute...
  %PY% -m pip install --user --disable-pip-version-check -q -r requirements.txt
  if errorlevel 1 (
    echo.
    echo Package installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
  echo ok> ".deps_ok"
)

rem --- alles im Hintergrund starten (ohne Konsole) und dieses Fenster schliessen ---
start "" %PYW% "%~dp0launcher.py"
exit /b 0

:nopython
echo Python 3.10 or newer is required.
echo Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
pause
exit /b 1
