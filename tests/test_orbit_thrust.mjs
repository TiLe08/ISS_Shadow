// test_orbit_thrust.mjs: Virtueller Klon: Schub und Luftwiderstand ändern die Bahn um die Beträge,
// die die Bahnmechanik vorhersagt. Lädt iss_twin.html ohne WebGL in jsdom (wie test_model.mjs)
// und arbeitet direkt mit den internen Funktionen der Seite (globalThis.TEST).
import assert from 'node:assert/strict';import * as THREE from 'three';import{loadTwin}from'./harness.mjs';
const{t,w,dom}=await loadTwin(['buildISS','buildPanels','MODEL','ORB','CMD','enterCmd','exitCmd','stepCmd','simInitOrbit','orbitElems','dragAccel','atmDensity','propagate','LINK']);t.buildISS();t.buildPanels();
const MU=398600.4418;
t.LINK.src='sim';t.ORB.s=t.simInitOrbit(Date.now());t.ORB.at=Date.now();t.enterCmd();t.CMD.radiatorAuto=false;
const a=()=>t.orbitElems(t.ORB.s).a;
// Dichte und Luftwiderstand in ISS-Höhe: richtige Größenordnung und Richtung.
const rho=t.atmDensity(415);assert.ok(rho>1e-12&&rho<6e-12,'density at 415 km '+rho);
const d=t.dragAccel(t.ORB.s,450000),v=t.ORB.s.slice(3);assert.ok(d[0]*v[0]+d[1]*v[1]+d[2]*v[2]<0,'drag opposes motion');
// Bahnanhebung um 1 m/s mit den Haupttriebwerken entlang +X (= Flugrichtung in LVLH-Lage).
const m=t.CMD.sys,s0=t.ORB.s.slice(),a0=a(),mass0=m.mass;
assert.ok(m.command('arm',true).ok);assert.ok(m.command('reboost',1.0).ok);
let n=0;while(m.prop.burn&&n<600){t.stepCmd(1);n++;}
assert.ok(!m.prop.burn,'burn completes');assert.ok(n>40&&n<140,'1 m/s takes ~75 s with two 3 kN engines on ~450 t: '+n+' s');
// Die oskulierende Halbachse schwankt über einen Umlauf um Kilometer (J2), daher Vergleich mit
// demselben Zeitraum ohne Schub.
const ref=t.orbitElems(t.propagate(s0,n)).a,a1=a()-ref+a0,expect=2*a0*a0*Math.sqrt(MU/a0)*0.001/MU;   // Δa = 2 a² v Δv / μ
assert.ok(Math.abs((a1-a0)-expect)/expect<0.03,`semi-major axis +${((a1-a0)*1000).toFixed(0)} m, expected +${(expect*1000).toFixed(0)} m`);
assert.ok(m.mass<mass0,'propellant is used');
// Antrieb wieder sperren; ab hier wirkt nur noch der Luftwiderstand.
m.command('arm',false);
// Ein Tag freier Flug: ~0,05-0,25 km Bahnabsenkung, wie bei der echten Station zwischen zwei Anhebungen.
const s2=t.ORB.s.slice();t.CMD.warp=600;for(let i=0;i<144;i++)t.stepCmd(1);
const decay=(t.orbitElems(t.propagate(s2,86400)).a-a())*1000;   // gegenüber demselben Tag ohne Luftwiderstand
assert.ok(decay>40&&decay<300,'drag decay per day '+decay.toFixed(0)+' m');
t.exitCmd();dom.window.close();
console.log(`PASS virtual orbit: 1 m/s reboost raises a by ${((a1-a0)*1000).toFixed(0)} m (theory ${(expect*1000).toFixed(0)} m), drag decay ${decay.toFixed(0)} m/day`);
