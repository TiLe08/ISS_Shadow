// realistic.mjs: Darstellung „Realistisch“: PBR-Materialien mit prozeduralen Oberflächen,
// Umgebungslicht aus Erde und Weltraum (Reflexionen) und Schatten der Sonne.
//
// Geometrie, Gelenke und Kalibrierung bleiben unverändert: Dieser Modus tauscht nur Materialien
// und Licht. Alle Texturen entstehen hier zur Laufzeit aus Rauschen und Rastern (keine
// heruntergeladenen Bilder, also keine Lizenzfragen und kein Download). Sie werden erst erzeugt,
// wenn der Modus zum ersten Mal gewählt wird, damit Holo und Massiv nichts davon kosten.
//
// Oberflächen ohne passende UV-Koordinaten (Zylinder, Stabgitter) werden triplanar im
// Objektsystem in Metern texturiert: Die Plattengröße ist überall gleich und das Muster bewegt
// sich mit dem Bauteil (SARJ, Arm, ...). Eine Textur trägt drei Kanäle:
//   R = Helligkeitsfaktor (200 = 1,0), G = Rauheitsfaktor (128 = 1,0), B = Höhe für das Relief.
import * as THREE from 'three';

/* ---------- Rauschen und Texturbau (ohne Canvas, läuft auch in Node) ---------- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// Kachelbares Wertrauschen: Gitter n × n, bilinear mit Glättung, Ergebnis 0..1.
function valueNoise(size, n, seed) {
  const r = rng(seed), g = Array.from({ length: n * n }, r), out = new Float32Array(size * size);
  const sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * n, fy = y / size * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
    const a = g[y0 % n * n + x0 % n], b = g[y0 % n * n + (x0 + 1) % n], c = g[(y0 + 1) % n * n + x0 % n], d = g[(y0 + 1) % n * n + (x0 + 1) % n];
    out[y * size + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  return out;
}
function fbm(size, seed, octaves = [[4, .5], [8, .25], [16, .15], [32, .1]]) {
  const out = new Float32Array(size * size);
  octaves.forEach(([n, w], i) => { const v = valueNoise(size, n, seed + i * 101); for (let k = 0; k < out.length; k++) out[k] += v[k] * w; });
  return out;
}
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
// fn(x, y) -> [albedo, roughness, height] (je etwa 0..1, albedo 1 = Grundfarbe) -> DataTexture
function packTexture(size, fn, colorSpace = THREE.NoColorSpace) {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [a, r, h] = fn(x, y), i = (y * size + x) * 4;
    d[i] = Math.round(clamp01(a / 1.275) * 255); d[i + 1] = Math.round(clamp01(r / 2) * 255); d[i + 2] = Math.round(clamp01(h) * 255); d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = colorSpace; t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
// Farbtextur (sRGB) für UV-Flächen wie die Solarzellen: fn(x, y) -> [r, g, b] 0..255
function colorTexture(size, fn) {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const c = fn(x, y), i = (y * size + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

/* ---------- Oberflächenarten ---------- */
// Trümmerschutzbleche der US-Module: rechteckige Platten mit Fugen, Nieten an den Ecken und leicht
// unterschiedlich gealterter Oberfläche je Platte. Textur = 2 × 2 Platten.
function panelSurface(size = 256, seed = 7) {
  const noise = fbm(size, seed), r = rng(seed + 3), tone = Array.from({ length: 4 }, () => 0.9 + 0.16 * r()), rough = Array.from({ length: 4 }, () => 0.85 + 0.3 * r());
  const half = size / 2, seam = 2.2, rivetR = 2.4;
  return packTexture(size, (x, y) => {
    const px = x % half, py = y % half, id = (y >= half ? 2 : 0) + (x >= half ? 1 : 0), n = noise[y * size + x];
    const ex = Math.min(px, half - px), ey = Math.min(py, half - py), e = Math.min(ex, ey);
    let h = 0.55 + 0.08 * (n - 0.5), a = tone[id] * (0.93 + 0.14 * n), ro = rough[id] * (0.85 + 0.3 * n);
    if (e < seam) { h = 0.1 + 0.3 * e / seam; a *= 0.55; ro = 1.4; }                      // Fuge
    for (const [cx, cy] of [[9, 9], [half - 9, 9], [9, half - 9], [half - 9, half - 9], [half / 2, 9], [half / 2, half - 9]]) {
      const dd = Math.hypot(px - cx, py - cy); if (dd < rivetR) { h = 0.85; a *= 0.8; ro = 0.6; }
    }
    return [a, ro, h];
  });
}
// Gesteppte Isolationsdecken (Beta-Gewebe, MLI): Kissen zwischen Steppnähten.
function quiltSurface(size = 256, seed = 11, cells = 4) {
  const noise = fbm(size, seed, [[8, .5], [16, .3], [64, .2]]), c = size / cells;
  return packTexture(size, (x, y) => {
    const px = (x % c) / c, py = (y % c) / c, n = noise[y * size + x];
    const pillow = Math.sin(Math.PI * px) * Math.sin(Math.PI * py);
    const stitch = Math.min(px, 1 - px, py, 1 - py) < 0.025;
    const h = stitch ? 0.05 : 0.25 + 0.6 * Math.pow(pillow, 0.6) + 0.1 * (n - 0.5);
    return [stitch ? 0.86 : 0.96 + 0.05 * pillow + 0.06 * (n - 0.5), 1.0 + 0.15 * (n - 0.5), h];
  });
}
// Goldfolie: zerknittert, glatt reflektierend, mit wechselnder Rauheit.
function foilSurface(size = 256, seed = 23) {
  const a = fbm(size, seed, [[8, .4], [16, .3], [32, .2], [64, .1]]), b = fbm(size, seed + 50, [[16, .5], [32, .5]]);
  return packTexture(size, (x, y) => { const k = y * size + x, h = Math.abs(a[k] - 0.5) * 2; return [0.85 + 0.3 * b[k], 0.6 + 0.9 * h * h, h]; });
}
// Gebürstetes oder lackiertes Metall (Gitterträger, Arme): feine Längsriefen.
function brushedSurface(size = 256, seed = 31) {
  const r = rng(seed), lines = Array.from({ length: size }, r), n = fbm(size, seed + 9, [[4, .6], [8, .4]]);
  return packTexture(size, (x, y) => { const k = y * size + x, s = lines[x] * 0.6 + lines[(x + 1) % size] * 0.4; return [0.92 + 0.12 * n[k] + 0.05 * (s - 0.5), 0.85 + 0.35 * s, 0.5 + 0.08 * (s - 0.5)]; });
}

/* ---------- triplanares Material ---------- */
// MeshStandardMaterial, das albedo, Rauheit und Relief aus einer Oberflächentextur im Objektsystem
// liest (Maßstab tile = Kantenlänge der Textur in Metern, bump = Reliefstärke).
function triMaterial(params, surf, tile, bump) {
  const m = new THREE.MeshStandardMaterial(params);
  const uni = { triMap: { value: surf }, triScale: { value: 1 / tile }, triBump: { value: bump } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriP; varying vec3 vTriN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriP = position; vTriN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vTriP; varying vec3 vTriN; uniform sampler2D triMap; uniform float triScale; uniform float triBump;
      vec4 triSample(){
        vec3 w = pow(abs(normalize(vTriN)), vec3(4.0)); w /= (w.x + w.y + w.z);
        vec3 p = vTriP * triScale;
        return texture2D(triMap, p.yz) * w.x + texture2D(triMap, p.xz) * w.y + texture2D(triMap, p.xy) * w.z;
      }
      vec3 triPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir){
        vec3 sx = normalize(dFdx(surf_pos)), sy = normalize(dFdy(surf_pos)), n = surf_norm;
        vec3 r1 = cross(sy, n), r2 = cross(n, sx); float det = dot(sx, r1) * faceDir;
        vec3 g = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
        return normalize(abs(det) * surf_norm - g);
      }`)
      .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 triT = triSample(); diffuseColor.rgb *= triT.r * 1.275;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * triT.g * 2.0, 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = triPerturb(-vViewPosition, normal, vec2(dFdx(triT.b), dFdy(triT.b)) * triBump, faceDirection);');
  };
  m.customProgramCacheKey = () => 'tri';
  return m;
}

/* ---------- Solarzellen und Radiatoren (UV-Raster wie in Massiv) ---------- */
// Eine Kachel = eine Zelle des Modellrasters (gleiche UV-Wiederholung wie die Massiv-Textur).
function cellTexture(base, gap, bus, size = 64) {
  const n = fbm(size, 41, [[4, .7], [8, .3]]);
  return colorTexture(size, (x, y) => {
    if (x < 2 || y < 2) return gap;
    if (y % 16 === 9 || x === 33) return bus;                        // Leiterbahnen
    const k = 0.9 + 0.2 * n[y * size + x]; return base.map(v => Math.min(255, Math.round(v * k)));
  });
}
function radiatorTexture(size = 64) {
  return colorTexture(size, (x, y) => (x < 1 || y < 1) ? [176, 180, 184] : (x % 8 === 4 ? [226, 228, 228] : [246, 246, 243]));
}

/* ---------- Materialsatz ---------- */
let REAL = null;
// Materialien je Bauteilart (gleiche Schlüssel wie MAT.solid). Einmal erzeugt, danach wiederverwendet.
export function realMaterials() {
  if (REAL) return REAL;
  const panels = panelSurface(), quilt = quiltSurface(), quiltFine = quiltSurface(256, 13, 8), foil = foilSurface(), brushed = brushedSurface();
  const std = p => new THREE.MeshStandardMaterial(p);
  REAL = {
    module: triMaterial({ color: 0xcfcec8, roughness: 0.55, metalness: 0.15 }, panels, 2.6, 1.0),
    silver: triMaterial({ color: 0xc8ccd1, roughness: 0.35, metalness: 0.6 }, panels, 3.0, 0.8),
    white: triMaterial({ color: 0xeeeee8, roughness: 0.88, metalness: 0.0 }, quilt, 1.4, 0.7),
    rus: triMaterial({ color: 0xc4c9b6, roughness: 0.9, metalness: 0.0 }, quilt, 1.0, 0.6),
    truss: triMaterial({ color: 0xa3a7ab, roughness: 0.42, metalness: 0.65 }, brushed, 1.2, 0.4),
    gold: triMaterial({ color: 0xd8a64a, roughness: 0.3, metalness: 1.0 }, foil, 0.7, 2.2),
    dark: triMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.3 }, brushed, 1.0, 0.3),
    pma: triMaterial({ color: 0x55585c, roughness: 0.85, metalness: 0.05 }, quiltFine, 1.2, 0.7),
    glass: std({ color: 0x03070c, roughness: 0.04, metalness: 0.0, envMapIntensity: 2.5 }),
    array: std({ color: 0xffffff, roughness: 0.22, metalness: 0.35, map: cellTexture([26, 38, 92], [150, 156, 170], [120, 126, 140]), side: THREE.FrontSide }),
    arrayBack: std({ color: 0xffffff, roughness: 0.55, metalness: 0.2, map: cellTexture([182, 124, 58], [128, 86, 44], [150, 104, 52]), side: THREE.BackSide }),
    irosa: std({ color: 0xffffff, roughness: 0.2, metalness: 0.35, map: cellTexture([14, 18, 40], [52, 56, 76], [44, 48, 66]), side: THREE.FrontSide }),
    irosaBack: std({ color: 0x77736c, roughness: 0.75, metalness: 0.1, side: THREE.BackSide }),
    radiator: std({ color: 0xffffff, roughness: 0.45, metalness: 0.02, map: radiatorTexture(), emissive: 0x1a1a1a, side: THREE.DoubleSide }),
    arm: triMaterial({ color: 0xecece8, roughness: 0.7, metalness: 0.1 }, quiltFine, 1.0, 0.5),
    vv: triMaterial({ color: 0xe8e8e2, roughness: 0.6, metalness: 0.15 }, panels, 1.6, 0.8),
    vvRus: triMaterial({ color: 0x676b60, roughness: 0.88, metalness: 0.0 }, quilt, 0.8, 0.6),
    vvArray: std({ color: 0xffffff, roughness: 0.22, metalness: 0.35, map: cellTexture([20, 28, 70], [60, 66, 92], [52, 58, 80]), side: THREE.DoubleSide }),
    cam: std({ color: 0xf2f2ee, roughness: 0.6, metalness: 0.05 }),
  };
  return REAL;
}

/* ---------- Umgebungslicht ---------- */
// Kleine Hintergrundszene für das Umgebungslicht: schwarzer Himmel, unten die Erdscheibe (in der
// Szene immer −Y, Nadir), beleuchtet nach der Sonnenrichtung, mit Ozean/Wolken-Mischung und
// einem schmalen Atmosphärensaum am Horizont. Daraus macht PMREM die vorgefilterte Umgebung für
// Reflexionen und diffuses Erdlicht. Neu berechnet nur, wenn sich die Sonne merklich bewegt.
export class SpaceEnvironment {
  constructor(renderer, altitudeKm = 420) {
    this.pmrem = new THREE.PMREMGenerator(renderer); this.rt = null; this.key = '';
    const R = 6371, H = R + altitudeKm;
    this.uniforms = { sunDir: { value: new THREE.Vector3(1, 0, 0) }, sunOn: { value: 1 }, R: { value: R }, H: { value: H } };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.uniforms,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 sunDir; uniform float sunOn; uniform float R; uniform float H; varying vec3 vD;
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          vec3 d = normalize(vD), o = vec3(0.0, H, 0.0);
          float b = dot(o, d), c = dot(o, o) - R * R, disc = b * b - c;
          vec3 col = vec3(0.0);
          float sun = sunOn;
          if (disc > 0.0 && -b - sqrt(disc) > 0.0) {
            vec3 n = normalize(o + d * (-b - sqrt(disc)));
            float mu = dot(n, normalize(sunDir));
            float lit = smoothstep(-0.05, 0.25, mu) * max(mu, 0.0) * sun;
            float cl = smoothstep(0.45, 0.75, noise(n * 9.0) * 0.6 + noise(n * 23.0) * 0.4);
            vec3 surf = mix(vec3(0.035, 0.09, 0.18), vec3(0.85), cl * 0.7);
            col = surf * lit * 3.0 + vec3(0.03, 0.06, 0.12) * smoothstep(-0.1, 0.3, mu) * sun;
            float twi = exp(-pow(mu / 0.08, 2.0)) * sun; col += vec3(0.35, 0.14, 0.05) * twi * 0.4;
          }
          // Atmosphärensaum knapp über dem Horizont
          float hz = -sqrt(1.0 - (R * R) / (H * H)), limb = exp(-pow((d.y - hz) / 0.02, 2.0));
          float sl = smoothstep(-0.3, 0.3, dot(normalize(vec3(d.x, 0.0, d.z) + vec3(0.0001)), normalize(vec3(sunDir.x, 0.0, sunDir.z)))) * 0.6 + 0.4;
          col += vec3(0.18, 0.4, 0.95) * limb * 0.6 * sl * sun;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.scene = new THREE.Scene(); this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat));
  }
  // Liefert die Umgebungstextur zur Sonnenrichtung (Szene) und zum Erdschatten; rechnet nur bei
  // Änderung um ≈ 2° neu (eine PMREM-Berechnung dauert wenige Millisekunden).
  update(sunScene, eclipse) {
    const k = eclipse ? 'ecl' : sunScene.toArray().map(v => Math.round(v * 30)).join();
    if (k === this.key && this.rt) return this.rt.texture;
    this.key = k; this.uniforms.sunDir.value.copy(sunScene); this.uniforms.sunOn.value = eclipse ? 0 : 1;
    const old = this.rt; this.rt = this.pmrem.fromScene(this.scene, 0, 0.1, 100); if (old) old.dispose();
    return this.rt.texture;
  }
}

/* ---------- Schatten ---------- */
// Richtet das Sonnenlicht als Schattenquelle für die Station ein (orthografisch, ±80 m um die
// Mitte, 2048² Texel ≈ 8 cm). on=false schaltet Schatten wieder ab.
export function configureSunShadow(renderer, sunL, on) {
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  sunL.castShadow = on;
  if (on && !sunL.userData.shadowReady) {
    const c = sunL.shadow.camera; c.left = c.bottom = -80; c.right = c.top = 80; c.near = 380; c.far = 620; c.updateProjectionMatrix();
    sunL.shadow.mapSize.set(2048, 2048); sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04; sunL.userData.shadowReady = true;
  }
}
