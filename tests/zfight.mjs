// zfight.mjs: findet Flächen, die in der Solid-Darstellung flimmern würden (Z-Fighting).
//
// Zwei Dreiecke flimmern, wenn sie in derselben Ebene liegen, sich dort überlappen, von derselben Seite
// sichtbar sind und verschieden aussehen. Gleiche Materialien in derselben Ebene ergeben dieselben
// Bildpunkte und stören nicht; Flächen mit entgegengesetzter Normale sind nie gleichzeitig sichtbar,
// solange beide Materialien einseitig sind.
//   coplanarOverlaps(parts, MAT) -> [{ a, b, area }] je Bauteilpaar, area in m²
import * as THREE from 'three';
const Q = 1e-3;                  // Ebenenabstand, ab dem zwei Flächen als deckungsgleich gelten (1 mm)
// Fläche des Schnitts zweier Dreiecke in 2D (Sutherland-Hodgman gegen das zweite Dreieck).
function overlapArea(A, B) {
  const area = p => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  if (area(B) < 0) B = [B[0], B[2], B[1]];
  let poly = A;
  for (let i = 0; i < 3 && poly.length; i++) {
    const p = B[i], q = B[(i + 1) % 3], out = [], side = v => (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]);
    for (let k = 0; k < poly.length; k++) {
      const c = poly[k], n = poly[(k + 1) % poly.length], sc = side(c), sn = side(n);
      if (sc >= 0) out.push(c);
      if (sc >= 0 !== sn >= 0) { const f = sc / (sc - sn); out.push([c[0] + f * (n[0] - c[0]), c[1] + f * (n[1] - c[1])]); }
    }
    poly = out;
  }
  return poly.length < 3 ? 0 : Math.abs(area(poly));
}
export function coplanarOverlaps(parts, MAT, minArea = 1e-4) {
  const buckets = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  parts.forEach((p, pi) => {
    const m = p.mesh, g = m.geometry, pos = g.attributes.position, idx = g.index, count = idx ? idx.count : pos.count;
    const mat = MAT.solid[p.kind] || MAT.solid.module, both = mat.side === THREE.DoubleSide || !!p.back;
    for (let i = 0; i < count; i += 3) {
      const v = k => (idx ? idx.getX(i + k) : i + k);
      a.fromBufferAttribute(pos, v(0)).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(pos, v(1)).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(pos, v(2)).applyMatrix4(m.matrixWorld);
      n.crossVectors(e.subVectors(b, a), c.clone().sub(a)); const len = n.length(); if (len < 1e-8) continue; n.multiplyScalar(1 / len);
      // Kanonische Richtung der Ebenennormale; flip merkt sich die tatsächliche Blickseite.
      const big = Math.abs(n.x) > 1e-4 ? n.x : Math.abs(n.y) > 1e-4 ? n.y : n.z, flip = big < 0 ? -1 : 1, nx = n.x * flip, ny = n.y * flip, nz = n.z * flip;
      const key = Math.round(nx * 500) + ',' + Math.round(ny * 500) + ',' + Math.round(nz * 500);
      let list = buckets.get(key); if (!list) buckets.set(key, list = []);
      list.push({ pi, d: nx * a.x + ny * a.y + nz * a.z, flip, both, n: [nx, ny, nz], pts: [a.toArray(), b.toArray(), c.toArray()] });
    }
  });
  const found = new Map();
  for (const list of buckets.values()) {
    list.sort((p, q) => p.d - q.d);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length && list[j].d - list[i].d < Q; j++) {
      const s = list[i], t = list[j];
      if (s.pi === t.pi || parts[s.pi].kind === parts[t.pi].kind || !(s.both || t.both || s.flip === t.flip)) continue;
      if (Math.abs(s.n[0] * t.n[0] + s.n[1] * t.n[1] + s.n[2] * t.n[2]) < 0.99999) continue;
      // In die Ebene projizieren: zwei Achsen senkrecht zur Normale.
      const N = new THREE.Vector3(...s.n), u = new THREE.Vector3(Math.abs(N.x) < 0.9 ? 1 : 0, Math.abs(N.x) < 0.9 ? 0 : 1, 0).cross(N).normalize(), w = new THREE.Vector3().crossVectors(N, u);
      const to2 = pts => pts.map(p => [p[0] * u.x + p[1] * u.y + p[2] * u.z, p[0] * w.x + p[1] * w.y + p[2] * w.z]);
      const area = overlapArea(to2(s.pts), to2(t.pts)); if (area < 1e-7) continue;
      const k = Math.min(s.pi, t.pi) + ':' + Math.max(s.pi, t.pi); found.set(k, (found.get(k) || 0) + area);
    }
  }
  return [...found].filter(([, area]) => area >= minArea).map(([k, area]) => { const [i, j] = k.split(':'); return { a: parts[i].mesh.userData.name, b: parts[j].mesh.userData.name, area }; }).sort((p, q) => q.area - p.area);
}
