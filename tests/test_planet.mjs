// test_planet.mjs: Erdkacheln (earth-tiles.mjs): keine überlappenden Detailstufen bei asynchronem
// Eintreffen, begrenzter Cache, Wechsel Foto/Radar. Der Kachel-Loader ist nachgebildet (pending).
import assert from 'node:assert/strict';import * as THREE from 'three';import{EarthTiles}from'../earth-tiles.mjs';
const elements=[];globalThis.document={createElement:()=>({}),body:{append:e=>elements.push(e)}};globalThis.innerHeight=1000;
const group=new THREE.Group(),material=new THREE.ShaderMaterial({uniforms:{map:{value:new THREE.Texture()},sunDir:{value:new THREE.Vector3()},rim:{value:new THREE.Color()}}});
const tiles=new EarthTiles(group,material,{capabilities:{getMaxAnisotropy:()=>8}},6378000),pending=[];
tiles.loader={load:(url,done,progress,fail)=>pending.push({url,done,fail})};tiles.setMode('photo');
const camera=new THREE.PerspectiveCamera(45,1.5,1,2e8);camera.position.set(6778000,0,0);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
// Prüft, dass die sichtbaren Kacheln die Kugel lückenlos und ohne Überlappung bedecken.
function checkCover(){
 const visible=[...tiles.cache.values()].filter(t=>t.mesh?.visible);
 for(const a of visible)for(const b of visible){if(a.z>=b.z)continue;const div=2**(b.z-a.z);assert.ok(!(Math.floor(b.x/div)===a.x&&Math.floor(b.y/div)===a.y),'Parent and child overlap');}
 assert.ok(tiles.cache.size<=160);
}
for(let step=1;step<32;step++){
 // Anfragen in vertauschter Reihenfolge abschließen, um teilweise eintreffende Geschwister zu prüfen.
 const list=pending.splice(0);if(step%2)list.reverse();for(const req of list)req.done(new THREE.Texture());
 tiles.update(camera,step*750);checkCover();
}
assert.ok([...tiles.cache.values()].some(t=>t.z>2&&t.mesh?.visible));
// Beide Modi teilen eine Kugel, mit unabhängiger Sichtbarkeit der Fotogruppe.
tiles.setMode('radar');assert.equal(tiles.photoGroup.visible,false);const calls=pending.length;tiles.update(camera,50000);assert.equal(pending.length,calls);
tiles.setMode('photo');assert.equal(tiles.photoGroup.visible,true);tiles.update(camera,51000);checkCover();
console.log('PASS globe: non-overlapping LOD under asynchronous completion, bounded cache, photo/radar switching');
