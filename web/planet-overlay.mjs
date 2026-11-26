// planet-overlay.mjs: Vektor-Overlay der Erde für den Radarmodus und Ortsbeschriftungen.
// Daten: assets/earth/boundaries.json (Linienzüge und Orte mit Einwohnerzahl als Rangfolge).
import * as THREE from 'three';
// Punkt auf der Kugel mit Radius r (Meter) aus Länge/Breite in Grad, erdfestes System (z = Nordpol).
const point=(lon,lat,r)=>{const a=lon*Math.PI/180,b=lat*Math.PI/180;return new THREE.Vector3(r*Math.cos(b)*Math.cos(a),r*Math.cos(b)*Math.sin(a),r*Math.sin(b));};
/* Erd-Overlay im Radarstil (Gradnetz, Küstenlinien und Grenzen aus Natural Earth) und
   Ortsbeschriftungen. Die Position der Beschriftungen folgt der Kamera in jedem Bild (nur eine
   CSS-Transformation, kein Layout); welche Beschriftungen sichtbar sind, wird 5-mal pro Sekunde
   entschieden (Horizont, Bildrand, Überlappung). */
export class PlanetOverlay {
  // earth: Erdgruppe in der Szene; radius: Erdradius in Metern; container: HTML-Element für
  // die Beschriftungen. Baut das 15°-Gradnetz sofort und lädt Küsten/Grenzen asynchron nach.
  constructor(earth,radius,container){
    this.earth=earth;this.radius=radius;this.container=container;this.group=new THREE.Group();earth.add(this.group);this.labels=[];this.shown=[];this.last=0;
    this.size={w:0,h:0};this.blockers=()=>[];
    this.inv=new THREE.Matrix4();this.v=new THREE.Vector3();this.eye=new THREE.Vector3();
    const grid=[];
    for(let lat=-75;lat<=75;lat+=15)for(let lon=-180;lon<180;lon++)grid.push(...point(lon,lat,radius+300).toArray(),...point(lon+1,lat,radius+300).toArray());
    for(let lon=-180;lon<180;lon+=15)for(let lat=-90;lat<90;lat++)grid.push(...point(lon,lat,radius+300).toArray(),...point(lon,lat+1,radius+300).toArray());
    this.gridLines=this.lines(grid,0x16576c,.45);
    fetch('assets/earth/boundaries.json').then(r=>{if(!r.ok)throw Error('Boundary data unavailable');return r.json();}).then(data=>{
      const coords=[];for(const ring of data.lines)for(let i=1;i<ring.length;i++){
        const a=point(...ring[i-1],radius+700),b=point(...ring[i],radius+700);
        const steps=Math.max(1,Math.ceil(a.angleTo(b)*180/Math.PI/.5));let prev=a;
        for(let j=1;j<=steps;j++){const next=a.clone().lerp(b,j/steps).normalize().multiplyScalar(radius+700);coords.push(...prev.toArray(),...next.toArray());prev=next;}
      }
      this.coastLines=this.lines(coords,this.coastColor??0x48d8ef,.9);
      for(const [name,lon,lat,pop]of data.labels.sort((a,b)=>b[3]-a[3])){
        const el=document.createElement('span');el.className='planet-label';el.textContent=name;el.hidden=true;container.append(el);
        this.labels.push({el,p:point(lon,lat,radius+1500),pop,w:Math.min(180,name.length*7+10),on:false});
      }
    }).catch(e=>{this.error=e.message;});
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{this.size={w:container.clientWidth,h:container.clientHeight};}).observe(container);
  }
  // Erzeugt ein LineSegments-Objekt aus einer flachen Koordinatenliste (Paare von Punkten).
  lines(coords,color,opacity){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));const m=new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false});const l=new THREE.LineSegments(geo,m);this.group.add(l);return l;}
  /* Farben des aktiven Farbschemas (CSS-Farbangaben). */
  setColors(grid,coast){
    if(grid)this.gridLines.material.color.set(grid);
    if(coast){this.coastColor=new THREE.Color(coast).getHex();if(this.coastLines)this.coastLines.material.color.set(coast);}
  }
  // Bildschirmposition (Pixel) einer Beschriftung oder null, wenn sie außerhalb des Bildes liegt.
  project(l,camera){
    const v=this.v.copy(l.p).applyMatrix4(this.earth.matrixWorld).project(camera);
    if(v.z<-1||v.z>1||Math.abs(v.x)>.96||Math.abs(v.y)>.96)return null;
    return {x:(v.x+1)*this.size.w/2,y:(1-v.y)*this.size.h/2};
  }
  // radar: Overlay-Linien zeigen; labels: Beschriftungen zeigen; now: Zeit in ms.
  // Höchstens 28 Beschriftungen, nach Einwohnerzahl, nur vor dem Horizont und ohne Überlappung mit
  // anderen Beschriftungen oder Bedienelementen (this.blockers liefert deren Rechtecke).
  update(camera,radar,labels,now){
    this.group.visible=radar;this.container.hidden=!labels;
    if(!labels){if(this.shown.length){this.shown.forEach(l=>{l.el.hidden=true;l.on=false;});this.shown=[];}return;}
    if(!this.size.w){this.size={w:this.container.clientWidth,h:this.container.clientHeight};}
    this.earth.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);
    const r2=this.radius*this.radius+1000*this.radius;
    this.eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this.inv.copy(this.earth.matrixWorld).invert());
    if(now-this.last>=200){                       // auswählen, welche Beschriftungen gezeigt werden
      this.last=now;const occupied=this.blockers().map(b=>({x:(b.left+b.right)/2,y:(b.top+b.bottom)/2,w:b.right-b.left,h:b.bottom-b.top}));
      const next=[];
      for(const l of this.labels){
        if(next.length>=28)break;
        if(l.p.dot(this.eye)<=r2)continue;
        const s=this.project(l,camera);if(!s)continue;
        if(occupied.some(o=>Math.abs(o.x-s.x)<(o.w+l.w)/2+10&&Math.abs(o.y-s.y)<((o.h||14)+14)/2+6))continue;
        occupied.push({x:s.x,y:s.y,w:l.w,h:14});next.push(l);
      }
      for(const l of this.shown)if(!next.includes(l)){l.el.hidden=true;l.on=false;}
      this.shown=next;
    }
    // Jedes Bild: der Kamera folgen (nur Transform schreiben, kein Layout lesen).
    for(const l of this.shown){
      const s=l.p.dot(this.eye)>r2?this.project(l,camera):null;
      if(!s){if(l.on){l.el.hidden=true;l.on=false;}continue;}
      l.el.style.transform=`translate3d(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px,0) translate(-50%,-50%)`;
      if(!l.on){l.el.hidden=false;l.on=true;}
    }
  }
}
