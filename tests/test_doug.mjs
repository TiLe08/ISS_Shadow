// test_doug.mjs: Canadarm2-Kinematik und MSS-Werte gegen NASA DOUG (Flugpaket Stage 75-7, v1.18).
// DOUG-Kette aus recherche/DOUG/DOUG_zero_configurations.md: Knoten T(xyz)·R(Achse), Winkel = DSIGN · Telemetrie,
// Basis-LEE = Greifpunktrahmen. Achsen im Modell: x = DOUG z, y = DOUG x (aus dem Greifpunkt), z = DOUG y.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readProject } from './harness.mjs';
const { MODEL, buildStation, SSRMS_AX, MBS_IDS } = await import('../iss-model.mjs');
const html = readProject('iss_twin.html');
const CONV = Function('return ' + html.match(/const SSRMS_CONVS = (\{[^;]*\});/)[1])().doug;
const WS = Function('return ' + html.match(/const MT_WORKSITES = (\{[^;]*\});/)[1])();
buildStation({});
const IN = 0.0254, D = Math.PI / 180;
const CHAIN = [[[53.5, 0, 0], 'x'], [[0, 0, -27.66], 'z'], [[0, 22.41, 0], 'y'], [[279.92, 18.7, 0], 'y'], [[279.92, 0, 0], 'y'], [[0, 22.41, 0], 'z'], [[0, 0, 27.66], 'x']];
const DSIGN = [1, -1, -1, -1, -1, -1, 1];
const rot = (ax, a) => new THREE.Matrix4()[{ x: 'makeRotationX', y: 'makeRotationY', z: 'makeRotationZ' }[ax]](a);
const P = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1), PT = P.clone().transpose();
function doug(q) {      // LEE2hi in Modellachsen, relativ zum Basis-Greifpunkt
  const m = new THREE.Matrix4();
  CHAIN.forEach(([t, ax], i) => m.multiply(new THREE.Matrix4().makeTranslation(...t.map(v => v * IN))).multiply(rot(ax, DSIGN[i] * q[i] * D)));
  m.multiply(new THREE.Matrix4().makeTranslation(53.5 * IN, 0, 0)).multiply(rot('z', Math.PI));
  return P.clone().multiply(m).multiply(PT);
}
const anchor = MODEL.anchors[11];
anchor.add(MODEL.armBase); MODEL.armBase.position.set(0, 0, 0); MODEL.armBase.quaternion.identity();
function model(q) {
  MODEL.ssrms.forEach((j, i) => { j.rotation.set(0, 0, 0); j.rotation[SSRMS_AX[i]] = (CONV.s[i] * q[i] + CONV.o[i]) * D; });
  MODEL.root.updateMatrixWorld(true);
  return anchor.matrixWorld.clone().invert().multiply(MODEL.armTip.matrixWorld);
}
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const Q = Array.from({ length: 40 }, () => Array.from({ length: 7 }, () => -175 + 350 * rnd()));
Q.push([0, 0, 0, 0, 0, 0, 0], [245.009, 51.992, -76.995, -115.001, 0, 0, 0]);
let worstP = 0, worstR = 0;
for (const q of Q) {
  const a = doug(q), b = model(q);
  worstP = Math.max(worstP, new THREE.Vector3().setFromMatrixPosition(a).distanceTo(new THREE.Vector3().setFromMatrixPosition(b)));
  const ra = new THREE.Matrix4().extractRotation(a).elements, rb = new THREE.Matrix4().extractRotation(b).elements;
  worstR = Math.max(worstR, ...ra.map((v, i) => Math.abs(v - rb[i])));
}
assert.ok(worstP < 0.01, 'Canadarm2 tip position vs DOUG: ' + worstP);
assert.ok(worstR < 1e-3, 'Canadarm2 tip frame vs DOUG LEE2hi: ' + worstR);
// Alle Winkel 0: gestreckter Arm, Spitze rund 17,6 m vom Basis-Greifpunkt.
const L0 = new THREE.Vector3().setFromMatrixPosition(model([0, 0, 0, 0, 0, 0, 0])).length();
assert.ok(L0 > 17 && L0 < 18.2, 'straight arm length ' + L0);
// MBS-Greifpunkte: orthonormale Rahmen, y aus dem Greifpunkt nach vorn (+X der Station).
for (const id of MBS_IDS) {
  const f = MODEL.anchors[id]; f.updateMatrixWorld(true);
  const y = new THREE.Vector3(0, 1, 0).applyQuaternion(f.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(y.x > 0.6, 'MBS PDGF ' + id + ' faces forward: ' + y.toArray());
}
// MT-Arbeitsplätze wie DOUG; ISSLive meldete am 14.10. −525,78 cm (WS5).
assert.deepEqual(WS, { 1: 21.693, 2: 16.490, 3: 7.974, 4: 2.870, 5: -5.258, 6: -7.941, 7: -16.535, 8: -21.693 });
assert.ok(Math.abs(WS[5] - -5.2578) < 0.001);
// UHF-Antennen und POA (v1.24): Mast endet am DOUG-Gelenk, das POA-LEE greift nach Backbord (DOUG MBS_POA).
MODEL.root.updateMatrixWorld(true);
const part = name => { let o = null; MODEL.root.traverse(c => { if (!o && c.userData?.name === name && c.isGroup) o = c; }); assert.ok(o, name); return o; };
const wpos = o => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
{ const arm = (n, piv, gz) => { const a = part(n + ' head arm'), end = new THREE.Vector3(...piv).addScaledVector(new THREE.Vector3(...gz), 0.45);
    end.x += 0.09; assert.ok(wpos(a).distanceTo(new THREE.Vector3(...piv).add(end).multiplyScalar(0.5)) < 0.01, n + ': Kopfarm am DOUG-Gelenk'); };
  arm('Destiny UHF antenna', [5.624, 3.026, 7.728], [0, 0.7071, -0.7071]); arm('P1 UHF antenna', [1.473, -12.649, -3.016], [0, 1, 0]); }
{ const lee = part('MBS POA (LEE)'), mt = MODEL.pivots.mt, loc = mt.worldToLocal(wpos(lee));
  const tip = mt.worldToLocal(new THREE.Vector3(0, -0.745, 0).applyMatrix4(lee.matrixWorld));
  assert.ok(new THREE.Vector3(3.870 + 0.259, -1.770 - 1.467, 0).distanceTo(tip) < 0.01 && loc.y < -1.77, 'POA-Endeffektor nach DOUG: ' + tip.toArray()); }
// Dextre-Arme (v1.28): Handgelenk-Rollen beider Arme in der Paketpose gegen DOUG (SPDM_A1/A2_WR im SPDM_EE-System).
{ const { setDougJoint } = await import('../iss-model.mjs');
  const A = [[-50, -40, 80, 30, -80, -120, -50], [-120, -40, -80, -60, 40, -120, -20]], WR = [[3.171, 1.639, -0.940], [2.990, 1.856, 0.603]];
  setDougJoint(MODEL.dextreBody, -45); MODEL.dextre.forEach((J, s) => J.forEach((j, i) => setDougJoint(j, A[s][i]))); MODEL.root.updateMatrixWorld(true);
  const inv = MODEL.dextreBody.parent.matrixWorld.clone().invert();
  MODEL.dextre.forEach((J, s) => { const p = new THREE.Vector3().setFromMatrixPosition(inv.clone().multiply(J[6].matrixWorld));
    assert.ok(p.distanceTo(new THREE.Vector3(...WR[s])) < 0.005, 'Dextre Arm ' + (s + 1) + ' Handgelenk: ' + p.toArray()); }); }
console.log(`PASS DOUG: Canadarm2-Spitze über ${Q.length} Posen auf ${(worstP * 1000).toFixed(1)} mm und Rahmen exakt, MBS-Greifpunkte, MT-Arbeitsplätze, UHF-Antennen, POA, Dextre-Arme`);
