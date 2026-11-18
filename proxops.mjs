/* proxops.mjs: Nahbereichsmanöver der Besuchsfahrzeuge (v1.19). Beschreibt, was ein Fahrzeug in den
   Minuten vor dem Andocken und nach dem Abdocken tut, als Abstand entlang der Andockachse des Ports
   über der Zeit, dazu Teilbewegungen (Nasenkappe des Dragon) und die Phase als Text.

   Zeitachse: t in Sekunden relativ zum Ereignis. Ankunft: t = 0 ist der Kontakt (Andockzeit aus
   Launch Library 2 bzw. dem Ereignisplan), t < 0 der Anflug. Abflug: t = 0 ist das Abdocken bzw. die
   Freigabe, t > 0 das Wegfliegen. Zwischen zwei Stützpunkten läuft der Abstand mit einer
   Smoothstep-Kurve, das Fahrzeug steht also an jedem Stützpunkt kurz still (Halten an einem
   Wegpunkt oder Ende eines Bremsmanövers).

   Quellen und Genauigkeit. Die Abläufe folgen den veröffentlichten Missionsabläufen (NASA-Blogs und
   Pressemappen zu Crew-/CRS-Flügen, Sojus/Progress, Cygnus und HTV-X):
   - Dragon (autonom, IDSS): Wegpunkt 1 etwa 220 m vor dem Port auf der Andockachse, Wegpunkt 2 bei
     20 m, Endanflug mit wenigen cm/s, weiches dann festes Ankoppeln. Abflug: Abdocken, eine Folge von
     Abflugzündungen, Austritt aus der 200-m-Sicherheitskugel (Keep-Out Sphere), Nasenkappe schließen.
   - Sojus/Progress (Kurs): Umfliegen und Halten in etwa 150-200 m auf der Portachse, Endanflug mit
     etwa 0,1-0,3 m/s. Abflug: Federn drücken mit etwa 0,1 m/s ab, nach etwa 3 min Trennzündung.
   - Cygnus/HTV-X (Einfangen und Anlegen): Anflug von unten (R-Bar) bis zum Einfangpunkt etwa 10 m
     unter der Station, Halt, Canadarm2 greift und setzt am CBM an. Abflug umgekehrt, Freigabe in etwa
     10 m, dann Abflugzündungen.
   Wegpunkte und Geschwindigkeiten sind gerundete Richtwerte, die einzelnen Zeitpunkte sind
   Schätzungen (je Flug verschieden) und als solche gekennzeichnet. Nur die Russen melden mit Kurs
   (RUSSEG000005/6) einen echten Abstand; liegt er vor, ersetzt er den geschätzten (siehe kursDistance).
   Vereinfachung: Der ganze Weg liegt auf der Andockachse; der Anflug von Wegpunkt 0 aus und das
   seitliche Umfliegen werden nicht gezeigt. Die Nasenkappe schließt in Wirklichkeit eher später; sie
   wird hier geschlossen, solange das Fahrzeug noch zu sehen ist (Schätzung).

   Reines Modul ohne three.js, damit es sich ohne Browser prüfen lässt. */

// Fahrzeugtyp der Seite (crewDragon, cargoDragon, starliner, cygnus, htvx, soyuz, progress) -> Ablauf
export const FAMILY = { crewDragon: 'dragon', cargoDragon: 'dragon', starliner: 'dragon', soyuz: 'kurs', progress: 'kurs', cygnus: 'berth', htvx: 'berth' };

// keys: [t s, Abstand m]; phases: [ab t s, Text]; cone: [Beginn, Ende] des Schließens (Abflug) in s.
export const SEQ = {
  dragon: {
    arrive: {
      keys: [[-3600, 400], [-2400, 220], [-1800, 220], [-900, 20], [-480, 20], [0, 0]],
      phases: [[-3600, 'Approach to waypoint 1 (220 m)'], [-2400, 'Holding at waypoint 1'], [-1800, 'Approach to waypoint 2 (20 m)'],
        [-900, 'Holding at waypoint 2'], [-480, 'Final approach'], [0, 'Soft capture, retracting to hard capture']],
      settle: 600,
    },
    depart: {
      keys: [[0, 0], [60, 3], [240, 20], [480, 60], [720, 200], [1080, 450]],
      phases: [[0, 'Undocked, backing away'], [60, 'Departure burns'], [720, 'Leaving the keep-out sphere (200 m)'], [780, 'Closing the nose cone']],
      cone: [780, 900],
    },
  },
  kurs: {
    arrive: {
      keys: [[-2400, 600], [-1080, 180], [-780, 180], [0, 0]],
      phases: [[-2400, 'Fly-around to the docking axis'], [-1080, 'Station keeping'], [-780, 'Final approach (Kurs)'], [0, 'Contact, hooks closing']],
      settle: 600,
    },
    depart: {
      keys: [[0, 0], [180, 20], [480, 150], [900, 500]],
      phases: [[0, 'Hooks open, springs push the vehicle away'], [180, 'Separation burn'], [480, 'Departing']],
    },
  },
  berth: {
    arrive: {
      keys: [[-9000, 250], [-7800, 30], [-7200, 10], [-5400, 10], [-900, 1], [0, 0]],
      phases: [[-9000, 'R-bar approach from below'], [-7200, 'Holding at the capture point (10 m)'], [-5400, 'Captured by Canadarm2, moving to the berthing port'],
        [-900, 'Berthing (CBM bolts)'], [0, 'Berthed']],
      settle: 0, arm: [-5400, 0],
    },
    depart: {
      keys: [[0, 0], [1800, 1], [3600, 10], [4200, 60], [5400, 400]],
      phases: [[0, 'Unberthed, Canadarm2 moves it to the release point'], [3600, 'Released, departure burns'], [4200, 'Departing']],
      arm: [0, 3600],
    },
  },
};

// Dauer vor dem Ereignis (Ankunft) bzw. danach (Abflug), in s.
export function lead(family) { return -SEQ[family].arrive.keys[0][0]; }
export function tail(family) { const k = SEQ[family].depart.keys; return k[k.length - 1][0]; }

const smooth = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
// Abstand entlang der Stützpunkte zur Zeit t (außerhalb: erster bzw. letzter Wert).
export function distanceAt(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, d0] = keys[i - 1], [t1, d1] = keys[i];
    if (t <= t1) return d0 + (d1 - d0) * smooth((t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1][1];
}
// Phase (Text) zur Zeit t.
function phaseAt(phases, t) { let p = phases[0][1]; for (const [t0, s] of phases) if (t >= t0) p = s; return p; }

/* Zustand eines Fahrzeugs im Ablauf kind ('arrive' | 'depart') zur Zeit t (s relativ zum Ereignis).
   Ergebnis: { active, done, d (m entlang der Portachse), cone (1 = Nasenkappe offen, 0 = zu), phase,
   arm (true, solange laut Ablauf Canadarm2 das Fahrzeug führt), speed (m/s, geschätzt) } oder
   { active: false } außerhalb des Ablaufs. kursRange (m) ersetzt bei 'kurs'-Fahrzeugen den Abstand. */
export function stateAt(type, kind, t, kursRange = NaN) {
  const family = FAMILY[type]; if (!family) return { active: false };
  const s = SEQ[family][kind]; if (!s || !isFinite(t)) return { active: false };
  const first = s.keys[0][0], last = s.keys[s.keys.length - 1][0];
  if (kind === 'arrive' && (t < first || t > (s.settle || 0))) return { active: false, done: t > 0 };
  if (kind === 'depart' && (t < 0 || t > last)) return { active: false, done: t > last };
  let d = distanceAt(s.keys, t);
  const measured = family === 'kurs' && isFinite(kursRange) && kursRange >= 0 && kursRange < 5000 && (kind === 'arrive' ? t < 0 : t > 0);
  if (measured) d = kursRange;
  const speed = (distanceAt(s.keys, t + 1) - distanceAt(s.keys, t - 1)) / 2;
  let cone = 1;
  if (kind === 'depart' && s.cone) cone = 1 - smooth((t - s.cone[0]) / (s.cone[1] - s.cone[0]));
  const arm = !!s.arm && t >= s.arm[0] && t < s.arm[1];
  return { active: true, done: false, d: Math.max(0, d), cone, phase: phaseAt(s.phases, t), arm, speed, measured, family };
}

/* Ordnet einen Text aus dem LL2-Ereignisplan einem An- oder Abflug zu: 'arrive', 'depart' oder null.
   LL2 nennt die Ereignistypen „Docking“, „Undocking“, „Berthing“, „Unberthing“ (und Freitext im Namen). */
export function eventKind(type, name) {
  const s = `${type || ''} ${name || ''}`.toLowerCase();
  if (/undock|unberth|departure|release|relocat/.test(s)) return 'depart';
  if (/\bdock|berth|arrival|capture/.test(s)) return 'arrive';
  return null;
}

/* Kurzkennungen eines Fahrzeugnamens zum Abgleich zwischen Quellen: „Crew-13“, „CRS-35“, „MS-35“,
   „NG-24“, „C211“, Eigenname („Grace“) usw., klein geschrieben. */
export function nameTokens(text) {
  const s = String(text || '').toLowerCase(), out = new Set();
  for (const m of s.matchAll(/\b(crew|crs|ms|ng|ax|htv-?x|c)[- ]?(\d{1,3})\b/g)) out.add(m[1].replace('-', '') + '-' + Number(m[2]));
  for (const m of s.matchAll(/\b(c\d{3})\b/g)) out.add(m[1]);
  for (const w of s.split(/[^a-z]+/)) if (w.length >= 4 && !STOP.has(w)) out.add(w);
  return out;
}
const STOP = new Set(['crew', 'dragon', 'cargo', 'soyuz', 'progress', 'cygnus', 'docking', 'undocking', 'berthing', 'unberthing', 'from', 'with', 'international',
  'space', 'station', 'harmony', 'forward', 'zenith', 'nadir', 'unity', 'module', 'port', 'spacecraft', 'mission', 'departure', 'arrival', 'capture', 'release',
  'vehicle', 'falcon', 'block', 'starliner', 'boeing', 'spacex', 'northrop', 'grumman', 'relocation', 'zvezda', 'poisk', 'rassvet', 'prichal']);
// Ob zwei Namen dasselbe Fahrzeug meinen (gemeinsame Missions- oder Seriennummer bzw. Eigenname).
export function sameVehicle(a, b) {
  const A = nameTokens(a), B = nameTokens(b);
  for (const x of A) if (B.has(x) && /-|\d/.test(x)) return true;       // Missionskennung gewinnt
  for (const x of A) if (B.has(x)) return true;
  return false;
}

/* Port eines geplanten Ereignisses aus Name und Beschreibung (Schlüssel wie VV_PORT_TYPES der Seite).
   free: Ports, die zur Ereigniszeit frei sind; types: VV_PORT_TYPES; type: Fahrzeugtyp. Ohne Nennung
   im Text der erste freie Port, der den Typ aufnehmen kann. */
export function portFromText(text, type, types, free) {
  const s = String(text || '').toLowerCase();
  const named = [[/harmony'?s? (forward|front)|forward port of harmony|ida-?2/, 'ida2'], [/harmony'?s? (zenith|space-facing)|zenith port of harmony|space-facing port of harmony|ida-?3/, 'ida3'],
    [/unity'?s? (nadir|earth-facing)|earth-facing port of unity|nadir port of unity/, 'unityNadir'], [/harmony'?s? (nadir|earth-facing)|earth-facing port of harmony|nadir port of harmony/, 'harmonyNadir'],
    [/zvezda|service module'?s? aft|aft port/, 'smAft'], [/rassvet|mrm-?1/, 'mrm1'], [/poisk|mrm-?2/, 'mrm2'], [/prichal/, 'prichal']];
  for (const [re, p] of named) if (re.test(s) && types[p]?.includes(type)) return p;
  return Object.keys(types).find(p => types[p].includes(type) && free.includes(p)) || null;
}

/* Geschwindigkeitsfaktor der Vorschau (Abspielen eines Ablaufs in der Oberfläche). */
export const PREVIEW_SPEED = 30;
