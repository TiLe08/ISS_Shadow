// test_realistic.mjs: Darstellung „Realistisch“ (realistic.mjs) tauscht nur Materialien und Licht.
//   - jede Bauteilart des Massiv-Satzes hat ein realistisches Material
//   - die Shader-Ersetzungen greifen in three.js (Ankerstellen vorhanden)
//   - setRenderStyle('real') ändert keine Geometrie, Position oder Sichtbarkeit gegenüber Massiv
//   - Holo und Massiv bleiben wie bisher (true/false weiter gültig)
import assert from 'node:assert/strict'; import * as THREE from 'three';
import { realMaterials } from '../web/realistic.mjs';
import { MODEL, MAT, setRenderStyle, buildStation } from '../web/iss-model.mjs';
const R = realMaterials();
for (const k of Object.keys(MAT.solid)) assert.ok(R[k], 'realistisches Material fehlt für ' + k);
assert.equal(realMaterials(), R, 'Materialsatz wird nur einmal erzeugt');
// Triplanare Materialien: alle vier Ersetzungen müssen im Standard-Shader von three.js treffen.
const tri = Object.values(R).filter(m => m.onBeforeCompile && m.customProgramCacheKey() === 'tri');
assert.ok(tri.length >= 8);
const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
tri[0].onBeforeCompile(sh);
assert.ok(sh.vertexShader.includes('vTriP = position'), 'Vertex-Shader: Objektkoordinaten');
for (const s of ['triSample()', 'roughnessFactor = clamp(roughnessFactor * triT.g', 'normal = triPerturb(']) assert.ok(sh.fragmentShader.includes(s), 'Fragment-Shader: ' + s);
assert.ok(sh.uniforms.triMap.value.isDataTexture);
// Station bauen und die Darstellungen vergleichen.
buildStation();
assert.ok(MODEL.parts.length > 100, 'Modell gebaut');
const snap = () => MODEL.parts.map(p => [p.mesh.visible, p.wire.visible, p.mesh.geometry.uuid, p.mesh.matrix.elements.join()].join('|'));
setRenderStyle('solid'); const solid = snap(), solidMats = MODEL.parts.map(p => p.mesh.material);
setRenderStyle('real', R); const real = snap();
assert.deepEqual(real, solid, 'Realistisch: gleiche Geometrie und Sichtbarkeit wie Massiv');
assert.ok(MODEL.parts.every(p => p.proxy ? p.mesh.material === MAT.hidden : Object.values(R).includes(p.mesh.material)), 'Realistisch: nur Materialien des Satzes, Hüllkörper unsichtbar');
assert.ok(MODEL.parts.filter(p => !p.proxy).every(p => p.mesh.castShadow && p.mesh.receiveShadow), 'Realistisch: Schatten');
import { setGreebles } from '../web/realistic.mjs';
const nParts = MODEL.parts.length, rails = setGreebles(MODEL.parts, true);
assert.ok(rails > 150, 'Handläufe auf den Modulen: ' + rails); assert.equal(MODEL.parts.length, nParts, 'Handläufe sind keine Bauteile (keine Kollision/Flimmerprüfung)');
setGreebles(MODEL.parts, false); MODEL.root?.updateMatrixWorld?.(true);
let shown = 0; for (const p of MODEL.parts) p.mesh.traverse(o => { if (o.userData.greeble && o.visible) shown++; }); assert.equal(shown, 0, 'Handläufe nur in Realistisch');
setRenderStyle(false); assert.deepEqual(MODEL.parts.map(p => p.mesh.material), solidMats, 'false = Massiv wie bisher');
assert.ok(MODEL.parts.every(p => !p.mesh.castShadow), 'Massiv: keine Schatten');
setRenderStyle(true); assert.ok(MODEL.parts.every(p => p.wire.visible === !p.solidOnly), 'true = Holo wie bisher');
console.log('PASS Realistisch: ' + Object.keys(R).length + ' Materialien, Shader-Anker, gleiche Geometrie wie Massiv, Schatten nur in Realistisch, ' + rails + ' Handläufe');
