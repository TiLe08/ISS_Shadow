// test_ui.mjs: DOM-Integration der Oberfläche: NASA-Rückfall, Erholung der Live-Daten, Ablauf,
// Isolierung der virtuellen Abspaltung, Wechsel zum Simulator, fehlende Pose, Kanal-Browser,
// Dashboard, Widgets und Sprachen.
// Lädt iss_twin.html ohne WebGL in jsdom: Die Skripte der Seite laufen in einer VM, das
// Modul-Skript wird mit einem Export globalThis.TEST um die benötigten internen Funktionen ergänzt.
import assert from 'node:assert/strict';import{loadTwin}from'./harness.mjs';
const{t,w,dom}=await loadTwin(['buildPanels','updateTop','updatePanels','chRead','CHCTX','GRAPHS','toggleGraph','ALL_PUIS','CH_GROUPS','chGroupOf','TM','effectiveSignal','systemsLabel','acceptOrbit','stopOrbitFeed','stopSim','startSim','D','NASA_ORBIT','ORB','LINK','CMD','enterCmd','exitCmd','updateOrbit','ingest','orbitLabel','switchSource','stepCmd','commandVirtual','virtTm','autotrack','liveJoints'],{url:'http://localhost:8137/iss_twin.html#mqtt'});
t.buildPanels();t.LINK.src='mqtt';t.LINK.state='connected';t.LINK.since=Date.now()-20000;
const now=Date.now(), state=[6790,0,0,0,7.66,0];
const oem={source:'NASA_OEM',kind:'predicted',available:true,state,frame:'EME2000',units:'km,km/s',epoch:now/1000,created:now/1000-3600,valid_from:now/1000-86400,valid_to:now/1000+86400};
t.acceptOrbit(oem);t.updateOrbit(now);t.updateTop();
assert.equal(t.ORB.source,'NASA_OEM');assert.equal(t.TM.size,0);
assert.match(w.document.querySelector('#pOrbitBadge').textContent,/NASA PREDICTED/);
assert.match(w.document.querySelector('#dataNote').textContent,/SYSTEMS UNAVAILABLE/);
assert.match(w.document.querySelector('#pOrbitBadge').title,/NASA product/);
t.updatePanels(t.D);assert.match(w.document.querySelector('#gY0').textContent,/---/);
// Neue Messungen erholen sich automatisch; spätere Stille führt zurück zum OEM.
let stamp=(now-Date.UTC(new Date(now).getUTCFullYear(),0,1))/3600000;
state.forEach((v,i)=>t.ingest('USLAB0000'+(32+i),v*1000/.3048,stamp,now));
t.LINK.sig='AOS';t.LINK.sigTs=stamp;t.LINK.signalRx=now;
t.updateOrbit(now);assert.equal(t.ORB.source,'ISSLIVE');
t.acceptOrbit({...oem,epoch:(now+31000)/1000});t.updateOrbit(now+31000);assert.equal(t.ORB.source,'NASA_OEM');
// Kein frisches NASA-Paket: sicher abschalten und veraltete Bahn/Karte leeren, statt das OEM ewig zu propagieren.
t.updateOrbit(now+60000);assert.equal(t.ORB.s,null);
// Die Kommando-Abspaltung darf von einem eingehenden Quellen-Update nicht überschrieben werden.
t.acceptOrbit({...oem,epoch:now/1000+61});t.updateOrbit(now+61000);t.enterCmd();
t.stepCmd(.25);assert.ok(t.CMD.sys.time>0);assert.ok(t.CMD.sys.q.every(Number.isFinite));t.commandVirtual('holdHere',true);t.stepCmd(.25);
const commanded=t.ORB.s.slice();t.acceptOrbit({...oem,epoch:now/1000+62,state:[0,6790,0,-7.66,0,0]});
t.updateOrbit(now+61000);assert.deepEqual(Array.from(t.ORB.s),Array.from(commanded));
t.exitCmd();t.TM.clear();t.updateOrbit(now+62000);assert.ok(Math.abs(t.ORB.s[1]-6790)<1);
// Die Simulation nutzt keine NASA-Werte, und die Rückkehr zu echten Daten löscht simulierte Werte.
t.switchSource('sim');t.updateOrbit(Date.now());assert.equal(t.ORB.source,'SIM');
t.updateTop();assert.match(w.document.querySelector('#dataNote').textContent,/SIMULATED/);
t.switchSource('mqtt');t.stopOrbitFeed();assert.equal(t.TM.size,0);assert.equal(t.ORB.s,null);
// Alte gespeicherte Werte behalten ihr Mess- und Empfangsalter und werden als veraltet gekennzeichnet.
t.ingest('USLAB000058',14.6,stamp-1,now-3600000);
// Alte gespeicherte Werte im Kanal-Browser: Wert, Alter, veraltet.
w.ISSWorkspace.init({ctx:t.CHCTX,t:s=>s,channels:()=>t.ALL_PUIS,groups:t.CH_GROUPS,groupOf:p=>t.chGroupOf.get(p),pinned:p=>t.GRAPHS.includes(p),togglePin:t.toggleGraph,raw:p=>t.TM.get(p),panels:()=>[],elements:{},onLayout:()=>{}});
w.ISSWorkspace.openBrowser({select:'USLAB000058'});
const row=[...w.document.querySelectorAll('#cbBody tr')].find(r=>r.textContent.includes('USLAB000058'));
assert.ok(row,'channel row');assert.match(row.textContent,/14\.6/);assert.match(w.document.querySelector('#cbDetail').textContent,/ago/);
t.updateTop();assert.match(w.document.querySelector('#dataNote').textContent,/SYSTEMS STALE/);
// Anheften im Browser erreicht das Graphs-Panel; Hinzufügen zum Dashboard erzeugt ein Widget.
const was=t.GRAPHS.includes('USLAB000058');w.document.querySelector('#cbDetail [data-a="pin"]').click();assert.equal(t.GRAPHS.includes('USLAB000058'),!was);
const n0=w.ISSWorkspace.dash.groups[0].widgets.length;w.ISSWorkspace.addChannel(w.ISSWorkspace.dash.groups[0].id,'USLAB000058','gauge');assert.equal(w.ISSWorkspace.dash.groups[0].widgets.length,n0+1);
// Jeder Kanal hat eine Widget-Art und einen lesbaren Wert; Aufzählungen werden dekodiert.
for(const p of t.ALL_PUIS){const i=t.CHCTX.info(p);assert.ok(i.kind&&i.label,p);t.CHCTX.read(p);}
t.ingest('USLAB000086',4,stamp,Date.now());assert.equal(t.chRead('USLAB000086').text,'REBOOST');
// Der Stationsmodus ist ein Bitcode (NASA ISSLive; 16 = External Operations, EVA/EVR); der Modus des russischen
// Segments hat eine eigene Reihenfolge 1..7 (7 = Standard, 3 = Bahnanhebung).
t.ingest('USLAB000086',16,stamp,Date.now());assert.equal(t.chRead('USLAB000086').text,'EXTERNAL OPS');
t.ingest('RUSSEG000001',7,stamp,Date.now());assert.equal(t.chRead('RUSSEG000001').text,'STANDARD');t.ingest('RUSSEG000001',3,stamp,Date.now());assert.equal(t.chRead('RUSSEG000001').text,'REBOOST');t.ingest('USLAB000086',4,stamp,Date.now());
t.ingest('USLAB000043',0,stamp,Date.now());assert.equal(t.chRead('USLAB000043').text,'Doing position fixes','GPS status 0 = doing fixes (telemetry.space dictionary)');
t.ingest('RUSSEG000019',1,stamp,Date.now());assert.equal(t.chRead('RUSSEG000019').text,'Engaged');
// Sprachen: Jede Tabelle hat dieselben Schlüssel; ein Wechsel baut die Panels in dieser Sprache neu auf.
const S=w.I18N_STRINGS,langs=['de','es','ru','fr','ja'];for(const l of langs)assert.deepEqual(Object.keys(S[l]).sort(),Object.keys(S.de).sort(),'same keys in '+l);
assert.ok(Object.keys(S.de).length>650,'translation table complete');
w.I18N.set('de');t.buildPanels();assert.equal(w.document.querySelector('#pEps h2').textContent,'Energie');assert.equal(t.chRead('USLAB000086').text,'BAHNANHEBUNG');
w.I18N.set('ja');t.buildPanels();assert.equal(w.document.querySelector('#pEcl h2').textContent,'生命維持');
w.I18N.set('en');t.buildPanels();assert.equal(w.document.querySelector('#pEps h2').textContent,'Power');
// Widgets: Jede Darstellung zeichnet jede Kanalart, ohne einen Fehler zu werfen.
for(const p of ['S0000004','NODE3000005','USLAB000086','RUSSEG000019','S4000001','USLAB000058','TIME_000001'])for(const v of ['tile',...w.ISSW.VIEWS]){const x=w.ISSW.make(v,p,t.CHCTX);x.update(Date.now(),true);assert.ok(x.el.querySelector('.wv b').textContent.length,p+' '+v);}
console.log('PASS DOM integration: NASA fallback, live recovery, expiry, virtual fork isolation, SIM switching, missing pose, channel browser, dashboard, widgets, languages');
dom.window.close();
