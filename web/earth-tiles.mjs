// earth-tiles.mjs: Erdkugel aus NASA-GIBS-Kacheln (Blue Marble) für den Fotomodus.
//
// Die Kugel wird als Quadtree aus Kacheln aufgebaut: Stufe 2 (15 Kacheln) liegt lokal in
// assets/earth/2/ und ist immer vorhanden; feinere Stufen bis 7 werden je nach Kamerahöhe und
// Sichtbarkeit nachgeladen (höchstens 4 Downloads gleichzeitig, Cache bis 160 Kacheln).
// Im Radarmodus wird stattdessen nur eine einfarbige Unterlage gezeigt (Küstenlinien kommen
// aus planet-overlay.mjs). Längen in Metern, Erdradius wird übergeben.
import * as THREE from 'three';
// NASA GIBS, Kachelmatrix EPSG:4326 / 500 m: 512 px pro Kachel, 288° Kantenlänge auf Stufe 0.
// Blue Marble ist ein statisches Komposit, kein Live-Bild. Kein API-Schlüssel nötig.
// Geografische Grenzen der Kachel (z = Stufe, y = Zeile, x = Spalte) in Grad.
export const tileBounds=(z,y,x)=>{
  const span=288/2**z,west=-180+x*span,north=90-y*span;
  return {west,east:Math.min(180,west+span),north,south:Math.max(-90,north-span),span};
};
// Kugelsegment für eine Kachel: Gitter aus n × n Vierecken (ca. 0,5° Raster, 8 bis 96),
// UV-Koordinaten für die Kacheltextur, Randschürze und radiale Normalen.
export function tileGeometry(z,y,x,radius){
  const b=tileBounds(z,y,x),n=Math.max(8,Math.min(96,Math.ceil(b.span/.5))),pos=[],uv=[],idx=[];
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const lon=b.west+(b.east-b.west)*i/n,lat=b.north+(b.south-b.north)*j/n;
    const a=lon*Math.PI/180,l=lat*Math.PI/180;
    pos.push(radius*Math.cos(l)*Math.cos(a),radius*Math.cos(l)*Math.sin(a),radius*Math.sin(l));
    uv.push((lon-b.west)/b.span,1-(b.north-lat)/b.span);
  }
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i;idx.push(a,a+n+1,a+1,a+1,a+n+1,a+n+2);}
  // Nach innen gezogene „Schürzen“ schließen T-Fugen zwischen Kacheln unterschiedlicher Auflösung.
  const edge=[...Array.from({length:n+1},(_,i)=>i),...Array.from({length:n},(_,j)=>(j+1)*(n+1)+n),...Array.from({length:n},(_,i)=>n*(n+1)+n-1-i),...Array.from({length:n-1},(_,j)=>(n-1-j)*(n+1))];
  const start=pos.length/3;
  edge.forEach(k=>{pos.push(pos[k*3]*(1-4000/radius),pos[k*3+1]*(1-4000/radius),pos[k*3+2]*(1-4000/radius));uv.push(uv[k*2],uv[k*2+1]);});
  edge.forEach((k,i)=>{const j=(i+1)%edge.length;idx.push(k,start+i,edge[j],edge[j],start+i,start+j);});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);
  // Normalen exakt radial (Kugel), auch für die Schürzen-Vertices. computeVertexNormals()
  // mittelte die Randvertices mit den senkrechten Schürzen-Dreiecken: Die Kachelränder
  // bekamen schräge Normalen, und der Rand-/Tag-Nacht-Term im Shader zeichnete helle Linien
  // und unterschiedlich getönte Kacheln („komische Linien“ im Fotomodus).
  const nrm=new Float32Array(pos.length);for(let i=0;i<pos.length;i+=3){const l=Math.hypot(pos[i],pos[i+1],pos[i+2]);nrm[i]=pos[i]/l;nrm[i+1]=pos[i+1]/l;nrm[i+2]=pos[i+2]/l;}
  g.setAttribute('normal',new THREE.BufferAttribute(nrm,3));g.computeBoundingSphere();return g;
}
// Verwaltet Laden, Zwischenspeichern und Anzeigen der Kacheln.
// group: Erdgruppe in der Szene; material: Shader-Material (Uniforms map, sunDir, rim);
// radius: Erdradius in Metern.
export class EarthTiles {
  constructor(group,material,renderer,radius){
    this.group=group;this.material=material;this.radius=radius;this.loader=new THREE.TextureLoader();this.cache=new Map();this.inflight=0;this.last=0;this.queue=[];this.errors=0;this.max=160;this.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());this.level=2;
    this.mode='photo';this.photoGroup=new THREE.Group();group.add(this.photoGroup);
    this.status=document.createElement('div');this.status.id='earthCredit';this.status.textContent='Earth: loading NASA Blue Marble…';document.body.append(this.status);
  }
  // Kachel aus dem Cache holen oder zum Laden einreihen. Ist der Cache voll, wird die am längsten
  // nicht benutzte Kachel ab Stufe 3 verworfen; ohne freien Platz gibt es null.
  request(z,y,x){
    const id=`${z}/${y}/${x}`;let t=this.cache.get(id);if(t){t.used=performance.now();return t;}
    if(this.cache.size>=this.max){
      const old=[...this.cache.values()].filter(v=>v.z>2&&performance.now()-v.used>1400).sort((a,b)=>a.used-b.used)[0];
      if(!old)return null;
      this.cache.delete(old.id);if(old.mesh){this.photoGroup.remove(old.mesh);old.mesh.geometry.dispose();old.mesh.material.uniforms.map.value.dispose();old.mesh.material.dispose();}
    }
    t={id,z,y,x,used:performance.now(),mesh:null,error:false};this.cache.set(id,t);this.queue.push(t);return t;
  }
  // Arbeitet die Ladewarteschlange ab (max. 4 parallel). Stufe 2 kommt zuerst aus dem lokalen
  // Ordner, sonst/zusätzlich von GIBS; Fehler werden gezählt und in der Statuszeile gemeldet.
  pump(){
    while(this.inflight<4&&this.queue.length){
      const t=this.queue.shift();if(!this.cache.has(t.id))continue;this.inflight++;
      const remote=`https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/${t.id}.jpeg`;
      const done=texture=>{
        if(!this.cache.has(t.id)){texture.dispose();this.inflight--;this.pump();return;}
        texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=this.anisotropy;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
        const mat=this.material.clone();mat.uniforms.sunDir=this.material.uniforms.sunDir;mat.uniforms.rim=this.material.uniforms.rim;mat.uniforms.map.value=texture;
        t.mesh=new THREE.Mesh(tileGeometry(t.z,t.y,t.x,this.radius),mat);t.mesh.renderOrder=t.z;t.mesh.visible=false;this.photoGroup.add(t.mesh);this.inflight--;this.pump();
      };
      const fail=()=>{t.error=true;this.errors++;this.inflight--;this.pump();};
      this.loader.load(t.z===2?`assets/earth/2/${t.y}/${t.x}.jpeg`:remote,done,undefined,()=>{if(t.z===2)this.loader.load(remote,done,undefined,fail);else fail();});
    }
  }
  // Umschalten zwischen 'photo' (Kacheln) und Radarmodus (nur Unterlage).
  setMode(mode){
    this.mode=mode;this.photoGroup.visible=mode==='photo';
    // Einfarbige Unterlage: die grobe schematische Textur nie mit Fotokacheln mischen.
    if(!this.underlay){this.material.uniforms.map.value.dispose();this.underlay=new THREE.DataTexture(new Uint8Array(this.underlayRGB||[10,24,32,255]),1,1);this.underlay.colorSpace=THREE.SRGBColorSpace;this.underlay.needsUpdate=true;}
    if(this.material.uniforms.map.value!==this.underlay)this.material.uniforms.map.value=this.underlay;
  }
  /* Ozeanfarbe im Radarmodus aus dem aktiven Farbschema ([r,g,b], 0-255). */
  setUnderlay(rgb){this.underlayRGB=[...rgb,255];if(this.underlay){this.underlay.image.data.set(this.underlayRGB);this.underlay.needsUpdate=true;}}
  // Pro Bild aufgerufen, rechnet aber höchstens alle 500 ms: bestimmt aus Kamerahöhe und
  // Bildschirmauflösung die nötige Detailstufe, besucht den Quadtree ab den Grundkacheln und
  // macht genau eine Ebene pro Ast sichtbar (Kinder erst, wenn alle vier geladen sind).
  update(camera,now){
    if(this.mode!=='photo'){this.status.textContent='Earth radar · Natural Earth vector coastlines / boundaries';return;}
    if(now-this.last<500)return;this.last=now;this.group.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);
    const inverse=this.group.matrixWorld.clone().invert(),eye=camera.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse),dist=eye.length();
    const alt=Math.max(10000,dist-this.radius),mpp=2*alt*Math.tan(camera.fov*Math.PI/360)/Math.max(600,innerHeight);
    this.level=Math.max(2,Math.min(7,Math.ceil(Math.log2(62617/Math.max(1,mpp)))));
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const direction=eye.clone().normalize();const wanted=new Set();
    for(const t of this.cache.values())if(t.mesh)t.mesh.visible=false;
    const onScreen=(z,y,x)=>{
      const b=tileBounds(z,y,x),lat=(b.north+b.south)/2*Math.PI/180,lon=(b.west+b.east)/2*Math.PI/180;
      const center=new THREE.Vector3(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat));
      const half=Math.min(Math.PI,b.span*Math.PI/180*.8);
      return center.dot(direction)>=Math.cos(Math.acos(Math.min(1,this.radius/dist))+half)&&frustum.intersectsSphere(new THREE.Sphere(center.multiplyScalar(this.radius).applyMatrix4(this.group.matrixWorld),2*this.radius*Math.sin(half/2)));
    };
    const visit=t=>{
      if(!t)return;wanted.add(t.id);t.used=performance.now();
      if(!t.mesh)return;
      let children=[];
      if(t.z<this.level&&onScreen(t.z,t.y,t.x)){
        for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
          const y=2*t.y+dy,x=2*t.x+dx,b=tileBounds(t.z+1,y,x);
          if(b.west<180&&b.north>-90)children.push(this.request(t.z+1,y,x));
        }
      }
      // Eltern-Kachel wird nur als Ganzes ersetzt: Eltern und Kinder werden NIE übereinander gezeichnet.
      if(children.length&&children.every(c=>c?.mesh)){children.forEach(visit);}
      else {t.mesh.visible=true;for(const c of children)if(c)wanted.add(c.id);}
    };
    // Erst alle Grundkacheln (Stufe 2, 5 × 3) anfordern, dann feinere Nachkommen.
    const roots=[];for(let y=0;y<3;y++)for(let x=0;x<5;x++)roots.push(this.request(2,y,x));roots.forEach(visit);
    this.queue.sort((a,b)=>a.z-b.z);this.pump();
    const ready=[...this.cache.values()].filter(t=>t.mesh&&t.mesh.visible).length;
    this.status.textContent=`NASA Blue Marble · static composite · detail ${this.level}/7 · ${ready} patches${this.errors?' · some detail unavailable; lower resolution retained':''}`;
  }
}
