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
// Das stellt der Nutzer im Fenster ein (gespeichert unter localStorage iss.cams). Das Fenster lässt sich
// verschieben und in der Größe ändern (window-frame.mjs, gespeichert unter localStorage iss.camwin).
// Markierungen und Namen aller Kameras in der Hauptansicht lassen sich über Display/Overlays „Cameras“
// ein- und ausschalten (localStorage iss.camMarks, Voreinstellung aus); dazu gehört auch der Sichtkegel.
//
// Schnittstelle: setupCameras({ THREE, S, MODEL, t, onOpen }) baut die Modelle und gibt
// { open(id), close(), tick(now), list } zurück. Die Kameramodelle sind Bauteile des Stationsmodells
// (MODEL.parts) und folgen damit der gewählten Darstellung.
import { makeFrame } from './window-frame.mjs';
import { box, cyl, addLabel } from './iss-model.mjs';

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
// Das Sichtfeld lässt sich über den Zoombereich der Optik hinaus einstellen (senkrecht 0,5° bis 150°),
// etwa für unbekannte Optiken oder einen Überblick. Der Regler läuft logarithmisch, damit lange Brennweiten
// genauso fein einstellbar sind wie kurze; der Zoombereich der Optik steht im Hinweis.
export const FOV_MIN = 0.5, FOV_MAX = 150;
export const fovToSlider = f => Math.log(f), sliderToFov = x => Math.exp(x);
export const clampFov = f => Math.min(FOV_MAX, Math.max(FOV_MIN, f));
// Feinschritt mit Pfeiltasten oder Mausrad: 0,1°, mit Umschalt 1°, mit Alt 0,01°.
export const fineStep = e => e.shiftKey ? 1 : e.altKey ? 0.01 : 0.1;
// Winkel auf den Bereich [lo, hi] bringen; Schwenk und Rollen laufen über ±180° herum.
export function wrapAngle(a, lo, hi, wrap) {
  if (wrap) { const span = hi - lo; a = ((a - lo) % span + span) % span + lo; }
  return Math.round(Math.min(hi, Math.max(lo, a)) * 100) / 100;
}
const ETVCG = ['sd', 'hd'];
/* Kameraketten aus NASA DOUG (Stage 75-7), erzeugt mit tools/doug_cameras.mjs. Je Kamera: Schwenkgelenk
   (pre = System vor dem Gelenk im Befestigungssystem, Drehung um z, post danach), Neigegelenk (um y) und das
   Augsystem relativ zum Neigesystem. Blickrichtung = −x des Augsystems, Bildoben = +z (am Livebild von CP13
   am 24.11.2026 geprüft: Rest-Rollwinkel 4,5°). Bei den MSS-Kameras (CLPA) hat DOUG keinen Augknoten; das
   Auge sitzt dort 0,21 m vor der Neigeachse (Schätzung), Blickrichtung wie die Leuchte. stanchion: Fuß und Kopf des Trägerrohrs. */
export const DOUG_RIGS = {cp3: {pan: {pre: [0.6026,18.9286,3.2331,0.6124,0.7071,0,-0.3536],post: [0,0,0,0,0,0,1]},tilt: {pre: [0,0,-0.6477,0.7071,0.7071,0,0],post: [0,0,0,0,0,0,1]},eye: [0,0.1759,0,0,0,1,0],stanchion: [[0.004,19.478,2.205],[0.603,18.929,3.233]]},cp8: {pan: {pre: [0.038,-19.5707,-3.4035,0,0,-0.7071,0.7071],post: [0,0,0,0,0,0,1]},tilt: {pre: [0,0,-0.6477,0.7071,0.7071,0,0],post: [0,0,0,0,0,0,1]},eye: [0,0.1759,0,0,0,1,0],stanchion: [[0.102,-19.533,-2.108],[0.038,-19.571,-3.404]]},cp9: {pan: {pre: [0.165,-19.5707,3.4164,0.7071,0.7071,0,0],post: [0,0,0,0,0,0,1]},tilt: {pre: [0,0,-0.6477,0.7071,-0.7071,0,0],post: [0,0,0,0,0,0,1]},eye: [0,0.1759,0,0,0,1,0],stanchion: [[0.102,-19.533,2.108],[0.165,-19.571,3.416]]},cp13: {pan: {pre: [5.5606,3.299,3.7165,0,-0.5807,0.8141,0],post: [0,0,0,0,0,0,1]},tilt: {pre: [0,0,-0.6477,0.7071,-0.7071,0,0],post: [0,0,0,0,0,0,1]},eye: [0,0.1759,0,0,0,1,0],stanchion: [[5.522,2.083,4.202],[5.561,3.299,3.717]]},boom1: {pan: {pre: [-4.453,0,0.3048,1,0,0,0],post: [0,0,0,1,0,0,0]},tilt: {pre: [0,-0.1702,0.2159,0,0,0,1],post: [0,0,0,0,0,1,0]},eye: [-0.21,0,0,0,0,0,1]},boom2: {pan: {pre: [-2.6461,-0.0038,-0.3048,0,0,1,0],post: [0,0,0,1,0,0,0]},tilt: {pre: [0,-0.1702,0.2159,0,0,0,1],post: [0,0,0,0,0,1,0]},eye: [-0.21,0,0,0,0,0,1]},mbs: {pan: {pre: [4.876,-0.0076,-0.0254,-0.5,-0.5,0.5,0.5],post: [0,0,0,0,0,0,1]},tilt: {pre: [0,-0.1588,0,0,0,0,1],post: [0,0,0,1,0,0,0]},eye: [-0.21,0,0,0,0,0,1]},dextre1: {pan: {pre: [0.1372,-1.016,2.2276,0,0,-0.7071,0.7071],post: [0,0,0,1,0,0,0]},tilt: {pre: [0,-0.1702,0.2159,0,0,0,1],post: [0,0,0,0,0,1,0]},eye: [-0.21,0,0,0,0,0,1]},dextre2: {pan: {pre: [0.1372,1.016,2.2276,0,0,0.7071,0.7071],post: [0,0,0,1,0,0,0]},tilt: {pre: [0,-0.1702,0.2159,0,0,0,1],post: [0,0,0,0,0,1,0]},eye: [-0.21,0,0,0,0,0,1]}};
export const CAMERAS = [
  // feed: welcher Livestream diese Kamera zeigt (FEEDS); der NASA-Stream „Live Video“ wechselt selbst
  // zwischen den Außenkameras, welche gerade läuft, steht nicht in der Telemetrie.
  // id, Name, Gruppe, Bauform, Befestigung (root = Stationssystem, sonst Knoten in MODEL), dann entweder
  // rig (Kette aus DOUG_RIGS, Schwenk und Neigung wie bei der echten Kamera, 0/0 = NASA-Nullstellung) oder
  // eine feste Lage pos mit Blickziel target (Stationssystem) bzw. Blickrichtung dir (lokal), Optiken.
  // v1.21: Kameraports, Ausleger-, MBS- und Dextre-Kameras mit den vollständigen DOUG-Ketten. Bis v1.20 drehte
  // der Kopf um den festen Augpunkt der Paketpose; jetzt wandert das Auge wie in echt mit Schwenk und Neigung.
  { id: 'cp8', feed: 'nasaLive', name: 'CP8 · P1 outboard, zenith', group: 'ETVCG', kind: 'etvcg', mount: 'root', rig: 'cp8', optics: ETVCG, ptu: true,
    note: 'Looks starboard along the truss: Kibo, Harmony with Dragon, MBS, Z1' },
  { id: 'cp9', feed: 'nasaLive', name: 'CP9 · P1 outboard, nadir', group: 'ETVCG', kind: 'etvcg', mount: 'root', rig: 'cp9', optics: ETVCG, ptu: true },
  { id: 'cp3', feed: 'nasaLive', name: 'CP3 · S1 outboard, nadir', group: 'ETVCG', kind: 'etvcg', mount: 'root', rig: 'cp3', optics: ETVCG, ptu: true },
  { id: 'cp13', feed: 'nasaLive', name: 'CP13 · Destiny, zenith starboard', group: 'ETVCG', kind: 'etvcg', mount: 'root', rig: 'cp13', optics: ETVCG, ptu: true,
    note: 'Position from NASA DOUG (Stage 75-7)' },
  { id: 'hd2', feed: 'nasaHd', name: 'Harmony forward HD camera', group: 'NASA HD', kind: 'box', mount: 'root', pos: [12.5, -1.6, 3.1], base: [12.3, -1.3, 3.25], target: [40, 0, 14], optics: ['n2hd'], ptu: false,
    note: 'Looks forward past IDA-2; source of the NASA high-definition views' },
  { id: 'senDock', feed: 'sen', name: 'Sen SpaceTV-1 · docking port', group: 'Sen', kind: 'lens', mount: 'root', pos: [14.2, 7.0, 4.3], target: [16.09, 0, 5.56], optics: ['senDock'], ptu: false },
  { id: 'senNadir', feed: 'sen', name: 'Sen SpaceTV-1 · nadir', group: 'Sen', kind: 'lens', mount: 'root', pos: [14.0, 7.2, 4.72], target: [14.0, 7.2, 100], up: [1, 0, 0], optics: ['senNadir'], ptu: false },
  { id: 'senHorizon', feed: 'sen', name: 'Sen SpaceTV-1 · horizon', group: 'Sen', kind: 'lens', mount: 'root', pos: [14.2, 7.4, 4.5], target: [100, 7.4, 40], optics: ['senWide'], ptu: false },
  // LEE-Kameras (CLA): Kamera und Leuchte in einem Gehäuse seitlich am LEE, Blick entlang der LEE-Achse
  // aus dem Greifer heraus. Lage aus DOUG (Leuchte 0,41 m neben der Achse, 0,35 m hinter der Stirnfläche);
  // Gehäusemaße nach Fotos geschätzt.
  { id: 'leeTip', feed: 'nasaLive', name: 'Canadarm2 · free LEE camera', group: 'MSS', kind: 'cla', mount: 'armTip', pos: [0.5, 0.07, -0.07], dir: [0, -1, 0], up: [0, 0, 1], optics: ['mss'], ptu: false },
  { id: 'leeBase', feed: 'nasaLive', name: 'Canadarm2 · base LEE camera', group: 'MSS', kind: 'cla', mount: 'armBase', pos: [0.5, 0.07, -0.07], dir: [0, -1, 0], up: [0, 0, 1], optics: ['mss'], ptu: false },
  // Auslegerkameras (CLPA) mit Schwenk-Neige-Kopf: an Ausleger B 2,66 m vor dem Ellbogen, an Ausleger A 2,65 m
  // hinter dem Ellbogen (DOUG camholder_B2 / camholder_A2).
  { id: 'boom1', feed: 'nasaLive', name: 'Canadarm2 · boom camera, shoulder side', group: 'MSS', kind: 'clpa', mount: 'armBooms.b1', rig: 'boom1', optics: ['mss'], ptu: true },
  { id: 'boom2', feed: 'nasaLive', name: 'Canadarm2 · boom camera, wrist side', group: 'MSS', kind: 'clpa', mount: 'armBooms.b2', rig: 'boom2', optics: ['mss'], ptu: true },
  // Dextre: zwei Rumpfkameras (CLPA) beiderseits des oberen Rumpfs.
  { id: 'dextreHead', feed: 'nasaLive', name: 'Dextre · body camera 1', group: 'MSS', kind: 'clpa', mount: 'dextreTorso', rig: 'dextre1', optics: ['mss'], ptu: true },
  { id: 'dextreHead2', feed: 'nasaLive', name: 'Dextre · body camera 2', group: 'MSS', kind: 'clpa', mount: 'dextreTorso', rig: 'dextre2', optics: ['mss'], ptu: true },
  { id: 'mbs', feed: 'nasaLive', name: 'MBS · camera', group: 'MSS', kind: 'clpa', mount: 'pivots.mt', rig: 'mbs', optics: ['mss'], ptu: true },
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
  { channel: 'NASA', id: 'M3HKLzjvKPc', title: 'Live Video from the International Space Station', checked: '2026-11-11', feed: 'nasaLive' },
  { channel: 'NASA', id: 'ROboUHfPUrU', title: 'Live High-Definition Views from the International Space Station', checked: '2026-11-11', feed: 'nasaHd' },
  { channel: 'Sen', id: 'fO9e9jnhYK8', title: 'Live 4K video of Earth and space (SpaceTV-1)', checked: '2026-11-11', feed: 'sen' },
];
/* Welcher Stream zu welcher Kamera gehört (v1.17). Laufende Streams vom Launcher werden am Kanal und am
   Titel erkannt; der NASA-HD-Stream heißt „Live High-Definition Views …“, der wechselnde „Live Video …“. */
export const FEEDS = {
  nasaLive: { channel: 'nasa', match: t => !/high.?definition|\bhd\b/i.test(t) && /space station|\biss\b|live video/i.test(t) },
  nasaHd: { channel: 'nasa', match: t => /high.?definition|\bhd\b/i.test(t) && /space station|\biss\b/i.test(t) },
  sen: { channel: 'sen', match: () => true },
};
// Adresse des Streams für eine Kamerazuordnung: laufender passender Stream, sonst der zuletzt geprüfte,
// sonst die Kanal-Einbettung.
export function feedUrl(feed, found = []) {
  const f = FEEDS[feed]; if (!f) return '';
  const hit = found.find(s => (s.channelName || String(s.channel).toLowerCase()) === f.channel && f.match(s.title || ''));
  if (hit) return 'https://www.youtube.com/watch?v=' + hit.id;
  const known = KNOWN_STREAMS.find(s => s.feed === feed); if (known) return 'https://www.youtube.com/watch?v=' + known.id;
  const c = CHANNELS.find(c => c.id === f.channel); return c ? 'https://www.youtube.com/channel/' + c.channel : '';
}
const YT = 'https://www.youtube.com/embed/';
// YouTube-Link (watch, youtu.be, live, embed, Kanal) -> Einbett-Adresse; sonst der Link selbst.
export function embedUrl(url, origin = '') {
  const u = String(url || '').trim(); if (!u) return '';
  // controls=0, rel=0, iv_load_policy=3: ohne Steuerleiste, Vorschläge und Infokarten über dem Bild.
  const q = 'autoplay=1&mute=1&playsinline=1&controls=0&rel=0&iv_load_policy=3&disablekb=1&enablejsapi=1' + (origin ? '&origin=' + encodeURIComponent(origin) : '');
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
#camWin{position:fixed;right:14px;bottom:14px;width:min(1180px,calc(100vw - 28px));height:min(540px,calc(100vh - 90px));min-width:320px;min-height:200px;z-index:60;background:var(--panel-solid,#09131c);border:1px solid var(--line2,#1f4458);display:flex;flex-direction:column;overflow:visible;font:12px var(--f-mono,monospace);color:var(--fg,#cfe6f2)}
#camWin[hidden]{display:none}
#camWin header{display:flex;gap:8px;align-items:center;padding:6px 8px;border-bottom:1px solid var(--line,#16303f);flex-wrap:wrap}
#camWin header b{font:600 12px var(--f-disp,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:var(--acc,#3fe0ff)}
#camWin select,#camWin input[type=text]{background:var(--bg2,#070d14);color:inherit;border:1px solid var(--line2,#1f4458);font:inherit;padding:2px 4px;max-width:280px}
#camWin input[type=text]{flex:1;min-width:160px;max-width:none}
#camWin button,#camWin a.btn{background:transparent;color:inherit;border:1px solid var(--line2,#1f4458);font:inherit;padding:2px 8px;cursor:pointer;text-decoration:none}
#camWin button[aria-pressed=true]{border-color:var(--acc,#3fe0ff);color:var(--acc,#3fe0ff)}
#camWin .panes{flex:1;display:flex;min-height:0;position:relative;overflow:hidden}
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
#camWin .ctl input[type=range]{width:130px}
#camWin .ctl input[type=number]{width:5.2em;background:var(--bg2,#070d14);color:inherit;border:1px solid var(--line2,#1f4458);font:inherit;padding:1px 3px}
#camWin .ctl output{min-width:3.2em}
#camWin .ctl .out{color:var(--warn,#ffb54a)}
#camWin .note{color:var(--dim,#6a8899)}
.lbl3d.cam{color:var(--warn,#ffb54a);border-left:0;padding-left:12px;pointer-events:auto;cursor:pointer;transform:translate(-5px,-50%)}
.lbl3d.cam::before{content:'';position:absolute;left:0;top:50%;width:6px;height:6px;margin-top:-4px;border:1px solid var(--warn,#ffb54a);border-radius:50%;background:rgba(4,8,12,.8)}
.lbl3d.cam:hover{background:rgba(40,24,4,.85)}
.lbl3d.cam.lbl-off{visibility:visible;background:none;font-size:0;padding:6px 0 6px 12px}
`;

export function setupCameras({ THREE, S, MODEL, t = s => s, onOpen }) {
  const st = (() => { try { return JSON.parse(localStorage.getItem('iss.cams') || '{}') || {}; } catch (e) { return {}; } })();
  const save = () => { try { localStorage.setItem('iss.cams', JSON.stringify(st)); } catch (e) {} };
  st.view ||= {}; st.stream ||= ''; st.feedPick ||= {};   // feedPick: vom Nutzer gewählter Stream je Zuordnung
  // v1.21: Schwenk und Neigung der Kameras mit DOUG-Kette bedeuten jetzt die echten Gelenkwinkel. Alte Werte
  // (Drehung um den festen Augpunkt) passen nicht mehr dazu und werden einmalig zurückgesetzt.
  if (st.rigV !== 1) { for (const c of CAMERAS) if (c.rig && st.view[c.id]) for (const k of ['pan', 'tilt', 'roll', 'dx', 'dy', 'dz']) delete st.view[c.id][k]; st.rigV = 1; save(); }
  const byId = {}, pickers = [], own = new Map();
  const mountOf = c => c.mount === 'root' ? MODEL.root : c.mount.split('.').reduce((o, k) => o?.[k], MODEL);
  const D = { decor: true, segs: 10, rings: 0, longs: 4 }, keep = (c, ...parts) => own.set(c.id, (own.get(c.id) || []).concat(parts));
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });

  /* Kameramodelle. Feste Kameras: Gruppe g an der Einbaustelle, Blick entlang ihrer −Z-Achse (wie three.js-
     Kameras). Kameras mit DOUG-Kette (rig): Schwenkgelenk um z, Neigegelenk um y, Augsystem; opt ist das
     three.js-Kamerasystem am Auge (−Z = −x des Auges, +Y = +z des Auges). Maße aus DOUG: Trägerrohr vom
     Fuß bis zum Schwenkgehäuse, Neigeachse 0,65 m über dem Schwenkgehäuse (ETVCG), SD-Kamera 0,18 m neben
     der Neigeachse, HD-Kamera 0,38 m, Leuchte auf der anderen Seite. Gehäusemaße nach NASA-Fotos geschätzt. */
  const frameOf = (parent, a) => { const g = new THREE.Group(); g.position.set(a[0], a[1], a[2]); g.quaternion.set(a[3], a[4], a[5], a[6]); parent.add(g); return g; };
  const OPT = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  for (const c of CAMERAS) {
    const parent = mountOf(c); if (!parent) continue;
    const nm = t(c.name);
    if (c.rig) {
      const R = DOUG_RIGS[c.rig], base = frameOf(parent, R.pan.pre), pan = new THREE.Group(); base.add(pan);
      const tiltBase = frameOf(frameOf(pan, R.pan.post), R.tilt.pre), tilt = new THREE.Group(); tiltBase.add(tilt);
      const head = frameOf(tilt, R.tilt.post), eye = frameOf(head, R.eye), opt = new THREE.Group(); opt.quaternion.copy(OPT); eye.add(opt);
      const zt = R.tilt.pre[2];   // Abstand Schwenkgehäuse - Neigeachse entlang der Schwenkachse (ETVCG −0,65 m)
      if (c.kind === 'etvcg') {
        if (R.stanchion) { const [a, b] = R.stanchion.map(p => new THREE.Vector3(...p)), d = b.clone().sub(a);
          const s = cyl(parent, 'x', d.length(), 0.05, 0.05, [0, 0, 0], 'truss', nm + ' stanchion', D); keep(c, s);
          s.position.copy(a).add(b).multiplyScalar(0.5); s.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()); }
        keep(c, cyl(base, 'z', 0.22, 0.13, 0.13, [0, 0, -0.11], 'gold', nm + ' pan unit', D),
          box(pan, 0.16, 0.16, Math.abs(zt) - 0.22, [0, 0, (zt - 0.22) / 2], 'gold', nm + ' pan/tilt arm', D),
          cyl(tilt, 'y', 0.3, 0.08, 0.08, [0, 0.03, 0], 'gold', nm + ' tilt joint', D),
          // In head: Blick +x, SD-Kamera mit dem Objektiv am Auge (y 0,18), HD-Kamera (EHDC) bei y 0,38, Leuchte bei y −0,33.
          box(head, 0.4, 0.18, 0.2, [-0.25, 0.176, 0], 'cam', nm + ' SD camera', D), cyl(head, 'x', 0.05, 0.07, 0.07, [-0.025, 0.176, 0], 'glass', nm + ' SD lens', D),
          box(head, 0.4, 0.17, 0.22, [-0.08, 0.375, -0.07], 'silver', nm + ' HD camera (EHDC)', D), cyl(head, 'x', 0.06, 0.065, 0.065, [0.15, 0.375, -0.07], 'glass', nm + ' HD lens', D),
          box(head, 0.3, 0.16, 0.2, [-0.02, -0.33, -0.08], 'cam', nm + ' luminaire', D), box(head, 0.02, 0.13, 0.17, [0.135, -0.33, -0.08], 'glass', nm + ' luminaire window', D));
      } else {
        // CLPA (MSS): Grundplatte, Schwenkbügel bis zur Neigeachse, Kamera mit Leuchte; Blick −x des Neigesystems.
        const tp = new THREE.Vector3(...R.tilt.pre.slice(0, 3));
        keep(c, box(base, 0.22, 0.22, 0.1, [0, 0, 0.05], 'cam', nm + ' base', D),
          cyl(pan, 'z', 0.1, 0.09, 0.09, [0, 0, 0.15], 'gold', nm + ' pan unit', D),
          box(pan, 0.08, Math.abs(tp.y) + 0.08, 0.08, [0, tp.y / 2, 0.2], 'gold', nm + ' pan/tilt bracket', D),
          box(pan, 0.08, 0.08, Math.max(0.05, tp.z - 0.2), [0, tp.y, (tp.z + 0.2) / 2], 'gold', nm + ' pan/tilt bracket', D),
          box(head, 0.36, 0.15, 0.16, [0.02, 0, 0], 'cam', nm, D), cyl(head, 'x', 0.04, 0.05, 0.05, [-0.18, 0, 0], 'glass', nm + ' lens', D),
          box(head, 0.14, 0.12, 0.08, [-0.1, 0, 0.12], 'cam', nm + ' light', D), box(head, 0.02, 0.1, 0.06, [-0.175, 0, 0.12], 'glass', nm + ' light window', D));
      }
      const pick = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), pickMat); pick.userData.camId = c.id; eye.add(pick); pickers.push(pick);
      eye.userData.cam = c; byId[c.id] = { g: eye, opt, pan, tilt };
      continue;
    }
    const g = new THREE.Group(); g.position.set(...c.pos); parent.add(g);
    const up = new THREE.Vector3(...(c.up || [0, 0, -1]));
    g.quaternion.setFromRotationMatrix(c.target ? new THREE.Matrix4().lookAt(g.position, new THREE.Vector3(...c.target), up) : new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(...c.dir), up));
    if (c.base) { const a = new THREE.Vector3(...c.base), b = new THREE.Vector3(...c.pos), d = b.clone().sub(a);
      const s = cyl(parent, 'x', d.length(), 0.045, 0.045, [0, 0, 0], 'truss', nm + ' stanchion', D); keep(c, s);
      s.position.copy(a).add(b).multiplyScalar(0.5); s.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()); }
    if (c.kind === 'cla') {
      // Gehäuse an der LEE-Wand (Radius 0,38 m): innen anliegend, vorn bündig 0,07 m hinter der Stirnfläche.
      // g sitzt am Objektiv; das Gehäuse liegt dahinter (+Z) und reicht zur LEE-Achse hin (−y von g aus gesehen).
      keep(c, box(g, 0.28, 0.22, 0.42, [0, -0.07, 0.21], 'cam', nm, D), cyl(g, 'z', 0.03, 0.05, 0.05, [0, 0, -0.005], 'glass', nm + ' lens', D),
        box(g, 0.12, 0.08, 0.02, [0.07, 0.0, -0.005], 'glass', nm + ' light window', D));
    } else if (c.kind === 'box') {
      keep(c, box(g, 0.16, 0.16, 0.3, [0, 0, 0], 'cam', nm, D), cyl(g, 'z', 0.05, 0.05, 0.05, [0, 0, -0.175], 'glass', nm + ' lens', D));
    } else keep(c, cyl(g, 'z', 0.12, 0.05, 0.05, [0, 0, -0.06], 'glass', nm + ' lens', D));
    // Unsichtbare Kugel als Klickfläche: Die Kameras sind im Maßstab der Station sehr klein.
    const pick = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), pickMat); pick.userData.camId = c.id; g.add(pick); pickers.push(pick);
    g.userData.cam = c; byId[c.id] = { g, opt: g };
  }
  /* Markierung und Beschriftung jeder Kamera (Punkt an der Einbaustelle, Name daneben), schaltbar über
     „Cameras“ unter Display/Overlays. Klick auf die Markierung öffnet das Kamerafenster. Die Beschriftungen
     stehen nicht in MODEL.labels, damit „ISS labels“ sie nicht mitschaltet. Verdeckt eine Beschriftung eine
     andere (declutterLabels in iss_twin.html), bleibt der Punkt stehen und nur der Name verschwindet. */
  const marks = [];
  let marksOn = (() => { try { return localStorage.getItem('iss.camMarks') === '1'; } catch (e) { return false; } })();
  for (const c of CAMERAS) {
    if (!byId[c.id]) continue;
    const head = c.name.split(' · ')[0], text = /^CP\d+$/.test(head) ? head : t(c.name);
    const o = addLabel(byId[c.id].g, text, 'cam'); if (!o) continue;
    const i = MODEL.labels.indexOf(o); if (i >= 0) MODEL.labels.splice(i, 1);
    o.element.title = t(c.name); o.element.addEventListener('click', () => open(c.id));
    o.visible = marksOn; marks.push(o);
  }
  function showMarks(on) {
    marksOn = !!on; for (const o of marks) o.visible = marksOn;
    if (!marksOn) frustum.visible = false;
    try { localStorage.setItem('iss.camMarks', marksOn ? '1' : '0'); } catch (e) {}
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
    <div class="ctl" title="${t('Arrow keys or mouse wheel: 0.1°, with Shift 1°, with Alt 0.01°')}"><label>${t('Pan')} <input type="range" id="camPan" min="-180" max="180" step="0.01"><input type="number" id="camPanN" min="-180" max="180" step="0.1">°</label><label>${t('Tilt')} <input type="range" id="camTilt" min="-90" max="90" step="0.01"><input type="number" id="camTiltN" min="-90" max="90" step="0.1">°</label><label>${t('Roll')} <input type="range" id="camRoll" min="-180" max="180" step="0.01"><input type="number" id="camRollN" min="-180" max="180" step="0.1">°</label>
    <label>${t('Field of view')} <input type="range" id="camFov" min="${fovToSlider(FOV_MIN)}" max="${fovToSlider(FOV_MAX)}" step="0.0005"><input type="number" id="camFovN" min="${FOV_MIN}" max="${FOV_MAX}" step="0.1">° <output id="camFovV"></output></label><label>${t('Overlay opacity')} <input type="range" id="camOpa" min="0.1" max="0.9" step="0.05" value="0.5"></label>
    <button id="camReset">${t('Reset camera')}</button><span class="note" id="camNote"></span></div>`;
  document.body.append(win);
  const $ = s => win.querySelector(s);
  // Fenster an der Kopfleiste verschieben, an Kanten und Ecken in der Größe ändern (window-frame.mjs).
  const frame = makeFrame(win, $('header'), { key: 'iss.camwin', minW: 420, minH: 240 });
  $('header').title = t('Drag to move, drag an edge or corner to resize, double-click to reset');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true }); renderer.setPixelRatio(1);
  renderer.outputColorSpace = S.renderer.outputColorSpace; renderer.toneMapping = S.renderer.toneMapping; renderer.toneMappingExposure = S.renderer.toneMappingExposure;
  $('.twin').append(renderer.domElement);
  const cam = new THREE.PerspectiveCamera(48, 4 / 3, 0.05, 2e8);
  let cur = null, last = 0;
  const camOf = id => CAMERAS.find(c => c.id === id);
  // Gespeicherte Einstellung einer Kamera: Optik, Schwenk, Neigung, Rollen um die Blickachse, Sichtfeld (senkrecht, Grad).
  function view(id) {
    const c = camOf(id), v = (st.view[id] ||= {});
    if (!c.optics.includes(v.optic)) { v.optic = c.optics[0]; delete v.fov; }
    const o = OPTICS[v.optic]; v.pan ??= 0; v.tilt ??= 0;
    v.fov = clampFov(v.fov ?? o.fovMax); return v;
  }
  function syncCtl() {
    const c = camOf(cur), v = view(cur), o = OPTICS[v.optic];
    $('#camSel').value = cur;
    $('#camOpt').innerHTML = c.optics.map(k => `<option value="${k}">${t(OPTICS[k].name)}</option>`).join(''); $('#camOpt').value = v.optic; $('#camOpt').disabled = c.optics.length < 2;
    const r = v.roll || 0, set = (k, x) => { $(k).value = x; if (document.activeElement !== $(k + 'N')) $(k + 'N').value = +x.toFixed(2); };
    set('#camPan', v.pan); set('#camTilt', v.tilt); set('#camRoll', r);
    $('#camFov').value = fovToSlider(v.fov); if (document.activeElement !== $('#camFovN')) $('#camFovN').value = +v.fov.toFixed(2);
    const h = 2 * Math.atan(Math.tan(v.fov * Math.PI / 360) * o.aspect) * 180 / Math.PI, out = v.fov < o.fovMin - 1e-6 || v.fov > o.fovMax + 1e-6;
    $('#camFovV').textContent = `(${h.toFixed(1)}° × ${v.fov.toFixed(1)}°)`;
    $('#camFovV').className = out ? 'out' : ''; $('#camFovV').title = out ? t('Outside the zoom range of this camera') : '';
    for (const k of ['#camPan', '#camTilt', '#camPanN', '#camTiltN']) $(k).disabled = !c.ptu;
    $('#camNote').textContent = (c.ptu ? t('Pan, tilt, roll and zoom are not in the telemetry: set them to match the live picture (saved per camera).') : t('Fixed camera.'))
      + (c.feed === 'nasaLive' ? ' · ' + t('NASA switches this stream between cameras itself; pick the camera it is showing.') : '')
      + ' · ' + t('Zoom range') + ' ' + (o.fovMin === o.fovMax ? o.fovMin.toFixed(1) : o.fovMin.toFixed(1) + '–' + o.fovMax.toFixed(1)) + '° ' + t('vertical')
      + (o.estimate ? ' · ' + t('Field of view not published: estimate.') : '') + (c.note ? ' · ' + t(c.note) : '');
  }
  /* --- Livestream --- */
  let choices = streamChoices(), tried = new Set(), found = [];
  // Stream der Kamera id: eigene Wahl für diese Zuordnung, sonst der passende laufende/bekannte Stream.
  const streamOf = id => { const f = camOf(id)?.feed; return (f && st.feedPick[f]) || feedUrl(f, found) || choices[0]?.url || ''; };
  function fillStreams() {
    $('#camStreamSel').innerHTML = choices.map(s => `<option value="${s.url}">${s.label.replace(/[<&"]/g, '')}</option>`).join('') + `<option value="">${t('own link…')}</option>`;
    $('#camStreamSel').value = choices.some(s => s.url === st.stream) ? st.stream : '';
  }
  function setStream(url, auto = false, pick = false) {
    if (!auto) tried = new Set();
    if (pick && cur) { const f = camOf(cur).feed; if (f) { if (url) st.feedPick[f] = url; else delete st.feedPick[f]; } }
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
      found = j.streams || []; choices = streamChoices(found); fillStreams();
      // Gespeichertes Video, das der Launcher nicht (mehr) als laufend meldet: auf den ersten laufenden wechseln.
      const running = (j.streams || []).map(s => 'https://www.youtube.com/watch?v=' + s.id);
      // Gewählter bekannter Stream, der nicht mehr läuft: Wahl verwerfen (eigene Links bleiben).
      for (const [f, u] of Object.entries(st.feedPick)) if (running.length && !running.includes(u) && KNOWN_STREAMS.some(k => u.endsWith('=' + k.id))) delete st.feedPick[f];
      if (!st.stream || running.length && /[?&]v=/.test(st.stream) && !running.includes(st.stream)) { const u = cur ? streamOf(cur) : choices[0].url; if (!win.hidden) setStream(u, true); else st.stream = u; }
    } catch (e) {}
  }
  function open(id) {
    cur = id || cur || 'cp8'; win.hidden = false; frame.fit(); syncCtl();
    // Jede Kamera bringt ihren Stream mit (FEEDS); gleicher Stream: Spieler läuft weiter.
    const want = streamOf(cur);
    if (want && want !== st.stream || !$('#camFrame').getAttribute('src')) setStream(want || st.stream);
    onOpen?.(cur);
  }
  function close() { win.hidden = true; frustum.visible = false; }
  fillStreams(); refreshStreams(); setInterval(refreshStreams, 30 * 60e3);
  $('#camSel').onchange = e => open(e.target.value);
  $('#camOpt').onchange = e => { const v = view(cur); v.optic = e.target.value; delete v.fov; save(); syncCtl(); };
  $('#camStreamSel').onchange = e => { if (e.target.value) setStream(e.target.value, false, true); else $('#camUrl').focus(); };
  $('#camLoad').onclick = () => setStream($('#camUrl').value.trim(), false, true);
  $('#camUrl').onkeydown = e => { if (e.key === 'Enter') setStream(e.target.value.trim(), false, true); };
  $('#camClose').onclick = close;
  $('#camOv').onclick = e => { const on = !win.classList.contains('overlay'); win.classList.toggle('overlay', on); e.target.setAttribute('aria-pressed', on); };
  $('#camOpa').oninput = e => win.style.setProperty('--ov', e.target.value);
  // Regler und Zahlenfeld je Achse; Pfeiltasten und Mausrad in Feinschritten (fineStep).
  const AX = { pan: ['#camPan', -180, 180, true], tilt: ['#camTilt', -90, 90, false], roll: ['#camRoll', -180, 180, true] };
  function setAx(f, x) {
    const v = view(cur);
    if (f === 'fov') v.fov = Math.round(clampFov(x) * 1000) / 1000;
    else { const [, lo, hi, wrap] = AX[f]; v[f] = wrapAngle(x, lo, hi, wrap); }
    save(); syncCtl();
  }
  function fine(f, el) {
    const go = (e, dir) => { e.preventDefault(); const v = view(cur), d = dir * fineStep(e);
      // Sichtfeld: Feinschritt in Grad, vom aktuellen Wert aus
      setAx(f, (f === 'fov' ? v.fov : v[f] || 0) + d);
      if (el.type === 'number') el.value = +(f === 'fov' ? v.fov : v[f]).toFixed(2); };
    el.addEventListener('keydown', e => { const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; if (dir) go(e, dir); });
    el.addEventListener('wheel', e => { if (!el.disabled) go(e, e.deltaY < 0 ? 1 : -1); }, { passive: false });
  }
  for (const [f, [k]] of Object.entries({ ...AX, fov: ['#camFov'] })) {
    $(k).oninput = e => setAx(f, f === 'fov' ? sliderToFov(+e.target.value) : +e.target.value);
    $(k + 'N').onchange = e => { if (e.target.value !== '' && Number.isFinite(+e.target.value)) setAx(f, +e.target.value); else syncCtl(); };
    $(k + 'N').onblur = () => syncCtl();
    fine(f, $(k)); fine(f, $(k + 'N'));
  }
  $('#camReset').onclick = () => { delete st.view[cur]; save(); syncCtl(); };
  // Schwenk und Neigung in die DOUG-Kette setzen (dreht auch das Kameramodell mit).
  function aim(id) { const b = byId[id]; if (!b?.pan) return; const v = view(id); b.pan.rotation.z = v.pan * Math.PI / 180; b.tilt.rotation.y = v.tilt * Math.PI / 180; }
  // Kamerasystem in Weltkoordinaten: Befestigung · Schwenk · Neigung · Auge.
  function pose(id, out) {
    const { opt } = byId[id], v = view(id);
    aim(id); opt.updateWorldMatrix(true, false);
    out.matrixWorld.copy(opt.matrixWorld); out.matrixWorld.decompose(out.position, out.quaternion, out.scale);
    // Feinjustage aus dem Kalibrierfeld (calib-panel.mjs): Versatz in m entlang rechts/oben/hinten der Kamera,
    // Rollen um die Blickachse. Die Einbaulagen sind Näherungen nach NASA-Beschreibung.
    if (v.dx || v.dy || v.dz) { out.translateX(v.dx || 0); out.translateY(v.dy || 0); out.translateZ(v.dz || 0); }
    if (v.roll) out.rotateZ(v.roll * Math.PI / 180);
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
    p.needsUpdate = true; frustum.visible = marksOn;
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
  for (const c of CAMERAS) aim(c.id);   // gespeicherte Schwenk- und Neigewinkel auch am Modell zeigen
  return { open, close, tick, list: CAMERAS, pose, state: st, refreshStreams, save, get current() { return cur; }, labels: marks, showMarks, get marksOn() { return marksOn; } };
}
