// cameras.mjs: Außenkameras der ISS im 3D-Modell und Vergleich mit dem Livebild.
//
// Jede bekannte Außenkamera steht als kleines Modell an ihrer Einbaustelle. Ein Klick darauf (oder der
// Knopf „Cameras“) öffnet das Kamerafenster: links das Livebild (YouTube-Einbettung), rechts dieselbe
// Ansicht aus dem Zwilling, im Bildformat und mit dem Sichtfeld der gewählten Kamera. „Overlay“ legt den
// Zwilling halbdurchsichtig über das Livebild.
//
// Was belegt ist (Quellen in docs/KAMERAS.md):
//   - Einbaustellen der NASA-Kameraports: CP3 S1 außen Nadir, CP8 P1 außen Zenit, CP9 P1 außen Nadir,
//     CP13 Destiny Zenit Steuerbord. Die Koordinaten selbst sind daraus und aus Livebildern angenähert.
//   - Jede Kameragruppe (ETVCG) trägt auf einem Schwenk-Neige-Kopf eine SD-Kamera (NTSC 4:3, Zoom,
//     Sichtfeld 77° × 61° bis 10° × 8°), eine Leuchte und seit 2016 eine HD-Kamera (EHDC: Nikon D4 mit
//     28-300 mm und 2×-Konverter, 720p 16:9, horizontales Sichtfeld 36° bis 3,4°).
//   - Kameras an Canadarm2, Dextre und MBS: SD 4:3, 52° × 40° bis 6° × 4°.
//   - Alle diese Objektive bilden geradlinig ab (keine Fischaugen); die Verzeichnung am kurzen Zoomende
//     ist nicht veröffentlicht und wird nicht nachgebildet.
//   - Sen SpaceTV-1 (Bartolomeo, Columbus): drei feste 4K-Kameras. Für die Nadirkamera nennt Sen
//     240 km × 180 km Bodenabdeckung, das sind etwa 32° × 24°. Für Horizont- und Andockkamera gibt es
//     keine veröffentlichten Winkel; die Werte hier sind Schätzungen und so gekennzeichnet.
// Was nicht in der Telemetrie steht: Schwenk, Neigung, Zoom und welche Kamera der Stream gerade zeigt.
// Das stellt der Nutzer im Fenster ein (gespeichert unter localStorage iss.cams).
//
// Schnittstelle: setupCameras({ THREE, S, MODEL, t, onOpen }) baut die Modelle und gibt
// { open(id), close(), tick(now), list } zurück. Die Kameramodelle sind Bauteile des Stationsmodells
// (MODEL.parts) und folgen damit der gewählten Darstellung.
import { box, cyl } from './iss-model.mjs';

// Optiken: Bildformat und senkrechtes Sichtfeld (Grad) am kurzen und langen Zoomende.
const vfov = (hfov, aspect) => 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / aspect) * 180 / Math.PI;
export const OPTICS = {
  sd: { name: 'SD camera (ETVCG, 4:3)', aspect: 4 / 3, fovMax: 61, fovMin: 8 },
  hd: { name: 'HD camera (EHDC, 16:9)', aspect: 16 / 9, fovMax: +vfov(36, 16 / 9).toFixed(1), fovMin: +vfov(3.4, 16 / 9).toFixed(1) },
  mss: { name: 'SD camera (MSS, 4:3)', aspect: 4 / 3, fovMax: 40, fovMin: 4 },
  n2hd: { name: 'HD camera (16:9, field of view estimated)', aspect: 16 / 9, fovMax: 50, fovMin: 20, estimate: true },
  senNadir: { name: 'Sen 4K (16:9, from the 240 km footprint)', aspect: 16 / 9, fovMax: +vfov(32.3, 16 / 9).toFixed(1), fovMin: +vfov(32.3, 16 / 9).toFixed(1) },
  senWide: { name: 'Sen 4K wide angle (16:9, estimated)', aspect: 16 / 9, fovMax: 60, fovMin: 40, estimate: true },
  senDock: { name: 'Sen 4K (16:9, estimated)', aspect: 16 / 9, fovMax: 45, fovMin: 25, estimate: true },
};
const ETVCG = ['sd', 'hd'];
export const CAMERAS = [
  // id, Name, Gruppe, Bauform, Befestigung (root = Stationssystem, sonst Knoten in MODEL), Lage, Fußpunkt
  // des Trägerrohrs (base), Blickziel im Stationssystem bzw. Blickrichtung lokal, Optiken, schwenkbar
  { id: 'cp8', name: 'CP8 · P1 outboard, zenith', group: 'ETVCG', kind: 'etvcg', mount: 'root', pos: [1.0, -19.5, -3.2], base: [1.0, -19.5, -1.4], target: [1.5, 0, -0.5], optics: ETVCG, ptu: true,
    note: 'Looks starboard along the truss: Kibo, Harmony with Dragon, MBS, Z1' },
  { id: 'cp9', name: 'CP9 · P1 outboard, nadir', group: 'ETVCG', kind: 'etvcg', mount: 'root', pos: [1.9, -19.2, 3.2], base: [1.6, -19.2, 2.1], target: [6, 0, 5], optics: ETVCG, ptu: true },
  { id: 'cp3', name: 'CP3 · S1 outboard, nadir', group: 'ETVCG', kind: 'etvcg', mount: 'root', pos: [1.9, 19.2, 3.2], base: [1.6, 19.2, 2.1], target: [6, 0, 5], optics: ETVCG, ptu: true },
  { id: 'cp13', name: 'CP13 · Destiny, zenith starboard', group: 'ETVCG', kind: 'etvcg', mount: 'root', pos: [-2.0, 1.4, 2.85], base: [-2.0, 1.4, 3.9], target: [-20, 8, 1], optics: ETVCG, ptu: true,
    note: 'Position approximate: behind S0, the truss blocks the view forward' },
  { id: 'hd2', name: 'Harmony forward HD camera', group: 'NASA HD', kind: 'box', mount: 'root', pos: [12.5, -1.6, 3.1], base: [12.3, -1.3, 3.25], target: [40, 0, 14], optics: ['n2hd'], ptu: false,
    note: 'Looks forward past IDA-2; source of the NASA high-definition views' },
  { id: 'senDock', name: 'Sen SpaceTV-1 · docking port', group: 'Sen', kind: 'lens', mount: 'root', pos: [14.2, 7.0, 4.3], target: [16.09, 0, 5.56], optics: ['senDock'], ptu: false },
  { id: 'senNadir', name: 'Sen SpaceTV-1 · nadir', group: 'Sen', kind: 'lens', mount: 'root', pos: [14.0, 7.2, 4.72], target: [14.0, 7.2, 100], up: [1, 0, 0], optics: ['senNadir'], ptu: false },
  { id: 'senHorizon', name: 'Sen SpaceTV-1 · horizon', group: 'Sen', kind: 'lens', mount: 'root', pos: [14.2, 7.4, 4.5], target: [100, 7.4, 40], optics: ['senWide'], ptu: false },
  { id: 'leeTip', name: 'Canadarm2 · free LEE camera', group: 'MSS', kind: 'box', mount: 'armTip', pos: [0.45, -0.3, 0], dir: [0, -1, 0], up: [0, 0, 1], optics: ['mss'], ptu: false },
  { id: 'leeBase', name: 'Canadarm2 · base LEE camera', group: 'MSS', kind: 'box', mount: 'armBase', pos: [0.45, -0.3, 0], dir: [0, -1, 0], up: [0, 0, 1], optics: ['mss'], ptu: false },
  { id: 'dextreHead', name: 'Dextre · body camera', group: 'MSS', kind: 'box', mount: 'dextreBody', pos: [0, 3.5, 0.3], dir: [0, 0, 1], up: [0, 1, 0], optics: ['mss'], ptu: true },
  { id: 'mbs', name: 'MBS · camera', group: 'MSS', kind: 'box', mount: 'pivots.mt', pos: [3.3, 2.0, -1.5], dir: [1, 0, 0.2], up: [0, 0, -1], optics: ['mss'], ptu: true },
];

/* Livestreams. YouTube vergibt für Dauerstreams immer wieder neue Kennungen, und beendete Streams werden
   privat. Reihenfolge der Auswahl:
     1. Mit Launcher die laufenden Streams, die streams.py ermittelt (/__streams).
     2. Die zuletzt geprüften Streams (KNOWN_STREAMS). Sie können inzwischen beendet sein; meldet der
        Spieler einen Fehler, kommt der nächste Eintrag.
     3. Die Kanal-Einbettung (zeigt einen laufenden Livestream des Kanals) und ein eigener Link. */
export const CHANNELS = [
  { id: 'nasa', name: 'NASA', channel: 'UCLA_DiR1FfKNvjuUpBHmylQ', page: 'https://www.youtube.com/@NASA/streams' },
  { id: 'sen', name: 'Sen', channel: 'UCkvW_7kp9LJrztmgA4q4bJQ', page: 'https://www.youtube.com/@sen/streams' },
];
/* Am 11.11.2026 im Browser geprüft: live und einbettbar. Was die Streams zeigen (Videobeschreibungen):
     M3HKLzjvKPc  NASA „Live Video“: Bild der Station im Format 4:3, wechselnd Außenkameras (CP3, CP8, CP9 …)
                  und Innenansichten, wenn die Besatzung im Dienst ist. Gegenstück zu den Kameraports.
     ROboUHfPUrU  NASA „Live High-Definition Views“: feste HD-Kamera an Harmony, schräg nach vorn,
                  IDA-2 im Bild (Kamera hd2).
     fO9e9jnhYK8  Sen SpaceTV-1, 4K: die drei Sen-Kameras am Bartolomeo-Träger von Columbus.
   NASA führt die beiden Stationsstreams zusätzlich in der Playlist PL2aBZuCeDwlQMf6xMgQAUAY_nbHAgW5jz
   („Space Station Views“ auf nasa.gov/live); dort steht auch ein beendeter Stream. */
export const KNOWN_STREAMS = [
  { channel: 'NASA', id: 'M3HKLzjvKPc', title: 'Live Video from the International Space Station', checked: '2026-11-11' },
  { channel: 'NASA', id: 'ROboUHfPUrU', title: 'Live High-Definition Views from the International Space Station', checked: '2026-11-11' },
  { channel: 'Sen', id: 'fO9e9jnhYK8', title: 'Live 4K video of Earth and space (SpaceTV-1)', checked: '2026-11-11' },
];
const YT = 'https://www.youtube.com/embed/';
// YouTube-Link (watch, youtu.be, live, embed, Kanal) -> Einbett-Adresse; sonst der Link selbst.
export function embedUrl(url, origin = '') {
  const u = String(url || '').trim(); if (!u) return '';
  const q = 'autoplay=1&mute=1&playsinline=1&enablejsapi=1' + (origin ? '&origin=' + encodeURIComponent(origin) : '');
  let m = u.match(/(?:[?&]v=|youtu\.be\/|\/live\/|\/embed\/)([\w-]{11})(?![\w-])/);
  if (m) return `${YT}${m[1]}?${q}`;
  m = u.match(/[?&]channel=([\w-]+)/) || u.match(/\/channel\/([\w-]+)/);
  if (m) return `${YT}live_stream?channel=${m[1]}&${q}`;
  return u;
}
// Auswahlliste der Streams: laufende Streams (vom Launcher), dann die zuletzt geprüften, dann die Kanal-Einbettungen.
export function streamChoices(found = []) {
  const watch = id => 'https://www.youtube.com/watch?v=' + id;
  const out = found.map(s => ({ label: `${s.channel} · ${s.title}`, url: watch(s.id) }));
  for (const s of KNOWN_STREAMS) if (!found.some(f => f.id === s.id)) out.push({ label: `${s.channel} · ${s.title} · ${s.checked}`, url: watch(s.id) });
  for (const c of CHANNELS) { const id = c.channel || found.find(s => s.channelName === c.id)?.channelId; if (id) out.push({ label: `${c.name} · current live stream of the channel`, url: 'https://www.youtube.com/channel/' + id }); }
  return out;
}
// Größtes Rechteck mit Seitenverhältnis aspect in einem Kasten w × h, mittig: [links, oben, Breite, Höhe].
export function fitRect(aspect, w, h) { const ww = Math.min(w, h * aspect), hh = ww / aspect; return [(w - ww) / 2, (h - hh) / 2, ww, hh]; }

const CSS = `
#camWin{position:fixed;right:14px;bottom:14px;width:min(1180px,calc(100vw - 28px));height:min(540px,calc(100vh - 90px));z-index:60;background:var(--panel-solid,#09131c);border:1px solid var(--line2,#1f4458);display:flex;flex-direction:column;resize:both;overflow:hidden;font:12px var(--f-mono,monospace);color:var(--fg,#cfe6f2)}
#camWin[hidden]{display:none}
#camWin header{display:flex;gap:8px;align-items:center;padding:6px 8px;border-bottom:1px solid var(--line,#16303f);flex-wrap:wrap}
#camWin header b{font:600 12px var(--f-disp,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:var(--acc,#3fe0ff)}
#camWin select,#camWin input[type=text]{background:var(--bg2,#070d14);color:inherit;border:1px solid var(--line2,#1f4458);font:inherit;padding:2px 4px;max-width:280px}
#camWin input[type=text]{flex:1;min-width:160px;max-width:none}
#camWin button,#camWin a.btn{background:transparent;color:inherit;border:1px solid var(--line2,#1f4458);font:inherit;padding:2px 8px;cursor:pointer;text-decoration:none}
#camWin button[aria-pressed=true]{border-color:var(--acc,#3fe0ff);color:var(--acc,#3fe0ff)}
#camWin .panes{flex:1;display:flex;min-height:0;position:relative}
#camWin .pane{flex:1;position:relative;min-width:0;background:#000;border-right:1px solid var(--line,#16303f);overflow:hidden}
#camWin .pane:last-child{border-right:0}
#camWin iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
#camWin canvas{position:absolute}
#camWin .cap{position:absolute;left:6px;top:4px;z-index:2;background:rgba(0,0,0,.55);padding:1px 6px;pointer-events:none}
#camWin .warn{position:absolute;left:6px;right:6px;bottom:6px;z-index:2;background:rgba(40,16,0,.85);border:1px solid var(--warn,#ffb54a);color:var(--warn,#ffb54a);padding:4px 8px}
#camWin .warn[hidden]{display:none}
#camWin.overlay .twin{position:absolute;inset:0;background:transparent;pointer-events:none}
#camWin.overlay .twin canvas{opacity:var(--ov,.5)}
#camWin .ctl{display:flex;gap:10px;align-items:center;padding:5px 8px;border-top:1px solid var(--line,#16303f);flex-wrap:wrap}
#camWin .ctl label{display:flex;gap:4px;align-items:center}
#camWin .ctl input[type=range]{width:110px}
#camWin .ctl output{min-width:3.2em}
#camWin .note{color:var(--dim,#6a8899)}
`;

export function setupCameras({ THREE, S, MODEL, t = s => s, onOpen }) {
  const st = (() => { try { return JSON.parse(localStorage.getItem('iss.cams') || '{}') || {}; } catch (e) { return {}; } })();
  const save = () => { try { localStorage.setItem('iss.cams', JSON.stringify(st)); } catch (e) {} };
  st.view ||= {}; st.stream ||= '';
  const byId = {}, pickers = [], own = new Map();
  const mountOf = c => c.mount === 'root' ? MODEL.root : c.mount.split('.').reduce((o, k) => o?.[k], MODEL);
  const D = { decor: true, segs: 10, rings: 0, longs: 4 }, keep = (c, ...parts) => own.set(c.id, (own.get(c.id) || []).concat(parts));
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });

  /* Kameramodelle. Die Gruppe g sitzt an der Einbaustelle und blickt entlang ihrer −Z-Achse (wie
     three.js-Kameras), head dreht darin mit Schwenk und Neigung. Maße der Kameragruppe nach NASA-Fotos:
     Trägerrohr etwa 1 m, Schwenk-Neige-Kopf, Kameragehäuse etwa 0,45 m, Leuchte daneben, HD-Kamera
     auf der anderen Seite. */
  for (const c of CAMERAS) {
    const parent = mountOf(c); if (!parent) continue;
    const g = new THREE.Group(); g.position.set(...c.pos); parent.add(g);
    const up = new THREE.Vector3(...(c.up || [0, 0, -1]));
    g.quaternion.setFromRotationMatrix(c.target ? new THREE.Matrix4().lookAt(g.position, new THREE.Vector3(...c.target), up) : new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(...c.dir), up));
    const head = new THREE.Group(); g.add(head);
    const nm = t(c.name);
    if (c.base) keep(c, cyl(parent, 'x', 1, 0.045, 0.045, [0, 0, 0], 'truss', nm + ' stanchion', D));
    if (c.base) { const a = new THREE.Vector3(...c.base), b = new THREE.Vector3(...c.pos), d = b.clone().sub(a), p = own.get(c.id).at(-1);
      p.position.copy(a).add(b).multiplyScalar(0.5); p.scale.set(d.length(), 1, 1); p.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()); }
    if (c.kind === 'etvcg') {
      keep(c, box(g, 0.2, 0.22, 0.2, [0, -0.12, 0.05], 'gold', nm + ' pan/tilt unit', D),
        box(head, 0.2, 0.2, 0.45, [0, 0.1, -0.1], 'cam', nm + ' SD camera', D), cyl(head, 'z', 0.06, 0.07, 0.07, [0, 0.1, -0.355], 'glass', nm + ' SD lens', D),
        cyl(head, 'z', 0.2, 0.06, 0.15, [-0.27, 0.1, -0.2], 'cam', nm + ' luminaire', D),
        box(head, 0.2, 0.24, 0.5, [0.24, 0.1, -0.1], 'silver', nm + ' HD camera (EHDC)', D), cyl(head, 'z', 0.07, 0.065, 0.065, [0.24, 0.1, -0.385], 'glass', nm + ' HD lens', D));
    } else if (c.kind === 'box') {
      keep(c, box(head, 0.16, 0.16, 0.3, [0, 0, 0], 'cam', nm, D), cyl(head, 'z', 0.05, 0.05, 0.05, [0, 0, -0.175], 'glass', nm + ' lens', D));
    } else keep(c, cyl(head, 'z', 0.12, 0.05, 0.05, [0, 0, -0.06], 'glass', nm + ' lens', D));
    // Unsichtbare Kugel als Klickfläche: Die Kameras sind im Maßstab der Station sehr klein.
    const pick = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), pickMat); pick.userData.camId = c.id; g.add(pick); pickers.push(pick);
    g.userData.cam = c; byId[c.id] = { g, head };
  }
  // Sichtkegel der gewählten Kamera in der Hauptansicht (vier Kanten und ein Rahmen in 12 m Abstand).
  const frustum = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb54a, transparent: true, opacity: 0.7, depthWrite: false }));
  frustum.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(16 * 3), 3)); frustum.frustumCulled = false; frustum.visible = false; S.scene.add(frustum);

  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const win = document.createElement('div'); win.id = 'camWin'; win.hidden = true;
  const opts = CAMERAS.map(c => `<option value="${c.id}">${c.group} · ${t(c.name)}</option>`).join('');
  win.innerHTML = `<header><b>${t('Cameras')}</b><select id="camSel" title="${t('Camera')}">${opts}</select><select id="camOpt" title="${t('Camera head')}"></select>
    <select id="camStreamSel" title="${t('Live stream')}"></select>
    <input type="text" id="camUrl" placeholder="${t('YouTube link of the live stream')}"><button id="camLoad">${t('Load')}</button>
    <a class="btn" id="camYt" target="_blank" rel="noopener" title="${t('Open the stream on YouTube')}">YouTube ↗</a>
    <button id="camOv" aria-pressed="false" title="${t('Lay the twin over the live picture')}">${t('Overlay')}</button>
    <button id="camMain" title="${t('Move the main 3D view to this camera')}">${t('Main view')}</button><button id="camClose">×</button></header>
    <div class="panes"><div class="pane live"><div class="cap">${t('LIVE')}</div><iframe id="camFrame" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><div class="warn" id="camWarn" hidden></div></div>
    <div class="pane twin"><div class="cap" id="camCap">${t('TWIN')}</div></div></div>
    <div class="ctl"><label>${t('Pan')} <input type="range" id="camPan" min="-180" max="180" step="0.5"><output id="camPanV"></output></label><label>${t('Tilt')} <input type="range" id="camTilt" min="-90" max="90" step="0.5"><output id="camTiltV"></output></label>
    <label>${t('Field of view')} <input type="range" id="camFov" step="0.1"><output id="camFovV"></output></label><label>${t('Overlay opacity')} <input type="range" id="camOpa" min="0.1" max="0.9" step="0.05" value="0.5"></label>
    <button id="camReset">${t('Reset camera')}</button><span class="note" id="camNote"></span></div>`;
  document.body.append(win);
  const $ = s => win.querySelector(s);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true }); renderer.setPixelRatio(1);
  renderer.outputColorSpace = S.renderer.outputColorSpace; renderer.toneMapping = S.renderer.toneMapping; renderer.toneMappingExposure = S.renderer.toneMappingExposure;
  $('.twin').append(renderer.domElement);
  const cam = new THREE.PerspectiveCamera(48, 4 / 3, 0.05, 2e8);
  let cur = null, last = 0;
  const camOf = id => CAMERAS.find(c => c.id === id);
  // Gespeicherte Einstellung einer Kamera: Optik, Schwenk, Neigung, Sichtfeld (senkrecht, Grad).
  function view(id) {
    const c = camOf(id), v = (st.view[id] ||= {});
    if (!c.optics.includes(v.optic)) { v.optic = c.optics[0]; delete v.fov; }
    const o = OPTICS[v.optic]; v.pan ??= 0; v.tilt ??= 0;
    v.fov = Math.min(o.fovMax, Math.max(o.fovMin, v.fov ?? o.fovMax)); return v;
  }
  function syncCtl() {
    const c = camOf(cur), v = view(cur), o = OPTICS[v.optic];
    $('#camSel').value = cur;
    $('#camOpt').innerHTML = c.optics.map(k => `<option value="${k}">${t(OPTICS[k].name)}</option>`).join(''); $('#camOpt').value = v.optic; $('#camOpt').disabled = c.optics.length < 2;
    $('#camPan').value = v.pan; $('#camTilt').value = v.tilt; $('#camFov').min = o.fovMin; $('#camFov').max = o.fovMax; $('#camFov').value = v.fov; $('#camFov').disabled = o.fovMin === o.fovMax;
    $('#camPanV').textContent = v.pan.toFixed(1) + '°'; $('#camTiltV').textContent = v.tilt.toFixed(1) + '°';
    const h = 2 * Math.atan(Math.tan(v.fov * Math.PI / 360) * o.aspect) * 180 / Math.PI;
    $('#camFovV').textContent = `${h.toFixed(1)}° × ${v.fov.toFixed(1)}°`;
    for (const k of ['#camPan', '#camTilt']) $(k).disabled = !c.ptu;
    $('#camNote').textContent = (c.ptu ? t('Pan, tilt and zoom are not in the telemetry: set them to match the live picture (saved per camera).') : t('Fixed camera.'))
      + (o.estimate ? ' · ' + t('Field of view not published: estimate.') : '') + (c.note ? ' · ' + t(c.note) : '');
  }
  /* --- Livestream --- */
  let choices = streamChoices(), tried = new Set();
  function fillStreams() {
    $('#camStreamSel').innerHTML = choices.map(s => `<option value="${s.url}">${s.label.replace(/[<&"]/g, '')}</option>`).join('') + `<option value="">${t('own link…')}</option>`;
    $('#camStreamSel').value = choices.some(s => s.url === st.stream) ? st.stream : '';
  }
  function setStream(url, auto = false) {
    if (!auto) tried = new Set();
    st.stream = url; save(); $('#camUrl').value = url; $('#camYt').href = url || CHANNELS[0].page; $('#camWarn').hidden = true; fillStreams();
    const e = embedUrl(url, /^https?:/.test(location.protocol) ? location.origin : '');
    if ($('#camFrame').getAttribute('src') !== e) $('#camFrame').src = e;
    if (location.protocol === 'file:') warn(t('YouTube does not play in pages opened as a file. Start the launcher and open http://localhost:8137.'));
  }
  function warn(text) { $('#camWarn').textContent = text; $('#camWarn').hidden = false; }
  // Die YouTube-Einbettung meldet Fehler über postMessage (100 = entfernt oder privat, 101/150 = Einbetten
  // gesperrt). Dann wird der nächste Eintrag der Liste versucht.
  $('#camFrame').addEventListener('load', () => { try { $('#camFrame').contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch (e) {} });
  addEventListener('message', e => {
    if (!/(^|\.)youtube\.com$/.test((() => { try { return new URL(e.origin).hostname; } catch (x) { return ''; } })())) return;
    let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (x) { return; }
    if (d?.event !== 'onError') return;
    tried.add(st.stream);
    const next = choices.find(s => !tried.has(s.url));
    warn(t('This video cannot be played here (private, removed or embedding disabled).') + ' ' + (next ? t('Trying the next stream.') : t('Paste a current link or open YouTube.')));
    if (next) setStream(next.url, true);
  });
  async function refreshStreams() {
    if (!/^https?:/.test(location.protocol)) return;
    try { const r = await fetch('/__streams', { cache: 'no-store' }); if (!r.ok) return; const j = await r.json();
      choices = streamChoices(j.streams || []); fillStreams();
      // Gespeichertes Video, das der Launcher nicht (mehr) als laufend meldet: auf den ersten laufenden wechseln.
      const running = (j.streams || []).map(s => 'https://www.youtube.com/watch?v=' + s.id);
      if (!st.stream || running.length && /[?&]v=/.test(st.stream) && !running.includes(st.stream)) { if (!win.hidden) setStream(choices[0].url); else st.stream = choices[0].url; }
    } catch (e) {}
  }
  function open(id) {
    cur = id || cur || 'cp8'; win.hidden = false; syncCtl();
    if (!$('#camFrame').getAttribute('src')) setStream(st.stream || choices[0]?.url || '');
    onOpen?.(cur);
  }
  function close() { win.hidden = true; frustum.visible = false; }
  fillStreams(); refreshStreams(); setInterval(refreshStreams, 30 * 60e3);
  $('#camSel').onchange = e => open(e.target.value);
  $('#camOpt').onchange = e => { const v = view(cur); v.optic = e.target.value; delete v.fov; save(); syncCtl(); };
  $('#camStreamSel').onchange = e => { if (e.target.value) setStream(e.target.value); else $('#camUrl').focus(); };
  $('#camLoad').onclick = () => setStream($('#camUrl').value.trim());
  $('#camUrl').onkeydown = e => { if (e.key === 'Enter') setStream(e.target.value.trim()); };
  $('#camClose').onclick = close;
  $('#camOv').onclick = e => { const on = !win.classList.contains('overlay'); win.classList.toggle('overlay', on); e.target.setAttribute('aria-pressed', on); };
  $('#camOpa').oninput = e => win.style.setProperty('--ov', e.target.value);
  for (const [k, f] of [['#camPan', 'pan'], ['#camTilt', 'tilt'], ['#camFov', 'fov']]) $(k).oninput = e => { view(cur)[f] = +e.target.value; save(); syncCtl(); };
  $('#camReset').onclick = () => { delete st.view[cur]; save(); syncCtl(); };
  // Kamerasystem in Weltkoordinaten: Einbaulage · Schwenk (um die Hochachse) · Neigung. Dreht auch den
  // Kamerakopf des Modells mit.
  function pose(id, out) {
    const { g, head } = byId[id], v = view(id);
    head.rotation.set(v.tilt * Math.PI / 180, -v.pan * Math.PI / 180, 0, 'YXZ'); head.updateWorldMatrix(true, false);
    out.matrixWorld.copy(head.matrixWorld); out.matrixWorld.decompose(out.position, out.quaternion, out.scale);
    out.fov = v.fov; out.aspect = OPTICS[v.optic].aspect; out.updateProjectionMatrix(); out.updateMatrixWorld(true);
  }
  $('#camMain').onclick = () => {
    if (!cur) return; pose(cur, cam);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    S.camera.position.copy(cam.position); S.controls.target.copy(cam.position.clone().add(fwd.multiplyScalar(25)));
    S.camera.fov = cam.fov; S.camera.updateProjectionMatrix();
  };
  // Klick auf eine Kamera in der Hauptansicht öffnet das Fenster.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  const gl = S.renderer.domElement, shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  gl.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  gl.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const r = gl.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, S.camera);
    const hit = ray.intersectObjects(pickers.filter(shown), false)[0];
    if (hit) open(hit.object.userData.camId);
  });
  function updateFrustum() {
    const p = frustum.geometry.attributes.position, d = 12, h = Math.tan(cam.fov * Math.PI / 360) * d, w = h * cam.aspect, o = cam.position;
    const c = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => new THREE.Vector3(x, y, -d).applyMatrix4(cam.matrixWorld));
    let i = 0; const seg = (a, b) => { p.setXYZ(i++, a.x, a.y, a.z); p.setXYZ(i++, b.x, b.y, b.z); };
    for (let k = 0; k < 4; k++) { seg(o, c[k]); seg(c[k], c[(k + 1) % 4]); }
    p.needsUpdate = true; frustum.visible = true;
  }
  function tick(nowP) {
    if (win.hidden || !cur || nowP - last < 66) return; last = nowP;
    const el = $('.twin'), W = Math.max(2, el.clientWidth), H = Math.max(2, el.clientHeight);
    pose(cur, cam);
    // Der YouTube-Spieler zeigt das Video eingepasst im 16:9-Format; ein 4:3-Bild der SD-Kameras steht
    // darin mit seitlichen Balken. Die Zwillingsansicht bekommt genau dieses Rechteck.
    const b = fitRect(16 / 9, W, H), r = fitRect(cam.aspect, b[2], b[3]), w = Math.round(r[2]), h = Math.round(r[3]), cv = renderer.domElement;
    if (cv.width !== w || cv.height !== h) renderer.setSize(w, h, false);
    Object.assign(cv.style, { left: Math.round(b[0] + r[0]) + 'px', top: Math.round(b[1] + r[1]) + 'px', width: w + 'px', height: h + 'px' });
    const mine = own.get(cur) || [];
    for (const m of mine) m.visible = false;        // eigenes Gehäuse nicht im Bild
    frustum.visible = false; renderer.render(S.scene, cam);
    for (const m of mine) m.visible = true;
    updateFrustum();
    $('#camCap').textContent = t('TWIN') + ' · ' + t(camOf(cur).name);
  }
  return { open, close, tick, list: CAMERAS, pose, state: st, refreshStreams };
}
