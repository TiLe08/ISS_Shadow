// test_payloads.mjs: Greifen und Transportieren, Luken, Swesda-Flügel, Langzeitlage.
//   - Canadarm2 greift Bishop, Bishop folgt dem LEE und bleibt beim Loslassen, wo er ist; ohne Objekt
//     am LEE hängt der Platzhalter „Nutzlast unbekannt“.
//   - Quest-EV-Luke offen bei drucklosem Crewlock, Swesda-Flügel zur Sonne.
//   - Langzeitlage: Die virtuelle Station hält ihre Lage nach dem Abspalten (trimTEA) über 12 h.
// Lädt iss_twin.html ohne WebGL in jsdom (wie test_irosa.mjs).
import assert from 'node:assert/strict';import * as THREE from 'three';import{loadTwin}from'./harness.mjs';
const{t,w,dom}=await loadTwin(['buildISS','MODEL','LINK','ingest','applyJoints','liveJoints','updatePayloads','resetPayloads','PL','updateHatches','updateZvezdaArrays']);t.buildISS();
const M=t.MODEL,root=M.root,V3=(...a)=>new THREE.Vector3(...a);
t.LINK.src='mqtt';t.resetPayloads();
const live={S0000001:24.8,S0000002:15.2,S0000003:59.8,S0000004:300.3,CSAMT000001:287.02,CSASSRMS002:11,CSASSRMS003:0,CSASSRMS011:0,CSASPDM0002:8};
for(const [p,v] of Object.entries(live))t.ingest(p,v);
let J=t.liveJoints();t.applyJoints(J);root.updateMatrixWorld(true);
// --- Greifen und Transportieren ---
// Freies LEE: bei LEE A als Basis mit Gelenken nach Hardware (v1.17 Vorwissen) ist das das LEE-B-Ende (armBase).
const free=()=>J.baseEnd===0?M.armBase:M.armTip;
const tipW=()=>{free().updateMatrixWorld(true);return V3().setFromMatrixPosition(free().matrixWorld);};
const fixW=o=>{o.updateMatrixWorld(true);return V3().setFromMatrixPosition(o.userData.fixture.matrixWorld);};
// Bishop so verschieben, dass sein Greifpunkt am freien LEE liegt (Prüfaufbau), dann greifen.
const B=M.bishop;{const d=root.worldToLocal(tipW()).sub(root.worldToLocal(fixW(B)));B.position.add(d);B.userData.home={p:B.position.clone(),q:B.quaternion.clone()};}
const now=Date.parse('2026-11-10T13:30:00Z');
t.updatePayloads(J,now);assert.equal(t.PL.st.held,null);
t.ingest('CSASSRMS011',2);t.updatePayloads(J,now);assert.equal(t.PL.st.held,'bishop','Bishop gegriffen');
// Arm bewegen: Bishop folgt (Greifpunkt bleibt auf dem LEE).
const J2={...J,arm:J.arm.map((v,i)=>v+(i===1?25:i===3?-20:0))};t.applyJoints(J2);root.updateMatrixWorld(true);t.updatePayloads(J2,now);
assert.ok(fixW(B).distanceTo(tipW())<1e-6,'Bishop folgt dem LEE');
const moved=B.position.clone();assert.ok(moved.distanceTo(B.userData.home.p)>0.5,'Bishop hat sich bewegt');
// Loslassen: Bishop bleibt an der neuen Stelle.
t.ingest('CSASSRMS011',0);t.updatePayloads(J2,now);assert.equal(t.PL.st.held,null);assert.ok(t.PL.st.away.bishop,'Lage gespeichert');
t.applyJoints(J);t.updatePayloads(J,now);assert.ok(B.position.distanceTo(moved)<1e-6,'Bishop bleibt nach dem Loslassen stehen');
// Unbekannte Nutzlast: greifen, wo kein bewegliches Objekt liegt.
t.resetPayloads();t.applyJoints(J2);root.updateMatrixWorld(true);t.updatePayloads(J2,now);
t.ingest('CSASSRMS011',2);t.updatePayloads(J2,now);assert.equal(t.PL.st.held,'unknown');
assert.ok(M.unknownPayload.visible&&fixW(M.unknownPayload).distanceTo(tipW())<1e-6,'Platzhalter hängt am LEE');
t.ingest('CSASSRMS011',0);t.updatePayloads(J2,now);t.resetPayloads();
// POA und OTCM: Platzhalter nach Greifzustand.
t.ingest('CSAMBA00004',2);t.ingest('CSASPDM0010',2);t.ingest('CSASPDM0019',0);t.updatePayloads(J,now);
assert.ok(M.poaPayload.visible&&M.otcmPayloads[0].visible&&!M.otcmPayloads[1].visible,'POA/OTCM-Platzhalter');
// --- Luke und Swesda-Flügel ---
t.ingest('AIRLOCK000049',755);t.updateHatches();assert.equal(M.evHatch.userData.open,false);
t.ingest('AIRLOCK000049',0.4);t.updateHatches();assert.equal(M.evHatch.userData.open,true,'EV-Luke offen bei Vakuum');
const sunB=V3(0.6,0.2,-0.77).normalize();t.updateZvezdaArrays(sunB,false);root.updateMatrixWorld(true);
for(const g of M.zvezdaArrays){const n=V3(1,0,0).applyQuaternion(g.children[0].quaternion).applyQuaternion(g.quaternion);
  assert.ok(n.dot(V3(sunB.x,0,sunB.z).normalize())>0.999,'Swesda-Flügel zur Sonne');}
// --- Langzeitlage der virtuellen Station ---
const VS=w.VirtualStation,st=new VS.Station({q:[0.9979,-0.0105,-0.0666,-0.0346]});st.environment='sun';
st.trimTEA(6795);const q0=st.q.slice(),ang=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((s,x,i)=>s+x*b[i],0))))*180/Math.PI;
const env={radius:6795,sunIncidence:Array(8).fill(1)};for(let k=0;k<12*60;k++)st.step(60,env);
const hsum=st.cmg.reduce((s,c)=>s+Math.hypot(...c.h),0)/(4*4760);
assert.ok(ang(st.q,q0)<0.05,'Lage nach 12 h gehalten: '+ang(st.q,q0).toFixed(3)+'°');assert.ok(hsum<0.5,'Kreisel nicht gesättigt: '+hsum.toFixed(2));
dom.window.close();
console.log('PASS Nutzlasten: Bishop greifen/bewegen/absetzen, unbekannte Nutzlast, POA/OTCM, EV-Luke, Swesda-Flügel, Lage 12 h stabil');
