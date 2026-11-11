# Architektur von ISS Shadow

Dieses Dokument erklärt, aus welchen Teilen das Projekt besteht, wie die Daten von der ISS bis auf
den Bildschirm laufen und wo im Code was passiert. Es ist der beste Einstieg für jemanden, der das
Projekt übernimmt. Die übrigen Dokumente vertiefen einzelne Themen:

| Dokument | Inhalt |
|---|---|
| [TELEMETRIE.md](TELEMETRIE.md) | NASA ISSLive, Kanäle (PUIs), Zeitstempel, AOS/LOS/STALE, Dekodierung, MQTT-Topics |
| [MODELL_UND_KALIBRIERUNG.md](MODELL_UND_KALIBRIERUNG.md) | 3D-Modell, Koordinatensysteme, Gelenkkalibrierung, Canadarm2, Kollisionsprüfung |
| [BAHN_UND_PHYSIK.md](BAHN_UND_PHYSIK.md) | Bahnquellen, Bahnrechnung, Luftwiderstand, virtuelle Station |
| [BEDIENUNG.md](BEDIENUNG.md) | Rundgang durch die Oberfläche |
| [TESTS.md](TESTS.md) | Jede Testdatei und jede Testdatendatei |
| [WEITERENTWICKLUNG.md](WEITERENTWICKLUNG.md) | Typische Änderungen, Konventionen, Fehlersuche |
| [../GEOMETRY.md](../GEOMETRY.md) | Herkunft jeder Koordinate, Prüfungen gegen Live-Daten |
| [../COVERAGE.md](../COVERAGE.md) | Was abgedeckt ist und wo die Grenzen liegen |
| [../CHANGELOG.md](../CHANGELOG.md) | Änderungen je Version |

## Worum es geht

ISS Shadow ist ein **digitaler Schatten** der Internationalen Raumstation: Eine Webseite zeigt die
Station als 3D-Modell, deren Gelenke (Solarflügel, Radiatoren, Canadarm2, Dextre, Antennen) und Lage
aus der öffentlichen NASA-Telemetrie gestellt werden, dazu Bahn, Bodenspur, Erdkugel und Panels mit
allen 337 öffentlichen Kanälen. Im **Kommandomodus** wird daraus ein **digitaler Zwilling**: Die
aktuelle Station wird in ein Physikmodell abgespalten, das man steuern kann (Lage, Triebwerke,
Energie, Gelenke, Robotik). Die echte ISS wird dabei nie kommandiert.

Das Projekt entstand als Fallstudie („Digital twin case study · THU“) und erfüllt die
Kursanforderungen: automatische Aktualisierung über MQTT (Schatten), Zustandsüberwachung (Panels,
Kanal-Browser), optional Zwilling (Kommandomodus), Visualisierung, Simulation/Vorhersage und
Protokollierung.

## Bausteine

```
                         ISS ── S/Ku-Band ──▶ MCC Houston ──▶ NASA ISSLive (Lightstreamer)
                                                                   │  push.lightstreamer.com
                              ┌────────────────────────────────────┼───────────────────────┐
                              │ Modus „MQTT“ (Vorgabe)             │ Modus „Live“          │
                              ▼                                    │                       │
   ┌──────────────── launcher.py (ein Hintergrundprozess) ───────┐ │                       │
   │  bridge.py ── Lightstreamer ─▶ MQTT  iss/tm/<PUI>, iss/link │ │                       │
   │     │  logs/iss_tm_JJJJMMTT.csv, logs/commands.jsonl        │ │                       │
   │  ephemeris.py ◀─ NASA OEM (HTTPS) ─▶ iss/orbit, /__orbit    │ │                       │
   │  vehicles.py  ◀─ Launch Library 2 ─▶ /__vehicles            │ │                       │
   │  MQTT-Broker (amqtt) 1883 TCP / 9001 WebSocket              │ │                       │
   │  Webserver 8137 (liefert die Projektdateien aus)            │ │                       │
   └──────────────┬──────────────────────────────────────────────┘ │                       │
                  │ MQTT über WebSocket, HTTP                      ▼                       │
                  └─────────────▶  iss_twin.html (Browser)  ◀──────┘   Modus „Sim“: interner
                                   Schatten + virtueller Zwilling        Simulator, kein Netz
                                   iss/cmd/<Ziel> ─▶ Bridge ─▶ iss/ack/<id>
```

**Im Browser** (alles statische Dateien, kein Build-Schritt):

| Datei | Aufgabe |
|---|---|
| `iss_twin.html` | Die Anwendung: Gerüst, CSS und das Modul-Skript mit Telemetrie-Empfang, Zeitbasis, Bahn, 3D-Modell, Kalibrierung, Kommandomodus, Canadarm2-Umsetzen, Karte und Hauptschleife |
| `orbit-source.js` | Regeln, welche Bahnquelle gilt und wie alt ein Messwert ist (`window.OrbitData`) |
| `virtual-station.js` | Physikmodell der virtuellen ISS für den Kommandomodus (`window.VirtualStation`) |
| `virtual-controls.js` / `.css` | Gerätebedienung der virtuellen Station im Kommandofenster (`window.VirtualControls`) |
| `widgets.js` | Anzeigebausteine für Kanäle: Wert, Graph, Balken, Anzeige, Zeigerinstrument, Lampe (`window.ISSW`) |
| `workspace.js` | Kanalmenü, Kanal-Browser und modulares Dashboard (`window.ISSWorkspace`) |
| `channel-meta.js` | Zusatzangaben zu Kanälen: Einheiten, Statustexte, Wertebereiche (`window.CHANNEL_META`) |
| `i18n.js`, `i18n-strings.js` | Übersetzung der Oberfläche in sechs Sprachen (`window.I18N`); die Tabellen werden aus `tools/strings-*.tsv` erzeugt |
| `iss-model.mjs` | Das prozedurale 3D-Modell: `MODEL`, Materialien für Holo und Solid, Bauteil-Fabrik, Druckmodule, Träger, Solarflügel, Radiatoren, Besuchsfahrzeuge, Canadarm2, Dextre (`buildStation`), Montagekonventionen (`solarNormal`, `radiatorNormal`) |
| `model-checks.mjs` | Radiator-Zielwinkel und Kollisionsprüfung (Sweep-and-Prune, OBB, GJK); Detailteile (`decor`) sind ausgenommen |
| `earth-tiles.mjs` | Erdkugel aus NASA-GIBS-Kacheln mit Detailstufen |
| `planet-overlay.mjs` | Küstenlinien, Grenzen, Gradnetz und Ortsbeschriftungen (Radarmodus) |
| `assets/earth/` | Grundkacheln (Stufe 2) und Natural-Earth-Vektordaten |

**In Python** (nur Standardbibliothek plus `paho-mqtt`, `lightstreamer-client-lib`, `amqtt`):

| Datei | Aufgabe |
|---|---|
| `launcher.py` | Start mit einem Klick: Broker, Bridge, Fahrzeugdienst, Webserver, Browser; beendet sich bei EXIT oder Leerlauf |
| `bridge.py` | ISSLive → MQTT, CSV-Protokoll, Zeitbasis, Watchdog, Quittierung von Kommandos; auch eigenständig nutzbar |
| `ephemeris.py` | NASA-Bahnvorhersage (OEM) laden, prüfen, interpolieren, zwischenspeichern |
| `vehicles.py` | Andockereignisse, Crew, Ereignisse und Starts aus Launch Library 2 |
| `streams.py` | Laufende ISS-Livestreams von NASA (YouTube-Stream-Seite) und Sen (Schnittstelle von sen.com, sonst YouTube) ermitteln (`/__streams`), weil feste Video-Kennungen nach einiger Zeit privat werden |
| `cameras.mjs` | Außenkameras als Modell (anklickbar) und Kamerafenster: Livestream neben der Zwillingsansicht im Bildformat und Sichtfeld der gewählten Kamera, Überlagerung, Schwenk/Neigung/Zoom je Kamera (localStorage `iss.cams`), Stream-Auswahl mit Ausweichen bei gesperrten Videos |
| `tools/export_viewer.mjs`, `tools/viewer_template.html` | Erzeugen `ISS_Model_Viewer_v1.3.html`: bauen das Modell wie die Seite, backen Geometrie, Materialien und Texturen ein und schreiben einen eigenständigen Viewer (Node.js) |
| `tests/harness.mjs` | Gemeinsamer Aufbau aller JavaScript-Tests und des Viewer-Exports: lädt die Seite ohne WebGL in jsdom |
| `tools/build_strings.py` | Erzeugt `i18n-strings.js` aus den Übersetzungstabellen |
| `Start ISS Shadow.bat` | Windows-Startdatei: Python suchen, Pakete einmalig installieren, Launcher starten |

**Tests und Daten:** `tests/` (siehe [TESTS.md](TESTS.md)), `CHANNELS.csv` (alle 337 Kanäle mit
Einheit, Beschreibung, 3D-Verwendung und virtueller Abdeckung), `package.json` (nur für die
JavaScript-Tests: `three`, `jsdom`).

**Zur Laufzeit angelegt:** `logs/` (Launcher-Log, CSV der Prozessdaten, Kommandos), `cache/`
(NASA-OEM, LL2-Antworten). Beide werden vom Webserver nicht ausgeliefert.

## Drei Datenquellen in der Seite

Oben links wählt man die Quelle (gespeichert unter `iss.src`):

1. **MQTT** (Vorgabe, `#mqtt` in der URL des Launchers): Die Seite verbindet sich per WebSocket mit
   dem Broker und abonniert `iss/tm/#`, `iss/link`, `iss/bridge`, `iss/orbit` und `iss/ack/#`. Die
   Bridge hat die Zeitstempel bereits auf die PC-Uhr ausgerichtet.
2. **Live:** Die Seite abonniert ISSLive selbst über die Lightstreamer-Bibliothek (vom CDN). Die
   NASA-Bahnvorhersage holt sie per HTTP beim Launcher (`/__orbit`).
3. **Sim:** Ein interner Simulator (`simTick`) erzeugt jede Sekunde einen vollständigen Satz
   Telemetrie in denselben Kanälen und Einheiten wie ISSLive. Kein Netz nötig.

Alle drei Quellen münden in dieselbe Funktion **`ingest(pui, raw, ts, rx, source)`**. Von dort an
ist der Weg für alle gleich.

## Weg eines Messwerts

Beispiel: Der Backbord-SARJ dreht sich, ISSLive sendet `S0000004`.

1. **Empfang.** Lightstreamer-Callback (`startLive`) oder MQTT-Nachricht (`startMqtt`) liefert Wert
   und Zeitstempel (Stunden seit Jahresbeginn, Bordzeit).
2. **Zeitbasis.** `normalizeTs` → `correctTs` bildet den Zeitstempel mit dem aus `TIME_000001`
   gelernten Offset auf die PC-Uhr ab (`TIMEBASE`, siehe [TELEMETRIE.md](TELEMETRIE.md)).
3. **Speicher.** `ingest` schreibt in **`TM`** (`Map` PUI → `{raw, num, ts, rx, n, source,
   notServed}`) und in **`HIST`** (Verlauf, 1 Hz, 3 h). Wiederholte Schnappschüsse (gleicher Wert,
   gleicher Zeitstempel) frischen die Empfangszeit nicht auf. Zeitstempel 0 heißt „von NASA nicht
   veröffentlicht“. Auffällige Änderungen (Stationsmodus, Ports, SARJ-Modi …) gehen über `WATCH`
   ins Ereignisprotokoll.
4. **Bildschleife.** `frame()` läuft mit `requestAnimationFrame`. Sie fragt `liveJoints()` (oder im
   Kommandomodus den virtuellen Zustand `CMD.st`), rechnet über die Kalibriertabelle `CAL` den
   Telemetriewert in einen Modellwinkel um und übergibt die Gelenke an `applyJoints(J)`, das die
   Drehpunkte in `MODEL.pivots` setzt.
5. **Anzeige.** Dieselbe Schleife aktualisiert Panels (`updatePanels`), Widgets (`updateChannels`,
   `ISSWorkspace.tick`), obere Leiste (`updateTop`), Karte (`drawMap`), Kollisionsprüfung und rendert
   die Szene. Jeder Oberflächenblock ist in `try/catch` gekapselt (`reportUiError`), damit ein
   fehlerhaftes Widget die anderen nicht einfriert.

## Zentrale Zustandsobjekte in `iss_twin.html`

| Objekt | Inhalt |
|---|---|
| `TM`, `HIST` | Telemetriespeicher und Verlauf (siehe oben) |
| `LINK` | Verbindung: Quelle (`src`), Zustand, Signal (`sig`: AOS/LOS/STALE), Empfangszeiten, Generationsnummern der Clients, Watchdog-Zähler, Feed-Uhr |
| `TIMEBASE` | gelernter Offset zwischen Feed-Uhr und PC-Uhr (`offsetH`, `learned`, `foreign`, Proben) |
| `ORB` | aktueller Bahnzustand `s = [x,y,z,vx,vy,vz]` (km, km/s, ECI), Quelle, Bodenspur |
| `NASA_ORBIT` | zuletzt empfangene NASA-Vorhersage |
| `CAL` | Gelenkkalibrierung Telemetrie → Modell (Vorzeichen, Offset) |
| `MSS_CAL` | gelernte MSS-Kalibrierung (Rollwinkel der MBS-Greifpunkte, Gelenkkonvention) |
| `MODEL` | 3D-Modell: alle Bauteile (`parts`), Drehpunkte (`pivots`), Greifpunkte (`anchors`), Canadarm2 (`ssrms`), Dextre, Fahrzeuge, Abgasstrahlen, Beschriftungen |
| `CMD` | Kommandomodus: aktiv?, virtuelle Station (`sys`), virtueller Gelenkzustand (`st`), Sollwerte (`sp`), Zeitraffer, Pause, Armplan |
| `D` | „Daten dieses Bildes“: Geo-Position, Sonne, Erdschatten, Gelenke, Vorhersage; wird von `frame()` gefüllt und von den Panels gelesen |
| `VV` | Besuchsfahrzeuge: LL2-Ereignisse, Herkunft, Crew-Daten |
| `S` | Szene: Renderer, Kamera, Steuerung, LVLH-Gruppe, Erde, Lichter |
| `LAYOUT` | Spaltenbreiten, Kartenhöhe, eingeklappte Panels (gespeichert) |

Für die Entwicklerkonsole stellt die Seite `window.ISS` bereit (u. a. `TM`, `MODEL`, `CMD`, `ORB`,
`CAL`, `LINK`, `ingest`, `applyJoints`, `liveJoints`, `PERF` für Zeitmessung).

## Aufbau von `iss_twin.html`

Die Datei ist groß (~4200 Zeilen), aber linear gegliedert. Die Abschnitte stehen als Banner-Kommentare
im Code und lassen sich per Suche finden:

1. **Kopf:** klassische Skripte des Projekts, Bibliotheken vom CDN (Lightstreamer 9.2.3, MQTT.js 5,
   three.js 0.185 über eine Importmap), das gesamte CSS mit Farbschemata.
2. **Gerüst (`<body>`):** obere Leiste, linke/rechte Spalte, 3D-Ansicht mit Einblendungen,
   Bodenspur-Karte, Dashboard, Dialoge (Kanal-Browser, Hilfe, Setup).
3. **Modul-Skript**, in dieser Reihenfolge:
   - *Telemetrie-Verzeichnis:* PUI-Gruppen, Einheiten-Korrekturen, Statustabellen (`ENUM`, `CH_ENUM`).
   - *Zeit + Astronomie:* Sternzeit, Sonnenrichtung, Stunden des Jahres, `feedLagH`.
   - *Bahn:* Zweikörper + J2, Luftwiderstand, RK4, Umrechnungen (ECI → geografisch, LVLH, Bahnelemente).
   - *3D-Modell:* Das Modell selbst steht in `iss-model.mjs`. In der Seite bleiben Farbschema,
     iROSA-Zeitsteuerung, Besuchsfahrzeuge und LL2-Anbindung, Greifen, Luken, `buildISS()` (ruft
     `buildStation`) und die MSS-Kalibrierung.
   - *Szene:* Renderer, Erde (Shader, Kacheln, Overlay), Sterne, Sonne, Kamera-Voreinstellungen.
   - *Telemetrie:* Speicher, Zeitbasis, `ingest`, Quellen Lightstreamer/MQTT/Simulator, Watchdog,
     Bahnabruf beim Launcher, Bahnzustand aus Telemetrie.
   - *Zustand:* Kalibrierung `CAL`, `liveJoints`, Kommandomodus (`enterCmd`, `stepCmd`, virtuelle
     Telemetrie), Kommandos.
   - *Oberfläche:* Panels, Kanal-Widgets, Graphen, `updatePanels`, obere Leiste.
   - *Canadarm2-Umsetzen:* Vorwärts-/inverse Kinematik, RRT-Connect-Planer, Greifen/Lösen.
   - *Kommandofenster*, *CSV-Export*, *Bodenspur-Karte*.
   - *Hauptschleife* `frame()`, Vorhersage über Datenlücken, Tooltips, Layout, Bedienelemente,
     Sprache, Launcher-Anbindung, `init()`.

## Koordinatensysteme (Kurzfassung)

- **Körpersystem der Station:** +X vorwärts (Flugrichtung, Node 2), +Y Steuerbord, +Z Nadir; Meter.
- **LVLH** (Local Vertical Local Horizontal): X ≈ Geschwindigkeit, Z = Nadir, Y = −Bahnnormale. Die
  Lage-Quaternion der Telemetrie (USLAB000018-21, Skalar zuerst) bildet Körper → LVLH ab.
- **ECI** (inertial, J2000/EME2000): Bahnzustand in km und km/s.
- **ECEF** (erdfest): Erdkugel und Bodenspur; Übergang ECI → ECEF über die Sternzeit.
- **Szene (three.js):** +Y = Zenit; LVLH → Szene über `rotation.x = +90°`.

Ausführlich in [MODELL_UND_KALIBRIERUNG.md](MODELL_UND_KALIBRIERUNG.md).

## Was im Browser gespeichert wird (localStorage)

| Schlüssel | Inhalt |
|---|---|
| `iss.src` | gewählte Datenquelle |
| `iss.lang` | Sprache |
| `iss.skin` | Farbschema |
| `iss.sLs`, `iss.sAdapter`, `iss.sMqtt`, `iss.sTopic`, `iss.sOp` | Einstellungen im Setup |
| `iss.layout` | Spaltenbreiten, Kartenhöhe, eingeklappte Panels |
| `iss.dash` | Dashboard-Layout |
| `iss.graphs` | angeheftete Kanäle im Graphs-Panel |
| `iss.cal.mss3` | gelernte MSS-Kalibrierung |
| `iss.cal.trrj` | Drehsinn der Radiatorgelenke, falls die Prüfung im AUTOTRACK ihn korrigiert hat (v1.15) |
| `iss.cams` | Kamerafenster: Schwenk, Neigung, Zoom und Kamerakopf je Kamera, gewählter Stream |
| `iss.payloads` | was Canadarm2 hält und wo abgesetzte Nutzlasten stehen; zurücksetzen mit `ISS.resetPayloads()` in der Konsole |
| `iss.ll2`, `iss.ll2.*` | Zwischenspeicher der LL2-Antworten, wenn ohne Launcher gearbeitet wird |

Alle Zugriffe sind gegen Fehler abgesichert (privates Fenster, gesperrter Speicher). Zum Zurücksetzen
der Kalibrierung oder des Layouts genügt es, die Websitedaten für `localhost:8137` zu löschen.

## Versionen und Übergabe

`PAGE_VERSION` in `iss_twin.html` und `VERSION` in `launcher.py` müssen gleich sein. Startet man eine
neue Version, während eine alte läuft, beendet der neue Launcher den alten; offene Tabs bemerken die
neue Version über den Heartbeat (`/__alive`) und laden sich neu.
