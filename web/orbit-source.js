/* orbit-source.js: Regeln, welche Bahnquelle gilt und wie alt ein Messwert ist.

   Ohne Abhängigkeiten, damit dieselbe Logik im Browser (window.OrbitData) und in den
   Node-Tests (require) läuft. Drei Bahnquellen gibt es:
     ISSLIVE:     Zustandsvektor aus der Live-Telemetrie (USLAB000032..37), Vorrang,
                solange alle sechs Komponenten frisch (<= 30 s) und gleichzeitig sind;
     NASA_OEM:    NASA-Bahnvorhersage (OEM-Datei), vom Launcher geladen, als Ersatz;
     SIM/REPLAY:  Simulator bzw. Wiedergabe einer Aufzeichnung. */
(function (root) {
  'use strict';
  // Höchstalter eines Messwerts, damit er als aktuell gilt (Millisekunden).
  const FRESH_MS = 30000;
  // ISSLive-Zeitstempel (Stunden seit Jahresbeginn, nach der Zeitbasis-Korrektur) in
  // Unix-Millisekunden umrechnen; rx = Empfangszeit bestimmt das Jahr.
  function measuredAt(hours, rx) {
    if (!Number.isFinite(hours) || hours < 0 || hours > 8784) return NaN;
    const year = new Date(rx).getUTCFullYear();
    // Jahr um den Jahreswechsel herum so wählen, dass ein Wert vom Vorjahr nicht als neu gilt.
    return [year - 1, year, year + 1].map(y => Date.UTC(y, 0, 1) + hours * 3600000)
      .sort((a, b) => Math.abs(a - rx) - Math.abs(b - rx))[0];
  }
  // Alter eines Telemetriewerts in ms: das Größere aus Empfangsalter und Messalter.
  // Werte aus der Zukunft (> 5 s) gelten als unbrauchbar (Infinity).
  function age(t, now) {
    if (!t || !Number.isFinite(t.rx)) return Infinity;
    if (t.source === 'SIM') return Math.max(0, now - t.rx);
    const at = measuredAt(t.ts, t.rx);
    if (!Number.isFinite(at) || at > now + 5000 || t.rx > now + 5000) return Infinity;
    return Math.max(0, now - t.rx, now - at);
  }
  /* Die NASA-Kanalliste nennt für USLAB000032-37 die Einheiten FT und FT/S, ISSLive liefert aber
     km und m/s (geprüft am 14.10.2026: |r| = 6790, |v| = 7666). Die Einheit wird deshalb an der
     Größenordnung erkannt statt am Etikett; Rückgabe in km und km/s oder null. */
  function toKm(raw) {
    if (!raw.every(Number.isFinite)) return null;
    const R = Math.hypot(raw[0], raw[1], raw[2]), V = Math.hypot(raw[3], raw[4], raw[5]);
    const pick = (mag, lo, hi, factors) => factors.find(f => mag * f > lo && mag * f < hi);
    const fr = pick(R, 6400, 8000, [1, 1e-3, 0.3048e-3]), fv = pick(V, 6, 9, [1, 1e-3, 0.3048e-3]);
    if (fr === undefined || fv === undefined) return null;
    return [raw[0] * fr, raw[1] * fr, raw[2] * fr, raw[3] * fv, raw[4] * fv, raw[5] * fv];
  }
  // Bahnquelle auswählen: zuerst der frische Live-Zustandsvektor (nur bei AOS), sonst die
  // NASA-Vorhersage, sofern sie gültig, aktuell und plausibel ist; sonst null.
  function choose(tm, oem, src, signal, now) {
    const samples = ['32', '33', '34', '35', '36', '37'].map(k => tm.get('USLAB0000' + k));
    const replay = samples.every(t => t?.source === 'REPLAY');
    if (samples.every(t => t && Number.isFinite(t.num) && (replay ? now - t.rx : age(t, now)) <= FRESH_MS)
        && (src === 'sim' || replay || signal === 'AOS')) {
      const times = samples.map(t => replay ? t.rx : measuredAt(t.ts, t.rx));
      if (Math.max(...times) - Math.min(...times) <= 5000) {
        const state = toKm(samples.map(t => t.num));
        if (state) {
          return {state, epoch: Math.max(...times), source: replay ? 'REPLAY' : src === 'sim' ? 'SIM' : 'ISSLIVE',
            key: samples.map(t => t.rx + ':' + t.num).join('|')};
        }
      }
    }
    if (src !== 'sim' && oem?.available && oem.source === 'NASA_OEM' && oem.frame === 'EME2000'
        && oem.units === 'km,km/s' && Array.isArray(oem.state) && oem.state.length === 6
        && oem.state.every(Number.isFinite) && now >= oem.valid_from * 1000 && now <= oem.valid_to * 1000
        && now - oem.epoch * 1000 <= 20000 && now - oem.epoch * 1000 >= -5000
        && now - oem.created * 1000 <= 48 * 3600000 && now - oem.created * 1000 >= -300000) {
      return {state: oem.state.slice(), epoch: oem.epoch * 1000, source: 'NASA_OEM', key: String(oem.epoch)};
    }
    return null;
  }
  // Öffentliche Schnittstelle (Browser: window.OrbitData, Node: module.exports).
  const api = {age, measuredAt, choose, toKm, FRESH_MS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrbitData = api;
})(globalThis);
