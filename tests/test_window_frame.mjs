// test_window_frame.mjs: Verschieben und Größenänderung des Kamerafensters (Rechnung in window-frame.mjs).
//   - Verschieben bleibt im sichtbaren Bereich
//   - Ziehen an Kanten und Ecken hält die Mindestgröße ein und die gegenüberliegende Kante fest
//   - Zurückholen in den sichtbaren Bereich nach Verkleinern des Browserfensters
import assert from 'node:assert/strict';
import { frameRect, clampRect, EDGES } from '../window-frame.mjs';
const L = { minW: 400, minH: 240, vw: 1600, vh: 900 }, r = { x: 300, y: 200, w: 800, h: 400 };
// Verschieben
assert.deepEqual(frameRect(r, 'move', 50, -30, L), { x: 350, y: 170, w: 800, h: 400 });
assert.deepEqual(frameRect(r, 'move', -1000, -1000, L), { x: 0, y: 0, w: 800, h: 400 });
assert.deepEqual(frameRect(r, 'move', 5000, 5000, L), { x: 800, y: 500, w: 800, h: 400 });
// Rechte und untere Kante, mit Mindestgröße und Rand des Bereichs
assert.deepEqual(frameRect(r, 'se', 100, 50, L), { x: 300, y: 200, w: 900, h: 450 });
assert.deepEqual(frameRect(r, 'se', -2000, -2000, L), { x: 300, y: 200, w: 400, h: 240 });
assert.deepEqual(frameRect(r, 'e', 5000, 0, L), { x: 300, y: 200, w: 1300, h: 400 });
// Linke und obere Kante: die gegenüberliegende Kante bleibt stehen
const nw = frameRect(r, 'nw', -100, -80, L);
assert.deepEqual(nw, { x: 200, y: 120, w: 900, h: 480 });
assert.equal(nw.x + nw.w, r.x + r.w); assert.equal(nw.y + nw.h, r.y + r.h);
const shrink = frameRect(r, 'nw', 2000, 2000, L);
assert.deepEqual(shrink, { x: 700, y: 360, w: 400, h: 240 });
assert.deepEqual(frameRect(r, 'w', -1000, 0, L), { x: 0, y: 200, w: 1100, h: 400 });
assert.deepEqual(frameRect(r, 'n', 0, -1000, L), { x: 300, y: 0, w: 800, h: 600 });
// Jede Kante ergibt ein Rechteck im Bereich und mindestens in Mindestgröße
for (const e of [...EDGES, 'move']) for (const [dx, dy] of [[-3000, -3000], [3000, 3000], [37, -91]]) {
  const q = frameRect(r, e, dx, dy, L);
  assert.ok(q.w >= L.minW && q.h >= L.minH && q.x >= 0 && q.y >= 0 && q.x + q.w <= L.vw && q.y + q.h <= L.vh, e + ' ' + dx);
}
// Browserfenster kleiner als das Kamerafenster: verkleinern und in den Bereich holen
assert.deepEqual(clampRect({ x: 1200, y: 700, w: 800, h: 400 }, { minW: 400, minH: 240, vw: 1000, vh: 600 }), { x: 200, y: 200, w: 800, h: 400 });
assert.deepEqual(clampRect({ x: -50, y: 10, w: 2000, h: 900 }, { minW: 400, minH: 240, vw: 1000, vh: 600 }), { x: 0, y: 0, w: 1000, h: 600 });
assert.deepEqual(clampRect({ x: 0, y: 0, w: 800, h: 400 }, { minW: 400, minH: 240, vw: 300, vh: 200 }), { x: 0, y: 0, w: 300, h: 200 });
console.log('PASS window frame: move, 8 resize edges, viewport clamp');
