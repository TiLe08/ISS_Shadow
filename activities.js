/* activities.js: „Current activities“ im Dashboard. Leitet aus Telemetrie und Launch Library 2
   ab, was gerade an der Station passiert: Außenbordeinsätze (EVA), Robotik (Canadarm2, Dextre,
   Mobile Transporter), Verkehr (Anflug, Andocken, Abdocken), Solarflügel und Radiatoren, Lage.

   Klassisches Skript (globalThis.ISSActivities, in Node per require). Keine Abhängigkeit von der
   Seite: derive() bekommt alle Eingaben als Objekt und liefert eine Liste von Einträgen
     { id, cat: 'eva'|'robotics'|'traffic'|'arrays'|'attitude', state: 'now'|'soon'|'recent'|'steady',
       title, detail, src, derived, info (nur Hinweis) }
   Telemetrie-Bewegungen erkennt Tracker: Er tastet ausgewählte Kanäle alle paar Sekunden ab und
   meldet die Änderung über ein Zeitfenster.

   Grenzen (Stand 18.11.2026, geprüft):
   - Kein öffentlicher Dienst meldet, wo sich die Astronauten bei einer EVA befinden. LL2 nennt,
     wer draußen ist (EV1/EV2) und wann, ISSLive nur den Druck in der Crewlock.
   - ISSLive hat keinen Lukenkanal; „Luke offen“ ist aus dem Crewlock-Druck abgeleitet.
   - Schwellen für „bewegt sich“ sind geschätzt (Rauschen der Winkel in ISSLive ist ≈ 0,01°). */
(function (root) {
  'use strict';
  const SSRMS = ['CSASSRMS004', 'CSASSRMS005', 'CSASSRMS006', 'CSASSRMS007', 'CSASSRMS008', 'CSASSRMS009', 'CSASSRMS010'];
  const SSRMS_J = ['SR', 'SY', 'SP', 'EP', 'WP', 'WY', 'WR'];
  const SPDM = ['CSASPDM0003', 'CSASPDM0004', 'CSASPDM0005', 'CSASPDM0006', 'CSASPDM0007', 'CSASPDM0008', 'CSASPDM0009',
    'CSASPDM0011', 'CSASPDM0012', 'CSASPDM0013', 'CSASPDM0014', 'CSASPDM0015', 'CSASPDM0016', 'CSASPDM0017', 'CSASPDM0020'];
  const BGA = { '1A': 'S4000007', '3A': 'S4000008', '3B': 'S6000007', '1B': 'S6000008', '2A': 'P4000007', '4A': 'P4000008', '4B': 'P6000007', '2B': 'P6000008' };
  // Kanäle, deren Verlauf der Tracker braucht (Winkel in Grad, MT in cm, Crewlock in mmHg).
  const ANGLES = [...SSRMS, ...SPDM, 'S0000001', 'S0000002', 'S0000003', 'S0000004', ...Object.values(BGA)];
  const TRACKED = [...ANGLES, 'CSAMT000001', 'AIRLOCK000049'];
  const JOINT_MODE = { 1: 'STANDBY', 2: 'RESTART', 3: 'CHECKOUT', 4: 'DIR POS', 5: 'AUTOTRACK', 6: 'BLIND', 7: 'SHUTDOWN', 8: 'SWITCHOVER' };
  const TH = { arm: 0.3, bga: 1.0, mt: 2.0, sarjSlew: 1.0 };   // Bewegungsschwellen je Fenster (geschätzt)
  const WIN = 120;                                             // s, Fenster für „bewegt sich“
  const CABIN = 700;                                           // mmHg: darüber gilt die Crewlock als unter Kabinendruck
  const VACUUM = 5;                                            // mmHg: darunter ist die Crewlock drucklos (wie updateHatches)

  /* Tracker: Ringpuffer [ms, Wert] je Kanal, höchstens alle stepMs ein Punkt, keep s lang. */
  class Tracker {
    constructor(chans = TRACKED, stepMs = 5000, keep = 300) { this.chans = chans; this.stepMs = stepMs; this.keep = keep; this.h = new Map(); this.last = -Infinity; }
    sample(now, get) {
      if (now - this.last < this.stepMs) return false; this.last = now;
      for (const p of this.chans) {
        const v = get(p); if (!isFinite(v)) continue;
        let a = this.h.get(p); if (!a) this.h.set(p, a = []);
        a.push([now, v]); while (a.length && a[0][0] < now - this.keep * 1000) a.shift();
      }
      return true;
    }
    reset() { this.h.clear(); this.last = -Infinity; }
    // Spannweite eines Kanals im Fenster win (s); Winkel werden über ±180° hinweg entfaltet.
    span(p, win = WIN, now = this.last) {
      const a = (this.h.get(p) || []).filter(x => x[0] >= now - win * 1000); if (a.length < 2) return 0;
      const ang = ANGLES.includes(p); let acc = 0, lo = 0, hi = 0;
      for (let i = 1; i < a.length; i++) { let d = a[i][1] - a[i - 1][1]; if (ang) d = ((d + 540) % 360) - 180; acc += d; lo = Math.min(lo, acc); hi = Math.max(hi, acc); }
      return hi - lo;
    }
    // Mittlere Änderung pro Minute (Winkel entfaltet) im Fenster win.
    rate(p, win = WIN, now = this.last) {
      const a = (this.h.get(p) || []).filter(x => x[0] >= now - win * 1000); if (a.length < 2) return NaN;
      const ang = ANGLES.includes(p); let acc = 0;
      for (let i = 1; i < a.length; i++) { let d = a[i][1] - a[i - 1][1]; if (ang) d = ((d + 540) % 360) - 180; acc += d; }
      const dt = (a[a.length - 1][0] - a[0][0]) / 60000; return dt > 0 ? acc / dt : NaN;
    }
    covered(win = WIN, now = this.last) { const a = this.h.get('S0000004') || this.h.values().next().value || []; return a.length > 1 && now - a[0][0] >= win * 500; }
  }

  // Dauer in Worten: 45 min, 3 h 20 min, 2 d.
  function dur(ms) {
    const m = Math.round(Math.abs(ms) / 60000); if (m < 60) return m + ' min';
    const h = Math.floor(m / 60); if (h < 48) return h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
    return Math.round(h / 24) + ' d';
  }
  const crewText = c => (c || []).map(x => (x.role ? x.role + ' ' : '') + x.name).join(', ');
  const isIss = s => !s.location || /international space station|\biss\b/i.test(s.location);

  /* derive(inp) -> Einträge. inp:
       now (ms), t (Übersetzung), telemetry (bool, echte Livewerte), stale (bool, Signal verloren),
       v(p) -> Zahl, text(p) -> Klartext eines Kanals, track (Tracker),
       spacewalks [{name, start, end, location, crew:[{name, role}]}], events [{name, type, date}],
       dockings [{name, port, t0, t1}], portName(port) -> Text, launches [{name, mission, net, status}] */
  function derive(inp) {
    const { now, v = () => NaN, text = p => String(v(p)), track } = inp, t = inp.t || ((s, ...a) => s.replace(/\{(\d)\}/g, (m, i) => a[i]));
    const out = [], add = (id, cat, state, title, detail, src, derived = false) => out.push({ id, cat, state, title, detail: detail || '', src, derived });
    const tmOk = !!inp.telemetry, tmSrc = 'ISSLive' + (inp.stale ? ' · ' + t('last value before LOS') : '');

    /* --- EVA --- */
    const walks = (inp.spacewalks || []).filter(isIss);
    let evaNow = false;
    for (const s of walks) {
      const a = Date.parse(s.start), b = s.end ? Date.parse(s.end) : NaN;
      if (!isFinite(a)) continue;
      if (a <= now && !(b <= now) && now - a < 14 * 3600e3) {
        evaNow = true;
        add('eva:' + s.name, 'eva', 'now', t('Spacewalk in progress: {0}', s.name), t('Outside: {0}', crewText(s.crew) || '-') + ' · ' + t('{0} elapsed', dur(now - a)), 'Launch Library 2');
      } else if (b <= now && now - b < 12 * 3600e3) {
        add('eva:' + s.name, 'eva', 'recent', t('Spacewalk ended: {0}', s.name), t('{0} ago', dur(now - b)) + ' · ' + t('duration {0}', dur(b - a)) + (s.crew?.length ? ' · ' + crewText(s.crew) : ''), 'Launch Library 2');
      }
    }
    for (const e of inp.events || []) {
      const d = Date.parse(e.date);
      if (!/eva|spacewalk/i.test((e.type || '') + ' ' + e.name) || !(d > now) || d - now > 48 * 3600e3) continue;
      if (walks.some(s => Math.abs(Date.parse(s.start) - d) < 6 * 3600e3)) continue;
      add('evaplan:' + e.name, 'eva', 'soon', t('Spacewalk planned: {0}', e.name), t('in {0}', dur(d - now)), 'Launch Library 2');
    }
    if (tmOk) {
      const p = v('AIRLOCK000049');
      if (isFinite(p) && p < VACUUM) { evaNow = true; add('crewlock', 'eva', 'now', t('Crewlock at vacuum, EV hatch open'), t('Crewlock {0} mmHg · crew can be outside', p.toFixed(1)), tmSrc, true); }
      else if (isFinite(p) && p < CABIN) {
        const r = track ? track.rate('AIRLOCK000049', 300) : NaN;
        const what = r < -0.5 ? t('Crewlock depressurising') : r > 0.5 ? t('Crewlock repressurising') : t('Crewlock below cabin pressure');
        add('crewlock', 'eva', 'now', what, t('Crewlock {0} mmHg', p.toFixed(0)), tmSrc, true);
      }
      if (v('USLAB000086') === 16) add('extops', 'eva', 'now', t('Station mode: external operations'), t('Set for spacewalks and robotics outside'), tmSrc);
      if (v('RUSSEG000001') === 5) add('rseva', 'eva', 'now', t('Russian segment in EVA mode'), '', tmSrc);
    }
    // Hinweis statt Eintrag (info): Die Seite zeigt ihn als Fußnote.
    if (evaNow) { add('evapos', 'eva', 'now', t('Positions of the crew outside'), t('Not published by NASA or any public API; only who is outside and the airlock state are known.'), '', false); out[out.length - 1].info = true; }

    /* --- Robotik --- */
    if (tmOk && track && track.covered()) {
      const mv = SSRMS.map((p, i) => [SSRMS_J[i], track.span(p)]).filter(x => x[1] > TH.arm);
      if (mv.length) {
        const lee = v('CSASSRMS011') === 2 ? ' · ' + t('tip LEE holding a payload') : '';
        add('ssrms', 'robotics', 'now', t('Canadarm2 moving'), t('Joints {0}', mv.map(x => x[0]).join(', ')) + ' · ' + t('base {0}', text('CSASSRMS002')) + lee, tmSrc, true);
      }
      if (SPDM.some(p => track.span(p) > TH.arm)) add('spdm', 'robotics', 'now', t('Dextre moving'), t('base {0}', text('CSASPDM0002')), tmSrc, true);
      const mt = track.span('CSAMT000001');
      if (mt > TH.mt) add('mt', 'robotics', 'now', t('Mobile Transporter translating'), t('{0} cm in the last 2 min · worksite {1}', mt.toFixed(0), text('CSAMT000002')), tmSrc, true);
    }

    /* --- Verkehr --- */
    const pn = inp.portName || (x => x || '-');
    for (const d of inp.dockings || []) {
      if (d.t0 > now && d.t0 - now < 72 * 3600e3) add('arr:' + d.name, 'traffic', 'soon', t('Arriving: {0}', d.name), t('Docking at {0} in {1}', pn(d.port), dur(d.t0 - now)), 'Launch Library 2');
      else if (d.t0 <= now && now - d.t0 < 6 * 3600e3) add('dock:' + d.name, 'traffic', 'recent', t('Docked: {0}', d.name), t('{0} · {1} ago', pn(d.port), dur(now - d.t0)), 'Launch Library 2');
      if (isFinite(d.t1) && d.t1 > now && d.t1 - now < 72 * 3600e3) add('dep:' + d.name, 'traffic', 'soon', t('Departing: {0}', d.name), t('Undocking from {0} in {1}', pn(d.port), dur(d.t1 - now)), 'Launch Library 2');
      else if (isFinite(d.t1) && d.t1 <= now && now - d.t1 < 6 * 3600e3) add('undock:' + d.name, 'traffic', 'recent', t('Undocked: {0}', d.name), t('{0} · {1} ago', pn(d.port), dur(now - d.t1)), 'Launch Library 2');
    }
    const arriving = out.filter(x => x.id.startsWith('arr:')).map(x => x.id.toLowerCase());
    for (const l of inp.launches || []) {
      const n = Date.parse(l.net), m = String(l.mission || l.name || '');
      if (!(n <= now) || now - n > 4 * 86400e3 || !/success|in flight|flight/i.test(l.status || '')) continue;
      if (arriving.some(a => a.includes(m.toLowerCase())) || (inp.dockings || []).some(d => d.t0 <= now && d.t0 > n && d.name.toLowerCase().includes(m.toLowerCase()))) continue;
      add('fly:' + m, 'traffic', 'now', t('En route to the ISS: {0}', m), t('launched {0} ago', dur(now - n)), 'Launch Library 2');
    }
    if (tmOk) {
      const kr = v('RUSSEG000005'), kv = v('RUSSEG000006');
      // Nur bei eingeschaltetem Kurs (Satz 1 oder 2 in Betrieb), sonst kann ein alter Entfernungswert stehen bleiben.
      if ((v('RUSSEG000002') === 1 || v('RUSSEG000003') === 1) && isFinite(kr) && kr > 1) add('kurs', 'traffic', 'now', t('Kurs approach active'), t('Range {0} m · rate {1} m/s', kr.toFixed(0), isFinite(kv) ? kv.toFixed(2) : '-'), tmSrc);
      if (v('USLAB000086') === 8) add('prox', 'traffic', 'now', t('Station mode: proximity operations'), t('A vehicle is approaching or leaving'), tmSrc);
      if (v('RUSSEG000001') === 4) add('rsprox', 'traffic', 'now', t('Russian segment in proximity-operations mode'), '', tmSrc);
    }

    /* --- Solarflügel und Radiatoren --- */
    if (tmOk) {
      const sarjs = [['Port SARJ', 'S0000004', 'S0000008'], ['Starboard SARJ', 'S0000003', 'S0000009']];
      const rates = [];
      for (const [nm, ang, mode] of sarjs) {
        const m = v(mode), r = track ? track.rate(ang) : NaN; rates.push(r);
        if (isFinite(m) && m !== 5) add('sarj:' + ang, 'arrays', 'now', t('{0} not sun-tracking', t(nm)),
          t('mode {0}', JOINT_MODE[m] || m) + (track && track.span(ang) > TH.sarjSlew ? ' · ' + t('slewing {0}°/min', r.toFixed(1)) : ' · ' + t('holding {0}°', v(ang).toFixed(1))), tmSrc);
      }
      for (const [nm, ang, mode] of [['Port radiator (TRRJ)', 'S0000002', 'S0000006'], ['Starboard radiator (TRRJ)', 'S0000001', 'S0000007']]) {
        const m = v(mode); if (isFinite(m) && m !== 5) add('trrj:' + ang, 'arrays', 'now', t('{0} not in autotrack', t(nm)), t('mode {0}', JOINT_MODE[m] || m), tmSrc);
      }
      if (track && track.covered()) {
        const bga = Object.entries(BGA).filter(([, p]) => track.span(p) > TH.bga).map(([k]) => k);
        if (bga.length) add('bga', 'arrays', 'now', t('Solar array wings rotating (BGA)'), bga.join(', '), tmSrc, true);
        if (v('S0000008') === 5 && v('S0000009') === 5 && rates.every(isFinite))
          add('track', 'arrays', 'steady', t('Solar arrays tracking the Sun'), t('SARJ port {0}°/min · stbd {1}°/min', rates[0].toFixed(1), rates[1].toFixed(1)), tmSrc);
      }
    }

    /* --- Lage und Antrieb --- */
    if (tmOk) {
      if (v('USLAB000081') === 1) add('mnvr', 'attitude', 'now', t('Attitude maneuver in progress'), '', tmSrc);
      if (v('USLAB000086') === 4 || v('RUSSEG000001') === 3) add('reboost', 'attitude', 'now', t('Reboost or orbit correction'), t('station mode {0}', text(v('USLAB000086') === 4 ? 'USLAB000086' : 'RUSSEG000001')), tmSrc);
      if (v('USLAB000012') === 7) add('drift', 'attitude', 'now', t('Free drift'), t('US attitude control off, usually around dockings'), tmSrc);
    }
    const order = { now: 0, soon: 1, recent: 2, steady: 3 };
    return out.sort((a, b) => order[a.state] - order[b.state]);
  }

  const api = { derive, Tracker, TRACKED, dur };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ISSActivities = api;
})(globalThis);
