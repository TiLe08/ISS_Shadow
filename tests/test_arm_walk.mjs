// test_arm_walk.mjs: Umsetzen von Canadarm2: Plan -> koordinierte Bewegung -> Greifen -> Lösen, von beiden
// verankerten Enden aus, über die echten Schaltflächen des Dashboards und die Schrittschleife der virtuellen Station.
import fs from 'node:fs';import assert from 'node:assert/strict';import * as THREE from 'three';import{loadTwin}from'./harness.mjs';
import{CollisionMonitor}from'../model-checks.mjs';
const{t,w,dom}=await loadTwin(['buildISS','MODEL','applyJoints','buildPanels','initLayout','enterCmd','exitCmd','CMD','stepCmd','ingest','armWalk','armFreeEndError','fixtureMatrix','armChain','LINK','TM'],{visual:true});const root=t.buildISS();t.buildPanels();t.initLayout();
const live=JSON.parse(fs.readFileSync(new URL('./live_sample_20261014.json',import.meta.url),'utf8'));
for(const [k,v]of Object.entries(live))if(typeof v==='number')t.ingest(k,v,NaN,Date.now(),'SIM');
t.LINK.src='sim';t.enterCmd();t.CMD.radiatorAuto=false;t.CMD.auto=false;
const $=s=>w.document.querySelector(s),mon=new CollisionMonitor(t.MODEL,root);
// armHits: Kollisionen des Arms mit der Station; endAt: Abstand des freien LEE zu einem Greifpunkt.
const armHits=()=>{t.applyJoints(t.CMD.st);return mon.scan().filter(h=>[h.a,h.b].some(o=>/SSRMS|Shoulder|Elbow|Wrist/.test(o.name)));};
const endAt=id=>{t.applyJoints(t.CMD.st);root.updateMatrixWorld(true);
  const free=t.CMD.st.baseEnd===0?t.MODEL.armBase:t.MODEL.armTip;
  return free.getWorldPosition(new THREE.Vector3()).distanceTo(t.MODEL.anchors[id].getWorldPosition(new THREE.Vector3()));};
// Ein komplettes Umsetzen über die Schaltflächen (Plan, Ausführen, Greifen, Lösen) zum Greifpunkt `to`.
async function walk(to){
  $('#armWalkTarget').value=String(to);await t.armWalk('plan');
  assert.ok(t.CMD.armTarget===to,'plan to fixture '+to+' failed: '+$('#armWalkStatus').textContent);
  // Gelenkregler werden abgelehnt, solange beide Enden angedockt sind; auch der MT sperrt. Zuerst: bewegen.
  t.CMD.warp=300;let worst=[];
  for(let i=0;i<400&&(t.CMD.armPlan||Math.max(...t.CMD.st.arm.map((v,k)=>Math.abs(v-t.CMD.sp.arm[k])))>1e-9);i++){t.stepCmd(.25);const h=armHits();if(h.length)worst=h;}
  assert.equal(worst.length,0,'flown path must stay clear: '+worst.map(h=>h.a.name+' / '+h.b.name).join('; '));
  const e=t.armFreeEndError(t.CMD.st,to);assert.ok(e.pos<1e-3&&e.ang<0.05,'free LEE on the fixture: '+e.pos+' m '+e.ang+'°');
  const oldBase=t.CMD.st.baseLoc,oldEnd=t.CMD.st.baseEnd;
  $('#armRelease').click();assert.equal(t.CMD.st.baseLoc,oldBase,'cannot release the base before capturing');
  $('#armCapture').click();assert.equal(t.CMD.st.tipGrapple,to);
  const mt=t.CMD.st.mt;t.CMD.sp.mt=mt+3;const arm=t.CMD.st.arm.slice();t.CMD.sp.arm=arm.map(v=>v+20);t.stepCmd(.25);
  assert.equal(t.CMD.st.mt,mt,'transporter locked while both ends are attached');assert.deepEqual([...t.CMD.st.arm],[...arm],'joints locked while both ends are attached');
  t.CMD.sp.mt=mt;t.CMD.sp.arm=arm.slice();
  $('#armRelease').click();
  assert.equal(t.CMD.st.baseLoc,to);assert.equal(t.CMD.st.baseEnd,oldEnd===5?0:5,'the other LEE becomes the base');
  assert.ok(endAt(oldBase)<2e-3,'after the swap the released LEE still sits on the old fixture (no jump)');
  assert.equal(armHits().length,0);
}
await walk(11);                // Node 2 (LEE B) -> MBS PDGF3 (das echte Umsetzen Mitte Oktober): neue Basis ist LEE A
assert.equal(t.CMD.st.baseEnd,0);
await walk(4);                 // und zurück von der LEE-A-Basis: wieder LEE B an Node 2
assert.equal(t.CMD.st.baseEnd,5);assert.equal(t.CMD.st.baseLoc,4);
// Mit LEE A als Basis wird der Arm außerhalb des Moduls gezeichnet: Das Handgelenk liegt auf der Außenseite des Greifpunkts.
const out=new THREE.Vector3(0,1,0).transformDirection(t.MODEL.anchors[4].matrixWorld);
t.CMD.st.baseEnd=0;t.applyJoints(t.CMD.st);root.updateMatrixWorld(true);
const wrist=t.MODEL.ssrms[6].getWorldPosition(new THREE.Vector3()).sub(t.MODEL.anchors[4].getWorldPosition(new THREE.Vector3()));
assert.ok(wrist.dot(out)>0.3,'LEE-A-based arm must extend out of the fixture, not into the module');t.CMD.st.baseEnd=5;
// Nicht erreichbare Ziele werden mit Begründung abgelehnt, nicht ausgeführt.
$('#armWalkTarget').value='14';await t.armWalk('plan');assert.equal(t.CMD.armPlan,null);assert.match($('#armWalkStatus').textContent,/reach|path/i);
t.exitCmd();dom.window.close();
console.log('PASS Canadarm2 walk-off: planned clear paths, coordinated motion, capture/release from LEE B and LEE A bases, locks while dual-grappled, no jump at base swap, unreachable targets refused');
