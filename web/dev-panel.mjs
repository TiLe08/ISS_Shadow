/* dev-panel.mjs: Entwicklermodus (v1.22). Ein verstecktes Fenster, mit dem sich Ereignisse von Hand
   auslösen lassen, um Animationen und Anzeigen zu prüfen, ohne auf echte Ereignisse zu warten:
   - Besuchsfahrzeuge: an einem freien Port ein Fahrzeug anfliegen lassen oder sofort hinsetzen,
     ein angedocktes Fahrzeug abfliegen lassen oder sofort entfernen. Die Abläufe kommen aus proxops.mjs.
   - Außenbordeinsatz: Crewlock auspumpen (die Quest-Luke öffnet sich), Einsatz beenden (Wiederbefüllen,
     Luke schließt), dazu ein Eintrag wie aus Launch Library 2 in der Aktivitätenliste.
   - Bewegliche Teile: Telemetriewerte von Gelenken (SARJ, BGA, TRRJ, MT, Canadarm2, Dextre, Ku-Antenne)
     und dem Spitzen-LEE von Hand setzen. Der Wert läuft mit der Gelenkrate (mal Zeitraffer) zum Ziel.
   Alles ist reine Anzeige: Es wird nichts gesendet und nichts protokolliert außer Meldungen im
   Ereignisprotokoll mit dem Vorsatz [DEV]. Ausschalten des Entwicklermodus verwirft alle Eingriffe.
   Die Oberfläche ist nur englisch (keine Übersetzungen, Wunsch von Tim).

   Der Zustand liegt in DEV (iss_twin.html): tm (PUI -> {v, goal, rate, wrap}), vv (Port -> Fahrzeug
   oder null = frei), anim (Port -> laufender Ablauf), eva (Einsatz), speed (Zeitraffer).
   Reine Funktionen (devState, devDuration, stepOverrides) ohne Browser prüfbar. */
import * as PROXOPS from './proxops.mjs';
import { makeFrame } from './window-frame.mjs';

export const DEV_SPEEDS = [1, 10, 30, 60, 120, 300];
/* Angelegte Fahrzeuge (Cygnus, HTV-X) verkürzt: Der echte Ablauf hält bis zu 2 h am Einfangpunkt und
   überlässt den Rest Canadarm2. Hier: Anflug wie in proxops bis 10 m, kurz halten, dann den Weg vom
   Einfangpunkt zum CBM geradlinig (der Arm bewegt sich dabei nicht; vereinfacht). Abflug umgekehrt. */
export const BERTH_APPROACH = 1800, BERTH_HOLD = 120, BERTH_MOVE = 300;
const SETTLE_DEV = 120;                 // nach dem Kontakt noch so lange im Ablauf (s), dann angedockt
const smooth = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);

// Dauer eines Dev-Ablaufs in Sekunden (Ablaufzeit, vor dem Zeitraffer).
export function devDuration(type, kind) {
  const f = PROXOPS.FAMILY[type]; if (!f) return 0;
  if (f === 'berth') return kind === 'arrive' ? BERTH_APPROACH + BERTH_HOLD + BERTH_MOVE : BERTH_MOVE + BERTH_HOLD + PROXOPS.tail(f);
  return kind === 'arrive' ? PROXOPS.lead(f) + SETTLE_DEV : PROXOPS.tail(f);
}
/* Zustand eines Dev-Ablaufs u Sekunden nach seinem Beginn, im Format von PROXOPS.stateAt
   ({ active, done, d, cone, phase, speed, family, berth }). */
export function devState(type, kind, u) {
  const f = PROXOPS.FAMILY[type]; if (!f || !isFinite(u)) return { active: false, done: true };
  const total = devDuration(type, kind);
  if (u >= total) return { active: false, done: true };
  const at = (d, phase, extra = {}) => ({ active: true, done: false, d, cone: 1, phase, speed: 0, family: f, berth: f === 'berth', ...extra });
  if (f === 'berth') {
    const C = PROXOPS.CAPTURE_DIST;
    if (kind === 'arrive') {
      if (u < BERTH_APPROACH) return { ...PROXOPS.stateAt(type, 'arrive', -PROXOPS.lead(f) + u * (PROXOPS.lead(f) - 7200) / BERTH_APPROACH), done: false };
      if (u < BERTH_APPROACH + BERTH_HOLD) return at(C, 'Holding at the capture point (10 m), Canadarm2 captures');
      const k = (u - BERTH_APPROACH - BERTH_HOLD) / BERTH_MOVE;
      return at(C * (1 - smooth(k)), 'Canadarm2 berthing to the CBM (dev: straight line, arm not moved)');
    }
    if (u < BERTH_MOVE) return at(C * smooth(u / BERTH_MOVE), 'Canadarm2 unberthing (dev: straight line, arm not moved)');
    if (u < BERTH_MOVE + BERTH_HOLD) return at(C, 'Held by Canadarm2 at the release point');
    return { ...PROXOPS.stateAt(type, 'depart', u - BERTH_MOVE - BERTH_HOLD), done: false };
  }
  if (kind === 'arrive') return { ...PROXOPS.stateAt(type, 'arrive', u - PROXOPS.lead(f)), done: false };
  return { ...PROXOPS.stateAt(type, 'depart', u), done: false };
}
const wrap360 = x => ((x % 360) + 360) % 360;
/* Lässt jeden gesetzten Wert mit seiner Rate (Einheit/s, mal speed) zum Ziel laufen; Winkel mit wrap
   auf dem kürzeren Weg über 0/360. speed = Infinity oder rate 0: sofort. Gibt true zurück, solange
   sich noch etwas bewegt. */
export function stepOverrides(tm, dt, speed) {
  let moving = false;
  for (const o of Object.values(tm)) {
    if (!(o.rate > 0) || !isFinite(speed)) { o.v = o.goal; continue; }
    let d = o.goal - o.v; if (o.wrap) d = ((d % 360) + 540) % 360 - 180;
    const m = o.rate * speed * dt;
    if (Math.abs(d) <= m) o.v = o.goal; else { o.v += Math.sign(d) * m; moving = true; }
    if (o.wrap) o.v = wrap360(o.v);
  }
  return moving;
}

const CSS = `
#devWin{position:fixed;right:14px;top:56px;width:470px;height:min(640px,calc(100vh - 80px));z-index:60;display:flex;flex-direction:column;background:var(--panel-solid,#06121a);border:1px solid var(--acc2);box-shadow:0 10px 40px rgba(0,0,0,.6);color:var(--fg);font:12px/1.35 var(--f-body,system-ui)}
#devWin[hidden]{display:none}
#devWin header{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--line2);background:rgba(var(--acc2-rgb),.08)}
#devWin header b{font:600 11px var(--f-disp,system-ui);letter-spacing:.16em;text-transform:uppercase;color:var(--acc2);margin-right:auto}
#devWin .tabs{display:flex;gap:0;border-bottom:1px solid var(--line)}
#devWin .tabs button{flex:1;background:none;border:0;border-bottom:2px solid transparent;color:var(--dim);padding:6px;font:600 10px var(--f-disp,system-ui);letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
#devWin .tabs button[aria-pressed="true"]{color:var(--acc2);border-bottom-color:var(--acc2)}
#devWin .body{flex:1;overflow:auto;padding:8px}
#devWin .note{color:var(--dim);font-size:11px;margin:4px 0 8px}
#devWin .port{border:1px solid var(--line);padding:6px;margin-bottom:6px}
#devWin .port.dev{border-color:color-mix(in srgb,var(--acc2) 55%,transparent)}
#devWin .port .hd{display:flex;justify-content:space-between;gap:6px;margin-bottom:4px}
#devWin .port .hd b{font-weight:600}
#devWin .port .st{color:var(--dim);text-align:right}
#devWin .port .st.busy{color:var(--acc2)}
#devWin .act{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
#devWin input[type=text],#devWin input[type=number],#devWin select{background:var(--bg);border:1px solid var(--line2);color:var(--fg);padding:2px 4px;font:inherit}
#devWin input[type=text]{flex:1;min-width:110px}
#devWin .bar{height:3px;background:var(--line);margin-top:4px}#devWin .bar i{display:block;height:100%;background:var(--acc2)}
#devWin details{border:1px solid var(--line);margin-bottom:6px}
#devWin summary{padding:5px 8px;cursor:pointer;font:600 10px var(--f-disp,system-ui);letter-spacing:.14em;text-transform:uppercase;display:flex;gap:6px;align-items:center}
#devWin summary span{margin-left:auto}
#devWin .jr{display:grid;grid-template-columns:118px 1fr 66px 52px 20px;gap:5px;align-items:center;padding:2px 8px}
#devWin .jr input[type=range]{width:100%}
#devWin .jr output{color:var(--dim);font-variant-numeric:tabular-nums;text-align:right;font-size:11px}
#devWin .jr.on label{color:var(--acc2)}
#devWin .jr .x{background:none;border:0;color:var(--dim);cursor:pointer;padding:0}
#devWin .jr .x:hover{color:var(--acc2)}
#devWin .foot{display:flex;gap:6px;align-items:center;padding:6px 8px;border-top:1px solid var(--line);flex-wrap:wrap}
#devWin .grid2{display:grid;grid-template-columns:120px 1fr;gap:5px 8px;align-items:center;margin-bottom:8px}
`;
const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (x, d = 1) => isFinite(x) ? Number(x).toFixed(d) : '--';
const fmtDist = d => !isFinite(d) ? '--' : d >= 1000 ? (d / 1000).toFixed(2) + ' km' : d.toFixed(d < 10 ? 2 : 0) + ' m';

/* ctx: { DEV, portName, portTypes, typeName, cur() (Port -> angedocktes Fahrzeug), active() (PROX.active),
   raw(p) (Telemetriewert ohne Eingriff), joints (Gruppen [{group, items:[{pui, label, min, max, step, unit,
   rate, wrap, def, options}]}]), crew() (Namen an Bord), log(text), resetPayloads(), cmdActive() } */
export function setupDevPanel(ctx) {
  const { DEV } = ctx;
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const win = document.createElement('div'); win.id = 'devWin'; win.hidden = true; win.setAttribute('data-i18n-skip', '');
  win.innerHTML = `<header><b>Dev mode</b>
      <label title="Time-lapse for approaches, departures, airlock and joint motion">Speed <select id="devSpeed">${DEV_SPEEDS.map(s => `<option value="${s}">${s}×</option>`).join('')}</select></label>
      <button class="btn sm" id="devClose" title="Close (dev overrides stay active)">×</button></header>
    <div class="tabs"><button data-tab="vv" aria-pressed="true">Vehicles</button><button data-tab="eva" aria-pressed="false">Spacewalk</button><button data-tab="mov" aria-pressed="false">Moving parts</button></div>
    <div class="body" id="devBody"><div data-pane="vv"></div><div data-pane="eva" hidden></div><div data-pane="mov" hidden></div></div>
    <div class="foot"><span class="note" id="devSum" style="margin:0;flex:1"></span><button class="btn sm warn" id="devReset" title="Drop every dev override and go back to the data">Reset all</button></div>`;
  document.body.append(win);
  const $ = s => win.querySelector(s);
  makeFrame(win, $('header'), { key: 'iss.devwin', minW: 380, minH: 260 });
  $('#devSpeed').value = String(DEV.speed);
  $('#devSpeed').onchange = e => { DEV.speed = +e.target.value; };
  $('#devClose').onclick = () => close();
  $('#devReset').onclick = () => { ctx.reset(); ctx.log('[DEV] all overrides dropped, back to the data'); render(true); };
  let tab = 'vv';
  win.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    tab = b.dataset.tab; win.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    win.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== tab); render(true);
  });

  /* ---------- Fahrzeuge ---------- */
  const vvPane = $('[data-pane="vv"]'), rowKeys = {};
  vvPane.innerHTML = `<p class="note">Per port: let a vehicle fly its approach or departure (proxops timeline, time-lapse above), or place / remove it at once. Overrides replace the data for that port until you reset it. Cygnus and HTV-X are berthed in a shortened, simplified way (no arm motion).</p>`
    + Object.keys(ctx.portTypes).map(p => `<div class="port" data-port="${p}"></div>`).join('');
  function portState(port) {
    const a = DEV.anim[port]; if (a) return { kind: 'anim', a };
    const pa = ctx.active()[port]; if (pa) return { kind: 'busy', pa };
    const c = ctx.cur()[port]; if (c) return { kind: 'docked', c };
    return { kind: 'free' };
  }
  function renderPort(el, force) {
    const port = el.dataset.port, s = portState(port), ovr = port in DEV.vv;
    const key = [s.kind, s.c?.name, s.c?.type, s.a?.kind, s.a?.v.name, ovr].join('|');
    let st = '', cls = '';
    if (s.kind === 'anim') { st = `${s.a.kind === 'arrive' ? 'Arriving' : 'Departing'} · ${fmtDist(ctx.active()[port]?.st.d)}`; cls = 'busy'; }
    else if (s.kind === 'busy') { st = `${s.pa.v.name} · ${s.pa.st.phase} (${s.pa.src})`; cls = 'busy'; }
    else if (s.kind === 'docked') st = esc(s.c.name) + (s.c.dev ? ' (dev)' : '');
    else st = ovr ? 'free (dev)' : 'free';
    if (force || rowKeys[port] !== key) {
      rowKeys[port] = key; el.classList.toggle('dev', ovr || s.kind === 'anim');
      const types = ctx.portTypes[port], reset = ovr ? `<button class="btn sm" data-do="data" title="Forget the override, show what the data says">Back to data</button>` : '';
      let act = '';
      if (s.kind === 'anim') act = `<button class="btn sm" data-do="skip">Skip to end</button><button class="btn sm" data-do="cancel">Cancel</button>`;
      else if (s.kind === 'busy') act = `<span class="note" style="margin:0">Running from the data.</span><button class="btn sm" data-do="remove">Remove</button>`;
      else if (s.kind === 'docked') act = `<button class="btn sm" data-do="depart">▶ Undock</button><button class="btn sm" data-do="remove" title="Remove at once, no animation">Remove</button>`;
      else act = `<select data-f="type">${types.map(ty => `<option value="${ty}">${esc(ctx.typeName[ty])}</option>`).join('')}</select>
        <input type="text" data-f="name" placeholder="Name (optional)"><button class="btn sm" data-do="arrive">▶ Dock</button><button class="btn sm" data-do="place" title="Put it on the port at once, no animation">Place</button>`;
      el.innerHTML = `<div class="hd"><b>${esc(ctx.portName[port])}</b><span class="st ${cls}"></span></div><div class="act">${act}${reset}</div>${s.kind === 'anim' ? '<div class="bar"><i></i></div>' : ''}`;
    }
    const se = el.querySelector('.st'); if (se.innerHTML !== st) se.innerHTML = st; se.className = 'st ' + cls;
    if (s.kind === 'anim') { const bar = el.querySelector('.bar i'), tot = devDuration(s.a.v.type, s.a.kind); if (bar) bar.style.width = Math.min(100, 100 * s.a.el / tot).toFixed(1) + '%';
      const ph = ctx.active()[port]?.st.phase; if (ph) se.title = ph; }
  }
  vvPane.addEventListener('click', e => {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const el = b.closest('[data-port]'), port = el.dataset.port, what = b.dataset.do, pn = ctx.portName[port];
    const typeSel = el.querySelector('[data-f="type"]'), type = typeSel?.value, name = (el.querySelector('[data-f="name"]')?.value || '').trim() || (type ? ctx.typeName[type] + ' (dev)' : '');
    if (what === 'arrive' || what === 'place') {
      if (ctx.cur()[port] || DEV.anim[port]) { ctx.log(`[DEV] ${pn} is not free`, 'warn'); return; }
      if (what === 'place') { DEV.vv[port] = { name, type }; ctx.log(`[DEV] ${name} placed at ${pn}`); }
      else { DEV.anim[port] = { kind: 'arrive', v: { name, type }, el: 0, last: Date.now() }; ctx.log(`[DEV] ${name} approaching ${pn}`); }
    } else if (what === 'depart') {
      const c = ctx.cur()[port]; if (!c) return;
      DEV.anim[port] = { kind: 'depart', v: { name: c.name, type: c.type }, el: 0, last: Date.now() }; ctx.log(`[DEV] ${c.name} departing from ${pn}`);
    } else if (what === 'remove') { const c = ctx.cur()[port] || ctx.active()[port]?.v; DEV.vv[port] = null; delete DEV.anim[port]; ctx.log(`[DEV] ${c?.name || 'vehicle'} removed from ${pn}`); }
    else if (what === 'skip') { const a = DEV.anim[port]; if (a) a.el = devDuration(a.v.type, a.kind); }
    else if (what === 'cancel') { delete DEV.anim[port]; ctx.log(`[DEV] sequence at ${pn} cancelled`); }
    else if (what === 'data') { delete DEV.vv[port]; delete DEV.anim[port]; ctx.log(`[DEV] ${pn} back to the data`); }
    render(true);
  });

  /* ---------- Außenbordeinsatz ---------- */
  const evaPane = $('[data-pane="eva"]');
  function renderEva(force) {
    const e = DEV.eva, p = ctx.read('AIRLOCK000049'), ov = 'AIRLOCK000049' in DEV.tm;
    const key = [!!e, e?.end ? 1 : 0].join('|');
    if (force || evaPane.dataset.key !== key) {
      evaPane.dataset.key = key;
      const crew = ctx.crew();
      evaPane.innerHTML = `<p class="note">Starts a spacewalk the way the twin would see a real one: the Quest crewlock is pumped down (the EV hatch opens inward once it is below 5 mmHg), the station mode goes to external operations, and a Launch Library 2 style entry shows up under Current activities. Crew positions outside are not modeled (no public source).</p>
        <div class="grid2"><label for="devEvaName">Name</label><input type="text" id="devEvaName" value="${esc(e?.name || 'Dev spacewalk')}" ${e ? 'disabled' : ''}>
        <label for="devEv1">EV1</label><input type="text" id="devEv1" value="${esc(e?.crew[0]?.name || crew[0] || 'Astronaut 1')}" ${e ? 'disabled' : ''}>
        <label for="devEv2">EV2</label><input type="text" id="devEv2" value="${esc(e?.crew[1]?.name || crew[1] || 'Astronaut 2')}" ${e ? 'disabled' : ''}>
        <label>Crewlock</label><span id="devEvaP"></span><label>EV hatch</label><span id="devEvaH"></span></div>
        <div class="act">${!e || e.end ? '<button class="btn sm" data-eva="start">▶ Start spacewalk</button>' : '<button class="btn sm" data-eva="stop">■ End spacewalk (ingress)</button>'}
        ${e ? '<button class="btn sm" data-eva="clear">Clear</button>' : ''}
        <button class="btn sm" data-eva="vac" title="Jump the crewlock to vacuum">Crewlock to vacuum now</button><button class="btn sm" data-eva="press" title="Jump the crewlock to cabin pressure">Repress now</button></div>`;
    }
    const pe = $('#devEvaP'), he = $('#devEvaH');
    if (pe) pe.textContent = `${fmt(p, 1)} mmHg${ov ? ' (dev' + (DEV.tm.AIRLOCK000049.v !== DEV.tm.AIRLOCK000049.goal ? ', moving to ' + fmt(DEV.tm.AIRLOCK000049.goal, 0) : '') + ')' : ' (telemetry)'}`;
    if (he) he.textContent = ctx.hatch();
  }
  const PRESS = 760, DEPRESS_RATE = 0.5;        // mmHg, mmHg/s (Schätzung: etwa 25 min ohne Zeitraffer)
  const setTm = (p, goal, rate = 0, from) => { const o = DEV.tm[p]; DEV.tm[p] = { v: o ? o.v : isFinite(from) ? from : goal, goal, rate }; };
  evaPane.addEventListener('click', ev => {
    const b = ev.target.closest('[data-eva]'); if (!b) return; const what = b.dataset.eva;
    const cabin = () => { const r = ctx.raw('AIRLOCK000049'); return isFinite(r) && r > 100 ? r : PRESS; };
    if (what === 'start') {
      const name = $('#devEvaName').value.trim() || 'Dev spacewalk';
      DEV.eva = { name, start: new Date().toISOString(), end: null, location: 'International Space Station', crew: [['EV1', $('#devEv1').value], ['EV2', $('#devEv2').value]].filter(x => x[1].trim()).map(([role, n]) => ({ name: n.trim(), role })) };
      setTm('AIRLOCK000049', 0, DEPRESS_RATE, cabin()); setTm('USLAB000086', 16);
      ctx.log(`[DEV] spacewalk started: ${name}, crewlock depressurising`);
    } else if (what === 'stop' && DEV.eva) {
      DEV.eva.end = new Date().toISOString(); setTm('AIRLOCK000049', cabin(), DEPRESS_RATE); delete DEV.tm.USLAB000086;
      ctx.log(`[DEV] spacewalk ended: ${DEV.eva.name}, crewlock repressurising`);
    } else if (what === 'clear') { DEV.eva = null; delete DEV.tm.AIRLOCK000049; delete DEV.tm.USLAB000086; ctx.log('[DEV] spacewalk cleared'); }
    else if (what === 'vac') { DEV.tm.AIRLOCK000049 = { v: 0, goal: 0, rate: 0 }; }
    else if (what === 'press') { const c = cabin(); DEV.tm.AIRLOCK000049 = { v: c, goal: c, rate: 0 }; }
    render(true);
  });

  /* ---------- Bewegliche Teile ---------- */
  const movPane = $('[data-pane="mov"]'), items = {};
  movPane.innerHTML = `<p class="note">Sets telemetry values by hand (raw ISSLive units, before calibration). The value runs to the target at the joint rate times the speed above; tick "Instant" to jump. ✕ hands the channel back to telemetry. Works in Mirror mode; Command mode has its own controls. Pose prediction and calibration learning pause while any joint is overridden.</p>
    <div class="act" style="margin-bottom:8px"><label><input type="checkbox" id="devInstant"> Instant</label><button class="btn sm" id="devJointsOff">Release all joints</button><button class="btn sm" id="devPayReset" title="Forget where released payloads were left (iss.payloads)">Reset stored payloads</button></div>`
    + ctx.joints.map((g, gi) => `<details data-g="${gi}"${gi === 0 ? ' open' : ''}><summary>${esc(g.group)}<span class="note" style="margin:0" data-gc="${gi}"></span><button class="btn sm" data-goff="${gi}">Release</button></summary>`
      + g.items.map(it => { items[it.pui] = it; return it.options
        ? `<div class="jr" data-p="${it.pui}"><label>${esc(it.label)}</label><select data-in="sel"><option value="">(telemetry)</option>${it.options.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select><span></span><output></output><button class="x" title="Back to telemetry">✕</button></div>`
        : `<div class="jr" data-p="${it.pui}"><label title="${it.pui}">${esc(it.label)}</label><input type="range" data-in="r" min="${it.min}" max="${it.max}" step="${it.step || 0.1}"><input type="number" data-in="n" min="${it.min}" max="${it.max}" step="${it.step || 0.1}"><output></output><button class="x" title="Back to telemetry">✕</button></div>`; }).join('') + '</details>').join('');
  $('#devInstant').checked = !!DEV.instant; $('#devInstant').onchange = e => { DEV.instant = e.target.checked; };
  const release = p => { delete DEV.tm[p]; };
  $('#devJointsOff').onclick = () => { for (const p of Object.keys(items)) release(p); ctx.log('[DEV] all joints back to telemetry'); render(true); };
  $('#devPayReset').onclick = () => { ctx.resetPayloads(); ctx.log('[DEV] stored payload positions reset'); };
  const setGoal = (p, val) => {
    const it = items[p]; if (!isFinite(val)) return;
    if (!it.options) val = Math.min(it.max, Math.max(it.min, val));
    const o = DEV.tm[p], raw = ctx.raw(p), from = o ? o.v : isFinite(raw) ? raw : it.def ?? val;
    DEV.tm[p] = { v: from, goal: it.wrap ? wrap360(val) : val, rate: it.options ? 0 : it.rate, wrap: !!it.wrap };
  };
  movPane.addEventListener('input', e => {
    const row = e.target.closest('[data-p]'); if (!row) return; const p = row.dataset.p, k = e.target.dataset.in;
    if (k === 'sel') { if (e.target.value === '') release(p); else setGoal(p, +e.target.value); }
    else if (k === 'r' || k === 'n') { setGoal(p, +e.target.value); const other = row.querySelector(k === 'r' ? '[data-in="n"]' : '[data-in="r"]'); if (other) other.value = e.target.value; }
  });
  movPane.addEventListener('click', e => {
    const x = e.target.closest('.x'); if (x) { release(x.closest('[data-p]').dataset.p); return; }
    const g = e.target.closest('[data-goff]'); if (g) { e.preventDefault(); for (const it of ctx.joints[+g.dataset.goff].items) release(it.pui); }
  });
  function renderMov() {
    ctx.joints.forEach((g, gi) => { const n = g.items.filter(it => it.pui in DEV.tm).length, el = movPane.querySelector(`[data-gc="${gi}"]`); const s = n ? n + ' set' : ''; if (el.textContent !== s) el.textContent = s; });
    for (const row of movPane.querySelectorAll('[data-p]')) {
      const p = row.dataset.p, it = items[p], o = DEV.tm[p], cur = ctx.read(p);
      row.classList.toggle('on', !!o);
      const out = row.querySelector('output');
      if (it.options) { const s = row.querySelector('select'); if (document.activeElement !== s) s.value = o ? String(o.goal) : ''; const n = it.options.find(([v]) => v === Math.round(cur)); out.textContent = n ? '' : fmt(cur, 0); continue; }
      const goal = o ? o.goal : cur;
      for (const inp of row.querySelectorAll('input')) if (document.activeElement !== inp && isFinite(goal)) inp.value = String(Math.round(goal * 100) / 100);
      out.textContent = o && o.v !== o.goal ? fmt(o.v, 1) + (it.unit || '') : !o && !isFinite(ctx.raw(p)) ? 'no data' : '';
    }
  }

  /* ---------- Ablauf ---------- */
  let timer = 0;
  function summary() {
    const n = Object.keys(DEV.tm).length, v = Object.keys(DEV.vv).length, a = Object.keys(DEV.anim).length;
    const parts = [a && `${a} sequence${a > 1 ? 's' : ''} running`, v && `${v} port override${v > 1 ? 's' : ''}`, n && `${n} channel${n > 1 ? 's' : ''} set`, DEV.eva && !DEV.eva.end && 'spacewalk'].filter(Boolean);
    return (parts.length ? 'Active: ' + parts.join(', ') : 'No overrides, showing the data.') + (ctx.cmdActive() ? ' · Command mode: joint overrides have no effect.' : '');
  }
  function render(force = false) {
    if (win.hidden) return;
    try {
      if (tab === 'vv') vvPane.querySelectorAll('[data-port]').forEach(el => renderPort(el, force));
      else if (tab === 'eva') renderEva(force); else renderMov();
      const s = summary(), el = $('#devSum'); if (el.textContent !== s) el.textContent = s;
    } catch (e) { console.error(e); }
  }
  function open() { win.hidden = false; render(true); clearInterval(timer); timer = setInterval(render, 250); }
  function close() { win.hidden = true; clearInterval(timer); }
  return { open, close, toggle: () => win.hidden ? open() : close(), get open_() { return !win.hidden; }, render };
}
