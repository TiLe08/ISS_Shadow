// test_radiators.mjs: Hauptradiatoren und TRRJ.
//   - Die Radiatoren rollen um die Körper-X-Achse (wie ein Solarflügel um seinen Mast) und klappen
//     nicht um die Trägerachse: Die Längsachse jeder ORU bleibt bei jedem Winkel parallel zu −X.
//   - Vorzeichen: Bei positivem Messwert senkt sich auf Steuerbord die Außenkante (NASA-Messung an
//     CTC-2/ELC-4), auf Backbord die Innenkante (Livebild CP8 vom 10.11.2026).
//   - Regelziel: bei Sonne kantig zur Sonne, im Erdschatten eine Seite zur Erde, immer innerhalb ±105°.
//   - checkTrrjSense: Autotrack-Daten bestätigen das Vorzeichen oder kehren es um.
//   - Der ganze Bereich bleibt frei von der Struktur; Abstand zur Bishop-Luftschleuse.
import assert from 'node:assert/strict';import * as THREE from 'three';import{loadTwin}from'./harness.mjs';
import{CollisionMonitor,radiatorTarget}from'../model-checks.mjs';
const{t,w}=await loadTwin(['buildISS','MODEL','LINK','TM','CAL','ingest','cal','applyJoints','liveJoints','radiatorGoal','autotrack','checkTrrjSense','TRRJ_SENSE']);
const root=t.buildISS(),M=t.MODEL,V3=(...a)=>new THREE.Vector3(...a);
const mesh=n=>M.parts.find(p=>p.mesh.userData.name===n).mesh,pos=n=>mesh(n).getWorldPosition(V3());
t.LINK.src='mqtt';
// --- Achse: Rollen um X ---
for(const a of[-105,-60,0,35,90,105]){
  const J=t.liveJoints();J.trrjS=J.trrjP=a;t.applyJoints(J);root.updateMatrixWorld(true);
  for(const side of['S1','P1'])for(let o=1;o<=3;o++){
    const d=pos(`${side} radiator ORU ${o} panel 8`).sub(pos(`${side} radiator ORU ${o} panel 1`)).normalize();
    assert.ok(d.distanceTo(V3(-1,0,0))<1e-9,`${side} ORU ${o} bleibt bei ${a}° entlang −X (kein Klappen)`);
  }
  // Der Balken dreht wie ein Propeller in der YZ-Ebene: Die äußere ORU beschreibt einen Kreis mit 3,75 m Radius.
  const o3=pos('S1 radiator ORU 3 panel 1'),r=a*Math.PI/180;
  assert.ok(Math.abs(o3.y-(14.68+3.75*Math.cos(r)))<1e-6&&Math.abs(o3.z-3.75*Math.sin(r))<1e-6,'S1 außen bei '+a+'°');
  const n=V3(0,0,1).transformDirection(mesh('S1 radiator ORU 2 panel 4').matrixWorld);
  assert.ok(n.distanceTo(w.radiatorNormal(a))<1e-9,'Normale (0, −sin a, cos a)');
}
// Maße: drei ORUs je Seite mit acht Platten, 3,4 m breit, zusammen etwa 23 m lang und 11 m breit.
assert.equal(M.radiators.length,6);assert.ok(M.radiators.every(o=>o.length===8));
{const J=t.liveJoints();J.trrjS=J.trrjP=0;t.applyJoints(J);root.updateMatrixWorld(true);
 const b=new THREE.Box3();for(const p of M.parts)if(/^S1 radiator ORU \d panel/.test(p.mesh.userData.name))b.expandByObject(p.mesh);
 const s=b.getSize(V3());assert.ok(Math.abs(s.x-21.96)<0.1&&Math.abs(s.y-10.9)<0.01&&s.z<1e-6,'Fläche '+s.toArray().map(v=>v.toFixed(2)));
 assert.ok(Math.abs(b.min.y-9.23)<0.01&&Math.abs(b.max.y-20.13)<0.01,'IGOAL: Spannweite Y 9,2..20,2');}
// --- Vorzeichen mit den Live-Werten vom 10.11.2026 ---
assert.equal(t.cal('trrjS',24.8),24.8);assert.equal(t.cal('trrjP',15.2),15.2);
for(const[p,v]of Object.entries({S0000001:24.8,S0000002:15.2}))t.ingest(p,v);
{const J=t.liveJoints();t.applyJoints(J);root.updateMatrixWorld(true);
 assert.ok(pos('S1 radiator ORU 3 panel 1').z>1.5,'S1: Außenkante (Steuerbord) unten');
 assert.ok(pos('S1 radiator ORU 1 panel 1').z<-1.5,'S1: Innenkante oben');
 assert.ok(pos('P1 radiator ORU 3 panel 1').z>0.9,'P1: Innenkante (zur Stationsmitte) unten');
 assert.ok(pos('P1 radiator ORU 1 panel 1').z<-0.9,'P1: Außenkante oben');}
// --- Regelziel ---
for(let n=0;n<60;n++){
  const sun=V3(Math.cos(n*1.3),Math.sin(n*.7),Math.sin(n*2.1)).normalize(),nadir=V3(Math.sin(n)*.1,Math.cos(n)*.1,1).normalize();
  const day=t.radiatorGoal(sun,nadir,false,10),night=t.radiatorGoal(sun,nadir,true,10);
  assert.ok(Math.abs(day)<=105&&Math.abs(night)<=105);
  assert.ok(Math.abs(w.radiatorNormal(day).dot(sun))<1e-9,'kantig zur Sonne');
  assert.ok(Math.abs(Math.abs(w.radiatorNormal(night).dot(nadir))-Math.hypot(nadir.y,nadir.z))<1e-9,'größte Fläche zur Erde');
  assert.ok(Math.abs(t.autotrack(sun).trrj-radiatorTarget(Math.atan2(sun.z,sun.y)*180/Math.PI))<1e-9);
}
assert.equal(t.radiatorGoal(V3(1,0,0),V3(0,0,1),false,-77),-77,'Sonne auf der Drehachse: Winkel halten');
// Bei Beta = 0 liegt die Sonne in der XZ-Ebene: Der Radiator steht dann senkrecht (±90°).
assert.equal(Math.abs(t.radiatorGoal(V3(.6,0,.8),V3(0,0,1),false,80)),90);
// --- Vorzeichenprüfung aus Autotrack-Daten ---
{const S=t.TRRJ_SENSE;let now=1e9;
 const feed=(sign,n)=>{let ch=false;for(let i=0;i<n;i++,now+=11e3){const sun=V3(.3,Math.sin(i*.37),Math.cos(i*.37)).normalize(),a=t.radiatorGoal(sun,V3(0,0,1),false,0);
   t.ingest('S0000001',a);t.ingest('S0000002',sign*a);ch=t.checkTrrjSense(sun,false,now)||ch;}return ch;};
 t.ingest('S0000006',4);t.ingest('S0000007',4);
 assert.equal(feed(-1,40),false);assert.equal(S.trrjP.n.join(),'0,0','geparkt (DIR POS): kein Beleg');
 t.ingest('S0000006',5);t.ingest('S0000007',5);
 assert.equal(feed(-1,60),true,'Backbord läuft gegenläufig: Vorzeichen wird umgekehrt');
 assert.equal(t.CAL.trrjP.sign,-1);assert.equal(t.CAL.trrjS.sign,1);assert.ok(S.trrjP.confirmed&&S.trrjS.confirmed);
 assert.equal(JSON.parse(w.localStorage.getItem('iss.cal.trrj')).trrjP,-1,'gespeichert');
 t.CAL.trrjP.sign=1;S.trrjP.confirmed=false;S.trrjP.n=[0,0];S.trrjP.at=0;w.localStorage.removeItem('iss.cal.trrj');
 assert.equal(feed(1,60),false,'gleichsinnig: Tabelle bestätigt, keine Änderung');assert.equal(t.CAL.trrjP.sign,1);assert.ok(S.trrjP.confirmed);
 t.TM.clear();}
// --- Freiraum über den ganzen Bereich, beide Radiatoren unabhängig ---
const mon=new CollisionMonitor(M,root);
for(let s=-105;s<=105;s+=15)for(let p=-105;p<=105;p+=5){
  const J=t.liveJoints();J.trrjS=s;J.trrjP=p;t.applyJoints(J);
  const hits=mon.scan().filter(h=>/radiator/.test(h.a.name+h.b.name));
  assert.equal(hits.length,0,`frei bei S ${s}° / P ${p}°: `+hits.map(h=>h.a.name+' / '+h.b.name).join('; '));
}
// Kleinster Abstand der Innenkante des P1-Radiators zur Bishop-Luftschleuse (Zylinderachse Y, r ≈ 1,05 m).
{let min=Infinity,at=0;const bx=new THREE.Box3().setFromObject(M.bishop);
 for(let p=-105;p<=105;p+=1){const J=t.liveJoints();J.trrjP=p;t.applyJoints(J);root.updateMatrixWorld(true);
   for(let j=1;j<=2;j++){const m=mesh('P1 radiator ORU 3 panel '+j),g=m.geometry.attributes.position;
     for(let i=0;i<g.count;i++){const v=V3().fromBufferAttribute(g,i).applyMatrix4(m.matrixWorld);
       if(v.x<bx.min.x-0.5||v.x>bx.max.x+0.5)continue;
       const d=Math.hypot(Math.max(0,bx.min.y-v.y,v.y-bx.max.y),Math.max(0,Math.hypot(v.x+4.45,v.z-4.85)-1.05));if(d<min){min=d;at=p;}}}}
 assert.ok(min>0.3,'Abstand P1-Radiator/Bishop '+min.toFixed(2)+' m bei '+at+'°');
 console.log(`PASS Radiatoren: Rollen um X, Maße 22 m × 10,9 m, Vorzeichen S/P, Regelziel Tag/Nacht, Vorzeichenprüfung im Autotrack, frei über ±105° (Bishop: ${min.toFixed(2)} m bei ${at}°)`);}
