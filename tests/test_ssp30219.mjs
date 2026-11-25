// test_ssp30219.mjs: Gelenkwinkel gegen SSP 30219 Rev. K (ISS-Bezugssysteme, Bild 4.0-8, 1.2.2019).
//   - SARJ: alpha_stbd = alpha, alpha_port = -alpha; bei alpha = 0 zeigt die Zellseite nach -Z (Zenit).
//     Die Flügelnormale bei generischem beta = 0 ist dann Ry(alpha)·(0, 0, -1).
//   - TRRJ: gamma = Rechtsdrehung um +X, 0 = Radiatorbalken in der X-Y-Ebene, Steuerbord und Backbord gleich.
//   - BGA: die Formeln der Norm (z. B. beta_S4UPR3A = -beta - 90). Seit v1.23 folgt CAL ihnen genau; bestätigt
//     an zwei Livebildern von CP13 (24.11. und 25.11.2026). Bis v1.22 lag CAL 45° daneben.
import assert from 'node:assert/strict'; import * as THREE from 'three'; import { loadTwin } from './harness.mjs';
const { t, w } = await loadTwin(['cal']);
const D = Math.PI / 180, Ry = a => new THREE.Matrix4().makeRotationY(a * D), Rx = a => new THREE.Matrix4().makeRotationX(a * D);
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) / D;
// SARJ: Modell-beta so gewählt, dass die Flügelnormale in der X-Z-Ebene liegt; verglichen wird die Lage der
// Flügelebene (Vorder- oder Rückseite legt beta fest, nicht alpha)
for (let s = 0; s < 360; s += 7.5) {
  const want = new THREE.Vector3(0, 0, -1).applyMatrix4(Ry(s));
  for (const [k, tlm] of [['sarjS', s], ['sarjP', (360 - s) % 360]]) {
    const a = t.cal(k, tlm), b0 = w.solarAngles(a, 0).b, b1 = w.solarAngles(a, 1).b, b = -b0 / (b1 - b0);   // Modell-beta mit Normale in der X-Z-Ebene
    const n = w.solarNormal(a, b); assert.ok(Math.min(ang(n, want), ang(n.clone().negate(), want)) < 1e-6, `${k} ${tlm}° folgt SSP 30219 (alpha)`);
  }
}
// TRRJ
for (const k of ['trrjS', 'trrjP']) for (let g = -105; g <= 105; g += 5) {
  const n = w.radiatorNormal(t.cal(k, g)), want = new THREE.Vector3(0, 0, 1).applyMatrix4(Rx(g));
  assert.ok(Math.min(ang(n, want), ang(n.clone().negate(), want)) < 1e-6, `${k} ${g}° folgt SSP 30219 (gamma)`);
}
// BGA (v1.23): wie die Norm, für alle Kanäle
const BJ = { '3A': j => -j - 90, '1A': j => j - 90, '1B': j => -j - 90, '3B': j => j - 90, '4A': j => j + 90, '2A': j => -j + 90, '2B': j => j + 90, '4B': j => -j + 90 };
const S = ['1A', '3A', '1B', '3B'];
for (const ch of Object.keys(BJ)) for (let j = 0; j < 360; j += 15) {
  const s = 30, p = 330, isS = S.includes(ch), alpha = isS ? s : -p;
  const norm = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().multiplyMatrices(Ry(alpha), Rx(BJ[ch](j))));
  const model = w.solarNormal(t.cal(isS ? 'sarjS' : 'sarjP', isS ? s : p), t.cal('bga' + ch, j));
  assert.ok(ang(model, norm) < 1e-6, `BGA ${ch} ${j}°: wie SSP 30219 (${ang(model, norm).toFixed(2)}°)`);
}
console.log('PASS SSP 30219: SARJ (alpha) und TRRJ (gamma) wie in der Norm, BGA wie in der Norm (Livebilder CP13)');
