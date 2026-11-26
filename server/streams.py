"""Laufende ISS-Livestreams auf YouTube ermitteln.

YouTube vergibt für Dauerstreams immer wieder neue Video-Kennungen; beendete Streams werden privat.
Ein fest eingetragener Link im Kamerafenster zeigt deshalb nach einiger Zeit „privates Video“. Dieser
Dienst liest die öffentlichen Stream-Seiten der Kanäle (ohne API-Schlüssel), sucht darin die gerade
laufenden Streams und liefert sie dem Dashboard als /__streams:

    {"fetched": <ms>, "streams": [{"channel": "NASA", "channelName": "nasa", "channelId": "UC...",
                                   "id": "<11 Zeichen>", "title": "..."}], "errors": {...}}

Quellen (v1.16, geprüft am 11.11.2026 im Browser):
  - Sen: zuerst die öffentliche Inhalts-Schnittstelle von sen.com (api.sen.com/content/public/live, JSON,
    Feld youtubeId; dieselbe Abfrage, mit der sen.com/live seinen Spieler füllt). Fällt sie aus, die
    YouTube-Stream-Seite des Kanals.
  - NASA: die YouTube-Stream-Seite des Kanals. NASA selbst verweist für die Stationsbilder nur auf YouTube
    (nasa.gov/live, „Space Station Views“); NASA+ hat keinen Dauerstream der Station.

Die Seiten sind kein stabiles Format. Schlägt das Auslesen fehl, bleibt die Liste leer und das
Kamerafenster nutzt die zuletzt geprüften Streams, die Kanal-Einbettung oder einen eigenen Link.
"""
import json, logging, re, threading, time, urllib.request

log = logging.getLogger("streams")
CHANNELS = {   # Kurzname: (Anzeigename, Stream-Seite)
    "nasa": ("NASA", "https://www.youtube.com/@NASA/streams"),
    "sen": ("Sen", "https://www.youtube.com/@sen/streams"),
}
CHANNEL_IDS = {"nasa": "UCLA_DiR1FfKNvjuUpBHmylQ", "sen": "UCkvW_7kp9LJrztmgA4q4bJQ"}
SEN_API = "https://api.sen.com/content/public/live"
RELEVANT = re.compile(r"space station|\biss\b|earth|spacetv|4k", re.I)
REFRESH = 1800          # s
RETRY = 300             # s nach einem Fehler


def _get(url, timeout=20):
    """Seite holen. Das Cookie beantwortet die Einwilligungsabfrage, auf die YouTube Anfragen aus der EU umleitet."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ISS-Shadow)", "Accept-Language": "en",
                                                "Cookie": "SOCS=CAI; CONSENT=YES+1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(6_000_001)
    if len(raw) > 6_000_000:
        raise ValueError("response too large")
    return raw.decode("utf-8", "replace")


def _text(node):
    """Titeltext aus den Varianten, die YouTube verwendet (runs, simpleText, content)."""
    if isinstance(node, str):
        return node
    if isinstance(node, dict):
        if "runs" in node:
            return "".join(r.get("text", "") for r in node["runs"])
        return node.get("simpleText") or node.get("content") or ""
    return ""


def _walk(node):
    """Alle Wörterbücher eines JSON-Baums durchlaufen."""
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


def live_streams(html):
    """Laufende Streams aus dem HTML einer Stream-Seite: [(id, titel)], dazu die Kanal-Kennung.

    Gelesen wird das eingebettete ytInitialData. Ein Eintrag gilt als laufend, wenn er als LIVE
    gekennzeichnet ist (Stil LIVE bzw. BADGE_STYLE_TYPE_LIVE_NOW) und keine Startzeit in der Zukunft trägt.
    """
    m = re.search(r"ytInitialData\s*=\s*(\{.*?\})\s*;\s*</script>", html, re.S)
    if not m:
        raise ValueError("no ytInitialData in page")
    data = json.loads(m.group(1))
    cid = re.search(r'"(?:externalId|browseId|channelId)":\s*"(UC[\w-]{22})"', html)
    out, seen = [], set()
    for d in _walk(data):
        r = d.get("videoRenderer") or d.get("gridVideoRenderer")
        if isinstance(r, dict) and r.get("videoId"):
            blob = json.dumps(r)
            live = '"style": "LIVE"' in blob or "BADGE_STYLE_TYPE_LIVE_NOW" in blob
            vid, title = r["videoId"], _text(r.get("title"))
        else:
            r = d.get("lockupViewModel")
            if not (isinstance(r, dict) and r.get("contentId") and r.get("contentType", "").endswith("VIDEO")):
                continue
            blob = json.dumps(r)
            live = "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE" in blob or "BADGE_STYLE_TYPE_LIVE_NOW" in blob
            vid = r["contentId"]
            title = _text((r.get("metadata", {}).get("lockupMetadataViewModel", {}) or {}).get("title"))
        if live and "upcomingEventData" not in blob and vid not in seen and re.fullmatch(r"[\w-]{11}", vid):
            seen.add(vid); out.append((vid, title))
    return out, (cid.group(1) if cid else "")


def sen_live(text):
    """Laufender Sen-Stream aus der Antwort von api.sen.com: [(id, titel)].

    Die Antwort beschreibt die Seite sen.com/live als Knoten; der Spielerknoten trägt die YouTube-Kennung
    unter content.video.youtubeId. Gesucht wird jedes Feld youtubeId, damit eine umgebaute Knotenliste
    nicht sofort bricht.
    """
    data = json.loads(text)
    if isinstance(data, dict) and data.get("success") is False:
        raise ValueError("sen api: success false")
    tags = ((data.get("data") or {}).get("metadata") or {}).get("tags") or {} if isinstance(data, dict) else {}
    title = tags.get("og:title") or "Sen 4K livestream from the ISS"
    out = []
    for d in _walk(data):
        vid = d.get("youtubeId")
        if isinstance(vid, str) and re.fullmatch(r"[\w-]{11}", vid) and vid not in [v for v, _ in out]:
            out.append((vid, title))
    if not out:
        raise ValueError("sen api: no youtubeId")
    return out


class StreamService:
    """Hält die Liste der laufenden Streams aktuell (Hintergrund-Thread) und liefert sie als snapshot()."""

    def __init__(self, get=_get):
        self.get = get; self.lock = threading.Lock()
        self.streams = []; self.errors = {}; self.fetched = 0

    def start(self):
        threading.Thread(target=self.run, daemon=True, name="streams").start()

    def snapshot(self):
        with self.lock:
            return {"fetched": int(self.fetched * 1000), "streams": list(self.streams), "errors": dict(self.errors)}

    def refresh(self):
        """Alle Kanäle einmal lesen. Gibt True zurück, wenn kein Kanal einen Fehler meldete."""
        streams, errors = [], {}
        for key, (name, url) in CHANNELS.items():
            try:
                found = None
                if key == "sen":
                    try:
                        found, cid = sen_live(self.get(SEN_API)), CHANNEL_IDS["sen"]
                    except Exception as e:  # noqa: BLE001 - dann die YouTube-Seite
                        log.info("sen api: %s", e)
                if found is None:
                    found, cid = live_streams(self.get(url))
                cid = cid or CHANNEL_IDS.get(key, "")
                # Streams zur Station zuerst; fremde Übertragungen des Kanals (Starts, Pressekonferenzen) danach.
                found.sort(key=lambda s: 0 if RELEVANT.search(s[1]) else 1)
                streams += [{"channel": name, "channelName": key, "channelId": cid, "id": vid, "title": title} for vid, title in found]
            except Exception as e:      # noqa: BLE001 - jede Ursache (Netz, Format) soll nur protokolliert werden
                errors[key] = str(e)[:200]
        with self.lock:
            if streams or not self.streams:
                self.streams = streams
            self.errors = errors; self.fetched = time.time()
        log.info("live streams: %d found%s", len(streams), f", errors: {errors}" if errors else "")
        return not errors

    def run(self):
        while True:
            ok = False
            try:
                ok = self.refresh()
            except Exception:           # noqa: BLE001
                log.exception("stream refresh failed")
            time.sleep(REFRESH if ok else RETRY)
