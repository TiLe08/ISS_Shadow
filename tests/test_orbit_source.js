// test_orbit_source.js: Tests für orbit-source.js: Auswahl der Bahnquelle (Telemetrie-Zustandsvektor,
// NASA-Vorhersage, Simulator), Rückfall nach Datenlücken, Ablauf, veraltete gespeicherte Werte,
// Wiedergabe und Jahreswechsel.
const assert = require('node:assert/strict');
const O = require('../orbit-source.js');
const now = Date.UTC(2026,9,8,10), hours = (now-Date.UTC(2026,0,1))/3600000;
const state = [6790,0,0,0,7.66,0];
const oem = {source:'NASA_OEM',available:true,state,frame:'EME2000',units:'km,km/s',epoch:now/1000,created:now/1000-3600,valid_from:now/1000-86400,valid_to:now/1000+86400};
const tm = new Map(state.map((num,i)=>['USLAB0000'+(32+i),{num:num*1000/0.3048,ts:hours,rx:now,source:'ISSLIVE'}]));
assert.equal(O.choose(new Map(),oem,'mqtt','LOS',now).source,'NASA_OEM');
assert.equal(O.choose(tm,oem,'mqtt','AOS',now).source,'ISSLIVE');
assert.equal(O.choose(tm,oem,'mqtt','LOS',now).source,'NASA_OEM');
assert.equal(O.choose(new Map(),oem,'sim','AOS',now),null);
assert.equal(O.choose(new Map(),{...oem,valid_to:now/1000-1},'mqtt','LOS',now),null);
assert.equal(O.choose(new Map(),{...oem,epoch:now/1000-21},'mqtt','LOS',now),null);
assert.equal(O.choose(new Map(),{...oem,created:now/1000-49*3600},'mqtt','LOS',now),null);
assert.equal(O.choose(new Map(),{...oem,state:[NaN,0,0,0,0,0]},'mqtt','LOS',now),null);
for(const t of tm.values()) t.ts-=1; // jetzt gelieferte, aber alte (retained) Werte müssen veraltet bleiben
assert.equal(O.choose(tm,oem,'mqtt','AOS',now).source,'NASA_OEM');
assert.ok(O.age(tm.values().next().value,now)>30000);
const jan1=Date.UTC(2027,0,1,0,0,5);
assert.equal(O.measuredAt(8759.999,jan1),Date.UTC(2026,0,1)+8759.999*3600000);
for(const t of tm.values()) t.source='REPLAY';
assert.equal(O.choose(tm,null,'mqtt','LOS',now).source,'REPLAY');
console.log('PASS: selection, recovery, expiry, stale retained samples, replay, year rollover');
