"""Bahnelemente von CelesTrak für das Nahbereichsradar (v1.19, OMM/JSON seit v1.26).

Holt die Gruppen „stations“ (Stationen, angedockte und frei fliegende Fahrzeuge, ISS-Trümmer) und
„last-30-days“ (neu gestartete Objekte, z. B. ein Fahrzeug im Anflug) und liefert sie dem Dashboard als
/__tle. Ausgewertet (SGP4) wird im Browser (radar.mjs).

Format: OMM als JSON (FORMAT=json). Das alte TLE-Textformat kann nur fünfstellige Katalognummern
darstellen; seit Mitte 2026 vergibt der Katalog sechsstellige Nummern (ab 100000), und neue Objekte
fehlen im TLE-Format ganz. Gerade die Gruppe „last-30-days“ war dadurch leer bzw. lückenhaft.

Abrufregeln (https://celestrak.org/usage-policy.php): CelesTrak aktualisiert etwa alle 2 h und bittet,
nach jeder Antwort außer HTTP 200 sofort aufzuhören; wer Fehlerantworten ignoriert, landet in der
Firewall. Daher: jede Gruppe höchstens alle 2 h; nach einem HTTP-Fehler (403, 404, 5xx …) ruht der
ganze Dienst 2 h; bei Netzfehlern (kein Kontakt zum Server) neuer Versuch nach 15 min, nach drei
Fehlschlägen in Folge ebenfalls erst nach 2 h. Die letzte gute Antwort bleibt auf der Platte
(cache/gp.json), auch über Neustarts hinweg.
"""
import json, logging, os, threading, time, urllib.error, urllib.request
from pathlib import Path

log = logging.getLogger("tle")
BASE = os.environ.get("ISS_TLE_BASE", "https://celestrak.org/NORAD/elements/gp.php?FORMAT=json&GROUP=")
GROUPS = ["stations", "last-30-days"]
EVERY = 7200            # s zwischen zwei Abrufen einer Gruppe
RETRY = 900             # s nach einem Netzfehler
HTTP_PAUSE = 7200       # s Pause des ganzen Dienstes nach einer HTTP-Fehlerantwort
MAX_NET_FAILS = 3       # Netzfehler in Folge, danach HTTP_PAUSE
SPACING = 10            # s zwischen zwei Anfragen
MAX_BYTES = 8_000_000
OMM_KEYS = ("NORAD_CAT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION")


def _get(url, timeout=20):
    """Text von url holen (mit User-Agent, Zeitlimit und Größenbegrenzung)."""
    req = urllib.request.Request(url, headers={"User-Agent": "ISS-Shadow (student project)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("response too large")
    return raw.decode("utf-8", "replace")


def parse_omm(text):
    """CelesTrak-Antwort -> Liste von OMM-Datensätzen (dict). „No GP data found“ = leere Gruppe.
    Andere Antworten (HTML-Fehlerseite, TLE-Text) -> ValueError."""
    t = (text or "").strip()
    if not t or t.lower().startswith("no gp data"):
        return []
    try:
        d = json.loads(t)
    except ValueError:
        raise ValueError("unexpected answer: " + t[:80].replace("\n", " "))
    if not isinstance(d, list):
        raise ValueError("unexpected answer (not a list)")
    return [o for o in d if isinstance(o, dict) and all(k in o for k in OMM_KEYS)]


class TleService:
    """Hintergrunddienst: ruft die Gruppen zeitversetzt ab und liefert mit snapshot() den Stand.
    get ist austauschbar (Tests)."""
    def __init__(self, cache_dir, base=BASE, get=_get):
        self.cache = Path(cache_dir) / "gp.json"
        self.base, self.get = base, get
        self.lock = threading.Lock(); self.stop_event = threading.Event()
        self.groups = {}        # Gruppe: {"omm": [...], "fetched" (ms)}
        self.errors = {}
        self.next = {g: 0 for g in GROUPS}; self.last_request = 0
        self.paused_until = 0; self.net_fails = 0

    def start(self):
        """Dienst im Hintergrund-Thread starten."""
        threading.Thread(target=self.run, daemon=True, name="celestrak-gp").start()

    def snapshot(self):
        """Stand für das Dashboard: OMM-Listen je Gruppe, ältester Abrufzeitpunkt, Fehler."""
        with self.lock:
            g, e = dict(self.groups), dict(self.errors)
        fetched = min((v["fetched"] for v in g.values()), default=None)
        return {"source": "CelesTrak", "format": "omm", "fetched": fetched, "groups": {k: v["omm"] for k, v in g.items()},
                "error": "; ".join(f"{k}: {v}" for k, v in e.items()) or None}

    def load_cache(self):
        """Zwischenspeicher laden und die nächsten Abrufe nach dem Alter der Daten planen."""
        try:
            d = json.loads(self.cache.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        now = time.time()
        for k, v in (d or {}).items():
            if k in GROUPS and isinstance(v, dict) and isinstance(v.get("omm"), list):
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
            log.warning("could not save GP cache: %s", exc)

    def _fail(self, g, msg, delay):
        with self.lock:
            self.errors[g] = msg
        self.next[g] = max(self.next[g], time.monotonic() + delay)

    def step(self):
        """Höchstens eine fällige Anfrage, mit den Abrufregeln oben."""
        now = time.monotonic()
        if now - self.last_request < SPACING or now < self.paused_until:
            return
        due = [g for g in GROUPS if now >= self.next[g]]
        if not due:
            return
        g = due[0]; self.last_request = now
        try:
            text = self.get(self.base + g)
        except urllib.error.HTTPError as exc:
            # CelesTrak will nach jeder Fehlerantwort Ruhe: alle Gruppen pausieren
            self.paused_until = time.monotonic() + HTTP_PAUSE
            self._fail(g, f"HTTP {exc.code} {exc.reason}, next try in {HTTP_PAUSE // 3600} h", HTTP_PAUSE)
            log.warning("CelesTrak %s: HTTP %s %s, pausing all requests for %d h", g, exc.code, exc.reason, HTTP_PAUSE // 3600)
            return
        except Exception as exc:
            self.net_fails += 1
            delay = HTTP_PAUSE if self.net_fails >= MAX_NET_FAILS else RETRY
            self._fail(g, f"{exc}, next try in {delay // 60} min", delay)
            log.warning("CelesTrak %s failed (%d in a row): %s", g, self.net_fails, exc)
            return
        self.net_fails = 0
        try:
            omm = parse_omm(text)
        except ValueError as exc:
            self._fail(g, str(exc), EVERY)
            log.warning("CelesTrak %s: %s", g, exc)
            return
        with self.lock:
            self.groups[g] = {"omm": omm, "fetched": int(time.time() * 1000)}; self.errors.pop(g, None)
        self.next[g] = time.monotonic() + EVERY
        log.info("CelesTrak %s: %d element sets", g, len(omm))
        self.save()

    def run(self):
        """Thread-Schleife: Cache laden, dann alle 5 s step()."""
        self.load_cache()
        while not self.stop_event.is_set():
            self.step()
            self.stop_event.wait(5)
