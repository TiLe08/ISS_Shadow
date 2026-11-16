/* Kalibrierfeld (v1.17): Nullpunkte und Vorzeichen der beweglichen Teile am Live-Bild einstellen.

Es gibt keine öffentliche Beschreibung, welcher Telemetriewert welcher Modellstellung entspricht
(siehe docs/MODELL_UND_KALIBRIERUNG.md). Das Feld erlaubt deshalb, die Werte direkt an der Überlagerung
im Kamerafenster abzugleichen:
  - Videoverzögerung: das Modell zeigt die Telemetrie von vor n Sekunden (der Stream läuft nach)
  - Canadarm2 und Dextre: je Gelenk Vorzeichen umkehren und Offset in Grad
  - MBS-Greifpunkte: Drehung des PDGF in Grad (leer = gelernter Kandidat)
  - Dextre: Drehung um die Achse seines Greifpunkts
  - SARJ, BGA, TRRJ, Ku: zusätzlicher Offset zu CAL
  - Kamera: Verschiebung (m) und Drehung um die Blickachse für die gewählte Kamera
Alle Werte liegen in CALIB (localStorage „iss.calib“), die Kameraverschiebung in den Kameraeinstellungen
(„iss.cams“). Export und Import als JSON, damit gefundene Werte in den Code übernommen werden können.

Das Feld hängt sich als Knopf „Calibrate“ in die Kopfzeile des Kamerafensters, ohne dessen Aufbau zu ändern. */

const SSRMS_J = ['SR', 'SY', 'SP', 'EP', 'WP', 'WY', 'WR'];
const SSRMS_PUI = ['CSASSRMS004', 'CSASSRMS005', 'CSASSRMS006', 'CSASSRMS007', 'CSASSRMS008', 'CSASSRMS009', 'CSASSRMS010'];
const DEXTRE_PUI = [3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 20].map(n => 'CSASPDM' + String(n).padStart(4, '0'));
const DEXTRE_NAME = i => i === 14 ? 'Body roll' : `Arm ${i < 7 ? 1 : 2} J${(i % 7) + 1}`;
const CAL_KEYS = ['sarjS', 'sarjP', 'bga1A', 'bga1B', 'bga2A', 'bga2B', 'bga3A', 'bga3B', 'bga4A', 'bga4B', 'trrjS', 'trrjP', 'sgant', 'kuCross'];
const CAM_KEYS = [['px', 'm', 0.5], ['py', 'm', 0.5], ['pz', 'm', 0.5], ['dx', 'm', 0.05], ['dy', 'm', 0.05], ['dz', 'm', 0.05], ['roll', '°', 0.5]];

const CSS = `
#calibPanel{position:fixed;left:14px;top:60px;width:380px;max-height:calc(100vh - 80px);overflow:auto;z-index:70;
  background:var(--panel-solid,#09131c);border:1px solid var(--line2,#1f4458);font:12px var(--f-mono,monospace);color:var(--fg,#cfe6f0);box-shadow:0 8px 30px rgba(0,0,0,.5)}
#calibPanel[hidden]{display:none}
#calibPanel header{position:sticky;top:0;display:flex;gap:6px;align-items:center;padding:6px 8px;background:inherit;border-bottom:1px solid var(--line,#16303f);cursor:move}
#calibPanel header b{flex:1;font:600 12px var(--f-disp,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:var(--acc,#3fe0ff)}
#calibPanel details{border-bottom:1px solid var(--line,#16303f);padding:4px 8px}
#calibPanel summary{cursor:pointer;color:var(--acc,#3fe0ff);padding:2px 0}
#calibPanel table{width:100%;border-collapse:collapse}
#calibPanel td{padding:1px 3px;white-space:nowrap}
#calibPanel td.live{color:var(--dim,#6a8899);text-align:right;min-width:5em}
#calibPanel input[type=number]{width:5.5em;background:var(--bg2,#070d14);color:inherit;border:1px solid var(--line2,#1f4458);font:inherit;padding:1px 3px}
#calibPanel button{background:transparent;color:inherit;border:1px solid var(--line2,#1f4458);font:inherit;padding:2px 8px;cursor:pointer}
#calibPanel textarea{width:100%;height:110px;background:var(--bg2,#070d14);color:inherit;border:1px solid var(--line2,#1f4458);font:inherit}
#calibPanel .note{color:var(--dim,#6a8899);margin:3px 0}
#calibPanel .row{display:flex;gap:6px;flex-wrap:wrap;padding:6px 8px}`;

export function setupCalibPanel({ CALIB, CAL, SSRMS_CONV, EXTCAM, MBS_IDS, applyMssCal, t = s => s, logEvent = () => {}, read = () => NaN, save = () => {} }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const el = document.createElement('div'); el.id = 'calibPanel'; el.hidden = true; document.body.append(el);
  const num = (v, d = 0) => (v === '' || v == null || !isFinite(+v)) ? d : +v;
  const fmt = v => isFinite(v) ? (+v).toFixed(1) : '–';
  const changed = () => { save(); applyMssCal?.(); };

  const camId = () => EXTCAM?.current || null;
  const camView = () => { const id = camId(); if (!id || !EXTCAM.state) return null; EXTCAM.state.view ||= {}; return (EXTCAM.state.view[id] ||= {}); };

  // Eine Zeile mit Umkehr-Häkchen, Offsetfeld und aktuellem Telemetriewert.
  const jointRow = (grp, i, name, pui) => `<tr><td>${name}</td>
    <td><label title="${t('Invert the sign of this joint')}"><input type="checkbox" data-flip="${grp}:${i}"${CALIB[grp].flip[i] ? ' checked' : ''}> ±</label></td>
    <td><input type="number" step="0.5" data-off="${grp}:${i}" value="${num(CALIB[grp].off[i])}" title="${t('Offset in degrees')}"></td>
    <td class="live" data-live="${pui}" title="${pui}">–</td></tr>`;

  function render() {
    const v = camView();
    el.innerHTML = `<header><b>${t('Calibration')}</b><button data-act="close" title="${t('Close')}">×</button></header>
    <p class="note" style="padding:0 8px">${t('Turn on Overlay in the camera window, then adjust until the twin matches the live picture. Values are stored in this browser; export them to keep them.')}</p>
    <details open><summary>${t('Video delay')}</summary>
      <label>${t('Show telemetry from')} <input type="number" min="0" max="300" step="1" data-k="delay" value="${num(CALIB.delay)}"> ${t('s ago')}</label>
      <p class="note">${t('Live video usually runs 20 to 60 s behind the telemetry. The solar arrays turn about 4° per minute.')}</p></details>
    <details open><summary>Canadarm2 (SSRMS)</summary>
      <p class="note">${t('Model angle = sign × telemetry + offset. Built-in sign/offset:')} ${SSRMS_CONV.s.map((s, i) => `${SSRMS_J[i]} ${s < 0 ? '−' : '+'}${SSRMS_CONV.o[i] ? '/' + SSRMS_CONV.o[i] : ''}`).join(' ')}</p>
      <table>${SSRMS_J.map((n, i) => jointRow('ssrms', i, n, SSRMS_PUI[i])).join('')}</table></details>
    <details><summary>${t('MBS grapple fixtures')}</summary>
      <p class="note">${t('Roll of the fixture the arm is based on, in degrees. Empty = learned from live poses.')}</p>
      <table>${MBS_IDS.map(id => `<tr><td>PDGF ${id}</td><td><input type="number" step="45" data-mbs="${id}" value="${CALIB.mbsRoll[id] ?? ''}" placeholder="auto"></td></tr>`).join('')}</table></details>
    <details><summary>Dextre (SPDM)</summary>
      <table>${DEXTRE_PUI.map((p, i) => jointRow('dextre', i, i === 14 ? t('Body roll') : DEXTRE_NAME(i), p)).join('')}
      <tr><td>${t('Mount roll')}</td><td></td><td><input type="number" step="15" data-k="dextreRoll" value="${num(CALIB.dextreRoll)}"></td><td></td></tr></table></details>
    <details><summary>${t('Solar arrays and antennas')}</summary>
      <p class="note">${t('Extra offset in degrees on top of the built-in calibration.')}</p>
      <table>${CAL_KEYS.filter(k => CAL[k]).map(k => `<tr><td>${k}</td><td class="live">${CAL[k].sign < 0 ? '−' : '+'}1, ${CAL[k].offset}°</td>
        <td><input type="number" step="0.5" data-cal="${k}" value="${num(CALIB.cal[k])}"></td></tr>`).join('')}</table></details>
    <details><summary>${t('Camera position')}${camId() ? ' · ' + camId() : ''}</summary>
      ${v ? `<table>${(EXTCAM.list.find(c => c.id === camId())?.custom ? [['px', 'm', 0.5], ['py', 'm', 0.5], ['pz', 'm', 0.5]].map(([k, u, s]) => `<tr><td>${k}</td><td><input type="number" step="${s}" data-cam="${k}" value="${v[k] ?? EXTCAM.list.find(c => c.id === camId()).pos[{ px: 0, py: 1, pz: 2 }[k]]}"> ${u}</td></tr>`).join('') : '')}${CAM_KEYS.filter(([k]) => k[0] !== 'p').map(([k, u, s]) => `<tr><td>${k}</td><td><input type="number" step="${s}" data-cam="${k}" value="${num(v[k])}"> ${u}</td></tr>`).join('')}</table>
        <p class="note">${t('Shifts the twin camera along its own axes (x right, y up, z back) and rolls it about the view axis.')}</p>`
        : `<p class="note">${t('Open a camera in the camera window first.')}</p>`}</details>
    <div class="row"><button data-act="export">${t('Export')}</button><button data-act="import">${t('Import')}</button><button data-act="reset">${t('Reset')}</button></div>
    <div class="row" data-io hidden><textarea spellcheck="false"></textarea><button data-act="apply">${t('Apply')}</button></div>`;
    tick();
  }

  // Exportiert wird alles, was das Feld einstellt, auch die Kameraverschiebung aller Kameras.
  const exportObj = () => {
    const cams = {};
    for (const [id, v] of Object.entries(EXTCAM?.state?.view || {})) {
      const o = Object.fromEntries(CAM_KEYS.map(([k]) => [k, v[k]]).filter(([, x]) => x));
      if (Object.keys(o).length) cams[id] = { ...o, pan: v.pan, tilt: v.tilt, fov: v.fov, optic: v.optic };
    }
    return { version: 1, exported: new Date().toISOString(), calib: CALIB, cameras: cams };
  };
  function importObj(o) {
    const c = o.calib || o;
    for (const k of ['delay', 'dextreRoll']) if (c[k] != null) CALIB[k] = num(c[k]);
    for (const g of ['ssrms', 'dextre']) if (c[g]) {
      if (Array.isArray(c[g].flip)) c[g].flip.forEach((x, i) => { if (i < CALIB[g].flip.length) CALIB[g].flip[i] = !!x; });
      if (Array.isArray(c[g].off)) c[g].off.forEach((x, i) => { if (i < CALIB[g].off.length) CALIB[g].off[i] = num(x); });
    }
    if (c.mbsRoll) CALIB.mbsRoll = Object.fromEntries(Object.entries(c.mbsRoll).filter(([, x]) => x !== '' && x != null && isFinite(+x)).map(([k, x]) => [k, +x]));
    if (c.cal) CALIB.cal = Object.fromEntries(Object.entries(c.cal).filter(([k, x]) => CAL[k] && isFinite(+x)).map(([k, x]) => [k, +x]));
    if (o.cameras && EXTCAM?.state) {
      EXTCAM.state.view ||= {};
      for (const [id, v] of Object.entries(o.cameras)) Object.assign(EXTCAM.state.view[id] ||= {}, v);
      EXTCAM.save?.();
    }
    changed(); render();
  }

  el.addEventListener('input', e => {
    const d = e.target.dataset;
    if (d.k) CALIB[d.k] = num(e.target.value);
    else if (d.flip) { const [g, i] = d.flip.split(':'); CALIB[g].flip[+i] = e.target.checked; }
    else if (d.off) { const [g, i] = d.off.split(':'); CALIB[g].off[+i] = num(e.target.value); }
    else if (d.mbs) { if (e.target.value === '') delete CALIB.mbsRoll[d.mbs]; else CALIB.mbsRoll[d.mbs] = num(e.target.value); }
    else if (d.cal) CALIB.cal[d.cal] = num(e.target.value);
    else if (d.cam) { const v = camView(); if (v) { v[d.cam] = num(e.target.value); EXTCAM.save?.(); } return; }
    else return;
    changed();
  });
  el.addEventListener('click', e => {
    const a = e.target.dataset?.act; if (!a) return;
    const io = el.querySelector('[data-io]'), ta = io?.querySelector('textarea');
    if (a === 'close') el.hidden = true;
    else if (a === 'export') {
      const txt = JSON.stringify(exportObj(), null, 1);
      io.hidden = false; ta.value = txt; ta.select();
      try { navigator.clipboard?.writeText(txt); } catch (err) {}
      try {
        const url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
        const link = Object.assign(document.createElement('a'), { href: url, download: `iss-calibration-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) {}
      logEvent(t('Calibration exported'));
    } else if (a === 'import') { io.hidden = false; ta.value = ''; ta.placeholder = t('Paste exported JSON here'); ta.focus(); }
    else if (a === 'apply') {
      try { importObj(JSON.parse(ta.value)); logEvent(t('Calibration imported')); }
      catch (err) { logEvent(t('Calibration import failed: {0}', err.message), 'warn'); }
    } else if (a === 'reset') {
      if (!confirm(t('Reset all calibration values to the built-in defaults?'))) return;
      importObj({ calib: { delay: 0, dextreRoll: 0, ssrms: { flip: Array(7).fill(false), off: Array(7).fill(0) },
        dextre: { flip: Array(15).fill(false), off: Array(15).fill(0) }, mbsRoll: {}, cal: {} } });
      const v = camView(); if (v) { for (const [k] of CAM_KEYS) delete v[k]; EXTCAM.save?.(); render(); }
    }
  });

  // Ziehen an der Kopfzeile
  el.addEventListener('pointerdown', e => {
    if (!e.target.closest('header') || e.target.closest('button')) return;
    const r = el.getBoundingClientRect(), x0 = e.clientX - r.left, y0 = e.clientY - r.top;
    const mv = ev => { el.style.left = Math.max(0, Math.min(innerWidth - 60, ev.clientX - x0)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 30, ev.clientY - y0)) + 'px'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });

  // Live-Werte zweimal pro Sekunde auffrischen, solange das Feld offen ist.
  function tick() { if (el.hidden) return; for (const c of el.querySelectorAll('[data-live]')) c.textContent = fmt(read(c.dataset.live)); }
  setInterval(tick, 500);

  let lastCam = null;
  const open = () => { lastCam = camId(); render(); el.hidden = false; };
  const toggle = () => el.hidden ? open() : (el.hidden = true);
  // Kamerawechsel: den Kamerateil neu aufbauen
  setInterval(() => { if (!el.hidden && camId() !== lastCam) { lastCam = camId(); render(); } }, 1000);

  // Knopf in die Kopfzeile des Kamerafensters, vor „Main view“
  const head = document.querySelector('#camWin header');
  if (head) {
    const b = document.createElement('button'); b.id = 'camCalib'; b.textContent = t('Calibrate');
    b.title = t('Adjust zero points and signs of the moving parts against the live picture');
    b.onclick = toggle; head.insertBefore(b, head.querySelector('#camMain'));
  }
  return { open, close: () => { el.hidden = true; }, toggle, export: exportObj, import: importObj, el };
}
