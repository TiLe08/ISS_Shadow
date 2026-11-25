// test_proxops.mjs: An- und Abflug der Besuchsfahrzeuge (proxops.mjs) und Nahbereichsradar (radar.mjs).
//   - Abläufe: Abstand stetig und monoton, Dragon schließt die Nasenkappe vor dem Ausblenden, Kurs-Abstand
//     ersetzt die Schätzung, Ereignisarten und Namensabgleich, Port aus dem Ereignistext.
//   - Seite: Abdocken laut LL2 -> Fahrzeug fliegt entlang der Portachse weg und verschwindet danach;
//     russisches Portflag fällt -> Abflug ab dem Augenblick; geplantes Abdocken und geplante Ankunft aus dem
//     LL2-Ereignisplan; Vorschau ohne Protokolleintrag; Cygnus am Arm folgt dem Arm, nicht dem Ablauf.
//   - Radar: TLE-Epoche, LVLH-Achsen, Erkennung angedockter Fahrzeuge, Zeichnen ohne Fehler.
import assert from 'node:assert/strict'; import * as THREE from 'three';
import * as P from '../proxops.mjs'; import * as R from '../radar.mjs';
import { loadTwin } from './harness.mjs';

// --- Abläufe ---
for (const fam of ['dragon', 'kurs', 'berth']) for (const kind of ['arrive', 'depart']) {
  const k = P.SEQ[fam][kind].keys;
  let prev = null;
  for (let tt = k[0][0]; tt <= k[k.length - 1][0]; tt += 5) {
    const d = P.distanceAt(k, tt);
    if (prev !== null) { assert.ok(Math.abs(d - prev) < 15, `${fam} ${kind}: stetig bei ${tt}`); assert.ok(kind === 'arrive' ? d <= prev + 1e-9 : d >= prev - 1e-9, `${fam} ${kind}: monoton`); }
    prev = d;
  }
  assert.equal(P.distanceAt(k, 0), fam === 'berth' ? P.CAPTURE_DIST : 0, `${fam} ${kind}: bei t = 0 am Port bzw. (angelegt) am Einfang-/Freigabepunkt`);
}
{ const a = P.stateAt('crewDragon', 'depart', 30), b = P.stateAt('crewDragon', 'depart', 1000), z = P.stateAt('crewDragon', 'depart', 2000);
  assert.ok(a.active && a.cone === 1 && a.d > 0 && a.d < 3, 'Dragon direkt nach dem Abdocken: Kappe offen, wenige m');
  assert.ok(b.active && b.cone === 0 && b.d > 200, 'Kappe zu nach Verlassen der Sicherheitskugel');
  assert.ok(!z.active && z.done, 'Ablauf beendet');
  assert.ok(!P.stateAt('crewDragon', 'arrive', -4000).active && P.stateAt('crewDragon', 'arrive', -3000).active, 'Anflug beginnt 60 min vorher');
  assert.ok(P.stateAt('crewDragon', 'arrive', -100).speed < 0, 'Annäherung: Abstand nimmt ab'); }
{ const s = P.stateAt('progress', 'arrive', -600, 123); assert.ok(s.measured && s.d === 123, 'Kurs-Abstand ersetzt die Schätzung');
  assert.ok(!P.stateAt('cygnus', 'arrive', -600, 123).measured, 'Kurs nur bei Sojus/Progress'); }
assert.equal(P.eventKind('Undocking', 'Crew-13 Dragon Undocking'), 'depart');
assert.equal(P.eventKind('Docking', 'Progress MS-36 Docking'), 'arrive');
assert.equal(P.eventKind('Spacecraft Event', 'Cygnus NG-24 Release'), 'depart');
assert.equal(P.eventKind('EVA', 'US Spacewalk 95'), null);
assert.ok(P.sameVehicle('Crew-13 Dragon Undocking', 'Crew-13 · Crew Dragon Grace'), 'Missionskennung');
assert.ok(P.sameVehicle('PROGRESS-MS 35', 'Progress MS-35'), 'Schreibweise CelesTrak/LL2');
assert.ok(!P.sameVehicle('Progress MS-34 Undocking', 'Progress MS-35'), 'andere Nummer');
const TYPES = { ida2: ['crewDragon', 'cargoDragon'], ida3: ['crewDragon', 'cargoDragon'], mrm2: ['progress', 'soyuz'], smAft: ['progress', 'soyuz'] };
assert.equal(P.portFromText('Progress MS-36 will dock to the aft port of Zvezda', 'progress', TYPES, ['mrm2', 'smAft']), 'smAft');
assert.equal(P.portFromText('Progress MS-36 docking', 'progress', TYPES, ['smAft']), 'smAft', 'erster freier passender Port');
assert.equal(P.portFromText('Dragon to the space-facing port of Harmony', 'cargoDragon', TYPES, ['ida2']), 'ida3');

// --- Seite ---
const { t } = await loadTwin(['buildISS', 'MODEL', 'LINK', 'ingest', 'VV', 'PROX', 'updateVehicles', 'updateProxOps', 'updatePayloads', 'resetPayloads', 'PL', 'EVENTS', 'liveJoints', 'applyJoints', 'previewProx', 'proxActivities', 'setVehicleEvents']);
t.buildISS(); t.LINK.src = 'mqtt'; t.resetPayloads();
const M = t.MODEL, T0 = Date.parse('2026-11-20T12:00:00Z');
const ev = (name, cfg, loc, dock, dep) => ({ docking: dock, departure: dep, docking_location: { name: loc, spacestation: { id: 4, name: 'International Space Station' } }, flight_vehicle: { spacecraft: { name, spacecraft_config: { name: cfg } } } });
const iso = ms => new Date(ms).toISOString();
const frame = at => { t.updateVehicles(at); t.updateProxOps(); };
const g = M.vvG['ida2:crewDragon'], home = () => g.userData.dock.p;
t.setVehicleEvents({ events: [ev('Crew Dragon Grace', 'Crew Dragon 2', 'Harmony forward', '2026-10-01T23:05:00Z', iso(T0))], upcoming_events: [] }, 'test');
frame(T0 - 60e3); assert.ok(g.visible, 'angedockt'); const p0 = g.position.clone(); assert.ok(p0.distanceTo(home()) < 1e-9);
frame(T0 + 300e3); assert.ok(g.visible, 'nach dem Abdocken noch sichtbar');
const off = g.position.clone().sub(p0); assert.ok(off.x > 10 && Math.abs(off.y) < 1e-6 && Math.abs(off.z) < 1e-6, 'entlang der Portachse (+X an Harmony vorn) weg: ' + off.x.toFixed(1));
assert.equal(t.proxActivities()[0]?.kind, 'depart');
assert.ok(t.EVENTS.some(e => /departing/.test(e.msg || e.text || JSON.stringify(e))), 'Abflug im Protokoll');
frame(T0 + 3000e3); assert.ok(!g.visible, 'nach dem Ablauf ausgeblendet');
// Russisches Portflag fällt: Abflug ab jetzt, auch wenn LL2 noch nichts weiß.
t.setVehicleEvents({ events: [ev('Progress MS-35', 'Progress MS', 'Poisk', '2026-09-19T13:44:20Z', null), ev('Crew Dragon Grace', 'Crew Dragon 2', 'Harmony forward', '2026-10-01T23:05:00Z', null)] }, 'test');
const pg = M.vvG['mrm2:progress'];
t.ingest('RUSSEG000019', 1); frame(T0); assert.ok(pg.visible);
t.ingest('RUSSEG000019', 0); frame(T0 + 1000); frame(T0 + 200e3);
assert.ok(pg.visible && pg.position.distanceTo(pg.userData.dock.p) > 10, 'Progress fliegt nach dem Flag-Abfall weg');
frame(T0 + 1000e3); assert.ok(!pg.visible, 'Progress danach weg');
// Geplantes Abdocken (LL2-Ereignisplan, minutengenau) eines angedockten Dragon.
t.VV.extra.upcoming_events = [{ name: 'Crew-13 Dragon Undocking', type: 'Undocking', date: iso(T0 + 2000e3), precision: 'Minute' }];
t.VV.list.find(v => /Grace/.test(v.name)).name = 'Crew-13 · Crew Dragon Grace';
frame(T0 + 1900e3); assert.ok(g.visible && g.position.distanceTo(home()) < 1e-9, 'vor dem Plan angedockt');
frame(T0 + 2000e3 + 400e3); assert.ok(g.visible && g.position.distanceTo(home()) > 20, 'laut Plan abgedockt und unterwegs');
assert.ok(!t.MODEL.vvCur.ida2, 'nicht mehr als angedockt geführt');
assert.ok(/LL2/.test(g.userData.label?.element?.textContent || 'LL2'));
// Geplante Ankunft eines Cargo Dragon an Harmony zenit.
t.VV.extra.upcoming_events = [{ name: 'CRS-36 Dragon Docking', type: 'Docking', date: iso(T0 + 5000e3), precision: 'Minute', description: 'docks to the space-facing port of Harmony' }];
const cd = M.vvG['ida3:cargoDragon'];
frame(T0 + 5000e3 - 2000e3); assert.ok(cd.visible && cd.position.distanceTo(cd.userData.dock.p) > 100, 'Cargo Dragon im Anflug');
frame(T0 + 5000e3 - 10e3); assert.ok(cd.position.distanceTo(cd.userData.dock.p) < 1, 'kurz vor dem Kontakt');
frame(T0 + 5000e3 + 3600e3); assert.ok(cd.visible && t.MODEL.vvCur.ida3?.name.startsWith('CRS-36'), 'nach der Ankunft als angedockt geführt (Schätzung)');
// Vorschau: kein Protokolleintrag, Fahrzeug bewegt sich, danach wieder angedockt.
t.VV.extra.upcoming_events = []; frame(T0 + 9000e3);
const n0 = t.EVENTS.length, pr = M.vvG['prichal:soyuz'] || M.vvG['smAft:progress'];
const port = Object.keys(t.MODEL.vvCur)[0]; t.previewProx(port, 'depart'); t.PROX.preview.start -= 200e3 / 30;
frame(T0 + 9000e3); const key = port + ':' + t.MODEL.vvCur[port].type, gv = M.vvG[key];
assert.ok(gv.visible && gv.position.distanceTo(gv.userData.dock.p) > 5, 'Vorschau bewegt das Fahrzeug');
assert.equal(t.EVENTS.length, n0, 'Vorschau ohne Protokoll'); assert.ok(t.MODEL.vvCur[port], 'Vorschau ändert den Datenstand nicht');
t.PROX.preview.start -= 1e7; frame(T0 + 9000e3); assert.ok(gv.position.distanceTo(gv.userData.dock.p) < 1e-9 && !t.PROX.preview, 'nach der Vorschau wieder angedockt');
void pr;

// Anlegen (Cygnus): wartet am Einfangpunkt, fliegt nie selbst in den Port; Canadarm2 führt; Freigabe -> Abflug ab dort.
{ const cy = M.vvG['unityNadir:cygnus'], TB = T0 + 20000e3, J = t.liveJoints(); t.applyJoints(J);
  t.VV.extra.upcoming_events = [{ name: 'Cygnus NG-25 Berthing', type: 'Berthing', date: iso(TB), precision: 'Minute', description: 'berthing to the Earth-facing port of Unity' }];
  const dist = () => cy.position.distanceTo(cy.userData.dock?.p || cy.position);
  frame(TB - 7000e3); assert.ok(cy.visible && Math.abs(dist() - P.CAPTURE_DIST) < 0.01, 'Cygnus hält am Einfangpunkt ' + dist().toFixed(2));
  frame(TB - 60e3); assert.ok(Math.abs(dist() - P.CAPTURE_DIST) < 0.01, 'ohne Arm kein Eigenflug in den Port');
  // Canadarm2 greift (Telemetrie): Fahrzeug folgt dem Arm, nicht dem Ablauf.
  t.ingest('CSASSRMS011', 0); t.updatePayloads(J, TB - 50e3); t.ingest('CSASSRMS011', 2); t.updateVehicles(TB - 40e3); t.updatePayloads(J, TB - 40e3); t.updateProxOps();
  assert.equal(t.PL.st.held, 'unityNadir:cygnus', 'Arm greift das wartende Fahrzeug');
  const held = cy.position.clone(); assert.ok(held.distanceTo(cy.userData.dock.p) > 0.01);
  assert.ok(/Canadarm2/.test(cy.userData.label?.element?.textContent || 'Canadarm2'));
  // Loslassen abseits des CBM = Freigabe: Abflug ab dieser Stelle entlang der Portachse.
  t.ingest('CSASSRMS011', 0); t.updateVehicles(TB - 30e3); t.updatePayloads(J, TB - 30e3); t.updateProxOps();
  assert.ok(t.PROX.release['unityNadir:cygnus'], 'Freigabe vermerkt');
  t.updateVehicles(TB + 300e3); t.updatePayloads(J, TB + 300e3); t.updateProxOps();
  const mv = cy.position.clone().sub(held); assert.ok(cy.visible && mv.z > 5 && Math.hypot(mv.x, mv.y) < 1e-6, 'fliegt ab der Freigabestelle nach unten weg ' + mv.toArray().map(x => x.toFixed(1)));
  t.updateVehicles(TB + 3000e3); t.updatePayloads(J, TB + 3000e3); t.updateProxOps(); assert.ok(!cy.visible, 'danach ausgeblendet');
  // Am CBM losgelassen = angelegt: kein Anflug mehr, als angelegt geführt.
  t.PROX.release = {}; t.PROX.gone = {}; t.PROX.berthed['unityNadir:cygnus'] = TB - 100e3; frame(TB - 50e3);
  assert.ok(cy.visible && dist() < 1e-9 && t.MODEL.vvCur.unityNadir?.name.startsWith('Cygnus NG-25'), 'nach dem Anlegen durch den Arm angelegt');
  t.VV.extra.upcoming_events = []; t.PROX.berthed = {}; }

// --- Radar ---
assert.equal(new Date(R.tleEpoch('1 25544U 98067A   26322.50000000  .00016717  00000-0  30408-3 0  9993')).toISOString(), '2026-11-18T12:00:00.000Z');
{ // ISS auf Kreisbahn in der x-y-Ebene bei +x, Flug nach +y; Objekt 1 km voraus, 500 m darüber, 200 m Richtung Bahnnormale
  const rI = { x: 6778, y: 0, z: 0 }, vI = { x: 0, y: 7.67, z: 0 };
  const o = R.toLvlh(rI, vI, { x: 6778.5, y: 1, z: 0.2 }, vI);
  assert.ok(Math.abs(o.rel[0] - 1000) < 1e-6 && Math.abs(o.rel[2] + 500) < 1e-6 && Math.abs(o.rel[1] + 200) < 1e-6, 'LVLH: +V voraus, −R oben, +H = −Bahnnormale ' + o.rel);
}
{ // Fake-SGP4: Position direkt aus der Zeile 2 (Testkodierung), Geschwindigkeit wie die ISS
  const lib = { twoline2satrec: (l1, l2) => ({ p: l2.slice(8).trim().split(/\s+/).map(Number) }), propagate: s => ({ position: { x: s.p[0], y: s.p[1], z: s.p[2] }, velocity: { x: 0, y: 7.67, z: 0 } }) };
  const ep = '1 00000U 00000A   26322.50000000  .00000000  00000-0  00000-0 0  0000';
  const L = (id, name, p, e = ep) => ({ name, id, l1: e, l2: '2 ' + String(id).padStart(5, '0') + ' ' + p.join(' '), epoch: R.tleEpoch(e) });
  const tles = [L(25544, 'ISS (ZARYA)', [6778, 0, 0]), L(49044, 'ISS (NAUKA)', [6778, 0, 0]), L(1, 'PROGRESS-MS 35', [6778, 0, 0]), L(2, 'CREW DRAGON 13', [6778, 0.5, 0]),
    L(3, 'DRAGON CRS-36', [6778, 300, 0]), L(4, 'OLD THING', [6778, 50, 0], '1 00000U 00000A   26300.50000000  .00000000  00000-0  00000-0 0  0000')];
  const r = R.propagateAll(lib, tles, Date.parse('2026-11-18T12:00:00Z'), ['Crew-13 · Crew Dragon Grace', 'Progress MS-35'], P.sameVehicle);
  const st = Object.fromEntries(r.items.map(i => [i.name, i.state]));
  assert.deepEqual(st, { 'PROGRESS-MS 35': 'attached', 'CREW DRAGON 13': 'attached', 'DRAGON CRS-36': 'free', 'OLD THING': 'stale' }, JSON.stringify(st));
  assert.equal(R.autoScale(r.items), 1e6, 'Bildradius 1000 km für ein Objekt in 300 km');
  const calls = []; const ctx = new Proxy({}, { get: (o, k) => k in o ? o[k] : (...a) => calls.push(k), set: (o, k, v) => (o[k] = v, true) });
  R.drawRadar(ctx, 300, 220, [{ label: 'X', rel: [300e3, 0, 0], range: 300e3, rate: -5, kind: 'tle' }, { label: 'Y', rel: [5, 0, 20], range: 21, rate: 0.1, kind: 'model' }],
    { scale: 1e6, kurs: { range: 150, rate: -0.2 }, colors: { fg: '#fff', dim: '#888', accent: '#0ff', warn: '#ff0', model: '#fa0' } });
  assert.ok(calls.filter(k => k === 'fillText').length >= 8, 'Radar gezeichnet');
  // Erde: Mittelpunkt in Nadirrichtung im Abstand |r|, bei 20 000 km Bildradius gezeichnet (Beschriftung „Earth“)
  assert.deepEqual(r.earth.center, [0, 0, 6778e3]);
  const texts = []; const ctx2 = new Proxy({}, { get: (o, k) => k in o ? o[k] : k === 'fillText' ? s => texts.push(s) : () => {}, set: (o, k, v) => (o[k] = v, true) });
  R.drawRadar(ctx2, 300, 260, [], { scale: 2e7, az: 0, el: 0.3, earth: r.earth, colors: { fg: '#fff', dim: '#888', accent: '#0ff', warn: '#ff0', model: '#fa0' } });
  assert.ok(texts.includes('Earth'), 'Erde sichtbar beim Herauszoomen');
  texts.length = 0; R.drawRadar(ctx2, 300, 260, [], { scale: 1e4, earth: r.earth, colors: { fg: '#fff', dim: '#888', accent: '#0ff', warn: '#ff0', model: '#fa0' } });
  assert.ok(!texts.includes('Earth'), 'Erde nicht im Bild bei 10 km');
  assert.equal(R.zoomScale(1e4, 1), 1.25e4); assert.equal(R.zoomScale(R.MIN_SCALE, -1), R.MIN_SCALE);
}
{ // OMM/JSON von CelesTrak, auch mit sechsstelligen Katalognummern (das TLE-Format kann sie nicht)
  const omm = [{ OBJECT_NAME: 'ISS (ZARYA)', NORAD_CAT_ID: 25544, EPOCH: '2026-11-18T12:00:00.000000' }, { OBJECT_NAME: 'DRAGON CRS-36', NORAD_CAT_ID: 100123, EPOCH: '2026-11-18T06:00:00.000000' }];
  const l = R.parseGp([omm, []]);
  assert.deepEqual(l.map(x => [x.id, x.name, new Date(x.epoch).toISOString()]), [[25544, 'ISS (ZARYA)', '2026-11-18T12:00:00.000Z'], [100123, 'DRAGON CRS-36', '2026-11-18T06:00:00.000Z']]);
  assert.equal(R.parseGp(JSON.stringify(omm)).length, 2); assert.equal(R.parseGp('No GP data found').length, 0);
  const used = []; const lib = { json2satrec: o => (used.push(o.NORAD_CAT_ID), { p: o.NORAD_CAT_ID === 25544 ? [6778, 0, 0] : [6778, 30, 0] }), propagate: s => ({ position: { x: s.p[0], y: s.p[1], z: s.p[2] }, velocity: { x: 0, y: 7.67, z: 0 } }) };
  const r = R.propagateAll(lib, l, Date.parse('2026-11-18T12:00:00Z'));
  assert.deepEqual(used, [25544, 100123]); assert.equal(r.items[0].id, 100123); assert.ok(Math.abs(r.items[0].range - 30e3) < 1e-6);
}
console.log('PASS proxops: Dragon/Kurs/CBM-Abläufe, Nasenkappe, Kurs-Abstand, LL2-Abdocken, Portflag, Ereignisplan (Ab- und Anflug), Vorschau; Radar: TLE-Epoche, OMM/JSON (6-stellig), LVLH, angedockt/frei/alt, Kugel mit Erde, Zoom');
