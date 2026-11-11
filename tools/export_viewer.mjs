// export_viewer.mjs: erzeugt den eigenständigen 3D-Viewer (nur die Station, ohne Telemetrie).
//
// Baut das Stationsmodell genau so, wie iss_twin.html es baut (tests/harness.mjs lädt die Seite ohne
// WebGL), stellt eine Pose ein und schreibt die gesamte Geometrie in eine einzelne HTML-Datei. Die
// Geometrie wird in das Körpersystem der Station „eingebacken“ und nach Bauteilart zusammengefasst
// (ein Mesh bzw. ein Linienobjekt je Art), damit der Viewer schnell ist. Materialien und Texturen
// kommen aus iss-model.mjs und werden mit exportiert; die Vorlage enthält keine eigene Farbtabelle.
//
// Pose: neutrale Modellpose ohne Telemetrie (Gelenke in Parkstellung), Besuchsfahrzeuge laut
// Manifest und iROSAs zum Zeitpunkt des Exports (oder --at JJJJ-MM-TTTHH:MMZ).
// Aufruf (im Projektordner, nach npm install):  node tools/export_viewer.mjs [--at 2026-11-05T18:00Z] [--out datei.html]
import fs from 'node:fs'; import { fileURLToPath } from 'node:url'; import * as THREE from 'three';
import { loadTwin } from '../tests/harness.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const AT = Date.parse(arg('--at', new Date().toISOString())), VIEWER = '1.3';
const { t, w, dom, html } = await loadTwin(['buildISS', 'MODEL', 'applyJoints', 'liveJoints', 'updateVehicles', 'updateIrosa']);
const VERSION = html.match(/const PAGE_VERSION = '([^']+)'/)[1];
const OUT = arg('--out', fileURLToPath(new URL(`../ISS_Model_Viewer_v${VIEWER}.html`, import.meta.url)));
const { MAT, AMBER_KINDS } = w;
t.buildISS(); t.applyJoints(t.liveJoints()); t.updateVehicles(AT); t.updateIrosa(AT);
const root = t.MODEL.root; root.updateMatrixWorld(true); const inv = root.matrixWorld.clone().invert();

// --- Sichtbare Geometrie einsammeln und je Gruppe zusammenführen
const shown = o => { for (let n = o; n && n !== root.parent; n = n.parent) if (!n.visible && n !== o) return false; return true; };
const groups = new Map();
// type: mesh | line | back; only: in welcher Darstellung die Gruppe erscheint (holo, solid oder beide = '').
function add(meta, obj, faces) {
  const key = [meta.type, meta.kind, meta.only, meta.dim].join(':');
  let g = groups.get(key); if (!g) groups.set(key, g = { ...meta, pos: [], nrm: [], uv: [], idx: [], n: 0 });
  const geo = obj.geometry, m = new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld), nm = new THREE.Matrix3().getNormalMatrix(m);
  const p = geo.attributes.position, v = new THREE.Vector3(), nA = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(m); g.pos.push(v.x, v.y, v.z);
    if (faces) { v.fromBufferAttribute(nA, i).applyMatrix3(nm).normalize(); g.nrm.push(v.x, v.y, v.z); g.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0); }
  }
  const step = faces ? 3 : 1, flip = faces && m.determinant() < 0, at = i => (geo.index ? geo.index.array[i] : i), count = geo.index ? geo.index.count : p.count;
  for (let i = 0; i < count; i += step) faces ? g.idx.push(g.n + at(i), g.n + at(i + (flip ? 2 : 1)), g.n + at(i + (flip ? 1 : 2))) : g.idx.push(g.n + at(i));
  g.n += p.count;
}
let parts = 0;
for (const p of t.MODEL.parts) {
  if (!shown(p.mesh)) continue;
  parts++;
  if (!p.solidOnly) add({ type: 'line', kind: p.kind, only: 'holo', dim: p.dim }, p.wire, false);
  add({ type: 'mesh', kind: p.kind, only: p.proxy ? 'holo' : p.solidOnly ? 'solid' : '', dim: false }, p.mesh, true);
  if (p.back) add({ type: 'back', kind: p.back.material === MAT.solid.irosaBack ? 'irosaBack' : 'arrayBack', only: 'solid', dim: false }, p.back, true);
}
const b64 = (Arr, a) => Buffer.from(new Arr(a).buffer).toString('base64');
const data = [...groups.values()].map(g => ({ type: g.type, kind: g.kind, only: g.only, dim: !!g.dim, pos: b64(Float32Array, g.pos),
  nrm: g.nrm.length ? b64(Float32Array, g.nrm) : null, uv: g.type !== 'line' && MAT.solid[g.kind]?.map ? b64(Float32Array, g.uv) : null, idx: b64(Uint32Array, g.idx) }));
// --- Materialien der Solid-Darstellung und ihre Texturen aus dem Modell übernehmen
const textures = [], texId = tex => { let i = textures.findIndex(x => x.tex === tex); if (i < 0) { i = textures.length; textures.push({ tex, size: tex.image.width, data: Buffer.from(tex.image.data).toString('base64') }); } return i; };
const materials = Object.fromEntries(Object.entries(MAT.solid).map(([k, m]) => [k, { color: m.color.getHex(), roughness: m.roughness, metalness: m.metalness,
  emissive: m.emissive.getHex(), side: m.side, map: m.map ? texId(m.map) : null, emissiveMap: m.emissiveMap ? texId(m.emissiveMap) : null }]));
const verts = [...groups.values()].reduce((s, g) => s + g.n, 0);
const info = { model: 'ISS Shadow v' + VERSION, at: new Date(AT).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', parts,
  vehicles: Object.values(t.MODEL.vvCur || {}).map(v => v.name), irosa: Object.entries(t.MODEL.irosaLate || {}).map(([k, g]) => k + ': ' + (g.userData.state || '?')) };

// --- Viewer-Seite schreiben
const page = fs.readFileSync(new URL('./viewer_template.html', import.meta.url), 'utf8')
  .replaceAll('%VIEWER%', VIEWER).replace('%INFO%', () => JSON.stringify(info)).replace('%AMBER%', () => JSON.stringify([...AMBER_KINDS]))
  .replace('%MATERIALS%', () => JSON.stringify(materials)).replace('%TEXTURES%', () => JSON.stringify(textures.map(({ size, data }) => ({ size, data }))))
  .replace('%DATA%', () => JSON.stringify(data));
fs.writeFileSync(OUT, page);
console.log(`${OUT}: ${parts} Bauteile, ${groups.size} Gruppen, ${verts} Vertices, ${(page.length / 1e6).toFixed(1)} MB`);
dom.window.close();
