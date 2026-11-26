// test_dev.mjs: Entwicklermodus (dev-panel.mjs, v1.22). Prüft die Dev-Abläufe (Dauer, Abstand, Ende),
// das Nachführen gesetzter Werte und auf der Seite: Ankunft an einem freien Port, Abdocken, Entfernen,
// Rückkehr zu den Daten, Luke der Crewlock und Gelenkwerte über tv().
import assert from 'node:assert/strict';
import * as DEVP from '../web/dev-panel.mjs'; import * as P from '../web/proxops.mjs';
import { loadTwin } from './harness.mjs';

// --- reine Funktionen ---
for (const type of Object.keys(P.FAMILY)) for (const kind of ['arrive', 'depart']) {
  const T = DEVP.devDuration(type, kind); assert.ok(T > 0, type + kind);
  const a = DEVP.devState(type, kind, 0), z = DEVP.devState(type, kind, T - 1);
  assert.ok(a.active && z.active, `${type} ${kind} aktiv am Anfang und Ende`);
  if (kind === 'arrive') { assert.ok(a.d > 50, type + ' beginnt weit weg'); assert.ok(z.d < 0.01, type + ' endet am Port'); }
  else { assert.ok(a.d < 0.01, type + ' beginnt am Port'); assert.ok(z.d > 100, type + ' endet weit weg'); }
  assert.ok(DEVP.devState(type, kind, T + 1).done, type + kind + ' fertig');
  for (let u = 0; u < T; u += 7) assert.ok(isFinite(DEVP.devState(type, kind, u).d), `${type} ${kind} Abstand bei ${u}`);
}
assert.equal(DEVP.devState('cygnus', 'arrive', DEVP.BERTH_APPROACH + 10).d, P.CAPTURE_DIST, 'Cygnus hält am Einfangpunkt');
{ const tm = { a: { v: 350, goal: 10, rate: 1, wrap: true }, b: { v: 0, goal: 5, rate: 1 }, c: { v: 0, goal: 2, rate: 0 } };
  DEVP.stepOverrides(tm, 1, 10); assert.equal(tm.a.v, 0, 'Winkel über 360 auf dem kurzen Weg'); assert.equal(tm.b.v, 5); assert.equal(tm.c.v, 2, 'Rate 0 springt');
  DEVP.stepOverrides(tm, 1, 10); assert.equal(tm.a.v, 10); }

// --- Seite ---
const { t } = await loadTwin(['buildISS', 'MODEL', 'LINK', 'VV', 'PROX', 'DEV', 'devReset', 'updateVehicles', 'updateProxOps', 'updateHatches', 'tv', 'ingest', 'liveJoints', 'resetPayloads']);
t.buildISS(); t.LINK.src = 'mqtt'; t.resetPayloads(); t.DEV.on = true;
const T0 = Date.parse('2026-11-20T12:00:00Z');
const frame = () => { t.updateVehicles(T0); t.updateProxOps(); };
frame();
const free = Object.keys(t.MODEL.vvG).map(k => k.split(':')).find(([p]) => !t.MODEL.vvCur[p]);
assert.ok(free, 'ein freier Port');
const [port, type] = free, g = t.MODEL.vvG[port + ':' + type];
t.DEV.anim[port] = { kind: 'arrive', v: { name: 'Test vehicle', type }, el: 0, last: Date.now() }; frame();
assert.ok(g.visible && t.PROX.active[port]?.dev, 'Dev-Anflug sichtbar und aktiv');
assert.ok(g.position.distanceTo(g.userData.dock.p) > 50, 'weit vor dem Port');
assert.ok(g.userData.label.element.textContent.includes('(dev)'), 'Beschriftung (dev)');
t.DEV.anim[port].el = DEVP.devDuration(type, 'arrive'); frame();
assert.ok(!t.DEV.anim[port] && t.DEV.vv[port]?.name === 'Test vehicle' && t.MODEL.vvCur[port]?.dev, 'nach dem Anflug angedockt');
frame(); assert.ok(g.visible && g.position.distanceTo(g.userData.dock.p) < 1e-9, 'am Port');
t.DEV.anim[port] = { kind: 'depart', v: { name: 'Test vehicle', type }, el: 600, last: Date.now() }; frame();
assert.ok(!t.MODEL.vvCur[port] && g.visible && g.position.distanceTo(g.userData.dock.p) > 1, 'fliegt ab');
t.DEV.anim[port].el = 1e6; frame(); frame();
assert.ok(t.DEV.vv[port] === null && !g.visible, 'nach dem Abflug frei');
delete t.DEV.vv[port]; frame(); assert.ok(!t.MODEL.vvCur[port], 'zurück zu den Daten');
const occ = Object.keys(t.MODEL.vvCur)[0]; t.DEV.vv[occ] = null; frame();
assert.ok(!t.MODEL.vvCur[occ], 'angedocktes Fahrzeug entfernt');
t.devReset(); frame(); assert.ok(t.MODEL.vvCur[occ], 'Zurücksetzen stellt die Daten wieder her');

// Gelenke und Außenbordeinsatz über gesetzte Telemetrie
t.DEV.tm.CSASSRMS004 = { v: 42, goal: 42, rate: 0 }; assert.equal(t.tv('CSASSRMS004'), 42); assert.equal(t.liveJoints().arm[0], 42, 'Gelenk folgt dem gesetzten Wert');
t.LINK.src = 'sim'; t.DEV.tm.AIRLOCK000049 = { v: 0, goal: 0, rate: 0 }; t.updateHatches();
assert.ok(t.MODEL.evHatch.userData.open && t.MODEL.evHatch.userData.k === 1, 'Luke offen, auch mit Sim-Quelle');
t.DEV.tm.AIRLOCK000049 = { v: 760, goal: 760, rate: 0 }; t.updateHatches();
assert.ok(!t.MODEL.evHatch.userData.open && t.MODEL.evHatch.userData.k < 1, 'Luke schließt schrittweise');
t.devReset();
console.log('PASS dev mode: dev sequences, port overrides, joint and airlock overrides');
