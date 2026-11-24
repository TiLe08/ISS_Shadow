"""Bahnelemente (TLE) von CelesTrak für das Nahbereichsradar (v1.19).

Holt die Gruppen „stations“ (Stationen, angedockte und frei fliegende Fahrzeuge, ISS-Trümmer) und
„last-30-days“ (neu gestartete Objekte, z. B. ein Fahrzeug im Anflug) im Textformat und liefert sie dem
Dashboard als /__tle. CelesTrak aktualisiert die Daten etwa alle 2 h und bittet, nicht öfter abzurufen;
dieser Dienst fragt jede Gruppe höchstens alle 2 h ab und hält die letzte gute Antwort auf der Platte
(cache/tle.json), auch über Neustarts hinweg. Ausgewertet (SGP4) wird im Browser (radar.mjs).
"""
import json, logging, os, threading, time, urllib.request
from pathlib import Path

log = logging.getLogger("tle")
BASE = os.environ.get("ISS_TLE_BASE", "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=")
GROUPS = ["stations", "last-30-days"]
EVERY = 7200            # s zwischen zwei Abrufen einer Gruppe
RETRY = 900             # s nach einem Fehler
SPACING = 10            # s zwischen zwei Anfragen


def _get(url, timeout=20):
    """Text von url holen (mit User-Agent, Zeitlimit und Größenbegrenzung 4 MB)."""
    req = urllib.request.Request(url, headers={"User-Agent": "ISS-Shadow", "Accept": "text/plain"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(4_000_001)
    if len(raw) > 4_000_000:
        raise ValueError("response too large")
    return raw.decode("utf-8", "replace")


def valid_tle(text):
    """True, wenn der Text mindestens einen Elementsatz (Zeilen „1 “ und „2 “) enthält."""
    lines = [l.strip() for l in text.splitlines()]
    return any(a.startswith("1 ") and b.startswith("2 ") for a, b in zip(lines, lines[1:]))


class TleService:
    """Hintergrunddienst: ruft die Gruppen zeitversetzt ab und liefert mit snapshot() den Stand.
    get ist austauschbar (Tests)."""
    def __init__(self, cache_dir, base=BASE, get=_get):
        self.cache = Path(cache_dir) / "tle.json"
        self.base, self.get = base, get
        self.lock = threading.Lock(); self.stop_event = threading.Event()
        self.groups = {}        # Gruppe: {"text", "fetched" (ms)}
        self.errors = {}
        self.next = {g: 0 for g in GROUPS}; self.last_request = 0

    def start(self):
        """Dienst im Hintergrund-Thread starten."""
        threading.Thread(target=self.run, daemon=True, name="celestrak-tle").start()

    def snapshot(self):
        """Stand für das Dashboard: Texte je Gruppe, ältester Abrufzeitpunkt, Fehler."""
        with self.lock:
            g, e = dict(self.groups), dict(self.errors)
        fetched = min((v["fetched"] for v in g.values()), default=None)
        return {"source": "CelesTrak", "fetched": fetched, "groups": {k: v["text"] for k, v in g.items()},
                "error": "; ".join(f"{k}: {v}" for k, v in e.items()) or None}

    def load_cache(self):
        """Zwischenspeicher laden und die nächsten Abrufe nach dem Alter der Daten planen."""
        try:
            d = json.loads(self.cache.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        now = time.time()
        for k, v in (d or {}).items():
            if k in GROUPS and isinstance(v, dict) and valid_tle(v.get("text", "")):
                self.groups[k] = v
                age = now - (v.get("fetched") or 0) / 1000
                self.next[k] = time.monotonic() + max(0, EVERY - age)

    def save(self):
        """Zwischenspeicher atomar schreiben."""
        with self.lock:
            d = dict(self.groups)
        try:
            self.cache.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.cache.with_suffix(".tmp"); tmp.write_text(json.dumps(d), encoding="utf-8"); tmp.replace(self.cache)
        except OSError as exc:
            log.warning("could not save TLE cache: %s", exc)

    def step(self):
        """Höchstens eine fällige Anfrage; Fehler -> neuer Versuch nach RETRY s."""
        now = time.monotonic()
        if now - self.last_request < SPACING:
            return
        due = [g for g in GROUPS if now >= self.next[g]]
        if not due:
            return
        g = due[0]; self.last_request = now
        try:
            text = self.get(self.base + g)
            if not valid_tle(text):
                raise ValueError("no element sets in the answer")
            with self.lock:
                self.groups[g] = {"text": text, "fetched": int(time.time() * 1000)}; self.errors.pop(g, None)
            self.next[g] = time.monotonic() + EVERY
            log.info("CelesTrak %s: %d element sets", g, text.count("\n1 ") + text.startswith("1 "))
            self.save()
        except Exception as exc:
            with self.lock:
                self.errors[g] = str(exc)
            self.next[g] = time.monotonic() + RETRY
            log.warning("CelesTrak %s failed: %s", g, exc)

    def run(self):
        """Thread-Schleife: Cache laden, dann alle 5 s step()."""
        self.load_cache()
        while not self.stop_event.is_set():
            self.step()
            self.stop_event.wait(5)
