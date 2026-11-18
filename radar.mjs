/* radar.mjs: Nahbereichsradar (v1.19, experimentell). Zeigt Objekte in der Nähe der ISS im
   Bahnsystem der Station (LVLH): +V in Flugrichtung, +H nach Steuerbord (negative Bahnnormale),
   +R zur Erde (Nadir), also dieselben Achsen wie das Stationsmodell in Fluglage XVV.

   Quellen:
   1. Bahnelemente (TLE) von CelesTrak, Gruppen „stations“ (Stationen, angedockte und frei fliegende
      Fahrzeuge, Trümmer der ISS) und „last-30-days“ (neu gestartete Objekte, z. B. ein Dragon oder
      Progress im Anflug). Über den Launcher (/__tle, 2 h Zwischenspeicher), sonst direkt.
      Ausgewertet mit SGP4 (satellite.js vom CDN). Genauigkeit: TLE-Positionen weichen um etwa
      1 km bis einige km ab, bei alten Elementsätzen mehr. Das reicht für Objekte in einigen km bis
      tausenden km, nicht für die letzten hundert Meter eines Anflugs.
   2. Kurs (russisches Annäherungssystem): ISSLive meldet Abstand und Abstandsänderung
      (RUSSEG000005/6), aber keine Richtung. Erscheint als Ring.
   3. Modellierte An- und Abflüge aus proxops.mjs (Schätzung, siehe dort), auf der Portachse.
   Angedockte Fahrzeuge führt CelesTrak mit eingefrorenen oder ISS-gleichen Bahnen; sie werden
   über den Namen oder über Abstand und Abstandsänderung (unter 2 km, unter 1 m/s) erkannt und nur
   in der Liste genannt.

   Reines Modul ohne three.js; das SGP4-Modul wird als Parameter übergeben (Tests). */

export const SAT_URL = 'https://cdn.jsdelivr.net/npm/satellite.js@6.0.1/dist/satellite.es.js';
export const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=';
export const GROUPS = ['stations', 'last-30-days'];
export const ISS_ID = 25544;
export const SCALES = [1e3, 1e4, 1e5, 1e6, 5e6];          // Radius des Radarbilds in m
export const MAX_AGE_D = 3;                                 // ältere Elementsätze werden nicht gezeichnet

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

/* Bahnelemente aller Objekte zum Zeitpunkt t (ms) relativ zur ISS. lib: satellite.js.
   dockedNames: Namen der laut LL2 angedockten Fahrzeuge; same(a, b): Namensvergleich.
   Ergebnis: { iss: bool, items: [{ name, id, rel, range, rate, ageD, state }] }, state = 'free' |
   'attached' (angedockt bzw. an der ISS) | 'stale' (Elementsatz älter als MAX_AGE_D). */
export function propagateAll(lib, tles, t, dockedNames = [], same = () => false) {
  const rec = tles._rec || (tles._rec = new Map()), date = new Date(t);
  const sr = x => { if (!rec.has(x.id)) { let s = null; try { s = lib.twoline2satrec(x.l1, x.l2); } catch (e) {} rec.set(x.id, s); } return rec.get(x.id); };
  const issT = tles.find(x => x.id === ISS_ID); if (!issT) return { iss: false, items: [] };
  const pv = s => { try { const r = s && lib.propagate(s, date); return r && r.position && isFinite(r.position.x) ? r : null; } catch (e) { return null; } };
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
  return { iss: true, items };
}

// Kleinster Bildradius, der das nächste frei fliegende Objekt enthält (sonst der kleinste).
export function autoScale(items) {
  const near = items.filter(i => i.state === 'free' || i.kind === 'model').reduce((m, i) => Math.min(m, i.range), Infinity);
  return SCALES.find(s => near <= s * 0.95) || (isFinite(near) ? SCALES[SCALES.length - 1] : SCALES[0]);
}
export const fmtRange = m => !isFinite(m) ? '-' : m < 1000 ? Math.round(m) + ' m' : m < 1e5 ? (m / 1000).toFixed(m % 1000 === 0 ? 0 : m < 1e4 ? 2 : 1) + ' km' : Math.round(m / 1000) + ' km';
export const fmtRate = v => !isFinite(v) ? '-' : (v > 0 ? '+' : v < 0 ? '−' : '') + (Math.abs(v) < 10 ? Math.abs(v).toFixed(2) : Math.round(Math.abs(v))) + ' m/s';

/* Schräge Projektion: waagerechte Ebene = V/H-Ebene, oben = Zenit (−R). az dreht um die
   Senkrechte, el ist die Blickhöhe über der Ebene. Ergebnis in Bildradien (−1..1 im Ring). */
export function project([x, y, z], scale, az, el) {
  const u = (x * Math.cos(az) + y * Math.sin(az)) / scale, w = (-x * Math.sin(az) + y * Math.cos(az)) / scale, h = -z / scale;
  return { sx: u, sy: -w * Math.sin(el) - h * Math.cos(el), gy: -w * Math.sin(el), depth: w };
}

/* Zeichnet das Radarbild in einen 2D-Kontext (Größe w × h in CSS-Pixeln).
   items: [{ label, rel, range, rate, kind: 'tle' | 'model', est }], kurs: { range, rate } oder null,
   colors: { fg, dim, accent, warn, model, bg }. */
export function drawRadar(ctx, w, h, items, o) {
  const { scale, az = 0.6, el = 0.62, kurs = null, colors: c } = o, R = Math.min(w / 2, h / 1.6) * 0.86, cx = w / 2, cy = h / 2;
  const P = p => { const q = project(p, scale, az, el); return [cx + q.sx * R, cy + q.sy * R, cy + q.gy * R, q.depth]; };
  ctx.clearRect(0, 0, w, h); ctx.lineWidth = 1; ctx.font = '10px ui-monospace, monospace'; ctx.textBaseline = 'middle';
  // Entfernungsringe in der V/H-Ebene
  const ring = (rad, style, dash = []) => { ctx.beginPath(); for (let i = 0; i <= 72; i++) { const a = i / 72 * 2 * Math.PI, [x, , gy] = P([Math.cos(a) * rad, Math.sin(a) * rad, 0]); i ? ctx.lineTo(x, gy) : ctx.moveTo(x, gy); } ctx.setLineDash(dash); ctx.strokeStyle = style; ctx.stroke(); ctx.setLineDash([]); };
  for (const f of [0.25, 0.5, 0.75, 1]) ring(scale * f, f === 1 ? c.fg : c.dim);
  ctx.fillStyle = c.dim; ctx.textAlign = 'left'; ctx.fillText('○ ' + fmtRange(scale), 4, h - 8);
  // Sicherheitszonen: Keep-Out Sphere 200 m, Annäherungsellipsoid 4 × 2 × 2 km (NASA), nur wenn sichtbar
  if (scale <= 1e4) ring(200, c.warn, [3, 3]);
  if (scale >= 1e4 && scale <= 1e5) {
    ctx.beginPath(); for (let i = 0; i <= 72; i++) { const a = i / 72 * 2 * Math.PI, [x, , gy] = P([Math.cos(a) * 2000, Math.sin(a) * 1000, 0]); i ? ctx.lineTo(x, gy) : ctx.moveTo(x, gy); }
    ctx.setLineDash([2, 4]); ctx.strokeStyle = c.warn; ctx.stroke(); ctx.setLineDash([]);
  }
  // Achsen
  const axis = (p, txt) => { const [x0, , g0] = P([0, 0, 0]), [x1, y1] = P(p); ctx.beginPath(); ctx.moveTo(x0, g0); ctx.lineTo(x1, y1); ctx.strokeStyle = c.dim; ctx.stroke(); ctx.fillStyle = c.dim; ctx.textAlign = 'center'; ctx.fillText(txt, x1 + (x1 - x0) * 0.08, y1 + (y1 - g0) * 0.08); };
  axis([scale, 0, 0], '+V'); axis([-scale, 0, 0], '−V'); axis([0, scale, 0], '+H'); axis([0, 0, -scale * 0.6], 'zenith'); axis([0, 0, scale * 0.6], 'Earth');
  // Kurs: nur Abstand, Ring um die Station
  if (kurs && isFinite(kurs.range) && kurs.range > 0 && kurs.range <= scale * 1.05) ring(kurs.range, c.accent, [6, 3]);
  // ISS in der Mitte
  ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.textAlign = 'left'; ctx.fillText('ISS', cx + 6, cy + 1);
  // Objekte von hinten nach vorn, außerhalb des Bildradius am Rand mit Pfeil
  const pts = items.map(i => { const k = Math.min(1, scale * 1.08 / Math.max(i.range, 1e-6)), p = i.rel.map(x => x * k); return { i, out: k < 1, s: P(p) }; }).sort((a, b) => b.s[3] - a.s[3]);
  for (const { i, out, s: [x, y, gy] } of pts) {
    const col = i.kind === 'model' ? c.model : c.fg;
    ctx.strokeStyle = col; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, gy, 1.5, 0, 2 * Math.PI); ctx.fillStyle = c.dim; ctx.fill();
    ctx.fillStyle = col; ctx.beginPath();
    if (out) { ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x - 4, y + 3); ctx.closePath(); } else ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.textAlign = x > cx + R * 0.5 ? 'right' : 'left';
    ctx.fillText(`${i.label} ${fmtRange(i.range)}`, x + (ctx.textAlign === 'right' ? -6 : 6), y - 7);
  }
}
