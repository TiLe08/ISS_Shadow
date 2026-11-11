# Tests

Alle Tests laufen ohne Netz und ohne Browserfenster. Sie laden die echte Seite und die echte
Bridge und arbeiten mit aufgezeichneten Live-Daten.

## Ausführen

Im Projektordner:

```sh
python -m unittest discover -s tests -v      # Python-Tests (oder: python -m pytest tests)
npm install                                   # einmalig: three, jsdom
npm test                                      # alle JavaScript-Suiten nacheinander
```

Node.js wird nur für die Entwicklertests gebraucht, nicht für den Betrieb des Dashboards. Stand v1.17:
14 JavaScript-Testdateien (16 PASS-Zeilen) und 24 Python-Tests, alle bestanden.
`tests/test_feed_integration.py` dauert etwa eine Minute und wird übersprungen, wenn `aiohttp`,
`amqtt`, `paho-mqtt` oder `lightstreamer-client-lib` fehlen.

**Wie die JavaScript-Tests die Seite laden.** `tests/harness.mjs` lädt `iss_twin.html` ohne Skripte
in **jsdom**, führt die klassischen Skripte des Projekts in dessen VM-Kontext aus und holt das
Modul-Skript per regulärem Ausdruck aus der Seite. Dessen `import`-Zeilen werden entfernt und durch
gleichnamige globale Objekte ersetzt (three.js, `iss-model.mjs`, `model-checks.mjs`); ein Export
`globalThis.TEST = { … }` macht die gewünschten internen Funktionen zugänglich. Canvas und WebGL sind
nachgebildet. So prüfen die Tests die tatsächlichen Funktionen der Seite, nicht eine Kopie. (Deshalb
darf im HTML außerhalb echter Skripte kein Text wie `<script type="module">` stehen, auch nicht in
Kommentaren.) Aufruf: `const { t, w } = await loadTwin(['buildISS', 'MODEL', …])`.

## JavaScript-Suiten (`npm test`)

| Datei | Prüft |
|---|---|
| `test_orbit_source.js` | `orbit-source.js`: Vorrang der Bahnquellen, Erholung, Ablauf, veraltete gespeicherte Werte, Wiedergabe, Jahreswechsel |
| `test_virtual_station.js` | `virtual-station.js`: 12 Düsen mit Kraft/Moment/Treibstoff, ausgeglichene Paare, freies Driften, Pulse, leerer Tank, Ziel-Brennvorgang, Batterie-Energiebilanz, Stromausfall, Kreiselgrenzen, Luftschleuse, Lebenserhaltung, Langlauf; Erfassung aus 30° auf allen Achsen, Erholung aus dem Taumeln, Entladen der Kreisel; Lage der Triebwerke am Heck von Swesda (drei Teile, je eine PASS-Zeile) |
| `test_model.mjs` | 3D-Modell und DOM: beide Arm-Anker, Mitbewegung mit dem MT, feste Verankerung, gezeichnete Normalen von Solarflügeln und Radiatoren (zwei volle simulierte Umläufe vom Telemetriestrom bis zum Mesh), Halbdrehung der äußeren Träger, Quaternion-Führung, Radiator-Schwenkbereich ohne Lücken und Kollisionen, Falten, Kollisionsdetektor, Kachelgeometrie, abgeschaltete Antriebe, Regler, Pause, echte DOM-Handler |
| `test_ui.mjs` | Oberfläche: NASA-Rückfall, Erholung der Live-Daten, Ablauf, Isolierung der Kommando-Abspaltung, Simulator, fehlende Pose, Kanal-Browser, Dashboard, Widgets jeder Kanalart, Dekodierung (u. a. Stationsmodus 16 = EXTERNAL OPS, russischer Modus 7 = STANDARD, 3 = REBOOST), Sprachen (gleiche Schlüssel in allen Tabellen) |
| `test_window_frame.mjs` | `window-frame.mjs`: Verschieben im sichtbaren Bereich, Größenänderung an allen acht Kanten und Ecken mit Mindestgröße und fester Gegenkante, Zurückholen nach Verkleinern des Browserfensters |
| `test_planet.mjs` | `earth-tiles.mjs`: keine überlappenden Detailstufen bei Kacheln, die in beliebiger Reihenfolge eintreffen; begrenzter Cache; Wechsel Foto/Radar |
| `test_regression.mjs` | Regressionen seit v1.0: exakte Überlappungsprüfung, Nutzlastplätze S3/P3, Dextre/ERA, vollständige Alpha/Beta-Abstandsprüfung, Live-Schnappschuss 14.10. (Konventionen gegen die Sonne, Einheiten, Zeitstempel-Epoche), Autotrack-Daten 20.10. (SARJ-Ziel, jeder Flügel zur Sonne, Ku auf TDRS), Live-Robotik 19.10., Zeitbasis (fremde Epoche, eingefrorener Schnappschuss, PC-Uhr 45 s daneben), Watchdog, späte Callbacks gestoppter Clients, **bei NASA eingefrorener Feed** (21.10.: Uhr 11,5 h zurück → STALE ab dem ersten Schnappschuss), Vorhersage über Datenlücken, Besuchsfahrzeuge (LL2, Manifest, russische Flags), Dashboard-Struktur, Trenner, Kommandofenster, zerlegter Zeitraffer |
| `test_arm_walk.mjs` | Umsetzen von Canadarm2 über die echten Schaltflächen: Plan → koordinierte Bewegung → Greifen → Lösen, von Node 2 (LEE B) zu MBS PDGF3 (LEE A) und zurück, Sperre bei beidseitigem Greifen, kein Sprung beim Basiswechsel, Ablehnung unerreichbarer Ziele |
| `test_irosa.mjs` | Zeitsteuerung der iROSAs 2A und 3B (unsichtbar, aufgerollt, halb ausgerollt, vollständig), acht iROSA-Bauteile, Übernahme eines verschobenen Einsatzdatums aus Launch Library 2 |
| `test_orbit_thrust.mjs` | Bahnwirkung: Dichte und Richtung des Luftwiderstands, 1 m/s Anhebung → Δa = 1775 m (Theorie 1775 m), Treibstoffverbrauch, Absenkung durch Luftwiderstand pro Tag (40-300 m, ergibt ~94 m) |
| `test_radiators.mjs` | Hauptradiatoren: Rollen um die X-Achse (kein Klappen), Maße 22 m × 10,9 m, Vorzeichen mit den Live-Werten vom 10.11.2026, Regelziel bei Sonne und im Schatten, Vorzeichenprüfung aus Autotrack-Daten (bestätigen und umkehren), Freiraum über ±105° für beide Seiten, Abstand zu Bishop |
| `test_zfight.mjs` | `zfight.mjs` sucht deckungsgleiche, verschieden aussehende, von derselben Seite sichtbare Flächen: Selbsttest des Prüfers, Grundstellung, drei Gelenkstellungen, jedes Fahrzeug an jedem Port; in Solid keine Linien auf Flächen |
| `test_cameras.mjs` | Sichtfelder der Optiken gegen die NASA-Werte, Einbaustellen der Kameraports, Einbett-Adressen, Stream-Auswahl, Einpassen des Bildformats |
| `test_payloads.mjs` | Greifen, Bewegen und Absetzen von Bishop, Platzhalter für unbekannte Nutzlasten, POA und OTCM, EV-Luke, Swesda-Flügel, Lage der virtuellen Station über 12 h |

## Python-Tests

| Datei | Prüft |
|---|---|
| `test_timebase.py` | `bridge.TimeBase` und `feed_lag_h`: Standardepoche (31. Dezember), kleiner Verzug, eingefrorener Schnappschuss ist kein Tick, PC-Uhr 40 s daneben bleibt frisch, fremde Epoche wird korrigiert und Stillstand erkannt, stehende Uhr bleibt veraltet, Epochensprung wird sofort neu gelernt, eingefrorener Feed vor dem Lernen (21.10.: 11,5 h) |
| `test_ephemeris.py` | `ephemeris.py`: Einheiten und Endpunkte, Hermite-Interpolation gegen eine exakte Kreisbahn (< 110 m), abgelaufene/falsche/beschädigte Produkte, keine Interpolation über Lücken, zu alte Produkte, Cache bei Abruffehlern, defekter Download ersetzt den Cache nicht |
| `test_vehicles.py` | `vehicles.py` mit nachgebildetem Abrufer: alle vier Feeds werden ausgewertet, Anfragebudget, Cache über Neustarts, Wartezeiten nach Fehlern und Ratenlimit |
| `test_channel_audit.py` | Seite und Bridge abonnieren genau die öffentlichen Kanäle aus `public_channels.json` |
| `test_streams.py` | `streams.py` an nachgebildeten YouTube-Seiten und einer Antwort der Sen-Schnittstelle (Aufbau vom 11.11.2026): nur laufende Streams, beide Seitenformate, Sen-Schnittstelle zuerst, Reihenfolge, Verhalten bei Fehlern |
| `test_feed_integration.py` | Integration: echte Bridge gegen den Mock-Server und einen echten MQTT-Broker: Stille bei offener Sitzung (STALE, Neuaufbau), Verbindungsabbruch mit Serverausfall, PC-Uhr 40 s daneben, fremde Epoche |

## Hilfsprogramm und Testdaten

| Datei | Inhalt |
|---|---|
| `harness.mjs` | Gemeinsamer Aufbau der JavaScript-Tests (`loadTwin`), auch vom Viewer-Export genutzt |
| `zfight.mjs` | Prüfer für flimmernde Flächen (`coplanarOverlaps`) |
| `mock_isslive.py` | Nachgebildeter ISSLive-Lightstreamer-Server (Teilmenge TLCP 2.5.0) mit Steuer-Endpunkten `/admin/freeze`, `silent`, `thaw`, `drop`, `down?s=N`, `skew?s=N`, `epoch?h=H`, `set?item=PUI&v=WERT`, `stats`. Auch für Vorführungen ohne Netz nutzbar (siehe [BEDIENUNG.md](BEDIENUNG.md)) |
| `live_sample_20261014.json` | ISSLive-Schnappschuss 14.10.2026 (SARJs geparkt, BGAs nachführend): Gelenkkonventionen, Einheiten, Robotik-Pose an Node 2 |
| `live_sample_20261020.json` | 11 min ISSLive am 20.10.2026, beide SARJs im Autotrack: Kalibrierung von SARJ und BGA gegen die Sonne, Antennen auf TDRS, Robotik an MBS PDGF3 |
| `live_report_20261019.json` | Überlappungsbericht vom 19.10.2026 (Canadarm2 an MBS PDGF3, LEE A als Basis): Regressionstest der MSS-Kalibrierung |
| `live_feed_20261026.json` | Messung des Feeds vom 26.10.2026 (Uhr-Updates pro Sekunde, Lücken, Verzug unter beiden Epochen, Modi): Beleg für Zeitbasis und Stationsmodus |
| `ll2_docking_sample.json` | Aufgezeichnete Listenantwort der LL2-Andockereignisse (gekürzt, mit einer Tiangong-Zeile zum Filtertest) |
| `ll2_station_sample.json` | Aufbau der LL2-Antworten für Station, Ereignisse und Starts |
| `public_channels.json` | Festgehaltenes Kanalverzeichnis: Herkunft (Repository-Stand, SHA-256 des Arbeitsblatts) und alle eindeutigen PUIs |

Die Hinweise in den JSON-Dateien stehen jeweils im Feld `_note`.

## Was nicht automatisch getestet wird

Vollständiges WebGL-Rendering in einem echten Browser, das Nachladen hochauflösender Kacheln von
NASA GIBS und der Start per Doppelklick unter Windows. Das bleiben manuelle Prüfungen auf dem
Zielrechner.
