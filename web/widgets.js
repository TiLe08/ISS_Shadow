/* widgets.js: Anzeigebausteine für Telemetriekanäle.

   Für jeden Kanal gibt es dieselben Ansichten: tile (Kachel), value (Zahl mit Verlauf),
   graph (Diagramm), bar (Balken), gauge (Rundinstrument), dial (Winkelscheibe) und state
   (Lampe mit Klartext). Die Daten kommen über ein Kontextobjekt, damit dieselben Widgets
   in den Seitenpanels, im Kanal-Browser und im Dashboard funktionieren:
     ctx.info(p)  -> { pui, label, unit, kind, desc, range:[lo,hi]|null }  (Stammdaten)
     ctx.read(p)  -> { num, text, unit, ns, fresh, age, on, alarm, state }  (aktueller Wert;
                     ns = von NASA nicht veröffentlicht)
     ctx.series(p, spanMs, now) -> [[ms, wert], ...]  (Treppenverlauf, letzter Wert gehalten)
     ctx.t(text, ...args)  Übersetzung
   Canvas-Flächen werden nur neu gezeichnet, wenn sich ihr Inhalt ändert (Leistung).
   Klassisches Skript: stellt window.ISSW bereit. */
(function (root) {
  'use strict';
  // Vollkreis in Bogenmaß.
  const TAU = Math.PI * 2;
  // Zwischengespeicherte Farben des aktuellen Designs (Skin), siehe colors().
  let C = null;
  // Farben aus den CSS-Variablen des aktuellen Designs lesen (einmal, dann zwischengespeichert).
  function colors() {
    if (C) return C;
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    C = { acc: v('--acc') || '#3fe0ff', acc2: v('--acc2') || '#ffb54a', fg: v('--fg') || '#cfe6f2', dim: v('--dim') || '#6a8899', mute: v('--mute') || '#3b5666',
      line: v('--line') || '#16303f', line2: v('--line2') || '#1f4458', ok: v('--ok') || '#57f2a0', warn: v('--warn') || '#ffd24d', crit: v('--crit') || '#ff4f6d',
      mono: v('--f-mono') || 'monospace', bg: v('--bg') || '#04070b' };
    return C;
  }
  // Nach einem Designwechsel die Farben neu lesen lassen.
  const refreshColors = () => { C = null; };

  /* Canvas auf die Größe seines Kastens bringen (Gerätepixel); liefert [ctx, W, H] in CSS-Pixeln. */
  function fit(c, w, h) {
    const dpr = Math.min(root.devicePixelRatio || 1, 2), W = Math.max(8, Math.round(w || c.clientWidth || 100)), H = Math.max(8, Math.round(h || c.clientHeight || 40));
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    return [x, W, H];
  }
  // Zahl lesbar formatieren: Nachkommastellen nach Größenordnung, sehr große Werte wissenschaftlich.
  const fmtNum = (v, dp) => !isFinite(v) ? '-' : Math.abs(v) >= 1e5 ? v.toExponential(2) : v.toFixed(dp ?? (Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 1 ? 2 : 3));

  /* ---------- Zeichenfunktionen ---------- */
  // Zeitverlauf zeichnen: ser = [[ms, wert], ...]. Optionen: span (Zeitfenster), axes
  // (Achsen und Beschriftung), minSpan (kleinster dargestellter Wertebereich), color, empty
  // (Text ohne Daten), labels (Min/Max am Rand).
  function chart(c, ser, o = {}) {
    const k = colors(), [x, W, H] = fit(c, o.w, o.h), now = o.now || Date.now(), t0 = now - (o.span || 3600e3);
    const pts = ser || [];
    if (pts.length < 2) { x.fillStyle = k.mute; x.font = `10px ${k.mono}`; x.fillText(o.empty || '', 4, H / 2 + 3); return; }
    let lo = Infinity, hi = -Infinity; for (const [, v] of pts) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const minSpan = Math.max(o.minSpan || 0, Math.abs(hi) * 0.005, 0.01);
    if (hi - lo < minSpan) { const m = (hi + lo) / 2; lo = m - minSpan / 2; hi = m + minSpan / 2; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const L = o.axes ? 40 : 0, B = o.axes ? 13 : 0, T = 3, R = 3, pw = W - L - R, ph = H - B - T;
    const X = t => L + (t - t0) / (now - t0) * pw, Y = v => T + (1 - (v - lo) / (hi - lo)) * ph;
    x.lineWidth = 1; x.strokeStyle = k.line; x.fillStyle = k.dim; x.font = `9px ${k.mono}`;
    if (o.axes) {
      for (let i = 0; i <= 2; i++) { const v = lo + (hi - lo) * i / 2, y = Math.round(Y(v)) + .5; x.beginPath(); x.moveTo(L, y); x.lineTo(W - R, y); x.stroke(); x.fillText(fmtNum(v), 2, y + 3); }
      const span = now - t0, step = span <= 900e3 ? 300e3 : span <= 3600e3 ? 900e3 : 3600e3;
      for (let t = now; t >= t0; t -= step) { const xx = Math.round(X(t)) + .5; x.beginPath(); x.moveTo(xx, T); x.lineTo(xx, T + ph); x.stroke(); const m = Math.round((now - t) / 60000); x.fillText(m ? '−' + (m >= 60 ? (m / 60).toFixed(m % 60 ? 1 : 0) + ' h' : m + ' min') : (o.nowLabel || 'now'), Math.min(W - 34, xx - 10), H - 2); }
    } else { x.beginPath(); x.moveTo(0, H - .5); x.lineTo(W, H - .5); x.stroke(); }
    const col = o.color || k.acc;
    x.beginPath(); pts.forEach(([t, v], i) => { const px = X(Math.max(t, t0)), py = Y(v); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.strokeStyle = col; x.lineWidth = 1.4; x.stroke();
    x.lineTo(X(pts[pts.length - 1][0]), T + ph); x.lineTo(X(Math.max(pts[0][0], t0)), T + ph); x.closePath(); x.globalAlpha = .12; x.fillStyle = col; x.fill(); x.globalAlpha = 1;
    const [lt, lv] = pts[pts.length - 1]; x.fillStyle = col; x.beginPath(); x.arc(X(lt), Y(lv), 2.2, 0, TAU); x.fill();
    if (!o.axes && o.labels !== false && H >= 24) { x.fillStyle = k.dim; x.fillText(fmtNum(hi - pad), 2, 9); x.fillText(fmtNum(lo + pad), 2, H - 3); }
  }
  // Winkelscheibe: Zeiger für deg Grad (0° oben, im Uhrzeigersinn).
  function dial(c, deg, o = {}) {
    const k = colors(), [x, W, H] = fit(c, o.w, o.h), r = Math.min(W, H) / 2 - 2, cx = W / 2, cy = H / 2;
    x.strokeStyle = k.line2; x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke();
    const ticks = r > 30 ? 36 : 12;
    for (let i = 0; i < ticks; i++) { const a = i / ticks * TAU - Math.PI / 2, big = i % (ticks / 4) === 0; x.strokeStyle = big ? k.dim : k.line2; x.beginPath(); x.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.lineTo(cx + Math.cos(a) * (r - (big ? r * .22 : r * .1)), cy + Math.sin(a) * (r - (big ? r * .22 : r * .1))); x.stroke(); }
    if (r > 30) { x.fillStyle = k.mute; x.font = `9px ${k.mono}`; x.textAlign = 'center'; [['0', 0], ['90', 1], ['180', 2], ['270', 3]].forEach(([s, i]) => { const a = i * Math.PI / 2 - Math.PI / 2; x.fillText(o.signed && s === '270' ? '−90' : o.signed && s === '180' ? '±180' : s, cx + Math.cos(a) * (r - r * .36), cy + Math.sin(a) * (r - r * .36) + 3); }); x.textAlign = 'start'; }
    if (!isFinite(deg)) return;
    const a = deg * Math.PI / 180 - Math.PI / 2;
    x.strokeStyle = o.color || k.acc; x.lineWidth = r > 30 ? 2.2 : 1.6; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * r * .92, cy + Math.sin(a) * r * .92); x.stroke();
    x.fillStyle = o.color || k.acc; x.beginPath(); x.arc(cx, cy, r > 30 ? 3 : 1.8, 0, TAU); x.fill();
  }
  // Rundinstrument (Dreiviertelbogen): frac = Anteil 0..1, lo/hi als Beschriftung.
  function gauge(c, frac, o = {}) {
    const k = colors(), [x, W, H] = fit(c, o.w, o.h), r = Math.min(W / 2, H * .62) - 4, cx = W / 2, cy = Math.min(H - 4, r + 6), a0 = Math.PI * .8, a1 = Math.PI * 2.2;
    x.lineCap = 'butt'; x.lineWidth = Math.max(4, r * .16);
    x.strokeStyle = k.line2; x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke();
    if (isFinite(frac)) { const f = Math.max(0, Math.min(1, frac)); x.strokeStyle = o.color || k.acc; x.beginPath(); x.arc(cx, cy, r, a0, a0 + (a1 - a0) * f); x.stroke(); }
    if (o.lo !== undefined) { x.fillStyle = k.mute; x.font = `9px ${k.mono}`; x.textAlign = 'center'; x.fillText(fmtNum(o.lo), cx + Math.cos(a0) * r, cy + Math.sin(a0) * r + 12); x.fillText(fmtNum(o.hi), cx + Math.cos(a1) * r, cy + Math.sin(a1) * r + 12); x.textAlign = 'start'; }
  }

  /* ---------- Einordnung der Kanäle ---------- */
  // Art eines Kanals aus Einheit und Name ableiten (bestimmt die Standardansicht).
  function kindOf(i) {
    if (i.enum) return 'state';
    const u = i.unit || '', n = ((i.name || '') + ' ' + (i.desc || '')).toLowerCase();
    if (i.bool) return 'state';
    if (u === '°') return 'angle';
    if (u === '%') return 'pct';
    if (u === '°C' || u === '°F') return 'temp';
    if (u === 'V') return 'volt';
    if (u === 'A') return 'amp';
    if (/mmhg|kpa|psi|mpa/i.test(u)) return 'press';
    if (/^(text|time)$/.test(i.type || '')) return 'text';
    if (/quat/.test(n)) return 'num';
    return 'num';
  }
  /* 0/1-Statuskanäle: [Text für aus, Text für an, Alarm wenn an], abgeleitet aus dem Kanalnamen. */
  const BOOL_WORDS = [
    [/failure|latched|loss of att/i, ['OK', 'ALARM', true]], [/hooks closed/i, ['Open', 'Closed']], [/engaged/i, ['Free', 'Engaged']],
    [/inhibit/i, ['Enabled', 'Inhibited']], [/in ?use/i, ['Idle', 'In use']], [/in ?progress/i, ['No', 'Yes']],
    [/voltage status|on\/off|power/i, ['Off', 'On']], [/active\/backup/i, ['Backup', 'Active']], [/activity|active/i, ['Inactive', 'Active']],
    [/frame ?sync/i, ['No sync', 'Sync']], [/operating|signal|standby|test mode|docking flag|prepared|terminated|controls the motion/i, ['No', 'Yes']]];
  // Passende Wörter für einen 0/1-Kanal suchen (oder null).
  function boolWords(name) { for (const [re, w] of BOOL_WORDS) if (re.test(name)) return w; return null; }
  // Standardansicht je Kanalart.
  const defaultView = kind => ({ angle: 'dial', pct: 'bar', state: 'state', volt: 'gauge', text: 'value' })[kind] || 'value';
  // Alle wählbaren Ansichten.
  const VIEWS = ['value', 'graph', 'bar', 'gauge', 'dial', 'state'];

  /* ---------- Widgets ---------- */
  // HTML-Sonderzeichen maskieren.
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Wertebereich für Balken/Rundinstrument: bekannter Bereich, sonst aus dem Verlauf.
  function rangeFor(info, ser, v) {
    if (info.range) return info.range;
    if (info.kind === 'pct') return [0, 100];
    let lo = isFinite(v) ? v : 0, hi = lo; for (const [, y] of ser || []) { if (y < lo) lo = y; if (y > hi) hi = y; }
    if (hi - lo < Math.abs(hi) * .02 + .01) { const m = (hi + lo) / 2, d = Math.abs(m) * .05 + .5; lo = m - d; hi = m + d; }
    return [lo, hi];
  }
  /* Ein Widget erzeugen. view: tile | value | graph | bar | gauge | dial | state.
     Liefert { el, update(now, force), setPinned(on), view, p, info }. */
  function make(view, p, ctx, opt = {}) {
    const info = ctx.info(p), t = ctx.t || (s => s);
    const el = document.createElement('div');
    el.className = 'w w-' + view + ' k-' + info.kind; el.dataset.p = p; el.tabIndex = 0;
    el.innerHTML = `<div class="wh"><span class="wl">${esc(info.label)}</span><i class="wpin" hidden></i></div><div class="wb"></div>`;
    const body = el.querySelector('.wb');
    let canvas = null, valEl = null, barEl = null, led = null;
    const valHTML = '<div class="wv"><b>-</b><u></u></div>';
    const v = view === 'tile' ? ({ angle: 'dial', pct: 'bar', state: 'state' }[info.kind] || 'spark') : view;
    // Canvas-Flächen sitzen in einem Kasten fester Größe (.cv) und füllen ihn aus: ihre Größe wirkt nie auf das Layout zurück.
    const cv = cls => `<div class="cv ${cls}"><canvas></canvas></div>`;
    if (v === 'state') body.innerHTML = '<i class="led"></i>' + valHTML;
    else if (v === 'bar') body.innerHTML = valHTML + '<div class="wbar"><b></b></div>';
    else if (v === 'dial') body.innerHTML = cv('cv-dial') + valHTML;
    else if (v === 'gauge') body.innerHTML = cv('cv-gauge') + valHTML;
    else if (v === 'graph') body.innerHTML = valHTML + cv('cv-graph');
    else body.innerHTML = valHTML + cv('cv-spark');
    el.classList.add('v-' + v);
    canvas = body.querySelector('canvas'); valEl = body.querySelector('.wv'); barEl = body.querySelector('.wbar b'); led = body.querySelector('.led');
    let lastKey = '', lastDraw = 0;
    // Widget mit dem aktuellen Wert füllen; zeichnet nur bei Änderung (oder force) neu,
    // Verläufe spätestens alle 5 s.
    function update(now = Date.now(), force = false) {
      const r = ctx.read(p), b = valEl.firstChild, u = valEl.lastChild;
      const txt = r.text, unit = r.unit || '';
      if (b.textContent !== txt) b.textContent = txt;
      if (u.textContent !== unit) u.textContent = unit;
      el.classList.toggle('fresh', !!r.fresh); el.classList.toggle('ns', !!r.ns); el.classList.toggle('alarm', !!r.alarm);
      const span = opt.span || (v === 'graph' ? 3600e3 : 1800e3);
      if (led) { led.className = 'led' + (r.on === true ? (r.alarm ? ' alarm' : ' on') : r.on === false ? ' off' : ''); }
      const key = txt + '|' + unit + '|' + (r.ns ? 1 : 0) + '|' + (canvas ? canvas.clientWidth + 'x' + canvas.clientHeight : '');
      const chartView = v === 'spark' || v === 'graph';
      if (!force && key === lastKey && !(chartView && now - lastDraw > 5000)) return;
      lastKey = key; lastDraw = now;
      if (!canvas && !barEl) return;
      const ser = (chartView || v === 'bar' || v === 'gauge') && !r.ns ? ctx.series(p, span, now) : [];
      if (v === 'bar') { const [lo, hi] = rangeFor(info, ser, r.num); barEl.style.width = isFinite(r.num) ? Math.max(0, Math.min(100, (r.num - lo) / (hi - lo) * 100)) + '%' : '0%'; el.title = el.title; }
      else if (v === 'gauge') { const [lo, hi] = rangeFor(info, ser, r.num); gauge(canvas, (r.num - lo) / (hi - lo), { lo, hi }); }
      else if (v === 'dial') dial(canvas, r.num, { signed: info.signed });
      else if (chartView) chart(canvas, ser, { span, now, axes: v === 'graph', labels: v === 'graph' || view !== 'tile', empty: r.ns ? t('not published by NASA') : t('no reading yet'), nowLabel: t('now') });
    }
    // Stecknadel-Symbol zeigen, wenn der Kanal in den Graphen angeheftet ist.
    function setPinned(on) { el.querySelector('.wpin').hidden = !on; }
    return { el, update, setPinned, view, p, info };
  }

  // Öffentliche Schnittstelle.
  root.ISSW = { make, kindOf, boolWords, defaultView, VIEWS, chart, dial, gauge, fit, refreshColors, fmtNum, esc };
})(globalThis);
