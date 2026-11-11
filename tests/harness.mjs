// harness.mjs: gemeinsamer Aufbau für alle Tests und Werkzeuge, die iss_twin.html ohne WebGL brauchen.
//
// Lädt die Seite in jsdom, führt die klassischen Skripte des Projekts in deren VM aus und danach das
// Modul-Skript der Seite. Dessen Importe werden entfernt und durch gleichnamige globale Objekte ersetzt
// (three.js, Stationsmodell, Modellprüfungen). Die gewünschten internen Namen der Seite kommen als
// Objekt zurück.
//   const { t, w, dom, THREE } = await loadTwin(['buildISS', 'MODEL', 'applyJoints']);
// Optionen: url, visual (pretendToBeVisual), globals (zusätzliche globale Objekte), patch (Funktion, die
// den Quelltext des Modul-Skripts vor dem Ausführen ändert).
import fs from 'node:fs'; import vm from 'node:vm'; import { createRequire } from 'node:module';
import * as THREE from 'three'; import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url), ROOT = new URL('../', import.meta.url);
const MODULES = ['model-checks.mjs', 'iss-model.mjs'];      // Importe des Modul-Skripts, als globale Namen
const CLASSIC = ['virtual-controls.js', 'channel-meta.js', 'i18n-strings.js', 'i18n.js', 'widgets.js', 'workspace.js'];
export const readProject = f => fs.readFileSync(new URL(f, ROOT), 'utf8');
export async function loadTwin(names, opts = {}) {
  const html = readProject('iss_twin.html');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { url: opts.url || 'http://localhost:8137', runScripts: 'outside-only', pretendToBeVisual: !!opts.visual }), w = dom.window;
  w.THREE = THREE; w.VirtualStation = require('../virtual-station.js'); w.OrbitData = require('../orbit-source.js');
  // Ersatz für CSS2DObject (keine Beschriftungen ohne Renderer).
  w.CSS2DObject = class extends THREE.Object3D { constructor(el) { super(); this.element = el; } };
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: () => ({ width: 20 }) }, { get: (t, k) => t[k] || (() => {}) });
  for (const mod of MODULES) Object.assign(w, await import(new URL(mod, ROOT)));
  w.fetch = async () => ({ ok: false });          // kein Netz in Tests
  Object.assign(w, opts.globals || {});
  const ctx = dom.getInternalVMContext();
  for (const f of CLASSIC) vm.runInContext(readProject(f), ctx);
  let code = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;\s*$/gm, '').replace(/\ninit\(\);/, '\n// kein WebGL');
  if (opts.patch) code = opts.patch(code);
  code += `\nglobalThis.TEST={${names.join(',')}};`;
  vm.runInContext(code, ctx);
  return { t: w.TEST, w, dom, THREE, html };
}
