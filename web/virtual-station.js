/* virtual-station.js: Physikmodell der virtuellen ISS ("digitaler Klon").

   Wird im Kommandomodus von iss_twin.html benutzt: Dort steuert man nicht die echte
   Station, sondern dieses Modell. Es koppelt Lage (Quaternion, Drehraten, Trägheit),
   Kreiselstabilisatoren (CMG), Lagetriebwerke und Haupttriebwerke, Stromversorgung
   (8 Solarkanäle mit Batterien), Thermalhaushalt (2 Kühlkreise), Lebenserhaltung
   (O2, CO2, Wasser, Urin) und die Luftschleuse.

   Einheiten: intern SI (m, kg, s, N, N*m, rad), außer wo ausdrücklich anders
   angegeben (Leistung in kW, Tankinhalte in kg bzw. Prozent).
   Quellen: CMG-Kennwerte aus NASA NTRS 20100021932 (4760 N*m*s je CMG, 258 N*m).
   Alle anderen Geräteparameter und die Triebwerksanordnung sind einstellbare
   ingenieurmäßige Näherungen, keine Flugsoftware.

   Die Datei ist ein "UMD"-Modul: Im Browser legt sie window.VirtualStation an,
   unter Node.js (Tests) wird sie per require() geladen. */
(function(root) {
  'use strict';
  // Kleine Vektor-Helfer (Arrays [x,y,z]): Begrenzen, Betrag, Summe, Skalierung.
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), norm=v=>Math.hypot(...v);
  const add=(a,b)=>a.map((x,i)=>x+b[i]), scale=(v,s)=>v.map(x=>x*s);
  // Kreuzprodukt.
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  // Skalarprodukt und Einheitsvektor.
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0), unit=v=>scale(v,1/(norm(v)||1));
  // Quaternionen als [w,x,y,z]: Produkt, Konjugierte und Drehung eines Vektors (Körper -> LVLH).
  const qmul=(a,b)=>[a[0]*b[0]-dot(a.slice(1),b.slice(1)),...add(add(scale(b.slice(1),a[0]),scale(a.slice(1),b[0])),cross(a.slice(1),b.slice(1)))];
  const conj=q=>[q[0],-q[1],-q[2],-q[3]];
  const rotate=(q,v)=>qmul(qmul(q,[0,...v]),conj(q)).slice(1);
  // Vektor auf eine Höchstlänge kürzen.
  const limit=(v,max)=>norm(v)>max?scale(v,max/norm(v)):v;
  // Die acht Solarflügel-Kanäle (Reihenfolge wie in iss_twin.html).
  const CHANS=['1A','3A','1B','3B','2A','4A','2B','4B'];
  // Lagetriebwerke: je Achse (Rollen, Nicken, Gieren) und Richtung zwei Düsen, insgesamt 12.
  const JETS=[];
  // Lagetriebwerke dort, wo die echten sitzen: am hinteren Abschnitt von Swesda
  // (x = -34,9 m, ca. 2 m neben der Achse, Lage nach dem IGOAL-Modell; das US-Segment hat keine Triebwerke).
  // Rollen wird mit Kräftepaaren erzeugt (keine Nettokraft); für Nicken und Gieren feuern beide
  // Düsen eines Paares gleichsinnig und schieben die Station dabei, wie in echt, leicht seitlich.
  const AFT=-34.9, R=2.0;
  for (let axis=0;axis<3;axis++) for (const sign of [1,-1]) for (const side of [1,-1]) {
    let r,dir;
    if(axis===0){r=[AFT,side*R,0];dir=[0,0,side*sign];}            // Rollen: tau_x = y*Fz
    else if(axis===1){r=[AFT,side*R,0];dir=[0,0,sign];}             // Nicken: tau_y = -x*Fz
    else {r=[AFT,0,side*R];dir=[0,-sign,0];}                        // Gieren: tau_z = x*Fy
    JETS.push({id:'RCS'+String(JETS.length+1).padStart(2,'0'),axis,sign,r,dir,thrust:130,
      label:['Roll','Pitch','Yaw'][axis]+(sign>0?' +':' −')+' / '+(side>0?'A':'B')});
  }
  // Die zwei Haupttriebwerke von Swesda (KDU, je ca. 3,07 kN) am Heck, Schub nach vorne (+X).
  const ENGINES=[{id:'MAIN1',r:[-35.7,0.6,0],dir:[1,0,0],thrust:3070},{id:'MAIN2',r:[-35.7,-0.6,0],dir:[1,0,0],thrust:3070}];
  // Die virtuelle Station. Alle Zustände sind öffentliche Felder, damit die Oberfläche sie
  // anzeigen und Tests sie prüfen können.
  class Station {
    // Startzustand. seed übernimmt, soweit vorhanden, Werte aus der echten Telemetrie
    // (Masse, Lage, CMG-Drehimpuls, Kabinenatmosphäre, Tankstände), damit der Klon dort
    // weitermacht, wo die echte Station gerade ist.
    constructor(seed={}) {
      const value=(k,d,a=-Infinity,b=Infinity)=>Number.isFinite(seed[k])?clamp(seed[k],a,b):d;
      this.time=0; this.mass=value('mass',450000,100000,1000000); this.dryMass=this.mass-800;
      this.inertia=[8.5e7,1.3e8,1.4e8]; this.q=unit(seed.q?.length===4?seed.q:[1,0,0,0]);
      this.omega=[0,0,0]; this.target=this.q.slice(); this.mode='hold'; this.sensor=true;
      this.gravityGradient=true; this.disturbance=[0,0,0]; this.gyroTorque=[0,0,0];
      this.cmg=Array.from({length:4},(_,i)=>({motor:true,enabled:true,fault:false,
        rpm:value('rpm'+i,6600,0,6600),temperature:value('cmgTemp'+i,45,0,100),
        h:[0,0,4760*value('momentum',22,0,95)/100],torque:[0,0,0]}));
      this.prop={armed:false,fuel:800,isp:220,mainIsp:300,unload:false,burn:null,dv:0,
        jets:JETS.map(()=>({enabled:true,manual:false,pulse:0,fault:false,duty:0})),
        engines:ENGINES.map(()=>({enabled:true,manual:false,fault:false,duty:0}))};
      this.power={channels:CHANS.map(()=>({enabled:true,battery:true,fault:false,soc:.75,kw:0})),
        payload:true,payloadKW:20,generation:0,demand:0,served:0,batteryKW:0,bus:1};
      this.thermal={loops:[0,1].map(()=>({pump:true,valve:1,temperature:20,flow:0,reject:0})),
        cabin:value('temperature',22,5,40),target:22,heat:0,cooling:0};
      this.life={crew:7,oga:true,ogaRate:6,cdra:true,upa:true,wpa:true,fan:true,o2Valve:false,
        o2:value('o2',21.1,0,35),co2:value('co2',.4,0,10),n2:79.5,o2Reserve:20,
        urine:value('urine',34,0,100),waste:value('waste',42,0,100),water:value('water',183,0,300),
        leak:0,o2Production:0,co2Removal:0,upaFlow:0,wpaFlow:0};
      this.airlock={pressure:101.3,inner:false,outer:false,vent:false,repress:false};
      this.drives={sarjP:true,sarjS:true,trrjP:true,trrjS:true,arm:true,mt:true,ku:true,dextre:true,sband:true,radiatorDeploy:true,
        beta:CHANS.map(()=>true),grapple:false};
      this.comms={ku:true,sband:true,gps1:true,gps2:true};
      this.environment='auto'; this.force=[0,0,0]; this.torque=[0,0,0]; this.alarms=[];
      this.lastEnv={illumination:CHANS.map(()=>1),radiator:[1,1],radius:6790};
    }
    // Ein Bedienbefehl aus der Oberfläche, z. B. ('mode','hold'), ('arm',true),
    // ('reboost',1.0), ('jet.3.pulse',2). Prüft die Voraussetzungen wie ein Flugregelwerk
    // und liefert {ok, reason}; bei Fehlern wird nichts verändert.
    command(action,value) {
      const bool=typeof value==='boolean'; const n=Number(value);
      const numeric=(lo,hi)=>Number.isFinite(n)&&n>=lo&&n<=hi;
      const parts=action.split('.');
      const set=(obj,key)=>{if(!bool)throw Error('Expected an on/off value');obj[key]=value;};
      try {
        if(action==='mode') {if(!['hold','cmg','rcs','free','damp'].includes(value))throw Error('Unknown control mode');this.mode=value;}
        else if(action==='arm') {set(this.prop,'armed');if(!value)this.stopThrust();}
        else if(action==='unload') set(this.prop,'unload');
        else if(action==='sensor') set(this,'sensor');
        else if(action==='gravity') set(this,'gravityGradient');
        else if(action==='allStop') this.stopThrust();
        else if(action==='safe') {this.stopThrust();this.mode='hold';this.target=this.q.slice();this.power.payload=false;this.drives.arm=false;this.drives.mt=false;}
        else if(action==='dampRates') {this.stopThrust();this.prop.armed=true;this.prop.unload=true;this.mode='damp';this.target=this.q.slice();this.sensor=true;}
        else if(action==='resetMotion') {this.stopThrust();this.omega=[0,0,0];this.cmg.forEach(c=>{c.h=[0,0,0];c.torque=[0,0,0];});this.gyroTorque=[0,0,0];this.torque=[0,0,0];this.target=this.q.slice();this.mode='hold';}
        else if(action==='holdHere') {this.target=this.q.slice();this.mode='hold';}
        else if(action==='environment') {if(!['auto','sun','eclipse'].includes(value))throw Error('Unknown environment');this.environment=value;}
        else if(action==='reboost') {
          if(!numeric(.01,10))throw Error('Target must be 0.01-10 m/s');
          if(!this.prop.armed)throw Error('Arm propulsion first');
          if(this.prop.fuel<=0)throw Error('No virtual propellant');
          if(!this.prop.engines.some(e=>e.enabled&&!e.fault))throw Error('No available main engine');
          this.prop.burn={target:n,done:0};
        }
        else if(action==='abortBurn') {this.prop.burn=null;this.prop.engines.forEach(e=>{e.manual=false;e.duty=0;});}
        else if(parts[0]==='cmg') {const c=this.cmg[+parts[1]];if(!c||!['motor','enabled','fault'].includes(parts[2]))throw Error('Unknown CMG command');set(c,parts[2]);}
        else if(['jet','engine'].includes(parts[0])) {
          const c=(parts[0]==='jet'?this.prop.jets:this.prop.engines)[+parts[1]];
          if(!c||!['enabled','manual','fault','pulse'].includes(parts[2]))throw Error('Unknown thruster command');
          if((parts[2]==='manual'&&value||parts[2]==='pulse')&&(!this.prop.armed||this.prop.fuel<=0))throw Error('Arm propulsion and check fuel first');
          if(parts[2]==='pulse') {if(parts[0]!=='jet'||!numeric(.1,30))throw Error('Pulse must be 0.1-30 simulated seconds');c.pulse=n;}
          else set(c,parts[2]);
        }
        else if(parts[0]==='channel') {const c=this.power.channels[+parts[1]];if(!c||!['enabled','battery','fault'].includes(parts[2]))throw Error('Unknown power channel');set(c,parts[2]);}
        else if(action==='payload') set(this.power,'payload');
        else if(action==='payloadKW') {if(!numeric(0,60))throw Error('Payload load must be 0-60 kW');this.power.payloadKW=n;}
        else if(parts[0]==='loop') {const c=this.thermal.loops[+parts[1]];if(!c)throw Error('Unknown loop');if(parts[2]==='pump')set(c,'pump');else if(parts[2]==='valve'&&numeric(0,1))c.valve=n;else throw Error('Invalid loop command');}
        else if(action==='cabinTarget') {if(!numeric(16,28))throw Error('Cabin setpoint must be 16-28 °C');this.thermal.target=n;}
        else if(parts[0]==='life') {
          const k=parts[1];if(['oga','cdra','upa','wpa','fan','o2Valve'].includes(k))set(this.life,k);
          else if(k==='crew'&&numeric(0,12)&&Number.isInteger(n))this.life.crew=n;
          else if(k==='ogaRate'&&numeric(0,9))this.life.ogaRate=n;
          else if(k==='leak'&&numeric(0,.1))this.life.leak=n;
          else throw Error('Invalid life-support setting');
        }
        else if(parts[0]==='airlock') {
          const k=parts[1],a=this.airlock;
          if(!bool||!['inner','outer','vent','repress'].includes(k))throw Error('Invalid airlock control');
          if(value&&k==='inner'&&(a.outer||a.vent||Math.abs(a.pressure-this.pressure)>5))throw Error('Close outer hatch/vent and equalize pressure first');
          if(value&&k==='outer'&&(a.inner||a.pressure>5))throw Error('Close inner hatch and depressurize below 5 kPa first');
          if(value&&k==='vent'&&(a.inner||a.repress))throw Error('Close inner hatch and stop repressurization first');
          if(value&&k==='repress'&&(a.outer||a.vent))throw Error('Close outer hatch and vent first');
          a[k]=value;
        }
        else if(parts[0]==='drive') {
          if(parts[1]==='beta') {if(!Number.isInteger(+parts[2])||+parts[2]<0||+parts[2]>7||!bool)throw Error('Invalid beta drive');this.drives.beta[+parts[2]]=value;}
          else if(Object.hasOwn(this.drives,parts[1])&&parts[1]!=='beta')set(this.drives,parts[1]);
          else throw Error('Unknown drive');
        }
        else if(parts[0]==='comms'&&Object.hasOwn(this.comms,parts[1]))set(this.comms,parts[1]);
        else if(action==='resupply') {this.prop.fuel=800;this.mass=this.dryMass+800;this.life.water=300;this.life.o2Reserve=20;}
        else if(action==='scenario') {
          if(value==='blackout') {this.power.channels.forEach(c=>{c.enabled=false;c.battery=false;});}
          else if(value==='gyroLoss')this.cmg.forEach(c=>{c.enabled=false;});
          else if(value==='coolingLoss')this.thermal.loops.forEach(c=>{c.pump=false;});
          else if(value==='leak')this.life.leak=.02;
          else if(value==='saturation')this.cmg.forEach(c=>{c.h=[0,0,4700];});
          else if(value==='restore') {
            this.cmg.forEach(c=>{c.enabled=true;c.motor=true;c.fault=false;});
            this.power.channels.forEach(c=>{c.enabled=true;c.battery=true;c.fault=false;});
            this.thermal.loops.forEach(c=>{c.pump=true;c.valve=1;});
            this.prop.jets.concat(this.prop.engines).forEach(c=>{c.enabled=true;c.fault=false;});
            Object.assign(this.life,{leak:0,oga:true,cdra:true,upa:true,wpa:true,fan:true});this.sensor=true;
          } else throw Error('Unknown scenario');
        }
        else throw Error('Unknown virtual command');
        return {ok:true,reason:'Applied to virtual station'};
      } catch(e) {return {ok:false,reason:e.message};}
    }
    // Alle Triebwerke sofort aus (Notaus für Antrieb), Scharfschaltung aufheben.
    stopThrust() {this.prop.armed=false;this.prop.unload=false;this.prop.burn=null;this.prop.jets.forEach(j=>{j.manual=false;j.pulse=0;j.duty=0;});this.prop.engines.forEach(j=>{j.manual=false;j.duty=0;});this.force=[0,0,0];}
    // Kabinengesamtdruck in kPa (Summe der Partialdrücke).
    get pressure(){return this.life.o2+this.life.n2+this.life.co2;}
    // Gesamter CMG-Drehimpuls in Prozent der Kapazität aller vier Kreisel.
    get momentum(){return this.cmg.reduce((s,c)=>s+norm(c.h),0)/(4*4760)*100;}
    // Anzahl der Kreisel, die gerade Moment liefern können.
    get online(){return this.cmg.filter(c=>c.enabled&&!c.fault&&c.rpm>6200&&this.power.bus>.8).length;}
    // Simulation um 'seconds' voranbringen, in Teilschritten von höchstens 0,25 s.
    // afterStep(dt, station) wird nach jedem Teilschritt aufgerufen; iss_twin.html integriert
    // dort die Bahn mit der aktuellen Schubkraft.
    step(seconds,environment={},afterStep) {
      let left=seconds;
      if(!Number.isFinite(left)||left<0||left>120)throw Error('Invalid simulation step');
      while(left>1e-9) {const dt=Math.min(.25,left);const env=typeof environment==='function'?environment(this):environment;
        this.tick(dt,env);this.time+=dt;if(afterStep)afterStep(dt,this);left-=dt;}
      this.checkAlarms();
    }
    // Ein Zeitschritt: Strom, Kreisel, Lageregelung, Triebwerke, Thermalhaushalt,
    // Lebenserhaltung und Luftschleuse in dieser Reihenfolge (spätere Teile nutzen die
    // Ergebnisse der früheren, z. B. ob genug Strom für die Pumpen da ist).
    tick(dt,env) {
      const p=this.power,prop=this.prop,l=this.life,t=this.thermal;
      this.lastEnv=env;
      const illumination=CHANS.map((_,i)=>clamp(this.environment==='eclipse'?0:this.environment==='sun'?(env.sunIncidence?.[i]??1):(env.illumination?.[i]??0),0,1));
      // Strom: jeder der 8 Kanäle liefert bis zu 16 kW mal Beleuchtung (Kosinus des Sonnen-
      // einfallswinkels aus dem 3D-Modell, 0 im Erdschatten). Bedarf = Grundlast 35 kW plus
      // eingeschaltete Verbraucher. Fehlt Leistung, entladen die Batterien (je 10 kWh,
      // höchstens 12 kW, Wirkungsgrad 92 %); Überschuss lädt sie (höchstens 10 kW, 95 %).
      // p.bus = Anteil des gedeckten Bedarfs; unter 0,8 fallen Pumpen, Antriebe und Regelung aus.
      p.channels.forEach((c,i)=>{c.kw=c.enabled&&!c.fault?16*illumination[i]:0;});
      p.generation=p.channels.reduce((s,c)=>s+c.kw,0);
      p.demand=35+(p.payload?p.payloadKW:0)+this.cmg.filter(c=>c.motor&&!c.fault).length*.8
        +t.loops.filter(c=>c.pump).length*2.5+(l.oga?4:0)+(l.cdra?1.5:0)+(l.upa?1:0)+(l.wpa?.8:0)+(l.fan?.5:0);
      const batteries=p.channels.filter(c=>c.battery&&!c.fault);
      const deficit=p.demand-p.generation;
      const discharge=batteries.filter(c=>c.soc>0),charge=batteries.filter(c=>c.soc<1);
      const delivered=deficit>0?Math.min(deficit,discharge.reduce((s,c)=>s+Math.min(12,c.soc*10*3600*.92/dt),0)):0;
      const absorbed=deficit<0?Math.min(-deficit,charge.reduce((s,c)=>s+Math.min(10,(1-c.soc)*10*3600/.95/dt),0)):0;
      const out=discharge.map(c=>Math.min(12,c.soc*10*3600*.92/dt)),outSum=out.reduce((a,b)=>a+b,0);
      const into=charge.map(c=>Math.min(10,(1-c.soc)*10*3600/.95/dt)),inSum=into.reduce((a,b)=>a+b,0);
      discharge.forEach((c,i)=>c.soc=clamp(c.soc-(outSum?delivered*out[i]/outSum:0)*dt/(3600*10*.92),0,1));
      charge.forEach((c,i)=>c.soc=clamp(c.soc+(inSum?absorbed*into[i]/inSum:0)*dt*.95/(3600*10),0,1));
      p.batteryKW=delivered-absorbed;p.served=Math.min(p.demand,p.generation+delivered);p.bus=clamp(p.served/p.demand,0,1);
      const powered=p.bus>.8;
      // Drehimpuls, den ein auslaufender Kreisel verliert, geht auf die Station über; der Rotorzustand verschwindet nie einfach.
      let gyro=[0,0,0];
      this.cmg.forEach(c=>{
        const old=c.rpm;c.rpm=clamp(c.rpm+(c.motor&&!c.fault&&powered?3.7:-c.rpm/21600)*dt,0,6600);
        const cap=4760*c.rpm/6600, hn=norm(c.h);
        if(hn>cap&&hn>0) {const next=scale(c.h,cap/hn);gyro=add(gyro,scale(add(c.h,scale(next,-1)),1/dt));c.h=next;}
        c.temperature+=((c.motor&&!c.fault&&powered?48:30)+Math.max(0,t.cabin-22)-c.temperature)*dt/1800;
        c.torque=[0,0,0];
      });
      // Lagefehler als Drehvektor (Fehlerquaternion conj(q)*Ziel, kürzerer Weg), Schwerkraft-
      // gradientenmoment (3*mu/r^3 * n x I*n) und Kreiselkopplung omega x (I*omega + H).
      const err=qmul(conj(this.q),this.target);const error=scale(err.slice(1),err[0]<0?-2:2);
      const sumH=this.cmg.reduce((s,c)=>add(s,c.h),[0,0,0]);
      const active=this.cmg.filter(c=>c.enabled&&!c.fault&&c.rpm>6200&&powered);
      const radius=(env.radius||6790)*1000,mu=3.986004418e14;
      const nadir=rotate(conj(this.q),[0,0,1]);
      const gg=this.gravityGradient?scale(cross(nadir,nadir.map((x,i)=>x*this.inertia[i])),3*mu/radius**3):[0,0,0];
      const coupling=cross(this.omega,add(this.omega.map((x,i)=>x*this.inertia[i]),sumH));
      // Drehrate, die mit dem verfügbaren Kreisel-Drehimpuls tatsächlich erreichbar ist, mit langsamem, kritisch
      // gedämpftem Einfangen. Das alte Ratenziel lag um eine Größenordnung über dem verfügbaren Drehimpuls.
      const authority=active.length*4760*.4;
      const controlled=this.mode!=='free'&&this.sensor&&powered&&!this.kinematic;
      const desired=controlled?error.map((e,i)=>{
        const maxRate=this.prop.armed? .0006 : authority/this.inertia[i];
        const rate=this.mode==='damp'?0:clamp(e*.0015,-maxRate,maxRate);
        return this.inertia[i]*(rate-this.omega[i])/40-gg[i]-this.disturbance[i]+coupling[i];
      }):[0,0,0];
      let force=[0,0,0],ext=[0,0,0],mainForce=0,flow=0;
      const duties=prop.jets.map(j=>j.manual?1:j.pulse>0?Math.min(1,j.pulse/dt):0);
      // ZUERST das begrenzte Kreiselmoment verteilen. Die RCS-Unterstützung übernimmt nur den echten Rest
      // (auch bei Sättigung), statt anzunehmen, dass alle eingeschalteten Kreisel noch wirken können.
      let gyroRequest=desired.slice();
      if(prop.unload&&prop.armed&&controlled)gyroRequest=add(gyroRequest,scale(sumH,1/180));
      if(controlled&&this.mode!=='rcs')active.forEach((c,index)=>{
        let request=limit(scale(gyroRequest,1/(active.length-index)),258*c.rpm/6600);
        const cap=4760*c.rpm/6600,dh=scale(request,-dt);
        if(norm(add(c.h,dh))>cap){
          const a=dot(dh,dh),b=2*dot(c.h,dh),cc=Math.min(0,dot(c.h,c.h)-cap*cap);
          request=scale(request,a>0?clamp((-b+Math.sqrt(Math.max(0,b*b-4*a*cc)))/(2*a),0,1):0);
        }
        c.h=add(c.h,scale(request,-dt));c.torque=request;gyro=add(gyro,request);gyroRequest=add(gyroRequest,scale(request,-1));
      });
      const auto=controlled&&(['hold','rcs','damp'].includes(this.mode)||prop.unload)?add(desired,scale(gyro,-1)):[0,0,0];
      if(prop.armed&&powered&&prop.fuel>0)for(let axis=0;axis<3;axis++){
        const ids=JETS.map((j,i)=>({j,i})).filter(({j,i})=>j.axis===axis&&j.sign===Math.sign(auto[axis])&&prop.jets[i].enabled&&!prop.jets[i].fault);
        const capacity=ids.reduce((s,{j})=>s+Math.abs(cross(j.r,scale(j.dir,j.thrust))[axis]),0);
        ids.forEach(({i})=>duties[i]=Math.max(duties[i],clamp(Math.abs(auto[axis])/(capacity||1),0,1)));
      }
      const engineDuty=prop.engines.map(e=>(e.manual||prop.burn)&&e.enabled&&!e.fault?1:0);
      if(prop.burn) {
        const available=engineDuty.reduce((s,d,i)=>s+d*ENGINES[i].thrust,0);
        const fraction=clamp((prop.burn.target-prop.burn.done)*this.mass/(dt*available||1),0,1);
        engineDuty.forEach((v,i)=>engineDuty[i]=v*fraction);
      }
      prop.jets.forEach((j,i)=>{j.duty=prop.armed&&powered&&!j.fault&&j.enabled?duties[i]:0;j.pulse=Math.max(0,j.pulse-dt);flow+=j.duty*JETS[i].thrust/(prop.isp*9.80665);});
      prop.engines.forEach((e,i)=>{e.duty=prop.armed&&powered?engineDuty[i]:0;flow+=e.duty*ENGINES[i].thrust/(prop.mainIsp*9.80665);});
      const fuelScale=flow?Math.min(1,prop.fuel/(flow*dt)):1;
      prop.jets.forEach((j,i)=>{j.duty*=fuelScale;const f=scale(JETS[i].dir,JETS[i].thrust*j.duty);force=add(force,f);ext=add(ext,cross(JETS[i].r,f));});
      prop.engines.forEach((e,i)=>{e.duty*=fuelScale;const f=scale(ENGINES[i].dir,ENGINES[i].thrust*e.duty);force=add(force,f);ext=add(ext,cross(ENGINES[i].r,f));mainForce+=norm(f);});
      prop.fuel=Math.max(0,prop.fuel-flow*dt*fuelScale);this.mass=this.dryMass+prop.fuel;
      const dv=mainForce/this.mass*dt;prop.dv+=norm(force)/this.mass*dt;
      if(prop.burn){prop.burn.done+=dv;if(prop.burn.done>=prop.burn.target-1e-9)prop.burn=null;}
      const torque=add(add(ext,gyro),add(gg,this.disturbance));
      if(!this.kinematic)this.omega=this.omega.map((w,i)=>w+(torque[i]-coupling[i])/this.inertia[i]*dt);
      const speed=norm(this.omega),angle=speed*dt;
      if(speed>0&&!this.kinematic)this.q=unit(qmul(this.q,[Math.cos(angle/2),...scale(this.omega,Math.sin(angle/2)/speed)]));
      this.force=force;this.torque=torque;this.gyroTorque=gyro;
      // Wärmespeicher als Einzelmasse: angetriebene Pumpen führen Wärme an zwei Radiatorkreise ab.
      t.heat=p.served*.75+l.crew*.12;
      const need=Math.max(0,t.heat+(t.cabin-t.target)*4);
      t.cooling=0;
      t.loops.forEach((loop,i)=>{
        loop.flow=loop.pump&&powered?3600*loop.valve:0;
        const rad=clamp(env.radiator?.[i]??1,0,1);
        const capacity=loop.flow>0?35*rad*loop.valve:0;
        loop.reject=Math.min(need/2,capacity);t.cooling+=loop.reject;
        loop.temperature+=(t.cabin+need/2/5-loop.reject/5-loop.temperature)*dt/180;
      });
      t.cabin+=(t.heat-t.cooling)*1000*dt/8e7;
      // Kabine als ideales Gas mit endlichen Vorräten. Tankinhalte in kg.
      const o2Used=l.crew*.84/86400*dt,co2Made=l.crew/86400*dt;
      const o2Generated=l.oga&&powered?Math.min(l.ogaRate/86400*dt,l.water*8/9):0;
      l.water=Math.max(0,l.water-o2Generated*9/8-l.crew*3/86400*dt);
      const co2Removed=l.cdra&&l.fan&&powered?Math.min(Math.max(0,(l.co2-.25)*35)/86400*dt,10/86400*dt):0;
      const kO=259.8*(t.cabin+273.15)/900/1000,kC=188.9*(t.cabin+273.15)/900/1000;
      let reserve=l.o2Valve&&l.o2<21.2?Math.min(l.o2Reserve,2/3600*dt):0;l.o2Reserve-=reserve;
      l.o2=Math.max(0,l.o2+(o2Generated+reserve-o2Used)*kO);l.co2=Math.max(0,l.co2+(co2Made-co2Removed)*kC);
      const leak=Math.exp(-l.leak*dt/3600);l.o2*=leak;l.n2*=leak;l.co2*=leak;
      l.urine=Math.min(100,l.urine+l.crew*1.5/86400*dt);
      l.waste=Math.min(100,l.waste+l.crew/86400*dt);
      const upa=l.upa&&powered?Math.min(l.urine,2/3600*dt,(100-l.waste)/.9):0;
      l.urine-=upa;l.waste+=upa*.9;
      const wpa=l.wpa&&powered?Math.min(l.waste,2.5/3600*dt,(300-l.water)/.95):0;
      l.waste-=wpa;l.water+=wpa*.95;
      l.o2Production=o2Generated/dt*86400;l.co2Removal=co2Removed/dt*86400;l.upaFlow=upa/dt*3600;l.wpaFlow=wpa/dt*3600;
      const air=this.airlock;
      if(air.outer||air.vent)air.pressure*=Math.exp(-dt/80);
      if((air.inner||air.repress)&&!air.outer&&!air.vent) {
        const transfer=(this.pressure-air.pressure)*(1-Math.exp(-dt/(air.inner?2:120)));
        const ratio=Math.max(0,1-transfer*6/(900*this.pressure||1));
        l.o2*=ratio;l.n2*=ratio;l.co2*=ratio;air.pressure=Math.max(0,air.pressure+transfer);
      }
    }
    // Alarmliste aus dem aktuellen Zustand neu aufbauen (wird nach jedem step() aufgerufen).
    checkAlarms() {
      const a=[],p=this.power,l=this.life;
      if(this.online===0)a.push('No available CMGs');
      if(this.cmg.some(c=>norm(c.h)>4760*c.rpm/6600*.95))a.push('CMG momentum saturation: unload with armed RCS');
      if(norm(this.omega)>.002)a.push('High attitude rate');
      if(!this.sensor)a.push('Attitude sensor unavailable: automatic control inhibited');
      if(p.bus<.8)a.push('Power shortage: pumps, drives and control inhibited');
      if(p.channels.reduce((s,c)=>s+c.soc,0)/8<.15)a.push('Battery charge low');
      if(this.prop.fuel<50)a.push('Propellant low');
      if(this.prop.burn&&!this.prop.engines.some(e=>e.enabled&&!e.fault))a.push('Burn stalled: no main engines');
      if(!this.thermal.loops.some(c=>c.flow>0))a.push('No active cooling flow');
      if(this.thermal.cabin>28)a.push('Cabin temperature high');
      if(l.co2>.6)a.push('CO₂ rising');if(l.o2<18)a.push('O₂ low');if(this.pressure<90)a.push('Cabin pressure low');
      if(l.water<30)a.push('Potable water low');if(l.urine>90||l.waste>90)a.push('Waste tank nearly full');
      this.alarms=a;
    }
    // Kompletter Zustand als JSON-fähige Kopie (für Export und MQTT-Veröffentlichung).
    // Gleichgewichtslage (TEA) übernehmen: Die echte Station fliegt eine Lage, in der sich
    // Schwerkraftgradienten- und Luftwiderstandsmoment im Mittel aufheben. Beim Abspalten wird die
    // Restgröße, die das Modell nicht kennt (aerodynamisches Moment), als feste Störung so gesetzt,
    // dass das Umgebungsmoment in der aktuellen Lage null ist. Ohne das sättigt das Schwerkraft-
    // gradientenmoment die Kreisel nach etwa einer Stunde und die Lage geht verloren (v1.13).
    // Eine neu kommandierte, andere Lage hat wieder ein Restmoment, wie bei der echten Station.
    trimTEA(radiusKm=6790){
      const radius=radiusKm*1000,mu=3.986004418e14,nadir=rotate(conj(this.q),[0,0,1]);
      const gg=scale(cross(nadir,nadir.map((x,i)=>x*this.inertia[i])),3*mu/radius**3);
      this.disturbance=scale(gg,-1);return this.disturbance.slice();
    }
    snapshot(){return JSON.parse(JSON.stringify({source:'VIRTUAL',sim_time:this.time,mass:this.mass,q:this.q,omega:this.omega,
      mode:this.mode,cmg:this.cmg,prop:this.prop,power:this.power,thermal:this.thermal,life:this.life,airlock:this.airlock,
      drives:this.drives,comms:this.comms,force:this.force,torque:this.torque,alarms:this.alarms}));}
  }
  // Öffentliche Schnittstelle des Moduls.
  const api={Station,JETS,ENGINES,CHANS,rotate,qmul,conj,norm,cross};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VirtualStation=api;
})(globalThis);
