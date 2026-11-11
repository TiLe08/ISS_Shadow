// model-checks.mjs: Prüfungen am 3D-Modell der Station.
//
// Enthält:
//   - radiatorTarget(): Zielwinkel für die drehbaren Radiatoren innerhalb ihrer Grenzen.
//   - Kollisionserkennung in zwei Stufen: Grobprüfung über Bounding-Boxen (Sweep-and-Prune,
//     danach orientierte Boxen/OBB) und Feinprüfung per GJK auf konvexen Hüllen.
//   - CollisionMonitor: überwacht die ganze Szene (Anzeige roter Rahmen) und liefert mit
//     armChecker() einen schnellen Prüfer für die Bahnplanung von Canadarm2 und Dextre.
// Koordinaten sind Meter im Stationskörpersystem (three.js-Welt).
import * as THREE from 'three';
import { OBB } from 'three/addons/math/OBB.js';
// Radiator mit begrenztem Drehbereich und zwei nutzbaren Seiten: wählt die gleichwertige Ausrichtung
// (Ziel ± n·180°) innerhalb der Gelenkgrenzen von ±105°, die dem aktuellen Winkel am nächsten liegt.
export function radiatorTarget(goal, current=0) {
  const choices=[];
  for(let n=-5;n<=5;n++){const a=goal+n*180;if(a>=-105&&a<=105)choices.push(a);}
  return choices.sort((a,b)=>Math.abs(a-current)-Math.abs(b-current))[0];
}
/* Exakte Feinprüfung (narrow phase). Orientierte Boxen allein melden zu viel: Ein Modul ist
   ein Zylinder, und unter 45° ragt seine Box um (√2 − 1)·r über die Hülle hinaus, bei einem
   4,4-m-Modul etwa 0,9 m. Alles, was dort montiert ist (Greifvorrichtung an Node 2, Schulter von
   Canadarm2), wurde fälschlich als Kollision gemeldet. Nach dem Box-Test wird deshalb jedes
   Kandidatenpaar per GJK auf den konvexen Hüllen der echten Meshes geprüft (Zylinder, Kegelstümpfe,
   Kugeln, Boxen). Dünne Platten behalten eine Sicherheitshülle von 4 cm. */
// Punktwolke für die konvexe Hülle einer Geometrie: alle eindeutigen Eckpunkte; bei sehr dünnen
// Geometrien (< 4 cm in einer Achse) wird jeder Punkt in dieser Achse um ±2 cm gedoppelt.
// Das Ergebnis wird in geom.userData.hull zwischengespeichert.
function hullOf(geom){
  if(geom.userData.hull)return geom.userData.hull;
  const pos=geom.attributes.position,seen=new Set(),pts=[];
  if(!geom.boundingBox)geom.computeBoundingBox();
  const size=geom.boundingBox.getSize(new THREE.Vector3()),thin=[size.x<.04,size.y<.04,size.z<.04];
  for(let i=0;i<pos.count;i++){
    const v0=[pos.getX(i),pos.getY(i),pos.getZ(i)],key=v0.map(v=>Math.round(v*1e4)).join(',');
    if(seen.has(key))continue;seen.add(key);
    let variants=[v0];
    for(let k=0;k<3;k++)if(thin[k])variants=variants.flatMap(v=>[-.02,.02].map(e=>{const w=v.slice();w[k]=v0[k]+e;return w;}));
    for(const v of variants)pts.push(v[0],v[1],v[2]);
  }
  return geom.userData.hull=new Float32Array(pts);
}
// Konvexe Form für GJK: Hüllpunkte im lokalen System plus aktuelle Weltmatrix des Meshes.
class HullShape{
  constructor(mesh){this.pts=hullOf(mesh.geometry);this.m=mesh.matrixWorld.elements;}
  // Stützfunktion eines affin abgebildeten Körpers M·S: M·s(Mᵀ·d)
  support(d,out){
    const m=this.m,dx=m[0]*d.x+m[1]*d.y+m[2]*d.z,dy=m[4]*d.x+m[5]*d.y+m[6]*d.z,dz=m[8]*d.x+m[9]*d.y+m[10]*d.z,p=this.pts;
    let best=-Infinity,bi=0;for(let i=0;i<p.length;i+=3){const v=p[i]*dx+p[i+1]*dy+p[i+2]*dz;if(v>best){best=v;bi=i;}}
    const x=p[bi],y=p[bi+1],z=p[bi+2];
    return out.set(m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]);
  }
}
const _sa=new THREE.Vector3(),_sb=new THREE.Vector3(),_nd=new THREE.Vector3();
// Punkt der Minkowski-Differenz A − B in Richtung d (Stützpunkt von A minus Gegenstützpunkt von B).
function mink(A,B,d){A.support(d,_sa);B.support(_nd.copy(d).negate(),_sb);return _sa.clone().sub(_sb);}
/* Boolesches GJK: true, wenn sich die konvexen Hüllen von A und B schneiden. */
export function gjkIntersect(A,B,start){
  const d=start&&start.lengthSq()>1e-12?start.clone():new THREE.Vector3(1,0,0);
  const S=[mink(A,B,d)];d.copy(S[0]).negate();
  for(let it=0;it<64;it++){
    if(d.lengthSq()<1e-18)return true;
    const a=mink(A,B,d);if(a.dot(d)<=1e-12)return false;
    S.unshift(a);
    if(simplex(S,d))return true;
  }
  return true;     // keine trennende Richtung gefunden: Körper berühren sich
}
// GJK-Teilfall Linie (2 Punkte): neue Suchrichtung senkrecht zur Strecke auf den Ursprung zu.
// Gibt true zurück, wenn der Ursprung auf der Strecke liegt.
function lineCase(S,d){const a=S[0],b=S[1],ab=b.clone().sub(a),ao=a.clone().negate();
  if(ab.dot(ao)>0)d.copy(ab).cross(ao).cross(ab);else{S.length=1;d.copy(ao);}return d.lengthSq()<1e-18;}
// GJK-Teilfall Dreieck (3 Punkte): bestimmt die Voronoi-Region des Ursprungs, reduziert den
// Simplex entsprechend und setzt die neue Suchrichtung.
function triCase(S,d){
  const a=S[0],b=S[1],c=S[2],ao=a.clone().negate(),ab=b.clone().sub(a),ac=c.clone().sub(a),abc=ab.clone().cross(ac);
  if(abc.clone().cross(ac).dot(ao)>0){
    if(ac.dot(ao)>0){S.length=2;S[1]=c;d.copy(ac).cross(ao).cross(ac);return d.lengthSq()<1e-18;}
    S.length=2;return lineCase(S,d);
  }
  if(ab.clone().cross(abc).dot(ao)>0){S.length=2;return lineCase(S,d);}
  const v=abc.dot(ao);if(Math.abs(v)<1e-15)return true;
  if(v>0)d.copy(abc);else{S[1]=c;S[2]=b;d.copy(abc).negate();}
  return false;
}
// GJK-Simplexschritt: verteilt auf Linie, Dreieck oder Tetraeder. Beim Tetraeder wird geprüft,
// auf welcher Seitenfläche der Ursprung liegt; liegt er innen, schneiden sich die Körper (true).
function simplex(S,d){
  if(S.length===2)return lineCase(S,d);
  if(S.length===3)return triCase(S,d);
  const [a,b,c,e]=S,ao=a.clone().negate(),ab=b.clone().sub(a),ac=c.clone().sub(a),ae=e.clone().sub(a);
  const abc=ab.clone().cross(ac),ace=ac.clone().cross(ae),aeb=ae.clone().cross(ab);
  if(abc.dot(ae)>0)abc.negate();if(ace.dot(ab)>0)ace.negate();if(aeb.dot(ac)>0)aeb.negate();
  if(abc.dot(ao)>0){S.length=3;S[1]=b;S[2]=c;return triCase(S,d);}
  if(ace.dot(ao)>0){S.length=3;S[1]=c;S[2]=e;return triCase(S,d);}
  if(aeb.dot(ao)>0){S.length=3;S[1]=e;S[2]=b;return triCase(S,d);}
  return true;
}
// Feinprüfung zweier Meshes per GJK; Startrichtung ist die Verbindung der beiden Mittelpunkte.
export function meshesIntersect(ma,mb){
  const ca=new THREE.Vector3().setFromMatrixPosition(ma.matrixWorld),cb=new THREE.Vector3().setFromMatrixPosition(mb.matrixWorld);
  return gjkIntersect(new HullShape(ma),new HullShape(mb),ca.sub(cb));
}
// Feinprüfung für zwei Objekte aus scan()/armChecker().
const narrow=(a,b)=>meshesIntersect(a.mesh,b.mesh);
// Kollisionsüberwachung für das Stationsmodell. model.parts liefert die Meshes (ohne die als decor
// markierten Detailteile); root ist die
// Wurzel der Szene. Bewegliche Baugruppen tragen userData.collisionGroup (z. B. 'arm:3',
// 'sarj:P', 'dextre1:2'); alles andere zählt als 'fixed'.
export class CollisionMonitor {
  constructor(model,root){this.model=model;this.root=root;this.helpers=new Map();this.hits=[];this.last=0;}
  // Kollisionsgruppe eines Meshes: die erste collisionGroup auf dem Weg zur Wurzel, sonst 'fixed'.
  group(mesh){
    for(let p=mesh;p&&p!==this.root;p=p.parent)if(p.userData.collisionGroup)return p.userData.collisionGroup;
    return 'fixed';
  }
  /* Merkmale je Objekt für excluded(), einmal pro Objekt berechnet (die String-Tests wären
     der teure Teil, wenn sie für jedes Paar liefen). */
  info(o){
    if(o.gk)return o;
    const n=o.name||'';o.gk=o.group.split(':');
    o.f={sgantBoom:n.includes('SGANT boom'),ku:n.includes('Ku-band SGANT'),sasaMast:n.includes('S-band SASA mast'),sband:n.includes('S-band antenna'),
      torso:n.includes('Dextre torso'),dj12:/Dextre arm [12] joint [12](?:$| )/.test(n),dlee:n.includes('Dextre LEE (base)'),
      contact:/base|LEE B|PDGF|Mobile|rail|Shoulder roll/i.test(n)||/SARJ$/.test(n)};
    return o;
  }
  // true, wenn das Paar a/b absichtlich Kontakt hat und nicht als Kollision zählt: gleiche Gruppe,
  // zwei feste Teile, benachbarte Armglieder, Lager/Welle, Antenne/Mast und ähnliche Paarungen.
  excluded(a,b){
    if(a.group===b.group)return true;
    if(a.group==='fixed'&&b.group==='fixed')return true;
    // Nur das passende Lager bzw. die Halterung und ihre Welle durchdringen sich absichtlich.
    // Radiatorplatten sind NICHT davon ausgenommen, die neue Montagehardware zu treffen.
    if(a.mesh.userData.radiatorMount&&a.mesh.userData.radiatorMount===b.mesh.userData.radiatorAxle)return true;
    if(b.mesh.userData.radiatorMount&&b.mesh.userData.radiatorMount===a.mesh.userData.radiatorAxle)return true;
    this.info(a);this.info(b);const ga=a.gk,gb=b.gk,fa=a.f,fb=b.f;
    if(fa.sgantBoom&&fb.ku||fb.sgantBoom&&fa.ku)return true;
    if(fa.sasaMast&&fb.sband||fb.sasaMast&&fa.sband)return true;
    if(fa.torso&&fb.dj12||fb.torso&&fa.dj12)return true;
    if(fa.dlee&&fb.torso||fb.dlee&&fa.torso)return true;
    if(ga[0]==='arm'&&gb[0]==='arm'&&Math.abs(+ga[1]-+gb[1])<=1)return true;
    if(ga[0]===gb[0]&&ga[0].startsWith('dextre')&&Math.abs(+ga[1]-+gb[1])<=1)return true;
    // Gelenkhülsen, Schienenwagen und Andockflächen berühren sich absichtlich.
    if(fa.contact||fb.contact)return true;
    if((ga[0]==='sarj'&&gb[0]==='bga'||gb[0]==='sarj'&&ga[0]==='bga')&&ga[1]===gb[1])return true;
    return false;
  }
  /* Grobprüfung (broad phase): Sweep-and-Prune entlang x, danach Box-Überlappung;
     Paare aus zwei festen Teilen werden nie geprüft. */
  scan(){
    this.root.updateWorldMatrix(true,true);
    if(!this.cache)this.cache=new Map();
    const objects=[];
    for(const p of this.model.parts){
      if(p.decor)continue;                       // Detailteile haben keinen Kollisionskörper
      let visible=true;for(let n=p.mesh;n;n=n.parent)if(!n.visible){visible=false;break;}
      if(!visible)continue;
      let o=this.cache.get(p.mesh);
      if(!o){
        const g=p.mesh.geometry;if(!g.boundingBox)g.computeBoundingBox();
        const local=g.boundingBox.clone();
        // Dünne Platten bekommen eine physische Dicke; 4 cm dienen als Sicherheitshülle.
        const size=local.getSize(new THREE.Vector3());for(const k of ['x','y','z'])if(size[k]<.04){local.min[k]-=.02;local.max[k]+=.02;}
        o=this.info({mesh:p.mesh,name:p.mesh.userData.name,group:this.group(p.mesh),local,box:new THREE.Box3()});this.cache.set(p.mesh,o);
      }
      o.box.copy(o.local).applyMatrix4(p.mesh.matrixWorld);o.obb=null;
      objects.push(o);
    }
    objects.sort((a,b)=>a.box.min.x-b.box.min.x);
    const hits=[];
    for(let i=0;i<objects.length;i++){const a=objects[i],ax=a.box.max.x;
      for(let j=i+1;j<objects.length;j++){const b=objects[j];if(b.box.min.x>ax)break;
        if(a.group==='fixed'&&b.group==='fixed'||!a.box.intersectsBox(b.box)||this.excluded(a,b))continue;
        if(!a.obb)a.obb=new OBB().fromBox3(a.local).applyMatrix4(a.mesh.matrixWorld);
        if(!b.obb)b.obb=new OBB().fromBox3(b.local).applyMatrix4(b.mesh.matrixWorld);
        if(a.obb.intersectsOBB(b.obb,1e-7)&&narrow(a,b))hits.push({a,b});
      }}
    this.hits=hits;return hits;
  }
  /* Schneller Prüfer für die Bewegungsplanung: alles außer dem Teilbaum `armRoot` bleibt in seiner
     aktuellen Lage eingefroren; jeder Aufruf platziert nur die Armglieder neu. Gibt den Namen des
     ersten überlappenden Paares zurück oder null. */
  armChecker(armRoot,opts={}){
    this.root.updateWorldMatrix(true,true);
    const visible=m=>{for(let n=m;n;n=n.parent)if(!n.visible)return false;return true;};
    const inArm=m=>{for(let p=m;p;p=p.parent)if(p===armRoot)return true;return false;};
    const rec=p=>{const g=p.mesh.geometry;if(!g.boundingBox)g.computeBoundingBox();const local=g.boundingBox.clone();
      const size=local.getSize(new THREE.Vector3());for(const k of ['x','y','z'])if(size[k]<.04){local.min[k]-=.02;local.max[k]+=.02;}
      return {mesh:p.mesh,name:p.mesh.userData.name,group:this.group(p.mesh),local};};
    const place=o=>{o.obb=new OBB().fromBox3(o.local).applyMatrix4(o.mesh.matrixWorld);o.box=o.local.clone().applyMatrix4(o.mesh.matrixWorld);};
    const parts=this.model.parts.filter(p=>!p.decor&&visible(p.mesh)&&!(opts.ignore&&opts.ignore.test(p.mesh.userData.name))).map(rec);
    const arm=parts.filter(o=>inArm(o.mesh)),fixed=parts.filter(o=>!inArm(o.mesh));fixed.forEach(place);
    return()=>{
      armRoot.updateMatrixWorld(true);arm.forEach(place);
      for(const a of arm)for(const b of fixed)if(a.box.intersectsBox(b.box)&&!this.excluded(a,b)&&a.obb.intersectsOBB(b.obb,1e-7)&&narrow(a,b))return a.name+' / '+b.name;
      if(opts.fixedOnly)return null;
      for(let i=0;i<arm.length;i++)for(let j=i+1;j<arm.length;j++){const a=arm[i],b=arm[j];if(a.box.intersectsBox(b.box)&&!this.excluded(a,b)&&a.obb.intersectsOBB(b.obb,1e-7)&&narrow(a,b))return a.name+' / '+b.name;}
      return null;
    };
  }
  /* key: Fingerabdruck der Pose; eine unveränderte Pose wird nicht erneut geprüft.
     Höchstens alle 250 ms; markiert getroffene Teile mit roten BoxHelpern in der Szene. */
  update(now,scene,enabled=true,key=null){
    if(now-this.last<250)return this.hits;
    if(key!==null&&key===this.lastKey&&enabled===this.lastEnabled)return this.hits;
    this.last=now;this.lastKey=key;this.lastEnabled=enabled;
    const hits=enabled?this.scan():[];const marked=new Set(hits.flatMap(h=>[h.a.mesh,h.b.mesh]));
    for(const [mesh,helper]of this.helpers){helper.visible=marked.has(mesh);if(helper.visible)helper.setFromObject(mesh);}
    for(const mesh of marked)if(!this.helpers.has(mesh)){
      const h=new THREE.BoxHelper(mesh,0xff593d);h.material.depthTest=false;h.renderOrder=100;scene.add(h);this.helpers.set(mesh,h);
    }
    return hits;
  }
}
