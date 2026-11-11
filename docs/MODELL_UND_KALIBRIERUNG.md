# 3D-Modell, Koordinatensysteme und Kalibrierung

Dieses Dokument erklärt, wie das 3D-Modell der Station aufgebaut ist, wie Telemetriewerte zu
Gelenkstellungen werden und wie das Programm Kollisionen prüft. Die Herkunft jeder einzelnen
Koordinate und die Prüfungen gegen Live-Daten stehen in [../GEOMETRY.md](../GEOMETRY.md).

## Koordinatensysteme

| System | Achsen | Einheit | Verwendung |
|---|---|---|---|
| **Körpersystem** der Station | +X vorwärts (Flugrichtung, Ende mit Node 2/Harmony), +Y Steuerbord (Gitterträger), +Z Nadir (zur Erde) | m | gesamtes Modell |
| **SSREF** (NASA-Konstruktionssystem, IGOAL) | x = Körper X, y = Körper Z, z = −Körper Y | Zoll | Quelle der Koordinaten; Umrechnung ×0,0254 |
| **LVLH** | X ≈ Geschwindigkeit, Z = Nadir, Y = −Bahnnormale | - | Lage der Station; die Quaternion der Telemetrie bildet Körper → LVLH ab |
| **ECI** (J2000/EME2000) | inertial | km, km/s | Bahnzustand |
| **ECEF** | erdfest | km | Erdkugel, Bodenspur; ECI → ECEF über die Sternzeit `gmstRad` |
| **Szene** (three.js) | +Y = Zenit | m | LVLH → Szene über `rotation.x = +90°` |

Lagewinkel (Gieren/Nicken/Rollen) folgen der Reihenfolge 3-2-1: Gieren um Z, Nicken um Y, Rollen um
X. Die Quaternion ist „Skalar zuerst“ (q0 = Skalarteil, `USLAB000018`, dann 19-21). Bei ±90° Nicken
sind Gieren und Rollen nicht getrennt beobachtbar; die Anzeige wählt dann Rollen = 0.

## Aufbau des Modells

`buildISS()` erzeugt die Station prozedural aus einfachen Grundkörpern (Zylinder, Kegelstümpfe,
Kugeln, Quader, Gitterträger). Jedes Bauteil entsteht über `part()` und wird in `MODEL.parts`
registriert, mit Art (`kind`, steuert Material und Farbe), Name (erscheint im Tooltip) und
Systemzuordnung (`sys`, z. B. `'sarj'` oder `'eps:2A'`, für die Tooltip-Zeilen aus `sysRows`).

Die Hierarchie folgt der Mechanik: Was sich mitbewegt, hängt am selben Drehpunkt. Die wichtigsten
Drehpunkte liegen in `MODEL.pivots`:

| Drehpunkt | Telemetrie | Was sich mitdreht |
|---|---|---|
| `sarjS`, `sarjP` | S0000003, S0000004 | äußere Träger S4-S6 bzw. P4-P6 mit allen Flügeln und PV-Radiatoren |
| BGA je Flügel (1A … 4B) | S4/S6/P4/P6 0000007-08 | ein Solarflügel (Zellbahnen, Mast, Stauboxen, ggf. iROSA) |
| `trrjS`, `trrjP` | S0000001, S0000002 | eine Seite Hauptradiatoren: Rotor, Balken und drei Radiator-ORUs rollen um die Körper-X-Achse |
| MT (Transporter) | CSAMT000001 (cm) | MBS, Dextre und (wenn dort verankert) Canadarm2 |
| Canadarm2, 7 Gelenke | CSASSRMS004-010 | Glieder des Arms (Basis und Ende je nach verankertem LEE) |
| Dextre, 15 Winkel | CSASPDM0003-09, 0011-17, 0020 | Körperrollen und zwei Arme |
| Ku-Antenne | Z1000014/15 | Schüssel (Elevation, Kreuzelevation) |
| S-Band-Antennen | S1000004/05, P1000004/05 | zwei Azimut-/Elevationspaare |

Die Positionen stammen seit v1.10 aus dem NASA-IGOAL-Stationsmodell (Module, Ports, Trägerstationen,
SARJ, Beta-Gelenke, Radiatoren, Nutzlastträger, MT/MBS, alle Greifpunkte). Die Formen bleiben
vereinfacht. **iROSAs** (die ausrollbaren Zusatzflügel) sitzen auf allen acht Flügeln; die beiden
zuletzt angebrachten erscheinen zeitgesteuert nach Simulationszeit (`IROSA_LATE`, `updateIrosa`): 2A ab
dem Einsatz am 29.10.2026 (Ausrollen 16:20 UTC), 3B ab dem geplanten Einsatz am 05.11.2026 (Ausrollen
geschätzt 17:23 UTC; verschiebt Launch Library 2 den Einsatz, wandert der Zeitpunkt mit). Vorher sind sie
unsichtbar, kurz davor aufgerollt am Mast, dann rollen sie über 10 min aus. ISSLive hat keinen Kanal
für die iROSAs. **Besuchsfahrzeuge** (Crew/Cargo Dragon, Starliner, Cygnus XL, HTV-X, Sojus, Progress)
werden für jeden Port einmal unsichtbar gebaut; die Bildschleife zeigt das, was laut Telemetrie bzw.
Launch Library 2 dort angedockt ist (`updateVehicles`).

**Montagekonvention der äußeren Träger.** Beide äußeren Baugruppen sind um 180° um die SARJ-Achse
gedreht und am BGA gegengedreht (`SOLAR_MOUNT`). So bleibt die Zellseite zur Sonne gerichtet, und die
PV-Radiatoren zeigen von der Sonne weg, wie bei der echten Station. Für Modellwinkel a (SARJ) und
b (BGA) ist die Normale der Zellseite `(cos a cos b, sin b, −sin a cos b)` (`solarNormal`).

## Von der Telemetrie zur Gelenkstellung: die Tabelle `CAL`

NASA veröffentlicht nicht, wo die Nullpunkte der Gelenke liegen und in welche Richtung sie zählen.
`CAL` in `iss_twin.html` bildet jeden Telemetriewert auf einen Modellwinkel ab:

```
Modellwinkel = sign · Telemetriewert + offset      (Funktion cal; uncal ist die Umkehrung)
```

| Gelenk | sign | offset | Beleg |
|---|---|---|---|
| SARJ Steuerbord / Backbord | +1 / −1 | 90 / 90 | Autotrack-Daten 20.10.2026: Fehler zum Sonnenziel −0,1 ± 0,14° |
| BGA 1A, 3B / 3A, 1B (Steuerbord) | +1 / −1 | −135 | Autotrack 20.10.: 0,09-0,5° RMS zum sonnenoptimalen Beta |
| BGA 4A, 2B / 2A, 4B (Backbord) | +1 / −1 | +45 | ebenso |
| TRRJ Steuerbord / Backbord | +1 / +1 | 0 | Drehung um X. Steuerbord aus einer NASA-Abstandsmessung, Backbord aus dem Livebild CP8 vom 10.11.2026; `checkTrrjSense()` prüft im Autotrack nach (siehe GEOMETRY.md) |
| Canadarm2, Ku-Antenne, MT | +1 | 0 | Umrechnung über `SSRMS_CONV` bzw. Antennengeometrie |

Fehlt ein Gelenk in der Telemetrie, steht es in der neutralen Modellpose (`ARM_NEUTRAL`,
Parkstellungen), nicht auf einem Rohwert 0. `liveJointsRaw()` liefert alle Gelenke aus der
Telemetrie, `liveJoints()` ergänzt sie um die Vorhersage bei Datenlücken (siehe unten), und
`applyJoints(J)` setzt sie ins Modell.

Ob eine Kalibrierung stimmt, lässt sich an der Sonne prüfen: Im Autotrack müssen alle Flügel zur
Sonne zeigen. Das Energie-Panel zeigt dafür „Model array Sun incidence“; im Autotrack liegt der Wert
nahe 100 %.

## Canadarm2 (SSRMS)

**Kinematik** (`buildSSRMS`), aus dem IGOAL-Rig übertragen: sieben Gelenke in der Reihenfolge
Schulter-Rollen (SR), Schulter-Gieren (SY), Schulter-Nicken (SP), Ellbogen-Nicken (EP),
Handgelenk-Nicken (WP), Handgelenk-Gieren (WY), Handgelenk-Rollen (WR).

| Abschnitt | Maß |
|---|---|
| LEE → Schulter-Rollgelenk | 1,359 m entlang der Rollachse |
| Giergelenk | 0,703 m neben der Rollachse |
| Nickgelenk | 0,569 m entlang der Nickachse |
| zwei Ausleger | je 7,110 m zwischen den Nickachsen, Seitenversatz 0,475 / 0,569 m |
| Handgelenk-Gieren | 0,703 m neben der Auslegerlinie |
| Handgelenk-Rollen / LEE | 0,292 m / 1,064 m weiter |

Bei allen Rig-Winkeln = 0 ist der Arm gestreckt. Beide Enden (LEE A und LEE B) können Basis sein;
`CSASSRMS002` nennt den Basisort, `CSASSRMS003` das verankerte Ende. Mit LEE A als Basis wird die
Kette vom Basisende aus gezeichnet und die Transformation Wurzel → Spitze invertiert, ohne die
physischen Gelenkidentitäten zu vertauschen. Ein Arm an einem festen Modul erbt nie die Bewegung des
Transporters; ein Arm am MBS fährt mit.

**Konvention Telemetrie → Rig (`SSRMS_CONV`).** Nicht veröffentlicht. Gewählt durch Testen jeder
Kombination aus Vorzeichen und Halbdrehung gegen zwei aufgezeichnete Live-Posen (14.10.2026, Basis
Node 2; 20.10.2026, MBS PDGF3, Basis LEE A): alle Vorzeichen +, Offset des Schulter-Rollgelenks 180°,
Gelenke vom Betriebsbasis-Ende aus benannt. Das ist die kollisionsfreie Wahl mit dem größten Abstand
in beiden Posen. Sie bleibt eine dokumentierte Annahme.

**v1.17: an Livebildern geprüft.** Öffentliche Unterlagen zu Nullpunkt und Drehsinn der ISSLive-Kanäle
gibt es nicht (gesucht in NASA NTRS, Robotik-Flugbüchern, ISS Mimic und Fachartikeln zur Kinematik).
Belegt ist nur, dass EP = 0 der gestreckte Arm ist (Singularität bei −15° < EP < +15°, STS-133 Robotics
Book). Deshalb wurde die Konvention an zwei Livebildern von CP8 (10.11.2026 13:26 UTC, 11.11.2026 14:10 UTC)
mit der dazu aufgezeichneten Pose geprüft (Basis MBS PDGF3, LEE B; SR 245,0 SY 52,0 SP −77,0 EP −115,0,
Handgelenk 0). Im Bild steht der Arm als umgekehrtes V: Ellbogen oben, Schulter am MBS, freies LEE auf
MBS-Höhe zur Kamera hin. Getestet wurden 1024 Kombinationen (Vorzeichen SR..EP, Halbdrehung SR/SY/SP,
8 Rollwinkel des Greifpunkts). Gewählt: **Vorzeichen SP −1**, sonst wie bisher, Rollwinkel PDGF3 0°.
Ellbogen auf 4 %, Handgelenk auf 1,3 % der Bildbreite getroffen. Die alte Wahl legte den Unterarm
waagrecht über die Kamera. Die Posen vom 14.10. (Node 2) und 19.10. (PDGF3, LEE A) bleiben frei, die vom
19.10. aber nur mit Gelenknamen nach Hardware (Konvention A, jetzt Vorwissen). Die Handgelenk-Vorzeichen
bleiben offen (in der geprüften Pose stehen sie auf 0). Dextre auf PDGF2: Rollwinkel 90° statt 135°,
damit Arm und Dextre in beiden Posen frei bleiben (Annahme).

**Greifpunkte.** Jeder Greifpunkt (PDGF) hat ein System: Ursprung auf der Greiffläche, +Y aus dem
Greifpunkt heraus. „Gegriffen“ heißt: Das System des freien LEE fällt mit dem Greifpunktsystem
zusammen. Die vier MBS-Greifpunkte (IDs 7, 8, 11, 13 = PDGF1-4) sitzen an den Ecken der Vorderseite
des MBS (`MBS_PDGF`, aus IGOAL); dazu kommen Greifpunkte an Lab, Node 2, Node 3 und FGB.

## MSS-Kalibrierung aus Live-Posen

Wie jeder MBS-Greifpunkt um seine Achse gedreht ist und wie ISSLive die Gelenke benennt, wenn LEE A
die Basis ist, ist nicht veröffentlicht. Das Programm **lernt** beides: Der echte Arm durchdringt nie
die Station, also schließt jede Live-Pose die Hypothesen aus, unter denen sie kollidieren würde.

- Kandidaten: 8 Rollwinkel je MBS-Greifpunkt (Vorwissen `MBS_PRIOR`: PDGF3 0°, PDGF2 90°, sonst 135°), 2 Gelenkkonventionen (Vorwissen A).
- Gelernt wird nur aus einer vollständigen Pose, die 3 s stabil war (der Schnappschuss kommt in
  Paketen; eine halbe Pose würde richtige Hypothesen ausschließen).
- Kontakt Arm ↔ Dextre ist kein Beleg (einer der beiden Rollwinkel kann noch falsch sein); er dient
  nur zur Auswahl unter den Überlebenden.
- Gewählt wird die Hypothese, die dem Vorwissen am nächsten liegt.
- Gespeichert im Browser unter `iss.cal.mss4` (v1.17 verwirft die alten Belege aus `iss.cal.mss3`) (Funktionen `learnMssFromPose`, `placeMbsFixture`,
  `mssCalLabel`). Der Tooltip der Pose zeigt den Stand.

**Dextre** steht auf dem Greifpunkt, den `CSASPDM0002` meldet (ohne diesen Kanal auf der Zenitseite
des MBS). Basis 19 („SSRMS TIP LEE“) heißt: Dextre hängt mit seinem oberen Greifpunkt (3,9 m über dem
eigenen Fuß-LEE) am freien Ende von Canadarm2.

## Umsetzen von Canadarm2 im Kommandomodus

Im Kommandomodus kann man Canadarm2 wie bei einem echten „walk-off“ an einen anderen Greifpunkt
umsetzen (Abschnitt „Joint & mechanism targets“):

1. **Plan & move:** Inverse Kinematik (gedämpfte kleinste Quadrate auf der echten Modellkette,
   Gelenkgrenzen ±270°) für die Greifpose und eine Vor-Greifpose 2 m vor dem Greifpunkt. Ein Weg zur
   Vor-Greifpose wird mit **RRT-Connect** im 7-dimensionalen Gelenkraum geplant, mit Abstandsprüfung
   alle ≤ 2° Gelenkweg, danach geglättet. Der Endanflug ist eine Gerade entlang der Greifpunktachse
   (eine Kette von IK-Lösungen von 2,0 auf 0 m). Alle Gelenke bewegen sich koordiniert und kommen
   gleichzeitig an.
2. **Capture:** Das freie LEE rastet ein (nur innerhalb 2 cm / 0,5°). Solange beide Enden angedockt
   sind, sind Armgelenke und Transporter gesperrt.
3. **Release old base:** Die Basis wechselt ohne Sprung auf das andere LEE.

Nicht erreichbare oder blockierte Ziele werden mit Begründung abgelehnt.

## Vorhersage über Datenlücken

Während LOS oder bei stummem Feed würde jedes Gelenk auf seinem letzten Wert einfrieren, während Bahn
und Sonne weiterlaufen. Nach 30 s Lücke werden deshalb Gelenke vorhergesagt, die bekanntermaßen
nachführen (`predictJoints`):

- SARJ oder TRRJ, deren letzter gemeldeter Modus AUTOTRACK ist, folgen ihrem Autotrack-Gesetz.
- Das Beta-Gelenk eines Flügels folgt der Sonne nur, wenn es bei frischen Daten nachgeführt hat
  (`learnTracking`), oder, vor jeglichen frischen Daten, wenn sein SARJ im Autotrack ist.
- Geparkte Gelenke (DIR POS) bleiben stehen; die Lage wird relativ zu LVLH gehalten.

Die Pose heißt dann „PREDICTED POSE“; Vorhersagen werden nie in den Telemetriespeicher geschrieben.

## Radiatoren

Das TRRJ dreht den Radiatorbalken um die Körper-X-Achse (Längsachse der Radiatoren): Die drei ORUs
einer Seite bilden eine Fläche, die wie ein Solarflügel um ihre Mittelachse rollt. Der Weg ist ±105°,
durch den Schlauchanschlag darf das Gelenk nicht drehen. Bei Sonne stehen die breiten Seiten kantig
zur Sonne, im Erdschatten zeigt eine Seite zur Erde.

- `radiatorNormal(a)` (`iss-model.mjs`): Plattennormale `(0, −sin a, cos a)` für den Modellwinkel a.
- `radiatorGoal()`: Ziel aus Sonne (`a = atan2(s_z, s_y)`) bzw. Nadir (`a = atan2(−n_y, n_z)`).
- `radiatorTarget()` (`model-checks.mjs`): wählt unter den gleichwertigen Ausrichtungen
  (Ziel ± n·180°) die nächste innerhalb von ±105°.
- `checkTrrjSense()`: prüft den Drehsinn an Autotrack-Daten und korrigiert ihn bei Widerspruch.

Bei Beta 0 liegt die Sonne in der XZ-Ebene; der Radiator steht dann den ganzen Tagbogen senkrecht
(±90°) und legt sich im Schatten flach. Über den ganzen Bereich bleibt er frei von der modellierten
Struktur (`tests/test_radiators.mjs`).

## Kollisionsprüfung

`model-checks.mjs` stellt `CollisionMonitor` bereit, in zwei Stufen:

1. **Grobprüfung:** Achsenparallele Boxen aller sichtbaren Teile, entlang x sortiert
   (Sweep-and-Prune), dann orientierte Boxen (OBB). Paare aus zwei festen Teilen werden nie geprüft.
2. **Feinprüfung:** GJK auf den konvexen Hüllen der echten Meshes. Nötig, weil die Box eines
   Zylinders unter 45° um (√2 − 1)·r über die Hülle ragt (bei Harmony ~0,9 m) und sonst Teile, die
   dort sitzen, fälschlich als Kollision gemeldet würden. Dünne Platten bekommen eine Hülle von 4 cm.

Ausgenommen sind absichtliche Kontakte (`excluded()`): gleiche Baugruppe, benachbarte Armglieder,
Lager/Welle, Antenne/Mast, Gelenkhülsen, Schienenwagen, Andockflächen. Die Überwachung läuft
höchstens alle 250 ms und nur bei geänderter Pose (0,05° / 1 cm). Getroffene Teile werden rot
umrahmt; ein Klick auf das rote Banner speichert einen Überlappungsbericht (JSON) mit allem, was zum
Nachstellen der Pose nötig ist.

Eine Überlappung bei Live- oder SIM-Posen heißt: Die Abbildung Telemetrie → Modell ist falsch (die echte
Station kollidiert nicht). Genau das nutzt die MSS-Kalibrierung. `armChecker()` liefert einen
schnellen Prüfer für die Bahnplanung des Arms, bei dem alles außer dem Arm eingefroren ist.

Die Prüfung ist **keine** kontinuierliche Kollisionserkennung und keine flugtaugliche
Abstandsanalyse; weggelassene Geometrie kann Kollisionen verbergen.

## Erdkugel

`makeEarth()` baut eine Kugel mit eigenem Shader (Tag/Nacht-Terminator, Randlicht). Im **Fotomodus**
legt `EarthTiles` (`earth-tiles.mjs`) darüber einen Quadtree aus NASA-GIBS-Kacheln (Blue Marble,
Stufe 2 lokal, Stufen 3-7 nachgeladen). Eine Eltern-Kachel wird nur als Ganzes ersetzt, wenn alle
Kinder geladen sind; Randschürzen schließen die Fugen zwischen Stufen. Alle Normalen sind exakt radial
(mit `computeVertexNormals()` hatten die Kachelränder schräge Normalen bekommen, was im Fotomodus
helle Linien und unterschiedlich getönte Kacheln erzeugte (behoben in v1.11). Im **Radarmodus**
zeichnet `PlanetOverlay` (`planet-overlay.mjs`) Gradnetz, Küsten und Grenzen als Linien in den Farben
des Farbschemas. Ortsbeschriftungen werden fünfmal pro Sekunde ausgewählt (Horizont, Bildrand,
Überlappung) und folgen in jedem Bild der Kamera.
