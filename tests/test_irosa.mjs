// test_irosa.mjs: Die beiden letzten iROSAs (2A, 3B) erscheinen zeitgesteuert: vorher unsichtbar,
// kurz vorher aufgerollt am Mast, dann Ausrollen über 10 min, danach vollständig. Für den geplanten
// Einsatz übernimmt der Zeitplan ein verschobenes Datum aus Launch Library 2.
// Lädt iss_twin.html ohne WebGL in jsdom (wie test_orbit_thrust.mjs).
import assert from 'node:assert/strict';import * as THREE from 'three';import{loadTwin}from'./harness.mjs';
const{t,w,dom}=await loadTwin(['buildISS','MODEL','VV','updateIrosa','irosaUnfurlAt','irosaRow','IROSA_LATE']);t.buildISS();
const g=t.MODEL.irosaLate,at=s=>Date.parse(s),r=(k,v)=>k+'='+v;
assert.deepEqual(Object.keys(g).sort(),['2A','3B'],'genau 2A und 3B sind zeitgesteuert');
// Alle acht Flügel tragen ein iROSA-Bauteil.
const names=t.MODEL.parts.filter(p=>p.kind==='irosa').map(p=>p.mesh.userData.name);
assert.equal(new Set(names).size,8,'acht iROSAs: '+names.join(', '));
// 2A: 29.10.2026, Ausrollen ab 16:20 UTC.
t.updateIrosa(at('2026-10-29T14:00:00Z'));assert.equal(g['2A'].visible,false,'2A vor dem Anbringen unsichtbar');
t.updateIrosa(at('2026-10-29T15:30:00Z'));assert.ok(g['2A'].visible&&g['2A'].scale.z<0.05,'2A angebracht, aufgerollt');
t.updateIrosa(at('2026-10-29T16:25:00Z'));assert.ok(g['2A'].scale.z>0.4&&g['2A'].scale.z<0.6,'2A halb ausgerollt: '+g['2A'].scale.z);
t.updateIrosa(at('2026-10-29T16:31:00Z'));assert.equal(g['2A'].scale.z,1,'2A vollständig');
assert.equal(g['3B'].visible,false,'3B am 29.10. noch nicht da');
// 3B: geplant 05.11.2026, Ausrollen geschätzt 17:23 UTC.
t.updateIrosa(at('2026-11-03T09:30:00Z'));assert.ok(g['2A'].visible&&!g['3B'].visible,'heute: 2A da, 3B noch nicht');
assert.match(t.irosaRow('3B',r),/planned/);assert.match(t.irosaRow('2A',r),/deployed/);
t.updateIrosa(at('2026-11-05T18:00:00Z'));assert.equal(g['3B'].scale.z,1,'3B nach dem Einsatz vollständig');
// Verschiebt LL2 den Einsatz (hier um einen Tag, nur Tagesgenauigkeit), wandert der Zeitpunkt mit.
t.VV.extra.upcoming_events=[{name:'US EVA-101',date:'2026-11-06T12:00:00Z',precision:'Day'}];
assert.equal(new Date(t.irosaUnfurlAt('3B')).toISOString(),'2026-11-06T17:23:00.000Z');
t.updateIrosa(at('2026-11-05T18:00:00Z'));assert.equal(g['3B'].visible,false,'verschobener Einsatz: am 05.11. noch nicht da');
// Mit genauer Startzeit gilt Beginn + 4 h 23 min.
t.VV.extra.upcoming_events=[{name:'US EVA-101',date:'2026-11-05T12:30:00Z',precision:'Minute'}];
assert.equal(new Date(t.irosaUnfurlAt('3B')).toISOString(),'2026-11-05T16:53:00.000Z');
dom.window.close();
console.log('PASS iROSA 2A/3B: zeitgesteuert (unsichtbar, aufgerollt, Ausrollen 10 min, vollständig), acht iROSAs, LL2-Verschiebung');
