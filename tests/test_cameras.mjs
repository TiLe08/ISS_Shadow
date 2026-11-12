// test_cameras.mjs: Kameradaten und Hilfsfunktionen des Kamerafensters (ohne Browser).
//   - Sichtfelder der Optiken gegen die veröffentlichten NASA-Werte
//   - Einbett-Adressen für YouTube-Links, Auswahlliste der Streams, Einpassen des Bildformats
//   - Einbaustellen: Jede Kamera liegt an der Struktur, an der sie laut Quelle sitzt.
import assert from 'node:assert/strict';
import { CAMERAS, OPTICS, CHANNELS, KNOWN_STREAMS, FEEDS, feedUrl, embedUrl, streamChoices, fitRect } from '../cameras.mjs';
const hfov = o => 2 * Math.atan(Math.tan(o.fovMax * Math.PI / 360) * o.aspect) * 180 / Math.PI;
// SD-Kamera der ETVCG: 77° × 61° bis 10° × 8° (NTSC 4:3).
assert.ok(Math.abs(hfov(OPTICS.sd) - 77) < 1.5 && OPTICS.sd.fovMax === 61 && OPTICS.sd.fovMin === 8 && OPTICS.sd.aspect === 4 / 3);
// HD-Kamera (EHDC): horizontal 36° bis 3,4° bei 16:9, also senkrecht 20,7° bis 1,9°.
assert.ok(Math.abs(hfov(OPTICS.hd) - 36) < 0.1 && Math.abs(OPTICS.hd.fovMax - 20.7) < 0.1 && Math.abs(OPTICS.hd.fovMin - 1.9) < 0.1);
// Kameras des MSS: 52° × 40° bis 6° × 4°.
assert.ok(Math.abs(hfov(OPTICS.mss) - 52) < 1.5 && OPTICS.mss.fovMin === 4);
// Sen-Nadirkamera: 240 km Bildbreite aus etwa 415 km Höhe.
assert.ok(Math.abs(2 * 415 * Math.tan(hfov(OPTICS.senNadir) * Math.PI / 360) - 240) < 3);
for (const c of CAMERAS) { assert.ok(c.optics.length && c.optics.every(k => OPTICS[k]), c.id); assert.ok(c.target || c.dir, c.id); }
assert.equal(new Set(CAMERAS.map(c => c.id)).size, CAMERAS.length);
// Einbaustellen der Kameraports (Körpersystem: +Y Steuerbord, +Z Nadir).
const cam = Object.fromEntries(CAMERAS.map(c => [c.id, c]));
assert.ok(cam.cp8.pos[1] < -18 && cam.cp8.pos[2] < 0, 'CP8: P1 außen, Zenit');
assert.ok(cam.cp9.pos[1] < -18 && cam.cp9.pos[2] > 0, 'CP9: P1 außen, Nadir');
assert.ok(cam.cp3.pos[1] > 18 && cam.cp3.pos[1] < 20.3 && cam.cp3.pos[2] > 0, 'CP3: S1 außen, Nadir, innen neben ELC-4');
assert.ok(cam.cp13.pos[1] > 0 && cam.cp13.pos[2] < 4.85 && cam.cp13.pos[0] < -1.65, 'CP13: Destiny Zenit Steuerbord, hinter S0');
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
assert.equal(feedUrl(cam.cp8.feed), W('M3HKLzjvKPc')); assert.equal(feedUrl(cam.hd2.feed), W('ROboUHfPUrU')); assert.equal(feedUrl(cam.senNadir.feed), W('fO9e9jnhYK8'));
const run = [{ channel: 'NASA', channelName: 'nasa', id: 'aaaaaaaaaaa', title: 'Live High-Definition Views from the International Space Station' },
  { channel: 'NASA', channelName: 'nasa', id: 'bbbbbbbbbbb', title: 'Live Video from the International Space Station (Official NASA Stream)' },
  { channel: 'Sen', channelName: 'sen', id: 'ccccccccccc', title: 'Earth in 4K' }];
assert.deepEqual(['nasaLive', 'nasaHd', 'sen'].map(f => feedUrl(f, run)), [W('bbbbbbbbbbb'), W('aaaaaaaaaaa'), W('ccccccccccc')]);
assert.match(embedUrl(W('abcdefghijk')), /controls=0&rel=0/);
// Bildformat einpassen: 4:3 in einem 16:9-Rahmen bekommt seitliche Balken.
assert.deepEqual(fitRect(4 / 3, 1600, 900), [200, 0, 1200, 900]);
assert.deepEqual(fitRect(16 / 9, 800, 900), [0, 225, 800, 450]);
console.log(`PASS Kameras: ${CAMERAS.length} Kameras, Sichtfelder SD 77°×61°..10°×8°, HD 36°..3,4°, MSS 52°×40°, Einbaustellen, Stream-Adressen, Bildformat`);
