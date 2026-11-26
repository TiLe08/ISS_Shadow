// test_activities.mjs: „Current activities“ (activities.js) und das Panel im Dashboard.
//   - LL2-Außenbordeinsatz läuft (end leer) -> „Spacewalk in progress“ mit EV-Crew; beendet -> „ended“.
//   - Crewlock drucklos -> Luke offen; Druckabfall -> „depressurising“.
//   - Canadarm2, Dextre und MT: Bewegung aus dem Verlauf, ruhende Gelenke melden nichts.
//   - Verkehr aus Andockereignissen: Ankunft und Abflug in den nächsten 72 h, Kurs-Anflug.
//   - SARJ nicht im AUTOTRACK, Lagemanöver, Panel wird gefüllt.
import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import { loadTwin } from './harness.mjs';
const A = createRequire(import.meta.url)('../web/activities.js');
const now = Date.parse('2026-11-18T15:00:00Z'), H = 3600e3;
const ids = r => r.map(x => x.id);

// --- EVA aus LL2 ---
const crew = [{ name: 'Anil Menon', role: 'EV1' }, { name: 'Joshua Kutryk', role: 'EV2' }];
let r = A.derive({ now, spacewalks: [{ name: 'Expedition 75 EVA 7', start: '2026-11-18T12:00:00Z', end: null, location: 'International Space Station', crew }] });
const ev = r.find(x => x.id.startsWith('eva:'));
assert.equal(ev.state, 'now'); assert.match(ev.detail, /EV1 Anil Menon, EV2 Joshua Kutryk/); assert.match(ev.detail, /3 h elapsed/);
assert.ok(ids(r).includes('evapos'), 'Hinweis: Positionen draußen nicht öffentlich');
r = A.derive({ now, spacewalks: [{ name: 'EVA 6', start: '2026-11-18T05:00:00Z', end: '2026-11-18T11:30:00Z', crew }] });
assert.equal(r[0].state, 'recent'); assert.match(r[0].detail, /duration 6 h 30 min/);
r = A.derive({ now, spacewalks: [{ name: 'Tiangong EVA', start: '2026-11-18T12:00:00Z', end: null, location: 'Tiangong space station', crew }] });
assert.equal(r.length, 0, 'andere Station ignoriert');
r = A.derive({ now, events: [{ name: 'US EVA 95', type: 'EVA', date: '2026-11-19T12:00:00Z' }, { name: 'Press', type: 'Press Event', date: '2026-11-18T18:00:00Z' }] });
assert.deepEqual(ids(r), ['evaplan:US EVA 95']);

// --- Telemetrie: Crewlock, Robotik, Solarflügel, Lage ---
const tm = { AIRLOCK000049: 0.6, S0000008: 5, S0000009: 4, S0000003: 120, S0000004: 30, USLAB000081: 1, CSASSRMS011: 2, CSAMT000001: 287 };
const tr = new A.Tracker(A.TRACKED, 5000, 300);
for (let k = 0; k <= 24; k++) {          // 2 min: Arm-Schulter dreht 0,1°/5 s, Port-SARJ im Autotrack, MT steht
  const tk = now - (24 - k) * 5000, vals = { ...tm, CSASSRMS005: 10 + k * 0.1, CSASSRMS004: 5, S0000004: 30 + k * 0.33, CSASPDM0003: -50 };
  tr.sample(tk, p => vals[p] ?? NaN);
}
const v = p => p === 'S0000004' ? 30 + 24 * 0.33 : tm[p] ?? NaN;
r = A.derive({ now, telemetry: true, v, text: p => ({ CSASSRMS002: 'MBS PDGF3', CSAMT000002: '4' })[p] || '-', track: tr });
const has = id => r.find(x => x.id === id);
assert.ok(has('crewlock') && /vacuum/.test(has('crewlock').title));
assert.ok(has('ssrms'), 'Canadarm2 bewegt sich'); assert.match(has('ssrms').detail, /Joints SY · base MBS PDGF3 · tip LEE holding a payload/);
assert.ok(!has('spdm') && !has('mt'), 'Dextre und MT stehen');
assert.ok(has('sarj:S0000003'), 'Steuerbord-SARJ nicht im Autotrack'); assert.match(has('sarj:S0000003').detail, /DIR POS · holding 120.0°/);
assert.ok(!has('sarj:S0000004'), 'Backbord-SARJ im Autotrack');
assert.ok(has('mnvr'), 'Lagemanöver');
assert.equal(A.derive({ now, telemetry: false, v, track: tr }).length, 0, 'ohne Livewerte keine Telemetrie-Einträge');
// Druckabfall in der Crewlock
const tr2 = new A.Tracker(A.TRACKED, 5000, 300);
for (let k = 0; k <= 60; k++) tr2.sample(now - (60 - k) * 5000, p => p === 'AIRLOCK000049' ? 700 - k * 5 : NaN);
r = A.derive({ now, telemetry: true, v: p => p === 'AIRLOCK000049' ? 400 : NaN, track: tr2 });
assert.equal(r[0].title, 'Crewlock depressurising');

// --- Verkehr ---
r = A.derive({ now, telemetry: true, v: p => ({ RUSSEG000002: 1, RUSSEG000005: 850, RUSSEG000006: -0.8 })[p] ?? NaN, dockings: [
  { name: 'Progress MS-36', port: 'mrm2', t0: now + 5 * H, t1: Infinity },
  { name: 'Cargo Dragon C211 (CRS-35)', port: 'ida3', t0: now - 30 * 86400e3, t1: now + 20 * H },
  { name: 'Old', port: 'ida2', t0: now - 90 * 86400e3, t1: now - 30 * 86400e3 }], portName: p => p });
assert.deepEqual(ids(r).sort(), ['arr:Progress MS-36', 'dep:Cargo Dragon C211 (CRS-35)', 'kurs'].sort());
assert.match(r.find(x => x.id === 'kurs').detail, /Range 850 m · rate -0.80 m\/s/);

// --- Panel im Dashboard ---
const { t, dom } = await loadTwin(['buildPanels', 'updateActivities', 'VV', 'LINK']);
t.buildPanels(); t.VV.extra.spacewalks = [{ name: 'Expedition 75 EVA 7', start: new Date(Date.now() - H).toISOString(), end: null, location: 'International Space Station', crew }];
t.updateActivities();
const box = dom.window.document.querySelector('#actBox');
assert.ok(box && /Spacewalk in progress: Expedition 75 EVA 7/.test(box.textContent), 'Panel zeigt den laufenden Einsatz');
console.log('PASS Aktivitäten: EVA (LL2, Crewlock), Robotik, Verkehr, SARJ, Lage, Panel');
