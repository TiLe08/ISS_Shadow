#!/usr/bin/env python3
"""ISS Digital Shadow: Start mit einem Klick (launcher.py).
Startet in einem Prozess (unter Windows in einem sichtbaren Konsolenfenster):
  1. eingebetteten MQTT-Broker (amqtt)    tcp 127.0.0.1:1883, WebSocket 127.0.0.1:9001
  2. Telemetrie-Bridge (bridge.py)        ISSLive -> MQTT, CSV-Protokolle in ./logs
     Besuchsfahrzeuge (vehicles.py)       Andockereignisse aus Launch Library 2, /__vehicles
     NASA-Bahnvorhersage (ephemeris.py)   /__orbit
     Bahnelemente CelesTrak (tle.py)      Nahbereichsradar, /__tle
  3. lokalen Webserver                    http://localhost:8137/iss_twin.html
und öffnet das Dashboard im Standardbrowser.
Alles beendet sich sofort, wenn das Konsolenfenster geschlossen, dort Strg+C gedrückt oder im
Dashboard EXIT gedrückt wird; sonst einige Minuten, nachdem der letzte Dashboard-Tab geschlossen
wurde. Broker, Bridge und Dienste sind Threads dieses Prozesses, es bleibt also nichts zurück.
Protokoll: logs/launcher.log
Unter Windows wird der Launcher über „Start ISS Shadow.bat“ gestartet (installiert beim ersten
Start die Python-Pakete aus requirements.txt).
"""
import asyncio, json, logging, os, signal, socket, sys, threading, time, types, urllib.request, webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
HTTP_PORT, MQTT_PORT, WS_PORT = 8137, 1883, 9001
VERSION = "1.29"             # muss mit PAGE_VERSION in iss_twin.html übereinstimmen
IDLE_TIMEOUT = 240          # s ohne Dashboard-Heartbeat bis zum Beenden
URL = f"http://localhost:{HTTP_PORT}/iss_twin.html#mqtt"

os.makedirs(os.path.join(HERE, "logs"), exist_ok=True)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s",
                    handlers=[logging.FileHandler(os.path.join(HERE, "logs", "launcher.log"), encoding="utf-8")]
                    + ([logging.StreamHandler()] if sys.stderr else []))
log = logging.getLogger("launcher")
for _n in ("transitions", "amqtt", "lightstreamer", "websockets"):
    logging.getLogger(_n).setLevel(logging.WARNING)


def fatal(msg):
    """Fehler melden (unter Windows als Meldungsfenster, sonst auf stderr) und beenden."""
    log.error(msg)
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, "ISS Digital Shadow", 0x10)
    except Exception:
        print(msg, file=sys.stderr)
    sys.exit(1)


def port_free(port):
    """True, wenn auf dem Port nichts lauscht (Verbindungstest; robust gegen TIME_WAIT)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) != 0


# ---------------------------------------------------------------- Webserver
STATE = {"ping": time.time(), "quit": threading.Event(), "stopped": threading.Event()}


def install_stop_handlers():
    """Strg+C, Strg+Pause und das Schließen des Konsolenfensters beenden alles geordnet.
    Strg+C setzt nur das Quit-Ereignis (statt KeyboardInterrupt mitten im Ablauf). Für das
    Schließen des Fensters (CTRL_CLOSE_EVENT) gibt Windows dem Prozess etwa 5 s; der Handler
    wartet so lange, bis main() aufgeräumt hat, danach beendet Windows den Prozess."""
    def on_signal(*_):
        if STATE["quit"].is_set():          # zweites Strg+C: sofort hart beenden
            os._exit(1)
        log.info("stop requested from console"); STATE["quit"].set()
    signal.signal(signal.SIGINT, on_signal)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, on_signal)
    if os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes
            CLOSE_EVENTS = (2, 5, 6)        # CTRL_CLOSE_EVENT, CTRL_LOGOFF_EVENT, CTRL_SHUTDOWN_EVENT

            @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)
            def on_console(event):
                if event not in CLOSE_EVENTS:
                    return False            # Strg+C/Strg+Pause übernimmt der signal-Handler
                log.info("console window closed - shutting down")
                STATE["quit"].set(); STATE["stopped"].wait(4)
                return True
            STATE["console_handler"] = on_console      # Referenz halten, sonst räumt Python sie ab
            ctypes.windll.kernel32.SetConsoleCtrlHandler(on_console, True)
            # Schnellbearbeitung (QuickEdit) aus: Ein Klick ins Konsolenfenster startet sonst eine
            # Textauswahl, und jede Ausgabe blockiert, bis Esc gedrückt wird. Da alle Dienste ins
            # Fenster loggen, blieben Bridge (Telemetrie) und Bahndienst dann einfach stehen.
            k32 = ctypes.windll.kernel32
            h_in = k32.GetStdHandle(-10)                # STD_INPUT_HANDLE
            mode = wintypes.DWORD()
            if k32.GetConsoleMode(h_in, ctypes.byref(mode)):
                k32.SetConsoleMode(h_in, (mode.value & ~0x0040) | 0x0080)   # ~QUICK_EDIT | EXTENDED_FLAGS
        except Exception:
            log.exception("could not install console handler")


class Handler(SimpleHTTPRequestHandler):
    # Explizite Typen: Manche Windows-Registrys ordnen .js als text/plain zu und kennen keinen
    # .mjs-Typ, dann verweigern Browser die ES-Module des Dashboards.
    """HTTP-Handler: liefert die Projektdateien aus und beantwortet die internen Endpunkte
    /__orbit (Bahnvorhersage), /__vehicles (Besuchsfahrzeuge), /__streams (laufende Livestreams),
    /__tle (Bahnelemente von CelesTrak für das Nahbereichsradar),
    /__alive (Heartbeat des Dashboards,
    Version und Ordner) und /__shutdown. Protokolle, Cache, Tests und Python-Dateien werden nicht
    ausgeliefert.
    """
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript",
                      ".css": "text/css", ".json": "application/json", ".html": "text/html", ".md": "text/plain; charset=utf-8"}

    # Dateien immer aus dem Projektordner ausliefern.
    def __init__(self, *a, **kw): super().__init__(*a, directory=HERE, **kw)

    # Zugriffsprotokoll unterdrücken.
    def log_message(self, *a): pass

    def end_headers(self):
        """Kein Browser-Cache: nach einem Update kommt sofort der neue Code."""
        self.send_header("Cache-Control", "no-store"); super().end_headers()

    def _reply(self, obj):
        """Antwort als JSON senden."""
        body = json.dumps(obj).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        """GET-Anfragen: interne Endpunkte, sonst statische Dateien."""
        if self.path.split("?", 1)[0] == "/__orbit":
            orbit = STATE.get("orbit")
            return self._reply(orbit.snapshot() if orbit else {"available": False, "error": "Orbit service starting"})
        if self.path.split("?", 1)[0] == "/__vehicles":
            vv = STATE.get("vehicles")
            return self._reply(vv.snapshot() if vv else {"available": False, "error": "Vehicle service starting", "events": []})
        if self.path.split("?", 1)[0] == "/__tle":
            tl = STATE.get("tle")
            return self._reply(tl.snapshot() if tl else {"fetched": None, "groups": {}, "error": "TLE service starting"})
        if self.path.split("?", 1)[0] == "/__streams":
            sv = STATE.get("streams")
            return self._reply(sv.snapshot() if sv else {"fetched": 0, "streams": [], "errors": {"service": "starting"}})
        if self.path.startswith("/__alive"):
            STATE["ping"] = time.time(); return self._reply({"launcher": "iss-shadow", "mqtt": f"ws://localhost:{WS_PORT}", "version": VERSION, "folder": HERE})
        if self.path.startswith("/__shutdown"):
            self._reply({"ok": True}); log.info("shutdown requested from dashboard"); STATE["quit"].set(); return
        if self.path.startswith(("/logs", "/cache", "/tests")) or self.path.endswith(".py"):
            self.send_error(404); return
        return super().do_GET()


# ---------------------------------------------------------------- MQTT-Broker
class BrokerThread(threading.Thread):
    """Eingebetteter MQTT-Broker (amqtt) in eigenem Thread mit eigener asyncio-Schleife."""
    def __init__(self):
        super().__init__(daemon=True, name="broker"); self.ready = threading.Event(); self.error = None

    def run(self):
        """Thread-Einstieg: Broker bis stop() laufen lassen; Fehler werden in self.error gemeldet.
        """
        try:
            asyncio.run(self.main())
        except Exception as e:
            self.error = e; self.ready.set(); log.exception("broker failed")

    async def main(self):
        """Broker starten (TCP 1883 für die Bridge, WebSocket 9001 für den Browser) und auf stop warten.
        """
        from amqtt.broker import Broker
        cfg = {"listeners": {"default": {"type": "tcp", "bind": f"127.0.0.1:{MQTT_PORT}"},
                             "ws": {"type": "ws", "bind": f"127.0.0.1:{WS_PORT}"}},
               "plugins": {"amqtt.plugins.authentication.AnonymousAuthPlugin": {"allow_anonymous": True}}}
        self.loop = asyncio.get_running_loop(); self.stop_ev = asyncio.Event()
        broker = Broker(cfg); await broker.start(); log.info("MQTT broker up (1883 tcp, 9001 ws)")
        self.ready.set()
        await self.stop_ev.wait()
        await broker.shutdown()

    def stop(self):
        """Broker threadsicher anhalten."""
        if getattr(self, "loop", None): self.loop.call_soon_threadsafe(self.stop_ev.set)


def main():
    # Zweiter Start, während das Programm schon läuft:
    # Eine laufende Instanz bleibt aktiv, solange ein Dashboard-Tab offen ist. Ist es dieselbe
    # Version aus demselben Ordner, nur den Browser öffnen. Ist es eine andere Version oder eine
    # andere Kopie (z. B. das vorige Release läuft noch), wird sie ersetzt: Sonst bekäme der
    # Browser weiter die alten Dateien vom alten Server.
    """Ablauf: laufende Instanz prüfen/ersetzen, Abhängigkeiten prüfen, Broker, Bridge,
    Fahrzeugdienst und Webserver starten, Browser öffnen, dann auf EXIT oder Leerlauf warten.
    """
    if not port_free(HTTP_PORT):
        info = None
        try:
            with urllib.request.urlopen(f"http://localhost:{HTTP_PORT}/__alive", timeout=2) as r:
                info = json.loads(r.read() or b"{}")
        except Exception:
            pass
        if not info or info.get("launcher") != "iss-shadow":
            fatal(f"Port {HTTP_PORT} is used by another program. Close it and start again.")
        same = info.get("version") == VERSION and os.path.normcase(os.path.abspath(info.get("folder") or "")) == os.path.normcase(HERE)
        if same:
            log.info("already running, opening browser"); webbrowser.open(URL); return
        log.warning("replacing running ISS Shadow (version %s, folder %s) with version %s from %s",
                    info.get("version", "<1.6"), info.get("folder", "?"), VERSION, HERE)
        try: urllib.request.urlopen(f"http://localhost:{HTTP_PORT}/__shutdown", timeout=3).read()
        except Exception: pass
        for _ in range(60):                 # die alte Instanz beendet sich innerhalb von ~10 s
            if port_free(HTTP_PORT) and port_free(MQTT_PORT) and port_free(WS_PORT): break
            time.sleep(0.5)
        else:
            fatal("The previous ISS Shadow did not stop. Close its window or restart the PC, then start again.")

    try:
        import amqtt, paho.mqtt  # noqa: F401
    except ImportError as e:
        fatal(f"Missing Python package ({e.name}).\nDelete the file '.deps_ok' next to the start file and start again to reinstall.")

    broker = None
    if port_free(MQTT_PORT) and port_free(WS_PORT):
        broker = BrokerThread(); broker.start(); broker.ready.wait(15)
        if broker.error: fatal(f"MQTT broker could not start: {broker.error}")
    else:
        log.warning("ports 1883/9001 busy - using the broker that is already running there")

    sys.path.insert(0, HERE)
    import bridge as bridge_mod
    bridge_mod.log = logging.getLogger("bridge")
    args = types.SimpleNamespace(broker="127.0.0.1", port=MQTT_PORT, user=None, password=None, root="iss",
                                 ls=os.environ.get("ISS_LS_SERVER", "https://push.lightstreamer.com"), logdir=os.path.join(HERE, "logs"), replay=None, speed=1.0)
    br = bridge_mod.Bridge(args)
    STATE["orbit"] = br.orbit
    import vehicles
    vehicles.log = logging.getLogger("vehicles")
    STATE["vehicles"] = vehicles.VehicleService(os.path.join(HERE, "cache"))
    STATE["vehicles"].start()
    import tle
    tle.log = logging.getLogger("tle")
    STATE["tle"] = tle.TleService(os.path.join(HERE, "cache"))
    STATE["tle"].start()
    import streams
    streams.log = logging.getLogger("streams")
    STATE["streams"] = streams.StreamService()
    STATE["streams"].start()
    try:
        br.start()
    except Exception as e:
        fatal(f"Bridge could not start: {e}")

    httpd = ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True, name="http").start()
    log.info("dashboard at %s", URL)
    print(f"\n  ISS Digital Shadow {VERSION} is running: {URL}\n"
          "  Close this window or press Ctrl+C to stop everything.\n", flush=True)
    STATE["ping"] = time.time() + 60          # Schonfrist, bis der Browser gestartet ist
    webbrowser.open(URL)

    last_stats = time.time()
    while not STATE["quit"].wait(1):
        if time.time() - STATE["ping"] > IDLE_TIMEOUT:
            log.info("no dashboard open for %d s - shutting down", IDLE_TIMEOUT); break
        if time.time() - last_stats > 60:
            br.stats(); last_stats = time.time()

    log.info("stopping")
    for step in (br.stop, httpd.shutdown):
        try: step()
        except Exception: log.exception("error while stopping")
    if broker: broker.stop(); broker.join(3)
    log.info("stopped")


if __name__ == "__main__":
    install_stop_handlers()
    code = 0
    try:
        main()
    except SystemExit as e:                 # fatal(): Fehlercode an die Startdatei weitergeben
        code = e.code if isinstance(e.code, int) else 1
    except Exception:
        log.exception("launcher failed"); code = 1
    finally:
        STATE["stopped"].set()
        logging.shutdown()
    if code and os.name == "nt" and sys.stdin and sys.stdin.isatty() and not STATE["quit"].is_set():
        try: input("\nISS Digital Shadow stopped with an error (details: logs/launcher.log). Press Enter to close.")
        except Exception: pass
    # Hart beenden: Kein Hintergrund-Thread einer Bibliothek (z. B. Lightstreamer) darf den
    # Prozess nach dem Aufräumen noch am Leben halten.
    os._exit(code)
