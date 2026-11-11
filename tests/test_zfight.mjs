// test_zfight.mjs: Das Modell hat in der Solid-Darstellung keine flimmernden Flächen.
//   - Station in Grundstellung und in mehreren Gelenkstellungen (SARJ, BGA, TRRJ, MT, Arm)
//   - jedes Besuchsfahrzeug einzeln an jedem seiner Ports
//   - Der Prüfer selbst erkennt eine absichtlich deckungsgleiche Fläche.
import assert from 'node:assert/strict';import * as THREE from 'three';import{loadTwin}from'./harness.mjs';import{coplanarOverlaps}from'./zfight.mjs';
const{t,w}=await loadTwin(['buildISS','MODEL','applyJoints','liveJoints']);
const root=t.buildISS(),M=t.MODEL,MAT=w.MAT;
const shown=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true;};
const check=label=>{root.updateMatrixWorld(true);const hits=coplanarOverlaps(M.parts.filter(p=>!p.proxy&&shown(p.mesh)),MAT);
  assert.equal(hits.length,0,label+': '+hits.slice(0,12).map(h=>`${h.a} / ${h.b} (${(h.area*1e4).toFixed(0)} cm²)`).join('; '));};
// Selbsttest des Prüfers: Ein Kasten bündig auf einer andersfarbigen Platte flimmert an der Auflagefläche nur,
// wenn beide Flächen in dieselbe Richtung zeigen.
{const mk=(geo,kind,pos)=>{const m=new THREE.Mesh(geo);m.position.set(...pos);m.updateMatrixWorld(true);m.userData.name=kind;return{mesh:m,kind};};
 const plate=mk(new THREE.BoxGeometry(2,2,0.2),'truss',[0,0,0]);
 assert.equal(coplanarOverlaps([plate,mk(new THREE.BoxGeometry(1,1,1),'white',[0,0,0.6])],MAT).length,0,'aufliegender Kasten: Flächen sehen sich an, kein Flimmern');
 const hit=coplanarOverlaps([plate,mk(new THREE.BoxGeometry(1,1,0.2),'white',[0.2,0,0])],MAT);
 assert.equal(hit.length,1);assert.ok(Math.abs(hit[0].area-2)<1e-6,'eingelassener Kasten: Ober- und Unterseite je 1 m²');
 assert.equal(coplanarOverlaps([plate,mk(new THREE.BoxGeometry(1,1,0.2),'truss',[0.2,0,0])],MAT).length,0,'gleiches Material stört nicht');}
t.applyJoints(t.liveJoints());check('Grundstellung');
// In Solid liegen keine Linien auf Flächen (bis v1.14 flimmerten dort die Rasterlinien der Solarflügel,
// Radiatoren und Träger); in Holo hat jedes sichtbare Bauteil sein Drahtgitter.
w.setRenderStyle(false);assert.ok(M.parts.every(p=>!p.wire.visible),'Solid: keine Linien');
assert.ok(M.parts.filter(p=>p.proxy).every(p=>p.mesh.material===MAT.hidden),'Solid: Hüllkörper unsichtbar');
w.setRenderStyle(true);assert.ok(M.parts.every(p=>p.wire.visible===!p.solidOnly&&p.mesh.visible===!p.solidOnly),'Holo: Drahtgitter, keine Stabgitter');
for(const g of Object.values(M.irosaLate))g.visible=true;
M.poaPayload.visible=true;M.unknownPayload.visible=true;for(const o of M.otcmPayloads)o.visible=true;
for(const[i,pose]of[{sarjS:37,sarjP:211,trrjS:63,trrjP:-41,mt:-9.3},{sarjS:180,sarjP:90,trrjS:-105,trrjP:105,mt:12},{sarjS:270,sarjP:0,trrjS:0,trrjP:0,mt:2.87}].entries()){
  const J=t.liveJoints();Object.assign(J,pose);for(const[k,ch]of Object.keys(J.bga).entries())J.bga[ch]=i*53+k*41;J.arm=J.arm.map((v,k)=>v+i*17*(k%2?1:-1));t.applyJoints(J);check('Stellung '+(i+1));
}
t.applyJoints(t.liveJoints());
let n=0;for(const[key,g]of Object.entries(M.vvG)){g.visible=true;check('Fahrzeug '+key);g.visible=false;n++;}
console.log(`PASS Z-Fighting: keine deckungsgleichen, verschieden aussehenden Flächen (Grundstellung, 3 Gelenkstellungen, ${n} Fahrzeug-Port-Kombinationen, ${M.parts.length} Bauteile)`);
