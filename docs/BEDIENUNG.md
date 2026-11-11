# Bedienung

Ein Rundgang durch die Oberfläche. Die Oberfläche ist in sechs Sprachen verfügbar (Setup → Language);
die Beschriftungen unten nennen die englischen Namen, wie sie im Code stehen. NASA-Kanalnamen und
-beschreibungen bleiben immer englisch.

## Starten und Beenden

- **Windows:** Doppelklick auf `Start ISS Shadow.bat`. Voraussetzung ist Python 3.10 oder neuer
  (python.org, bei der Installation „Add python.exe to PATH“ ankreuzen). Beim ersten Start installiert
  ein Fenster drei Python-Pakete (etwa eine Minute); spätere Starts zeigen kein Fenster.
- **Andere Systeme:** `pip install -r requirements.txt`, dann `python launcher.py`.
- Das Dashboard öffnet sich unter `http://localhost:8137/iss_twin.html#mqtt`.
- **Beenden:** „Exit“ in der oberen Leiste oder den Tab schließen; etwa 4 min nach dem letzten Tab
  beendet sich alles von selbst. Ein zweiter Doppelklick öffnet nur das Dashboard erneut.
- **Fehlersuche:** `logs/launcher.log`.

## Obere Leiste

| Element | Funktion |
|---|---|
| **Live / MQTT / Sim** | Datenquelle: direkt von ISSLive, über Broker und Bridge (Vorgabe), oder interner Simulator |
| **Pillen** | *Link* (Verbindungszustand), *Signal* (AOS/LOS/STALE), *Age* (Alter der Daten), Bahnquelle, *NASA feed* (Zustand von NASAs Uhr; Tooltip mit Details, z. B. „bei NASA eingefroren · 11 h“) |
| **Mirror / Command** | Schattenmodus (das Modell spiegelt die Telemetrie) oder Kommandomodus (virtuelle ISS abspalten und steuern) |
| Uhr, GMT-Tag | UTC und Tag des Jahres |
| **Dashboard** (D) | eigenes Layout ein/aus |
| **Channels** (C) | Kanal-Browser |
| **Log CSV** | Verlauf ausgewählter Kanäle als CSV herunterladen (im Kommandomodus: virtuelle Sitzung als JSON) |
| **Setup** | Lightstreamer-Server und Adapter, MQTT-Adresse (WebSocket) und Topic-Präfix, Operatorname, Layout zurücksetzen, Sprache, Farbschema |
| **?** | Kurzanleitung mit Tastenkürzeln |
| **Exit** | Broker, Bridge und Webserver beenden (nur sichtbar mit Launcher) |

Tastenkürzel: **D** Dashboard, **C** Kanal-Browser, **?** Hilfe, **Esc** Menüs und Fenster schließen.

## 3D-Ansicht

- **Kamera:** Maus ziehen (drehen), Rad (zoomen), rechte Taste (verschieben). Voreinstellungen *Iso*,
  *Zenith* (von oben, vorwärts zeigt nach oben), *Fwd* (von vorn), *Stbd* (von Steuerbord), *Orbit*
  (Bahnmaßstab).
- **Cameras:** öffnet das Kamerafenster (auch per Klick auf eine Kamera im Modell): Livestream links,
  Zwilling aus derselben Kamera rechts, *Overlay* legt beide übereinander. Kamera, Kamerakopf (SD 4:3
  oder HD 16:9), Stream, Schwenk, Neigung und Sichtfeld sind einstellbar. Das Fenster lässt sich an
  der Kopfleiste verschieben und an jeder Kante und Ecke in der Größe ändern; Lage und Größe bleiben
  gespeichert, ein Doppelklick auf eine freie Stelle der Kopfleiste stellt beides zurück. Einzelheiten in
  [KAMERAS.md](KAMERAS.md).
- **Display:** Darstellung *Holo* (Drahtgitter) oder *Solid* (beleuchtete Flächen); Erde *Earth photo* (NASA Blue Marble)
  oder *Earth radar* (Küsten und Grenzen); Einblendungen *ISS labels*, *Axes* (Körperachsen), *Sun*
  (Richtung zur Sonne); *Earth labels* für Ortsnamen.
- **Pillen in der Ansicht:** *Sunlit/Shadow* (Beleuchtung aus Bahngeometrie und Flügelspannungen) und
  der Modus.
- **Statuszeilen:** Kennzeichnung der Systemdaten (LIVE, SIMULATED, RECORDED, VIRTUAL …), Hinweise
  auf fehlende Daten, rotes **Überlappungsbanner** bei Kollisionen (Klick speichert einen
  Bericht).
- **HUDs unten:** Lage (Gieren/Nicken/Rollen, Quelle) und Gelenke (Herkunft der Pose: LIVE POSE,
  LAST KNOWN, PREDICTED POSE, PLACEHOLDER …; Tooltip mit fehlenden Gruppen und MSS-Kalibrierung).
- **Tooltip:** Maus über ein Bauteil zeigt Name und die zugehörigen Telemetriewerte (z. B. Kanal,
  Beta-Winkel, Spannung eines Flügels; Fahrzeug, Port und Quelle eines Besuchsfahrzeugs).

## Seitenpanels

Links und rechts stehen einklappbare Panels (Klick auf die Kopfzeile). Jedes zeigt oben eine kuratierte
Zusammenfassung und darunter ein Widget für **jeden** weiteren öffentlichen Kanal seines Subsystems.

| Panel | Inhalt |
|---|---|
| Orbit | Höhe, Geschwindigkeit, Apogäum/Perigäum, Beta, Erdschatten, Bahnquelle |
| GNC | Lage, Raten, Lagefehler, CMG-Anzeigen, GNC- und Stationsmodus |
| Power | je Flügel Beta, Spannung und Zustand (Entladung/Laden/voll), Flügel in der Sonne, Batteriezustand, mittlere Spannung, Verlauf, Sonneneinfall auf die Modellflügel |
| Robotics | Canadarm2, Basis, Transporter, Dextre, MSS-Kalibrierung |
| Thermal | Radiatoren (Strategie, Einstrahlung), Kühlkreise |
| Graphs | angeheftete Kanäle als Verlauf (10 min / 1 h / 3 h) |
| Life support | Drücke, O₂/CO₂, Tanks, O₂-Erzeugung |
| Airlock & EVA | Luftschleuse, Anzugversorgung |
| Docking | russisches Segment, Ports, Besuchsfahrzeuge und Herkunft der Angaben |
| Crew & schedule | Expedition, Crew mit Rollen und Agenturen, kommende Ereignisse und Starts (Launch Library 2) |
| Comms | Ku- und S-Band, Antennen |
| Computers & data | Rechner, Datenverbindungen |
| Events | Ereignisprotokoll (UTC) |

Ein **Klick auf einen Kanal** (Widget, Wert, Chip) öffnet das Kanalmenü: *Graph it* (ins
Graphs-Panel), zu einer Dashboard-Gruppe hinzufügen, im Kanal-Browser öffnen, PUI kopieren.

Widgets wählen ihre Darstellung nach der Kanalart: Zeigerinstrument für Winkel, Balken für Prozente,
Lampe mit Klartext für Modi und Schalter, sonst Wert mit Trend. „n/a“ heißt: NASA veröffentlicht
diesen Kanal nicht.

## Kanal-Browser (C)

Durchsucht alle 337 öffentlichen Kanäle nach Name, PUI und Beschreibung, filtert nach Subsystem,
„nur empfangene“ und „nur angeheftete“, sortiert nach Subsystem, Name, PUI oder Alter. Pfeiltasten
wechseln die Auswahl. Die Detailansicht zeigt Beschreibung, Einheit, Rohwert mit Quelle, Empfangsalter,
ein Live-Widget und einen 3-h-Verlauf; von dort lässt sich der Kanal anheften oder mit gewählter
Darstellung einer Dashboard-Gruppe hinzufügen.

## Dashboard (D)

Ein eigenes Layout aus Gruppen von Widgets (Darstellung *Value, Graph, Bar, Gauge, Dial, State*, fünf
Größen) sowie Sonder-Widgets: 3D-Ansicht, Bodenspur und jedes Seitenpanel (diese Elemente werden
dafür aus der Seite ins Dashboard verschoben und beim Schließen zurückgelegt). **Edit layout**:
Widgets zwischen Gruppen ziehen, Gruppen per Kopfzeile ziehen oder mit ↑/↓ verschieben, Titel
umbenennen, Darstellung und Größe ändern, entfernen. Gespeichert im Browser; „Reset“ stellt die Vorgabe
wieder her.

## Kommandomodus (Command)

Spaltet eine **virtuelle ISS** vom aktuellen Zustand ab. Die echte Station wird nie kommandiert; mit
Bridge werden Kommandos nur protokolliert und als „SIMULATED“ quittiert.

**Kopfzeile des Kommandofensters:** *Hide* (einklappen), *Re-sync* (Abspaltung verwerfen, zurück zur
Telemetrie), *Pause*, Zeitraffer 1× / 10× / 60× / 300×, *+10 s* (Einzelschritt in der Pause),
Simulationsuhr, *Stop thrust*, *Damp rates*, *Reset motion (sim)*, *Export session*.

**Voreinstellungen:** *Autotrack sun* (SARJ, BGA und TRRJ folgen der Sonne), *Feather arrays*
(Flügel kantig zur Flugrichtung, weniger Widerstand), *Park joints*, *+XVV* (Standardlage), *−XVV
flip* (um 180° gegiert, für manche Andockungen und Anhebungen), *Reboost 0.5 m/s*.

**Lageziele:** Gieren/Nicken/Rollen in LVLH. *Guided attitude sliders* (Vorgabe) drehen die Lage direkt
mit 0,1°/s; ausgeschaltet regeln Kreisel und Düsen physikalisch. Eine Anzeige zeigt Winkelfehler und
geschätzte Restzeit.

**Geräte** (aufklappbare Abschnitte aus `virtual-controls.js`): *Attitude controller & four gyros*,
*Propulsion · individual jets* (Freigabe „ARM“, einzelne Düsen feuern/pulsen, Haupttriebwerke,
Ziel-Brennvorgang), *Power · eight channels & batteries*, *Thermal · loops A/B & radiators*, *Life
support & airlock*, *Joint drives & robotics*, *Communications & navigation*, *Training scenarios*
(Fehler, Nachschub).

**Joint & mechanism targets:** Sollwerte für SARJ, BGA, TRRJ, Radiator-Ausfahren, Antennen, Transporter,
Canadarm2 und Dextre. Darin **Canadarm2 relocation**: Ziel-Greifpunkt wählen, *Plan & move*, dann
*Capture* und *Release old base*; außerdem *Release free LEE* und *Stop arm*.

Ein Reboost verändert die Bahn sichtbar (Höhe im Orbit-Panel, Abgasstrahlen am Heck von Swesda bzw.
am dort angedockten Fahrzeug); Luftwiderstand senkt sie langsam. Die Bahn der virtuellen Station wird
im Kommandomodus nicht von NASA-Daten überschrieben.

## Bodenspur-Karte

Unter der 3D-Ansicht: Tag/Nacht, Subsolarpunkt, Bodenstation (THU), vorausberechnete Spur, ISS mit
Sichtbereich, Infozeile und nächster Überflug über der Bodenstation (Elevation > 10°) innerhalb von
24 h. Die Höhe der Karte lässt sich am oberen Rand ziehen.

## Layout

Die dünnen Linien zwischen den Spalten, der obere Rand der Karte und der linke Rand des
Kommandofensters lassen sich ziehen (oder mit den Pfeiltasten verschieben, wenn sie den Fokus haben);
Doppelklick setzt zurück. *Setup → Reset panel sizes* setzt alles zurück. Größen und eingeklappte
Panels werden gespeichert. Unter 1100 px Breite stapelt sich die Oberfläche.

## Ohne Netz und zum Ausprobieren

- **Sim** erzeugt synthetische Telemetrie ohne NASA-Feed. Die Bibliotheken kommen vom CDN; der erste
  Start braucht also Internet (oder einen Browser-Cache).
- Die mitgelieferten Grundkacheln der Erde (Stufe 2) erscheinen auch, wenn höhere Detailstufen nicht
  geladen werden können.
- Ein nachgebildeter ISSLive-Server stellt Fehlerbilder nach: `python tests/mock_isslive.py 8090
  tests/live_sample_20261014.json` (braucht `pip install aiohttp`), dann den Launcher mit
  `ISS_LS_SERVER=http://127.0.0.1:8090` starten oder die URL unter Setup → Lightstreamer eintragen.
