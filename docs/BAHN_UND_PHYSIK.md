# Bahn und Physik

Dieses Dokument beschreibt, woher die Bahn der Station kommt, wie sie weitergerechnet wird und was die
virtuelle Station im Kommandomodus physikalisch nachbildet.

## Bahnquellen

Die Bahn ist ein Zustandsvektor `s = [x, y, z, vx, vy, vz]` in km bzw. km/s im Inertialsystem
(J2000/EME2000). Welche Quelle gilt, entscheidet `OrbitData.choose()` in `orbit-source.js`, einer
eigene Datei ohne Abhängigkeiten, damit dieselbe Logik im Browser und in den Node-Tests läuft:

1. **LIVE TELEMETRY ORBIT**: der Zustandsvektor aus ISSLive (`USLAB000032-37`). Bedingung: alle sechs
   Komponenten höchstens 30 s alt, ihre Zeitstempel höchstens 5 s auseinander, und das Signal ist AOS
   (im Simulator und bei Wiedergabe entfällt die Signalbedingung). Die Einheit wird an der
   Größenordnung erkannt (ISSLive liefert km und m/s, obwohl das Arbeitsblatt FT nennt; `toKm`).
2. **NASA PREDICTED ORBIT**: die offizielle Vorhersage von NASA/JSC (OEM, siehe unten), wenn sie
   gültig ist: Bezugssystem EME2000, km und km/s, Zeitpunkt im Gültigkeitsbereich, Zustand höchstens
   20 s alt, Produkt höchstens 48 h alt.
3. **PROPAGATED · STALE TLM**: Fällt beides weg, wird ein früherer gemessener Zustand höchstens fünf
   Minuten weitergerechnet und nach 30 s als veraltet markiert. Danach ist die Bahn nicht verfügbar.
4. **SIMULATED / RECORDED / VIRTUAL ORBIT**: Simulator, Wiedergabe und Kommandomodus sind eigene
   Quellen; NASA-Daten überschreiben eine kommandierte Bahn nie.

**Hysterese** (`updateOrbit`): ISSLive sendet eine Komponente des Zustandsvektors nur bei Änderung,
deshalb fällt der Telemetrievektor ab und zu für ein paar Sekunden aus. Er wird bis zu 30 s weiter
propagiert, statt zur NASA-Vorhersage und zurück zu springen; ein Quellenwechsel wird erst nach 10 s
Bestand protokolliert.

Das Abzeichen der Bahn in der oberen Leiste nennt die Quelle; der Tooltip zeigt bei NASA-Daten
Erstellungsdatum, Gültigkeit und Cache-Zustand.

## NASA-Bahnvorhersage (OEM)

`ephemeris.py` lädt die öffentliche Datei
`https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt`
(NASA/JSC/FOD/TOPO, kein API-Schlüssel). OEM = CCSDS *Orbit Ephemeris Message*: Stützstellen (Zeit,
Position, Geschwindigkeit), normalerweise alle vier Minuten, über mehrere Tage.

- Laden beim Start, alle 30 min neu, nach Fehlern nach 60 s erneut; Cache `cache/iss_oem.txt`.
- Geprüft wird: UTC, EME2000/J2000, Erde als Zentrum, Objekt ISS (1998-067-A), plausible Beträge
  (6400-8000 km, 6-9 km/s), streng steigende Zeiten.
- Position **und** Geschwindigkeit werden gemeinsam mit kubischen Hermite-Polynomen interpoliert.
- Abgelehnt werden Produkte älter als 48 h, Zeiten außerhalb des Gültigkeitsbereichs, Lücken über
  10 min und Interpolation über Segmentgrenzen. Keine unbegrenzte Extrapolation.
- Veröffentlicht alle 5 s auf `iss/orbit` (MQTT) und unter `http://localhost:8137/__orbit` (HTTP),
  mit `source: "NASA_OEM"`, `kind: "predicted"`, `state`, `epoch`, `created`, `valid_from`,
  `valid_to`, `cached`, `error`. Vorhersagen landen nie unter `iss/tm/<PUI>`, im CSV oder im
  Telemetriespeicher.

## Bahnrechnung

In `iss_twin.html` (Abschnitt „Bahn“):

- **Kraftmodell:** Zweikörperproblem plus Abplattung der Erde (J2 = 1,08262668·10⁻³),
  μ = 398600,4418 km³/s², Erdradius 6378,137 km.
- **Integrator:** klassisches Runge-Kutta 4. Ordnung (`rk4`), Schritte höchstens 10 s, auch rückwärts
  (`propagate(s, dt, extraFn)`). `extraFn(st)` liefert eine Zusatzbeschleunigung in km/s² (Schub,
  Luftwiderstand).
- **Umrechnungen:** `eciToGeo` (ECI → geografische Länge, geodätische Breite nach WGS84, Höhe),
  `lvlhBasis`, `orbitElems` (große Halbachse, Exzentrizität, Neigung, Apogäum/Perigäum, Umlaufzeit),
  `inShadow` (zylindrisches Schattenmodell), Sonnenrichtung mit geringer Genauigkeit (~0,01°).
- **Bodenspur und Überflüge:** Die Karte rechnet die Spur voraus und sucht den nächsten Überflug über
  der Bodenstation (Elevation > 10°) innerhalb von 24 h. Weil die Vorausrechnung keine geplanten
  Manöver kennt, kann sie um eine Bahnanhebung herum von der offiziellen OEM abweichen.

### Luftwiderstand (seit v1.11)

Nur für die virtuelle Station. Im Schattenmodus folgt die Bahn der Telemetrie bzw. der
NASA-Vorhersage, die den Widerstand schon enthalten.

```
a_D = −½ · ρ(h) · (Cd·A / m) · |v_rel| · v_rel
v_rel = v − ω_E × r          (Geschwindigkeit relativ zur mitrotierenden Atmosphäre)
```

- Dichte ρ(h) aus exponentiellen Bändern nach Vallado (mittlere Sonnenaktivität, `DRAG_BANDS`,
  `atmDensity`): etwa 3·10⁻¹² kg/m³ bei 415 km.
- Cd·A = 2,2 × 1500 m² (`CDA`), m = aktuelle Masse der virtuellen Station (~450 t, sinkt mit dem
  Treibstoff).
- Ergebnis: etwa 94 m/Tag Absenkung der großen Halbachse bei 415 km, in der Größenordnung der echten
  ISS (0,05-0,25 km/Tag je nach Sonnenaktivität).

Nicht modelliert: wechselnde Sonnenaktivität, Querschnittsfläche abhängig von Lage und
Flügelstellung, Mond und Sonne als Störkörper.

### Schub auf die Bahn

Im Kommandomodus koppelt `stepCmd` die Triebwerke der virtuellen Station an die Bahn: Die Schubkraft
im Körpersystem wird über die aktuelle Lage nach LVLH und weiter nach ECI gedreht, durch die Masse
geteilt und zusammen mit dem Luftwiderstand als Zusatzbeschleunigung an `propagate` übergeben.
Überprüfung im Test `tests/test_orbit_thrust.mjs`:

- 1 m/s Bahnanhebung mit den Haupttriebwerken entlang +X (Flugrichtung in LVLH-Lage) erhöht die große
  Halbachse um **1775 m**; die Theorie Δa = 2a²vΔv/μ ergibt ebenfalls 1775 m (verglichen wird mit
  derselben Zeitspanne ohne Schub, weil J2 die oskulierende Halbachse über einen Umlauf um Kilometer
  schwanken lässt).
- Bei zwei Haupttriebwerken mit je 3,07 kN und ~450 t dauert 1 m/s etwa 75 s.
- Rückwärts ausgerichtet (−XVV) senkt derselbe Brennvorgang die Bahn.

Der Integrator der virtuellen Station akzeptiert höchstens 120 s pro Aufruf; hohe Zeitraffer (bis
300×) und langsame Bilder werden in Teilstücke zerlegt.

## Die virtuelle Station (`virtual-station.js`)

Beim Betreten des Kommandomodus (`enterCmd`) wird der aktuelle Live-Zustand in eine
`VirtualStation.Station` kopiert. Ab dann reagiert das Modell nur noch auf Kommandos; Live-Daten
können es nicht überschreiben. 136 Kanäle erhalten virtuelle Werte (Abschnitt „virtuelle
Telemetrie“ in `iss_twin.html`), die übrigen behalten ihren Wert vom Zeitpunkt der Abspaltung (FROZEN REFERENCE).

Einheiten intern SI (m, kg, s, N, N·m, rad), Leistung in kW.

| Teilsystem | Modell | Kenndaten |
|---|---|---|
| **Lage** | Quaternion, Hauptträgheitsachsen, Kreiselkopplung, Gravitationsgradient | Trägheit 8,5·10⁷ / 1,3·10⁸ / 1,4·10⁸ kg·m² |
| **CMG** | vier Kreisel als begrenzte Drehimpuls-Aktuatoren, einzeln schaltbar, Auslaufen, Fehler | 6600 U/min, 4760 N·m·s und 258 N·m je Kreisel (NASA NTRS 20100021932) |
| **Lagedüsen** | zwölf idealisierte RCS-Düsen am Heck von Swesda, paarweise um jede Achse; Pulse | 130 N je Düse, Isp 220 s |
| **Haupttriebwerke** | zwei Triebwerke am Heck von Swesda, Schub entlang +X | 3,07 kN je Triebwerk, Isp 300 s |
| **Treibstoff** | endlich, Masse sinkt mit dem Verbrauch | 800 kg, Nachschub per Szenario |
| **Energie** | acht Flügel-/Batteriekanäle mit Sonneneinfall, Erdschatten, Verbrauch, Ladung, Verlusten | Lehrparameter |
| **Thermal** | zwei zusammengefasste Kreise (A/B), Pumpen, Ventile, Radiatoren, Kabinenwärme | Lehrparameter |
| **Lebenserhaltung** | Stoffwechsel der Crew, O₂-Erzeugung, CO₂-Entfernung, Wasser, Urin, Luftschleuse mit Druckverriegelung | Lehrparameter |

**Regelung.** `mode` ist `hold` (Lagehaltung auf das Ziel `target`) oder `free` (freies Driften). Die
Regelung nutzt eine mit dem Drehimpuls verträgliche Zielrate und verteilt zuerst begrenztes
CMG-Moment; nur den Rest übernehmen die Düsen (wenn freigegeben). Sättigen die Kreisel, entlädt der
Regler sie über die Düsen. Ohne freigegebene Düsen können große Manöver simulierte Stunden dauern.

**Geführte Lageregler** (Vorgabe) sind eine kinematische Lernhilfe: Die Lage dreht direkt mit
0,1°/s auf kürzestem Quaternion-Weg zum Ziel, ohne Raten aufzubauen. Ausgeschaltet gilt die
physikalische Dynamik.

**Schnittstelle:** `new Station(seed)`, `command(action, value)` (z. B. `'arm'`, `'reboost'`,
`'cmg.2.motor'`, `'jet.5.pulse'`), `tick(dt, env)` mit Umgebung (Beleuchtung je Flügel, Sonneneinfall,
Radiatoren, Bahnradius), `snapshot()`. Die Bedienelemente im Kommandofenster (`virtual-controls.js`)
tragen genau diese Befehlsnamen als `data-action` bzw. `data-command`.

Gelenke (SARJ, BGA, TRRJ, Antennen, Transporter, Canadarm2, Dextre) bewegen sich im Kommandomodus mit
begrenzten Raten etwa wie die echten (`slewLin`); der Canadarm2 folgt beim Umsetzen dem geplanten Weg
(siehe [MODELL_UND_KALIBRIERUNG.md](MODELL_UND_KALIBRIERUNG.md)).

## Grenzen

Die virtuelle Station ist ein ingenieurmäßiges Lehrmodell, keine Flugsoftware: keine echte
Doppelkardan-Steuerung der CMGs, keine Strukturdynamik, keine wandernden Schwerpunkte, keine
aerodynamischen Momente, keine detaillierte Strömungs- oder Batteriephysik. Düsen-IDs und -Lagen sind
Konstrukte des Simulators. Ausführlich in [../COVERAGE.md](../COVERAGE.md).
