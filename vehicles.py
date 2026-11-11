"""ISS-Verkehr, Crew und Zeitplan aus Launch Library 2 (TheSpaceDevs).

ISSLive meldet, ob die vier russischen Ports belegt sind, aber nicht womit, nichts über die
US-Ports und nichts über die Crew. LL2 ist eine öffentliche, gepflegte Datenbank:
  docking   /docking_event/?space_station__id=4   Fahrzeug, Port, An-/Abdockzeiten
  station   /spacestation/4/?mode=detailed        Expedition, Crew und Rollen, aktuell angedockt
  events    /event/upcoming/?program=17            Außenbordeinsätze, Andockungen, Pressekonferenzen
  launches  /launch/upcoming/?program=17           nächste Starts zur Station
Dieser Dienst ruft sie zeitversetzt ab, hält die letzten guten Antworten auf der Platte
(cache/ll2_docking.json) und liefert sie dem Dashboard als /__vehicles. Die anonyme LL2-API
erlaubt 15 Anfragen pro Stunde und Adresse; dieser Dienst braucht etwa 3,5.
"""
import json, logging, os, threading, time, urllib.request
from pathlib import Path

log = logging.getLogger("vehicles")
BASE = os.environ.get("ISS_LL2_BASE", "https://ll.thespacedevs.com/2.2.0")
FEEDS = {   # Name: (Pfad, Aktualisierung in s)
    "docking": ("/docking_event/?space_station__id=4&ordering=-docking&limit=30&format=json", 1800),
    "station": ("/spacestation/4/?mode=detailed&format=json", 7200),
    "events": ("/event/upcoming/?program=17&limit=12&format=json", 7200),
    "launches": ("/launch/upcoming/?program=17&limit=8&mode=list&format=json", 7200),
}
RETRY = 300             # s nach einem Fehler
RATE_LIMITED = 3600     # s nach HTTP 429 (Ratenlimit)
SPACING = 20            # s zwischen zwei Anfragen


def _get(url, timeout=20):
    """JSON von url holen (mit User-Agent, Zeitlimit und Größenbegrenzung 4 MB)."""
    req = urllib.request.Request(url, headers={"User-Agent": "ISS-Shadow", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(4_000_001)
    if len(raw) > 4_000_000:
        raise ValueError("response too large")
    return json.loads(raw)


def _ts(iso):
    """ISO-Zeit -> Unix-Sekunden (0 bei ungültigem Wert)."""
    from datetime import datetime
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0


def _name(o, key="name"):
    """Namensfeld eines LL2-Objekts (oder der Wert selbst, wenn es kein Objekt ist)."""
    return (o or {}).get(key) if isinstance(o, dict) else o


def iss_events(results):
    """Andockereignisse der ISS mit den Feldern, die das Dashboard liest. Listenantworten
    enthalten die Station nur in docking_location (geprüft 20.10.2026).
    """
    out = []
    for e in results or []:
        loc = e.get("docking_location") or {}
        st = e.get("space_station") or loc.get("spacestation") or {}
        if st.get("id") != 4 and "international space station" not in str(st.get("name", "")).lower():
            continue
        sc = (e.get("flight_vehicle") or {}).get("spacecraft") or {}
        out.append({"launch_id": e.get("launch_id"), "docking": e.get("docking"), "departure": e.get("departure"),
                    "docking_location": {"id": loc.get("id"), "name": loc.get("name")},
                    "space_station": {"id": st.get("id"), "name": st.get("name")},
                    "flight_vehicle": {"spacecraft": {"name": sc.get("name"), "serial_number": sc.get("serial_number"),
                                                      "spacecraft_config": {"name": _name(sc.get("spacecraft_config"))}}}})
    return out


def station_summary(j):
    """Expedition, Crew (Rolle, Agentur) und was gerade angedockt ist."""
    exps = []
    for e in j.get("active_expeditions") or []:
        crew = []
        for c in e.get("crew") or []:
            a = c.get("astronaut") or {}
            crew.append({"name": a.get("name"), "role": _name(c.get("role"), "role"), "priority": (c.get("role") or {}).get("priority", 9),
                         "agency": _name(a.get("agency")), "status": _name(a.get("status")),
                         "image": a.get("profile_image_thumbnail") or a.get("profile_image")})
        crew.sort(key=lambda c: (c["priority"], c["name"] or ""))
        exps.append({"name": e.get("name"), "start": e.get("start"), "end": e.get("end"), "crew": crew})
    docked = []
    for loc in j.get("docking_location") or []:
        d = loc.get("docked")
        if d:
            sc = (d.get("flight_vehicle") or {}).get("spacecraft") or {}
            docked.append({"location": loc.get("name"), "docking": d.get("docking"), "departure": d.get("departure"),
                           "name": sc.get("name"), "serial": sc.get("serial_number"), "config": _name(sc.get("spacecraft_config")),
                           "description": sc.get("description"), "flights": sc.get("flights_count"), "time_in_space": sc.get("time_in_space")})
    return {"name": j.get("name"), "status": _name(j.get("status")), "onboard_crew": j.get("onboard_crew"), "docked_vehicles": j.get("docked_vehicles"),
            "orbit": j.get("orbit"), "expeditions": exps, "docked": docked}


def event_summary(results):
    """Kommende Ereignisse (Außenbordeinsätze, Andockungen ...) in kompakter Form."""
    out = []
    for e in results or []:
        out.append({"name": e.get("name"), "type": _name(e.get("type")), "date": e.get("date"), "precision": _name(e.get("date_precision")),
                    "location": e.get("location"), "description": (e.get("description") or "")[:400], "video": e.get("video_url"),
                    "live": bool(e.get("webcast_live"))})
    return out


def launch_summary(results):
    """Kommende Starts zur Station in kompakter Form."""
    out = []
    for l in results or []:
        st = l.get("status") or {}
        out.append({"name": l.get("name"), "net": l.get("net"), "precision": _name(l.get("net_precision")),
                    "status": st.get("abbrev") if isinstance(st, dict) else st, "status_name": _name(st),
                    "provider": l.get("lsp_name"), "mission": l.get("mission"), "type": l.get("mission_type"), "pad": l.get("pad"),
                    "location": l.get("location"), "window_start": l.get("window_start")})
    return out


PARSE = {"docking": lambda j: iss_events(j.get("results")), "station": station_summary,
         "events": lambda j: event_summary(j.get("results")), "launches": lambda j: launch_summary(j.get("results"))}


class VehicleService:
    """Hintergrunddienst: ruft die vier LL2-Feeds zeitversetzt ab, speichert sie zwischen und
    liefert mit snapshot() den Stand für /__vehicles. get ist austauschbar (Tests).
    """
    def __init__(self, cache_dir, base=BASE, get=_get):
        self.cache = Path(cache_dir) / "ll2_docking.json"
        self.base, self.get = base.rstrip("/"), get
        self.lock = threading.Lock(); self.stop_event = threading.Event()
        self.data = {"events": [], "launches": {}, "fetched": None}
        self.extra = {}            # station / events / launches: {"data", "fetched"}
        self.error = None; self.cached = True
        self.feed_errors = {}      # letzter Fehler je Feed (leer, sobald der Feed wieder klappt)
        self.next = {k: 0 for k in FEEDS}; self.next_fetch = 0; self.last_request = 0

    def start(self):
        """Dienst im Hintergrund-Thread starten."""
        threading.Thread(target=self.run, daemon=True, name="ll2-vehicles").start()

    def snapshot(self):
        """Aktueller Stand für das Dashboard (threadsicher kopiert)."""
        with self.lock:
            d, x, fe = dict(self.data), dict(self.extra), dict(self.feed_errors)
        return {"available": bool(d["events"]), "source": "Launch Library 2 (TheSpaceDevs)", "fetched": d["fetched"],
                "cached": self.cached, "error": self.error, "events": d["events"], "launches": d["launches"],
                "station": (x.get("station") or {}).get("data"), "upcoming_events": (x.get("events") or {}).get("data"),
                "upcoming_launches": (x.get("launches") or {}).get("data"),
                "fetched_extra": {k: v.get("fetched") for k, v in x.items()}, "feed_errors": fe}

    def load_cache(self):
        """Zwischenspeicher von der Platte laden und die nächsten Abrufe danach planen."""
        try:
            d = json.loads(self.cache.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        now = time.time()
        if isinstance(d.get("events"), list):
            with self.lock:
                self.data = {"events": d["events"], "launches": d.get("launches") or {}, "fetched": d.get("fetched")}
            self._schedule("docking", d.get("fetched"), now)
        for k, v in (d.get("extra") or {}).items():
            if k in FEEDS and isinstance(v, dict):
                self.extra[k] = v; self._schedule(k, v.get("fetched"), now)

    def _schedule(self, feed, fetched_ms, now):
        # Nicht früher neu abrufen, als das Cache-Alter erlaubt (Ratenlimit auch über Neustarts hinweg).
        """Nächsten Abruf eines Feeds nach dem Alter seiner Daten planen."""
        age = now - (fetched_ms or 0) / 1000
        self.next[feed] = time.monotonic() + max(0, min(FEEDS[feed][1], FEEDS[feed][1] - age))
        if feed == "docking": self.next_fetch = self.next[feed]

    def save(self):
        """Zwischenspeicher atomar schreiben (erst .tmp, dann umbenennen)."""
        with self.lock:
            d = dict(self.data, extra=dict(self.extra))
        try:
            self.cache.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.cache.with_suffix(".tmp"); tmp.write_text(json.dumps(d), encoding="utf-8"); tmp.replace(self.cache)
        except OSError as exc:
            log.warning("could not save vehicle cache: %s", exc)

    def refresh(self, feed="docking"):
        """Einen Feed abrufen, auswerten und übernehmen; wirft bei Fehlern (step behandelt sie)."""
        path, every = FEEDS[feed]
        self.last_request = time.monotonic()
        j = self.get(self.base + path)
        parsed = PARSE[feed](j)
        now = int(time.time() * 1000)
        if feed == "docking":
            if not parsed:
                raise ValueError("no ISS docking events in the answer")
            with self.lock:
                self.data, self.error, self.cached = {"events": parsed, "launches": {}, "fetched": now}, None, False
            docked = [e["flight_vehicle"]["spacecraft"]["name"] for e in parsed if not e.get("departure") or _ts(e["departure"]) > now / 1000]
            log.info("LL2: %d ISS docking events, docked now: %s", len(parsed), ", ".join(map(str, docked)))
        else:
            with self.lock:
                self.extra[feed] = {"data": parsed, "fetched": now}
            log.info("LL2: %s updated", feed)
        self.save()

    def step(self):
        """Ein Planungsschritt: höchstens eine fällige Anfrage, mindestens SPACING s Abstand;
        bei Fehlern erneuter Versuch nach RETRY s, bei Ratenlimit warten alle Feeds RATE_LIMITED s.
        """
        now = time.monotonic()
        if now - self.last_request < SPACING:
            return
        due = [k for k in FEEDS if now >= self.next[k]]
        if not due:
            return
        feed = due[0]
        try:
            self.refresh(feed); self.next[feed] = time.monotonic() + FEEDS[feed][1]
            with self.lock: self.feed_errors.pop(feed, None)
        except Exception as exc:
            rate = "429" in str(exc)
            with self.lock:
                self.feed_errors[feed] = "rate limited" if rate else str(exc)
                if feed == "docking" or rate:
                    self.error, self.cached = ("rate limited" if rate else str(exc)), True
            log.warning("LL2 %s refresh failed: %s", feed, exc)
            wait = RATE_LIMITED if rate else RETRY
            if rate:                    # das Limit gilt pro Adresse: alle Feeds warten
                for k in FEEDS: self.next[k] = max(self.next[k], time.monotonic() + wait)
            self.next[feed] = time.monotonic() + wait
        self.next_fetch = self.next["docking"]

    def run(self):
        """Thread-Schleife: Cache laden, dann alle 5 s step()."""
        self.load_cache()
        while not self.stop_event.is_set():
            self.step()
            self.stop_event.wait(5)
