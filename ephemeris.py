"""Unabhängige ISS-Bahnvorhersage von NASA/JSC (OEM). Nur Standardbibliothek; km, km/s, UTC.

Vorhersagen werden nie unter gemessenen Telemetrie-PUIs veröffentlicht. Das Original-OEM wird
zwischengespeichert, Position UND Geschwindigkeit werden mit kubischen Hermite-Polynomen
interpoliert, und abgelaufene Produkte, nicht unterstützte Bezugssysteme, große Lücken und
Segmentgrenzen werden abgelehnt.

OEM = CCSDS Orbit Ephemeris Message: Textdatei mit Zustandsvektoren (Zeit, x, y, z, vx, vy, vz)
im Inertialsystem EME2000/J2000, von NASA mehrmals täglich neu veröffentlicht.
"""
import bisect
from datetime import datetime, timezone
import logging
import math
from pathlib import Path
import threading
import time
import urllib.request

URL = "https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt"
MAX_AGE = 48 * 3600
REFRESH = 30 * 60
log = logging.getLogger("orbit")


def epoch(value):
    """ISO-Zeit (ohne Zone = UTC) -> Unix-Sekunden."""
    dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    return dt.replace(tzinfo=timezone.utc).timestamp() if dt.tzinfo is None else dt.timestamp()


def iso(value):
    """Unix-Sekunden -> ISO-Zeit in UTC."""
    return datetime.fromtimestamp(value, timezone.utc).isoformat(timespec="seconds")


class Ephemeris:
    """Ein eingelesenes OEM-Produkt: ein oder mehrere Segmente mit streng steigenden Stützstellen.
    Beim Einlesen wird geprüft: UTC, EME2000/J2000, Erde als Zentrum, ISS (1998-067-A),
    plausible Beträge von Position (6400-8000 km) und Geschwindigkeit (6-9 km/s).
    """
    def __init__(self, text):
        self.created = None
        self.segments = []
        meta, rows, in_meta = {}, [], False

        def finish():
            """Schließt das aktuelle Segment ab und prüft seine Metadaten und Stützstellen."""
            if not rows:
                return
            if meta.get("TIME_SYSTEM") != "UTC" or meta.get("REF_FRAME") not in ("EME2000", "J2000"):
                raise ValueError("OEM must use UTC and EME2000/J2000")
            if meta.get("CENTER_NAME") != "Earth" or meta.get("OBJECT_ID") != "1998-067-A":
                raise ValueError("OEM is not Earth-centered ISS data")
            times = [r[0] for r in rows]
            if len(rows) < 2 or any(b <= a for a, b in zip(times, times[1:])):
                raise ValueError("OEM samples must be strictly increasing")
            start = max(times[0], epoch(meta.get("USEABLE_START_TIME", meta["START_TIME"])))
            stop = min(times[-1], epoch(meta.get("USEABLE_STOP_TIME", meta["STOP_TIME"])))
            if start >= stop:
                raise ValueError("Empty OEM validity range")
            self.segments.append((start, stop, times, list(rows)))

        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("COMMENT"):
                continue
            if line == "META_START":
                finish()
                meta, rows, in_meta = {}, [], True
            elif line == "META_STOP":
                in_meta = False
            elif "=" in line:
                key, value = (s.strip() for s in line.split("=", 1))
                if key == "CREATION_DATE":
                    self.created = epoch(value)
                if in_meta:
                    meta[key] = value
            elif line[:4].isdigit() and not in_meta:
                parts = line.split()
                if len(parts) != 7:
                    raise ValueError("Expected time and six OEM state components")
                row = [epoch(parts[0])] + [float(x) for x in parts[1:]]
                if not all(math.isfinite(x) for x in row):
                    raise ValueError("Non-finite OEM sample")
                if not 6400 < math.hypot(*row[1:4]) < 8000 or not 6 < math.hypot(*row[4:7]) < 9:
                    raise ValueError("Unexpected ISS state or units (expected km and km/s)")
                rows.append(row)
        finish()
        if self.created is None or not self.segments:
            raise ValueError("Missing OEM creation date or samples")
        self.start = min(s[0] for s in self.segments)
        self.stop = max(s[1] for s in self.segments)

    def state(self, now):
        """Zustand [x, y, z, vx, vy, vz] zum Zeitpunkt now (Unix-s) per Hermite-Interpolation.
        Wirft ValueError, wenn das Produkt zu alt ist, now außerhalb liegt oder die Lücke > 10 min ist.
        """
        if not -300 <= now - self.created <= MAX_AGE:
            raise ValueError("NASA trajectory product is older than 48 hours or future-dated")
        for start, stop, times, rows in self.segments:
            if not start <= now <= stop:
                continue
            i = min(max(bisect.bisect_right(times, now) - 1, 0), len(rows) - 2)
            a, b = rows[i:i + 2]
            dt = b[0] - a[0]
            if dt > 600:
                raise ValueError("NASA trajectory has a sample gap larger than 10 minutes")
            u = (now - a[0]) / dt
            pos, vel = [], []
            for k in range(1, 4):
                pos.append((2*u**3 - 3*u*u + 1)*a[k] + (u**3 - 2*u*u + u)*dt*a[k+3]
                           + (-2*u**3 + 3*u*u)*b[k] + (u**3 - u*u)*dt*b[k+3])
                vel.append((6*u*u - 6*u)/dt*a[k] + (3*u*u - 4*u + 1)*a[k+3]
                           + (-6*u*u + 6*u)/dt*b[k] + (3*u*u - 2*u)*b[k+3])
            return pos + vel
        raise ValueError("Current time is outside the NASA trajectory validity range")


class OrbitService:
    """Hintergrunddienst: holt alle 30 min das aktuelle OEM (nach Fehlern nach 60 s erneut),
    speichert es in cache/iss_oem.txt und meldet alle 5 s einen Schnappschuss an publish.
    """
    def __init__(self, cache_dir, publish=None):
        self.cache = Path(cache_dir) / "iss_oem.txt"
        self.publish = publish
        self.product = None
        self.error = None
        self.fetched = None
        self.cached = True
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = None

    def start(self):
        # Lesen von Platte und HTTPS-Abrufe bleiben außerhalb des Launcher-/UI-Threads.
        """Dienst im Hintergrund-Thread starten."""
        self.thread = threading.Thread(target=self.run, daemon=True, name="nasa-orbit")
        self.thread.start()

    def snapshot(self, now=None):
        """Aktuelle Vorhersage als Dict für /__orbit bzw. das MQTT-Topic iss/orbit."""
        now = time.time() if now is None else now
        with self.lock:
            product, error, fetched, cached = self.product, self.error, self.fetched, self.cached
        result = dict(source="NASA_OEM", kind="predicted", frame="EME2000", units="km,km/s",
                      epoch=now, rx=now, available=False, url=URL, cached=cached,
                      fetched=fetched, error=error)
        if product:
            result.update(created=product.created, valid_from=product.start, valid_to=product.stop)
            try:
                result.update(state=product.state(now), available=True)
            except ValueError as exc:
                result["error"] = str(exc)
        else:
            result["error"] = error or "Waiting for NASA trajectory download"
        return result

    def refresh(self):
        """OEM herunterladen, prüfen und übernehmen; danach auf die Platte schreiben."""
        req = urllib.request.Request(URL, headers={"User-Agent": "ISS-Shadow/0.5", "Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read(5_000_001)
        if len(raw) > 5_000_000:
            raise ValueError("OEM exceeds size limit")
        product = Ephemeris(raw.decode("utf-8-sig"))
        product.state(time.time())  # Prüfen, bevor ein brauchbarer Cache ersetzt wird.
        with self.lock:
            self.product, self.fetched, self.cached, self.error = product, time.time(), False, None
        try:
            self.cache.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.cache.with_suffix(".tmp")
            tmp.write_bytes(raw)
            tmp.replace(self.cache)
        except OSError as exc:
            log.warning("Could not save orbit cache: %s", exc)
        log.info("NASA OEM ready: created %s, valid %s to %s", iso(product.created), iso(product.start), iso(product.stop))

    def run(self):
        """Thread-Schleife: Cache laden, regelmäßig abrufen und veröffentlichen."""
        try:
            self.product = Ephemeris(self.cache.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError, KeyError):
            pass
        next_fetch = 0
        while not self.stop_event.is_set():
            if time.monotonic() >= next_fetch:
                try:
                    self.refresh()
                    next_fetch = time.monotonic() + REFRESH
                except Exception as exc:
                    with self.lock:
                        self.error, self.cached = str(exc), True
                    log.warning("NASA OEM refresh failed: %s", exc)
                    next_fetch = time.monotonic() + 60
            if self.publish:
                try:
                    self.publish(self.snapshot())
                except Exception:
                    log.exception("Orbit publication failed")
            self.stop_event.wait(5)

    def stop(self):
        """Dienst anhalten."""
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=1)
