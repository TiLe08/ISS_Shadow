#!/usr/bin/env python3
"""ISS Digital Shadow: Telemetrie-Bridge
NASA ISSLive (Lightstreamer) -> MQTT-Broker, mit CSV-Protokoll der Prozessdaten und
Quittierung der (simulierten) Kommandos aus dem Dashboard.

Die Bridge ist optional: Die Webseite kann ISSLive auch direkt abonnieren. Über die Bridge
laufen die Daten zusätzlich in einen MQTT-Broker (für andere Programme, Aufzeichnung,
Wiedergabe) und werden als CSV protokolliert. Der Launcher (launcher.py) startet sie samt
eingebautem Broker; sie kann aber auch eigenständig laufen.

Topics (Präfix einstellbar, Vorgabe "iss"):
  iss/tm/<PUI>      retained  {"v": <Wert>, "t": <Stunden des Jahres, Bordzeit>, "rx": <Unix-s>}
  iss/link          retained  {"sig": "AOS"|"LOS"|"STALE", "t": ..., "rx": ...}
  iss/bridge        retained  {"state": "online"|"offline", ...}   (Last Will)
  iss/orbit         retained  NASA-Bahnvorhersage (ephemeris.py)
  iss/cmd/<Ziel>    eingehend {"id", "target", "value", "ts", "operator", "mode"}
  iss/ack/<id>      ausgehend {"id", "status", "reason", "rx"}

Voraussetzungen:  pip install lightstreamer-client-lib paho-mqtt
Start:            python bridge.py --broker localhost --port 1883
Wiedergabe:       python bridge.py --replay logs/iss_tm_20261026.csv --speed 10
"""
import argparse, csv, json, logging, os, signal, sys, threading, time
from datetime import datetime, timezone
from ephemeris import OrbitService

try:
    import paho.mqtt.client as mqtt
except ImportError:
    sys.exit("missing dependency: pip install paho-mqtt")
try:
    from lightstreamer.client import LightstreamerClient, Subscription
except ImportError:
    LightstreamerClient = None

log = logging.getLogger("bridge")

# Vollständige öffentliche Kanalliste (ISSLive-Verzeichnis, siehe ISS_Public_Telemetry.xlsx im ISS-Mimic-Repository)
ITEMS = [f"AIRLOCK{n:06d}" for n in range(1, 59)] + \
    ["NODE1000001", "NODE1000002"] + [f"NODE2{n:06d}" for n in range(1, 8)] + [f"NODE3{n:06d}" for n in range(1, 21)] + \
    [f"P1{n:06d}" for n in range(1, 10)] + ["P3000001", "P3000002"] + [f"P4{n:06d}" for n in range(1, 9)] + [f"P6{n:06d}" for n in range(1, 9)] + \
    [f"RUSSEG{n:06d}" for n in range(1, 26)] + \
    [f"S0{n:06d}" for n in range(1, 14)] + [f"S1{n:06d}" for n in range(1, 10)] + ["S3000001", "S3000002"] + \
    [f"S4{n:06d}" for n in range(1, 9)] + [f"S6{n:06d}" for n in range(1, 9)] + \
    [f"USLAB{n:06d}" for n in range(1, 103)] + [f"Z1{n:06d}" for n in range(1, 16)] + ["TIME_000002"] + \
    ["CSAMT000001", "CSAMT000002"] + [f"CSASSRMS{n:03d}" for n in range(1, 12)] + [f"CSASPDM{n:04d}" for n in range(1, 23)] + \
    ["CSAMBS00001", "CSAMBS00002", "CSAMBA00003", "CSAMBA00004"]


class SubListenerBase:
    """Der Python-Lightstreamer-Client ruft jeden Callback auf; fehlende lösen im Client Fehler aus.
    Diese Basisklasse stellt deshalb alle Callbacks als leere Methoden bereit.
    """
    name = "subscription"
    def onItemUpdate(self, update): pass
    def onListenStart(self, *a): pass
    def onListenEnd(self, *a): pass
    def onClearSnapshot(self, itemName, itemPos): pass
    def onCommandSecondLevelItemLostUpdates(self, lostUpdates, key): pass
    def onCommandSecondLevelSubscriptionError(self, code, message, key): pass
    def onEndOfSnapshot(self, itemName, itemPos): pass
    def onItemLostUpdates(self, itemName, itemPos, lostUpdates): log.warning("lost %s updates on %s", lostUpdates, itemName)
    def onSubscription(self): log.info("Lightstreamer %s subscription active", self.name)
    def onSubscriptionError(self, code, message): log.error("Lightstreamer %s subscription error %s: %s", self.name, code, message)
    def onUnsubscription(self): log.info("Lightstreamer %s subscription ended", self.name)
    def onRealMaxFrequency(self, frequency): pass


class ClientListenerBase:
    """Leere Standard-Callbacks für den Verbindungs-Listener des Lightstreamer-Clients."""
    def onListenStart(self, *a): pass
    def onListenEnd(self, *a): pass
    def onServerError(self, code, message): pass
    def onStatusChange(self, status): pass
    def onPropertyChange(self, prop): pass


class _LsLogger:
    """Leitet das eigene Log des Lightstreamer-Clients (Warnungen und Fehler) in Pythons logging um.
    """
    def __init__(self, cat): self.l = logging.getLogger("ls." + cat)
    def fatal(self, line, ex=None): self.l.error("%s %s", line, ex or "")
    def error(self, line, ex=None): self.l.error("%s %s", line, ex or "")
    def warn(self, line, ex=None): self.l.warning("%s %s", line, ex or "")
    def info(self, line, ex=None): pass
    def debug(self, line, ex=None): pass
    def trace(self, line, ex=None): pass
    def isFatalEnabled(self): return True
    def isErrorEnabled(self): return True
    def isWarnEnabled(self): return True
    def isInfoEnabled(self): return False
    def isDebugEnabled(self): return False
    def isTraceEnabled(self): return False


class _LsLogProvider:
    """Logger-Fabrik für LightstreamerClient.setLoggerProvider()."""
    def getLogger(self, category): return _LsLogger(category)


class TimeBase:
    """Bildet ISSLive-Zeitstempel (dokumentiert als Stunden seit 1. Januar UTC) auf die Uhr dieses PCs ab.
    Zwei reale Effekte werden mit einem gelernten Offset aufgefangen, dem Minimum von
    (lokale Stunden − Zeitstempel von TIME_000001) über die letzten zwei Minuten:
      * eine abweichende Epoche (14.10.2026: ~1047 h geliefert, richtig wären ~6885 h gewesen;
        normal zählt ISSLive ab 31. Dezember, also 24 h vor),
      * eine PC-Uhr, die Sekunden oder Minuten falsch geht; sonst wirkt jeder Wert veraltet
        (oder aus der Zukunft) und die Verbindung bleibt für immer auf STALE.
    Nur Uhr-Ticks zählen: ein TIME_000001, dessen Zeitstempel vorgerückt ist. Ein erneut
    gesendeter Schnappschuss einer stehenden Uhr (nach Neuverbinden) ist kein Tick, und vor zwei
    Ticks wird nichts gelernt, ein eingefrorener Feed wird nie für aktuell gehalten. Eine stehende
    Uhr wird veraltet, sobald ihr Verzug das Fensterminimum übersteigt; ein Sprung um mehr als eine
    Stunde wird sofort neu gelernt.
    """
    WINDOW_S = 120.0

    def __init__(self):
        self.offset = 0.0; self.foreign = False; self.samples = []; self.learned = False; self.last_ts = None; self.ticks = 0

    def observe_time(self, ts, now_h):
        """Gibt True zurück, wenn diese Aktualisierung ein Uhr-Tick ist (Zeitstempel vorgerückt)."""
        if self.last_ts is not None and self.last_ts - 1.0 < ts <= self.last_ts:
            return False                        # wiederholt oder etwas älter: kein Tick (ein Epochen- oder Jahressprung schon)
        self.last_ts = ts; self.ticks += 1
        raw = now_h - ts
        if self.samples and abs(raw - min(r for _, r in self.samples)) > 1.0:
            self.samples = []; self.ticks = 1
        # ~24 Uhr-Updates pro Sekunde kommen an; eine Probe pro Sekunde behalten (das Minimum dieser Sekunde).
        if not self.samples or now_h - self.samples[-1][0] >= 1 / 3600: self.samples.append((now_h, raw))
        else: self.samples[-1] = (self.samples[-1][0], min(self.samples[-1][1], raw))
        while self.samples and self.samples[0][0] < now_h - self.WINDOW_S / 3600:
            self.samples.pop(0)
        if self.ticks < 2:
            return True
        offset = min(r for _, r in self.samples)
        foreign = abs(offset) > 1.0 and abs(offset + 24.0) > 1.0     # −24 h ist die normale Epoche von ISSLive
        if foreign and (not self.foreign or abs(offset - self.offset) > 1.0):
            log.warning("ISSLive timestamps use a non-standard epoch; applying %.4f h correction", offset)
        elif not foreign and (not self.learned or self.foreign) and abs(offset - round(offset / 24) * 24) * 3600 > 5:
            log.info("PC clock and ISSLive differ by %.1f s; timestamps aligned to the feed clock", (offset - round(offset / 24) * 24) * 3600)
        self.offset, self.foreign, self.learned = offset, foreign, True
        return True

    def correct(self, ts, now_h):
        """Werte in der Epoche dieses Feeds (höchstens 3 Tage alt) auf die PC-Uhr verschieben."""
        if not self.learned or not ts: return ts
        d = now_h - ts - self.offset
        return ts + self.offset if -0.05 <= d <= 72 else ts

    @property
    # Abweichung der PC-Uhr von der Feed-Uhr in Sekunden (None, solange nichts gelernt ist
    # oder die Epoche abweicht).
    def lag_s(self): return (self.offset - round(self.offset / 24) * 24) * 3600 if self.learned and not self.foreign else None


def feed_lag_h(ts, now_h):
    """Verzug eines ISSLive-Zeitstempels, bevor ein Offset gelernt ist (in Stunden). Die Uhr des
    Feeds zählt ab 31. Dezember 00:00 UTC (24 h vor hours_of_year); ein Wert aus der Zukunft ist
    nicht plausibel, also der kleinere Verzug der beiden Epochen, die nicht in der Zukunft liegen.
    """
    lags = [now_h - ts + e for e in (0.0, 24.0) if now_h - ts + e > -60 / 3600]
    return min(lags) if lags else float("nan")


def hours_of_year(ts=None):
    """Stunden seit 1. Januar 00:00 UTC des laufenden Jahres (oder des Zeitpunkts ts)."""
    now = datetime.now(timezone.utc) if ts is None else ts
    y0 = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    return (now - y0).total_seconds() / 3600.0


class CsvLogger:
    """Protokoll im Langformat: eine Zeile pro empfangenem Wert (rx_utc, pui, value, sc_hours_of_year).
    Jeden Tag (UTC) eine neue Datei iss_tm_JJJJMMTT.csv.
    """
    def __init__(self, folder):
        self.folder = folder; os.makedirs(folder, exist_ok=True)
        self.day = None; self.fh = None; self.w = None; self.lock = threading.Lock()

    def _open(self):
        """Öffnet bei Tageswechsel die Datei des neuen Tages (mit Kopfzeile, falls neu)."""
        day = datetime.now(timezone.utc).strftime("%Y%m%d")
        if day != self.day:
            if self.fh: self.fh.close()
            path = os.path.join(self.folder, f"iss_tm_{day}.csv")
            new = not os.path.exists(path)
            self.fh = open(path, "a", newline=""); self.w = csv.writer(self.fh); self.day = day
            if new: self.w.writerow(["rx_utc", "pui", "value", "sc_hours_of_year"])

    def write(self, pui, value, t):
        """Schreibt eine Zeile (threadsicher)."""
        with self.lock:
            self._open()
            self.w.writerow([datetime.now(timezone.utc).isoformat(timespec="milliseconds"), pui, value, t])

    def flush(self):
        with self.lock:
            if self.fh: self.fh.flush()


class Bridge:
    """Die eigentliche Bridge: hält die Lightstreamer-Sitzung zu ISSLive, veröffentlicht jeden
    Wert per MQTT, überwacht den Feed (Watchdog), protokolliert Kommandos und Werte und stellt die
    NASA-Bahnvorhersage (OrbitService) bereit. a = Argumente aus main() bzw. vom Launcher.
    """
    def __init__(self, a):
        self.a = a; self.root = a.root.rstrip("/")
        self.csv = CsvLogger(a.logdir) if a.logdir else None
        self.cmdlog = open(os.path.join(a.logdir, "commands.jsonl"), "a") if a.logdir else None
        self.timebase = TimeBase()
        self.n = 0; self.sig = None; self.ls_status = "idle"; self.last_error = None; self.last_tm = None; self.subs_ok = 0; self.sub_error = None; self.bad_items = []
        # Watchdog-Zustand: Eine Lightstreamer-Sitzung kann CONNECTED bleiben, während ISSLive
        # nichts sendet (über Stunden beobachtet); die Bridge baut die Sitzung dann neu auf.
        self.gen = 0; self.ls = None; self.subs = []; self.lock = threading.RLock()
        self.ls_since = time.time(); self.status_since = time.time(); self.last_time_rx = None; self.last_ts = None
        self.restarts = 0; self.last_item_fresh = 0.0; self.link_pub = 0.0; self.feed_clock = None; self.retry_base = 60.0; self.stale_s = 15.0; self.retry_after = self.retry_base; self.stop_ev = threading.Event(); self.status_pub = 0.0; self.last_pub = {}
        self.orbit = OrbitService(os.path.join(os.path.dirname(__file__), "cache"), self.publish_orbit)
        self.m = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"iss-bridge-{os.getpid()}")
        if a.user: self.m.username_pw_set(a.user, a.password)
        self.m.will_set(f"{self.root}/bridge", json.dumps({"state": "offline"}), qos=1, retain=True)
        self.m.on_connect = self.on_connect
        self.m.on_message = self.on_message

    # --- MQTT ---
    def on_connect(self, c, userdata, flags, rc, props=None):
        """MQTT verbunden: Kommando-Topics abonnieren und die Bridge als online melden."""
        log.info("MQTT connected (%s)", rc)
        c.subscribe(f"{self.root}/cmd/#", qos=1)
        c.publish(f"{self.root}/bridge", json.dumps({"state": "online", "since": time.time(), "source": "REPLAY" if self.a.replay else "ISSLIVE"}), qos=1, retain=True)

    def on_message(self, c, userdata, msg):
        """Eingehendes Kommando protokollieren und als SIMULATED quittieren."""
        try:
            cmd = json.loads(msg.payload)
        except ValueError:
            log.warning("bad command payload on %s", msg.topic); return
        cmd["rx"] = time.time()
        log.info("CMD #%s %s = %s (%s)", cmd.get("id"), cmd.get("target"), cmd.get("value"), cmd.get("operator"))
        if self.cmdlog:
            self.cmdlog.write(json.dumps(cmd) + "\n"); self.cmdlog.flush()
        # Die ISS ist für die Öffentlichkeit vom Boden aus nicht kommandierbar. Jedes Kommando wird
        # nur als auf die virtuelle Station angewendet quittiert.
        ack = {"id": cmd.get("id"), "status": "SIMULATED", "reason": "virtual command logged; execution is local to the dashboard", "rx": cmd["rx"]}
        c.publish(f"{self.root}/ack/{cmd.get('id')}", json.dumps(ack), qos=1)

    def publish_tm(self, pui, value, t, raw_ts=None):
        # Eine neu aufgebaute Sitzung sendet ihren Schnappschuss erneut (gleicher Wert, gleicher Zeitstempel):
        # kein neuer Messwert, also weder mit frischer Empfangszeit neu veröffentlicht noch erneut protokolliert.
        """Einen Telemetriewert veröffentlichen (retained) und ins CSV schreiben.
        raw_ts = unkorrigierter Zeitstempel, um erneut gesendete Schnappschüsse zu erkennen.
        """
        if raw_ts is not None:
            if self.last_pub.get(pui) == (value, raw_ts): return
            self.last_pub[pui] = (value, raw_ts)
        try: v = float(value)
        except (TypeError, ValueError): v = value
        self.m.publish(f"{self.root}/tm/{pui}", json.dumps({"v": v, "t": t, "rx": time.time(), "source": "REPLAY" if self.a.replay else "ISSLIVE"}), qos=0, retain=True)
        if self.csv: self.csv.write(pui, value, t)
        self.n += 1; self.last_tm = time.time()

    def publish_link(self, sig, t):
        """Signalzustand (AOS/LOS/STALE) veröffentlichen."""
        if sig != self.sig: log.info("signal %s", sig)
        self.sig = sig
        self.m.publish(f"{self.root}/link", json.dumps({"sig": sig, "t": t, "rx": time.time()}), qos=1, retain=True)

    def publish_status(self):
        """Status der Bridge veröffentlichen (Zähler, Fehler, Uhrabweichung, Feed-Uhr ...)."""
        self.status_pub = time.time()
        st = {"state": "online", "source": "REPLAY" if self.a.replay else "ISSLIVE", "ls": self.ls_status, "n": self.n, "error": self.last_error,
              "last_tm": self.last_tm, "last_time": self.last_time_rx, "subs_ok": self.subs_ok, "sub_error": self.sub_error,
              "bad_items": len(self.bad_items), "restarts": self.restarts, "clock_offset_s": self.timebase.lag_s, "feed_clock": self.feed_clock, "rx": time.time()}
        try: self.m.publish(f"{self.root}/bridge", json.dumps(st), qos=0, retain=True)
        except Exception: pass

    def publish_orbit(self, snapshot):
        # Eigenes Topic: nie als gemessene Zustandsvektor-PUIs von ISSLive ausgeben.
        """NASA-Bahnvorhersage veröffentlichen (Callback von OrbitService)."""
        self.m.publish(f"{self.root}/orbit", json.dumps(snapshot, allow_nan=False), qos=0, retain=True)

    # --- Lightstreamer ---
    def start_ls(self):
        """Baut eine neue Lightstreamer-Sitzung zu ISSLive auf und abonniert die Uhr sowie alle
        Kanäle in Paketen zu 24. Jede Sitzung hat eine Generationsnummer; Callbacks älterer
        Sitzungen werden verworfen.
        """
        try:
            LightstreamerClient.setLoggerProvider(_LsLogProvider())
        except Exception:
            pass
        with self.lock:
            self.gen += 1; gen = self.gen
            ls = LightstreamerClient(self.a.ls, "ISSLIVE")
            ls.connectionOptions.setSlowingEnabled(False)
            self.ls = ls; self.subs = []; self.subs_ok = 0; self.bad_items = []; self.sub_error = None
            self.ls_since = self.status_since = time.time()
        bridge = self
        current = lambda: gen == bridge.gen      # Callbacks eines ersetzten Clients werden ignoriert

        class Cl(ClientListenerBase):
            """Verbindungsstatus und Serverfehler der Sitzung."""
            def onStatusChange(self, s):
                if not current(): return
                if s != bridge.ls_status: bridge.status_since = time.time()
                bridge.ls_status = s; log.info("Lightstreamer: %s", s); bridge.publish_status()
            def onServerError(self, code, msg):
                if not current(): return
                bridge.last_error = f"Lightstreamer server error {code}: {msg}"; log.error(bridge.last_error); bridge.publish_status()

        class TmL(SubListenerBase):
            """Telemetriekanäle: Zeitstempel korrigieren, Aktualität notieren, veröffentlichen."""
            name = "telemetry"
            def onItemUpdate(self, u):
                if not current(): return
                try: ts = float(u.getValue("TimeStamp") or 0)
                except ValueError: ts = 0
                now_h = hours_of_year(); cts = bridge.timebase.correct(ts, now_h)
                # Ein Wert mit Zeitstempel innerhalb von 15 s vor jetzt beweist, dass der Feed aktuell ist, auch wenn der Uhrkanal hinterherhinkt.
                if bridge.timebase.learned and ts and -5 / 3600 < now_h - cts < 15 / 3600: bridge.last_item_fresh = time.time()
                bridge.publish_tm(u.getItemName(), u.getValue("Value"), cts, ts)

        class TimeL(SubListenerBase):
            """Uhrkanal TIME_000001: Zeitbasis lernen, eingefrorenen Feed erkennen, Signal bestimmen.
            """
            name = "time"
            def onItemUpdate(self, u):
                if not current(): return
                try: ts = float(u.getValue("TimeStamp") or 0)
                except ValueError: return
                now_h = hours_of_year(); lag = feed_lag_h(ts, now_h); bridge.feed_clock = time.time() - lag * 3600 if lag == lag else None
                tick = bridge.timebase.observe_time(ts, now_h); ts = bridge.timebase.correct(ts, now_h)
                if tick:
                    bridge.last_time_rx = time.time(); bridge.last_ts = ts; bridge.retry_after = bridge.retry_base
                    if (bridge.last_error or "").startswith("Feed watchdog"): bridge.last_error = None; bridge.publish_status()
                aos = u.getValue("Status.Class") == "24"
                if aos and not bridge.timebase.learned:
                    # eine Uhr, die unter beiden Epochen Minuten oder Stunden zurückliegt: NASAs Feed ist eingefroren
                    if lag > 120 / 3600:
                        if bridge.sig != "STALE": log.warning("ISSLive clock stopped %.1f h ago: feed frozen on NASA's side", lag)
                        bridge.publish_link("STALE", ts); bridge.publish_status()
                    return      # sonst wird die Aktualität ab dem zweiten Tick beurteilt
                stale = now_h - ts > bridge.stale_s / 3600 and not time.time() - bridge.last_item_fresh < bridge.stale_s
                sig = ("STALE" if stale else "AOS") if aos else "LOS"
                # NASA sendet die Uhr ~24-mal pro Sekunde: eine Änderung sofort weitergeben, sonst einmal pro Sekunde.
                if sig != bridge.sig or time.time() - bridge.link_pub >= 1.0:
                    bridge.link_pub = time.time(); bridge.publish_link(sig, ts)

        ls.addListener(Cl())

        def subscribe(items, fields, listener_cls):
            # in Paketen: ein entfernter Kanal lässt nur sein Paket scheitern, das dann zur Isolierung geteilt wird
            """Abonniert items mit Snapshot; lehnt der Server ab, wird das Paket halbiert, bis der
            fehlerhafte Kanal isoliert ist (er landet in bad_items).
            """
            sub = Subscription("MERGE", items, fields); sub.setRequestedSnapshot("yes")

            class L(listener_cls):
                def onSubscription(self):
                    if not current(): return
                    bridge.subs_ok = min(bridge.subs_ok + len(items), len(ITEMS) + 1); bridge.publish_status()
                def onSubscriptionError(self, code, message):
                    if not current(): return
                    bridge.sub_error = f"{code}: {message}"
                    log.warning("subscription rejected (%s) for %d items", bridge.sub_error, len(items))
                    if len(items) > 1:
                        h = (len(items) + 1) // 2
                        subscribe(items[:h], fields, listener_cls); subscribe(items[h:], fields, listener_cls)
                    else:
                        bridge.bad_items.append(items[0]); log.warning("item %s not served by the feed", items[0])
                    bridge.publish_status()
            sub.addListener(L()); ls.subscribe(sub); bridge.subs.append(sub)

        # Uhr zuerst: ihr Schnappschuss lehrt die Zeitbasis, bevor die Telemetrie-Schnappschüsse eintreffen.
        subscribe(["TIME_000001"], ["TimeStamp", "Value", "Status.Class"], TimeL)
        for i in range(0, len(ITEMS), 24):
            subscribe(ITEMS[i:i + 24], ["TimeStamp", "Value"], TmL)
        ls.connect()

    def stop_ls(self):
        """Beendet die aktuelle Sitzung (Abos und Verbindung)."""
        with self.lock:
            ls, subs = self.ls, self.subs
            self.gen += 1; self.ls = None; self.subs = []
        if ls is None: return
        for sub in subs:
            try: ls.unsubscribe(sub)
            except Exception: pass
        try: ls.disconnect()
        except Exception: pass

    def restart_ls(self, reason):
        """Sitzung neu aufbauen und den Grund als Fehlertext melden."""
        self.restarts += 1
        log.warning("rebuilding Lightstreamer session (%s); next attempt after %.0f s", reason, self.retry_after)
        self.last_error = f"Feed watchdog: {reason}; session rebuilt"
        self.stop_ls()
        try:
            self.start_ls()
        except Exception as exc:
            self.last_error = str(exc); self.ls_status = "DISCONNECTED"; log.exception("Lightstreamer restart failed")
        self.publish_status()

    def watchdog_step(self, now=None):
        """Eine Watchdog-Entscheidung; gibt die ausgeführte Aktion zurück (für Tests)."""
        now = time.time() if now is None else now
        if self.a.replay or self.ls is None and LightstreamerClient is None: return None
        last = self.last_time_rx or 0
        silent = now - max(last, self.ls_since)
        # Heartbeat: Das Dashboard hält einen stillen Broker für eine kaputte Bridge, deshalb
        # mindestens alle 10 s melden, auch wenn NASA nichts sendet.
        if now - self.status_pub > 10: self.publish_status()
        # 1) Sofort melden, wenn der Uhrkanal stoppt (der gespeicherte Link-Status würde sonst AOS zeigen).
        if self.last_time_rx and now - self.last_time_rx > self.stale_s and self.sig == "AOS" and not now - self.last_item_fresh < 30:
            self.publish_link("STALE", self.last_ts or 0); self.publish_status()
        # 2) Eine Sitzung neu aufbauen, die steht, aber schweigt, oder die lange nicht verbunden war.
        connected = str(self.ls_status).startswith("CONNECTED")
        if connected and silent > self.retry_after:
            self.restart_ls(f"no ISSLive updates for {silent:.0f} s"); self.retry_after = min(5 * self.retry_base, self.retry_after * 2); return "restart-silent"
        if not connected and now - self.status_since > max(1.5 * self.retry_base, self.retry_after):
            self.restart_ls(f"not connected for {now - self.status_since:.0f} s ({self.ls_status})"); self.retry_after = min(5 * self.retry_base, self.retry_after * 2); return "restart-down"
        return None

    def _watch(self):
        """Watchdog-Thread: alle 2 s watchdog_step()."""
        while not self.stop_ev.wait(2.0):
            try: self.watchdog_step()
            except Exception: log.exception("watchdog")

    def start(self):
        """Nicht blockierender Start (von launcher.py verwendet)."""
        self.m.connect(self.a.broker, self.a.port, keepalive=30)
        self.m.loop_start()
        if self.a.replay:
            threading.Thread(target=self.replay, daemon=True).start()
        else:
            self.orbit.start()
            try:
                if LightstreamerClient is None: raise RuntimeError("missing dependency: lightstreamer-client-lib")
                self.start_ls()
                threading.Thread(target=self._watch, daemon=True, name="feed-watchdog").start()
            except Exception as exc:
                self.last_error = str(exc); self.ls_status = "DISCONNECTED"
                log.exception("ISSLive unavailable; independent NASA orbit service remains running")
                self.publish_status()

    def stop(self):
        """Sauber beenden: offline melden, Sitzung und Broker-Verbindung schließen."""
        log.info("bridge stopping")
        self.stop_ev.set()
        self.orbit.stop()
        try: self.m.publish(f"{self.root}/bridge", json.dumps({"state": "offline"}), qos=1, retain=True).wait_for_publish(2)
        except Exception: pass
        self.stop_ls()
        if self.csv: self.csv.flush()
        self.m.loop_stop(); self.m.disconnect()

    def stats(self, state={"t": time.time(), "n": 0}):
        """Alle 10 s: Durchsatz und Zustand ins Log, Status veröffentlichen, CSV leeren.
        (state ist absichtlich ein veränderbarer Standardwert und merkt sich die letzte Messung.)
        """
        now = time.time(); rate = (self.n - state["n"]) / max(1e-6, now - state["t"]); state.update(t=now, n=self.n)
        tick = f"{now - self.last_time_rx:.0f} s ago" if self.last_time_rx else "never"
        log.info("%.1f msg/s, %d total, signal %s, lightstreamer %s, %d items subscribed, %d rejected, last clock tick %s, %d watchdog restarts",
                 rate, self.n, self.sig, self.ls_status, self.subs_ok, len(self.bad_items), tick, self.restarts)
        self.publish_status()
        if self.csv: self.csv.flush()

    def run(self):
        """Blockierender Betrieb als eigenständiges Programm (bis Strg+C / SIGTERM)."""
        self.start()
        stop = threading.Event()
        signal.signal(signal.SIGINT, lambda *_: stop.set()); signal.signal(signal.SIGTERM, lambda *_: stop.set())
        while not stop.wait(10): self.stats()
        self.stop()

    def replay(self):
        """Gibt eine von dieser Bridge geschriebene CSV erneut wieder (für Vorführungen ohne Netz).
        """
        rows = list(csv.DictReader(open(self.a.replay)))
        log.info("replaying %d rows from %s at x%s", len(rows), self.a.replay, self.a.speed)
        prev = None
        for r in rows:
            t = datetime.fromisoformat(r["rx_utc"])
            if prev: time.sleep(max(0.0, (t - prev).total_seconds() / self.a.speed))
            prev = t
            self.publish_tm(r["pui"], r["value"], float(r["sc_hours_of_year"] or 0))
            self.publish_link("AOS", hours_of_year())


def main():
    """Kommandozeile auswerten und die Bridge starten."""
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--broker", default="localhost"); p.add_argument("--port", type=int, default=1883)
    p.add_argument("--user"); p.add_argument("--password")
    p.add_argument("--root", default="iss", help="topic root")
    p.add_argument("--ls", default="https://push.lightstreamer.com", help="Lightstreamer server")
    p.add_argument("--logdir", default="logs", help="CSV log folder ('' to disable)")
    p.add_argument("--replay", help="replay a CSV log instead of connecting to ISSLive")
    p.add_argument("--speed", type=float, default=1.0, help="replay speed factor")
    a = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    Bridge(a).run()


if __name__ == "__main__":
    main()
