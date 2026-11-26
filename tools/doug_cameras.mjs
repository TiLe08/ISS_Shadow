// doug_cameras.mjs: rechnet die Kameraketten aus NASA DOUG (Stage 75-7) in die Befestigungssysteme des Modells um.
//
// Eingabe: die Knotenliste aus recherche/DOUG/doug_stage75-7_nodes.json (Projektordner, nicht im Repo).
// Ausgabe: der Block DOUG_RIGS für cameras.mjs. Jede Kamera ist eine Kette aus festen Systemen und zwei
// Gelenken wie in DOUG: Knoten = T(xyz) · Ry(pitch) · Rz(yaw) · Rx(roll), Zoll; ein Gelenk ersetzt nur sein Feld
// (Schwenk = yaw des Pan-Knotens, Neigung = pitch des Tilt-Knotens, Kameraliste in DOUGs Kamerazuordnung).
// Gespeichert wird je Gelenk das System davor (pre), die Achse und das System danach (post), dazu das Augsystem
// relativ zum Neigesystem. Alle Gelenke stehen auf 0 (NASA-Nullstellung), nicht auf der Pose des Pakets.
// Die Befestigungssysteme (Ausleger, MT, Dextre-Rumpf, LEE) holt das Werkzeug aus dem gebauten Modell; für
// Canadarm2 mit der in tests/test_doug.mjs geprüften Abbildung (Modellachsen x = DOUG z, y = DOUG x, z = DOUG y).
// Aufruf (im Projektordner, nach npm install):  node tools/doug_cameras.mjs <Pfad>/doug_stage75-7_nodes.json
import fs from 'node:fs'; import * as THREE from 'three';
const N = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { MODEL, buildStation, SSRMS_AX } = await import('../web/iss-model.mjs');
const html = fs.readFileSync(new URL('../web/iss_twin.html', import.meta.url), 'utf8');
const CONV = Function('return ' + html.match(/const SSRMS_CONVS = (\{[^;]*\});/)[1])().doug;
buildStation({});
const IN = 0.0254, D = Math.PI / 180, rot = (ax, a) => new THREE.Matrix4()['makeRotation' + ax.toUpperCase()](a * D);
const node = n => { if (!N[n]) throw new Error('DOUG-Knoten fehlt: ' + n); return N[n][0]; };
// Lokales System eines Knotens; mit field wird dieses Euler-Feld auf v gesetzt.
function local(n, field, v) {
  const e = node(n); let [p, y, r] = e.pyr;
  if (field === 'pitch') p = v; if (field === 'yaw') y = v; if (field === 'roll') r = v;
  return new THREE.Matrix4().makeTranslation(...e.xyz.map(c => c * IN)).multiply(rot('y', p)).multiply(rot('z', y)).multiply(rot('x', r));
}
// System von n relativ zu stop; Gelenke in joints = { Knoten: [Feld, Wert] }.
function rel(n, stop, joints = {}) {
  const chain = []; for (let c = n; c !== stop; c = node(c).parent) { if (!N[c]) throw new Error(n + ' hängt nicht unter ' + stop); chain.push(c); }
  return chain.reverse().reduce((m, c) => m.multiply(local(c, ...(joints[c] || []))), new THREE.Matrix4());
}
// pre/post eines Gelenkknotens: Ry·Rz·Rx, das Gelenkfeld trennt die beiden festen Teile.
function joint(n, field) {
  const e = node(n), [p, y, r] = e.pyr, T = new THREE.Matrix4().makeTranslation(...e.xyz.map(c => c * IN));
  if (field === 'yaw') return { pre: T.multiply(rot('y', p)), axis: 'z', post: rot('x', r) };
  if (field === 'pitch') return { pre: T, axis: 'y', post: rot('z', y).multiply(rot('x', r)) };
  throw new Error(field);
}
const pack = m => { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return [...p.toArray(), ...q.toArray()].map(v => +v.toFixed(4)); };
// Canadarm2 auf einem Greifpunkt, alle Gelenke 0: Befestigungssysteme des Modells relativ zum Greifpunkt.
const anchor = MODEL.anchors[11]; anchor.add(MODEL.armBase); MODEL.armBase.position.set(0, 0, 0); MODEL.armBase.quaternion.identity();
MODEL.ssrms.forEach((j, i) => { j.rotation.set(0, 0, 0); j.rotation[SSRMS_AX[i]] = CONV.o[i] * D; }); MODEL.root.updateMatrixWorld(true);
const P = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);   // DOUG-Koordinaten -> Modellkoordinaten
const armLocal = (obj, dougFrame) => anchor.matrixWorld.clone().invert().multiply(obj.matrixWorld).invert().multiply(P.clone().multiply(dougFrame));
const DSIGN = [1, -1, -1, -1, -1, -1, 1], ARMJ = ['SSHR', 'SSHY', 'SSHP', 'SELP', 'SWRP', 'SWRY', 'SWRR'];
const armZero = Object.fromEntries(ARMJ.map((n, i) => [n, [{ SSHR: 'roll', SSHY: 'yaw', SSHP: 'pitch', SELP: 'pitch', SWRP: 'pitch', SWRY: 'yaw', SWRR: 'roll' }[n], 0 * DSIGN[i]]]));
// Kette einer Schwenk-Neige-Kamera. mountFrame(parentOfPan) liefert das System des Pan-Elternknotens im Befestigungssystem.
function rig(pan, tilt, eye, mountOfPanParent) {
  const pj = joint(pan, 'yaw'), tj = joint(tilt, 'pitch');
  if (node(tilt).parent !== pan) { const mid = rel(node(tilt).parent, pan); tj.pre = mid.multiply(tj.pre); }
  const r = { pan: { pre: pack(mountOfPanParent.clone().multiply(pj.pre)), post: pack(pj.post) }, tilt: { pre: pack(tj.pre), post: pack(tj.post) } };
  // Ohne Augknoten (CLPA): Auge 0,21 m vor der Neigeachse, am Objektiv des Modells (Schätzung).
  r.eye = pack(eye ? rel(eye, tilt) : new THREE.Matrix4().makeTranslation(-0.21, 0, 0));
  return r;
}
const out = {};
// ETVCG an den Kameraports: Befestigung = Stationssystem (DOUG SSREF ohne Lage).
for (const cp of ['CP3', 'CP8', 'CP9', 'CP13']) {
  const parent = node(cp + '_VCSA_pan').parent;
  out[cp.toLowerCase()] = { ...rig(cp + '_VCSA_pan', cp + '_VCSA_cam', cp + '_VCSA_eye', rel(parent, 'SSREF')),
    stanchion: [rel(cp + '_CAMERA_STANCHION', 'SSREF'), rel(cp + '_VCSA_BASE', 'SSREF')].map(m => new THREE.Vector3().setFromMatrixPosition(m).toArray().map(v => +v.toFixed(3))) };
}
// Auslegerkameras: Pan-Elternknoten CLPA_1 (Ausleger B, Schulterseite) und CLPA_2 (Ausleger A, Handgelenkseite).
out.boom1 = rig('cam_pan_B2', 'cam_tilt_B2', null, armLocal(MODEL.armBooms.b1, rel('CLPA_1', 'LEE1hi', armZero)));
out.boom2 = rig('cam_pan_A2', 'cam_tilt_A2', null, armLocal(MODEL.armBooms.b2, rel('CLPA_2', 'LEE1hi', armZero)));
// LEE-Kameras (CLA, fest, keine Kette): nur zur Kontrolle die Lage der Leuchte im Greifsystem des LEE.
const lee = { leeTip: [MODEL.armTip, 'CLA_2_light'], leeBase: [MODEL.armBase, 'CLA_1_light'] }, leeOut = {};
for (const [k, [obj, light]] of Object.entries(lee)) if (N[light]) leeOut[k] = pack(armLocal(obj, rel(light, 'LEE1hi', armZero))).slice(0, 3);
// MBS-Kamera: MT-System. Das Modell setzt den MT-Drehpunkt bei x = 0, DOUG den MT-Knoten bei x = 2,459 m.
const mt = new THREE.Matrix4().makeTranslation(node('MT').xyz[0] * IN, 0, node('MT').xyz[2] * IN);
out.mbs = rig('MBS_CAMERA_PAN', 'MBS_CAMERA_TILT', null, mt.clone().multiply(rel(node('MBS_CAMERA_PAN').parent, 'MT')));
// Träger der MBS-Kamera (v1.29.3): DOUG hängt die Kamera an MBS_POA_BRACE, eine Strebe von der MBS-Vorderseite nach
// vorn. Mast = Ursprung der Strebe (an der MBS) und Kamerafuß MBS_CAMERA_BASE, beide im MT-System des Modells.
out.mbs.mast = ['MBS_POA_BRACE', 'MBS_CAMERA_BASE'].map(n => new THREE.Vector3().setFromMatrixPosition(mt.clone().multiply(rel(n, 'MT'))).toArray().map(v => +v.toFixed(3)));
// Dextre: die beiden Rumpfkameras (CLPA) am oberen Rumpf (SPDM_body, im Modell MODEL.dextreTorso).
for (const i of [1, 2]) out['dextre' + i] = rig('cam_pan_SPDM' + i, 'cam_tilt_SPDM' + i, null, rel(node('cam_pan_SPDM' + i).parent, 'SPDM_body_2'));
console.log('// LEE-Leuchten (CLA) im Greifsystem: ' + JSON.stringify(leeOut));
console.log('export const DOUG_RIGS = ' + JSON.stringify(out).replace(/"(\w+)":/g, '$1: ') + ';');
