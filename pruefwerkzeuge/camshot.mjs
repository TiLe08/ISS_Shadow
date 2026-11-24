// camshot.mjs: nimmt die Zwillingsansicht einer Außenkamera auf (Node-Fassung von camshot.py, braucht nur Node,
// Playwright und die Projektpakete; läuft auch dort, wo Python-Playwright fehlt).
// Aufruf (im Projektordner, nach npm install):
//   node pruefwerkzeuge/camshot.mjs out.png <Kamera> <Schwenk> <Neigung> <Sichtfeld> [--roll R] [--tm telemetrie.json]
//        [--t0 2026-11-24T09:04:20Z] [--eval "JS-Ausdruck"]
// --tm: Telemetriewerte {"PUI": Wert} (z. B. aus dem MQTT-Broker gelesen), --t0: Uhrzeit der Seite,
// --eval: Ausdruck, der nach dem Laden in der Seite ausgewertet und ausgegeben wird (Prüfungen, Kalibrierversuche).
// Netzzugriffe außer auf den eigenen Webserver werden abgewiesen; three.js kommt aus node_modules.
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const APP = fileURLToPath(new URL('..', import.meta.url)), argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
const ROLL = +(opt('--roll') || 0), TMF = opt('--tm'), T0 = opt('--t0'), EVAL = opt('--eval');
const [OUT, CAM, PAN, TILT, FOV] = argv; if (!FOV) { console.error('Aufruf: camshot.mjs out.png Kamera Schwenk Neigung Sichtfeld [--roll R] [--tm datei] [--t0 Zeit] [--eval JS]'); process.exit(2); }
const TM = TMF ? JSON.parse(fs.readFileSync(TMF, 'utf8')) : {}, PORT = 8219, TYPES = { '.js': 'application/javascript', '.mjs': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(APP, decodeURIComponent(q.url.split(/[?#]/)[0]));
  if (!p.startsWith(APP) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }).listen(PORT);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const ctx = await b.newContext({ viewport: { width: 2400, height: 1500 } }), pg = await ctx.newPage();
  pg.on('pageerror', e => console.error('Seitenfehler:', e.message));
  await pg.route('**/*', r => { const u = r.request().url(), m = u.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/three@[\d.]+\/(.*)/);
    if (m) { const p = path.join(APP, 'node_modules/three', m[1]); return fs.existsSync(p) ? r.fulfill({ path: p, contentType: 'application/javascript' }) : r.fulfill({ status: 404, body: '' }); }
    if (/lightstreamer|mqtt/.test(u)) return r.fulfill({ body: '/*stub*/', contentType: 'application/javascript' });
    return u.startsWith(`http://127.0.0.1:${PORT}`) ? r.continue() : r.abort(); });
  if (T0) await ctx.addInitScript(t0 => { const R = Date, off = R.parse(t0) - R.now(); class F extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } } window.Date = F; }, T0);
  await ctx.addInitScript(v => { try { localStorage.setItem('iss.cams', JSON.stringify({ view: { [v.cam]: { optic: 'sd', pan: v.pan, tilt: v.tilt, roll: v.roll, fov: v.fov } }, stream: '', rigV: 1 })); } catch (e) {} },
    { cam: CAM, pan: +PAN, tilt: +TILT, roll: ROLL, fov: +FOV });
  await pg.goto(`http://127.0.0.1:${PORT}/iss_twin.html#sim`); await pg.waitForFunction('window.ISS && ISS.MODEL && ISS.TM.size > 50', null, { timeout: 120000 }); await pg.waitForTimeout(2500);
  await pg.click('#dispMenu summary'); await pg.click('#rendSeg button[data-v="solid"]'); await pg.click('#dispMenu summary');
  await pg.evaluate(([tm, cam]) => { if (Object.keys(tm).length) { ISS.switchSource('mqtt'); for (const [p, v] of Object.entries(tm)) ISS.ingest(p, v); }
    ISS.EXTCAM.open(cam); const w = document.querySelector('#camWin'); w.style.width = '1300px'; w.style.height = '1100px'; }, [TM, CAM]);
  if (EVAL) { await pg.waitForTimeout(1500); console.log(JSON.stringify(await pg.evaluate(EVAL))); }
  await pg.waitForTimeout(3500);
  await (await pg.$('#camWin .twin canvas')).screenshot({ path: OUT }); console.log('ok', OUT);
} finally { await b.close(); srv.close(); }
