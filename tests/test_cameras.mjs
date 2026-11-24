// test_cameras.mjs: Kameradaten und Hilfsfunktionen des Kamerafensters (ohne Browser).
//   - Sichtfelder der Optiken gegen die veröffentlichten NASA-Werte
//   - Einbett-Adressen für YouTube-Links, Auswahlliste der Streams, Einpassen des Bildformats
//   - Einbaustellen: Jede Kamera liegt an der Struktur, an der sie laut Quelle sitzt.
import assert from 'node:assert/strict'; import * as THREE from 'three';
import { CAMERAS, DOUG_RIGS, OPTICS, FOV_MIN, FOV_MAX, fovToSlider, sliderToFov, clampFov, fineStep, wrapAngle, CHANNELS, KNOWN_STREAMS, FEEDS, feedUrl, embedUrl, streamChoices, fitRect } from '../cameras.mjs';
const hfov = o => 2 * Math.atan(Math.tan(o.fovMax * Math.PI / 360) * o.aspect) * 180 / Math.PI;
// SD-Kamera der ETVCG: 77° × 61° bis 10° × 8° (NTSC 4:3).
assert.ok(Math.abs(hfov(OPTICS.sd) - 77) < 1.5 && OPTICS.sd.fovMax === 61 && OPTICS.sd.fovMin === 8 && OPTICS.sd.aspect === 4 / 3);
// HD-Kamera (EHDC): horizontal 36° bis 3,4° bei 16:9, also senkrecht 20,7° bis 1,9°.
assert.ok(Math.abs(hfov(OPTICS.hd) - 36) < 0.1 && Math.abs(OPTICS.hd.fovMax - 20.7) < 0.1 && Math.abs(OPTICS.hd.fovMin - 1.9) < 0.1);
// Kameras des MSS: 52° × 40° bis 6° × 4°.
assert.ok(Math.abs(hfov(OPTICS.mss) - 52) < 1.5 && OPTICS.mss.fovMin === 4);
// Sen-Nadirkamera: 240 km Bildbreite aus etwa 415 km Höhe.
assert.ok(Math.abs(2 * 415 * Math.tan(hfov(OPTICS.senNadir) * Math.PI / 360) - 240) < 3);
for (const c of CAMERAS) { assert.ok(c.optics.length && c.optics.every(k => OPTICS[k]), c.id); assert.ok(c.target || c.dir || DOUG_RIGS[c.rig], c.id); assert.ok(!c.rig || c.ptu, c.id + ': Kette heißt schwenkbar'); }
assert.equal(new Set(CAMERAS.map(c => c.id)).size, CAMERAS.length);
// Kameraketten (DOUG_RIGS): Auge und Blickrichtung im Befestigungssystem für Schwenk p und Neigung t.
const M = a => new THREE.Matrix4().compose(new THREE.Vector3(...a.slice(0, 3)), new THREE.Quaternion(...a.slice(3)), new THREE.Vector3(1, 1, 1));
function eyeOf(id, p, t) {
  const R = DOUG_RIGS[id], m = M(R.pan.pre).multiply(new THREE.Matrix4().makeRotationZ(p * Math.PI / 180)).multiply(M(R.pan.post))
    .multiply(M(R.tilt.pre)).multiply(new THREE.Matrix4().makeRotationY(t * Math.PI / 180)).multiply(M(R.tilt.post)).multiply(M(R.eye));
  return { pos: new THREE.Vector3().setFromMatrixPosition(m), look: new THREE.Vector3(-1, 0, 0).transformDirection(m), up: new THREE.Vector3(0, 0, 1).transformDirection(m) };
}
const cam = id => CAMERAS.find(c => c.id === id);
const near = (v, w, tol, msg) => assert.ok(v.distanceTo(new THREE.Vector3(...w)) < tol, msg + ': ' + v.toArray().map(x => x.toFixed(3)));
// Augpunkte der Paketpose (Schwenk −180°, Neigung 90°, recherche/DOUG/DOUG_zero_configurations.md) kommen heraus.
for (const [id, p] of Object.entries({ cp3: [0.926, 18.496, 3.631], cp8: [0.038, -19.395, -4.051], cp9: [0.165, -19.395, 4.064], cp13: [5.385, 3.911, 3.506] })) near(eyeOf(id, -180, 90).pos, p, 0.005, id + ' DOUG eye point');
// Lage der Kameraports (Körpersystem: +Y Steuerbord, +Z Nadir).
const at = id => eyeOf(id, 0, 0).pos;
assert.ok(at('cp8').y < -18 && at('cp8').z < 0, 'CP8: P1 außen, Zenit'); assert.ok(at('cp9').y < -18 && at('cp9').z > 0, 'CP9: P1 außen, Nadir');
assert.ok(at('cp3').y > 18 && at('cp3').y < 20.3 && at('cp3').z > 0, 'CP3: S1 außen, Nadir'); assert.ok(at('cp13').y > 2 && at('cp13').x > 5, 'CP13: Destiny, Steuerbord');
// CP13 am 24.11.2026 an das Livebild angepasst (Canadarm2-LEE zeigt auf die Kamera): Schwenk −8,5°, Neigung −29,5°.
// Auge und Blick wie in DOUG gerechnet (Python, unabhängig vom Modell).
const fit13 = eyeOf('cp13', -8.5, -29.5); near(fit13.pos, [5.735, 3.903, 3.481], 0.005, 'CP13 eye 24.11.');
assert.ok(fit13.look.y > 0.6 && fit13.look.z > 0.5, 'CP13 blickt nach Steuerbord und Nadir zum Arm');
// Trägerrohre: Fuß an der Struktur, Kopf am Schwenkgehäuse (DOUG CAMERA_STANCHION, VCSA_BASE).
for (const id of ['cp3', 'cp8', 'cp9', 'cp13']) { const [a, b] = DOUG_RIGS[id].stanchion.map(p => new THREE.Vector3(...p)); assert.ok(a.distanceTo(b) > 1.2 && a.distanceTo(b) < 1.4, id + ' stanchion ' + a.distanceTo(b));
  near(b, DOUG_RIGS[id].pan.pre.slice(0, 3), 1e-3, id + ' Schwenkgehäuse am Rohrkopf'); }
// Auslegerkameras: 2,65 m vom Ellbogen (DOUG), Neigeachse 0,27 m über der Grundplatte.
assert.ok(Math.abs(DOUG_RIGS.boom1.pan.pre[0] - -4.453) < 0.01 && Math.abs(DOUG_RIGS.boom2.pan.pre[0] - -2.646) < 0.01);
// LEE-Kameras sitzen hinter der Stirnfläche seitlich am LEE (DOUG-Leuchte bei 0,41 m / 0,35 m), nicht davor.
for (const id of ['leeTip', 'leeBase']) assert.ok(cam(id).pos[1] > 0 && cam(id).pos[0] > 0.38, id);
// Einbett-Adressen
assert.match(embedUrl('https://www.youtube.com/watch?v=abcdefghijk'), /^https:\/\/www\.youtube\.com\/embed\/abcdefghijk\?autoplay=1&mute=1/);
assert.match(embedUrl('https://youtu.be/abcdefghijk?t=3'), /embed\/abcdefghijk\?/);
assert.match(embedUrl('https://www.youtube.com/live/abcdefghijk'), /embed\/abcdefghijk\?/);
assert.match(embedUrl('https://www.youtube.com/channel/UCLA_DiR1FfKNvjuUpBHmylQ'), /embed\/live_stream\?channel=UCLA_DiR1FfKNvjuUpBHmylQ&/);
assert.match(embedUrl('https://www.youtube.com/watch?v=abcdefghijk', 'http://localhost:8137'), /enablejsapi=1&origin=http%3A%2F%2Flocalhost%3A8137$/);
assert.equal(embedUrl('https://example.org/stream'), 'https://example.org/stream'); assert.equal(embedUrl(''), '');
// Ohne Launcher: zuletzt geprüfte Streams, dann die Kanal-Einbettungen von NASA und Sen.
const W = id => 'https://www.youtube.com/watch?v=' + id, C = id => 'https://www.youtube.com/channel/' + id;
const base = streamChoices();
assert.deepEqual(base.map(s => s.url), [...KNOWN_STREAMS.map(s => W(s.id)), ...CHANNELS.map(c => C(c.channel))]);
assert.ok(CHANNELS.every(c => /^UC[\w-]{22}$/.test(c.channel)));
assert.ok(KNOWN_STREAMS.every(s => /^[\w-]{11}$/.test(s.id) && /^\d{4}-\d\d-\d\d$/.test(s.checked)));
// Mit Launcher stehen die laufenden Streams davor; ein bekannter Stream erscheint nur einmal.
const live = streamChoices([{ channel: 'NASA', channelName: 'nasa', channelId: CHANNELS[0].channel, id: 'abcdefghijk', title: 'Live Video from the International Space Station' },
  { channel: 'Sen', channelName: 'sen', channelId: CHANNELS[1].channel, id: KNOWN_STREAMS[2].id, title: 'Earth in 4K' }]);
assert.deepEqual(live.map(s => s.url), [W('abcdefghijk'), W(KNOWN_STREAMS[2].id), W(KNOWN_STREAMS[0].id), W(KNOWN_STREAMS[1].id),
  C(CHANNELS[0].channel), C(CHANNELS[1].channel)]);
assert.equal(live[1].label, 'Sen · Earth in 4K');
// Jede Kamera hat ihren Stream: Kameraports und MSS -> NASA „Live Video“, Harmony-HD -> NASA-HD, Sen -> Sen.
assert.ok(CAMERAS.every(c => FEEDS[c.feed]), 'feed je Kamera');
assert.equal(feedUrl(cam('cp8').feed), W('M3HKLzjvKPc')); assert.equal(feedUrl(cam('hd2').feed), W('ROboUHfPUrU')); assert.equal(feedUrl(cam('senNadir').feed), W('fO9e9jnhYK8'));
const run = [{ channel: 'NASA', channelName: 'nasa', id: 'aaaaaaaaaaa', title: 'Live High-Definition Views from the International Space Station' },
  { channel: 'NASA', channelName: 'nasa', id: 'bbbbbbbbbbb', title: 'Live Video from the International Space Station (Official NASA Stream)' },
  { channel: 'Sen', channelName: 'sen', id: 'ccccccccccc', title: 'Earth in 4K' }];
assert.deepEqual(['nasaLive', 'nasaHd', 'sen'].map(f => feedUrl(f, run)), [W('bbbbbbbbbbb'), W('aaaaaaaaaaa'), W('ccccccccccc')]);
assert.match(embedUrl(W('abcdefghijk')), /controls=0&rel=0/);
// Bildformat einpassen: 4:3 in einem 16:9-Rahmen bekommt seitliche Balken.
assert.deepEqual(fitRect(4 / 3, 1600, 900), [200, 0, 1200, 900]);
assert.deepEqual(fitRect(16 / 9, 800, 900), [0, 225, 800, 450]);
console.log(`PASS Kameras: ${CAMERAS.length} Kameras, Sichtfelder SD 77°×61°..10°×8°, HD 36°..3,4°, MSS 52°×40°, Einbaustellen, Stream-Adressen, Bildformat`);

// Sichtfeld über den Zoombereich hinaus, logarithmischer Regler, Feinschritte.
for (const o of Object.values(OPTICS)) assert.ok(FOV_MIN <= o.fovMin && o.fovMax <= FOV_MAX);
assert.ok(FOV_MIN <= 0.5 && FOV_MAX >= 120);
assert.equal(clampFov(200), FOV_MAX); assert.equal(clampFov(0.01), FOV_MIN); assert.equal(clampFov(33.3), 33.3);
for (const f of [0.5, 1.9, 61, 150]) assert.ok(Math.abs(sliderToFov(fovToSlider(f)) - f) < 1e-9);
assert.equal(fineStep({}), 0.1); assert.equal(fineStep({ shiftKey: true }), 1); assert.equal(fineStep({ altKey: true }), 0.01);
assert.equal(wrapAngle(180.1, -180, 180, true), -179.9); assert.equal(wrapAngle(-180.5, -180, 180, true), 179.5);
assert.equal(wrapAngle(90.3, -90, 90, false), 90); assert.equal(wrapAngle(12.345 + 0.01, -90, 90, false), 12.36);
