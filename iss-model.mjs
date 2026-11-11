// iss-model.mjs: prozedurales 3D-Modell der ISS (Konfiguration Herbst 2026).
//
// Körpersystem im gesamten Modell: +X vorwärts (Flugrichtung, Ende mit Node 2), +Y Steuerbord
// (Gitterträger), +Z Nadir (zur Erde). Längen in Metern. Die Anordnung der Elemente stammt aus dem
// NASA-IGOAL-Stationsmodell (siehe GEOMETRY.md), die Formen sind aus Grundkörpern aufgebaut.
//
// Inhalt:
//   - MODEL: alle Bauteile, Drehpunkte, Greifpunkte und Besuchsfahrzeuge des gebauten Modells
//   - MAT, setRenderStyle(): Materialien für die Darstellungen Holo und Solid
//   - Bauteil-Fabrik (part, cyl, box, ...) und buildStation()
//   - Montagekonventionen: solarAngles/solarNormal (SARJ, BGA), radiatorNormal (TRRJ)
//
// Regeln, die das Modell flimmerfrei halten (Z-Fighting):
//   - Keine zwei sichtbaren Flächen liegen deckungsgleich in derselben Ebene. Wo Körper aneinander
//     stoßen, haben sie offene Enden oder durchdringen sich schräg. tests/test_zfight.mjs prüft das.
//   - In der Solid-Darstellung gibt es keine Linien auf Flächen; Zell- und Plattenraster sind Texturen.
//
// Drei Arten von Bauteilen:
//   - normale Bauteile: sichtbar, anklickbar, Teil der Kollisionsprüfung
//   - decor: sichtbares Detail ohne Kollisionskörper (opts.decor)
//   - proxy: Hüllkörper offener Gitterstrukturen; in Holo sichtbar, in Solid unsichtbar (opts.proxy),
//     dazu ein Gitter aus echten Stäben, das nur in Solid erscheint (opts.solidOnly)
import * as THREE from 'three';

export const D2R = Math.PI / 180;
export const MODEL = { parts: [], pivots: {}, labels: [], ports: {}, plumes: [] };

/* ---------- Montagekonventionen ---------- */
// Geometrische Montagekonvention der äußeren Träger, getrennt von der Telemetrie-Kalibrierung CAL.
// Die halbe Drehung der äußeren Gitterträger legt den PVR-Ausleger auf die sonnenabgewandte Seite.
// Die Gegendrehung an jedem BGA erhält die beleuchtete Zellseite.
export const SOLAR_MOUNT = Object.freeze({ alphaOffset: 180, betaOffset: 180, betaSign: -1 });
// Modellgelenkwinkel (Grad) -> Drehwinkel (Radiant) der SARJ- und BGA-Gruppen inkl. Montageoffsets.
export function solarAngles(alpha, beta) { return { a: (alpha + SOLAR_MOUNT.alphaOffset) * D2R, b: (SOLAR_MOUNT.betaOffset + SOLAR_MOUNT.betaSign * beta) * D2R }; }
// Normale der Zellseite eines Flügels im Körpersystem für die Modellwinkel alpha (SARJ) und beta (BGA).
export function solarNormal(alpha, beta) { const { a, b } = solarAngles(alpha, beta); return new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b), -Math.sin(a) * Math.cos(b)); }
// TRRJ: Der Radiatorbalken dreht um die Körper-X-Achse (Längsachse der Radiatoren, wie ein Solarflügel
// um seinen Mast). Modellwinkel = Rechtsdrehung um +X in Grad, 0 = Platten flach in der XY-Ebene
// (eine Seite zur Erde). Normale der Platten im Körpersystem:
export function radiatorNormal(angle) { return new THREE.Vector3(0, -Math.sin(angle * D2R), Math.cos(angle * D2R)); }
// Drehachsen der sieben Gelenke von Canadarm2 im IGOAL-Rig (SR, SY, SP, EP, WP, WY, WR).
export const SSRMS_AX = ['x', 'z', 'z', 'z', 'z', 'y', 'x'];
// Drehachsen der sieben Gelenke eines Dextre-Arms.
export const DEXTRE_AX = ['y', 'z', 'x', 'x', 'x', 'z', 'y'];

/* ---------- Materialien ---------- */
// Kleine Rastertextur ohne Canvas (läuft auch in Node): Grundfarbe mit Fugen an zwei Kanten.
function gridTexture(size, base, line, lw) {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = x < lw || y < lw ? line : base, i = (y * size + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
const TEX = {
  cells: gridTexture(16, [22, 32, 78], [70, 78, 104], 1),          // Siliziumzellen der alten Flügel, helle Fugen
  irosa: gridTexture(16, [16, 20, 46], [44, 48, 70], 1),           // dunklere Zellen der iROSAs
  kapton: gridTexture(16, [176, 122, 60], [122, 84, 44], 1),       // Kapton-Rückseite
  radiator: gridTexture(32, [244, 244, 240], [186, 190, 192], 1),  // weiße Platten mit Fugen
  vvCells: gridTexture(16, [18, 24, 58], [52, 58, 88], 1),
};
const std = (color, roughness, metalness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
export const MAT = {
  holoFill: new THREE.MeshBasicMaterial({ color: 0x3fe0ff, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  holoFill2: new THREE.MeshBasicMaterial({ color: 0xffb54a, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  holoLine: new THREE.LineBasicMaterial({ color: 0x3fe0ff, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }),
  holoLine2: new THREE.LineBasicMaterial({ color: 0xffb54a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
  holoLineDim: new THREE.LineBasicMaterial({ color: 0x3fe0ff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }),
  hidden: new THREE.MeshBasicMaterial({ visible: false }),
  // Farben nach Fotos der Station: US-Module mit hellgrauen Aluminium-Schutzblechen, Kibo, Columbus
  // und Leonardo blank silbern, Radiatoren und Stoffhüllen weiß, Gitterträger grau, Folien goldfarben,
  // russische Module mit hellen grüngrauen Matten, alte Solarflügel dunkelblau mit oranger
  // Kapton-Rückseite, iROSAs fast schwarz.
  solid: {
    module: std(0xd4d5d2, 0.7, 0.12),
    silver: std(0xc6cacf, 0.45, 0.35),
    white: std(0xf1f1ec, 0.85, 0.02),
    rus: std(0xc9cdbd, 0.85, 0.05),
    truss: std(0x9da1a5, 0.6, 0.3),
    gold: std(0xc49a3c, 0.5, 0.45),
    dark: std(0x2c2e31, 0.7, 0.2),
    pma: std(0x4a4d51, 0.8, 0.15),
    glass: std(0x0b1622, 0.15, 0.4),
    array: std(0xffffff, 0.5, 0.15, { map: TEX.cells, emissive: 0x04081a, side: THREE.FrontSide }),
    arrayBack: std(0xffffff, 0.75, 0.05, { map: TEX.kapton, side: THREE.BackSide }),
    irosa: std(0xffffff, 0.45, 0.15, { map: TEX.irosa, emissive: 0x03050f, side: THREE.FrontSide }),
    irosaBack: std(0x77736c, 0.8, 0.05, { side: THREE.BackSide }),
    radiator: std(0xffffff, 0.6, 0.03, { map: TEX.radiator, emissive: 0x808080, emissiveMap: TEX.radiator, side: THREE.DoubleSide }),   // Eigenleuchten: bleibt auch kantig zur Sonne als weiße Fläche erkennbar
    arm: std(0xececea, 0.6, 0.15),
    vv: std(0xe6e6e0, 0.7, 0.08),
    vvRus: std(0x676b60, 0.85, 0.05),
    vvArray: std(0xffffff, 0.4, 0.3, { map: TEX.vvCells, side: THREE.DoubleSide }),
    cam: std(0xf4f4f0, 0.7, 0.05),
  },
};
// Bauteilarten, die in Holo in der zweiten Akzentfarbe erscheinen.
export const AMBER_KINDS = new Set(['array', 'irosa', 'vv', 'vvRus', 'vvArray', 'cam']);
const BACK_OF = { array: 'arrayBack', irosa: 'irosaBack' };

// Wendet die Darstellung auf alle Bauteile an. holo: Flächen als schwache Füllung mit Drahtgitter.
// Solid: beleuchtete Materialien ohne Linien; Hüllkörper (proxy) unsichtbar, Stabgitter sichtbar.
export function setRenderStyle(holo) {
  for (const p of MODEL.parts) {
    const amber = AMBER_KINDS.has(p.kind);
    if (holo) {
      p.mesh.material = amber ? MAT.holoFill2 : MAT.holoFill;
      p.wire.material = amber ? MAT.holoLine2 : (p.dim ? MAT.holoLineDim : MAT.holoLine);
    } else p.mesh.material = p.proxy ? MAT.hidden : (MAT.solid[p.kind] || MAT.solid.module);
    p.wire.visible = holo && !p.solidOnly;
    p.mesh.visible = holo ? !p.solidOnly : true;
    if (p.back) p.back.visible = !holo;
  }
}

/* ---------- Geometrie-Helfer ---------- */
export function segGeom(pts) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g; }
// Drahtgitter eines Rotationskörpers um Y: Ringe an den Profilpunkten [y, r] und Längslinien.
function latheWire(profile, segs = 16, longs = 8) {
  const p = [];
  for (const [y, r] of profile) { if (r < 1e-6) continue; for (let i = 0; i < segs; i++) { const a0 = i / segs * 2 * Math.PI, a1 = (i + 1) / segs * 2 * Math.PI; p.push(Math.sin(a0) * r, y, Math.cos(a0) * r, Math.sin(a1) * r, y, Math.cos(a1) * r); } }
  for (let i = 0; i < longs; i++) { const a = i / longs * 2 * Math.PI, s = Math.sin(a), c = Math.cos(a); for (let k = 0; k + 1 < profile.length; k++) p.push(s * profile[k][1], profile[k][0], c * profile[k][1], s * profile[k + 1][1], profile[k + 1][0], c * profile[k + 1][1]); }
  return segGeom(p);
}
function gridWire(w, h, nw, nh) {           // Ebene in XY, zentriert
  const p = [];
  for (let i = 0; i <= nw; i++) { const x = -w / 2 + w * i / nw; p.push(x, -h / 2, 0, x, h / 2, 0); }
  for (let j = 0; j <= nh; j++) { const y = -h / 2 + h * j / nh; p.push(-w / 2, y, 0, w / 2, y, 0); }
  return segGeom(p);
}
// Stäbe eines Kastengitters entlang Y als Liste von Strecken (Längsgurte, Rahmen, Diagonalen).
function latticeSegments(lx, ly, lz, bays) {
  const s = [], hx = lx / 2, hy = ly / 2, hz = lz / 2, c = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  c.forEach(([x, z]) => s.push([[x, -hy, z], [x, hy, z]]));
  for (let b = 0; b <= bays; b++) {
    const y = -hy + ly * b / bays;
    for (let k = 0; k < 4; k++) { const [x0, z0] = c[k], [x1, z1] = c[(k + 1) % 4]; s.push([[x0, y, z0], [x1, y, z1]]); }
    if (b < bays) { const y1 = -hy + ly * (b + 1) / bays, f = b % 2;
      for (let k = 0; k < 4; k++) { const [x0, z0] = c[k], [x1, z1] = c[(k + 1) % 4]; s.push(f ? [[x0, y, z0], [x1, y1, z1]] : [[x1, y, z1], [x0, y1, z0]]); } }
  }
  return s;
}
// Fügt Geometrien zu einer zusammen (nicht indiziert, nur Position und Normale).
function mergeGeoms(list) {
  const pos = [], nrm = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); return g;
}
const ROT = { x: g => g.rotateZ(-Math.PI / 2), y: g => g, z: g => g.rotateX(Math.PI / 2) };

/* ---------- Bauteil-Fabrik ---------- */
let makeLabel = null;
// Legt fest, wie 3D-Beschriftungen entstehen: fn(text, cssKlasse) -> Object3D. Ohne Fabrik (Tests) keine.
export function setLabelFactory(fn) { makeLabel = fn; }
export function addLabel(obj, text, cls = '') { if (!makeLabel) return null; const o = makeLabel(text, cls); obj.add(o); MODEL.labels.push(o); return o; }

// Erzeugt ein Bauteil: Gruppe aus Flächen-Mesh und Drahtgitter. kind steuert Material und Farbe,
// name erscheint im Tooltip. opts: sys (Systemzuordnung für den Tooltip), info, decor, proxy,
// solidOnly, dim (schwaches Drahtgitter), label.
export function part(meshGeom, wireGeom, kind, name, opts = {}) {
  const grp = new THREE.Group();
  const mesh = new THREE.Mesh(meshGeom, MAT.holoFill);
  mesh.userData = { kind, name, sys: opts.sys || null, info: opts.info || null };
  const wire = new THREE.LineSegments(wireGeom || new THREE.EdgesGeometry(meshGeom, 25), MAT.holoLine);
  wire.userData.kind = kind; wire.raycast = () => {};
  grp.add(mesh, wire);
  const rec = { mesh, wire, kind, decor: !!opts.decor, proxy: !!opts.proxy, solidOnly: !!opts.solidOnly, dim: !!(opts.dim || opts.decor || kind === 'truss'), back: null };
  if (BACK_OF[kind]) {      // Rückseite einer Solarzellenbahn (nur Solid)
    rec.back = new THREE.Mesh(meshGeom, MAT.solid[BACK_OF[kind]]); rec.back.visible = false; rec.back.raycast = () => {}; grp.add(rec.back);
  }
  grp.userData = { kind, name };
  MODEL.parts.push(rec);
  if (opts.label) addLabel(grp, opts.label, opts.labelClass);
  return grp;
}
const place = (p, parent, pos) => { p.position.set(...pos); parent.add(p); return p; };
// Zylinder oder Kegelstumpf entlang axis: r1 am +Achsen-Ende, r2 am −Achsen-Ende. opts.open: ohne Deckel.
export function cyl(parent, axis, len, r1, r2, pos, kind, name, opts = {}) {
  const segs = opts.segs || 24, rb = r2 ?? r1;
  const g = new THREE.CylinderGeometry(r1, rb, len, segs, 1, !!opts.open);
  const nr = opts.rings ?? Math.max(0, Math.round(len / 3) - 1), prof = [];
  for (let k = 0; k <= nr + 1; k++) { const t = k / (nr + 1); prof.push([-len / 2 + t * len, rb + (r1 - rb) * t]); }
  const w = latheWire(prof, Math.max(segs, 12), opts.longs ?? 8);
  ROT[axis](g); ROT[axis](w);
  return place(part(g, w, kind, name, opts), parent, pos);
}
// Zylinder zwischen zwei Punkten (r0 bei p0, r1 bei p1), z. B. die versetzten PMAs.
export function tube(parent, p0, p1, r0, r1, kind, name, opts = {}) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), d = b.clone().sub(a);
  const p = cyl(parent, 'x', d.length(), r1, r0, a.clone().add(b).multiplyScalar(0.5).toArray(), kind, name, opts);
  p.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()); return p;
}
export function box(parent, sx, sy, sz, pos, kind, name, opts = {}) { return place(part(new THREE.BoxGeometry(sx, sy, sz), null, kind, name, opts), parent, pos); }
export function sph(parent, r, pos, kind, name, opts = {}) {
  const prof = Array.from({ length: 7 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 6; return [Math.sin(a) * r, Math.cos(a) * r]; });
  return place(part(new THREE.SphereGeometry(r, 24, 16), latheWire(prof, 24, 8), kind, name, opts), parent, pos);
}
// Rotationskörper entlang axis aus einem Profil [[a, r], ...] (a aufsteigend, absolute Koordinate auf
// der Achse). c: die beiden anderen Koordinaten der Achse. Enden mit r > 0 bleiben offen.
export function hull(parent, axis, profile, c, kind, name, opts = {}) {
  const segs = opts.segs || 28;
  const g = new THREE.LatheGeometry(profile.map(([a, r]) => new THREE.Vector2(Math.max(r, 1e-4), a)), segs);
  const w = latheWire(profile, Math.max(segs, 12), opts.longs ?? 8);
  ROT[axis](g); ROT[axis](w);
  return place(part(g, w, kind, name, opts), parent, axis === 'x' ? [0, c[0], c[1]] : axis === 'y' ? [c[0], 0, c[1]] : [c[0], c[1], 0]);
}
// Gerades Prisma entlang Y: Querschnitt poly [[x, z], ...] (konvex), Länge ly, mittig um pos.
export function prism(parent, poly, ly, pos, kind, name, opts = {}) {
  const v = [], n = poly.length, h = ly / 2, cx = poly.reduce((s, p) => s + p[0], 0) / n, cz = poly.reduce((s, p) => s + p[1], 0) / n;
  const tri = (a, b, c) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = ab[1] * ac[2] - ab[2] * ac[1], ny = ab[2] * ac[0] - ab[0] * ac[2], nz = ab[0] * ac[1] - ab[1] * ac[0];
    const m = [(a[0] + b[0] + c[0]) / 3 - cx, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3 - cz];       // Normale immer nach außen
    nx * m[0] + ny * m[1] + nz * m[2] >= 0 ? v.push(...a, ...b, ...c) : v.push(...a, ...c, ...b); };
  for (let i = 0; i < n; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % n];
    tri([x0, -h, z0], [x1, -h, z1], [x1, h, z1]); tri([x0, -h, z0], [x1, h, z1], [x0, h, z0]);
    if (!opts.open) { tri([cx, h, cz], [x0, h, z0], [x1, h, z1]); tri([cx, -h, cz], [x1, -h, z1], [x0, -h, z0]); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
  const w = []; for (let i = 0; i < n; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % n]; w.push(x0, -h, z0, x0, h, z0, x0, -h, z0, x1, -h, z1, x0, h, z0, x1, h, z1); }
  const bays = opts.bays ?? Math.max(1, Math.round(ly / 2.3));
  for (let b = 1; b < bays; b++) { const y = -h + ly * b / bays; for (let i = 0; i < n; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % n]; w.push(x0, y, z0, x1, y, z1); } }
  return place(part(g, segGeom(w), kind, name, opts), parent, pos);
}
// Flache Platte in der lokalen XY-Ebene (Normale +Z), cells = Rasterteilung [entlang X, entlang Y].
export function plate(parent, sx, sy, pos, kind, name, cells = [1, 1], opts = {}) {
  const g = new THREE.PlaneGeometry(sx, sy), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cells[0], uv.getY(i) * cells[1]);
  return place(part(g, gridWire(sx, sy, Math.min(cells[0], 16), Math.min(cells[1], 4)), kind, name, opts), parent, pos);
}
// Flache Platte: Länge entlang lokal Z, Breite entlang Y, Normale +X (Solarzellenbahnen).
export function panel(parent, len, wid, pos, kind, name, cells = [10, 2], opts = {}) {
  const p = plate(parent, len, wid, pos, kind, name, cells, opts);
  for (const o of p.children) if (o.geometry && !o.geometry.userData.turned) { o.geometry.rotateY(Math.PI / 2); o.geometry.userData.turned = true; }
  return p;
}
// Viele dünne Stäbe (Strecken [[p0, p1], ...]) als ein einziges Mesh; für offene Gitter.
export function beams(parent, segments, w, kind, name, opts = {}) {
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4(), list = [];
  for (const [p0, p1] of segments) {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), d = b.clone().sub(a), len = d.length();
    const g = new THREE.BoxGeometry(w, len, w); q.setFromUnitVectors(up, d.normalize());
    g.applyMatrix4(m.compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))); list.push(g);
  }
  return place(part(mergeGeoms(list), segGeom(segments.flat(2)), kind, name, { decor: true, ...opts }), parent, [0, 0, 0]);
}
// Offener Gitterträger entlang Y: Hüllkörper für Holo und Kollision, Stabgitter für Solid.
function lattice(parent, lx, ly, lz, pos, name, opts = {}) {
  const segs = latticeSegments(lx, ly, lz, opts.bays ?? Math.max(2, Math.round(ly / 2.2)));
  const p = place(part(new THREE.BoxGeometry(lx, ly, lz), segGeom(segs.flat(2)), 'truss', name, { ...opts, proxy: true }), parent, pos);
  beams(p, segs, opts.beam ?? 0.09, 'truss', name, { solidOnly: true, sys: opts.sys });
  return p;
}
// Abgasstrahl als additiver Kegel entlang +X (anfangs unsichtbar).
function plume(len, rad) {
  const g = new THREE.ConeGeometry(rad, len, 16, 1, true); g.translate(0, -len / 2, 0); g.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.visible = false; MODEL.plumes.push(m); return m;
}

/* ---------- Druckmodule ---------- */
// Druckmodul entlang axis von a0 bis a1 mit Radius r und kegeligen Enden (Länge cone, Endradius rEnd).
// capA/capB: geschlossenes Ende (freies Modulende); sonst offen, weil dort ein Nachbar anschließt.
function pmod(parent, axis, a0, a1, r, c, kind, name, opts = {}) {
  const cone = opts.cone ?? 0.55, re = opts.rEnd ?? 1.25, prof = [];
  if (opts.capA) prof.push([a0, 0]);
  prof.push([a0, re], [a0 + cone, r]);
  const n = Math.max(1, Math.round((a1 - a0 - 2 * cone) / 2.2));
  for (let i = 1; i < n; i++) prof.push([a0 + cone + (a1 - a0 - 2 * cone) * i / n, r]);
  prof.push([a1 - cone, r], [a1, re]);
  if (opts.capB) prof.push([a1, 0]);
  return hull(parent, axis, prof, c, kind, name, opts);
}
// Ring eines Anlege- oder Andockmechanismus an einer Schnittstelle (Mitte pos, Achse axis).
const ring = (parent, axis, pos, name, r = 1.55, len = 0.3, kind = 'truss') => cyl(parent, axis, len, r, r, pos, kind, name, { decor: true, open: true, segs: 24, rings: 0, longs: 6 });

/* ---------- Solarflügel, IEA, Radiatoren ---------- */
// Solarflügel am Beta-Gelenk parent: erstreckt sich entlang dirSign·Z, Mast bei y = 0, Zellseite +X bei
// BGA 0. Zwei Zellbahnen (je 4,6 m × 32,7 m), Gittermast, Stauboxen; iROSA davor, 10° geneigt.
function solarWing(parent, dirSign, name, irosa, sys, lateIrosa) {
  const w = new THREE.Group(); parent.add(w);
  const L = 32.7, root = 1.2, zc = dirSign * (root + L / 2), z = v => dirSign * v;
  cyl(w, 'z', 1.1, 0.5, 0.5, [0, 0, z(0.55)], 'white', name + ' mast canister', { sys, segs: 14, rings: 0 });
  for (const y of [-3.45, 3.45]) box(w, 0.5, 4.6, 0.42, [0, y, z(root - 0.3)], 'white', name + ' blanket box', { sys });
  // Ausfahrmast: dreieckiger Gittermast. Hüllkörper für Holo und Kollision, Stäbe für Solid.
  const mast = cyl(w, 'z', L, 0.36, 0.36, [0, 0, zc], 'truss', name + ' mast', { segs: 3, longs: 3, rings: 14, sys, proxy: true });
  const tri = [0, 1, 2].map(i => [0.36 * Math.sin(i * 2 * Math.PI / 3), 0.36 * Math.cos(i * 2 * Math.PI / 3)]), ms = [], N = 22;
  for (let i = 0; i < 3; i++) { ms.push([[tri[i][0], tri[i][1], -L / 2], [tri[i][0], tri[i][1], L / 2]]);
    for (let b = 0; b < N; b++) { const z0 = -L / 2 + L * b / N, z1 = z0 + L / N, j = (i + 1) % 3; ms.push([[tri[i][0], tri[i][1], z0], [tri[j][0], tri[j][1], z0]], [[tri[i][0], tri[i][1], z0], [tri[j][0], tri[j][1], z1]]); } }
  beams(mast, ms, 0.035, 'truss', name + ' mast', { solidOnly: true, sys });
  panel(w, L, 4.6, [0, -3.45, zc], 'array', name, [82, 10], { sys });
  panel(w, L, 4.6, [0, 3.45, zc], 'array', name, [82, 10], { sys });
  box(w, 0.22, 11.5, 0.2, [0, 0, z(root + L + 0.1)], 'white', name + ' tip', { sys });
  if (irosa) {
    // iROSA (NASA/Redwire: 19 m × 6 m, 10° zur alten Zellbahn geneigt), Wurzel 0,9 m vor dem Mast.
    const i = new THREE.Group(); i.position.set(0.9, 0, z(1.0)); i.rotation.y = dirSign * 10 * D2R; w.add(i);
    const ch = String(sys).replace('eps:', '');
    if (lateIrosa.has(ch)) { (MODEL.irosaLate ||= {})[ch] = i; i.visible = false; }      // erscheint zeitgesteuert (updateIrosa)
    panel(i, 18.95, 6.0, [0, 0, z(9.475)], 'irosa', 'iROSA ' + name, [48, 16], { sys });
    for (const y of [-3.1, 3.1]) cyl(i, 'z', 18.95, 0.09, 0.09, [0, y, z(9.475)], 'dark', 'iROSA boom', { segs: 8, longs: 2, rings: 1, sys });
    cyl(i, 'y', 6.4, 0.16, 0.16, [0, 0, z(19.1)], 'white', 'iROSA ' + name + ' mandrel', { segs: 10, rings: 0, longs: 2, sys, decor: true });
    box(i, 0.3, 6.4, 0.3, [-0.05, 0, z(-0.2)], 'gold', 'iROSA ' + name + ' root canister', { sys, decor: true });
  }
  return w;
}
// Integrated Equipment Assembly (S4/P4 bzw. S6/P6): zwei Beta-Gelenke mit Solarflügeln
// (chans = Kanäle, z. B. ['2A', '4A']) und ein Photovoltaik-Radiator (PVR) aus sieben Platten.
function iea(sarjPivot, yRel, side, chans, irosaSet, lateIrosa) {
  const g = new THREE.Group(); g.position.set(0, yRel, 0); sarjPivot.add(g);
  box(g, 3.0, 2.9, 3.0, [0, -side * 1.15, 0], 'truss', 'IEA ' + chans.join('/'), { sys: 'eps', info: chans });
  for (const dz of [-1, 1]) box(g, 2.2, 2.3, 0.5, [0, -side * 1.15, dz * 1.74], 'white', 'IEA ' + chans.join('/') + ' battery deck', { sys: 'eps', decor: true });
  const pvr = new THREE.Group(); pvr.position.set(1.6, -side * 3.6, 0); g.add(pvr); MODEL.pvRadiators ||= [];
  const hinges = []; let parent = pvr;
  for (let j = 0; j < 7; j++) {
    const hinge = new THREE.Group(); hinge.position.x = j ? 13.6 / 7 : 0; parent.add(hinge);
    plate(hinge, 13.6 / 7 - 0.03, 3.12, [13.6 / 14, 0, 0], 'radiator', 'PV radiator ' + chans.join('/') + ' panel ' + (j + 1), [2, 3], { sys: 'tcs' });
    hinges.push(hinge); parent = hinge;
  }
  MODEL.pvRadiators.push(hinges);
  chans.forEach((ch, k) => {
    const dirSign = k === 0 ? -1 : 1;
    // Gegenüberliegende Masten teilen die Trägerstation, aber nicht die Achse (IGOAL): Der −Z-Mast
    // steht 2,75 m (Backbord 2,04 m) neben der SARJ-Achse, der +Z-Mast 2,04 m (Backbord 2,74 m),
    // jeweils 0,66 m zur Seite versetzt.
    const off = side > 0 ? (k ? [0.66, 2.04] : [-0.66, -2.75]) : (k ? [-0.66, 2.74] : [0.66, -2.035]);
    const piv = new THREE.Group(); piv.position.set(off[0], 0, off[1]); g.add(piv);
    MODEL.pivots['bga' + ch] = piv;
    solarWing(piv, dirSign, 'SAW ' + ch, irosaSet.has(ch), 'eps:' + ch, lateIrosa);
  });
  return g;
}
/* Hauptradiatoren (HRS) an S1/P1. Das TRRJ sitzt mittig an der Rückseite des Trägers und dreht den
   Radiatorbalken um die Körper-X-Achse: Balken (entlang Y bei 0°) und die drei Radiator-ORUs
   (je acht Platten 3,4 m × 2,75 m, nach hinten ausgefahren) bilden eine ebene Fläche, die um ihre
   Längsachse rollt, ±105°. Quellen: NASA ATCS Overview, NASA TM-110318 (Drehung um +X der Station),
   SSP 30219. key ist 'trrjS' oder 'trrjP' und wird zum Drehpunkt in MODEL.pivots. */
function radiatorWing(parent, y, name, key) {
  const X0 = -0.15, sys = 'tcs';                    // hintere Spitze von S1/P1
  const housing = cyl(parent, 'x', 0.95, 0.8, 0.8, [X0 - 0.475, y, 0], 'gold', name + ' TRRJ housing', { sys, segs: 20, rings: 0 });
  housing.children[0].userData.radiatorMount = key;
  const piv = new THREE.Group(); piv.position.set(X0 - 0.95, y, 0); parent.add(piv); MODEL.pivots[key] = piv;
  const rotor = cyl(piv, 'x', 0.3, 0.68, 0.68, [-0.15, 0, 0], 'truss', name + ' TRRJ rotor', { sys, segs: 20, rings: 0 });
  rotor.children[0].userData.radiatorAxle = key;
  const beam = box(piv, 0.9, 10.9, 0.8, [-0.75, 0, 0], 'truss', name + ' beam', { sys });
  MODEL.radiatorMounts ||= {}; MODEL.radiatorMounts[key] = { housing, rotor, beam };
  MODEL.radiators ||= [];
  for (let i = 0; i < 3; i++) {
    const yo = (i - 1) * 3.75;
    box(piv, 0.45, 3.4, 0.5, [-1.425, yo, 0], 'white', name + ' ORU ' + (i + 1) + ' root frame', { sys, decor: true });
    const panels = []; let prev = piv;
    for (let j = 0; j < 8; j++) {
      const hinge = new THREE.Group(); hinge.position.set(j ? -2.75 : -1.65, j ? 0 : yo, 0); prev.add(hinge);
      plate(hinge, 2.71, 3.4, [-1.375, 0, 0], 'radiator', name + ' ORU ' + (i + 1) + ' panel ' + (j + 1), [2, 3], { sys });
      panels.push(hinge); prev = hinge;
    }
    MODEL.radiators.push(panels);
  }
  return piv;
}

/* ---------- Besuchsfahrzeuge ---------- */
// Teilzylinder-Hülle entlang +X (z. B. die Solarzellen auf dem halben Umfang des Dragon-Trunks).
function arcSkin(parent, r, len, x, theta0, arc, kind, name) {
  const g = new THREE.CylinderGeometry(r, r, len, 24, 1, true, theta0, arc); ROT.x(g);
  return place(part(g, null, kind, name, { decor: true }), parent, [x, 0, 0]);
}
// US-Fahrzeuge: Andock- bzw. Anlegeschnittstelle im Ursprung, Rumpf entlang +X.
function usosVehicle(type) {
  const g = new THREE.Group(), k = 'vv';
  if (type === 'crewDragon' || type === 'cargoDragon') {
    // Dragon 2 (SpaceX): 8,1 m mit Trunk, 4,0 m Durchmesser. IDSS-Andockring, aufgeklappte Nasenkappe,
    // Kapsel mit 15° Seitenwand, Hitzeschild, 3,7 m Trunk mit Solarzellen auf dem halben Umfang, vier Flossen.
    const crew = type === 'crewDragon', nm = crew ? 'Crew Dragon ' : 'Cargo Dragon ';
    cyl(g, 'x', 0.35, 0.68, 0.68, [0.175, 0, 0], 'dark', nm + 'IDSS docking adapter', { segs: 20 });
    hull(g, 'x', [[0.35, 0], [0.35, 0.95], [0.8, 1.12], [3.9, 1.97]], [0, 0], k, nm + 'capsule', { segs: 32 });
    cyl(g, 'x', 0.25, 2.0, 1.97, [4.025, 0, 0], 'dark', nm + 'heat shield', { segs: 32, rings: 0 });
    const cone = new THREE.Group(); cone.position.set(0.55, 0, 1.0); cone.rotation.y = -1.35; g.add(cone);   // aufgeklappte Nasenkappe
    cyl(cone, 'x', 0.45, 0.25, 0.92, [0.22, 0, 0], k, nm + 'nose cone (open)', { segs: 20 });
    if (crew) {                 // vier SuperDraco-Paare und zwei Seitenfenster
      for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, rr = 1.62;
        box(g, 0.9, 0.55, 0.32, [2.75, Math.cos(a) * rr, Math.sin(a) * rr], 'dark', nm + 'SuperDraco pod', { decor: true }).rotation.x = a - Math.PI / 2; }
      for (const sd of [-1, 1]) box(g, 0.32, 0.06, 0.32, [2.0, sd * 1.4, 0], 'glass', nm + 'window', { decor: true });
    }
    cyl(g, 'x', 3.7, 1.85, 1.85, [6.0, 0, 0], k, nm + 'trunk', { segs: 32 });
    arcSkin(g, 1.87, 3.5, 6.05, 0, Math.PI, 'vvArray', nm + 'trunk solar cells');
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, rr = 1.85 + 0.3;
      box(g, 1.1, 0.06, 0.6, [7.25, Math.cos(a) * rr, Math.sin(a) * rr], k, nm + 'trunk fin', { decor: true }).rotation.x = a - Math.PI / 2; }
    g.userData.aft = 8.1;
  } else if (type === 'starliner') {
    // Boeing CST-100 Starliner: 4,56 m Durchmesser, 5,0 m mit Servicemodul.
    cyl(g, 'x', 0.35, 0.68, 0.68, [0.175, 0, 0], 'dark', 'Starliner NDS docking adapter', { segs: 20 });
    hull(g, 'x', [[0.35, 0], [0.35, 1.0], [2.95, 2.28], [5.05, 2.28], [5.05, 0]], [0, 0], k, 'Starliner', { segs: 32 });
    arcSkin(g, 2.3, 0.9, 4.5, 0, Math.PI * 2, 'vvArray', 'Starliner service module solar cells');
    g.userData.aft = 5.1;
  } else if (type === 'htvx') {
    // JAXA HTV-X (vereinfacht): CBM, Druck- und Servicemodul mit 4,4 m Durchmesser, zwei Solarflügel.
    cyl(g, 'x', 0.4, 1.0, 1.0, [0.2, 0, 0], 'truss', 'HTV-X CBM', { segs: 20 });
    hull(g, 'x', [[0.4, 1.0], [1.0, 2.2], [4.0, 2.2]], [0, 0], k, 'HTV-X pressurized module', { segs: 28 });
    hull(g, 'x', [[4.0, 2.2], [7.0, 2.2], [7.0, 0]], [0, 0], 'gold', 'HTV-X service module', { segs: 28 });
    [-1, 1].forEach(sd => box(g, 1.6, 6.5, 0.06, [5.5, sd * (2.2 + 0.3 + 3.25), 0], 'vvArray', 'HTV-X solar array'));
    g.userData.aft = 7.0;
  } else {                     // Cygnus XL: CBM, 7,9 m langes Druckmodul (3,07 m), Servicemodul, zwei UltraFlex-Flügel
    cyl(g, 'x', 0.4, 1.0, 1.0, [0.2, 0, 0], 'truss', 'Cygnus CBM', { segs: 20 });
    hull(g, 'x', [[0.4, 1.0], [0.9, 1.53], [8.3, 1.53], [8.3, 1.45]], [0, 0], 'silver', 'Cygnus pressurized module', { segs: 28 });
    hull(g, 'x', [[8.3, 1.45], [9.6, 1.45], [9.6, 0]], [0, 0], 'gold', 'Cygnus service module', { segs: 24 });
    [-1, 1].forEach(sd => { cyl(g, 'y', 1.2, 0.06, 0.06, [9.0, sd * (1.45 + 0.6), 0], 'truss', 'Cygnus array boom', { segs: 8 });
      cyl(g, 'y', 0.05, 1.9, 1.9, [9.0, sd * (1.45 + 1.2 + 1.9), 0], 'vvArray', 'Cygnus UltraFlex array', { segs: 24, rings: 0 }); });
    g.userData.aft = 9.6;
  }
  return g;
}
// Sojus MS (7,5 m) und Progress MS (7,2 m): Andockschnittstelle im Ursprung, Rumpf entlang +X.
function soyuzLike(type) {
  const g = new THREE.Group(), k = 'vvRus', soyuz = type === 'soyuz', nm = soyuz ? 'Soyuz ' : 'Progress ';
  cyl(g, 'x', 0.45, 0.1, 0.1, [0.225, 0, 0], 'truss', nm + 'docking probe', { segs: 8 });
  if (soyuz) {
    sph(g, 1.12, [1.8, 0, 0], k, 'Soyuz orbital module (BO)').scale.set(1.25, 1, 1);
    hull(g, 'x', [[3.15, 0], [3.15, 0.8], [5.25, 1.09]], [0, 0], k, 'Soyuz descent module (SA)', { segs: 24 });
  } else {
    hull(g, 'x', [[0.45, 0], [0.45, 0.6], [1.05, 1.13], [3.55, 1.13], [5.25, 1.09]], [0, 0], k, 'Progress cargo and refuelling module', { segs: 24 });
  }
  hull(g, 'x', [[5.25, 1.09], [5.75, 1.36], [7.45, 1.36], [7.45, 0]], [0, 0], 'white', nm + 'instrumentation and propulsion module', { segs: 24 });
  [-1, 1].forEach(s => panel(g, 1.4, 4.0, [5.9, s * (1.36 + 2.0), 0], 'vvArray', nm + 'array', [3, 8]).rotation.set(0, Math.PI / 2, 0));
  g.userData.aft = 7.45;
  return g;
}

/* ---------- Greifpunkte am MBS ---------- */
export const MBS_IDS = [7, 8, 11, 13];
// IGOAL MBS_MGF_1..4 (MT-System): PDGF1 Steuerbord-Nadir, PDGF2 Steuerbord-Zenit, PDGF3 Backbord-Zenit,
// PDGF4 Backbord-Nadir-Ecke der Vorderseite, Blick nach +X.
export const MBS_PDGF = { 7: [3.645, 1.373, 0.959], 8: [3.645, 1.373, -0.957], 11: [3.690, -1.286, -0.861], 13: [3.502, -1.294, 0.959] };
export const MBS_ROLLS = [135, 180, 90, 225, 45, 270, 0, 315];
// Vorwissen je Greifpunkt (Index in MBS_ROLLS). PDGF3 (v1.17): 0°, zusammen mit SSRMS_CONV in iss_twin.html
// angepasst an die Livebilder CP8 vom 10.11. und 11.11.2026 (Canadarm2 dort mit LEE B als Basis).
// PDGF2 (Dextre, v1.17): 90°. Mit der neuen Armkonvention streift Canadarm2 bei 135° einen Dextre-Arm in der
// Pose vom 19.10.2026; 90° ist der nächste Rollwinkel, bei dem die Posen vom 19.10. und 11.11. frei bleiben
// (Annahme, nicht im Bild geprüft). Die übrigen: 135°, größter Abstand bei der Pose vom 20.10.2026.
export const MBS_PRIOR = Object.freeze({ 7: 0, 8: 2, 11: 6, 13: 0 });
// Setzt MBS-Greifpunkt id auf Roll-Kandidat k (Position fest aus IGOAL, nur der Rollwinkel variiert).
export function placeMbsFixture(id, k) {
  const f = MODEL.anchors?.[id]; if (!f) return;
  f.position.set(...MBS_PDGF[id]); f.rotation.set(0, 0, -Math.PI / 2); f.rotateY(MBS_ROLLS[k & 7] * D2R); f.updateMatrix();
  f.userData.mbsCandidate = k;
}

/* ---------- Roboterarme ---------- */
// Generischer Arm mit sieben Gelenken (Dextres Arme): Gliedlängen L, Seitenversatz O, Radien rh/rb,
// Gelenkbreite W. Gibt die Gelenkgruppen und das Handgelenk zurück.
function buildArm7(base, p) {
  const J = [], k = 'arm', { L, O, rh, rb, W } = p, nm = p.name, o = { segs: 12, sys: 'ssrms' };
  const sr = new THREE.Group(); sr.position.y = p.y0; base.add(sr); J.push(sr);
  cyl(sr, 'y', 0.75 * W, rh, rh, [0, 0.375 * W, 0], k, nm(0, 'Shoulder roll'), o);
  const sy = new THREE.Group(); sy.position.y = 0.75 * W; sr.add(sy); J.push(sy);
  cyl(sy, 'z', 1.5 * rh * 2, rh, rh, [0, 0.35 * W, 0], k, nm(1, 'Shoulder yaw'), o);
  const sp = new THREE.Group(); sp.position.y = 0.75 * W; sy.add(sp); J.push(sp);
  cyl(sp, 'x', O + 3 * rh, rh, rh, [O / 2, 0, 0], k, nm(2, 'Shoulder pitch'), o);
  cyl(sp, 'y', L - 2.2 * rh, rb, rb, [O, L / 2, 0], k, nm(2, p.boom + ' 1'), { ...o, rings: 1 });
  const ep = new THREE.Group(); ep.position.set(O, L, 0); sp.add(ep); J.push(ep);
  cyl(ep, 'x', O + 3 * rh, rh, rh, [O / 2, 0, 0], k, nm(3, 'Elbow pitch'), o);
  cyl(ep, 'y', L - 2.2 * rh, rb, rb, [O, L / 2, 0], k, nm(3, p.boom + ' 2'), { ...o, rings: 1 });
  const wp = new THREE.Group(); wp.position.set(O, L, 0); ep.add(wp); J.push(wp);
  cyl(wp, 'x', O + 3 * rh, rh, rh, [O / 2, 0, 0], k, nm(4, 'Wrist pitch'), o);
  const wy = new THREE.Group(); wy.position.set(O, 0.75 * W, 0); wp.add(wy); J.push(wy);
  cyl(wy, 'z', 1.35 * W, rh, rh, [0, 0, 0.5 * W], k, nm(5, 'Wrist yaw'), o);
  const wr = new THREE.Group(); wr.position.set(0, 0.35 * W, 1.0 * W); wy.add(wr); J.push(wr);
  cyl(wr, 'y', 0.5 * W, rh, rh, [0, 0.25 * W, 0], k, nm(6, 'Wrist roll'), o);
  J.forEach((j, i) => j.userData.collisionGroup = p.group + i);
  return { J, wr };
}
// Dextre (SPDM) auf dem Transporter mt: Fuß-LEE, Körperrollgelenk, ~3 m Rumpf mit Schulterbalken und
// zwei Arme mit je sieben Gelenken. Ohne Basis-Telemetrie steht er auf der Zenitseite des MBS, mit ihr
// (CSASPDM0002) auf dem gemeldeten Greifpunkt.
function buildDextre(mt) {
  const mount = new THREE.Group(); mount.position.set(3.0, -1.2, -1.1); mount.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)); mt.add(mount);
  MODEL.dextreMount = mount; MODEL.dextreDefault = { parent: mt, position: mount.position.clone(), quaternion: mount.quaternion.clone() };
  cyl(mount, 'y', 0.5, 0.3, 0.3, [0, 0.25, 0], 'arm', 'Dextre LEE (base)', { sys: 'ssrms', segs: 12 });
  const body = new THREE.Group(); body.position.y = 0.5; mount.add(body); MODEL.dextreBody = body;   // Körperrollen um die Rumpfachse
  box(body, 0.9, 2.9, 0.9, [0, 1.45, 0], 'arm', 'Dextre torso', { sys: 'ssrms' });
  box(body, 1.6, 0.4, 0.6, [0, 2.7, 0], 'arm', 'Dextre torso shoulder beam', { sys: 'ssrms' });
  box(body, 0.5, 0.5, 0.5, [0, 3.15, 0], 'gold', 'Dextre torso head (cameras)', { sys: 'ssrms' });
  MODEL.dextre = []; MODEL.dextreTools = [];
  for (let side = 0; side < 2; side++) {
    // Schulter-Rollachsen zeigen zur Seite (±X im Rumpfsystem), die Arme hängen entlang des Rumpfs.
    // Baugleiche Arme: Die Aufnahme von Arm 2 ist die von Arm 1, um 180° um die Rumpfachse gedreht.
    const sh = new THREE.Group(); sh.position.set(side ? 0.8 : -0.8, 2.7, 0); sh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
    if (side) sh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)); body.add(sh);
    const { J, wr } = buildArm7(sh, { L: 1.45, O: 0.32, rh: 0.15, rb: 0.11, W: 0.42, y0: 0, boom: 'Dextre arm ' + (side + 1) + ' boom', group: 'dextre' + side + ':',
      name: (i, part) => 'Dextre arm ' + (side + 1) + ' joint ' + (i + 1) + (part.includes('boom') ? ' boom' : '') });
    box(wr, 0.3, 0.4, 0.3, [0, 0.42, 0], 'gold', 'Dextre tool ' + (side + 1)); MODEL.dextre.push(J); MODEL.dextreTools.push(wr);
  }
}
/* Canadarm2 nach dem NASA-IGOAL-Rig (SSRMS_SH_LEE ... WRR, Zoll -> m): LEE bis Schulter-Rollgelenk
   1,359 m entlang der Rollachse, Giergelenk 0,703 m neben der Rollachse, Nickgelenk 0,569 m entlang
   der Nickachse, zwei Ausleger von 7,110 m zwischen den Nickachsen mit 0,475 / 0,569 m Seitenversatz,
   Handgelenk-Gieren 0,703 m neben der Auslegerlinie, Handgelenk-Rollen 0,292 m und LEE 1,064 m weiter.
   Die Kette steht in den Systemen des Rigs (Ausleger entlang −x, Nickachsen z) unter einem festen
   Systemwechsel von der Greifpunkt-Konvention (+Y aus dem Greifpunkt heraus). Bei allen Rig-Winkeln = 0
   ist der Arm gestreckt. Die Abbildung Telemetrie -> Rig-Winkel regelt SSRMS_CONV in iss_twin.html. */
function buildSSRMS(base) {
  const k = 'arm', IN = 0.0254, sys = 'ssrms', o = { segs: 14, sys };
  const C = new THREE.Matrix4().set(0, -1, 0, 0, 0, 0, -1, 0, 1, 0, 0, 0, 0, 0, 0, 1);   // Greifpunktsystem -> Rig-System (Spalten)
  const ig = new THREE.Group(); ig.quaternion.setFromRotationMatrix(C.clone().transpose()); base.add(ig);
  const flip = () => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  const lee = new THREE.Group(); lee.quaternion.copy(flip()); ig.add(lee);
  cyl(lee, 'x', 0.95, 0.38, 0.38, [-0.475, 0, 0], k, 'SSRMS LEE B (base)', o);
  const J = [];
  const joint = (parent, pos, name) => { const g = new THREE.Group(); g.position.set(...pos.map(v => v * IN)); parent.add(g); g.name = name; J.push(g); return g; };
  const sr = joint(lee, [-53.4943, 0, 0], 'SR');
  cyl(sr, 'x', 0.6, 0.33, 0.33, [0.1, 0, 0], k, 'Shoulder roll', o);
  const srF = new THREE.Group(); srF.quaternion.copy(flip()); sr.add(srF);
  const sy = joint(srF, [0, 0, 27.66], 'SY');
  cyl(sy, 'z', 0.95, 0.3, 0.3, [0, 0, -0.3], k, 'Shoulder yaw', o);
  const syF = new THREE.Group(); syF.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); sy.add(syF);
  const sp = joint(syF, [0, 0, -22.4099], 'SP');
  cyl(sp, 'z', 0.85, 0.3, 0.3, [0, 0, 0.2], k, 'Shoulder pitch', o);
  cyl(sp, 'x', 6.4, 0.19, 0.19, [-3.555, 0, -0.24], k, 'SSRMS boom 1', { ...o, rings: 2 });
  const ep = joint(sp, [-279.9202, 0, -18.6999], 'EP');
  cyl(ep, 'z', 1.0, 0.3, 0.3, [0, 0, -0.03], k, 'Elbow pitch', o);
  cyl(ep, 'x', 6.4, 0.19, 0.19, [-3.555, 0, -0.285], k, 'SSRMS boom 2', { ...o, rings: 2 });
  const wp = joint(ep, [-279.92, 0, -22.4101], 'WP');
  cyl(wp, 'z', 0.85, 0.3, 0.3, [0, 0, 0.2], k, 'Wrist pitch', o);
  const wy = joint(wp, [0, -27.6601, 0], 'WY');
  cyl(wy, 'y', 0.95, 0.28, 0.28, [0, 0.3, 0], k, 'Wrist yaw', o);
  const wr = joint(wy, [-11.4999, 0, 0], 'WR');
  cyl(wr, 'x', 0.55, 0.33, 0.33, [0.02, 0, 0], k, 'Wrist roll', o);
  cyl(wr, 'x', 0.8, 0.38, 0.38, [-0.664, 0, 0], k, 'SSRMS LEE A (tip)', o);
  J.forEach((j, i) => j.userData.collisionGroup = 'arm:' + i);
  addLabel(ep, 'Canadarm2');
  // Greifsystem des freien Endes in der Greifpunkt-Konvention: gegriffen heißt, es fällt mit dem
  // Greifpunktsystem zusammen, genau wie das Basis-LEE auf seinem Greifpunkt sitzt. Der Arm kommt entlang
  // +x des Anschlusspunkts herein, also wird sein x umgekehrt (halbe Drehung um y).
  MODEL.armTip = new THREE.Group(); MODEL.armTip.position.set(-41.8901 * IN, 0, 0);
  MODEL.armTip.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).multiply(new THREE.Quaternion().setFromRotationMatrix(C)); wr.add(MODEL.armTip);
  MODEL.ssrms = J;
}

/* ---------- Station ---------- */
/* Baut die gesamte Station und füllt MODEL. cfg:
     lateIrosa      Kanäle, deren iROSA zeitgesteuert erscheint, z. B. ['2A', '3B']
     vehicleTypes   { port: [Fahrzeugtypen] }; jeder Typ wird je Port einmal unsichtbar gebaut
     vehicleLabel   (type, port) -> Beschriftung
     jets, engines  Düsen und Triebwerke der virtuellen Station ({ r, dir }) */
export function buildStation(cfg = {}) {
  const root = new THREE.Group(); root.name = 'ISS'; MODEL.root = root;
  const lateIrosa = new Set(cfg.lateIrosa || []);
  const Z = 4.85, ZR = 4.14;                       // Druckachsen USOS / russisches Segment (nadirseitig der Trägermitte)
  const N1X = -4.45, N2X = 10.96, N3Y = -6.64;     // radiale Portringe: Unity, Harmony (vorderes Ende), Tranquility
  const D = { decor: true };

  /* --- USOS-Module --- */
  pmod(root, 'x', -2.26, 6.42, 2.15, [0, Z], 'module', 'Destiny (US Lab)', { label: 'Destiny', sys: 'lab' });
  pmod(root, 'x', 6.42, 13.12, 2.2, [0, Z], 'module', 'Harmony (Node 2)', { label: 'Harmony', sys: 'n2', capB: true });
  pmod(root, 'x', -7.71, -2.26, 2.2, [0, Z], 'module', 'Unity (Node 1)', { label: 'Unity', sys: 'n1', capA: true });
  for (const x of [6.42, -2.26]) ring(root, 'x', [x, 0, Z], 'CBM ring');
  box(root, 0.5, 0.5, 0.06, [3.2, 0, Z + 2.14], 'glass', 'Destiny nadir window (WORF)', D);
  // PMA-2 und PMA-3 tragen ihr Andockende 0,71 m neben der Knotenachse (IGOAL).
  tube(root, [13.12, 0, Z], [15.46, 0, Z + 0.71], 1.25, 0.95, 'pma', 'PMA-2');
  cyl(root, 'x', 0.63, 0.9, 0.9, [15.775, 0, Z + 0.71], 'dark', 'IDA-2', { sys: 'dock' });                    // Andockfläche X 16,09
  tube(root, [N2X, 0, Z - 2.1], [N2X + 0.70, 0, 0.46], 1.25, 0.95, 'pma', 'PMA-3');
  cyl(root, 'z', 0.63, 0.9, 0.9, [N2X + 0.70, 0, 0.145], 'dark', 'IDA-3', { sys: 'dock' });                   // Andockfläche Z −0,17
  for (const [p, ax] of [[[16.0, 0, Z + 0.71], 'x'], [[N2X + 0.70, 0, -0.08], 'z']]) ring(root, ax, p, 'IDA docking ring', 0.72, 0.1, 'silver');
  pmod(root, 'y', 2.15, 8.68, 2.24, [N2X, Z], 'silver', 'Columbus (ESA)', { label: 'Columbus', capB: true, rEnd: 1.5, cone: 0.7 });
  pmod(root, 'y', -13.37, -2.15, 2.2, [N2X, Z], 'silver', 'Kibo JEM-PM (JAXA)', { label: 'Kibo', capA: true, rEnd: 1.5, cone: 0.7 });
  pmod(root, 'z', -1.15, 2.72, 2.2, [N2X, -9.95], 'silver', 'Kibo ELM-PS', { capA: true, rEnd: 1.6, cone: 0.45 });
  // Kibo Exposed Facility mit Nutzlasten und die JEM-Luftschleuse (keine Telemetrie).
  box(root, 4.7, 5.4, 0.9, [11.95, -16.0, 5.55], 'truss', 'Kibo Exposed Facility');
  cyl(root, 'y', 0.75, 0.5, 0.5, [N2X, -13.75, Z - 0.9], 'module', 'Kibo JEM airlock');
  [[-1.2, 0], [1.2, 0], [-1.2, 1], [1.2, 1]].forEach(([dx, s], i) => box(root, 1.8, 1.8, 1.5, [11.95 + dx, -14.8 - s * 2.4, 6.85], i % 2 ? 'white' : 'gold', 'JEM-EF payload'));
  // JEM-Roboterarm (JEMRMS, 10 m), über der Luftschleuse am Endschott; ohne öffentliche Telemetrie,
  // deshalb in einer festen Parkstellung über der Exposed Facility gezeichnet.
  { const o = { ...D, segs: 10 }, bx = N2X - 0.9, by = -13.55, bz = Z - 1.75;
    cyl(root, 'y', 0.5, 0.26, 0.26, [bx, by - 0.25, bz], 'arm', 'JEMRMS base (no public telemetry)', o);
    tube(root, [bx, by - 0.5, bz], [bx + 0.2, by - 4.3, bz - 1.5], 0.13, 0.13, 'arm', 'JEMRMS boom 1 (no public telemetry)', o);
    tube(root, [bx + 0.2, by - 4.3, bz - 1.5], [bx + 1.6, by - 1.0, bz - 2.6], 0.13, 0.13, 'arm', 'JEMRMS boom 2 (no public telemetry)', o);
    sph(root, 0.22, [bx + 0.2, by - 4.3, bz - 1.5], 'arm', 'JEMRMS elbow (no public telemetry)', D); }
  tube(root, [-7.71, 0, Z], [-10.0, 0, ZR], 1.25, 1.0, 'pma', 'PMA-1');
  pmod(root, 'y', -8.83, -2.15, 2.2, [N1X, Z], 'module', 'Tranquility (Node 3)', { label: 'Tranquility', sys: 'n3', capA: true });
  // Cupola: sechs Seitenfenster und ein rundes Nadirfenster, Blenden offen gezeichnet.
  hull(root, 'z', [[6.95, 1.48], [7.3, 1.48], [8.25, 0.85]], [N1X, N3Y], 'module', 'Cupola', { segs: 6, longs: 6 });
  cyl(root, 'z', 0.05, 0.8, 0.8, [N1X, N3Y, 8.26], 'glass', 'Cupola nadir window', { ...D, segs: 20, rings: 0 });
  for (let i = 0; i < 6; i++) { const a = (i + 0.5) * Math.PI / 3, rr = 1.165 * Math.cos(Math.PI / 6) + 0.012, w = box(root, 0.7, 0.03, 0.8, [N1X + Math.sin(a) * rr, N3Y + Math.cos(a) * rr, 7.775], 'glass', 'Cupola window', D);
    w.rotation.order = 'ZXY'; w.rotation.z = -a; w.rotation.x = Math.atan2(0.63, 0.95); }
  pmod(root, 'x', -2.5, 4.01, 2.28, [N3Y, Z], 'silver', 'Leonardo PMM', { capB: true, rEnd: 1.4, cone: 0.6 });
  // BEAM: aufgeblasenes Modul mit Stoffhülle (4,0 m × 3,2 m).
  hull(root, 'x', [[-10.52, 0], [-10.52, 0.7], [-10.25, 1.3], [-9.7, 1.6], [-7.6, 1.6], [-7.05, 1.3], [-6.5, 0.75]], [N3Y, Z], 'white', 'BEAM', { segs: 24 });
  // Bishop (Nanoracks) am Backbordport von Tranquility; Canadarm2 nimmt ihn zum Aussetzen ab.
  MODEL.bishop = hull(root, 'y', [[-10.52, 0], [-10.52, 0.95], [-10.2, 1.05], [-8.8, 1.0]], [N1X, Z], 'module', 'Bishop airlock', { sys: 'bishop', segs: 24 });
  { const f = new THREE.Object3D(); f.position.set(0, -10.62, 0.75); f.rotation.x = Math.PI; MODEL.bishop.add(f); MODEL.bishop.userData.fixture = f;
    cyl(MODEL.bishop, 'y', 0.15, 0.32, 0.32, [0, -10.595, 0.75], 'gold', 'Bishop grapple fixture', { sys: 'bishop', segs: 16 }); }
  // Quest: Ausrüstungsschleuse (4 m) und Crewlock (2 m) mit vier Hochdrucktanks (2 × O2, 2 × N2).
  hull(root, 'y', [[2.15, 1.25], [2.6, 2.0], [4.75, 2.0], [5.0, 1.0], [7.63, 1.0], [7.63, 0]], [N1X, Z], 'module', 'Quest airlock', { sys: 'al', segs: 28 });
  // EV-Luke der Crewlock (Scharnier oben). Offen gezeichnet, solange die Crewlock drucklos ist
  // (AIRLOCK000049 < 5 mmHg), abgeleitet: ISSLive hat keinen Lukenkanal.
  { const h = new THREE.Group(); h.position.set(N1X, 7.67, Z - 0.55); root.add(h); MODEL.evHatch = h;
    cyl(h, 'y', 0.08, 0.52, 0.52, [0, 0, 0.55], 'white', 'Quest EV hatch', { sys: 'al', segs: 18, rings: 0 }); }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = [N1X + sx * 1.72, 3.7, Z + sz * 1.72];
    cyl(root, 'y', 1.1, 0.46, 0.46, p, 'white', 'High-pressure gas tank (' + (sz < 0 ? 'O2' : 'N2') + ')', { ...D, segs: 14, rings: 0, open: true });
    for (const e of [-1, 1]) sph(root, 0.46, [p[0], p[1] + e * 0.55, p[2]], 'white', 'High-pressure gas tank dome', D);
  }
  box(root, 3.0, 4.9, 0.5, [-0.48, 5.21, 5.3], 'truss', 'ESP-2', { info: 'ESP' });
  [[-0.9, -1.3], [0.9, -1.3], [-0.9, 0.6], [0.9, 0.6]].forEach(([dx, dy], i) => box(root, 1.3, 1.5, 0.9, [-0.48 + dx, 5.21 + dy, 6.0], i % 3 ? 'white' : 'gold', 'ESP-2 spare unit', D));
  box(root, 1.6, 0.5, 2.2, [1.4, -2.45, Z], 'truss', 'ESP-1', { ...D, info: 'ESP' });
  box(root, 1.2, 0.7, 1.2, [1.4, -3.05, Z], 'white', 'ESP-1 spare unit', D);
  // Columbus: externe Nutzlastplätze am Endkegel und die Bartolomeo-Plattform an der Vorderseite
  // (trägt Sens SpaceTV-1, siehe cameras.mjs).
  for (const [dx, dz] of [[0.75, -1.9], [-0.75, -1.9], [0.75, 1.9], [-0.75, 1.9]]) box(root, 1.0, 0.9, 1.2, [N2X + dx, 8.55, Z + dz], dz < 0 ? 'white' : 'gold', 'Columbus external payload', D);
  box(root, 0.5, 2.2, 2.6, [N2X + 2.55, 7.3, Z + 0.2], 'truss', 'Bartolomeo platform', D);
  box(root, 0.45, 0.5, 0.5, [N2X + 3.0, 7.2, Z - 0.4], 'white', 'Sen SpaceTV-1', D);

  /* --- Z1 mit den beiden Ku-Band-Antennen (SGANT) --- */
  box(root, 2.6, 4.4, 3.6, [-4.55, 0, 0.9], 'truss', 'Z1 truss (CMGs)', { sys: 'cmg' });                     // Z −0,9..2,7
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(root, 'z', 1.3, 0.62, 0.62, [-4.55 + sx * 1.42, sy * 1.2, 0.3], 'white', 'Control moment gyroscope cover', { ...D, sys: 'cmg', segs: 14, rings: 0 });
  tube(root, [-4.55, -1.9, -0.9], [-4.55, -4.25, -4.4], 0.08, 0.08, 'truss', 'SGANT boom', { segs: 6, longs: 2 });
  const sg = new THREE.Group(); sg.position.set(-4.55, -4.3, -4.6); root.add(sg); MODEL.pivots.sgant = sg;
  // Kardanaufhängung an die Live-Ausrichtung angepasst (20.10.2026): Elevation dreht um Körper +Y,
  // Kreuzelevation um die innere +X-Achse mit umgekehrtem Sinn; bei (0, 0) blickt die Schüssel nach
  // oben (Körper −Z). Die Hauptstrahlrichtung trifft dann den genutzten TDRS.
  const dish = new THREE.Group(); sg.add(dish); MODEL.pivots.kuCross = dish;
  cyl(dish, 'z', 0.5, 0.2, 0.95, [0, 0, 0.25], 'white', 'Ku-band SGANT', { segs: 20, sys: 'ct', rings: 0 });   // Öffnung zeigt nach −Z
  MODEL.kuBoresight = new THREE.Object3D(); MODEL.kuBoresight.position.set(0, 0, -1); dish.add(MODEL.kuBoresight);
  // Zweite SGANT (2010 als Reserve angebracht) am Steuerbord-Ausleger; kein öffentlicher Kanal, daher starr.
  tube(root, [-4.55, 1.9, -0.9], [-4.55, 4.25, -4.4], 0.08, 0.08, 'truss', 'SGANT 2 boom (no public telemetry)', { ...D, segs: 6, longs: 2 });
  cyl(root, 'z', 0.5, 0.2, 0.95, [-4.55, 4.3, -4.35], 'white', 'Ku-band SGANT 2 (no public telemetry)', { ...D, segs: 20, rings: 0 });

  /* --- Gitterträger innen: S0, S1/P1 (dreieckig, Spitze hinten), S3/P3 --- */
  const oct = (x0, x1, hz, c) => [[x0, -hz + c], [x0 + c, -hz], [x1 - c, -hz], [x1, -hz + c], [x1, hz - c], [x1 - c, hz], [x0 + c, hz], [x0, hz - c]];
  prism(root, oct(-1.65, 1.70, 2.15, 0.7), 13.42, [0, 0, 0], 'truss', 'S0 truss');
  // Vier Streben zwischen S0 und Destiny (Module-to-Truss Structure).
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) tube(root, [0.2 + sx * 1.2, sy * 2.6, 2.1], [2.0 + sx * 2.4, sy * 1.3, Z - 1.75], 0.07, 0.07, 'truss', 'Module-to-truss strut', { ...D, segs: 6, longs: 2 });
  for (const [n, s] of [['S', 1], ['P', -1]]) {
    prism(root, [[-0.15, 0], [1.7, -2.2], [1.7, 2.2]], 13.62, [0, s * (6.71 + 6.81), 0], 'truss', n + '1 truss');
    prism(root, oct(-1.68, 1.69, 2.2, 0.7), 5.22, [0, s * (20.33 + 2.61), 0], 'truss', n + '3 truss');
    // Geräte des äußeren Kühlkreislaufs in den Feldern der schrägen Trägerflächen von S1/P1: Ammoniaktank,
    // Stickstofftank (Zenitseite) und Pumpenmodul (Nadirseite). In die Fläche eingelassen, 6 cm Überstand (Flächenneigung
    // atan(1,85/2,2) = 0,70 rad gegen die Z-Achse), Lage angenähert.
    box(root, 0.5, 2.9, 1.6, [0.92, s * 11.2, -0.98], 'white', 'Ammonia tank assembly (' + n + '1)', { ...D, sys: 'tcs' }).rotation.y = -0.70;
    box(root, 0.5, 1.5, 1.0, [0.92, s * 15.4, -0.98], 'white', 'Nitrogen tank assembly (' + n + '1)', { ...D, sys: 'tcs' }).rotation.y = -0.70;
    box(root, 0.5, 1.6, 1.2, [0.92, s * 17.9, 0.98], 'white', 'Pump module (' + n + '1)', { ...D, sys: 'tcs' }).rotation.y = 0.70;
  }
  // Nutzlastplätze an S3/P3 (IGOAL): AMS-02 S3 oben innen, ELC-2 S3 oben außen, ELC-4 S3 unten innen,
  // ESP-3 S3 unten außen; ELC-3 P3 oben, ELC-1 P3 unten. Die Träger sitzen hinter der Trägermitte (X −0,86).
  const carrier = (name, y, zSign, kind = 'ELC') => {
    box(root, 4.9, 1.9, 0.3, [-0.86, y, zSign * 2.36], 'truss', name + ' deck', { info: kind });
    [-1.2, 1.2].forEach((dx, i) => box(root, 1.7, 1.5 + i * 0.3, 1.6, [-0.86 + dx, y + (i ? 0.15 : -0.2), zSign * 3.31], i ? 'gold' : 'white', name + ' payload ' + (i + 1)));
  };
  // AMS-02: nur der Hauptkörper (IGOAL Y 20,5..22,9) als Kollisionskörper, dazu Magnet und Radiatoren.
  box(root, 3.2, 2.4, 2.6, [-0.86, 21.72, -3.5], 'white', 'AMS-02', { label: 'AMS-02' });
  cyl(root, 'z', 0.7, 1.25, 1.25, [-0.86, 21.72, -5.15], 'silver', 'AMS-02 detector stack', { segs: 20, rings: 0 });
  for (const e of [-1, 1]) box(root, 0.06, 2.3, 2.9, [-0.86 + e * 1.75, 21.72, -4.0], 'radiator', 'AMS-02 radiator', D).rotation.y = e * 0.18;
  carrier('ELC-2', 24.6, -1); carrier('ELC-4', 21.3, 1); carrier('ESP-3', 24.5, 1, 'ESP');
  carrier('ELC-3', -24.04, -1); carrier('ELC-1', -24.42, 1);
  // S-Band-Antennen (SASA) auf der Zenitseite von S1/P1, hinter dem Bewegungsraum von MT, MBS und Dextre.
  [1, -1].forEach((sign, i) => {
    cyl(root, 'z', 1.0, 0.08, 0.08, [1.2, sign * 11, -2.7], 'truss', 'S-band SASA mast', { segs: 8 });
    const az = new THREE.Group(); az.position.set(1.2, sign * 11, -3.25); root.add(az);
    const el = new THREE.Group(); az.add(el); MODEL.pivots['sbandAz' + i] = az; MODEL.pivots['sbandEl' + i] = el;
    cyl(el, 'z', 0.25, 0.45, 0.12, [0, 0, -0.12], 'white', 'S-band antenna ' + (i + 1), { sys: 'ct', segs: 18, rings: 0 });   // Hauptstrahl −Z bei az = el = 0
  });
  /* --- Hauptradiatoren (TRRJ) --- */
  radiatorWing(root, 14.68, 'S1 radiator', 'trrjS');
  radiatorWing(root, -14.68, 'P1 radiator', 'trrjP');

  /* --- SARJs und äußere Träger. SARJ bei |Y| 26,0; Beta-Gelenke der IEA S4/P4 bei |Y| 33,4, S6/P6 bei
     48,45 (IGOAL). Kanäle stehen als [Mast nach −Z, Mast nach +Z]; der Backbordträger ist der um 180°
     gegierte Steuerbordträger, deshalb tragen dort 4A/2B die −Z-Masten. So hat jedes BGA denselben
     Drehsinn um seinen eigenen Mast. iROSAs: 2B/4B (2021), 3A/4A (2022), 1A/1B (2023), 2A und 3B (2026). --- */
  const irosa = new Set(['1A', '3A', '4A', '1B', '2B', '4B', '2A', '3B']);
  for (const [n, s] of [['S', 1], ['P', -1]]) {
    cyl(root, 'y', 0.9, 1.75, 1.75, [0, s * 26.0, 0], 'gold', n + ' SARJ', { segs: 28, longs: 12, sys: 'sarj', rings: 0 });
    const piv = new THREE.Group(); piv.position.set(0, s * 26.0, 0); root.add(piv); MODEL.pivots['sarj' + n] = piv;
    lattice(piv, 2.4, 4.32, 3.2, [0.35, s * 2.61, 0], n + '4 truss');
    lattice(piv, 2.1, 1.78, 3.2, [0.35, s * 8.56, 0], n + '5 truss', { bays: 1 });
    lattice(piv, 2.3, 10.4, 2.8, [0.35, s * 14.65, 0], n + '6 truss');
    const chans = n === 'S' ? [['1A', '3A'], ['3B', '1B']] : [['4A', '2A'], ['2B', '4B']];
    iea(piv, s * 7.37, s, chans[0], irosa, lateIrosa);
    iea(piv, s * 22.45, s, chans[1], irosa, lateIrosa);
  }

  /* --- Mobiles Wartungssystem (MSS). IGOAL: MT-Wagen X 1,6..2,45 auf der Vorderseite des Trägers,
     MBS-Rahmen X 2,5..3,5, dessen vier Greifpunkte an den Ecken der Vorderseite. --- */
  const mt = new THREE.Group(); root.add(mt); MODEL.pivots.mt = mt;
  box(mt, 0.85, 4.6, 2.3, [2.03, 0, 0.1], 'truss', 'Mobile Transporter', { sys: 'mss' });
  box(mt, 1.0, 4.4, 2.3, [3.0, 0, 0], 'arm', 'Mobile Base System', { sys: 'mss' });
  for (const z of [-0.95, 0.95]) box(root, 0.18, 46, 0.18, [1.72, 0, z], 'truss', 'MT rail');
  MODEL.anchors = {};
  for (const id of MBS_IDS) {
    const f = new THREE.Group(); mt.add(f); MODEL.anchors[id] = f; placeMbsFixture(id, MBS_PRIOR[id]);
    cyl(f, 'y', 0.15, 0.32, 0.32, [0, -0.075, 0], 'gold', 'MBS PDGF ' + id, { segs: 16, rings: 0 });
  }
  // Greifpunkte an Modulen: [id, Ort, x-Achse, y-Achse (aus dem Greifpunkt heraus)]. Lab und Node 2 sind
  // die IGOAL-Greifpunktsysteme (Lab Backbord-Nadir, Node 2 Nadirseite des hinteren Endes). Node 3 und
  // FGB behalten modellierte Zenitpositionen.
  for (const [id, pos, ax, ay] of [[1, [3.516, -1.439, 6.723], [0.9997, 0.0212, 0.0152], [0.001, -0.6122, 0.7907]],
    [4, [7.586, -0.396, 7.196], [0.0255, -0.9868, -0.1597], [0.0016, -0.1597, 0.9872]],
    [2, [N1X, N3Y, Z - 2.4], [1, 0, 0], [0, 0, -1]], [14, [-16.2, 0, ZR - 2.2], [1, 0, 0], [0, 0, -1]]]) {
    const x = new THREE.Vector3(...ax), y = new THREE.Vector3(...ay).normalize(); x.addScaledVector(y, -x.dot(y)).normalize(); const z = new THREE.Vector3().crossVectors(x, y);
    const f = new THREE.Group(); f.position.set(...pos); f.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); root.add(f); MODEL.anchors[id] = f;
    cyl(f, 'y', 0.15, 0.32, 0.32, [0, -0.075, 0], 'gold', 'Module PDGF ' + id, { segs: 16, rings: 0 });
  }
  const base = new THREE.Group(); MODEL.anchors[7].add(base); MODEL.armBase = base;
  buildSSRMS(base);
  buildDextre(mt);
  // POA (Payload/ORU Accommodation): ein LEE auf der Zenitseite des MBS (Lage angenähert).
  // Platzhalter-Nutzlast, solange CSAMBA00004 CAPTURED meldet.
  { const poa = new THREE.Group(); poa.position.set(3.0, 1.55, -1.25); mt.add(poa);
    cyl(poa, 'z', 0.5, 0.36, 0.36, [0, 0, 0], 'arm', 'MBS POA (LEE)', { sys: 'ssrms', segs: 12 });
    MODEL.poaPayload = box(poa, 1.2, 1.2, 1.2, [0, 0, -0.85], 'gold', 'Payload on POA (identity not in telemetry)', { sys: 'payload' }); MODEL.poaPayload.visible = false; }
  // Platzhalter für eine Nutzlast am Spitzen-LEE, deren Identität die Telemetrie nicht nennt.
  { const u = new THREE.Group(); u.visible = false; root.add(u); MODEL.unknownPayload = u;
    box(u, 1.3, 1.3, 1.3, [0, 0, 0], 'gold', 'Payload on Canadarm2 (identity not in telemetry)', { sys: 'payload' });
    const f = new THREE.Object3D(); f.position.set(0, 0.65, 0); u.add(f); u.userData.fixture = f; }
  // Platzhalter-ORUs in den OTCMs von Dextre (CSASPDM0010 / 0019 CAPTURED).
  MODEL.otcmPayloads = MODEL.dextreTools.map((wr, i) => { const b = box(wr, 0.55, 0.45, 0.55, [0, 0.85, 0], 'gold', 'ORU in Dextre OTCM ' + (i + 1) + ' (identity not in telemetry)', { sys: 'payload' }); b.visible = false; return b; });

  /* --- Russisches Segment (IGOAL): Achse 0,71 m zenitseitig der USOS-Achse; das Übergangsabteil von
     Swesda, an dem Poisk und Nauka sitzen, bei X −23,69 --- */
  hull(root, 'x', [[-22.9, 0.6], [-22.4, 1.0], [-22.0, 1.6], [-21.4, 2.05], [-18.6, 2.05], [-15.8, 2.05], [-13.6, 2.05], [-12.7, 1.3], [-12.2, 1.1], [-10.4, 1.1], [-10.0, 1.0], [-10.0, 0]], [0, ZR], 'rus', 'Zarya (FGB)', { label: 'Zarya' });
  // Die Flügel von Sarja sind seit 2007 eingefahren (Platz für die Radiatoren von P1/S1).
  for (const s of [-1, 1]) box(root, 3.3, 0.9, 0.35, [-17.2, s * 2.65, ZR], 'dark', 'Zarya array (retracted)', D);
  hull(root, 'z', [[5.0, 1.0], [5.6, 1.17], [10.9, 1.17], [11.24, 0.75]], [-11.14, 0], 'rus', 'Rassvet (MRM-1)', { sys: 'rs', segs: 20 });   // Andockfläche Z 11,24
  sph(root, 1.35, [-23.69, 0, ZR], 'rus', 'Zvezda transfer compartment', { sys: 'rs' });
  hull(root, 'x', [[-35.73, 0], [-35.73, 0.8], [-35.3, 0.8], [-34.9, 2.05], [-30.2, 2.05], [-29.7, 1.45], [-25.0, 1.45], [-24.6, 0.7]], [0, ZR], 'rus', 'Zvezda (SM)', { label: 'Zvezda', sys: 'rs' });   // hintere Andockfläche X −35,73
  // Swesda-Flügel drehen um ihre Längsachse (Körper-Y) zur Sonne. ISSLive hat dafür keinen Kanal; die
  // Bildschleife richtet sie bei Sonnenlicht vorhergesagt aus (updateZvezdaArrays).
  MODEL.zvezdaArrays = [-1, 1].map(s => { const g = new THREE.Group(); g.position.set(-27.95, s * (1.55 + 6.9), ZR); root.add(g);
    panel(g, 2.5, 13.8, [0, 0, 0], 'array', 'Zvezda array', [8, 44], { sys: 'zvezdaArray' }).rotation.set(0, Math.PI / 2, 0);
    cyl(g, 'y', 0.5, 0.07, 0.07, [0, -s * 7.0, 0], 'truss', 'Zvezda array boom', { ...D, segs: 6, rings: 0, longs: 2 }); return g; });
  hull(root, 'z', [[-1.03, 0.75], [-0.7, 1.27], [2.6, 1.27], [2.85, 1.0]], [-23.69, 0], 'rus', 'Poisk (MRM-2)', { sys: 'rs', segs: 20 });   // Andockfläche Z −1,03
  hull(root, 'z', [[5.4, 1.1], [6.3, 2.1], [16.6, 2.1], [17.9, 1.2], [18.6, 0.8]], [-23.69, 0], 'rus', 'Nauka (MLM)', { label: 'Nauka', sys: 'rs' });
  [-1, 1].forEach(s => panel(root, 2.4, 9.8, [-23.69, s * (2.2 + 4.9), 13.05], 'array', 'Nauka array', [8, 32]).rotation.set(0, Math.PI / 2, 0));
  box(root, 0.12, 3.0, 5.0, [-21.35, 0, 10.0], 'radiator', 'Nauka radiator');
  cyl(root, 'x', 1.6, 0.55, 0.55, [-20.75, 0, 14.6], 'rus', 'Nauka experiment airlock', { ...D, segs: 14, rings: 0 });
  sph(root, 1.65, [-23.69, 0, 19.79], 'rus', 'Prichal (UM)', { sys: 'rs' });                                   // Nadir-Andockfläche Z 21,83
  // European Robotic Arm, an der Rückseite von Nauka verstaut (ohne öffentliche Telemetrie).
  cyl(root, 'z', 4.8, 0.17, 0.17, [-26.09, 0, 9.5], 'arm', 'ERA boom 1', { segs: 10 });
  cyl(root, 'z', 4.8, 0.17, 0.17, [-26.09, 0.5, 14.4], 'arm', 'ERA boom 2', { segs: 10 });
  cyl(root, 'x', 0.5, 0.28, 0.28, [-25.84, 0.25, 11.95], 'arm', 'ERA elbow', { segs: 10 });
  for (const z of [7.0, 16.85]) cyl(root, 'x', 0.55, 0.3, 0.3, [-25.79, z > 12 ? 0.5 : 0, z], 'arm', 'ERA end effector / base', { segs: 10 });

  /* --- Andockports (IGOAL-Schnittstellenebenen): Jeder Fahrzeugtyp, den ein Port aufnehmen kann, wird
     einmal unsichtbar gebaut; die Bildschleife zeigt den, der dort angedockt ist --- */
  const PORTS = {
    smAft: { pos: [-35.73, 0, ZR], dir: [-1, 0, 0] }, mrm1: { pos: [-11.14, 0, 11.24], dir: [0, 0, 1] },
    mrm2: { pos: [-23.69, 0, -1.03], dir: [0, 0, -1] }, prichal: { pos: [-23.69, 0, 21.83], dir: [0, 0, 1] },
    ida2: { pos: [16.09, 0, Z + 0.71], dir: [1, 0, 0] }, ida3: { pos: [N2X + 0.70, 0, -0.17], dir: [0, 0, -1] },
    unityNadir: { pos: [N1X, 0, Z + 2.22], dir: [0, 0, 1] }, harmonyNadir: { pos: [N2X, 0, Z + 2.22], dir: [0, 0, 1] },
  };
  MODEL.vvG = {}; MODEL.vvCur = {};
  for (const [port, p] of Object.entries(PORTS)) {
    MODEL.ports[port] = p;
    for (const type of cfg.vehicleTypes?.[port] || []) {
      const g = type === 'soyuz' || type === 'progress' ? soyuzLike(type) : usosVehicle(type); g.position.set(...p.pos);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...p.dir));
      const lb = addLabel(g, cfg.vehicleLabel?.(type, port) || type, 'vv'); if (lb) lb.position.set(4, 0, 0); g.userData.label = lb;
      if (port === 'smAft') { const pl = plume(9, 1.8); pl.position.set(g.userData.aft, 0, 0); g.add(pl); g.userData.plume = pl; }
      const key = port + ':' + type; g.traverse(o => { if (o.isMesh) o.userData.vvKey = key; });
      g.visible = false; root.add(g); MODEL.vvG[key] = g;
    }
  }
  // Haupttriebwerke und Lageregelungsdüsen hinten an Swesda
  const smMain = plume(10, 1.5); smMain.position.set(-35.73, 0, ZR); smMain.rotation.y = Math.PI; root.add(smMain); MODEL.smMain = smMain;
  MODEL.rcs = [[0, 1.6, 0], [0, -1.6, 0], [0, 0, 1.6], [0, 0, -1.6]].map(([, y, z]) => {
    const p = plume(2.5, 0.35); p.position.set(-34.9, y, ZR + z);
    p.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, Math.sign(y), Math.sign(z))); root.add(p); return p;
  });
  // Düsen und Triebwerke der virtuellen Station, auf der Achse von Swesda gezeichnet.
  const jetPlume = (j, len, rad) => { const p = plume(len, rad); p.position.set(j.r[0], j.r[1], j.r[2] + ZR); p.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...j.dir).negate()); root.add(p); return p; };
  MODEL.virtualJets = (cfg.jets || []).map(j => jetPlume(j, 3, 0.35));
  MODEL.virtualMain = (cfg.engines || []).map(j => jetPlume(j, 9, 1));
  return root;
}
