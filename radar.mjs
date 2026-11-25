/* radar.mjs: Nahbereichsradar (v1.19, experimentell). Zeigt Objekte in der Nähe der ISS im
   Bahnsystem der Station (LVLH): +V in Flugrichtung, +H nach Steuerbord (negative Bahnnormale),
   +R zur Erde (Nadir), also dieselben Achsen wie das Stationsmodell in Fluglage XVV.

   Quellen:
   1. Bahnelemente von CelesTrak als OMM/JSON (v1.26; das TLE-Textformat kennt keine sechsstelligen
      Katalognummern, die seit Mitte 2026 vergeben werden), Gruppen „stations“ (Stationen, angedockte
      und frei fliegende Fahrzeuge, Trümmer der ISS) und „last-30-days“ (neu gestartete Objekte, z. B.
      ein Dragon oder Progress im Anflug). Über den Launcher (/__tle, 2 h Zwischenspeicher), sonst direkt.
      Ausgewertet mit SGP4 (satellite.js vom CDN). Genauigkeit: TLE-Positionen weichen um etwa
      1 km bis einige km ab, bei alten Elementsätzen mehr. Das reicht für Objekte in einigen km bis
      tausenden km, nicht für die letzten hundert Meter eines Anflugs.
   2. Kurs (russisches Annäherungssystem): ISSLive meldet Abstand und Abstandsänderung
      (RUSSEG000005/6), aber keine Richtung. Erscheint als Ring.
   3. Modellierte An- und Abflüge aus proxops.mjs (Schätzung, siehe dort), auf der Portachse.
   Angedockte Fahrzeuge führt CelesTrak mit eingefrorenen oder ISS-gleichen Bahnen; sie werden
   über den Namen oder über Abstand und Abstandsänderung (unter 2 km, unter 1 m/s) erkannt und nur
   in der Liste genannt.

   Darstellung (v1.26): drehbare Kugel (Orthografie, Ziehen dreht in Azimut und Höhe, Mausrad zoomt).
   Sobald die Erdoberfläche (gut 400 km unter der ISS) in die Nähe des Bildradius rückt, erscheint die Erde als Kugel, sonst ein blauer Bogen in Nadirrichtung mit Abstand. Klick auf ein Objekt zeigt seine Bahn durch die Kugel (±45 min) (Mittelpunkt in Nadirrichtung, mit Äquator).

   Reines Modul ohne three.js; das SGP4-Modul wird als Parameter übergeben (Tests). */

export const SAT_URL = 'https://cdn.jsdelivr.net/npm/satellite.js@6.0.1/dist/satellite.es.js';
export const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?FORMAT=json&GROUP=';
export const GROUPS = ['stations', 'last-30-days'];
export const SATNOGS = 'https://db.satnogs.org/api/tle/?format=json';   // Ersatzquelle, wenn CelesTrak ausfällt (v1.27)
export const DEFAULT_EARTH = { center: [0, 0, 6371e3 + 415e3], pole: null };   // ohne Bahndaten: Erde 415 km unter der ISS
export const ISS_ID = 25544;
export const SCALES = [1e3, 1e4, 1e5, 1e6, 5e6, 2e7];     // Radius des Radarbilds in m (20 000 km: ganze Erde)
export const MIN_SCALE = 200, MAX_SCALE = 4e7;            // Grenzen beim Zoomen mit dem Mausrad
export const EARTH_R = 6371e3;
export const MAX_AGE_D = 3;                                 // ältere Elementsätze werden nicht gezeichnet

// SatNOGS-Antwort [{tle0, tle1, tle2, norad_cat_id}] -> Datensätze wie im Launcher (TLE_LINE1/2)
export const fromSatnogs = a => (Array.isArray(a) ? a : []).filter(o => o && o.norad_cat_id && /^1 /.test(o.tle1 || '') && /^2 /.test(o.tle2 || ''))
  .map(o => ({ OBJECT_NAME: String(o.tle0 || o.norad_cat_id).replace(/^0 /, '').trim(), NORAD_CAT_ID: Number(o.norad_cat_id), TLE_LINE1: o.tle1, TLE_LINE2: o.tle2 }));

/* CelesTrak-Antwort -> [{ name, id, omm | l1/l2, epoch (ms) }]. Nimmt OMM als Array oder JSON-Text
   (aktuelles Format) und zur Not TLE-Text (ältere Zwischenspeicher). */
export function parseGp(input) {
  if (Array.isArray(input)) return input.flatMap(x => Array.isArray(x) ? parseGp(x) : ommItem(x) || []);
  const s = String(input || '').trim();
  if (s.startsWith('[')) { try { return parseGp(JSON.parse(s)); } catch (e) { return []; } }
  return parseTle(s);
}
function ommItem(o) {
  if (o && o.TLE_LINE1 && o.TLE_LINE2) {     // Ersatzquelle (SatNOGS): TLE-Zeilen, Nummer separat (auch Alpha-5)
    const l1 = String(o.TLE_LINE1), l2 = String(o.TLE_LINE2);
    return { name: String(o.OBJECT_NAME || o.NORAD_CAT_ID).replace(/^0 /, '').trim(), id: Number(o.NORAD_CAT_ID), l1, l2, epoch: tleEpoch(l1) };
  }
  if (!o || typeof o !== 'object' || o.NORAD_CAT_ID == null || !o.EPOCH) return null;
  const ep = Date.parse(/Z$/.test(o.EPOCH) ? o.EPOCH : o.EPOCH + 'Z');
  return { name: String(o.OBJECT_NAME || o.NORAD_CAT_ID).trim(), id: Number(o.NORAD_CAT_ID), omm: o, epoch: ep };
}
/* TLE-Text (Name, Zeile 1, Zeile 2) -> [{ name, id, l1, l2, epoch (ms) }]. */
export function parseTle(text) {
  const lines = String(text || '').split(/\r?\n/).map(s => s.trimEnd()).filter(Boolean), out = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    if (lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 ')) {
      const l1 = lines[i + 1], l2 = lines[i + 2];
      out.push({ name: lines[i].trim(), id: parseInt(l1.slice(2, 7), 10), l1, l2, epoch: tleEpoch(l1) }); i += 2;
    }
  }
  return out;
}
// Epoche aus Zeile 1 (Spalten 19-32: Jahr zweistellig, Tag des Jahres mit Bruchteil) -> ms.
export function tleEpoch(l1) {
  const yy = parseInt(l1.slice(18, 20), 10), doy = parseFloat(l1.slice(20, 32));
  if (!isFinite(yy) || !isFinite(doy)) return NaN;
  return Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (doy - 1) * 86400e3;
}

const sub = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const n = Math.hypot(...a); return a.map(x => x / n); };
const vec = p => [p.x, p.y, p.z];
/* Relativlage eines Objekts zur ISS im LVLH-System der ISS (m) und Abstandsänderung (m/s).
   rI, vI, rO, vO: Inertialvektoren in km bzw. km/s ({x, y, z}). */
export function toLvlh(rI, vI, rO, vO) {
  const r = vec(rI), v = vec(vI), R = unit(r.map(x => -x)), H = unit(cross(v, r)), Vb = cross(H, R);
  const d = sub(rO, rI), dv = sub(vO, vI), range = Math.hypot(...d) * 1000;
  return { rel: [dot(d, Vb) * 1000, dot(d, H) * 1000, dot(d, R) * 1000], range, rate: range > 0 ? dot(d, dv) / Math.hypot(...d) * 1000 : 0 };
}

/* Erde im LVLH-System der ISS: Mittelpunkt (m) und Richtung der Erdachse (ECI +z). */
export function earthLvlh(rI, vI) {
  const r = vec(rI), v = vec(vI), R = unit(r.map(x => -x)), H = unit(cross(v, r)), Vb = cross(H, R), z = [0, 0, 1];
  return { center: [0, 0, Math.hypot(...r) * 1000], pole: [dot(z, Vb), dot(z, H), dot(z, R)] };
}

/* Bahnelemente aller Objekte zum Zeitpunkt t (ms) relativ zur ISS. lib: satellite.js.
   dockedNames: Namen der laut LL2 angedockten Fahrzeuge; same(a, b): Namensvergleich.
   Ergebnis: { iss: bool, earth: { center, pole } (LVLH, m bzw. Einheitsvektor), items: [{ name, id, rel,
   range, rate, ageD, state }] }, state = 'free' |
   'attached' (angedockt bzw. an der ISS) | 'stale' (Elementsatz älter als MAX_AGE_D). */
// SGP4-Datensatz je Objekt (im Array zwischengespeichert)
function satrecOf(lib, tles, x) {
  const rec = tles._rec || (tles._rec = new Map());
  if (!rec.has(x.id)) { let s = null; try { s = x.omm ? lib.json2satrec(x.omm) : lib.twoline2satrec(x.l1, x.l2); } catch (e) {} rec.set(x.id, s); }
  return rec.get(x.id);
}
function posVel(lib, s, date) { try { const r = s && lib.propagate(s, date); return r && r.position && isFinite(r.position.x) ? r : null; } catch (e) { return null; } }

export function propagateAll(lib, tles, t, dockedNames = [], same = () => false) {
  const date = new Date(t), sr = x => satrecOf(lib, tles, x), pv = s => posVel(lib, s, date);
  const issT = tles.find(x => x.id === ISS_ID); if (!issT) return { iss: false, items: [] };
  const iss = pv(sr(issT)); if (!iss) return { iss: false, items: [] };
  const seen = new Set([ISS_ID]), items = [];
  for (const x of tles) {
    if (seen.has(x.id) || /^ISS \(/.test(x.name)) continue; seen.add(x.id);
    const p = pv(sr(x)); if (!p) continue;
    const o = toLvlh(iss.position, iss.velocity, p.position, p.velocity), ageD = (t - x.epoch) / 86400e3;
    if (o.range > 2e7) continue;
    const named = dockedNames.some(n => same(n, x.name));
    const state = named || (o.range < 2000 && Math.abs(o.rate) < 1) ? 'attached' : ageD > MAX_AGE_D ? 'stale' : 'free';
    items.push({ name: x.name, id: x.id, ...o, ageD, state });
  }
  items.sort((a, b) => a.range - b.range);
  return { iss: true, earth: earthLvlh(iss.position, iss.velocity), items };
}

/* Bahn eines Objekts relativ zur ISS (LVLH der ISS zum jeweiligen Zeitpunkt) von t − before bis t + after
   (min), Schritt step (min): [{ dt (min), rel }]. So läuft die Bahn durch die Radarkugel. */
export function trajectory(lib, tles, id, t, { before = 45, after = 45, step = 1 } = {}) {
  const issT = tles.find(x => x.id === ISS_ID), o = tles.find(x => x.id === id); if (!issT || !o) return [];
  const si = satrecOf(lib, tles, issT), so = satrecOf(lib, tles, o), out = [];
  for (let m = -before; m <= after + 1e-9; m += step) {
    const d = new Date(t + m * 60e3), a = posVel(lib, si, d), b = posVel(lib, so, d);
    if (a && b) out.push({ dt: m, rel: toLvlh(a.position, a.velocity, b.position, b.velocity).rel });
  }
  return out;
}

// Kleinster Bildradius, der das nächste frei fliegende Objekt enthält (sonst der kleinste).
export function autoScale(items) {
  const near = items.filter(i => i.state === 'free' || i.kind === 'model').reduce((m, i) => Math.min(m, i.range), Infinity);
  return SCALES.find(s => near <= s * 0.95) || (isFinite(near) ? SCALES[SCALES.length - 1] : SCALES[0]);
}
export const fmtRange = m => !isFinite(m) ? '-' : m < 1000 ? Math.round(m) + ' m' : m < 1e5 ? (m / 1000).toFixed(m % 1000 === 0 ? 0 : m < 1e4 ? 2 : 1) + ' km' : Math.round(m / 1000) + ' km';
export const fmtRate = v => !isFinite(v) ? '-' : (v > 0 ? '+' : v < 0 ? '−' : '') + (Math.abs(v) < 10 ? Math.abs(v).toFixed(2) : Math.round(Math.abs(v))) + ' m/s';

/* Orthografische Projektion der LVLH-Lage: az dreht um die Senkrechte (Zenit = −R), el ist die
   Blickhöhe (+90° = von oben, −90° = von unten). Ergebnis in Bildradien: sx nach rechts, sy nach unten,
   gy = Bildlage des Fußpunkts in der V/H-Ebene, depth > 0 = zum Betrachter hin. */
export function project([x, y, z], scale, az, el) {
  const u = (x * Math.cos(az) + y * Math.sin(az)) / scale, w = (-x * Math.sin(az) + y * Math.cos(az)) / scale, h = -z / scale;
  return { sx: u, sy: -w * Math.sin(el) - h * Math.cos(el), gy: -w * Math.sin(el), depth: -w * Math.cos(el) + h * Math.sin(el) };
}
// Mausrad: neuer Bildradius (stufenlos, je Raste ×1.25)
export const zoomScale = (scale, deltaY) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * Math.pow(1.25, Math.sign(deltaY))));

/* Zeichnet die Radarkugel in einen 2D-Kontext (Größe w × h in CSS-Pixeln).
   items: [{ label, rel, range, rate, kind: 'tle' | 'model' }], kurs: { range, rate } oder null,
   earth: { center, pole } oder null, colors: { fg, dim, accent, warn, model, earth }. */
export function drawRadar(ctx, w, h, items, o) {
  const { scale, az = 0.6, el = 0.62, kurs = null, earth = null, colors: c } = o, R = Math.min(w, h) / 2 * 0.84, cx = w / 2, cy = h / 2;
  const P = p => { const q = project(p, scale, az, el); return [cx + q.sx * R, cy + q.sy * R, cy + q.gy * R, q.depth]; };
  ctx.clearRect(0, 0, w, h); ctx.lineWidth = 1; ctx.font = '10px ui-monospace, monospace'; ctx.textBaseline = 'middle';
  // Kreis im Raum (Mittelpunkt m, Achsen a, b): Vorderseite durchgezogen, Rückseite gestrichelt und schwach
  const circle = (m, a, b, style, { dash = [], back = true } = {}) => {
    const pts = []; for (let i = 0; i <= 96; i++) { const t = i / 96 * 2 * Math.PI; pts.push(P([0, 1, 2].map(k => m[k] + Math.cos(t) * a[k] + Math.sin(t) * b[k]))); }
    for (const front of [false, true]) {
      if (!front && !back) continue;
      ctx.beginPath(); let on = false;
      for (let i = 0; i < pts.length; i++) { const [x, y, , d] = pts[i]; if ((d >= -1e-9) === front) { on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } else on = false; }
      ctx.setLineDash(front ? dash : [2, 4]); ctx.globalAlpha = front ? 1 : 0.45; ctx.strokeStyle = style; ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  };
  const O = [0, 0, 0], ring = (rad, style, dash) => circle(O, [rad, 0, 0], [0, rad, 0], style, { dash });
  // Erde: Scheibe mit Rand und Äquator, nur wenn sie ins Bild ragt
  let E = null, farEarth = false;
  if (earth) {
    const [ex, ey, , ed] = P(earth.center), er = EARTH_R / scale * R;
    const alt = earth.center[2] - EARTH_R;                         // Höhe der ISS über der Erdoberfläche
    if (alt >= scale * 1.2) {
      farEarth = true;
      // Erde weit außerhalb: blauer Bogen am Kugelrand in Nadirrichtung mit Abstand zur Oberfläche
      const [nx, ny] = P([0, 0, scale]), a = Math.atan2(ny - cy, nx - cx), k = Math.hypot(nx - cx, ny - cy) / R;
      ctx.beginPath(); ctx.arc(cx, cy, R + 3, a - 0.5, a + 0.5); ctx.lineWidth = 3; ctx.strokeStyle = c.earth || c.dim; ctx.globalAlpha = 0.35 + 0.65 * k; ctx.stroke(); ctx.lineWidth = 1; ctx.globalAlpha = 1;
      ctx.fillStyle = c.earth || c.dim; ctx.textAlign = 'center';
      ctx.fillText(`${o.earthLabel || 'Earth'} ${fmtRange(alt)}`, Math.max(40, Math.min(w - 40, cx + Math.cos(a) * (R + 12))), Math.max(8, Math.min(h - 18, cy + Math.sin(a) * (R + 12))));
    } else if (Math.hypot(ex - cx, ey - cy) - er < Math.hypot(w, h) / 2) {   // Oberfläche nah am Bildradius: Erde als Kugel
      E = { ex, ey, ed, er, d: EARTH_R / scale };
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, 2 * Math.PI); ctx.fillStyle = c.earth || c.dim; ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = c.earth || c.dim; ctx.stroke();
      if (earth.pole) {
        const p = unit(earth.pole), a0 = Math.abs(p[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = unit(cross(p, a0)), e2 = cross(p, e1);
        circle(earth.center, e1.map(x => x * EARTH_R), e2.map(x => x * EARTH_R), c.earth || c.dim, { back: false, dash: [] });
        const np = P(earth.center.map((x, k) => x + p[k] * EARTH_R));
        if (np[3] > ed) { ctx.fillStyle = c.earth || c.dim; ctx.textAlign = 'center'; ctx.fillText('N', np[0], np[1]); }
      }
      ctx.fillStyle = c.earth || c.dim; ctx.textAlign = 'center'; if (ey + er * 0.5 < h && ey + er * 0.5 > 0 && Math.abs(ex - cx) < w / 2) ctx.fillText(o.earthLabel || 'Earth', ex, Math.min(h - 18, ey + er * 0.5));
    }
  }
  // verdeckt die Erde den Punkt (Bildpunkt in der Scheibe und hinter der Oberfläche)?
  const hidden = ([x, y, , d]) => { if (!E) return false; const rho = Math.hypot(x - E.ex, y - E.ey) / R, k = E.d * E.d - rho * rho; return k > 0 && d < E.ed - Math.sqrt(k); };
  // Kugel: Umriss, Entfernungsringe in der V/H-Ebene, zwei senkrechte Großkreise
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.strokeStyle = c.fg; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
  for (const f of [0.25, 0.5, 0.75, 1]) ring(scale * f, f === 1 ? c.fg : c.dim);
  circle(O, [scale, 0, 0], [0, 0, scale], c.dim); circle(O, [0, scale, 0], [0, 0, scale], c.dim);
  ctx.fillStyle = c.dim; ctx.textAlign = 'left'; ctx.fillText('○ ' + fmtRange(scale), 4, h - 8);
  // Sicherheitszonen: Keep-Out Sphere 200 m, Annäherungsellipsoid 4 × 2 × 2 km (NASA), nur wenn sichtbar
  if (scale <= 1e4) ring(200, c.warn, [3, 3]);
  if (scale >= 1e4 && scale <= 1e5) circle(O, [2000, 0, 0], [0, 1000, 0], c.warn, { dash: [2, 4] });
  // Achsen
  const axis = (p, txt) => { const [x0, y0] = P(O), [x1, y1, , d] = P(p); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = c.dim; ctx.globalAlpha = d < 0 ? 0.45 : 1; ctx.stroke(); ctx.fillStyle = c.dim; ctx.textAlign = 'center'; ctx.fillText(txt, x1 + (x1 - x0) * 0.08, y1 + (y1 - y0) * 0.08); ctx.globalAlpha = 1; };
  axis([scale, 0, 0], '+V'); axis([-scale, 0, 0], '−V'); axis([0, scale, 0], '+H'); axis([0, 0, -scale], 'zenith'); axis([0, 0, scale], farEarth ? '' : 'nadir');
  // Kurs: nur Abstand, Kugelschale um die Station (als Umriss)
  if (kurs && isFinite(kurs.range) && kurs.range > 0 && kurs.range <= scale * 1.05) { ctx.beginPath(); ctx.arc(cx, cy, kurs.range / scale * R, 0, 2 * Math.PI); ctx.setLineDash([6, 3]); ctx.strokeStyle = c.accent; ctx.stroke(); ctx.setLineDash([]); }
  // ISS in der Mitte
  ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.textAlign = 'left'; ctx.fillText('ISS', cx + 6, cy + 1);
  // Bahn des gewählten Objekts: Vergangenheit gestrichelt, Zukunft durchgezogen, nur innerhalb der Kugel
  for (const i of items) {
    if (!i.path || i.path.length < 2) continue;
    const col = i.kind === 'model' ? c.model : c.accent;
    for (const future of [false, true]) {
      ctx.beginPath(); let on = false;
      for (const q of i.path) {
        if ((q.dt >= 0) !== future && !(q.dt === 0)) { on = false; continue; }
        if (Math.hypot(...q.rel) > scale * 1.02) { on = false; continue; }
        const [x, y] = P(q.rel); on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true;
      }
      ctx.setLineDash(future ? [] : [3, 3]); ctx.strokeStyle = col; ctx.globalAlpha = future ? 0.9 : 0.5; ctx.lineWidth = future ? 1.5 : 1; ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    const done = [P(i.rel)];   // Zeitmarken alle 15 min, nur mit Abstand zueinander und zum Objekt
    for (const q of i.path) {
      if (q.dt === 0 || q.dt % 15 !== 0 || Math.hypot(...q.rel) > scale) continue;
      const [x, y] = P(q.rel); if (done.some(([a, b]) => Math.hypot(a - x, b - y) < 28)) continue; done.push([x, y]);
      ctx.fillStyle = col; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); ctx.textAlign = 'left'; ctx.fillText((q.dt > 0 ? '+' : '') + q.dt + ' min', x + 4, y + 8);
    }
  }
  // Objekte von hinten nach vorn, außerhalb der Kugel am Rand mit Pfeil, hinter der Erde schwach
  const pts = items.map(i => { const k = Math.min(1, scale * 1.08 / Math.max(i.range, 1e-6)), p = i.rel.map(x => x * k); return { i, out: k < 1, s: P(p) }; }).sort((a, b) => a.s[3] - b.s[3]);
  const hits = [];
  for (const { i, out, s } of pts) {
    const [x, y, gy] = s, col = i.sel ? c.accent : i.kind === 'model' ? c.model : c.fg;
    hits.push({ item: i, x, y });
    ctx.globalAlpha = hidden(s) ? 0.3 : 1;
    ctx.strokeStyle = col; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, gy, 1.5, 0, 2 * Math.PI); ctx.fillStyle = c.dim; ctx.fill();
    ctx.fillStyle = col; ctx.beginPath();
    if (out) { ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x - 4, y + 3); ctx.closePath(); } else ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.textAlign = x > cx + R * 0.5 ? 'right' : 'left';
    if (i.sel) { ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI); ctx.strokeStyle = c.accent; ctx.stroke(); }
    ctx.fillText(`${i.label} ${fmtRange(i.range)}`, x + (ctx.textAlign === 'right' ? -6 : 6), y - 7);
    ctx.globalAlpha = 1;
  }
  return hits;
}
// Klick auf das Radarbild: nächstes Objekt innerhalb von r Pixeln (hits aus drawRadar) oder null
export function pick(hits, x, y, r = 10) {
  let best = null, bd = r;
  for (const h of hits || []) { const d = Math.hypot(h.x - x, h.y - y); if (d <= bd) { bd = d; best = h.item; } }
  return best;
}
