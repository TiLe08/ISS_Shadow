// test_model.mjs: Geometrie und DOM des 3D-Modells: beide Arm-Anker, Mitbewegung mit dem MT,
// feste Verankerung, gezeichnete Normalen von Solarflügeln und Radiatoren, Falten, Kollisionsdetektor,
// Kachelgeometrie, abgeschaltete Antriebe, Regler, Pause und neue Kanäle.
// Lädt iss_twin.html ohne WebGL in jsdom: Die Skripte der Seite laufen in einer VM, das
// Modul-Skript wird mit einem Export globalThis.TEST um die benötigten internen Funktionen ergänzt.
import fs from 'node:fs';import assert from 'node:assert/strict';import * as THREE from 'three';import{loadTwin}from'./harness.mjs';
import{CollisionMonitor}from'../model-checks.mjs';
import{tileBounds,tileGeometry}from'../earth-tiles.mjs';
import{radiatorTarget}from'../model-checks.mjs';
const{t,w,dom}=await loadTwin(['buildISS','MODEL','applyJoints','liveJoints','autotrack','radiatorGoal','radiatorStatus','SIMST','simTick','simInitOrbit','sunEci','lvlhBasis','inShadow','LINK','TM','solarNormal','solarAngles','slewQuaternion','q2ypr','ypr2q','enterCmd','exitCmd','CMD','stepCmd','buildPanels','commandVirtual','ORB','virtTm','DICT']);const root=t.buildISS();t.buildPanels();
const columbus=t.MODEL.parts.find(p=>p.mesh.userData.name==='Columbus (ESA)').mesh;
const kibo=t.MODEL.parts.find(p=>p.mesh.userData.name==='Kibo JEM-PM (JAXA)').mesh;
root.updateMatrixWorld(true);const centre=m=>new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
assert.ok(centre(columbus).y>0);assert.ok(centre(kibo).y<0);
assert.ok(t.MODEL.anchors[2].position.y<0,'Node 3 fixture must be on the port-side module');
// Öffentliche Abmessungen und Montagetopologie. Montagekoordinaten bleiben Näherungen.
for(const name of ['S SARJ','P SARJ']){
 const ring=t.MODEL.parts.find(p=>p.mesh.userData.name===name).mesh;
 ring.geometry.computeBoundingBox();const size=ring.geometry.boundingBox.getSize(new THREE.Vector3());
 assert.ok(Math.abs(size.x-3.5)<1e-6&&Math.abs(size.z-3.5)<1e-6,'SARJ diameter is about 3.5 m');
}
for(const side of ['S','P'])for(const ch of side==='S'?['1A','3A','3B','1B']:['2A','4A','4B','2B']){
 assert.equal(t.MODEL.pivots['bga'+ch].parent.parent,t.MODEL.pivots['sarj'+side]);
 assert.equal(t.MODEL.pivots['bga'+ch].position.y,0,'Opposed mast mounts must not be staggered along the truss');
}
assert.equal(t.MODEL.parts.filter(p=>p.mesh.userData.name.endsWith('blanket box')).length,16);
const initial=t.liveJoints();t.applyJoints(initial);const initialHits=new CollisionMonitor(t.MODEL,root).scan();assert.equal(initialHits.length,0,'Intentional attachments must not raise collisions: '+initialHits.map(h=>h.a.name+' / '+h.b.name).join('; '));
const J=t.liveJoints();J.arm=[15,-40,-60,120,-40,20,10];J.baseLoc=7;J.baseEnd=5;t.applyJoints(J);root.updateMatrixWorld(true);
// Jedes Glied folgt dem Wagen mit derselben Verschiebung, wenn der Arm am MBS verankert ist.
let positions=t.MODEL.ssrms.map(o=>o.getWorldPosition(new THREE.Vector3()));J.mt+=3;t.applyJoints(J);root.updateMatrixWorld(true);
t.MODEL.ssrms.forEach((o,i)=>assert.ok(o.getWorldPosition(new THREE.Vector3()).sub(positions[i]).distanceTo(new THREE.Vector3(0,3,0))<1e-8));
// Die Verankerung an einem festen Modul ist unabhängig vom Wagen.
J.baseLoc=1;t.applyJoints(J);root.updateMatrixWorld(true);const fixed=t.MODEL.armTip.getWorldPosition(new THREE.Vector3());J.mt-=8;t.applyJoints(J);root.updateMatrixWorld(true);assert.ok(fixed.distanceTo(t.MODEL.armTip.getWorldPosition(new THREE.Vector3()))<1e-8);
// Ist LEE A die Basis, bleibt das ferne System deckungsgleich mit dem gewählten Greifpunkt.
J.baseLoc=8;J.baseEnd=0;J.arm[3]=80;t.applyJoints(J);root.updateMatrixWorld(true);
assert.ok(t.MODEL.armTip.getWorldPosition(new THREE.Vector3()).distanceTo(t.MODEL.anchors[8].getWorldPosition(new THREE.Vector3()))<1e-8);
J.arm[1]+=35;t.applyJoints(J);root.updateMatrixWorld(true);assert.ok(t.MODEL.armTip.getWorldPosition(new THREE.Vector3()).distanceTo(t.MODEL.anchors[8].getWorldPosition(new THREE.Vector3()))<1e-8);
// Die Mesh-Normalen von Radiatoren UND Solarflügeln, nicht nur abstrakte Winkel, passen zum Optimierer.
for(let n=0;n<40;n++){
 const sun=new THREE.Vector3(Math.cos(n),Math.sin(n*.7),Math.sin(n)).normalize(),goal=t.autotrack(sun);
 J.sarjP=J.sarjS=goal.sarj;J.bga=goal.bga;J.trrjS=J.trrjP=radiatorTarget(goal.trrj);J.radDeploy=Array(6).fill(1);t.applyJoints(J);root.updateMatrixWorld(true);
 const mesh=t.MODEL.parts.find(p=>p.mesh.userData.name==='S1 radiator ORU 1 panel 1').mesh;
 const normal=new THREE.Vector3(0,0,1).transformDirection(mesh.matrixWorld);assert.ok(Math.abs(normal.dot(sun))<1e-6);
 assert.ok(normal.distanceTo(w.radiatorNormal(J.trrjS))<1e-8,'Radiatornormale im Modell = radiatorNormal()');
 for(const ch of Object.keys(goal.bga)){
  const sol=t.MODEL.parts.find(p=>p.mesh.userData.name==='SAW '+ch&&p.kind==='array').mesh;
  const actual=new THREE.Vector3(1,0,0).transformDirection(sol.matrixWorld);
  assert.ok(actual.dot(sun)>1-1e-8,'Every illuminated solar face must track Sun: '+ch);
  assert.ok(actual.distanceTo(t.solarNormal(goal.sarj,goal.bga[ch]))<1e-8,'Power and geometry must share the same mounting transform');
 }
 // Die halbe Drehung der äußeren Träger muss alle vier PVR-Ausleger von der Sonne weg bewegen,
 // während ihre beiden breiten Seiten kantig bleiben. Nur eine Normale umzudrehen besteht diesen Test nicht.
 for(const hinges of t.MODEL.pvRadiators){
  const span=hinges.at(-1).getWorldPosition(new THREE.Vector3()).sub(hinges[0].getWorldPosition(new THREE.Vector3())).normalize();
  assert.ok(span.dot(sun)<=1e-8,'PVR extension must be anti-solar');
  assert.ok(Math.abs(new THREE.Vector3(0,0,1).transformDirection(hinges[0].matrixWorld).dot(sun))<1e-8);
 }
 assert.ok(J.trrjS>=-105&&J.trrjS<=105);
}
// Manuelle Posen über den vollen Winkelbereich: virtuelle Leistung nutzt die acht tatsächlich gezeichneten Normalen.
for(let n=0;n<12;n++){
 J.sarjP=-177+n*37;J.sarjS=139-n*31;
 for(const [i,ch]of Object.keys(J.bga).entries())J.bga[ch]=n*67+i*51;
 t.applyJoints(J);root.updateMatrixWorld(true);
 for(const ch of Object.keys(J.bga)){
  const mesh=t.MODEL.parts.find(p=>p.mesh.userData.name==='SAW '+ch&&p.kind==='array').mesh;
  const alpha=['1A','3A','3B','1B'].includes(ch)?J.sarjS:J.sarjP;
  assert.ok(new THREE.Vector3(1,0,0).transformDirection(mesh.matrixWorld).distanceTo(t.solarNormal(alpha,J.bga[ch]))<1e-8);
 }
}
// Die Quaternion-Führung bleibt über Gier-Umbruch und Nick-Pole monoton; zusammengesetzte
// Manöver halten eine Grenze für die Gesamt-Winkelgeschwindigkeit ein, nicht eine pro Achse.
const qDistance=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((s,v,i)=>s+v*b[i],0))))*180/Math.PI;
for(const [from,to]of [ [[179,0,0],[-179,0,0]],[[12,89.9,40],[-150,90,-70]],[[88,-89.9,55],[170,-90,-20]],[[0,0,0],[130,60,-90]],[[0,0,0],[180,0,0]] ]){
 let q=t.ypr2q(...from);const target=t.ypr2q(...to);
 for(let i=0;i<2000&&qDistance(q,target)>1e-5;i++){
  const next=t.slewQuaternion(q,target,.1,1);
  assert.ok(qDistance(q,next)<=.100001,'Total slew speed is bounded');
  assert.ok(qDistance(next,target)<=qDistance(q,target)+1e-7,'Target error must never grow');
  assert.ok(Math.abs(Math.hypot(...next)-1)<1e-12);q=next;
 }
 assert.ok(qDistance(q,target)<1e-5,'Target is reached without pole oscillation');
 const y=t.q2ypr(...target);assert.ok(qDistance(target,t.ypr2q(y.yaw,y.pitch,y.roll))<1e-5,'Pole readout represents the same attitude');
 assert.ok(qDistance(t.slewQuaternion(q,target.map(v=>-v),.1,1),q)<1e-5,'Antipodal quaternions are the same orientation');
}
assert.equal(qDistance(t.slewQuaternion([1,0,0,0],t.ypr2q(40,0,0),.1,0),[1,0,0,0]),0);
// Die Radiatoren rollen um die Körper-X-Achse. Der gesamte Bereich von ±105° bleibt frei von der festen
// Struktur, und der Kraftweg Träger -> festes TRRJ-Gehäuse -> Rotor -> Balken hat bei keinem Winkel eine Lücke.
const sweepMonitor=new CollisionMonitor(t.MODEL,root);
const park=t.liveJoints();
for(let angle=-105;angle<=105;angle+=3){park.trrjS=park.trrjP=angle;t.applyJoints(park);
 const hits=sweepMonitor.scan().filter(h=>(h.a.group.startsWith('trrj')&&h.b.group==='fixed')||(h.b.group.startsWith('trrj')&&h.a.group==='fixed'));
 assert.equal(hits.length,0,'Radiator sweep must clear station at '+angle+': '+hits.map(h=>h.a.name+' / '+h.b.name).join(';'));
 for(const [key,name]of [['trrjS','S1'],['trrjP','P1']]){
  const {housing,rotor,beam}=t.MODEL.radiatorMounts[key];
  const truss=t.MODEL.parts.find(p=>p.mesh.userData.name===name+' truss').mesh;
  const bounds=o=>new THREE.Box3().setFromObject(o).expandByScalar(1e-6);
  assert.ok(bounds(housing).intersectsBox(bounds(truss)),'TRRJ housing must reach the truss');
  assert.ok(bounds(rotor).intersectsBox(bounds(housing)),'Rotor must meet the fixed housing');
  assert.ok(bounds(beam).intersectsBox(bounds(rotor)),'Rotating beam must meet the rotor');
  assert.equal(housing.parent,root,'Housing must not rotate with the beam');
  // Die Drehachse ist die Körper-X-Achse: Die Plattenmitte der mittleren ORU bleibt auf der Achse.
  const mid=t.MODEL.parts.find(p=>p.mesh.userData.name===name+' radiator ORU 2 panel 8').mesh.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(mid.z)<1e-6&&Math.abs(Math.abs(mid.y)-14.68)<1e-6&&mid.x<-20,'Radiator extends aft along its roll axis');
 }
}
// Das Ausfahren ist gekoppelt, keine unabhängige Lageachse.
const panel=t.MODEL.radiators[0][7];J.radDeploy[0]=1;t.applyJoints(J);root.updateMatrixWorld(true);const extended=panel.getWorldPosition(new THREE.Vector3());J.radDeploy[0]=0;t.applyJoints(J);root.updateMatrixWorld(true);assert.ok(extended.distanceTo(panel.getWorldPosition(new THREE.Vector3()))>15);
// Die exakte Kollisionsprüfung gegen bekannte getrennte/sich schneidende OBBs testen.
const group=new THREE.Group(),a=new THREE.Mesh(new THREE.BoxGeometry(2,2,2)),b=new THREE.Mesh(new THREE.BoxGeometry(2,2,2));
a.userData={name:'Moving arm',collisionGroup:'moving'};b.userData={name:'Obstacle'};group.add(a,b);b.position.x=4;
const monitor=new CollisionMonitor({parts:[{mesh:a},{mesh:b}]},group);assert.equal(monitor.scan().length,0);b.position.x=1.5;assert.equal(monitor.scan().length,1);b.visible=false;assert.equal(monitor.scan().length,0);
// Ausgangsmodell und ein absichtlich gefalteter Arm laufen beide durch den echten Detektor.
const actual=new CollisionMonitor(t.MODEL,root);assert.ok(Array.isArray(actual.scan()));
const collisionPose=t.liveJoints();collisionPose.baseLoc=7;collisionPose.baseEnd=5;collisionPose.arm=[0,0,150,0,0,0,0];t.applyJoints(collisionPose);
assert.ok(actual.scan().some(h=>h.a.name.includes('SSRMS')||h.b.name.includes('SSRMS')),'A deliberate arm sweep through station geometry must warn');
// GIBS-Randkacheln werden auf den richtigen UV-Bereich beschnitten; die Geometrie bleibt auf der Kugel.
assert.equal(tileBounds(2,2,4).south,-90);assert.equal(tileBounds(2,2,4).east,180);
const geo=tileGeometry(2,2,4,6378000),p=geo.getAttribute('position'),uv=geo.getAttribute('uv');
for(let i=0;i<p.count;i++){assert.ok(Math.min(Math.abs(new THREE.Vector3().fromBufferAttribute(p,i).length()-6378000),Math.abs(new THREE.Vector3().fromBufferAttribute(p,i).length()-6374000))<1);assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);}
// Den echten Weg SIM-Strom -> Telemetrie -> Live-Pose -> Mesh über zwei volle Umläufe prüfen.
// Normalen im Szenensystem aus den Geometrie-Attributen testen, einschließlich Stationslage
// und LVLH-Drehung der Ansicht, nicht angenommene Achsen.
const realNow=w.Date.now,oldSource=t.LINK.src;let clock=Date.UTC(2026,9,14,9,30),day=0,night=0;
t.LINK.src='sim';w.Date.now=()=>clock;t.SIMST.s=t.simInitOrbit(clock);t.SIMST.last=clock;t.SIMST.trrjS=t.SIMST.trrjP=0;
try{
 for(let sample=0;sample<190;sample++,clock+=60*1000){
  t.simTick();const pose=t.liveJoints();t.applyJoints(pose);
  const sun=t.sunEci(clock),basis=t.lvlhBasis(t.SIMST.s),eclipse=t.inShadow(t.SIMST.s,sun);
  const view=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
  const att=new THREE.Quaternion(pose.q[1],pose.q[2],pose.q[3],pose.q[0]);
  root.quaternion.copy(view).multiply(att);root.updateMatrixWorld(true);
  const sunL=new THREE.Vector3(sun.dot(basis.x),sun.dot(basis.y),sun.dot(basis.z));
  const sunScene=sunL.clone().applyQuaternion(view),nadirBody=new THREE.Vector3(0,0,1).applyQuaternion(att.clone().invert());
  const sunBody=sunL.clone().applyQuaternion(att.clone().invert());
  for(const part of t.MODEL.parts.filter(p=>/^[SP]1 radiator ORU \d panel \d$/.test(p.mesh.userData.name))){
   const normal=new THREE.Vector3().fromBufferAttribute(part.mesh.geometry.getAttribute('normal'),0).transformDirection(part.mesh.matrixWorld);
   if(!eclipse)assert.ok(Math.abs(normal.dot(sunScene))<1e-6,'SIM radiator broad faces must be edge-on in sunlight');
   else assert.ok(Math.abs(normal.dot(new THREE.Vector3(0,0,1).applyQuaternion(view)))-Math.hypot(nadirBody.y,nadirBody.z)>-1e-6,'SIM eclipse pose must maximize Earth-facing area within its one rotation axis');
  }
  assert.ok(pose.trrjP>=-105&&pose.trrjP<=105);assert.ok(pose.trrjS>=-105&&pose.trrjS<=105);
  assert.match(t.radiatorStatus(pose,sunBody,eclipse),eclipse?/eclipse: no direct sunlight/:/0.0% \/ 0.0%/);
  if(eclipse)night++;else day++;
 }
 assert.ok(day>20&&night>20,'The test must actually cover sunlight and eclipse');
 assert.equal(t.radiatorGoal(new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1),false,34),34,'No arbitrary flip when Sun lies on joint axis');
}finally{w.Date.now=realNow;t.LINK.src=oldSource;t.TM.clear();root.quaternion.identity();root.updateMatrixWorld(true);}
// Abgeschaltete Antriebe halten ihre Gelenke, freigegebene Regler schwenken, Pause friert die Uhr ein.
t.enterCmd();t.CMD.radiatorAuto=false;t.CMD.sp.arm[0]+=20;t.CMD.sys.command('drive.arm',false);const initialAngle=t.CMD.st.arm[0];t.stepCmd(.25);assert.equal(t.CMD.st.arm[0],initialAngle);
t.CMD.sys.command('drive.arm',true);t.stepCmd(.25);assert.ok(t.CMD.st.arm[0]>initialAngle);t.CMD.paused=true;const time=t.CMD.sys.time;t.stepCmd(.25);assert.equal(t.CMD.sys.time,time);t.CMD.paused=false;
t.commandVirtual('holdHere',true);t.stepCmd(.25);assert.ok(Math.abs(t.CMD.sp.ypr.yaw-t.CMD.st.ypr.yaw)<.01);
// Die echten DOM-Handler auslösen, nicht nur Modellmethoden aufrufen.
const select=w.document.querySelector('[data-action="mode"]');select.focus();select.value='free';w.VirtualControls.sync(w.document.querySelector('#cSystems'),t.CMD.sys);assert.equal(select.value,'free','Periodic refresh must not overwrite a select being edited');
select.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(t.CMD.sys.mode,'free');assert.equal(t.CMD.sliderAssist,false);
w.document.querySelector('#cAssist').click();assert.equal(t.CMD.sliderAssist,true);
const yaw=w.document.querySelector('#cYaw');yaw.value='30';yaw.dispatchEvent(new w.Event('input',{bubbles:true}));yaw.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(t.CMD.sp.ypr.yaw,30);
t.CMD.warp=120;for(let i=0;i<15;i++)t.stepCmd(.25);assert.ok(Math.abs(t.CMD.st.ypr.yaw-30)<.01,'Guided slider must reach its target');
const arm=w.document.querySelector('[data-action="arm"]');arm.click();assert.equal(t.CMD.sys.prop.armed,true);
const fire=w.document.querySelector('[data-action="jet.0.manual"]');fire.click();assert.equal(t.CMD.sys.prop.jets[0].manual,true);assert.equal(t.CMD.sliderAssist,false);t.stepCmd(.25);assert.ok(t.CMD.sys.prop.jets[0].duty>0);
// Ein Ziel nach manuellem Feuern muss die Lagehaltung wirklich aktivieren, die Freigabe behalten und
// die eingerastete Düse stoppen. Früher blieb freies Driften aktiv und der Regler wurde ignoriert.
yaw.value='45';yaw.dispatchEvent(new w.Event('input',{bubbles:true}));
assert.equal(t.CMD.sys.mode,'hold');assert.equal(t.CMD.sys.prop.armed,true);assert.equal(t.CMD.sys.prop.jets[0].manual,false);assert.equal(t.CMD.sliderAssist,false);
w.document.querySelector('#cAssist').click();
t.CMD.sys.q=t.ypr2q(179,89.9,-130);
for(const [id,v]of [['cYaw',-179],['cPitch',90],['cRoll',150]]){const el=w.document.querySelector('#'+id);el.value=String(v);el.dispatchEvent(new w.Event('input',{bubbles:true}));}
const poleTarget=t.ypr2q(-179,90,150);
for(let i=0;i<40;i++)t.stepCmd(.25);
assert.ok(qDistance(t.CMD.st.q,poleTarget)<1e-5,'Actual guided control reaches a singular Euler target');
assert.equal(t.CMD.sp.ypr.yaw,-179);assert.equal(t.CMD.sp.ypr.roll,150,'Target choices must not be rewritten from Euler readback');
assert.equal(Math.hypot(...t.CMD.sys.omega),0);
w.document.querySelector('#cDamp').click();assert.equal(t.CMD.sys.mode,'damp');assert.equal(t.CMD.sys.prop.jets[0].manual,false);
w.document.querySelector('#cResetMotion').click();assert.equal(Math.hypot(...t.CMD.sys.omega),0);assert.equal(t.CMD.sys.prop.armed,false);
// Eine abgelehnte Feueranfrage muss das Häkchen zurücksetzen und die Führung unverändert lassen.
const assist=w.document.querySelector('#cAssist');if(!assist.checked)assist.click();fire.click();assert.equal(fire.checked,false);assert.equal(t.CMD.sliderAssist,true);
assert.equal(t.virtTm('CSASPDM0020'),t.CMD.st.dextre[14]);assert.equal(t.virtTm('Z1000015'),t.CMD.st.kuCross);
if(process.env.AUDIT_OUTPUT)fs.writeFileSync(process.env.AUDIT_OUTPUT,JSON.stringify([...t.DICT.values()].map(d=>({...d,virtual:t.virtTm(d.pui)!==undefined}))));
t.exitCmd();dom.window.close();console.log('PASS geometry/DOM: both arm anchors, MT inheritance, fixed anchoring, rendered solar/radiator normals, folding, collision detector, tile geometry, disabled drives, sliders, pause and new channels');
