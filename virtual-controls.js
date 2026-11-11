// virtual-controls.js: Bedienfeld der virtuellen Station (Kommandomodus).
//
// Baut die aufklappbaren Abschnitte (Lageregelung und Kreisel, Triebwerke, Strom,
// Thermal, Lebenserhaltung und Luftschleuse, Gelenkantriebe, Kommunikation,
// Übungsszenarien) als HTML und verbindet jedes Schaltelement mit einem Befehl an das
// Modell aus virtual-station.js. Jedes Element trägt data-action (Umschalter, Regler,
// Auswahl) oder data-command (Knopf); der Name ist genau der Befehl, den
// Station.command() versteht. sync() schreibt den Modellzustand in die Anzeigen zurück.
// Klassisches Skript: stellt window.VirtualControls = { mount, sync } bereit.
(function(root){
  'use strict';
  // Zahl mit d Nachkommastellen oder Gedankenstrich.
  const fmt=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'-';
  // Übersetzung über I18N, wenn geladen (sonst nur Platzhalter füllen).
  const T=(s,...a)=>root.I18N?root.I18N.t(s,...a):String(s).replace(/\{(\d)\}/g,(m,i)=>a[i]);
  // HTML-Bausteine: Umschalter, Schieberegler, Knopf und aufklappbarer Abschnitt.
  const toggle=(action,label)=>`<label class="vc-toggle"><input type="checkbox" data-action="${action}"><span>${label}</span></label>`;
  const range=(action,label,min,max,step)=>`<label class="vc-range">${label}<output data-output="${action}"></output><input type="range" data-action="${action}" min="${min}" max="${max}" step="${step}"></label>`;
  const button=(action,label,value='true')=>`<button type="button" class="btn" data-command="${action}" data-value='${value}'>${label}</button>`;
  const section=(title,body,open=false)=>`<details class="vc-section" ${open?'open':''}><summary>${title}</summary><div class="vc-body">${body}</div></details>`;
  // Aktuellen Modellwert zu einem Befehlsnamen lesen (z. B. 'cmg.2.motor' -> m.cmg[2].motor),
  // damit Schaltelemente den echten Zustand zeigen.
  function value(m,key){
    const p=key.split('.'),i=+p[1];
    if(p[0]==='cmg')return m.cmg[i][p[2]];
    if(p[0]==='jet')return m.prop.jets[i][p[2]];
    if(p[0]==='engine')return m.prop.engines[i][p[2]];
    if(p[0]==='channel')return m.power.channels[i][p[2]];
    if(p[0]==='loop')return m.thermal.loops[i][p[2]];
    if(p[0]==='life')return m.life[p[1]];
    if(p[0]==='airlock')return m.airlock[p[1]];
    if(p[0]==='comms')return m.comms[p[1]];
    if(p[0]==='drive')return p[1]==='beta'?m.drives.beta[+p[2]]:m.drives[p[1]];
    return {arm:m.prop.armed,unload:m.prop.unload,sensor:m.sensor,gravity:m.gravityGradient,
      payload:m.power.payload,payloadKW:m.power.payloadKW,cabinTarget:m.thermal.target,environment:m.environment,mode:m.mode}[key];
  }
  // Bedienfeld in el aufbauen. m = VirtualStation.Station, command(action, value) schickt den
  // Befehl an die Station (in iss_twin.html: commandVirtual, das zusätzlich protokolliert).
  function mount(el,m,command){
    const VS=root.VirtualStation;
    el.innerHTML=`<div class="vc-status" id="virtualStats"></div><div id="virtualAlarms" role="status"></div><div id="virtualFeedback" role="status"></div>`+
      section('Attitude controller & four gyros',`
        <label class="vc-range">Control mode<select data-action="mode"><option value="hold">Hold target · CMGs + RCS assist</option><option value="cmg">CMGs only</option><option value="rcs">RCS only</option><option value="free">Free drift</option><option value="damp">Damp rates · RCS assist</option></select></label>
        <p class="note">The attitude sliders below set the target. With all control disabled, rotation continues. RCS assistance requires propulsion armed.</p>
        ${toggle('sensor','Attitude sensor')}${toggle('gravity','Gravity-gradient disturbance')}${toggle('unload','Unload CMG momentum using RCS')}
        ${button('holdHere','Hold current attitude')}${button('dampRates','Damp rates · arms RCS')}${button('resetMotion','Reset motion · simulation')}<p class="note">Physical maneuvers take simulated minutes. Damping uses available actuators; Reset motion instantly clears rates and stored gyro momentum as a training reset.</p>
        ${m.cmg.map((_,i)=>`<div class="vc-device"><b>CMG ${i+1}</b><span data-cmg-status="${i}"></span><div class="vc-switches">${toggle(`cmg.${i}.motor`,'Spin motor')}${toggle(`cmg.${i}.enabled`,'Gimbal control')}${toggle(`cmg.${i}.fault`,'Fault')}</div></div>`).join('')}
        <p class="note">6600 rpm · 4760 N·m·s · 258 N·m per CMG. Spin-down is gradual; disabling gimbal control stops commanded torque, not rotation.</p>`,true)+
      section('Propulsion · individual jets',`
        ${toggle('arm','ARM virtual propulsion')}<div class="btns">${button('allStop','STOP ALL THRUST')}${button('abortBurn','Abort main burn')}</div>
        <p class="note">Attitude jets on Zvezda's aft section, where the station's real thrusters are (approximate positions, not real valve identifiers). Fire is latched; Pulse runs for one simulated second. Each jet applies force AND moment about the center of mass.</p>
        ${VS.JETS.map((j,i)=>`<div class="vc-device"><b>${j.id} · ${j.label}</b><span data-jet-status="${i}"></span><div class="vc-switches">${toggle(`jet.${i}.enabled`,'Enabled')}${toggle(`jet.${i}.manual`,'Fire')}${toggle(`jet.${i}.fault`,'Failed off')}${button(`jet.${i}.pulse`,'Pulse 1 s','1')}</div></div>`).join('')}
        ${VS.ENGINES.map((j,i)=>`<div class="vc-device"><b>${j.id} · +body X</b><span data-engine-status="${i}"></span><div class="vc-switches">${toggle(`engine.${i}.enabled`,'Enabled')}${toggle(`engine.${i}.manual`,'Fire')}${toggle(`engine.${i}.fault`,'Failed off')}</div></div>`).join('')}
        <label class="vc-range">Target burn Δv (m/s)<input id="virtualDv" type="number" min="0.01" max="10" step="0.1" value="0.5"></label><button class="btn" id="virtualBurn">Start target burn</button>
        <p class="note">Main engines thrust along body +X. Aim the station first; a reversed attitude can lower the orbit. Fuel is finite.</p>`)+
      section('Power · eight channels & batteries',`
        ${toggle('payload','Payload loads connected')}${range('payloadKW','Payload demand (kW)',0,60,1)}
        ${VS.CHANS.map((ch,i)=>`<div class="vc-device"><b>Channel ${ch}</b><span data-power-status="${i}"></span><div class="vc-switches">${toggle(`channel.${i}.enabled`,'Array online')}${toggle(`channel.${i}.battery`,'Battery online')}${toggle(`channel.${i}.fault`,'Channel fault')}</div></div>`).join('')}
        <p class="note">Array output depends on incidence and eclipse. Batteries bridge deficits. Low bus power inhibits control, pumps and drives.</p>`)+
      section('Thermal · loops A/B & radiators',`
        ${range('cabinTarget','Cabin setpoint (°C)',16,28,.5)}
        ${m.thermal.loops.map((_,i)=>`<div class="vc-device"><b>Loop ${i?'B · port':'A · starboard'}</b><span data-loop-status="${i}"></span>${toggle(`loop.${i}.pump`,'Pump running')}${range(`loop.${i}.valve`,'Flow valve',0,1,.05)}</div>`).join('')}
        <p class="note">Radiator sun exposure reduces heat rejection. Use automatic radiator pointing or the manual TRRJ sliders below. The model uses two lumped cooling loops.</p>`)+
      section('Life support & airlock',`
        ${range('life.crew','Virtual crew count',0,12,1)}${toggle('life.oga','Oxygen generation')}${range('life.ogaRate','O₂ production setpoint (kg/day)',0,9,.1)}
        ${toggle('life.cdra','CO₂ scrubber')}${toggle('life.fan','Cabin ventilation')}${toggle('life.upa','Urine processor')}${toggle('life.wpa','Water processor')}${toggle('life.o2Valve','Reserve O₂ regulator')}
        ${range('life.leak','Scenario: cabin leak fraction/hour',0,.1,.001)}
        <div id="virtualLife"></div>
        <div class="vc-device"><b>Airlock pressure interlocks</b><span id="virtualAirlock"></span>
        ${toggle('airlock.inner','Inner hatch open')}${toggle('airlock.outer','Outer hatch open')}${toggle('airlock.vent','Depressurize')}${toggle('airlock.repress','Repressurize from cabin')}</div>
        <p class="note">Crew consumes O₂ and water and adds CO₂ and waste. OGA uses potable water. Hatch interlocks prevent opening across a large pressure difference.</p>`)+
      section('Joint drives & robotics',`
        <p class="note">The existing joint sliders remain rate-limited targets. Disabled or unpowered drives hold position. Grappled payload halves arm slew rate; collision envelopes warn about overlap; contact dynamics are not modeled.</p>
        ${['sarjP','sarjS','trrjP','trrjS','arm','mt','ku','dextre','sband','radiatorDeploy'].map(k=>toggle('drive.'+k,k.toUpperCase()+' drive')).join('')}
        ${VS.CHANS.map((ch,i)=>toggle('drive.beta.'+i,'BGA '+ch+' drive')).join('')}${toggle('drive.grapple','Virtual payload grappled')}`)+
      section('Communications & navigation',`
        ${toggle('comms.ku','Ku-band equipment')}${toggle('comms.sband','S-band equipment')}${toggle('comms.gps1','GPS receiver 1')}${toggle('comms.gps2','GPS receiver 2')}
        <p class="note">Virtual equipment states only. These switches do not disconnect your real MQTT or NASA connections. GPS loss does not erase the simulated orbit.</p>`)+
      section('Training scenarios',`
        <label class="vc-range">Lighting environment<select data-action="environment"><option value="auto">From simulated orbit</option><option value="sun">Force sunlight</option><option value="eclipse">Force eclipse</option></select></label>
        <div class="btns">${button('scenario','Power loss','"blackout"')}${button('scenario','Lose all CMGs','"gyroLoss"')}${button('scenario','Cooling loss','"coolingLoss"')}${button('scenario','Cabin leak','"leak"')}${button('scenario','CMG saturation','"saturation"')}${button('scenario','Restore equipment','"restore"')}${button('resupply','Virtual resupply')}${button('safe','Hold & shed payload')}</div>
        <p class="note">Restore repairs switches/faults; it does not reset motion or replenish resources. Resupply is an explicit training action.</p>`);
    // Befehl ausführen, Ergebnis anzeigen und die Anzeige auffrischen.
    const invoke=(a,v)=>{const r=command(a,v);el.querySelector('#virtualFeedback').textContent=r?.ok?T('Applied: {0}',a):T(r?.reason||'Command unavailable');sync(el,m);};
    el.querySelectorAll('[data-action]').forEach(input=>{
      input.addEventListener('change',()=>invoke(input.dataset.action,input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value));
      if(input.type==='range')input.addEventListener('input',()=>{el.querySelector(`[data-output="${input.dataset.action}"]`).textContent=input.value;});
    });
    el.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>invoke(b.dataset.command,JSON.parse(b.dataset.value)));
    el.querySelector('#virtualBurn').onclick=()=>invoke('reboost',Number(el.querySelector('#virtualDv').value));
    sync(el,m);
  }
  // Anzeigen und Schaltelemente auf den aktuellen Modellzustand setzen (wird regelmäßig
  // aufgerufen). Ein gerade bedientes Element wird nicht überschrieben.
  function sync(el,m){
    if(!el||!m||!el.querySelector('#virtualStats'))return;
    const put=(selector,text)=>{const e=el.querySelector(selector);if(e)e.textContent=text;};
    el.querySelectorAll('[data-action]').forEach(e=>{if(e===document.activeElement&&(e.type==='range'||e.tagName==='SELECT'))return;const v=value(m,e.dataset.action);if(e.type==='checkbox')e.checked=!!v;else e.value=v;put(`[data-output="${e.dataset.action}"]`,typeof v==='number'?String(Math.round(v*1000)/1000):'');});
    put('#virtualStats',`T+ ${fmt(m.time,1)} s | rates °/s: ${m.omega.map(x=>fmt(x*180/Math.PI,4)).join(' / ')}\nFuel ${fmt(m.prop.fuel)} kg | accumulated impulse Δv ${fmt(m.prop.dv,3)} m/s\nPower ${fmt(m.power.generation)} / ${fmt(m.power.demand)} kW | bus ${fmt(m.power.bus*100,0)}%\nCabin ${fmt(m.thermal.cabin,2)} °C | pressure ${fmt(m.pressure,2)} kPa\nForce ${m.force.map(x=>fmt(x,0)).join(' / ')} N | torque ${m.torque.map(x=>fmt(x,0)).join(' / ')} N·m${m.prop.burn?'\nBurn '+fmt(m.prop.burn.done,3)+' / '+fmt(m.prop.burn.target,3)+' m/s':''}`);
    put('#virtualAlarms',m.alarms.length?m.alarms.map(a=>T(a)).join(' · '):T('No model alarms'));
    m.cmg.forEach((c,i)=>put(`[data-cmg-status="${i}"]`,`${fmt(c.rpm,0)} rpm · H ${fmt(Math.hypot(...c.h),0)} N·m·s · ${fmt(c.temperature)} °C`));
    m.prop.jets.forEach((j,i)=>put(`[data-jet-status="${i}"]`,j.duty>0?T('{0}% firing',fmt(j.duty*100,0)):T('OFF')));
    m.prop.engines.forEach((j,i)=>put(`[data-engine-status="${i}"]`,j.duty>0?`${fmt(j.duty*root.VirtualStation.ENGINES[i].thrust,0)} N`:T('OFF')));
    m.power.channels.forEach((c,i)=>put(`[data-power-status="${i}"]`,`${fmt(c.kw)} kW · battery ${fmt(c.soc*100)}%`));
    m.thermal.loops.forEach((c,i)=>put(`[data-loop-status="${i}"]`,`${fmt(c.temperature)} °C · ${fmt(c.flow,0)} kg/h · ${fmt(c.reject)} kW rejected`));
    put('#virtualLife',`O₂ ${fmt(m.life.o2,2)} kPa · CO₂ ${fmt(m.life.co2,3)} kPa\nWater ${fmt(m.life.water)} / 300 kg · urine ${fmt(m.life.urine)} / 100 kg · waste ${fmt(m.life.waste)} / 100 kg\nO₂ reserve ${fmt(m.life.o2Reserve)} kg · production ${fmt(m.life.o2Production,2)} kg/day`);
    put('#virtualAirlock',`${fmt(m.airlock.pressure,2)} kPa`);
  }
  // Öffentliche Schnittstelle.
  root.VirtualControls={mount,sync};
})(globalThis);
