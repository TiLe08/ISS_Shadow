// test_virtual_station.js: Physik der virtuellen Station (virtual-station.js): Düsen, Momente,
// freies Driften, Pulse, Treibstoff, Bahnanhebung, Batterieenergie, Stromausfall, Kreiselgrenzen,
// Luftschleuse, Lebenserhaltung, Langzeitstabilität und Lageregelung aus großen Abweichungen.
const assert=require('node:assert/strict');
const {Station,JETS,cross,rotate}=require('../virtual-station.js');
const env={illumination:Array(8).fill(1),sunIncidence:Array(8).fill(1),radiator:[1,1],radius:6790};
// approx: Gleichheit mit Toleranz; free(): Station ohne Drehimpuls und Gravitationsgradient im freien Flug.
const approx=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
function free(){const s=new Station({momentum:0});s.mode='free';s.gravityGradient=false;return s;}
// Einzelne Düsen erzeugen vorzeichenrichtige Kraft und Moment und verbrauchen endlich Treibstoff.
for(let i=0;i<JETS.length;i++){
 const s=free();assert.equal(s.command('jet.'+i+'.manual',true).ok,false);s.command('arm',true);s.command('jet.'+i+'.manual',true);s.step(.25,env);
 const j=JETS[i],f=j.dir.map(v=>v*j.thrust),torque=cross(j.r,f);
 f.forEach((x,k)=>approx(s.force[k],x));torque.forEach((x,k)=>approx(s.torque[k],x));
 assert.ok(s.omega[j.axis]*j.sign>0);assert.ok(s.prop.fuel<800);approx(Math.hypot(...s.q),1);
 s.command('allStop',true);s.step(.25,env);assert.equal(s.force.every(x=>x===0),true);
}
// Ein ausgeglichenes RCS-Paar dreht, ohne zu verschieben; abgeschaltete Regelung erhält den Drall.
const s=free();s.command('arm',true);s.command('jet.0.manual',true);s.command('jet.1.manual',true);s.step(1,env);approx(Math.hypot(...s.force),0);assert.ok(s.omega[0]>0);
s.command('allStop',true);const wx=s.omega[0];s.step(10,env);approx(s.omega[0],wx);
// Ein Puls dauert eine SIM-Sekunde, unabhängig von der Schrittaufteilung.
const p=free();p.command('arm',true);p.command('jet.0.pulse',1);p.step(2,env);approx(800-p.prop.fuel,130/(220*9.80665),1e-9);assert.equal(p.prop.jets[0].duty,0);
// Bei leerem Tank kann kein voller Schritt Schub mehr entstehen.
const empty=free();empty.prop.fuel=.0001;empty.mass=empty.dryMass+empty.prop.fuel;empty.command('arm',true);empty.command('engine.0.manual',true);empty.step(1,env);assert.equal(empty.prop.fuel,0);approx(Math.hypot(...empty.force),0);
const burn=free();burn.command('arm',true);burn.command('reboost',.01);burn.step(10,env);assert.equal(burn.prop.burn,null);approx(burn.prop.dv,.01,1e-7);
// Ungleiche Batteriezustände müssen auch nahe leer/voll die Energiebilanz einhalten.
const power=free();power.environment='eclipse';power.power.channels.forEach((c,i)=>c.soc=i===0?.000001:.4);
let before=power.power.channels.reduce((a,c)=>a+c.soc*10,0);power.step(.25,env);let after=power.power.channels.reduce((a,c)=>a+c.soc*10,0);
approx((before-after)*3600*.92/.25,power.power.batteryKW,1e-7);
power.command('scenario','blackout');power.step(.25,env);assert.equal(power.power.bus,0);assert.equal(power.online,0);assert.ok(power.alarms.some(x=>x.includes('Power shortage')));
// CMG-Moment und gespeicherter Drehimpuls sind begrenzt; Rotoren laufen allmählich aus.
const c=new Station({momentum:0});c.gravityGradient=false;c.target=[Math.cos(.05),Math.sin(.05),0,0];c.step(120,env);
for(const g of c.cmg){assert.ok(Math.hypot(...g.h)<=4760+1e-6);assert.ok(Math.hypot(...g.torque)<=258+1e-6);}
assert.ok(c.omega[0]>0);c.command('cmg.0.motor',false);c.step(1,env);assert.ok(c.cmg[0].rpm<6600&&c.cmg[0].rpm>6500);
// Druckverriegelungen und Verbrauchsgüter reagieren auf den Regelungszustand.
const life=free();assert.equal(life.command('airlock.outer',true).ok,false);assert.equal(life.command('airlock.vent',true).ok,true);
for(let i=0;i<3;i++)life.step(120,env);assert.equal(life.command('airlock.outer',true).ok,true);assert.equal(life.command('airlock.repress',true).ok,false);
life.command('life.oga',false);life.command('life.cdra',false);const oxygen=life.life.o2,co2=life.life.co2;life.step(120,env);assert.ok(life.life.o2<oxygen&&life.life.co2>co2);
assert.equal(life.command('life.crew',-1).ok,false);assert.equal(life.command('nonsense',true).ok,false);
// Langlauf: alle Zustände endlich, normierte Lage und keine negativen Vorräte.
const long=new Station();for(let i=0;i<100;i++)long.step(120,env);
// Prüft, dass alle Zahlen im Zustand endlich sind.
function finite(o){if(typeof o==='number')assert.ok(Number.isFinite(o));else if(o&&typeof o==='object')Object.values(o).forEach(finite);}
finite(long.snapshot());approx(Math.hypot(...long.q),1);assert.ok(long.prop.fuel>=0&&long.life.water>=0&&long.power.channels.every(c=>c.soc>=0&&c.soc<=1));
console.log('PASS virtual physics: 12 jets, balanced torque, free drift, pulses, fuel, target burn, battery energy, blackout, gyro limits, airlock, life support and long-run stability');
// Regression: große Sollwerte müssen sich einschwingen, statt die CMGs zu sättigen und zu taumeln.
for(const axis of [0,1,2]){
 const a=new Station();a.gravityGradient=false;a.target=[Math.cos(Math.PI/12),...Array.from({length:3},(_,i)=>i===axis?Math.sin(Math.PI/12):0)];
 for(let i=0;i<180;i++)a.step(120,env);
 const alignment=Math.abs(a.target.reduce((n,v,i)=>n+v*a.q[i],0));assert.ok(alignment>1-1e-8);assert.ok(Math.hypot(...a.omega)<1e-7);
}
const tumble=new Station();tumble.omega=[.002,-.001,.0015];assert.equal(tumble.command('dampRates',true).ok,true);
for(let i=0;i<50;i++)tumble.step(120,env);assert.ok(Math.hypot(...tumble.omega)<1e-7);assert.ok(tumble.prop.fuel>0&&tumble.prop.fuel<800);
tumble.omega=[.01,.02,.03];tumble.command('resetMotion',true);assert.deepEqual(tumble.omega,[0,0,0]);assert.equal(tumble.momentum,0);assert.equal(tumble.prop.armed,false);
console.log('PASS recovery: 30° capture on all axes, tumbling recovery, momentum unloading and explicit motion reset');
// Triebwerksanordnung: Jede Düse und beide Haupttriebwerke sitzen am Heck von Swesda (wo die
// Triebwerke der echten Station sind); jedes Düsenpaar erzeugt ein Moment um seine eigene Achse mit
// richtigem Vorzeichen; Rollpaare sind reine Kräftepaare; Haupttriebwerke schieben nach +X (Anhebung).
{const {ENGINES}=require('../virtual-station.js');
 for(const j of JETS)assert.ok(j.r[0]<-34,'jet '+j.id+' on Zvezda aft');
 for(const e of ENGINES){assert.ok(e.r[0]<-35);assert.deepEqual(e.dir,[1,0,0]);}
 for(const axis of [0,1,2])for(const sign of [1,-1]){
  const pair=JETS.filter(j=>j.axis===axis&&j.sign===sign);assert.equal(pair.length,2);
  const tq=pair.map(j=>cross(j.r,j.dir.map(x=>x*j.thrust))).reduce((a,b)=>a.map((x,i)=>x+b[i]));
  assert.ok(Math.sign(tq[axis])===sign&&tq.every((x,i)=>i===axis||Math.abs(x)<1e-9),'pair '+axis+'/'+sign+' torque '+tq);
  if(axis===0)assert.ok(pair.map(j=>j.dir).reduce((a,b)=>a.map((x,i)=>x+b[i])).every(x=>Math.abs(x)<1e-12),'roll pair is a couple');}}
console.log('PASS thrusters: jets and engines on Zvezda aft, pair torques signed per axis, roll couples, engines push +X');
