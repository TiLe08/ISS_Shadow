#!/usr/bin/env python3
"""Nachgebildeter ISSLive-Lightstreamer-Server (Teilmenge von TLCP 2.5.0) für Verbindungstests
und Vorführungen ohne Netz.

Verhält sich, soweit Dashboard und bridge.py es sehen, wie push.lightstreamer.com / ISSLIVE:
HTTP create_session.txt, WebSocket bind/create/control, MERGE-Abonnements (ein Schnappschuss
pro Kanal, danach nur Änderungen), TIME_000001 tickt jede Sekunde mit der abweichenden
Zeitstempel-Epoche vom 14.10.2026, dazu die Fehlerbilder des echten Feeds.

Start:     python tests/mock_isslive.py 8090 tests/live_sample_20261014.json   (braucht: pip install aiohttp)
Nutzung:   ISS_LS_SERVER=http://127.0.0.1:8090 vor dem Launcher setzen und/oder die URL im Dashboard
           unter Setup -> Lightstreamer für den direkten LIVE-Modus eintragen.
Steuerung: GET http://127.0.0.1:8090/admin/<cmd>
           freeze    Sitzung bleibt offen (Probes), aber keine Daten, wie ein verstummtes ISSLive
           silent    keine Daten und keine Probes (tote Verbindung)      thaw   zurück zum Normalbetrieb
           drop      alle Verbindungen schließen                         down?s=N  N s lang Verbindungen ablehnen
           skew?s=N  Feed-Uhr N s neben der PC-Uhr                       epoch?h=H Verschiebung der Epoche (0 = Standard)
           set?item=PUI&v=WERT  einen Telemetriewert ändern
           stats
"""
import asyncio, json, math, os, random, sys, time, urllib.parse
from datetime import datetime, timezone
from aiohttp import web, WSMsgType

DEBUG = os.environ.get('MOCK_DEBUG')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
EPOCH_SHIFT_H = 5838.0          # Feed-Stunden = wahre Stunden − Verschiebung (abweichende Epoche)
ST = {"skew_s": 0.0, "freeze": False, "silent": False, "down_until": 0, "sessions": {}, "n_sessions": 0, "updates": 0, "creates": 0}

def hoy():
    """Stunden seit 1. Januar UTC."""
    n = datetime.now(timezone.utc); return (n - datetime(n.year, 1, 1, tzinfo=timezone.utc)).total_seconds() / 3600

DATA = {}        # Kanal -> {"TimeStamp","Value","Status.Class"}
def setv(item, value, ts=None):
    """Wert eines Kanals setzen; True, wenn er sich geändert hat (ts = Feed-Zeitstempel)."""
    ts = hoy() - EPOCH_SHIFT_H + ST["skew_s"] / 3600 if ts is None else ts
    cur = DATA.get(item)
    if cur and cur["Value"] == str(value): return False
    DATA[item] = {"TimeStamp": f"{ts:.6f}", "Value": str(value), "Status.Class": "24"}
    return True

NOT_SERVED = [f"{s}{n}" for s in ("S4", "S6", "P4", "P6") for n in ("000002", "000005")]   # echter Feed: Wert 0, Zeitstempel 0

def seed():
    """Anfangsbestand: Werte aus der Probe-Datei (seit Stunden unverändert), Uhr und nicht veröffentlichte Kanäle.
    """
    base = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {}
    old = hoy() - EPOCH_SHIFT_H - 3.0          # seit Stunden unverändert
    for k, v in base.items():
        if isinstance(v, (int, float)): setv(k, v, old)
    setv("TIME_000001", f"{hoy()-EPOCH_SHIFT_H+ST['skew_s']/3600:.6f}")
    for p in NOT_SERVED: DATA[p] = {"TimeStamp": "0", "Value": "0", "Status.Class": "24"}

def tick():
    """Ändert jede Sekunde eine realistische Teilmenge; gibt die geänderten Kanäle zurück."""
    t = time.time(); ch = []
    if setv("TIME_000001", f"{hoy()-EPOCH_SHIFT_H+ST['skew_s']/3600:.6f}"): ch.append("TIME_000001")
    # Bahn: kreisförmig 418 km, 51,6°, km und m/s wie im Feed
    a = 6378.137 + 418; w = math.sqrt(398600.4418 / a**3); u = w * t; inc = math.radians(51.64); raan = 1.0
    cu, su, ci, si, cr, sr = math.cos(u), math.sin(u), math.cos(inc), math.sin(inc), math.cos(raan), math.sin(raan)
    r = [a*(cr*cu - sr*su*ci), a*(sr*cu + cr*su*ci), a*su*si]; v = a*w*1000
    vv = [v*(-cr*su - sr*cu*ci), v*(-sr*su + cr*cu*ci), v*cu*si]
    if int(t) % 2 == 0:
        for i, k in enumerate(["32", "33", "34"]):
            if setv("USLAB0000" + k, r[i]): ch.append("USLAB0000" + k)
        for i, k in enumerate(["35", "36", "37"]):
            if setv("USLAB0000" + k, vv[i]): ch.append("USLAB0000" + k)
    for k, base in (("USLAB000018", .9959), ("USLAB000019", .0112), ("USLAB000020", -.0698), ("USLAB000021", -.0553)):
        if random.random() < .5 and setv(k, round(base + random.uniform(-2e-4, 2e-4), 6)): ch.append(k)
    for k in ("USLAB000025", "USLAB000026", "USLAB000027", "S4000001", "S6000004", "P4000001", "NODE3000005"):
        if random.random() < .3 and setv(k, round(random.uniform(-1, 1) + (160 if k[0] in "SP" else 0), 3)): ch.append(k)
    return ch

def enc(v):
    """Wertkodierung von TLCP: None = '#', leer = '$', sonst URL-kodiert."""
    if v is None: return "#"
    if v == "": return "$"
    return urllib.parse.quote(v, safe="")

class Session:
    """Eine Lightstreamer-Sitzung mit ihren Abonnements und den zuletzt gesendeten Werten."""
    def __init__(self, sid): self.sid = sid; self.ws = None; self.subs = {}; self.prev = {}

    async def send(self, *lines):
        """Zeilen über den WebSocket senden."""
        if self.ws is None or self.ws.closed: return
        if DEBUG and not lines[0].startswith('U,'): print('>>', ' | '.join(lines)[:200], flush=True)
        try: await self.ws.send_str("\r\n".join(lines) + "\r\n")
        except Exception: pass

    async def push(self, items):
        """Geänderte Kanäle an alle passenden Abos senden (unveränderte Felder leer, wie TLCP)."""
        for sid, (names, fields) in list(self.subs.items()):
            for i, name in enumerate(names):
                if name not in items or name not in DATA: continue
                vals = [DATA[name].get(f) for f in fields]
                key = (sid, i); prev = self.prev.get(key)
                out = [("" if prev is not None and prev[j] == x else enc(x)) for j, x in enumerate(vals)]
                self.prev[key] = vals
                await self.send(f"U,{sid},{i+1},{'|'.join(out)}"); ST["updates"] += 1

    async def control(self, p):
        """Steueranfrage: Abo hinzufügen (mit Schnappschuss) oder löschen."""
        op = p.get("LS_op"); rid = p.get("LS_reqId", "0")
        if op == "add":
            sid = int(p["LS_subId"]); names = p.get("LS_group", "").split(" "); fields = p.get("LS_schema", "").split(" ")
            await self.send(f"REQOK,{rid}", f"SUBOK,{sid},{len(names)},{len(fields)}")
            self.subs[sid] = (names, fields)
            for i, n in enumerate(names):
                if n in DATA:
                    vals = [DATA[n].get(f) for f in fields]; self.prev[(sid, i)] = vals
                    await self.send(f"U,{sid},{i+1},{'|'.join(enc(x) for x in vals)}")   # MERGE-Schnappschuss: kein EOS
        elif op == "delete":
            sid = int(p["LS_subId"]); self.subs.pop(sid, None); await self.send(f"REQOK,{rid}", f"UNSUB,{sid}")
        else:
            await self.send(f"REQOK,{rid}")

# Formular-Rumpf zerlegen.
def parse(body): return dict(urllib.parse.parse_qsl(body, keep_blank_values=True))

def new_session():
    """Neue Sitzung anlegen."""
    ST["n_sessions"] += 1; sid = f"Smock{ST['n_sessions']}x{random.randrange(10**6)}"
    s = Session(sid); ST["sessions"][sid] = s; return s

async def create(req):
    """HTTP create_session.txt: Sitzung anlegen (oder 503 während 'down')."""
    ST["creates"] += 1
    if time.time() < ST["down_until"]: return web.Response(status=503, text="down")
    body = await req.text(); p = parse(body)
    if p.get("LS_adapter_set") != "ISSLIVE": return web.Response(text="CONERR,2,Requested Adapter Set not available\r\n")
    s = new_session()
    return web.Response(text=f"CONOK,{s.sid},50000,5000,*\r\nSERVNAME,Mock\r\nCLIENTIP,127.0.0.1\r\nLOOP,0\r\n", content_type="text/plain")

async def wshandler(req):
    """WebSocket-Endpunkt: bind_session, create_session und control über TLCP."""
    if time.time() < ST["down_until"]: return web.Response(status=503)
    ws = web.WebSocketResponse(protocols=("TLCP-2.5.0.lightstreamer.com",), heartbeat=None); await ws.prepare(req)
    sess = None
    async for msg in ws:
        if msg.type != WSMsgType.TEXT: continue
        if DEBUG: print('<<', msg.data[:300].replace('\r\n',' | '), flush=True)
        for block in [msg.data]:
            lines = block.split("\r\n"); verb = lines[0].strip()
            if verb == "wsok": await ws.send_str("WSOK\r\n"); continue
            if verb in ("bind_session", "create_session"):
                p = parse(lines[1] if len(lines) > 1 else "")
                if verb == "create_session":
                    if p.get("LS_adapter_set") != "ISSLIVE": await ws.send_str("CONERR,2,no adapter\r\n"); continue
                    sess = new_session()
                else:
                    sess = ST["sessions"].get(p.get("LS_session"))
                    if not sess: await ws.send_str("CONERR,20,Session not found\r\n"); await ws.close(); break
                sess.ws = ws
                ka = p.get("LS_keepalive_millis", "5000")
                await sess.send(f"CONOK,{sess.sid},50000,{ka},*", "SERVNAME,Mock", "CLIENTIP,127.0.0.1", "CONS,unlimited")
                continue
            if verb == "control" and sess:
                for l in lines[1:]:
                    if l.strip(): await sess.control(parse(l))
                continue
            if verb == "heartbeat": continue
            if verb == "msg": continue
    if sess and sess.ws is ws: sess.ws = None
    return ws

async def admin(req):
    """Steuer-Endpunkt /admin/<cmd> (siehe Modulbeschreibung)."""
    cmd = req.match_info["cmd"]
    if cmd == "freeze": ST["freeze"] = True
    elif cmd == "thaw": ST["freeze"] = False; ST["silent"] = False
    elif cmd == "silent": ST["silent"] = True
    elif cmd == "drop":
        for s in list(ST["sessions"].values()):
            if s.ws: await s.ws.close()
        ST["sessions"].clear()
    elif cmd == "skew": ST["skew_s"] = float(req.query.get("s", "0"))
    elif cmd == "epoch":
        global EPOCH_SHIFT_H; EPOCH_SHIFT_H = float(req.query.get("h", "0"))
    elif cmd == "set":                       # set?item=S0000008&v=5 : einen Wert ändern (als Update gesendet)
        item = req.query["item"]
        if setv(item, req.query["v"]):
            for sess in list(ST["sessions"].values()): await sess.push({item})
    elif cmd == "down": ST["down_until"] = time.time() + float(req.query.get("s", "20"))
    live = sum(1 for s in ST["sessions"].values() if s.ws and not s.ws.closed)
    return web.json_response({"freeze": ST["freeze"], "silent": ST["silent"], "live_ws": live, "sessions": ST["n_sessions"], "creates": ST["creates"], "updates": ST["updates"], "subs": sum(len(s.subs) for s in ST["sessions"].values())})

async def loop():
    """Jede Sekunde: Werte ändern und senden; ohne Änderungen alle 5 s ein PROBE."""
    k = 0
    while True:
        await asyncio.sleep(1); k += 1
        if ST["silent"]: continue
        if ST["freeze"]:
            items = []
        else:
            items = tick()
        for s in list(ST["sessions"].values()):
            if items: await s.push(set(items))
            elif k % 5 == 0: await s.send("PROBE")

async def main():
    """Server starten (CORS für den Browser) und die Schleife laufen lassen."""
    seed()
    @web.middleware
    async def cors(req, handler):
        """CORS-Kopfzeilen, damit der Browser direkt verbinden darf."""
        if req.method == "OPTIONS": resp = web.Response()
        else: resp = await handler(req)
        if not isinstance(resp, web.WebSocketResponse):
            resp.headers["Access-Control-Allow-Origin"] = req.headers.get("Origin", "*")
            resp.headers["Access-Control-Allow-Credentials"] = "true"
            resp.headers["Access-Control-Allow-Headers"] = "*"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return resp
    app = web.Application(middlewares=[cors])
    app.router.add_route("OPTIONS", "/{tail:.*}", lambda r: web.Response())
    app.router.add_post("/lightstreamer/create_session.txt", create)
    app.router.add_get("/lightstreamer", wshandler)
    app.router.add_get("/admin/{cmd}", admin)
    r = web.AppRunner(app); await r.setup(); await web.TCPSite(r, "127.0.0.1", PORT).start()
    print("mock ISSLive on", PORT, flush=True)
    await loop()

asyncio.run(main())
