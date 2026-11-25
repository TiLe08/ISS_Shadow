// test_sun_event.mjs: Countdown bis zum Sonnenaufgang/-untergang an der Station (nextSunEvent).
// Prüft gegen dichtes Abtasten derselben Schattenfunktion: Das Ereignis liegt auf 1 s genau am
// Umschlag von inShadow(), davor schlägt nichts um, und Schatten- und Sonnenphase haben bei
// ISS-Bahnen die bekannten Längen (Schatten ~31-37 min, Umlauf ~92 min). Außerdem: Bei hohem
// Beta-Winkel (Bahnebene fast senkrecht zur Sonne) gibt es keinen Schatten -> null.
import assert from 'node:assert/strict';import{loadTwin}from'./harness.mjs';
const{t,w,dom}=await loadTwin(['nextSunEvent','inShadow','sunEci','propagate','simInitOrbit','lvlhBasis','buildISS','buildPanels','updatePanels','D','fmtClock','SUNEV','sunEventFor']);
const lit=(s,ms)=>!t.inShadow(s,t.sunEci(ms));
const T0=Date.UTC(2026,10,25,10,0,0);
let s=t.simInitOrbit(T0),ms=T0;
assert.equal(t.fmtClock(754),'12:34');assert.equal(t.fmtClock(3725),'1:02:05');assert.equal(t.fmtClock(-3),'0:00');
const evs=[];
for(let k=0;k<5;k++){
  const ev=t.nextSunEvent(s,ms);assert.ok(ev,'event found');
  const l0=lit(s,ms);assert.equal(ev.sunrise,!l0,'sunrise exactly when currently in shadow');
  // kein Umschlag vor dem Ereignis (Abtastung 5 s), Umschlag innerhalb 1 s danach
  const dt=(ev.at-ms)/1000;let st=s;
  for(let x=5;x<dt-1;x+=5){assert.equal(lit(t.propagate(s,x),ms+x*1000),l0,`no flip at +${x} s before event at +${dt.toFixed(1)} s`);}
  assert.equal(lit(t.propagate(s,dt-1),ev.at-1000),l0,'still old state 1 s before');
  assert.notEqual(lit(t.propagate(s,dt+0.5),ev.at+500),l0,'new state 0.5 s after');
  evs.push(ev);s=t.propagate(s,dt+1);ms=ev.at+1000;
}
const durs=evs.slice(1).map((e,i)=>(e.at-evs[i].at)/60000);
for(let i=0;i<durs.length;i++){const shadow=!evs[i].sunrise;   // nach einem Untergang folgt Schatten
  if(shadow)assert.ok(durs[i]>25&&durs[i]<38,'shadow phase '+durs[i].toFixed(1)+' min');else assert.ok(durs[i]>54&&durs[i]<70,'sunlit phase '+durs[i].toFixed(1)+' min');}
const per=durs[0]+durs[1];assert.ok(per>90&&per<94,'one orbit '+per.toFixed(1)+' min');
// Hoher Beta-Winkel: Bahn senkrecht zur Sonne -> Dauersonne, kein Ereignis.
const sun=t.sunEci(T0),r=6790,v=Math.sqrt(398600.4418/r);
const a=new w.THREE.Vector3(0,0,1).cross(sun).normalize(),b=sun.clone().cross(a).normalize();   // a,b senkrecht zur Sonne
const sHi=[...a.clone().multiplyScalar(r).toArray(),...b.clone().multiplyScalar(v).toArray()];
assert.equal(t.nextSunEvent(sHi,T0),null,'beta 90 deg: continuous sunlight');
// Zwischenspeicher: gleicher Zustand -> gleiches Ergebnis ohne Neuberechnung, nach dem Ereignis neu.
const s1=t.simInitOrbit(T0),e1=t.sunEventFor(s1,T0);assert.equal(t.sunEventFor(t.propagate(s1,10),T0+10000),e1,'cached');
const after=t.sunEventFor(t.propagate(s1,(e1.at-T0)/1000+2),e1.at+2000);assert.ok(after&&after.at>e1.at&&after.sunrise!==e1.sunrise,'recomputed after the event');
dom.window.close();
console.log(`PASS sun event: ${evs.length} transitions at <1 s, shadow ${durs.filter((_,i)=>!evs[i].sunrise).map(d=>d.toFixed(1)).join('/')} min, sunlit ${durs.filter((_,i)=>evs[i].sunrise).map(d=>d.toFixed(1)).join('/')} min, orbit ${per.toFixed(1)} min`);
