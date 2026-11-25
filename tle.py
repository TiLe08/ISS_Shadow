"""Bahnelemente von CelesTrak für das Nahbereichsradar (v1.19, OMM/JSON seit v1.26, Ersatzquelle SatNOGS seit v1.27).

Holt die Gruppen „stations“ (Stationen, angedockte und frei fliegende Fahrzeuge, ISS-Trümmer) und
„last-30-days“ (neu gestartete Objekte, z. B. ein Fahrzeug im Anflug) und liefert sie dem Dashboard als
/__tle. Ausgewertet (SGP4) wird im Browser (radar.mjs).

Format: OMM als JSON (FORMAT=json). Das alte TLE-Textformat kann nur fünfstellige Katalognummern
darstellen; seit Mitte 2026 vergibt der Katalog sechsstellige Nummern (ab 100000), und neue Objekte
fehlen im TLE-Format ganz. Gerade die Gruppe „last-30-days“ war dadurch leer bzw. lückenhaft.

Abrufregeln (https://celestrak.org/usage-policy.php): CelesTrak aktualisiert etwa alle 2 h und bittet,
nach Fehlerantworten aufzuhören und höchstens 2-3 Mal neu zu versuchen; wer Fehlerantworten ignoriert,
landet in der Firewall. Daher: jede Gruppe höchstens alle 2 h; nach HTTP 403/404 ruht CelesTrak 2 h; nach
HTTP 5xx (Server überlastet oder ausgefallen, z. B. 503 am 25.11.) und nach Netzfehlern neue Versuche
nach 15, 30 und 60 min, danach alle 2 h. Die letzte gute Antwort bleibt auf der Platte (cache/gp.json),
auch über Neustarts hinweg.

Ersatzquelle (v1.27): Hat CelesTrak keine (oder nur über einen Tag alte) Daten der Gruppe „stations“,
holt der Dienst höchstens alle 2 h die Bahnelemente der SatNOGS-Datenbank (db.satnogs.org, Quelle
Space-Track, etwa 1700 Objekte mit ISS und Nauka, aber ohne Dragon, Progress und Sojus). Sie erscheinen
als Gruppe „satnogs“ (TLE-Zeilen, sechsstellige Nummern im Alpha-5-Format).
"""
import json, logging, os, threading, time, urllib.error, urllib.request
from pathlib import Path

log = logging.getLogger("tle")
BASE = os.environ.get("ISS_TLE_BASE", "https://celestrak.org/NORAD/elements/gp.php?FORMAT=json&GROUP=")
GROUPS = ["stations", "last-30-days"]
EVERY = 7200            # s zwischen zwei Abrufen einer Gruppe
RETRY = 900             # s nach einem Netzfehler
HTTP_PAUSE = 7200       # s Pause des ganzen Dienstes nach einer HTTP-Fehlerantwort
SPACING = 10            # s zwischen zwei Anfragen
BACKOFF = [900, 1800, 3600]   # s nach dem 1., 2., 3. Fehler in Folge (5xx, Netz); danach HTTP_PAUSE
SATNOGS = os.environ.get("ISS_SATNOGS_URL", "https://db.satnogs.org/api/tle/?format=json")
FALLBACK_AFTER = 86400  # s: so alt dürfen die CelesTrak-Daten „stations“ sein, bevor SatNOGS einspringt
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


def _name(t):
    t = str(t).strip()
    return t[2:].strip() if t.startswith("0 ") else t


def parse_satnogs(text):
    """SatNOGS-Antwort [{tle0, tle1, tle2, norad_cat_id}] -> [{OBJECT_NAME, NORAD_CAT_ID, TLE_LINE1, TLE_LINE2}]."""
    try:
        d = json.loads(text or "")
    except ValueError:
        raise ValueError("unexpected answer from SatNOGS")
    if not isinstance(d, list):
        raise ValueError("unexpected answer from SatNOGS (not a list)")
    out = []
    for o in d:
        if isinstance(o, dict) and str(o.get("tle1", "")).startswith("1 ") and str(o.get("tle2", "")).startswith("2 ") and o.get("norad_cat_id"):
            out.append({"OBJECT_NAME": _name(o.get("tle0") or o["norad_cat_id"]), "NORAD_CAT_ID": int(o["norad_cat_id"]),
                        "TLE_LINE1": o["tle1"], "TLE_LINE2": o["tle2"]})
    return out


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


def _fmt(s):
    return f"{s // 3600} h" if s >= 3600 and s % 3600 == 0 else f"{s // 60} min"


class TleService:
    """Hintergrunddienst: ruft die Gruppen zeitversetzt ab und liefert mit snapshot() den Stand.
    get ist austauschbar (Tests)."""
    def __init__(self, cache_dir, base=BASE, get=_get):
        self.cache = Path(cache_dir) / "gp.json"
        self.base, self.get = base, get
        self.lock = threading.Lock(); self.stop_event = threading.Event()
        self.groups = {}        # Gruppe: {"omm": [...], "fetched" (ms)}
        self.errors = {}
        self.next = {g: 0 for g in GROUPS + ["satnogs"]}; self.last_request = 0
        self.paused_until = 0; self.fails = 0       # CelesTrak: Pause und Fehler in Folge
        self.satnogs, self.satnogs_fails = SATNOGS, 0

    def start(self):
        """Dienst im Hintergrund-Thread starten."""
        threading.Thread(target=self.run, daemon=True, name="celestrak-gp").start()

    def snapshot(self):
        """Stand für das Dashboard: OMM-Listen je Gruppe, ältester Abrufzeitpunkt, Fehler."""
        with self.lock:
            g, e = dict(self.groups), dict(self.errors)
        fetched = min((v["fetched"] for v in g.values()), default=None)
        src = "CelesTrak" if any(k in g for k in GROUPS) else "SatNOGS" if g else "CelesTrak"
        if "satnogs" in g and src == "CelesTrak":
            src = "CelesTrak + SatNOGS"
        return {"source": src, "format": "omm", "fetched": fetched, "groups": {k: v["omm"] for k, v in g.items()},
                "error": "; ".join(f"{k}: {v}" for k, v in e.items()) or None}

    def load_cache(self):
        """Zwischenspeicher laden und die nächsten Abrufe nach dem Alter der Daten planen."""
        try:
            d = json.loads(self.cache.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        now = time.time()
        for k, v in (d or {}).items():
            if k in GROUPS + ["satnogs"] and isinstance(v, dict) and isinstance(v.get("omm"), list):
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

    def _need_fallback(self):
        st = self.groups.get("stations")
        return not st or time.time() - st["fetched"] / 1000 > FALLBACK_AFTER

    def step(self):
        """Höchstens eine fällige Anfrage, mit den Abrufregeln oben."""
        now = time.monotonic()
        if now - self.last_request < SPACING:
            return
        if now >= self.paused_until:
            due = [g for g in GROUPS if now >= self.next[g]]
            if due:
                self.last_request = now
                return self._celestrak(due[0])
        if self.satnogs and self._need_fallback() and now >= self.next["satnogs"] and self.errors:
            self.last_request = now
            self._satnogs()

    def _celestrak(self, g):
        try:
            text = self.get(self.base + g)
        except urllib.error.HTTPError as exc:
            if 500 <= exc.code < 600:                   # überlastet/ausgefallen: wenige, wachsende Abstände
                delay = BACKOFF[self.fails] if self.fails < len(BACKOFF) else HTTP_PAUSE
            else:                                       # 403, 404 …: CelesTrak will Ruhe
                delay = HTTP_PAUSE
            self.fails += 1
            self.paused_until = time.monotonic() + delay
            self._fail(g, f"HTTP {exc.code} {exc.reason}, next try in {_fmt(delay)}", delay)
            log.warning("CelesTrak %s: HTTP %s %s, pausing CelesTrak for %s", g, exc.code, exc.reason, _fmt(delay))
            return
        except Exception as exc:
            delay = BACKOFF[self.fails] if self.fails < len(BACKOFF) else HTTP_PAUSE
            self.fails += 1
            self.paused_until = time.monotonic() + delay
            self._fail(g, f"{exc}, next try in {_fmt(delay)}", delay)
            log.warning("CelesTrak %s failed (%d in a row): %s", g, self.fails, exc)
            return
        self.fails = 0
        try:
            omm = parse_omm(text)
        except ValueError as exc:
            self._fail(g, str(exc), EVERY)
            log.warning("CelesTrak %s: %s", g, exc)
            return
        with self.lock:
            self.groups[g] = {"omm": omm, "fetched": int(time.time() * 1000)}; self.errors.pop(g, None)
            if g == "stations":
                self.groups.pop("satnogs", None)        # CelesTrak wieder da: Ersatzquelle nicht mehr nötig
        self.next[g] = time.monotonic() + EVERY
        log.info("CelesTrak %s: %d element sets", g, len(omm))
        self.save()

    def _satnogs(self):
        try:
            omm = parse_satnogs(self.get(self.satnogs))
            if not omm:
                raise ValueError("no element sets from SatNOGS")
        except Exception as exc:
            delay = BACKOFF[self.satnogs_fails] if self.satnogs_fails < len(BACKOFF) else HTTP_PAUSE
            self.satnogs_fails += 1
            self.next["satnogs"] = time.monotonic() + delay
            log.warning("SatNOGS fallback failed: %s", exc)
            return
        self.satnogs_fails = 0
        with self.lock:
            self.groups["satnogs"] = {"omm": omm, "fetched": int(time.time() * 1000)}
        self.next["satnogs"] = time.monotonic() + EVERY
        log.info("SatNOGS fallback: %d element sets", len(omm))
        self.save()

    def run(self):
        """Thread-Schleife: Cache laden, dann alle 5 s step()."""
        self.load_cache()
        while not self.stop_event.is_set():
            self.step()
            self.stop_event.wait(5)
