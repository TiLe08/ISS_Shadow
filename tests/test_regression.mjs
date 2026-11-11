// test_v10.mjs: Regressionen seit v1.0: Geometrie der realen Konfiguration über den vollen
// Gelenkweg sowie die Struktur von Overlay, Kommandofenster und veränderbarem Layout des Dashboards.
// Lädt iss_twin.html ohne WebGL in jsdom: Die Skripte der Seite laufen in einer VM, das
// Modul-Skript wird mit einem Export globalThis.TEST um die benötigten internen Funktionen ergänzt.
import fs from 'node:fs';import assert from 'node:assert/strict';import * as THREE from 'three';import{loadTwin}from'./harness.mjs';
import{CollisionMonitor,meshesIntersect}from'../model-checks.mjs';
// Exakter Überlappungstest: Ein Teil parallel zu einem 2,2-m-Modul, 10 cm neben der Hülle unter 45°, liegt
// in der Bounding-Box des Moduls, ist aber frei; 10 cm in der Hülle ist es das nicht.
{const mod=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,7,24).rotateZ(-Math.PI/2)),p=new THREE.Mesh(new THREE.CylinderGeometry(.33,.33,1,12).rotateZ(-Math.PI/2));
 const at=d=>{const c=(2.2+.33+d)/Math.SQRT2;p.position.set(0,c,c);mod.updateMatrixWorld(true);p.updateMatrixWorld(true);};
 at(.1);assert.ok(new THREE.Box3().setFromObject(mod).intersectsBox(new THREE.Box3().setFromObject(p)),'inside the box corner');
 assert.equal(meshesIntersect(mod,p),false,'45° box-corner contact is not an overlap');at(-.1);assert.equal(meshesIntersect(mod,p),true,'real penetration still detected');}
const{t,w,dom}=await loadTwin(['updateIrosa','parseDockingEvents','setVehicleEvents','vvAt','updateVehicles','VV','VV_FALLBACK','gmstRad','liveJointsRaw','learnMssFromPose','MSS_CAL','mbsChoices','mssConvention','predictJoints','learnTracking','PRED','poseGapS','timebaseReset','linkWatchdog','startLive','stopLive','buildISS','MODEL','applyJoints','liveJoints','buildPanels','initLayout','LAYOUT','applyLayout','makeResizer','enterCmd','exitCmd','CMD','stepCmd','setWarp','setPaused','drawMap','D','WARPS','ingest','TM','TIMEBASE','poseSource','updatePanels','arrayLighting','DICT','MODEL_MANIFEST:MODEL','attitudeSource','hoursOfYear','solarNormal','solarAngles','sunEci','lvlhBasis','inShadow','radiatorNormal','uncal','cal','CAL','simTick','simInitOrbit','SIMST','LINK'],{visual:true});const root=t.buildISS();root.updateMatrixWorld(true);
const part=name=>t.MODEL.parts.find(p=>p.mesh.userData.name===name)?.mesh;
const center=m=>new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
const bounds=m=>new THREE.Box3().setFromObject(m);

// --- S3/P3-Nutzlastplätze wie im NASA-IGOAL-Modell: AMS-02 S3 oben innen, ELC-2 S3
// oben außen, ELC-4 S3 unten innen, ESP-3 S3 unten außen; ELC-3 P3 oben, ELC-1 P3 unten.
const s3=bounds(part('S3 truss')),p3=bounds(part('P3 truss'));
const site=(name,truss,zenith)=>{const b=bounds(part(name));
 assert.ok(b.min.y>=Math.min(truss.min.y,truss.max.y)-1e-6&&b.max.y<=Math.max(truss.min.y,truss.max.y)+1e-6,name+' must sit on its own truss segment');
 assert.ok(zenith?b.max.z<=truss.min.z+1e-6:b.min.z>=truss.max.z-1e-6,name+(zenith?' must be on the zenith (-Z) face':' must be on the nadir (+Z) face'));return center(part(name)).y;};
const ams=site('AMS-02',s3,true),elc2=site('ELC-2 deck',s3,true),elc4=site('ELC-4 deck',s3,false),esp3=site('ESP-3 deck',s3,false);
const elc3=site('ELC-3 deck',p3,true),elc1=site('ELC-1 deck',p3,false);
assert.ok(Math.abs(ams)<Math.abs(elc2),'AMS-02 is inboard of ELC-2');assert.ok(Math.abs(elc4)<Math.abs(esp3),'ELC-4 is inboard of ESP-3');
assert.ok(Math.abs(elc4-ams)<0.8&&Math.abs(elc3-elc1)<0.8,'Upper/lower sites share a truss station');
assert.ok(bounds(part('AMS-02')).intersectsBox(bounds(part('S3 truss')).expandByScalar(0.06)),'AMS-02 is attached, not floating');

// --- Dextre ist am MBS gegriffen; ERA an Nauka verstaut.
assert.ok(bounds(part('Dextre LEE (base)')).intersectsBox(bounds(part('Mobile Base System'))),'Dextre must be attached to the MBS');
assert.ok(bounds(part('Dextre LEE (base)')).intersectsBox(bounds(part('Dextre torso'))));
assert.ok(t.MODEL.parts.some(p=>p.mesh.userData.name==='ERA boom 1'),'Nauka carries the European Robotic Arm');
assert.ok(bounds(t.MODEL.parts.filter(p=>p.mesh.userData.name==='ERA end effector / base')[0].mesh).intersectsBox(bounds(part('Nauka (MLM)'))));

// --- Der SARJ dreht endlos: Kein Teil des äußeren Trägers darf bei IRGENDEINER Alpha/Beta-Kombination
// die feste Station treffen (die inneren Zellbahn-Boxen von v0.9 schnitten durch S3/P3).
// Mit allen acht iROSAs (auch 2A und 3B aus dem Herbst 2026 vollständig ausgerollt).
t.updateIrosa(Date.parse('2026-12-01T00:00:00Z'));
const mon=new CollisionMonitor(t.MODEL,root),J=t.liveJoints();
for(let a=0;a<360;a+=15)for(let b=0;b<360;b+=45){
 J.sarjP=a;J.sarjS=(a+90)%360;for(const [i,ch]of Object.keys(J.bga).entries())J.bga[ch]=(b+i*20)%360;
 J.trrjS=-105+(a/360)*210;J.trrjP=Math.min(40,J.trrjS);/* P1: Sperrzone Bishop */t.applyJoints(J);
 const hits=mon.scan();assert.equal(hits.length,0,`alpha ${a} beta ${b}: `+hits.map(h=>h.a.name+' / '+h.b.name).join('; '));
}
// Die innere Flügelwurzel hat bei Beta 0 Abstand zum SARJ-Ring.
J.sarjP=J.sarjS=0;for(const ch of Object.keys(J.bga))J.bga[ch]=0;t.applyJoints(J);root.updateMatrixWorld(true);
const ring=bounds(part('S SARJ'));
for(const m of t.MODEL.parts.filter(p=>/^SAW (1A|3A) blanket box$/.test(p.mesh.userData.name)).map(p=>p.mesh))assert.ok(bounds(m).min.y-ring.max.y>0.1,'S4 blanket boxes outboard of the SARJ');

// --- Live-Schnappschuss von ISSLive (14.10.2026): Konventionen, physikalische Konsistenz, Abstand.
{
 const live=JSON.parse(fs.readFileSync(new URL('./live_sample_20261014.json',import.meta.url),'utf8'));
 const rx=Date.parse(live.utc);
 for(const [k,v]of Object.entries(live))if(typeof v==='number')t.ingest(k,v,NaN,rx,'ISSLIVE');
 // Live-Gelenke gelten bei AOS als live, auch wenn sich ein geparktes Gelenk seit Minuten nicht geändert hat.
 t.LINK.src='live';t.LINK.sig='AOS';t.LINK.signalRx=Date.now();t.LINK.sigTs=t.hoursOfYear(Date.now());
 assert.equal(t.poseSource().label,'LIVE POSE');assert.equal(t.attitudeSource(),'LIVE ATT LVLH');
 t.LINK.sig='LOS';assert.match(t.poseSource().label,/^LAST KNOWN POSE/);t.LINK.sig='AOS';
 const keep=t.TM.get('CSAMT000001');t.TM.delete('CSAMT000001');assert.match(t.poseSource().label,/placeholder MT/);t.TM.set('CSAMT000001',keep);
 const L=t.liveJoints();t.applyJoints(L);root.updateMatrixWorld(true);
 assert.equal(new CollisionMonitor(t.MODEL,root).scan().length,0,'The flown pose (arrays, radiators, Canadarm2 on Node 2, Dextre stowed) must not overlap');
 // Alle acht Flügel ergeben eine physikalische Ausrichtung, beide SARJs ein Alpha.
 const S=['1A','3A','1B','3B'];
 const normals=Object.keys(L.bga).map(ch=>t.solarNormal(S.includes(ch)?L.sarjS:L.sarjP,L.bga[ch]));
 for(const n of normals)assert.ok(n.distanceTo(normals[0])<0.02,'Opposed and port/starboard wings must agree physically');
 assert.ok(Math.abs(((L.sarjP-L.sarjS)%360+540)%360-180)<1.5,'Port and starboard SARJ map to the same physical angle');
 // Gegen die berechnete Sonne: Flügel zeigen zu ihr, PV-Radiatoren weg, TRRJ-Radiatoren nahezu kantig.
 const st=[live.USLAB000032,live.USLAB000033,live.USLAB000034,live.USLAB000035/1000,live.USLAB000036/1000,live.USLAB000037/1000];
 const sun=t.sunEci(rx),B=t.lvlhBasis(st),q=[live.USLAB000018,live.USLAB000019,live.USLAB000020,live.USLAB000021];
 assert.equal(t.inShadow(st,sun),false);
 const sunB=new THREE.Vector3(sun.dot(B.x),sun.dot(B.y),sun.dot(B.z)).applyQuaternion(new THREE.Quaternion(q[1],q[2],q[3],q[0]).invert());
 // (Die Sonnenprüfungen dieses Schnappschusses mit geparkten SARJs setzten nachführende BGAs voraus; die
 // Autotrack-Daten vom 20.10. unten zeigten, dass diese Annahme (und die darauf gebaute BGA-Tabelle) falsch war.)
 const a=t.solarAngles(L.sarjS,0).a;assert.ok(new THREE.Vector3(-Math.cos(a),0,Math.sin(a)).dot(sunB)<-0.5,'PV radiators extend away from the Sun');
 // Das TRRJ-Vorzeichen ist durch Proben mit geparkten Radiatoren nicht belegt (siehe GEOMETRY.md); hier keine Kantenaussage.
 // Telemetriewerte überstehen den Hin- und Rückweg durch die Kalibriertabelle.
 for(const [k,pui]of [['sarjS','S0000003'],['sarjP','S0000004'],['trrjS','S0000001']])assert.ok(Math.abs(((t.uncal(k,L[k])-live[pui])%360+540)%360-180)<1e-6);
 // Einheiten: ISSLive sendet km und m/s, obwohl das Arbeitsblatt FT angibt; Fuß funktioniert weiterhin.
 const OD=w.OrbitData,km=OD.toKm(st.slice(0,3).concat(st.slice(3).map(v=>v*1000)));assert.ok(Math.abs(km[0]-st[0])<1e-9&&Math.abs(km[3]-st[3])<1e-12);
 assert.ok(Math.abs(OD.toKm(st.map(v=>v*1000/0.3048))[2]-st[2])<1e-6);assert.equal(OD.toKm([1,2,3,4,5,6]),null);
 // Abweichende Zeitstempel-Epoche: TIME_000001 lehrt den Offset, jeder Wert wird frisch.
 t.TM.clear();const now=Date.now(),hoy=t.hoursOfYear(now),bogus=hoy-5838.3;
 t.ingest('S0000003',270.5,bogus-0.0001,now,'ISSLIVE');t.ingest('TIME_000001',1,bogus-1/3600,now-1000,'ISSLIVE');
 assert.equal(t.TIMEBASE.learned,false,'one clock sample proves nothing');t.ingest('TIME_000001',1,bogus,now,'ISSLIVE');
 assert.equal(t.TIMEBASE.foreign,true);assert.ok(Math.abs(t.TM.get('TIME_000001').ts-hoy)<1e-6);
 assert.ok(OD.age(t.TM.get('S0000003'),now)<2000,'Earlier readings are re-based too');
 t.ingest('TIME_000001',2,bogus+30/3600,now+30000,'ISSLIVE');assert.ok(OD.age(t.TM.get('TIME_000001'),now+30000)<1000);
 t.ingest('TIME_000001',3,bogus+30/3600,now+90000,'ISSLIVE');assert.ok(OD.age(t.TM.get('TIME_000001'),now+90000)>=59000,'A frozen clock still goes stale');
 // Eine stehende Uhr, die ein Neuverbinden erneut sendet, ist kein Tick und frischt nichts auf.
 const rxBefore=t.TM.get('S0000003').rx;t.ingest('S0000003',270.5,bogus-0.0001,now+95000,'ISSLIVE');assert.equal(t.TM.get('S0000003').rx,rxBefore,'re-sent snapshot is not a new reading');
 // Eine um 45 s falsch gehende PC-Uhr: Zwei Ticks lehren den Offset, Werte sind aktuell, weder veraltet noch „aus der Zukunft“.
 t.TM.clear();t.timebaseReset();const sk=hoy-45/3600;t.ingest('TIME_000001',1,sk,now,'ISSLIVE');t.ingest('TIME_000001',2,sk+1/3600,now+1000,'ISSLIVE');
 t.ingest('USLAB000018',0.99,sk+1/3600,now+1000,'ISSLIVE');assert.ok(OD.age(t.TM.get('USLAB000018'),now+1000)<1000,'clock skew absorbed');
 assert.ok(Math.abs(t.TIMEBASE.offsetH*3600-45)<0.01&&!t.TIMEBASE.foreign);
 // Verbindungs-Watchdog: Eine verbundene, aber stumme ISSLive-Sitzung wird nach 60 s neu aufgebaut, danach mit wachsender Wartezeit.
 Object.assign(t.LINK,{src:'live',state:'connected',clientSince:now-61000,timeRx:now-61000,retryMs:60000,stateSince:now-61000});
 assert.equal(t.linkWatchdog(now-1000),null);assert.equal(t.linkWatchdog(now),'restart-live');assert.equal(t.LINK.retryMs,120000);
 Object.assign(t.LINK,{state:'connected',clientSince:now,timeRx:now});assert.equal(t.linkWatchdog(now+100000),null,'backed off to 120 s');
 Object.assign(t.LINK,{src:'mqtt',state:'connected',clientSince:now-70000,msgRx:now-70000,retryMs:60000});assert.equal(t.linkWatchdog(now),'restart-mqtt');
 // Datenlücke: Geparkte SARJs (DIR POS / CHECKOUT) bleiben stehen, nachführende BGAs folgen der Sonne;
 // mit beiden SARJs in AUTOTRACK zeigen die vorhergesagten Flügel genau zur Sonne.
 {for(const [k,v]of Object.entries(live))if(typeof v==='number')t.ingest(k,v,NaN,Date.now(),'SIM');
  const Jl=t.liveJoints(),sunB=new THREE.Vector3(.3,-.5,.81).normalize(),nad=new THREE.Vector3(0,0,1);
  for(const ch of ['1A','3A','1B','3B','2A','4A','2B','4B'])t.PRED.tracking[ch]=true;
  const r=t.predictJoints(Jl,sunB,nad,false);assert.equal(r.J.sarjP,Jl.sarjP);assert.equal(r.J.sarjS,Jl.sarjS);assert.ok(r.what.includes('all BGAs'));
  for(const ch of ['1A','2A']){const a=ch==='1A'?Jl.sarjS:Jl.sarjP,best=Math.hypot(sunB.y,sunB.x*Math.cos(a*Math.PI/180)-sunB.z*Math.sin(a*Math.PI/180));
    assert.ok(Math.abs(t.solarNormal(a,r.J.bga[ch]).dot(sunB)-best)<1e-9,'BGA prediction reaches the best incidence for the parked SARJ');}
  for(const p of ['S0000008','S0000009','S0000006','S0000007'])t.ingest(p,5,NaN,Date.now(),'SIM');
  const r2=t.predictJoints(Jl,sunB,nad,false);
  for(const ch of ['1A','3A','1B','3B','2A','4A','2B','4B']){const a=['1A','3A','1B','3B'].includes(ch)?r2.J.sarjS:r2.J.sarjP;assert.ok(t.solarNormal(a,r2.J.bga[ch]).dot(sunB)>0.999999,'autotrack prediction faces the Sun '+ch);}
  assert.ok(Math.abs(t.radiatorNormal(r2.J.trrjP).dot(sunB))<1e-6,'autotracking radiators predicted edge-on');
  t.PRED.tracking={};t.TM.clear();}
 // Live-Daten vom 20.10.2026, SARJs in AUTOTRACK: SARJ auf dem Sonnenziel, jeder Flügel zur
 // Sonne (die BGA-Tabelle von v1.7 zeichnete sie abgewandt), Ku-Hauptstrahl auf dem genutzten TDRS.
 {const F=JSON.parse(fs.readFileSync(new URL('./live_sample_20261020.json',import.meta.url),'utf8')),CH=['1A','3A','1B','3B','2A','4A','2B','4B'];
  const frame=V=>{const s=[V.USLAB000032,V.USLAB000033,V.USLAB000034,V.USLAB000035/1000,V.USLAB000036/1000,V.USLAB000037/1000];
    const B=t.lvlhBasis(s),q=new THREE.Quaternion(V.USLAB000019,V.USLAB000020,V.USLAB000021,V.USLAB000018).normalize();return {s,B,q};};
  for(const tag of ['t1','t2']){const V=F[tag];t.TM.clear();for(const [k,v]of Object.entries(V))if(k!=='utc_ms')t.ingest(k,v,NaN,Date.now(),'SIM');
   const {s,B,q}=frame(V),sun=t.sunEci(V.utc_ms),sunB=new THREE.Vector3(sun.dot(B.x),sun.dot(B.y),sun.dot(B.z)).applyQuaternion(q.clone().invert());
   const J=t.liveJoints(),tgt=Math.atan2(-sunB.z,sunB.x)*180/Math.PI;
   for(const k of ['sarjS','sarjP'])assert.ok(Math.abs(((J[k]-tgt)%360+540)%360-180)<1,'SARJ on the autotrack target '+k);
   // Quaternion-Richtung: Körper -> LVLH; die Inverse verfehlt das Autotrack-Ziel um > 10°
   const sunBi=new THREE.Vector3(sun.dot(B.x),sun.dot(B.y),sun.dot(B.z)).applyQuaternion(q),tgi=Math.atan2(-sunBi.z,sunBi.x)*180/Math.PI;
   assert.ok(Math.abs(((J.sarjS-tgi)%360+540)%360-180)>10,'inverse attitude rejected');
   for(const ch of CH)assert.ok(t.solarNormal(['1A','3A','1B','3B'].includes(ch)?J.sarjS:J.sarjP,J.bga[ch]).dot(sunB)>0.995,'wing faces the Sun '+tag+' '+ch);}
  const lons=[];
  for(const V of F.antenna_series){t.TM.clear();for(const [k,v]of Object.entries(V))if(/^[A-Z]/.test(k))t.ingest(k,v,NaN,Date.now(),'SIM');
   t.applyJoints(t.liveJoints());root.updateMatrixWorld(true);
   const d=t.MODEL.kuBoresight.getWorldPosition(new THREE.Vector3()).sub(t.MODEL.pivots.kuCross.getWorldPosition(new THREE.Vector3())).normalize();
   const dt=(V.utc_ms-V.sv_ms)/1000,{s,B,q}=frame(V);const r=new THREE.Vector3(s[0]+s[3]*dt,s[1]+s[4]*dt,s[2]+s[5]*dt);
   const dl=d.clone().applyQuaternion(q),u=B.x.clone().multiplyScalar(dl.x).add(B.y.clone().multiplyScalar(dl.y)).add(B.z.clone().multiplyScalar(dl.z));
   const b=2*r.dot(u),c=r.lengthSq()-42164**2,sd=(-b+Math.sqrt(b*b-4*c))/2,p=r.clone().addScaledVector(u,sd),th=t.gmstRad(V.utc_ms);
   assert.ok(sd>0&&Math.abs(Math.asin(p.z/42164)*180/Math.PI)<16,'Ku boresight reaches the geostationary belt');
   lons.push(Math.atan2(-p.x*Math.sin(th)+p.y*Math.cos(th),p.x*Math.cos(th)+p.y*Math.sin(th))*180/Math.PI);}
  assert.ok(Math.max(...lons)-Math.min(...lons)<1&&lons[0]>80&&lons[0]<95,'Ku stays on one relay over the Indian Ocean: '+lons.map(x=>x.toFixed(1)));
  t.TM.clear();}
 // Live-Robotik (Überlappungsbericht vom 19.10.2026: Canadarm2 an MBS PDGF 3 mit LEE A als Basis,
 // MT an WS4, CRS-35 an IDA-3). Auf der IGOAL-Anordnung mit der dokumentierten Gelenkkonvention
 // ist die echte Pose von Anfang an frei, das freie LEE bleibt frei vom Cargo Dragon,
 // und das Lernen daraus ist widerspruchsfrei.
 {const rep=JSON.parse(fs.readFileSync(new URL('./live_report_20261019.json',import.meta.url),'utf8'));t.TM.clear();
  for(const [k,o] of Object.entries(rep.telemetry))t.ingest(k,o.v,NaN,Date.now(),'SIM');
  t.VV.list=null;t.updateVehicles(Date.parse('2026-10-19T12:00:00Z'));assert.deepEqual(['ida2','ida3'].map(p=>t.MODEL.vvCur[p].type),['crewDragon','cargoDragon'],'19 Oct: Crew-13 and CRS-35 Dragons');
  for(const [k,g] of Object.entries(t.MODEL.vvG))g.visible=['ida2:crewDragon','ida3:cargoDragon'].includes(k);
  const mon=new CollisionMonitor(t.MODEL,root);t.MODEL.collision=mon;
  const armHits=()=>{t.applyJoints(t.liveJoints());root.updateMatrixWorld(true);return mon.scan().filter(h=>/SSRMS|Shoulder|Elbow|Wrist/.test(h.a.name+h.b.name));};
  assert.equal(armHits().length,0,'19 Oct pose clear with the prior');
  const tip=t.MODEL.armTip.getWorldPosition(new THREE.Vector3()).applyMatrix4(root.matrixWorld.clone().invert());
  const ida3=new THREE.Vector3(...t.MODEL.ports.ida3.pos);assert.ok(tip.distanceTo(ida3)>2.5&&tip.distanceTo(ida3)<9,'free LEE near, not inside, the Cargo Dragon: '+tip.toArray());
  const r=t.learnMssFromPose(t.liveJointsRaw());assert.ok(r.consistent);
  assert.equal(armHits().length,0,'calibrated: the real pose is clear');
  assert.ok(t.MSS_CAL.mbs[11][t.mssConvention()].filter(Boolean).length<=8);
  assert.equal(t.learnMssFromPose(t.liveJointsRaw()).changed,false);
  t.TM.clear();for(const [k,v]of Object.entries(live))if(typeof v==='number')t.ingest(k,v,NaN,Date.now(),'SIM');assert.equal(armHits().length,0,'14 Oct Node 2 pose clear');
  Object.values(t.MODEL.vvG).forEach(g=>g.visible=false);t.TM.clear();t.MODEL.collision=null;}
 // Ein gestoppter Client kann die neue Quelle nicht berühren: späte Statuswechsel und Updates werden ignoriert.
 const made=[];w.Ls={LightstreamerClient:class{constructor(){this.l=[];this.subs=[];this.connectionOptions={setSlowingEnabled(){}};made.push(this);}addListener(x){this.l.push(x);}subscribe(x){this.subs.push(x);}getSubscriptions(){return this.subs;}unsubscribe(){}connect(){}disconnect(){}},
   Subscription:class{constructor(m,items){this.items=items;this.ls=[];}setRequestedSnapshot(){}addListener(x){this.ls.push(x);}}};
 t.LINK.src='live';t.startLive();const old=made[0];old.l[0].onStatusChange('CONNECTED:WS-STREAMING');assert.equal(t.LINK.state,'connected');
 // Ein bei NASA eingefrorener Feed (21.10.2026: Uhr 11,5 h im Rückstand, Epoche 31. Dez., Status.Class 24)
 // wird ab seinem allerersten Schnappschuss als STALE markiert, ohne auf Uhr-Ticks zu warten.
 {t.timebaseReset();t.LINK.sig='LOS';const h=t.hoursOfYear(Date.now())+24-11.45;
  old.subs[0].ls[0].onItemUpdate({getItemName:()=>'TIME_000001',getValue:k=>k==='TimeStamp'?String(h):k==='Value'?String(h*3600e3):'24'});
  assert.equal(t.LINK.sig,'STALE','frozen feed detected at once');assert.ok(Math.abs((Date.now()-t.LINK.feedClockMs)/3600e3-11.45)<0.01,'feed clock age');}
 t.stopLive();t.LINK.src='sim';t.LINK.state='connected';old.l[0].onStatusChange('DISCONNECTED');assert.equal(t.LINK.state,'connected','late DISCONNECTED from a stopped client ignored');
 const n0=t.TM.size;old.subs[1].ls[0].onItemUpdate({getItemName:()=>'S0000003',getValue:k=>k==='Value'?'1':'6000'});assert.equal(t.TM.size,n0,'late update from a stopped client ignored');
 delete w.Ls;
 t.LINK.src='sim';t.LINK.state='idle';
 t.TM.clear();t.timebaseReset();
 // Der Simulator schreibt dieselben Konventionen, seine Werte sehen also aus wie der echte Feed.
 t.LINK.src='sim';t.SIMST.s=t.simInitOrbit(Date.now());t.SIMST.last=Date.now();t.simTick();
 const sj=t.liveJoints();assert.ok(Math.abs(((sj.sarjP-sj.sarjS)%360+540)%360-180)<1e-6);
 const sv=['S0000003','S0000004'].map(p=>t.TM.get(p).num),sum=(sv[0]+sv[1])%360;assert.ok(Math.min(sum,360-sum)<1e-6,'SIM port SARJ reads the mirror of starboard, like the real feed');
 t.TM.clear();
}

// --- Einheiten, wie ISSLive sie tatsächlich liefert (Live-Werte, 15.10.2026).
{
 t.buildPanels();t.LINK.src='live';const now=Date.now();
 const live15={USLAB000025:0.00721,USLAB000026:-0.06429,USLAB000027:0.00108,USLAB000022:0.0511,USLAB000023:-1.617,USLAB000024:-0.0235,
  USLAB000058:740.98,NODE3000011:-59.46,AIRLOCK000049:741.13,NODE3000001:154.24,NODE3000003:1.55,NODE3000002:574.19,USLAB000053:147.39,
  S1000001:3442.3,S1000002:1815.6,S1000003:3.205,S4000001:159.45,S4000002:0};
 for(const [k,v]of Object.entries(live15))t.ingest(k,v,NaN,now,'ISSLIVE');
 t.updatePanels(t.D);const txt=id=>w.document.querySelector('#'+id).textContent;
 assert.match(txt('gRate'),/^0\.06\d\d°\/s$/,'body rates are deg/s (orbit rate 0.065)');
 assert.match(txt('gErr'),/^1\.6\d\d°$/,'attitude errors are degrees');
 assert.match(txt('lP'),/^98\.\d\dkPa$/,'cabin pressure is mmHg (741 mmHg = 98.8 kPa)');
 assert.match(txt('lO2'),/^154\.2mmHg$/);assert.match(txt('lAl'),/^98\.\d\dkPa$/);
 assert.match(txt('lOga'),/n\/a/,'negative O2 production fill value is not shown as a rate');
 assert.match(txt('tFa'),/3442kg\/h/);assert.match(txt('tTa'),/3\.2\d°C/);
 assert.equal(t.arrayLighting(),true,'159 V means illuminated arrays');
 assert.equal(t.DICT.get('USLAB000058').unit,'MMHG');assert.equal(t.DICT.get('USLAB000026').unit,'DEG/S');
 t.TM.clear();t.LINK.src='sim';
 // Besuchsfahrzeuge. Ersatz-Manifest (LL2, 20.10.2026): CRS-35 an Harmony Zenit ab 15.10. 14:27 UTC, nachdem Crew-12 abgedockt hatte.
 const crs=t.VV_FALLBACK.find(m=>/CRS-35/.test(m.name)),c12=t.VV_FALLBACK.find(m=>/Crew-12/.test(m.name));
 assert.equal(crs.t0,Date.parse('2026-10-15T14:27:00Z'));assert.equal(crs.port,c12.port,'CRS-35 takes the port Crew-12 vacated');
 assert.ok(Date.parse('2026-10-08T00:00:00Z')>=c12.t1,'Crew-12 departed 7 Oct');
 // Listenantwort von Launch Library 2 wie ausgeliefert (20.10.2026): Die Station steht nur in docking_location.spacestation.
 const ll2=JSON.parse(fs.readFileSync(new URL('./ll2_docking_sample.json',import.meta.url),'utf8'));
 assert.ok(ll2.results.every(e=>!('space_station' in e)),'fixture has the list shape');
 const ev=t.parseDockingEvents(ll2.results);
 assert.equal(ev.length,ll2.results.length-1,'Tiangong event dropped, every ISS event kept');
 const byName=Object.fromEntries(ev.map(e=>[e.name,e]));
 assert.deepEqual([byName['Crew Dragon Grace'].port,byName['Crew Dragon Grace'].type],['ida2','crewDragon'],'Harmony forward = IDA-2');
 assert.deepEqual([byName['Progress MS-35'].port,byName['Progress MS-35'].type],['mrm2','progress'],'Poisk zenith = MRM-2');
 assert.deepEqual([byName['Soyuz MS-29'].port,byName['Soyuz MS-29'].type],['prichal','soyuz']);
 assert.deepEqual([byName['Soyuz MS-28'].port,byName['Soyuz MS-28'].type],['mrm1','soyuz'],'Rassvet nadir = MRM-1');
 assert.deepEqual([byName['Cargo Dragon C211'].port,byName['Cargo Dragon C211'].type],['ida3','cargoDragon']);
 assert.equal(ev.find(e=>/NG-24/.test(e.name)).type,'cygnus');assert.equal(ev.find(e=>/NG-24/.test(e.name)).port,'unityNadir');
 t.setVehicleEvents({events:ll2.results,fetched:Date.now()},'launcher');
 const at=p=>Object.fromEntries(Object.entries(t.vvAt(Date.parse(p))).map(([k,v])=>[k,v.name]));
 const now20map={ida3:'Cargo Dragon C211',ida2:'Crew Dragon Grace',mrm2:'Progress MS-35',prichal:'Soyuz MS-29',smAft:'Progress MS-34'};
 assert.deepEqual(at('2026-10-20T20:00:00Z'),now20map);
 assert.deepEqual(at('2026-06-01T00:00:00Z'),{ida2:'Cargo Dragon C209',ida3:'Crew Dragon Freedom',smAft:'Progress MS-34',unityNadir:'Cygnus CRS NG-24 (S.S. Steven R. Nagel)',mrm2:'Progress MS-33',mrm1:'Soyuz MS-28'},'past state by simulation time');
 // Dieselbe Antwort über den Rückfall: Am 20.10. bleibt kein Fahrzeug unbestimmt.
 const vl=t.VV.list;t.VV.list=null;assert.deepEqual(Object.fromEntries(Object.entries(t.vvAt(Date.parse('2026-10-20T20:00:00Z'))).map(([k,v])=>[k,v.type])),{ida3:'cargoDragon',ida2:'crewDragon',mrm2:'progress',prichal:'soyuz',smAft:'progress'});t.VV.list=vl;
 // Russische Ports: Das Telemetrie-Flag entscheidet die Belegung, LL2 Fahrzeug und Modell.
 const now20=Date.parse('2026-10-20T20:00:00Z');
 for(const [p,v] of [['RUSSEG000019',1],['RUSSEG000017',1],['RUSSEG000014',1],['RUSSEG000018',0]])t.ingest(p,v,NaN,Date.now(),'SIM');
 t.updateVehicles(now20);const vis=Object.entries(t.MODEL.vvG).filter(([,g])=>g.visible).map(([k])=>k).sort();
 assert.deepEqual(vis,['ida2:crewDragon','ida3:cargoDragon','mrm2:progress','prichal:soyuz','smAft:progress']);
 assert.equal(t.MODEL.vvG['mrm2:progress'].userData.label.element.textContent,'Progress MS-35');
 assert.ok(Object.values(t.MODEL.vvCur).every(v=>!v.generic),'no unidentified vehicle');
 t.ingest('RUSSEG000018',1,NaN,Date.now(),'SIM');t.updateVehicles(now20);assert.match(t.MODEL.vvCur.mrm1.name,/not identified/,'flag set, LL2 has no vehicle: generic model, flagged');
 t.ingest('RUSSEG000019',0,NaN,Date.now(),'SIM');t.updateVehicles(now20);assert.equal(t.MODEL.vvG['mrm2:progress'].visible,false,'flag clear: port empty even if LL2 lags');
 t.TM.clear();t.VV.list=null;
 // Abstand: jedes Modell, das ein Port aufnehmen kann, mit der am 14.10. geflogenen Armpose.
 const fx=JSON.parse(fs.readFileSync(new URL('./live_sample_20261014.json',import.meta.url),'utf8'));
 for(const [k,v]of Object.entries(fx))if(typeof v==='number')t.ingest(k,v,NaN,Date.now(),'SIM');
 const L=t.liveJoints();t.applyJoints(L);t.TM.clear();
 for(const pass of [0,1,2]){Object.entries(t.MODEL.vvG).forEach(([k,g])=>{const [port,type]=k.split(':'),types=Object.keys(t.MODEL.vvG).filter(x=>x.startsWith(port+':'));g.visible=types[pass%types.length]===k;});
  assert.equal(new CollisionMonitor(t.MODEL,root).scan().length,0,'vehicle set '+pass+' clears the station and the flown arm pose');}
 Object.values(t.MODEL.vvG).forEach(g=>g.visible=false);
}

// --- Dashboard-Struktur: Das Overlay besitzt jedes Ansichts-Widget; nichts liegt fest positioniert über anderer Oberfläche.
const $=s=>w.document.querySelector(s);
for(const id of ['dataNote','collisionWarning','hint','hudAtt','hudJoint','cmdp','banner','ovCredit'])assert.ok($('#ov').contains($('#'+id)),id+' belongs to the view overlay');
for(const id of ['gutL','gutR','gutM'])assert.equal($('#'+id).getAttribute('role'),'separator');
t.buildPanels();t.initLayout();
// Größenänderung per Tastatur ändert die CSS-Spurgrößen und speichert sie.
const before=t.LAYOUT.lw;$('#gutL').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
assert.equal(t.LAYOUT.lw,before+16);assert.equal(w.document.documentElement.style.getPropertyValue('--lw'),t.LAYOUT.lw+'px');
assert.equal(JSON.parse(w.localStorage.getItem('iss.layout')).lw,t.LAYOUT.lw);
const mh=t.LAYOUT.mh;$('#gutM').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));assert.equal(t.LAYOUT.mh,mh+16,'Map grows when its top edge moves up');
$('#gutM').dispatchEvent(new w.Event('dblclick'));assert.equal(t.LAYOUT.mh,220);
// Eine Karte der Größe null (eingeklappt) darf keinen Fehler werfen.
t.drawMap(t.D);

// --- Kommandofenster: Die Zeitschritt-Bedienung steht ganz oben im Fenster und bleibt außerhalb des Scrollbereichs.
t.enterCmd();
const head=$('#cmdp .cmd-head'),body=$('#cmdp .cmd-body');
assert.ok(head&&body&&head.compareDocumentPosition(body)&w.Node.DOCUMENT_POSITION_FOLLOWING);
for(const id of ['cPause','cWarp','cStep','cClock','cStop','cExit'])assert.ok(head.contains($('#'+id)),id+' in the fixed command header');
assert.ok(!body.contains($('#cWarp')));
assert.deepEqual([...$('#cWarp').querySelectorAll('button')].map(b=>+b.dataset.v),[...t.WARPS]);
$('#cWarp [data-v="300"]').click();assert.equal(t.CMD.warp,300);
// Ein langsames Bild bei 300× (75 simulierte Sekunden) wird zerlegt, statt vom Integrator abgelehnt zu werden.
const t0=t.CMD.sys.time;t.stepCmd(0.25);assert.ok(Math.abs(t.CMD.sys.time-t0-75)<1e-6);
$('#cPause').click();assert.equal(t.CMD.paused,true);assert.equal($('#cStep').disabled,false);
const t1=t.CMD.sys.time;$('#cStep').click();assert.ok(Math.abs(t.CMD.sys.time-t1-10)<1e-6);assert.equal(t.CMD.paused,true);assert.equal(t.CMD.warp,300);
$('#cWarp [data-v="1"]').click();assert.equal(t.CMD.paused,false,'Choosing a time scale resumes');
$('#cMin').click();assert.ok($('#cmdp').classList.contains('min'));assert.ok($('#ov').classList.contains('cmd-min'));$('#cMin').click();
const cw=t.LAYOUT.cw;$('#cmdGrip').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.ok(t.LAYOUT.cw>=cw,'Dragging the left edge left widens the command window');
t.exitCmd();assert.ok(!$('#ov').classList.contains('cmd-open'));
dom.window.close();
console.log('PASS v1.0: live 14 Oct snapshot (conventions vs Sun, flown pose clear, units, timestamp epoch), S3/P3 carriers, Dextre/ERA attachment, full alpha/beta clearance, overlay ownership, splitters, command time header, chunked warp');
