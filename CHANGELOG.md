# Änderungsprotokoll

Neueste Version oben. Datumsangaben beziehen sich auf 2026.

# v1.17: Canadarm2 an Livebildern ausgerichtet, Kalibrierfeld, Kamerafenster verschiebbar (11.11./12.11.)

- **Canadarm2 stand falsch.** Mit der am 11.11.2026 aufgezeichneten Pose (MBS PDGF3, LEE B) zeigte der
  Zwilling den Unterarm waagrecht hoch über CP8, im Livebild steht der Arm als umgekehrtes V. Vorzeichen
  des Schulter-Nickgelenks (SP) umgekehrt, Rollwinkel von MBS PDGF3 0° statt 135° (`MBS_PRIOR`).
  Geprüft an CP8 vom 10.11. 13:26 UTC und 11.11. 14:10 UTC gegen 1024 Kombinationen; die Posen vom 14.10.
  und 19.10. bleiben frei von der Station.
- Gelenkkonvention bei LEE A als Basis: Vorwissen jetzt „nach Hardware benannt“ (A), weil nur sie die
  Pose vom 19.10. mit der neuen SP-Konvention frei hält. Dextre auf PDGF2: Vorwissen 90° (Annahme).
- Greifen bei LEE A als Basis: Das freie Ende ist dann LEE B (`armBase`); Nutzlasten folgen jetzt diesem
  Ende statt des festsitzenden.
- Gelernte MSS-Kalibrierung unter `iss.cal.mss4`; die unter der alten Konvention gesammelten Belege
  (`iss.cal.mss3`) werden verworfen.
- Öffentliche Unterlagen zu Nullpunkten und Drehsinn der ISSLive-Kanäle gesucht: keine gefunden
  (Quellen in `docs/MODELL_UND_KALIBRIERUNG.md`). SARJ, BGA und Ku-Antenne bleiben wie kalibriert (Sonne bzw.
  TDRS); wenige Grad Abweichung der Solarflügel im Livebild erklärt vermutlich die Laufzeit des Videos (SARJ dreht etwa 4°/min), nicht geprüft.
- **Kamerafenster: Stream je Kamera.** Bisher blieb der Livestream beim Kamerawechsel derselbe. Jetzt
  bringt jede Kamera ihren Stream mit (`feed` in `CAMERAS`, `FEEDS`, `feedUrl`): Kameraports und MSS den
  NASA-Stream „Live Video“, die Harmony-HD-Kamera den NASA-HD-Stream, die Sen-Kameras SpaceTV-1. Ein von
  Hand gewählter Stream gilt danach für alle Kameras derselben Zuordnung (`iss.cams` → `feedPick`).
  YouTube-Spieler ohne Steuerleiste, Vorschläge und Infokarten (`controls=0&rel=0&iv_load_policy=3`).
- **Auslegerkameras von Canadarm2** (`boom1`, `boom2`): je eine Kamera mit Schwenk-Neige-Kopf an beiden
  Auslegern neben dem Ellbogen (`MODEL.armBooms`). Lage genähert; der NASA-Stream zeigte am 12.11. einen
  Blick den Ausleger entlang, den bisher keine Kamera des Modells hatte.
- **Eigene Kamera** (`custom`): für Livebilder ohne bekannte Einbaustelle. Lage `px`/`py`/`pz` (m,
  Stationssystem) im Kalibrierfeld, Schwenk/Neigung/Zoom wie bei den anderen Kameras.
- **Kalibrierfeld** (`calib-panel.mjs`, Knopf **Calibrate** im Kamerafenster): Werte direkt an der
  Überlagerung mit dem Livebild einstellen statt im Code raten. Videoverzögerung (Zwilling zeigt die
  Telemetrie von vor n s), je Gelenk von Canadarm2 und Dextre Vorzeichen und Offset, Rollwinkel der
  MBS-Greifpunkte, Drehung von Dextre an seinem Greifpunkt, Zusatzoffsets für SARJ, BGA, TRRJ und Ku,
  Versatz und Rollen der gewählten Kamera. Gespeichert unter `iss.calib` (Kamera unter `iss.cams`),
  Export/Import als JSON. Alle Werte stehen auf 0, bis man sie ändert; die eingebaute Kalibrierung bleibt.
- **Kameramarkierungen:** Jede Außenkamera hat in der Hauptansicht einen Punkt an der Einbaustelle und
  ihren Namen (CP-Ports kurz, z. B. „CP8“). Schalter „Cameras“ unter Display/Overlays neben „ISS labels“
  blendet Punkte, Namen und den Sichtkegel aus und ein (`localStorage iss.camMarks`, Voreinstellung an).
  Klick auf eine Markierung öffnet das Kamerafenster für diese Kamera. Überdecken sich Beschriftungen,
  verschwindet nur der Name, der Punkt bleibt.
- Das Kamerafenster lässt sich an der Kopfleiste verschieben und an allen vier Kanten und Ecken in der
  Größe ändern (Mindestgröße 420 × 240 px). Bisher stand es fest unten rechts; die Größenänderung des
  Browsers (`resize: both`) ging nur an der unteren rechten Ecke und brach ab, sobald der Zeiger über
  das YouTube-Video lief.
- Neues Modul `window-frame.mjs`: Ziehen mit Zeigererfassung, eingebettete iframes bekommen während des
  Ziehens keine Mausereignisse. Lage und Größe stehen in `localStorage iss.camwin`; das Fenster bleibt
  beim Verkleinern des Browserfensters und beim erneuten Öffnen im sichtbaren Bereich. Doppelklick auf
  eine freie Stelle der Kopfleiste stellt Lage und Größe zurück.
- Test `tests/test_window_frame.mjs` (Rechnung ohne Browser); im Browser geprüft: Verschieben,
  Größenänderung über zwei Ecken, Wiederherstellen nach Neuladen, Zurücksetzen.

# v1.16: Livestreams geprüft, Sen über sen.com (11.11.)

- Laufende Streams am 11.11.2026 im Browser geprüft: NASA `M3HKLzjvKPc` (Stationsbild 4:3, wechselnde
  Außenkameras), NASA `ROboUHfPUrU` (feste HD-Kamera an Harmony, IDA-2), Sen `fO9e9jnhYK8` (SpaceTV-1).
  Alle drei live und einbettbar. Die Erkennungsregeln von `streams.py` finden auf den echten Seiten
  genau diese drei.
- `streams.py`: Sen zuerst über die Inhalts-Schnittstelle von sen.com (`api.sen.com/content/public/live`,
  JSON statt Webseite), sonst über die YouTube-Seite. Kanalkennungen beider Kanäle fest hinterlegt.
- `cameras.mjs`: Kanalkennung von Sen ergänzt (Kanal-Einbettung jetzt auch für Sen); die zuletzt
  geprüften Streams (`KNOWN_STREAMS`, mit Datum) stehen ohne Launcher vor den Kanal-Einbettungen. Ein
  gespeicherter Stream, den der Launcher nicht mehr als laufend meldet, wird ersetzt.
- Quellen außerhalb von YouTube untersucht: nasa.gov/live verweist auf eine YouTube-Playlist, NASA+
  hat keinen Dauerstream der Station, sen.com bettet YouTube ein, ITVX ist nur in Großbritannien.
  Dokumentiert in `docs/KAMERAS.md`.

# v1.15: Radiatoren rollen um X, neues 3D-Modell, Kameras und Streams, Aufräumen (11.11.)

**Kinematik**

- **Radiatoren bewegten sich um die falsche Achse.** Das TRRJ dreht den Radiatorbalken um die
  Körper-X-Achse (Längsachse der Radiatoren), nicht um die Trägerachse Y. Bis v1.14 klappten die
  Radiatoren wie Landeklappen auf und ab; jetzt rollt die Fläche aus drei ORUs (22 m × 11 m) wie ein
  Solarflügel um ihre Mittelachse. Belege: NASA TM-110318 (Drehung um +X), Regelstrategie „Kante zur
  Sonne, Fläche zur Erde“ mit ±105° Weg, Fotos. 0° = Platten flach, Normale `(0, −sin a, cos a)`.
- **Vorzeichen:** Steuerbord +r (NASA-Abstandsmessung an CTC-2/ELC-4: positive Winkel senken die
  Außenkante), Backbord +r (baugleiche Gelenke; Livebild CP8 vom 10.11.). Die Begründung von v1.14
  („Spiegelpaar“, Sperrzone Bishop bei +40°) bezog sich auf die falsche Achse und ist entfallen.
- **Selbstprüfung:** `checkTrrjSense()` vergleicht im AUTOTRACK bei Sonnenlicht beide Vorzeichen
  mit der Forderung „kantig zur Sonne“ und korrigiert die Tabelle bei Widerspruch (gespeichert,
  gemeldet). Bisher waren die TRRJ in jeder Aufzeichnung geparkt.
- **Zielwinkel:** `radiatorGoal()` und Autotrack rechnen für die X-Achse (Sonne: `atan2(s_z, s_y)`,
  Erde: `atan2(−n_y, n_z)`). Der Simulator führt beide Seiten getrennt.
- **Freiraum:** beide Radiatoren über ±105° frei; kleinster Abstand P1-Radiator/Bishop 0,4 m bei +46°.
- **Transporter:** Arbeitsplatz-Nummer aus einer Tabelle statt einer Formel, die für die gemessenen
  Paare (+2,87 m = WS4, −5,26 m = WS5) falsche Nummern lieferte.
- Übrige bewegte Kanäle (SARJ, BGA, SGANT, S-Band, MT, Canadarm2, Dextre, Lage) gegen Kanalliste
  und Aufzeichnungen erneut geprüft, unverändert.

**3D-Modell** (neu in `iss-model.mjs`, Lage und Hauptmaße weiter nach IGOAL)

- Druckmodule als Rotationskörper mit kegeligen Enden; Sarja, Swesda, Nauka, Quest, BEAM, Bishop und
  die Fahrzeuge mit Profil statt als glatte Zylinder.
- Farben nach Fotos: Kibo, Columbus, Leonardo silbern; US-Module hellgrau; Radiatoren weiß;
  Solarflügel dunkelblau mit Zellraster und Kapton-Rückseite; iROSAs fast schwarz; PMAs dunkelgrau;
  Sojus und Progress graugrün. Licht: Erdschein von unten, dunkler Himmel.
- Träger S0 und S3/P3 achteckig; S4-S6/P4-P6 und die Flügelmasten als Stabgitter.
- iROSA-Neigung 10° (NASA) statt 11,2°, mit Auslegern, Wurzelbehälter und Wickelrolle.
- Ergänzt: zweite SGANT, Kreiselabdeckungen, Streben S0/Destiny, Kühlgeräte auf S1/P1, vier Tanks an
  Quest, ESP-1, Nutzlasten und Bartolomeo an Columbus, JEMRMS, Cupola-Fenster, eingefahrene
  Sarja-Flügel, Nauka-Luftschleuse, SuperDraco-Gondeln und Trunkflossen am Dragon, Detektor und
  Radiatoren von AMS-02.
- **Flimmern beseitigt:** In Solid lagen Rasterlinien genau auf den Flächen von Solarflügeln,
  Radiatoren und Trägern. Jetzt sind Raster Texturen und Gitter echte Stäbe; in Solid gibt es keine
  Linien auf Flächen. Neuer Test auf deckungsgleiche Flächen.
- Detailteile (`decor`) haben keinen Kollisionskörper; die Kollisionsprüfung arbeitet weiter mit
  den Hüllen. Alle aufgezeichneten Live-Posen bleiben berührungsfrei.

**Kameras**

- Sichtfelder nach NASA: SD-Kamera 77° × 61° bis 10° × 8° (4:3), HD-Kamera 36° bis 3,4° horizontal
  (16:9), MSS-Kameras 52° × 40° bis 6° × 4°. Bis v1.14 galt pauschal 48° senkrecht; der Dragon war im
  Zwilling deshalb größer als im Livebild. Kamerakopf (SD/HD) wählbar, Anzeige horizontal × senkrecht.
- Zwillingsansicht im Bildformat der Optik, eingepasst wie der YouTube-Spieler; Sichtkegel der
  gewählten Kamera in der Hauptansicht.
- Geradlinige Objektive, keine Fischaugen; Verzeichnung nicht nachgebildet (dokumentiert).
- Kameragruppen als Modell (Trägerrohr, Schwenk-Neige-Kopf, SD-Kamera, Leuchte, HD-Kamera) statt
  oranger Würfel; der Kamerakopf dreht mit Schwenk und Neigung. MBS-Kamera ergänzt. CP13 nach
  NASA-Angabe hinter S0 gesetzt.
- **Streams:** Die fest eingetragenen YouTube-Videos waren privat geworden. Jetzt keine feste
  Kennung mehr: `streams.py` (Launcher, `/__streams`) ermittelt die laufenden Streams von NASA und
  Sen; sonst Kanal-Einbettung oder eigener Link. Bei gesperrtem Video Hinweis und nächster Stream.

**Aufräumen**

- 3D-Modell aus `iss_twin.html` ausgelagert (4376 → 3758 Zeilen); `MAT`, Bauteil-Fabrik,
  Fahrzeuge, Canadarm2 und Dextre stehen in `iss-model.mjs`.
- Alle JavaScript-Tests und der Viewer-Export nutzen `tests/harness.mjs` statt je zwölf kopierter
  Zeilen. Tests nach Inhalt benannt: `test_regression.mjs` (vorher `test_v10`), `test_payloads.mjs`
  (vorher `test_v14`), `test_ui.mjs`; neu `test_radiators.mjs`, `test_zfight.mjs`,
  `test_cameras.mjs`, `test_streams.py`.
- Toter Code entfernt: `setSarjSense`, `mbsChoice`, `TRRJ_P_MAX`, ungenutzte Hilfsvariablen,
  Kompatibilitätsnamen in `vehicles.py`, die Materialtabelle in der Viewer-Vorlage (kommt jetzt aus
  dem Modell).
- Viewer v1.3 mit Materialien und Texturen des Modells.

# v1.14: Radiatoren, Außenkameras, Greifen und Transportieren, Langzeitlage

- **P1-Radiator drehte falsch herum.** Die beiden TRRJs sind ein Spiegelpaar wie die SARJs
  (P1 = S1 um 180° gegiert) und zählen im Körpersystem gegenläufig. Bis v1.13 hatten beide −r. Mit den
  Live-Werten vom 10.11.2026 (TRRJ P 15,2°, S 24,8°, beide DIR POS) stand der P1-Radiator schräg nach
  oben hinten und füllte die Ansicht von Kamera CP8 als große Fläche; im NASA-Livebild liegt er knapp
  unter der Sichtlinie nach hinten unten. Jetzt S −r, P +r. Dazu passt die Bishop-Sperrzone: Der
  Parkwinkel +40° vom 14.10. liegt genau an ihrer Grenze. Drehachse (Trägerlängsachse) und Nullstellung
  (0° = nach hinten) waren richtig.
- **Außenkameras** (`cameras.mjs`): CP3, CP8, CP9, CP13 (ETVCG/EHDC, schwenkbar), HD-Kamera an Harmony
  (NASA-Dauerstream), Sen SpaceTV-1 auf Bartolomeo (Andockport, Nadir, Horizont), LEE-Kameras von
  Canadarm2, Kopfkameras von Dextre. Klick auf eine Kamera im Modell oder „Cameras“ öffnet das
  Kamerafenster: Livestream (YouTube-Link wählbar) neben der Zwillingsansicht, „Overlay“ legt den
  Zwilling halbdurchsichtig über das Livebild. Schwenk, Neigung und Zoom sendet ISSLive nicht; sie
  werden von Hand eingestellt und je Kamera gespeichert. Lagen aus NASA-Beschreibungen angenähert.
- **Greifen und Transportieren:** Wechselt das Spitzen-LEE von Canadarm2 auf CAPTURED, hängt das
  nächstliegende bewegliche Objekt am Arm (Bishop, Cygnus, HTV-X, zuvor abgesetzte Nutzlast), folgt
  dem LEE und bleibt beim Loslassen dort (gespeichert). Ein- und abfliegende Cygnus/HTV-X werden über
  die Zeiten aus Launch Library 2 zugeordnet. Ohne bekanntes Objekt erscheint ein Platzhalter
  „Nutzlast unbekannt“, ebenso am POA des MBS und in den OTCMs von Dextre (ISSLive meldet nur
  Greifzustände, nicht was gegriffen ist).
- **Luftschleusen:** EV-Luke der Quest-Crewlock offen, solange die Crewlock drucklos ist
  (AIRLOCK000049 < 5 mmHg). JEM-Luftschleuse von Kibo ergänzt. Bishop hat einen Greifpunkt.
- **Swesda-Flügel** drehen jetzt zur Sonne (vorhergesagt, kein Kanal). S-Band-Antennen als Schüssel.
- **Lage über lange Laufzeit:** Im Befehlsmodus mit voller Lagephysik sättigte das
  Schwerkraftgradientenmoment die Kreisel nach etwa einer Stunde, danach taumelte die virtuelle
  Station (gemessen: 6° nach 1 h, 160° nach 2 h). Beim Abspalten übernimmt sie jetzt die
  Gleichgewichtslage (`trimTEA`): Das unbekannte aerodynamische Moment wird so gesetzt, dass das
  Umgebungsmoment in der Ausgangslage null ist, wie bei der echten TEA. Gemessen: 0,000° Abweichung
  nach 12 h, Kreisel bei 22 %.
- Neuer Test `tests/test_v14.mjs`; 3D-Viewer als `ISS_Model_Viewer_v1.2.html`.

# v1.13: Gruppenpaket, Dokumentation, LL2-Anzeige

- **Technische Dokumentation** für die Abgabe (`Dokumentation/`): Use Cases, Systemarchitektur,
  Funktionen, Softwaredetails, Anforderungsabgleich, Validierung, Betrieb; mit Diagrammen und
  Bildschirmfotos. Dazu Ablauf für die Vorführung und ein Poster-Entwurf.
- **Crew & Zeitplan blieb nach dem Start minutenlang auf „Waiting for Launch Library 2…“.** Die Seite
  fragte den Launcher nur beim Öffnen und dann alle 10 min; der Launcher holt die Crew-Daten aber erst
  in der ersten Minute nach dem Start. Jetzt fragt die Seite alle 20 s, bis Daten da sind. Fehler
  einzelner LL2-Feeds meldet der Launcher in `feed_errors`, und das Panel zeigt den Grund statt
  weiter zu warten.
- Gedankenstriche aus Code, Oberfläche, Übersetzungen und Dokumentation entfernt.
- 3D-Viewer als `ISS_Model_Viewer_v1.1.html` neu erzeugt.

# v1.12: Die letzten beiden iROSAs

- **iROSA auf 2A** (P4, siebtes von acht): angebracht und ausgerollt beim Außenbordeinsatz US-EVA 100
  am 29.10.2026 (Ausrollen ab 16:20 UTC, ~10 min).
- **iROSA auf 3B** (S6, das letzte): geplant für US-EVA 101 am 05.11.2026. Die Startzeit ist nicht
  veröffentlicht; angenommen sind 13:00 UTC und derselbe Ablauf wie am 29.10. (Ausrollen 17:23 UTC).
  Verschiebt Launch Library 2 den Einsatz, wandert der Zeitpunkt mit.
- Beide erscheinen zeitgesteuert nach Simulationszeit (`IROSA_LATE`, `updateIrosa`): vorher
  unsichtbar, ab dem Anbringen aufgerollt am Mast, dann Ausrollen über 10 min. Der Tooltip eines
  Flügels zeigt Zustand und Zeitpunkt. ISSLive hat keinen Kanal für die iROSAs.
- Abstandsprüfung über den ganzen Alpha/Beta-Bereich jetzt mit allen acht iROSAs; neuer Test
  `tests/test_irosa.mjs`.

# v1.11: Feed-Diagnose, Stationsmodi, Energie aus der Spannung, Bahnphysik, deutsche Dokumentation

- **„Stale“ kommt fast immer von NASA, nicht vom Programm.** Am 21.10. stand die Uhr von ISSLive
  seit 01:03 UTC (11,5 h) still; am 26.10. gab es nur eine kurze echte Funkunterbrechung (LOS,
  ~17 s). Auf Programmseite wurden trotzdem Schwächen behoben:
  - Die normale Epoche von ISSLive zählt ab 31. Dezember (24 h vor den Stunden des Jahres). Das
    galt bisher als „fremde Epoche“; jetzt ist es der Normalfall, und die Uhrabweichung des PCs
    wird modulo 24 h angezeigt.
  - Ein bei NASA eingefrorener Feed wird schon am ersten Schnappschuss erkannt (Uhr mehr als
    2 min zurück): Meldung „Die ISSLive-Uhr der NASA steht bei … UTC (vor …): der Datenstrom
    ist auf NASA-Seite eingefroren“, Signal STALE, die Feed-Pille zeigt „bei NASA eingefroren · Dauer“.
  - Frische Kanäle halten die Verbindung auf AOS, auch wenn NASAs Uhrkanal kurz hängt.
  - NASA sendet TIME_000001 etwa 24-mal pro Sekunde; Seite und Bridge werten nur noch eine Probe
    pro Sekunde aus, die Bridge veröffentlicht den Link-Status höchstens einmal pro Sekunde.
- **Stationsmodus geprüft.** USLAB000086 ist ein Bitcode: 1 Standard, 2 Microgravity, 4 Reboost,
  8 Proximity Ops, **16 External Ops (EVA/EVR)**, 32 Survival, 64 ASCR, gegen telemetry.space und
  NASA ISS Mimic verifiziert. Neu dekodiert: russischer Stationsmodus (RUSSEG000001, eigene
  Reihenfolge 1..7), SUDN-Lage- und Dynamikmodus, Master-, Freiflug- und Triebwerksflags; Wechsel
  des russischen Modus kommen ins Ereignisprotokoll. Live-Werte vom 26.10. waren widerspruchsfrei.
- **Energie-Panel neu.** NASA veröffentlicht die Flügelströme nicht, also gibt es live keine
  Leistung. Statt „n/a“ zeigt das Panel je Flügel Beta-Winkel, Spannung und Zustand nach NASAs
  eigenen Schwellen (< 151,5 V Entladung, 151,5-160 V Laden, > 160 V voll), dazu „Flügel in der
  Sonne“, Batteriezustand und mittlere Spannung; der Verlauf zeigt dann die Spannung.
- **Schub wirkt realistisch auf die Bahn, jetzt mit Luftwiderstand.** Die virtuelle Station hat
  Luftwiderstand (Dichtebänder nach Vallado, Cd·A = 2,2 × 1500 m², relativ zur mitrotierenden
  Atmosphäre): etwa 94 m/Tag Bahnabsenkung bei 415 km. Neuer Test: 1 m/s Anhebung erhöht die große
  Halbachse um 1775 m (Theorie 1775 m).
- **Linien auf der Erde im Fotomodus behoben.** Die Randschürzen der Kacheln verfälschten die
  Normalen; jetzt sind alle Normalen exakt radial.
- **Dextre am Arm:** Basis 19 (gegriffen vom freien LEE von Canadarm2) wird unterstützt.
- **Deutsche Dokumentation.** Jede Datei ist auf Deutsch kommentiert, jede Funktion beschrieben;
  README, GEOMETRY, COVERAGE und dieses Protokoll sind übersetzt; neu sind die Dokumente in
  `docs/` (Architektur, Telemetrie, Modell und Kalibrierung, Bahn und Physik, Bedienung, Tests,
  Weiterentwicklung).

# v1.10: Anordnung der Station aus dem eigenen NASA-Modell

- **Alles neu platziert nach dem NASA-IGOAL-Stationsmodell** (NASA 3D Resources). In der alten
  Anordnung lagen die Druckmodule 1,25 m zu nah am Träger, die radialen Ports von Harmony in der
  Knotenmitte statt am vorderen Ende (Columbus, Kibo, PMA-3 und der Cargo Dragon lagen 1,4-2 m zu
  weit hinten), der hintere Port von Swesda 3,4 m zu weit hinten, der äußere Träger war 3 m zu
  lang, und die Greifpunkte an Lab und Node 2 saßen auf der falschen Seite ihrer Module. Module,
  Ports, Trägerstationen, SARJ, Beta-Gelenke, Radiatoren, Nutzlastträger, MT/MBS und alle
  Greifpunkte nutzen jetzt IGOAL-Koordinaten; Tabelle in GEOMETRY.md.
- **Canadarm2 mit der echten Gliedgeometrie neu gebaut** (IGOAL-Rig: Ausleger 7,11 m, versetzte
  Schulter und Handgelenk). Die Ecken der MBS-Greifpunkte werden nicht mehr geraten; nur ihr
  Rollwinkel wird noch gelernt. Die Konvention der Gelenkwerte wurde auf der neuen Geometrie gegen
  beide aufgezeichneten Live-Posen neu getestet; am 20.10. ist das freie Armende ~1,6 m vom Cargo
  Dragon entfernt, statt ihn zu streifen.
- **Backbord-Solarflügel:** 4A/2B und 2A/4B tauschen die Masten, passend zu IGOAL; so hat jedes
  Beta-Gelenk denselben Drehsinn um seinen eigenen Mast (Normalen beim Nachführen unverändert).
- **iROSAs** 19 m lang, 11° geneigt; ESP-2 an Quest ergänzt; S1/P1 sind Dreiecksträger;
  Sperrzone des P1-Radiators wegen Bishop im simulierten/virtuellen Betrieb.
- Düsen und Triebwerke von Swesda wanderten mit dem Heck von Swesda.

# v1.9: Widgets für jeden Kanal, Dashboard, Kanal-Browser, Crew, sechs Sprachen

- **Jeder Kanal als Widget.** Jedes Subsystem-Panel behält seine Zusammenfassung und zeigt jetzt
  jeden weiteren öffentlichen Kanal des Subsystems als Widget: Zeigerinstrument für Winkel, Balken
  für Prozente, Lampe mit dekodiertem Text für Modi und Schalter (Statustexte von telemetry.space,
  MIT-Lizenz), sonst Wert + Trend. Einheiten, die das NASA-Arbeitsblatt als CNT/N/A führt
  (Flügelvolt und -ampere, Speicher-%, CMG-U/min, Wärmetauscher-°C), werden richtig angezeigt.
  Zwei neue Panels: Luftschleuse & EVA, Rechner & Daten. Ein Klick auf einen Kanal, ein Widget
  oder einen Zusammenfassungswert öffnet sein Menü: als Graph, ins Dashboard, im Kanal-Browser
  öffnen, PUI kopieren.
- **Kanal-Browser** (Channels, Taste C) ersetzt die TLM-Datenbank: Suche nach Name, PUI und
  Beschreibung, Filter nach Subsystem, nur empfangene oder angeheftete, Sortierung nach Subsystem,
  Name, PUI oder Alter; die Detailansicht zeigt Beschreibung, Rohwert, Alter, ein Live-Widget und
  einen 3-h-Verlauf und fügt den Kanal zu Graphs oder einer Dashboard-Gruppe hinzu.
- **Dashboard** (Taste D): eigene Gruppen von Widgets (Wert, Graph, Balken, Anzeige,
  Zeigerinstrument, Zustand, fünf Größen) plus 3D-Ansicht, Bodenspur und jedes Seitenpanel.
  „Edit layout“: Widgets zwischen Gruppen ziehen, Gruppen umordnen und umbenennen, Darstellung und
  Größe ändern. Gespeichert im Browser.
- **Crew & Zeitplan** aus Launch Library 2: Expedition, Crew mit Rollen (Kommandant zuerst) und
  Agenturen, kommende Ereignisse (Außenbordeinsätze, Andockungen, Pressetermine) und die nächsten
  Starts zur ISS, mit Datumsangaben nur so genau, wie LL2 sie kennt.
- **Besuchsfahrzeuge repariert.** Listenantworten von LL2 enthalten die Station nur in
  `docking_location`; der Filter suchte nach `space_station` und verwarf jedes Ereignis, daher
  erschien jedes russische Fahrzeug als „Soyuz?/Progress?“. Behoben und mit einer aufgezeichneten
  Antwort getestet. Das Anfragebudget bleibt weit unter LL2s 15 Anfragen/Stunde (etwa 3,5:
  Andockereignisse alle 30 min, Crew/Ereignisse/Starts alle 2 h; mit Launcher fragt der Browser
  LL2 nie selbst). Der Wechsel von der datierten Liste zu LL2 protokolliert keine falschen An- und
  Abflüge mehr.
- **Triebwerke.** Lagedüsen und Haupttriebwerke der virtuellen Station sitzen jetzt am Heck von
  Swesda, wo die Triebwerke der echten Station sind (vorher bei ±20 m entlang der Trägerachse).
  Nicken und Gieren feuern Düsenpaare gleich, Rollpaare sind Kräftepaare; Haupttriebwerke je
  3,07 kN. Ist ein Fahrzeug am Heck von Swesda angedockt, kommen die Abgasstrahlen der Anhebung
  aus diesem Fahrzeug, wie bei der echten Station.
- **Flut im Ereignisprotokoll behoben.** ISSLive sendet eine Komponente des Zustandsvektors nur
  bei Änderung, daher sprang die Bahnquelle alle paar Sekunden zwischen Telemetrie und
  NASA-Vorhersage und protokollierte jedes Mal „Orbit source → NASA_OEM“. Der Telemetrievektor wird
  jetzt über Lücken bis 30 s gehalten und ein Quellenwechsel erst nach 10 s Bestand protokolliert.
- **Leistung.** Die Abstandsüberwachung prüfte jedes Paar von ~450 Teilen mit String-Operationen
  viermal pro Sekunde (etwa 30 ms jeweils, ein regelmäßiges Ruckeln). Jetzt werden die Teile
  entlang einer Achse sortiert, feste gegen feste nie geprüft und nur bei Posenänderung neu
  geprüft: 1,7 ms pro Durchlauf. Die verborgene 3D-Szene wird nicht gerendert.
- **Beschriftungen auf der Erdkugel** folgen der Kamera in jedem Bild (nur Transform); welche
  gezeigt werden, wird weiter fünfmal pro Sekunde entschieden, sodass sie nicht mehr hinter der
  Ansicht herspringen.
- **Erde im Radarmodus:** Ozean, Gradnetz und Küsten folgen den Farben des Farbschemas.
- **Sprachen:** English, Deutsch, Español, Русский, Français, 日本語 (Setup → Language).
  NASA-Kanalnamen und -beschreibungen bleiben englisch. Tabellen in `tools/strings-*.tsv`,
  erzeugt mit `python tools/build_strings.py`.
- **Bedienbarkeit:** Display-Menü für Darstellungsstil, Erdkarte und Einblendungen; Kurzanleitung
  (?) mit Tastenkürzeln; Tooltips an den Bedienelementen; GPS-Status dekodiert (0 heißt
  „Positionsbestimmung läuft“, wurde als OFF angezeigt).
- **Flügelströme bei telemetry.space:** derselbe ISSLive-Kanal. ISSLive liefert jetzt 0 mit
  Zeitstempel 0 und Statusklasse 2 (geprüft 20.10.); telemetry.space zeigt die letzten echten
  Werte, die sein Server aufgezeichnet hat (die mitgelieferte Historie endet am 30.04.2023).

# v1.8: Ausrichtung gegen die Sonne geprüft, jeder Kanal, Live-Verkehr der Besuchsfahrzeuge

Alle Konventionen wurden gegen 11 Minuten Live-Daten von ISSLive neu geprüft, aufgenommen am 20.10.
mit beiden SARJs in AUTOTRACK und beleuchteter Station (`tests/live_sample_20261020.json`). Die
Sonnenrichtung im Körpersystem kommt aus Zustandsvektor, Lage-Quaternion und Sonnenephemeride,
unabhängig von den Gelenken.

- **Lage der Station und Bezugssysteme waren richtig; keine Drehung des ganzen Modells.** Die
  abgebildeten SARJ-Winkel bleiben auf beiden Seiten mit −0,1 ± 0,14° auf dem Autotrack-Ziel,
  während die Gelenke 42° überstreichen. Mit der inversen Quaternion beträgt der Fehler 18°, damit
  sind Richtung der Quaternion (Körper → LVLH) und LVLH-Achsen bestätigt. Die Platzierung der
  Module wurde gegen die Erdansicht geprüft (Subsatellitenpunkt darunter, Bodenspur voraus entlang
  +X, Norden auf der richtigen Seite bei einem Überflug nach Südosten): Harmony vorn, Swesda hinten,
  Columbus Steuerbord, Kibo Backbord. Eine 180°-Drehung um Z würde all das auf die falsche Seite
  legen.
- **Solarflügel zeigten von der Sonne weg: die Beta-Gelenk-Tabelle war falsch.** Sie stammte aus
  dem Schnappschuss vom 14.10. mit geparkten SARJs, der die möglichen Konventionen nicht trennen
  kann. Die Auswertung vom 20.10. ergibt Vorzeichenwechsel zwischen gegenüberliegenden Flügeln und
  Nullpunkte von −135° (Steuerbord) / +45° (Backbord); jeder Flügel folgt jetzt dem sonnenoptimalen
  Beta auf 0,09-0,5° RMS (alte Tabelle: Flügel abgewandt; ein einfaches +180°: 1,6° RMS, verworfen).
  Jeder Flügel zeigt zur Sonne (Einfall > 0,995). Das Lernen des SARJ-Drehsinns ist entfernt; es
  konnte den falschen Sinn speichern.
- **Ku- und S-Band-Antennen** neu angepasst: Gelenkachsen, Vorzeichen und Nullpunkte so gewählt,
  dass der Ku-Hauptstrahl den geostationären Ring während der ganzen Aufzeichnung bei einer Länge
  trifft (zwischen 80 und 95° O, der TDRS über dem Indischen Ozean), Streuung < 1°.
- **Fahrzeugmodelle: umgekehrte Verjüngungen behoben.** `cyl()` legt den ersten Radius an das
  +Achsen-Ende; bei mehreren Formen waren sie vertauscht. Dragon-Kapsel (Hitzeschild hinten,
  Andockring vorn), der vordere Kegel von Cygnus, die Sojus-Landekapsel, Frachtkuppel,
  Betankungsmodul und Geräteteil von Progress sowie PMA-1 verjüngen sich jetzt richtig.
- **Flügelströme zeigen 0, weil NASA sie nicht veröffentlicht.** ISSLive liefert diese Kanäle
  mit Wert 0 und Zeitstempel 0 (nie aktualisiert). Solche Kanäle zeigen jetzt „n/a“ mit Tooltip,
  und die USOS-Leistung zeigt „n/a“ statt 0 kW.
- **Jeder Kanal sichtbar.** Neue Panels listen alle 337 öffentlichen Kanäle nach Subsystem (Bahn &
  Zeit, Robotik, Thermal, Energie, GNC, russisches Segment, Luftschleuse/EVA, Lebenserhaltung,
  Kommunikation, Rechner), mit dekodierten Aufzählungen, Einheiten, Hervorhebung frischer Werte und
  Filter. Die Diagramm-Schaltfläche einer Zeile fügt sie dem neuen **Graphs**-Panel hinzu
  (10 min / 1 h / 3 h, im Browser gespeichert). Graphen halten den letzten Wert, da ISSLive nur
  Änderungen sendet.
- **Besuchsfahrzeuge aktualisieren sich selbst.** An- und Abflüge kommen aus Launch Library 2
  (TheSpaceDevs), einer öffentlichen, gepflegten Datenbank von Andockereignissen: Fahrzeug, Port
  sowie An- und Abdockzeit. Der Launcher holt sie alle 30 min und speichert sie zwischen
  (`/__vehicles`, `cache/ll2_docking.json`, innerhalb der 15 Anfragen/Stunde von LL2); ohne Launcher
  holt der Browser sie direkt. Russische Ports: Das ISSLive-Flag entscheidet weiter, ob ein Port
  belegt ist, LL2 nennt jetzt das Fahrzeug und wählt das Sojus- oder Progress-Modell. Jeder Port kann
  jeden Fahrzeugtyp zeigen, den er aufnimmt (Crew/Cargo Dragon und Starliner an IDA-2/3; Cygnus und
  HTV-X an Unity und Harmony Nadir; Sojus und Progress an den russischen Ports). Das Docking-Panel
  zeigt, was angedockt ist und woher die Information stammt; An- und Abflüge werden protokolliert.
  Das datierte Manifest bleibt als Rückfall ohne Netz (CRS-35 angedockt am 15.10. 14:27 UTC).
- Tests: Sonnenausrichtung von SARJ und jedem Flügel, Ku-Hauptstrahl auf GEO, Auswertung von LL2,
  Port-Zuordnung, Vorrang Flag vor LL2, Rückfall, Abstand jedes Fahrzeugtyps an jedem Port und der
  Fahrzeugdienst des Launchers (Cache, Ratenlimit, Wartezeiten).

# v1.7: Canadarm2 und Dextre nach Live-Belegen platziert

Der Überlappungsbericht vom 19.10. zeigte Canadarm2 am MBS-Greifpunkt 3 (Basisort 11) mit LEE A als
Basis, den MT an Arbeitsplatz 4 und Dextre am MBS-Greifpunkt 2. Im Modell führten die echten
Gelenkwinkel den Arm durch Harmony, Columbus und Destiny. Zwei Modellannahmen waren ungeprüft,
mindestens eine war falsch:

- **Welche MBS-Ecke jeder Greifpunkt belegt und wie er gedreht ist.** Öffentliche Quellen sagen
  nur „je einer an seinen vier oberen Ecken“.
- **Benennung der Gelenke mit LEE A als Basis.** Das Modell hielt die Schulter am Ende von LEE B.
  Der Arm ist symmetrisch, jedes Ende kann Schulter sein, also benennt ISSLive die Gelenke
  vielleicht vom Betriebsbasis-Ende aus.

Statt einer weiteren Vermutung lernt das Dashboard beides jetzt aus Live-Daten. Der echte Arm
durchdringt nie die Station, also schließt jede stabile, vollständige Live-Pose alle Hypothesen
aus, unter denen er es täte. Es gab 32 Kandidaten je MBS-Greifpunkt (4 Ecken × 8 Rollwinkel) und
zwei Gelenkkonventionen, gemeinsam geführt. Unter den Überlebenden wird der dem modellierten
Vorwissen nächste gezeigt, mit einem Greifpunkt je Ecke. Der Abstand Arm-Dextre wählt nur unter
Überlebenden und schließt nie aus, damit eine falsche Annahme über einen Roboter die Wahrheit für
den anderen nicht ausschließen kann. Das Ergebnis wird im Browser gespeichert (`iss.cal.mss2`). Der
Tooltip der Pose sagt, wie viele Kandidaten übrig sind und ob die Konvention bestätigt ist. Mit der
Pose vom 19.10. blieben 8 von 32 Platzierungen für Greifpunkt 3, und die angezeigte Pose hatte keine
Überlappungen. Die Pose vom 14.10. (Node 2, LEE B) war nicht betroffen. (Seit v1.10 kommen die Ecken
aus IGOAL, gelernt wird nur der Rollwinkel, gespeichert unter `iss.cal.mss3`.)

- **Dextre steht auf dem Greifpunkt, den seine Telemetrie meldet** (CSASPDM0002). Fehlt der Kanal,
  steht er wie früher auf der Zenitseite.
- **Gelernt wird erst aus einer vollständigen Pose, die 3 s stabil war.** Schnappschuss-Kanäle
  kommen in Paketen; eine Pose ohne MT-Position hätte richtige Hypothesen endgültig ausgeschlossen.
- Regressionstest mit dem Bericht vom 19.10. (`tests/live_report_20261019.json`).

# v1.6: Versionsübergabe, Überlappungsbericht

- **Eine alte Instanz konnte weiter alte Dateien ausliefern.** Der Launcher bleibt aktiv, solange
  ein Dashboard-Tab offen ist, und der Start einer neuen Version öffnete dann nur den Browser auf
  dem alten Server. Korrekturen kamen nie auf den Bildschirm. Ein Launcher ersetzt jetzt eine
  laufende Instanz einer anderen Version oder aus einem anderen Ordner (er bittet sie zu beenden,
  wartet auf die Ports und startet dann). Offene Tabs bemerken die neue Version und laden neu.
- **Überlappungsbericht:** Ein Klick auf das rote Überlappungsbanner speichert eine JSON-Datei mit
  Version, kollidierenden Teilen, angezeigten Gelenken und der rohen Robotik-, Gelenk- und
  Lagetelemetrie. Damit lässt sich die Pose zur Diagnose exakt nachstellen.

# v1.5: Exakte Überlappungsprüfung, Sonnennachführung über Datenlücken

- **Falsche Überlappungswarnungen behoben.** Die Abstandsüberwachung verglich nur orientierte
  Bounding-Boxen. Ein Modul ist ein Zylinder; unter 45° ragt seine Box um (√2 − 1)·r über die Hülle,
  bei Harmony etwa 0,9 m. Genau dort sitzt der Greifpunkt von Node 2, daher wurden Schulter und
  Ausleger 1 von Canadarm2 innerhalb von Harmony gemeldet, obwohl sie frei waren (die Warnung vom
  19.10.: Harmony ↔ Shoulder yaw / Shoulder pitch / SSRMS boom 1). Box-Überlappungen werden jetzt
  per GJK auf den konvexen Hüllen der echten Meshes bestätigt (Zylinder, Kegelstümpfe, Kugeln,
  Boxen; dünne Platten behalten die 4-cm-Hülle). Bei 1500 zufälligen Armposen an Node 2 waren 1182
  von 1457 per Box gemeldeten Arm/Modul-Kontakten falsch. Gegen analytische Formen an 2950
  zufälligen Paaren ohne Abweichung geprüft. Der Planer nutzt dieselbe Prüfung. Auch der alte
  Kontakt AMS-02 ↔ Dextre am Schienenende war ein Box-Artefakt.
- **Flügel bei LOS oder stummem Feed.** Früher fror jedes Gelenk auf seinem letzten Wert ein,
  während die Sonne weiterlief; nach 30 min zeigten die Flügel weit an der Sonne vorbei. Gelenke,
  die bekanntermaßen nachführen, werden jetzt vorhergesagt: SARJs und TRRJs, deren letzter
  gemeldeter Modus AUTOTRACK ist, folgen ihrem Autotrack-Gesetz, und das Beta-Gelenk jedes Flügels
  folgt der Sonne, wenn es bei frischen Daten nachgeführt hat. Geparkte Gelenke (DIR POS) bleiben
  stehen, die Lage wird in LVLH gehalten. Die Posenkennzeichnung lautet „PREDICTED POSE · … no data
  for 32 min“.
- Mock-Server: `set?item=PUI&v=WERT` ändert einen einzelnen Wert.

# v1.4: Verbindung, die sich selbst erholt

Durchgängig geprüft: Launcher, Broker, Bridge und Dashboard in einem echten Browser gegen einen
nachgebildeten ISSLive-Server, der dasselbe Lightstreamer-Protokoll spricht und die Fehlerbilder
des Feeds nachstellt (`tests/mock_isslive.py`).

- **Quellenwechsel:** Ein gestoppter Lightstreamer- oder MQTT-Client konnte noch den Zustand der
  neuen Quelle ändern (etwa „SIM idle“ nach Verlassen von LIVE) und späte Updates liefern. Jeder
  Client hat jetzt eine Generationsnummer; Callbacks eines alten werden ignoriert und seine Abos
  entfernt.
- **Stummer Feed:** ISSLive kann eine Sitzung offen halten und nichts senden (über Stunden
  gemeldet). Die Bridge meldete dabei weiter AOS. Jetzt melden Bridge und direkter LIVE-Modus
  STALE nach 15 s ohne Uhr-Tick, protokollieren die Stille nach 30 s und bauen die Sitzung nach
  60 s neu auf, mit wachsender Wartezeit bis 5 min. Bereits empfangene Telemetrie bleibt. Die
  Feed-Pille zeigt „silent 2 min“ und beim Überfahren den letzten Uhr-Tick, die Abweichung der
  PC-Uhr und die Zahl der Neuaufbauten.
- **Abweichende PC-Uhr:** Die Aktualität verglich NASA-Zeitstempel mit der PC-Uhr. Ging die PC-Uhr
  mehr als 15 s falsch, blieb die Verbindung auf STALE und die Live-Bahn wurde dauerhaft verworfen.
  Der Offset zwischen Feed-Uhr und PC-Uhr wird jetzt aus TIME_000001 gelernt (derselbe Mechanismus,
  der schon die abweichende Epoche behandelte) und ausgeglichen.
- **Eingefrorene Daten wirken nie frisch:** Nur vorrückende Uhr-Ticks zählen. Den Schnappschuss,
  den ein Neuverbinden erneut sendet, behandelt das Programm nicht als neuen Wert (das RX-Alter
  wird bei eingefrorenem Feed nicht mehr zurückgesetzt).
- **Heartbeat der Bridge:** Status alle 10 s, damit das Dashboard „NASA schweigt“ von „Bridge oder
  Broker weg“ unterscheiden kann. Das Dashboard baut seine Broker-Verbindung neu auf, wenn die Bridge
  60 s schweigt oder der Broker 90 s nicht erreichbar ist.
- **Start ohne Netz:** Konnte die Lightstreamer- oder MQTT-Bibliothek nicht vom CDN geladen werden,
  lädt das Dashboard sie erneut (sofort und alle 15 s), statt bis zum Neuladen auf „error“ zu bleiben.
- Umgebungsvariable `ISS_LS_SERVER` richtet die Bridge des Launchers auf einen anderen
  Lightstreamer-Server (etwa den Mock).
- Tests: Uhrabweichung, eingefrorener Schnappschuss, Watchdog und veraltete Callbacks in
  `test_v10.mjs` und `test_timebase.py`; `tests/test_feed_integration.py` lässt die echte Bridge gegen
  den Mock und einen MQTT-Broker durch Stille, Ausfall und Uhrabweichung laufen.

# v1.3: Prüfung der Ausrichtung, Fahrzeugformen

- **Flügel zeigen nachweislich zur Sonne** (Live-Daten 14./15.10., Modell-Einfall 94 %). Sie
  wirkten dunkel, weil das Zellmaterial einseitig und dunkel war. Flügel haben jetzt eine blaue
  Zellseite und eine hellbraune Kapton-Rückseite, die Seite zur Kamera ist also eindeutig.
- **Radiatoren:** Am 15.10. melden beide TRRJs DIRECTED POSITION und beide SARJs DIR POS / CHECKOUT,
  d. h. die Flugkontrolle hat sie geparkt. Radiatoren in der Sonne sind also der echte Zustand. Die
  Posenanzeige zeigt jetzt die Gelenkmodi, und das Thermal-Panel sagt, wenn die Radiatoren geparkt
  sind statt der Sonne auszuweichen.
- **Korrektur:** v1.1 behauptete, das TRRJ-Vorzeichen sei aus Live-Daten gesichert. Das stimmt
  nicht: Auch in dieser Probe waren die Radiatoren geparkt. Die Abbildung (−r) bleibt vorläufig;
  GEOMETRY.md und die Code-Kommentare sagen das. Die Prüfung „kantig zur Sonne“ wurde entfernt.
- **Besuchsfahrzeuge neu gebaut:** Maße von Dragon 2 (4-m-Kapsel, 3,7-m-Trunk mit Solarzellen auf
  dem halben Umfang und vier Flossen, offene Nasenkappe); Crew Dragon mit SuperDraco-Gondeln und
  Fenstern, Cargo Dragon ohne. Cygnus XL mit verlängertem PCM und UltraFlex-Flügeln. Sojus MS
  (Orbitalmodul, Landekapsel, Geräte-/Antriebsteil mit Flügeln) und Progress MS (Fracht- und
  Betankungsmodul) unterschieden. Kollisionsprüfung mit jedem Fahrzeug und der geflogenen Armpose:
  keine Berührungen.
- Typen im Manifest: Crew-12/Crew-13 = Crew Dragon, CRS-35 = Cargo Dragon.

# v1.2: Umsetzen des Arms, Einheiten, Beleuchtung, aktuelle Besuchsfahrzeuge

- **Umsetzen von Canadarm2 („walk-off“, Kommandomodus):** Greifpunkt wählen → **Plan & move**
  löst die Gelenkwinkel (inverse Kinematik auf der Modellkette), plant einen kollisionsfreien Weg
  (RRT-Connect im Gelenkraum, alle ≤ 2° gegen die Station geprüft) und schließt mit einem geraden
  Anflug entlang der Greifpunktachse ab. Alle Gelenke bewegen sich gemeinsam. Dann rastet
  **Capture** das freie LEE ein (nur innerhalb 2 cm / 0,5°); solange beide Enden angedockt sind,
  sind Armgelenke und Transporter gesperrt. **Release old base** wechselt die Basis ohne Sprung zum
  anderen LEE. Nicht erreichbare oder blockierte Ziele werden mit Begründung abgelehnt. Das alte
  sofortige Umsetzen bleibt, gekennzeichnet als Teleport.
- Behoben: Mit LEE A als Basis wurde der Arm in das Modul gezeichnet (Greifsystem zeigte falsch
  herum). Modul-Greifpunkte stehen jetzt 0,15 m über der Hülle.
- **Lagerichtung geprüft:** Die Quaternion bildet Körper → LVLH ab. Die Inverse passt deutlich
  schlechter zu den Live-Sonnendaten (Flügeleinfall 0,88 gegen 0,72).
- **Einheiten gegen Live-Werte korrigiert (15.10.):** Drehraten sind Grad/s (wurden 57-fach zu groß
  gezeigt), Lagefehler Grad. Kabinen-, Crewlock- und Partialdrücke sind mmHg (ppO2 zeigte ~8000 mmHg
  und die Kabine ~5100 kPa). CMG-Drehimpuls ist N·m·s, CMG-Temperatur °C. Externe Kreisläufe sind
  kg/h, kPa und °C. Die TLM-Datenbank zeigt die korrigierte Einheit, die des Arbeitsblatts im
  Tooltip. Simulator und virtuelle Station veröffentlichen dieselben Einheiten.
- O2-Erzeugung: Negative Füllwerte, die bei ruhendem Generator kommen, erscheinen als n/a.
- **Beleuchtung:** Die Ansichts-Pille kombiniert Bahngeometrie mit den Bus-Spannungen der Flügel
  (≥ 151,5 V = beleuchtet) und meldet Widersprüche. Der Modus „Shadow“ heißt jetzt **Mirror**, damit
  „Sunlit“ und „Shadow“ nicht nebeneinander stehen. Flügel-Chips färben sich nach Spannung und
  erklären die Schwelle beim Überfahren.
- **Besuchsfahrzeuge:** Russische Ports folgen weiter der Telemetrie. US-Fahrzeuge, die keinen
  öffentlichen Kanal haben, kamen aus einem datierten Manifest: Crew-13 Dragon an Harmony vorn;
  CRS-35 Dragon an Harmony Zenit ab dem geplanten Andocken am 15.10. 15:00 UTC. Crew-12 (abgedockt
  7.10.) und Cygnus XL NG-24 (abgedockt 9.10.) erschienen nur, wenn die Simulationszeit davor lag.
- Regler für die Ku-Elevation ±180° (Live-Wert 112°).

# v1.1.1: Ehrliche Posenkennzeichnung

- Die Gelenkanzeige sagte im Live- und MQTT-Modus immer „LAST KNOWN / PLACEHOLDER POSE“, egal was
  ankam; es war ein fester Text. Sie meldet jetzt LIVE POSE bei AOS, LAST KNOWN POSE bei LOS/STALE,
  RECORDED POSE bei Wiedergaben und nennt jede Gelenkgruppe, für die noch keine Telemetrie kam
  (Liste beim Überfahren). Die Lage wird genauso gekennzeichnet.
- ISSLive sendet ein Gelenk nur bei Änderung, also ist ein geparkter SARJ aktuell, auch wenn sein
  letztes Update alt ist. Der Systemhinweis sagt jetzt „unverändert seit dem letzten Update“, statt
  diese Werte veraltet zu nennen.

# v1.1: Gegen den Live-Feed kalibriert

Geprüft gegen einen Live-Schnappschuss von ISSLive am 14.10. 20:33-20:40 UTC
(`tests/live_sample_20261014.json`) und die aus Zustandsvektor und Lage berechnete Sonnenrichtung.

- **Gelenkkonventionen:** Der Backbord-SARJ zeigt das Spiegelbild des Steuerbord-SARJ
  (P = 360 − S). Die beiden Flügel einer IEA zeigen umgekehrte Vorzeichen, und Backbordflügel stehen
  180° von den Steuerbordflügeln entfernt. Beide TRRJs zählen entgegen dem Modell. v1.0 wandte auf
  alle eine Konvention an, was die Backbord-PV-Radiatoren umklappte und die Flügel auffächerte.
  Jetzt ergeben alle acht Flügel eine Ausrichtung. Diese zeigt mit 88 % mittlerem Einfall zur
  Sonne (SARJs geparkt, BGAs nachführend), die PV-Radiatoren zeigen von der Sonne weg und die
  Hauptradiatoren stehen innerhalb von 6-9° kantig. Der SARJ-Drehsinn war nicht beobachtbar (beide
  SARJs geparkt); eine Prüfung bei Sonne im Autotrack bestätigte oder drehte ihn einmalig und
  merkte sich das Ergebnis. (In v1.8 ersetzt.)
- **Triebwerke:** US-GNC-Modus 5 („CMG thruster assist“) ist der Normalmodus und heißt nur, dass
  Düsen bereitstehen. Er zeichnet keine Dauerstrahlen mehr. Strahlen erscheinen im Reboost-Modus
  und, als seltene abgeleitete Pulse, solange das russische Segment die Lage regelt.
- **Zeitstempel:** Der Feed stempelte die Daten damals mit einer abweichenden Epoche (~1047 h statt
  ~6885 h des Jahres). Jeder Wert wirkte Wochen alt: Signal-Pille STALE, veraltete Systeme, und der
  Live-Zustandsvektor wurde zugunsten der NASA-Vorhersage verworfen. Dashboard und Bridge lernen den
  Offset jetzt aus TIME_000001; eine stehende Uhr wird trotzdem veraltet.
- **Einheiten des Zustandsvektors:** ISSLive sendet km und m/s, nicht FT/FT/S wie im Arbeitsblatt;
  die Einheiten werden jetzt am Betrag der Bahn erkannt (Fuß wird weiter akzeptiert).
- **Robotik:** Canadarm2 und Dextre als versetzte 7-Gelenk-Arme neu gebaut, damit sich die Glieder
  in gefalteten Posen nicht durchdringen. Die Greifpunkte an Lab und Node 2 lagen im S0-Träger und in
  PMA-3; jetzt sitzen sie auf freier Moduloberfläche. Dextre steht auf der Zenitseite des MBS. Die
  S-Band-SASA-Masten wurden aus dem Fahrweg des MT verlegt. Die geflogenen Posen von Arm und Dextre
  sind frei von der Station und jetzt auch die Vorgaben im SIM.
- Die Abstandsüberwachung läuft jetzt auch auf Live-/SIM-Posen und meldet dort Überlappungen.
- Energie-Panel: Anzeige des Sonneneinfalls auf die Modellflügel. Gelenkregler im Kommandomodus
  nutzen Telemetriewerte (dieselben Zahlen wie die Panels).
- Die obere Leiste bleibt ab 1400 px einzeilig: Status-Pillen schrumpfen mit Tooltip; darunter
  bricht sie in eine zweite Zeile um, statt abzuschneiden.

# v1.0: Geometrie der realen Konfiguration und veränderbares Dashboard

- Beide inneren IEAs (S4/P4) 1 m nach außen versetzt. Ihre inneren Stauboxen schnitten bei vielen
  SARJ-Winkeln den SARJ-Ring und den S3/P3-Träger; echte SARJs drehen endlos, also waren diese Posen
  unmöglich.
- Nutzlastträger an S3/P3 an ihre geflogenen Plätze gesetzt (AMS-02, ELC-1…4, ESP-3 ergänzt).
- Dextre mit seinem LEE am MBS angebracht; verstauter ERA an Nauka ergänzt.
- Einblendungen der 3D-Ansicht als ein Raster neu aufgebaut: Werkzeugleiste, Statuszeile, Hinweis,
  HUDs, Erd-Nachweis und Kommandofenster können sich nicht mehr überlappen. Kollisionsanzeige und
  Erd-Nachweis liegen nicht mehr fest über der Karte. 3D- und Erdbeschriftungen verschwinden unter
  Bedienelementen und untereinander.
- Ziehbare, per Tastatur bedienbare Trenner für beide Seitenspalten, die Kartenhöhe und die Breite
  des Kommandofensters; Größen und eingeklappte Panels werden gespeichert; Rücksetzen unter Setup.
- Kopfzeile des Kommandofensters mit Zeitsteuerung (Pause, 1/10/60/300×, +10-s-Schritt,
  Simulationsuhr) und Schnellaktionen; einklappbar; der Inhalt scrollt unter der festen Kopfzeile.
- Fehler: Eine Karte der Höhe null warf in der Bildschleife einen Fehler und fror spätere
  Aktualisierungen ein; Oberflächenaufgaben sind jetzt isoliert. Große Zeitraffer werden in Aufrufe
  ≤ 60 s zerlegt. Sparklines passen sich ihrer angezeigten Breite an. TRRJ-Anzeigen sind
  vorzeichenbehaftet. Kamera-Voreinstellungen setzen den Schwenkpunkt zurück. Klick auf den
  Hintergrund eines Dialogs schließt ihn. Der Launcher erzwingt JavaScript-MIME-Typen, damit
  Windows-Registry-Zuordnungen die ES-Module nicht blockieren.
- Neue Testsuite `tests/test_v10.mjs` (Trägerplätze, Anbringungen, vollständige Alpha/Beta/TRRJ-
  Abstandsprüfung, Overlay, Trenner, Kommandokopfzeile, zerlegter Zeitraffer).

Validierung: alle sechs JavaScript-Suiten und acht Python-Tests bestanden. Das Dashboard wurde in
headless Chromium (WebGL über SwiftShader) bei 1920×1080, 1600×900, 1280×720, 1024×768 und 390×844
im Shadow- und Kommandomodus gerendert; eine automatische Prüfung fand bei keiner Größe sich
überlappende Bedienelemente. Der Start unter Windows bleibt eine manuelle Prüfung.

# v0.9: Zentrale Radiatoraufhängung und simulierte Ausrichtung

- Die fehlende strukturelle Verbindung von S1/P1 zu den hinteren Radiatorbalken geschlossen: feste
  Halterungen/Lager, drehende Wellen und Ausfahrgelenke.
- Eng begrenzte Kollisionsausnahme für Lager/Halterung der eigenen Welle; Kollisionen der Platten
  mit der Montagehardware werden weiter geprüft.
- Berechnung der Radiatorziele in SIM und Kommandomodus vereinheitlicht. Der synthetische Strom
  behandelt jetzt Ziele zur Erde im Erdschatten und behält den vorigen gleichwertigen Winkel bei,
  statt den Winkel jedes Schnappschusses relativ zu null zu wählen.
- Anzeige von Strategie und Sonneneinstrahlung im Thermal-Panel für SIM und andere Quellen; manuelle
  Ausrichtung im Kommandomodus ist als manuell gekennzeichnet, im Erdschatten wird kein direktes
  Sonnenlicht gemeldet.
- Getestet: durchgehende Anbindung über ±105° Weg und alle 48 Plattennormalen über zwei simulierte
  Umläufe mit den echten Telemetrie- und Szenentransformationen.

Validierung: alle fünf JavaScript-Suiten und acht Python-Tests bestanden. Statische
Three.js-SVG-Projektionen wurden bei drei Gelenkwinkeln angesehen. WebGL im Browser und der Start
unter Windows bleiben manuelle Abnahmeprüfungen.

# v0.8: Ausrichtung der äußeren Träger und Lageführung

- Eine 180°-Montagekorrektur an beiden äußeren SARJ-Baugruppen, mit gepaarten
  Beta-Gelenk-Transformationen, damit die Zellseiten weiter der Sonne folgen, während alle vier
  PV-Radiatoren zur sonnenabgewandten Seite zeigen.
- Gemeinsame Montagemathematik für gezeichnete Meshes und den Leistungs-Einfall.
- Geführte Euler-Schritte durch begrenzte Quaternion-Bewegung auf kürzestem Weg ersetzt; stabile
  Anzeige an den Polen sowie Rückmeldung zu Winkelfehler und simulierter Restzeit.
- Änderungen am Lageziel und Voreinstellungen wählen jetzt Lagehaltung und löschen manuelle
  Brennvorgänge nach freiem Driften, ohne die Antriebsfreigabe zu ändern.
- SARJ-Durchmesser von 5 m auf etwa 3,5 m korrigiert, Flügelbreite auf 11,6 m, zwei Stauboxen je
  Flügel und die Schnittstelle Destiny-Harmony ergänzt.
- Den künstlichen Versatz von ±1,3 m zwischen gegenüberliegenden Mastaufnahmen entfernt; das
  verkleinert die Spannweite geparkter Flügel quer zum Träger und hält die Stauboxen von den
  benachbarten ELC-Plattformen frei.
- GEOMETRY.md mit belegten Korrekturen und ausdrücklichen Koordinatengrenzen hinzugefügt.
- Erweiterte Regressionstests für Geometrie und echte Bedienung aller Solar-/PVR-Baugruppen,
  manuellen Einfall, Quaternion-Grenzfälle und das Aktivieren von Zielen.

Validierung: alle fünf JavaScript-Suiten und alle acht Python-Tests bestanden. Visuelle Abnahme mit
WebGL und der Start unter Windows wurden in dieser Umgebung nicht getestet.

# v0.7: Fehlerbehebungen an Karte und Bedienung

- Schaltflächen Earth photo/radar, mitgelieferte Küstenlinien und Ländergrenzen von Natural Earth
  sowie ein unabhängiger, entzerrter Schalter für Erdbeschriftungen.
- Überlappende Eltern-/Kind-Kacheln entfernt; Austausch der Detailstufen als Ganzes, nach innen
  gezogene Fugen-Schürzen und eine zurückgesetzte Unterlage beheben die gemeldeten dreieckigen Lücken.
- Mathematik von Radiatormontage und -bezugssystem, äußere Platzierung und Schwenkgeschwindigkeit
  korrigiert; der modellierte Ausfahrweg ist über ±105° frei von festen Stationsteilen.
- Platzierung Columbus/Kibo (Backbord/Steuerbord) und Greifpunkt an Node 3 korrigiert.
- Die aggressive Lageraten-Vorgabe durch eine mit dem Drehimpuls verträgliche Führung ersetzt; RCS
  unterstützt den tatsächlichen Rest nach Kreiselsättigung. Physikalische Ratendämpfung und ein
  ausdrückliches Zurücksetzen der Bewegung im Simulator ergänzt.
- Stabile geführte Reglerbewegung als Vorgabe, Lageziele nach oben verschoben, erfolgreiche
  manuelle Aktuatorbefehle schalten auf physikalische Dynamik.
- Echtzeit-Aktualisierung der Oberfläche über Zeitraffer, Pause und Rückkehr in den Schattenmodus
  behoben; fokussierte Auswahllisten werden nicht mehr überschrieben.
- Regressionstests für Schaltflächen-/Regler-Ereignisse, Erfassung großer Winkel auf drei Achsen,
  Erholung aus dem Taumeln, Ausfahr-/Drehgeometrie und asynchrone Kachelsichtbarkeit.

Validierung: Python-Tests und alle fünf JavaScript-Suiten bestanden. Chromium ließ sich in der
Ausführungsumgebung nicht starten, daher bleiben WebGL und der Windows-Start manuelle
Abnahmeprüfungen. Keine Behauptung flugtauglicher Geometrie oder Dynamik.

# v0.6: Virtuelle Bedienung, Gelenke und Abdeckungsprüfung

- Einzelne Bedienung für vier CMGs, zwölf idealisierte RCS-Düsen und zwei Haupttriebwerke;
  endlicher Treibstoff, Integration von Kraft/Moment, Drehimpulsgrenzen der Kreisel, zeitgesteuerte
  Pulse, Ziel-Brennvorgänge, sicheres Stoppen und Fehlerszenarien.
- Gekoppelte Energie/Batterien, Kühlung und Verbrauchsgüter; Druckverriegelung der Luftschleuse,
  Antriebssperren, Pause, Zeitraffer und JSON-Export der Sitzung.
- Gelenkziele und optionale direkte Bewegung der Lageregler beibehalten.
- Nicht modellierte Kanäle im Kommandomodus ausdrücklich eingefroren oder nicht verfügbar.
- Eigene Sonnenvermeidung der Radiatoren und begrenzter Weg von ±105°, gekoppelte Ausfahrszenarien
  für HRS-Radiatoren (acht Platten) und PV-Radiatoren (sieben Platten).
- Die fünfzehn Winkel von Dextre, beide S-Band-Gelenke und die Ku-Kreuzelevation ergänzt.
- MBS-/Modulanker, vier MBS-Greifpunkte und beide Ankerenden von Canadarm2; die übergroßen Ausleger
  gekürzt und sichtbare MT-Schienen ergänzt.
- Vorsichtige Überlappungswarnungen mit orientierten Boxen, absichtliche Gelenkkontakte
  ausgenommen; keine Behauptung einer exakten Kollisions- oder Flugabstandsanalyse.
- Schrittweise geladene NASA-GIBS-Bilder, mitgelieferte Grundkacheln und begrenzter Cache.
- Beide Abo-Wege gegen alle 336 eindeutigen Einträge des öffentlichen Arbeitsblatts geprüft.
  CHANNELS.csv und ein ausführlicher Abdeckungs-/Grenzenbericht hinzugefügt.
- Behoben: doppelte DOM-ID des Bahn-Abzeichens, Wortlaut der Kommandoquittung, virtueller GNC-Modus
  und native Einheiten, ungleiche Energieaufteilung zwischen Batterien.

Validierung: 8 Python-Tests; JavaScript-Tests zu Quellenwahl, Physik, DOM und echter
Three.js-Geometrie. Enthalten: alle 12 Düsenmomente, freies Driften, Pulszeiten, leerer Tank, Ende
eines Brennvorgangs, Batterie-Energiebilanz, Stromausfall, Kreiselgrenzen, Luftschleusen-
Verriegelung, Verbrauchsgüter, endliche Zustände im Langlauf, beide Armanker, MT/feste Anbringung,
gezeichnete Solar-/Radiatornormalen, Falten, Kollisionsfälle, Ausnahmen für absichtliche
Verbindungen, Kachelgrenzen, Antriebssperren, Regler und Pause. NASA-Grundkacheln erfolgreich
heruntergeladen. Browser/WebGL und Windows-Start wurden hier nicht getestet; diese Grenzen stehen in
COVERAGE.md.

# v0.5: Unabhängige NASA-Bahn

- NASA/JSC-OEM-Dienst mit lokalem Cache und automatischer Aktualisierung.
- Vorhergesagte Bahndaten auf eigenem MQTT-Topic und HTTP-Endpunkt.
- Automatische Quellenwahl: aktuelle gemessene Bahn, NASA-Vorhersage, begrenzte Propagation eines
  alten gemessenen Zustands oder nicht verfügbar.
- Ausdrückliche Modi Simulation, Wiedergabe und virtuelles Kommando beibehalten.
- Kennzeichnung vorhergesagter/simulierter/aufgezeichneter Bahnen, Details zum NASA-Produkt,
  Hinweise auf fehlende/veraltete Systeme und Aktualität je Kanal.
- MQTT-Empfangszeitstempel bleiben erhalten, wenn retained-Nachrichten erneut zugestellt werden.
- Fehlenden Kanal CSAMT000002 im Browser-Live-Modus ergänzt.
- Die Meldung „keine Daten“ unterscheidet jetzt Beobachtung und vermutete Ursache.
- Fehlende Lage und Energie erscheinen als nicht verfügbar statt als erfundene Nullwerte.

Validierung unter Linux:

- Unit-Tests: OEM-Interpolation, Einheiten, Stützstellenlücken, Gültigkeit, Produktalter, defekte
  Downloads und Cache bei Netzausfall.
- JavaScript-Tests: Quellenvorrang, veraltete gespeicherte Werte, Ablauf, Wiedergabe und
  Jahreswechsel.
- Live-NASA-Daten erfolgreich ausgewertet und über MQTT und HTTP ausgeliefert, bei absichtlich
  fehlgeschlagenem Lightstreamer-Start.
- DOM-/Zustandsintegration: Live-Erholung, NASA-Rückfall, abgelaufene Vorhersagen, Isolierung der
  Kommando-Abspaltung, Simulatorwechsel und Kennzeichnung fehlender/veralteter Daten.
- Python-Kompilierung und JavaScript-Syntaxprüfung.

Ein vollständiger WebGL-Test im Browser und der Doppelklick-Start unter Windows waren in der
Entwicklungsumgebung nicht verfügbar. Ein Ausfall des Lightstreamer-Dienstes wird durch dieses
Update nicht behoben; der unabhängige Bahn-Feed hält die Bahnanzeige aber funktionsfähig.
