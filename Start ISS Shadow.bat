@echo off
setlocal
rem Startdatei fuer Windows: sucht Python, installiert beim ersten Start die Pakete aus
rem server\requirements.txt und startet server\launcher.py (Broker, Bridge, Webserver, Browser) in einem
rem eigenen Konsolenfenster "ISS Digital Shadow". Das Fenster bleibt offen, solange das Programm
rem laeuft: Fenster schliessen oder Strg+C darin beendet alles sofort.
cd /d "%~dp0"

rem --- Python 3.10+ suchen (zuerst der py-Launcher, dann python im PATH) ---
set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY (where python >nul 2>nul && set "PY=python")
if not defined PY goto nopython
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul || goto nopython

rem --- einmalige Paketinstallation (Merker-Datei .deps_ok; zum Neuinstallieren loeschen) ---
if not exist ".deps_ok" (
  echo ISS Digital Shadow - first start
  echo Installing Python packages, this takes about a minute...
  %PY% -m pip install --user --disable-pip-version-check -q -r "%~dp0server\requirements.txt"
  if errorlevel 1 (
    echo.
    echo Package installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
  echo ok> ".deps_ok"
)

rem --- in eigenem Konsolenfenster starten (gehoert nur Python, also kein "Batchvorgang
rem abbrechen (J/N)?" bei Strg+C); dieses Fenster ist der Ausschalter ---
start "ISS Digital Shadow" %PY% "%~dp0server\launcher.py"
exit /b 0

:nopython
echo Python 3.10 or newer is required.
echo Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
pause
exit /b 1
