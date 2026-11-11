# ISS Digital Shadow (v1.16)

Digitaler Schatten der Internationalen Raumstation auf Basis der öffentlichen NASA-Telemetrie
**ISSLive** (337 öffentliche Kanäle), ergänzt um die unabhängige NASA/JSC-Bahnvorhersage. Ein
Kommandomodus macht daraus einen digitalen Zwilling einer *virtuellen* ISS, die man steuern kann.
Entstanden als Fallstudie an der THU (Technische Hochschule Ulm).

Die Webseite zeigt die Station als 3D-Modell, dessen Solarflügel, Radiatoren, Canadarm2, Dextre,
Antennen und Lage live aus der Telemetrie gestellt werden, dazu Erdkugel, Bodenspur mit
Überflugvorhersage, Panels mit allen Kanälen, ein frei gestaltbares Dashboard, Crew und
Besuchsfahrzeuge.

## Start

Doppelklick auf **`Start ISS Shadow.bat`**. Das Dashboard öffnet sich im Browser.

- **Voraussetzung:** Python 3.10 oder neuer von python.org, bei der Installation „Add python.exe to
  PATH“ ankreuzen.
- **Erster Start:** Ein Fenster installiert drei Python-Pakete (etwa eine Minute). Spätere Starts
  zeigen kein Fenster.
- **Beenden:** „Exit“ in der oberen Leiste des Dashboards oder den Tab schließen. Etwa 4 Minuten nach
  dem letzten Dashboard-Tab beendet sich alles von selbst.
- **Läuft schon:** Ein zweiter Doppelklick öffnet nur das Dashboard erneut. Eine neue Version ersetzt
  eine noch laufende alte automatisch.
- **Fehlersuche:** `logs/launcher.log`.
- **Ohne Windows:** `pip install -r requirements.txt`, dann `python launcher.py`.

**Sim** (oben links) erzeugt synthetische Telemetrie ohne NASA-Feed. Die Browser-Bibliotheken kommen
von einem CDN, der erste Start braucht also Internet. Mitgelieferte Erdkacheln sorgen für ein
Grundbild, wenn Detailkacheln nicht geladen werden können.

Eine ausführliche Anleitung zur Oberfläche steht in **[docs/BEDIENUNG.md](docs/BEDIENUNG.md)**.

## Dokumentation

Die Abgabedokumente der Case Study (technische Dokumentation, technisches Konzept, Demo-Ablauf,
Posterentwurf, jeweils als PDF mit Quellen) liegen nicht in diesem Repository, sondern im Ordner
`Dokumentation/` des Projektordners. Zum Neubauen den Ordner neben die Projektdateien legen
(`Dokumentation/` steht in `.gitignore`).
Die Dateien unter `docs/` sind die Entwicklerdokumentation:

| Dokument | Inhalt |
|---|---|
| [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) | **Einstieg:** Bausteine, Datenfluss, Aufbau des Codes, zentrale Zustände |
| [docs/TELEMETRIE.md](docs/TELEMETRIE.md) | NASA ISSLive, Zeitstempel und Zeitbasis, AOS/LOS/STALE, Einheiten, Stationsmodi, Energie aus der Spannung, MQTT-Topics |
| [docs/MODELL_UND_KALIBRIERUNG.md](docs/MODELL_UND_KALIBRIERUNG.md) | 3D-Modell, Koordinatensysteme, Gelenkkalibrierung, Canadarm2, Kollisionsprüfung, Erdkugel |
| [docs/BAHN_UND_PHYSIK.md](docs/BAHN_UND_PHYSIK.md) | Bahnquellen, NASA-Vorhersage, Bahnrechnung, Luftwiderstand, virtuelle Station |
| [docs/BEDIENUNG.md](docs/BEDIENUNG.md) | Rundgang durch die Oberfläche |
| [docs/KAMERAS.md](docs/KAMERAS.md) | Außenkameras, Sichtfelder, Kamerafenster, Auswahl des Livestreams |
| [docs/TESTS.md](docs/TESTS.md) | Testdateien und Testdaten |
| [docs/WEITERENTWICKLUNG.md](docs/WEITERENTWICKLUNG.md) | Typische Änderungen, Konventionen, Fehlersuche, offene Punkte |
| [GEOMETRY.md](GEOMETRY.md) | Herkunft der Geometrie, Prüfungen gegen Live-Daten |
| [COVERAGE.md](COVERAGE.md) | Abdeckung der Kanäle und Mechanismen, Grenzen der Modelle |
| [CHANGELOG.md](CHANGELOG.md) | Änderungen je Version |
| `ISS_Model_Viewer_v1.3.html` | Nur das 3D-Modell zum Drehen (Holo/Solid), eigenständige Datei; neu erzeugen mit `node tools/export_viewer.mjs` |
| [CHANNELS.csv](CHANNELS.csv) | Alle 337 Kanäle mit Einheit, Beschreibung, 3D-Verwendung und virtueller Abdeckung |

Der Quellcode ist durchgehend deutsch kommentiert; jede Datei beginnt mit einer Beschreibung ihres
Zwecks und ihrer Schnittstelle.

## Was im Hintergrund läuft

`launcher.py` startet alles in einem versteckten Prozess:

| Baustein | Einzelheiten |
|---|---|
| MQTT-Broker (eingebettet, amqtt) | `127.0.0.1:1883` (MQTT), `127.0.0.1:9001` (MQTT über WebSocket) |
| `bridge.py` + `ephemeris.py` | ISSLive und unabhängige NASA-Bahnvorhersage → getrennte MQTT-Topics; jeder Wert in `logs/iss_tm_JJJJMMTT.csv`, Kommandos in `logs/commands.jsonl` |
| `vehicles.py` | Besuchsfahrzeuge, Crew, Ereignisse und Starts aus Launch Library 2 (`/__vehicles`) |
| Webserver | `http://localhost:8137/iss_twin.html` |

Läuft auf 1883/9001 schon ein Broker (etwa Mosquitto), nutzt der Launcher diesen.

```
ISS ──S/Ku-Band──▶ MCC Houston ──▶ NASA Lightstreamer ──▶ push.lightstreamer.com (öffentlich)
                                                              │  Lightstreamer (HTTP/WS)
                                                              ▼
                                                         bridge.py ──▶ logs/*.csv, commands.jsonl
                                                              │  MQTT  iss/tm/<PUI>, iss/link
                                                              ▼
                                                        MQTT-Broker
                                                              │  MQTT über WebSocket
                                                              ▼
                                       iss_twin.html (Schatten + virtueller Zwilling)
                                                              │  iss/cmd/<Ziel> ▶ Bridge ▶ iss/ack/<id>
```

Parallel dazu: NASA-OEM über HTTPS → `ephemeris.py` → `iss/orbit` (MQTT) und `/__orbit` (HTTP) →
Bahnanzeige, unabhängig vom ISSLive-Abo.

## Datenquellen im Dashboard

- **MQTT** (Vorgabe): die Kursarchitektur oben.
- **Live**: Der Browser verbindet sich direkt mit dem öffentlichen ISSLive-Feed; der Launcher liefert
  unabhängig davon die NASA-Bahnvorhersage. Die Telemetrie wird auf diesem Weg nicht protokolliert.
- **Sim**: synthetische Telemetrie ohne Netz (Bahn, Sonnennachführung, Erdschatten,
  Funkunterbrechungen, Tankstände).

## Was gemessen, abgeleitet oder simuliert ist

- **Gemessen** (ISSLive):
  - Gelenke: SARJ ×2, Beta-Gelenke ×8, TRRJ ×2, Canadarm2 ×7, Dextre ×15, Position des Mobile
    Transporter, Ku-Elevation/-Kreuzelevation, S-Band-Azimut/-Elevation ×2.
  - Lageregelung: Lage-Quaternion, Drehraten, Zustandsvektor, CMG-Drehzahlen und -Drehimpuls,
    GNC-, Stations- und RS-Modi.
  - Energie: Flügelspannungen (die Flügelströme veröffentlicht NASA nicht).
  - Lebenserhaltung: Urin-, Abwasser- und Wassertanks; ppO2, ppN2, ppCO2; Kabinendruck; O2-Erzeugung.
  - Thermal: Sensoren der externen Kreisläufe.
  - Russisches Segment: Belegung der Andockports, Kurs-Entfernung.
- **Abgeleitet:**
  - Aus dem Zustandsvektor: Position, Apogäum/Perigäum, Erdschatten, Sonnen-Beta, Bodenspur und der
    nächste Überflug über der THU.
  - Aus den Flügelspannungen: Zustand je Flügel (Entladung / Laden / voll) nach NASAs Schwellen.
  - Welches Fahrzeug an welchem Port ist und wann es kam oder ging: Launch Library 2 (TheSpaceDevs),
    keine Telemetrie.
- **Erschlossen:**
  - Abgasstrahlen aus Modusflags; es gibt keine Telemetrie pro Triebwerk.
  - Fahrzeugtyp an einem russischen Port nur, wenn das Flag ihn als belegt zeigt und LL2 kein
    passendes Ereignis kennt („Soyuz?“ / „Progress?“).
  - Gelenkstellungen über Datenlücken, wenn das Gelenk zuvor nachgeführt hat (gekennzeichnet als
    PREDICTED POSE).
- **Simuliert (Kommandomodus):** Die virtuelle ISS folgt Sollwerten mit etwa realen Schwenkraten,
  bildet CMG-Drehimpuls, Triebwerke, Energie, Thermal und Lebenserhaltung nach und rechnet Schub und
  Luftwiderstand in die Bahn ein (Zweikörper + J2 + Luftwiderstand).

## Tests

```sh
python -m unittest discover -s tests -v
npm install
npm test
```

Node.js wird nur für die JavaScript-Entwicklertests gebraucht, nicht für den Betrieb. Einzelheiten
in [docs/TESTS.md](docs/TESTS.md).

## Bekannte Grenzen

- Nullpunkte und Vorzeichen der Gelenke stehen nicht im öffentlichen Verzeichnis. `CAL` in
  `iss_twin.html` ist gegen Live-Daten und die berechnete Sonnenrichtung geprüft (siehe GEOMETRY.md);
  das TRRJ-Vorzeichen auf Backbord stützt sich auf ein Livebild und wird im Autotrack automatisch
  nachgeprüft (die Radiatoren waren in jeder Aufzeichnung geparkt).
- Die Anordnung stammt aus dem NASA-IGOAL-Modell; die Gelenkkonvention von Canadarm2 und die
  Rollwinkel der MBS-Greifpunkte sind dokumentierte Annahmen.
- Die US-Andockports (IDA-2/3, Unity/Harmony Nadir) haben keine öffentliche Telemetrie; ihre Belegung
  ist nur so aktuell wie Launch Library 2.
- Die Geometrie ist prozedural und vereinfacht; die virtuelle Station ist ein Lehrmodell, keine
  Flugsoftware. Ausführlich in COVERAGE.md.

## Kursanforderungen

- **Digitaler Schatten:** automatische Aktualisierung über MQTT.
- **Zustandsüberwachung in Echtzeit:** alphanumerische Panels, Widgets und ein Kanal-Browser über
  jeden Kanal.
- **Digitaler Zwilling (optional):** Der Kommandomodus steuert die virtuelle ISS lokal; mit MQTT
  werden Kommandos protokolliert und quittiert. Schnappschüsse der virtuellen Station gehen einmal pro
  Sekunde an `<root>/virtual/state`.
- **Zusätzlich:** 3D-/2D-Visualisierung, Simulation/Vorhersage und Protokollierung.

## Quellen und Lizenzen

- Telemetrie: NASA ISSLive (öffentlich, über Lightstreamer). Kanalverzeichnis und PUI-Zuordnung aus
  dem Projekt ISS Mimic (MIT). Statustexte und Anzeigeeinheiten von telemetry.space (MIT).
- Bahnvorhersage: NASA/JSC/FOD/TOPO, ISS OEM.
- Stationsgeometrie: NASA 3D Resources, IGOAL-Modell der ISS.
- Erdbilder: NASA GIBS Blue Marble Shaded Relief/Bathymetry (statisches Komposit).
- Küsten und Grenzen: Natural Earth über world-atlas (ISC).
- Besuchsfahrzeuge, Crew, Ereignisse: Launch Library 2 (TheSpaceDevs).
