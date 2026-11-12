# Geometrie-Prüfung (Stand v1.15; Abschnitte bis v1.8 vom 20.10.2026)

Dieses Dokument hält fest, woher Lage und Maße des 3D-Modells stammen, was gegen echte Daten
geprüft wurde und was eine Annahme bleibt. Koordinaten in Metern im Körpersystem der Station:
**+X vorwärts** (Flugrichtung, Ende mit Node 2), **+Y Steuerbord** (Gitterträger), **+Z Nadir**
(zur Erde). Hintergrund zu den Begriffen steht in [docs/MODELL_UND_KALIBRIERUNG.md](docs/MODELL_UND_KALIBRIERUNG.md).

## v1.15: Radiatoren rollen um X, Modell neu aufgebaut

**Radiatorgelenk (TRRJ).** Bis v1.14 drehten die Hauptradiatoren im Modell um die Trägerachse Y und
klappten damit wie Landeklappen auf und ab. Das war falsch. Das TRRJ sitzt mittig an der Rückseite
von S1 bzw. P1 und dreht den Radiatorbalken um die **Körper-X-Achse**, also um die Längsachse der
Radiatoren. Balken und die drei Radiator-ORUs bilden eine ebene Fläche von etwa 22 m × 11 m, die wie
ein Solarflügel um ihre Mittelachse rollt. Belege:

- NASA TM-110318 beschreibt die Drehung des TRRJ „about the +X direction“ des Stationssystems.
- Die Regelstrategie „Kante zur Sonne, Fläche zur Erde“ mit ±105° Weg geht nur um X auf: Bei
  Beta 0 steht die Fläche dann dauerhaft senkrecht (in der Bahnebene), im Schatten liegt sie flach.
  Um Y müsste der Radiator pro Umlauf einmal ganz herum.
- NASA-Fotos zeigen die drei Radiatoren einer Seite als gemeinsam geneigte Fläche, nie als Klappe.

Modellwinkel = Rechtsdrehung um +X in Grad, 0° = Platten flach in der XY-Ebene. Die Normale ist
`(0, −sin a, cos a)` (`radiatorNormal` in `iss-model.mjs`).

| Vorzeichen | Wert | Beleg |
|---|---|---|
| Steuerbord (S0000001) | +r | NASA-Abstandsmessung 2010: Bei γ = +35° kommt die Außenkante des S1-Radiators der Nutzlast CTC-2 auf ELC-4 (S3 unten) am nächsten. Positive Werte senken also die Steuerbordkante |
| Backbord (S0000002) | +r | Baugleiche Gelenke, beide mit der Abtriebsseite nach hinten, also gleicher Drehsinn im Körpersystem. Livebild CP8 vom 10.11.2026 (P 15,2°): Die Innenkante des P1-Radiators liegt tief, die Fläche läuft von der Kamera weg nach unten. Mit −r stünde sie groß und hell im rechten Bilddrittel |

Der Beleg für Backbord ist schwächer als der für Steuerbord. Deshalb prüft `checkTrrjSense()` im
Betrieb nach: Läuft ein TRRJ bei Sonnenlicht im AUTOTRACK, muss sein Radiator kantig zur Sonne
stehen. Passt das über 20 Proben nur mit umgekehrtem Vorzeichen, wird es übernommen, gespeichert
(`iss.cal.trrj`) und im Ereignisprotokoll gemeldet. In allen bisherigen Aufzeichnungen (14.10.,
19./20.10., 10.11.2026) waren beide TRRJ geparkt (DIR POS).

Freiraum: Über den ganzen Bereich von ±105° bleiben beide Radiatoren frei von der modellierten
Struktur. Der P1-Radiator kommt der Bishop-Luftschleuse bei +46° auf etwa 0,4 m nahe. Die frühere
Sperrzone bei +40° gehörte zur falschen Klappachse und ist entfallen.

**Neu aufgebautes Modell (`iss-model.mjs`).** Lage und Hauptmaße bleiben die IGOAL-Werte unten.
Geändert sind Formen, Farben und Detailgrad:

| Bereich | Stand v1.15 |
|---|---|
| Druckmodule | Rotationskörper mit kegeligen Enden statt glatter Zylinder; Kibo, Columbus und Leonardo blank silbern, übrige US-Module hellgrau, BEAM mit weißer Stoffhülle, PMAs dunkelgrau |
| Gitterträger | S0 und S3/P3 achteckig, S1/P1 dreieckig; S4-S6/P4-P6 und die Solarflügel-Masten als echte Stabgitter (nur Solid), dazu Hüllkörper für Holo und Kollision |
| Solarflügel | Zellraster als Textur (82 × 10 Felder je Bahn), Rückseite Kapton; iROSA 19 m × 6 m, Neigung 10° (NASA; vorher 11,2°), mit Auslegern, Wurzelbehälter und Wickelrolle |
| Radiatoren | weiß mit Plattenfugen; drei ORUs je Seite, je acht Platten 3,4 m × 2,75 m |
| Ergänzt | zweite Ku-Band-Antenne (SGANT 2, starr), Kreiselabdeckungen an Z1, Streben S0/Destiny, Ammoniak- und Stickstofftanks und Pumpenmodule an S1/P1, vier Hochdrucktanks an Quest, ESP-1, externe Nutzlasten und Bartolomeo an Columbus, JEM-Roboterarm (feste Parkstellung), Cupola-Fenster, eingefahrene Sarja-Flügel, Nauka-Luftschleuse, Dragon mit SuperDraco-Gondeln und Trunkflossen |
| Kameras | Kameragruppen als Modell: Trägerrohr, Schwenk-Neige-Kopf, SD-Kamera, Leuchte, HD-Kamera (siehe docs/KAMERAS.md) |

Ohne veröffentlichte Lage und deshalb angenähert: Geräte auf S1/P1, Tanks an Quest, JEMRMS,
Bartolomeo, Nauka-Luftschleuse. Diese Teile sind Detail ohne Kollisionskörper.

**Flimmern (Z-Fighting).** Bis v1.14 lagen in der Solid-Darstellung Rasterlinien genau auf den
Flächen der Solarflügel, Radiatoren und Träger; das flimmerte. In v1.15 gibt es in Solid keine
Linien auf Flächen mehr (Raster sind Texturen, Gitter sind echte Stäbe). `tests/test_zfight.mjs`
prüft zusätzlich, dass nirgends zwei verschieden aussehende Flächen deckungsgleich und von derselben
Seite sichtbar sind, in Grundstellung, drei Gelenkstellungen und mit jedem Besuchsfahrzeug.

## v1.10: Anordnung aus dem NASA-IGOAL-Stationsmodell (ersetzt die Koordinaten weiter unten)

Die Positionen der Elemente stammen aus dem Konstruktionsmodell der NASA:
[NASA 3D Resources, „International Space Station (ISS) (D) (IGOAL)“](https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models)
(glTF, SSREF-System in Zoll; SSREF x = Körper X, y = Körper Z (Nadir), z = −Körper Y). Das
Modell selbst wird nicht mitgeliefert; nur die Zahlen unten wurden daraus entnommen
(Knotensysteme und Mesh-Ausdehnungen, umgerechnet in Meter im Körpersystem). Die Formen
bleiben einfache Grundkörper.

| Element | v1.9 | v1.10 (IGOAL) |
|---|---|---|
| USOS-Druckachse | Z 3,6 | Z 4,85 |
| Achse russisches Segment | wie USOS | Z 4,14 (Versatz durch PMA-1) |
| Unity / Destiny / Harmony | X −8,75..−3,25 / −3,25..5,25 / 6,0..13,2 | −7,71..−2,26 / −2,26..6,42 / 6,42..13,12 |
| Radiale Ports Harmony (Columbus, Kibo, PMA-3, Nadir-CBM) | X 9,6 (Knotenmitte) | X 10,96 (vorderes Ende) |
| Andockfläche IDA-3 (Cargo Dragon) | X 9,6, Z −1,8 | X 11,66, Z −0,17 (PMA-3 0,71 m nach vorn versetzt) |
| Andockfläche IDA-2 | X 16,4, Z 3,6 | X 16,09, Z 5,56 |
| Radiale Ports Unity (Node 3, Quest, Z1, Nadir-CBM) | X −6,0 | X −4,45 |
| Radiale Ports Tranquility (Cupola, PMM, BEAM) | Y −5,63 | Y −6,64 |
| Hintere Andockfläche Swesda | X −39,1 | X −35,73 |
| Station Poisk / Nauka / Prichal | X −24,85 | X −23,69; Nadirfläche Prichal Z 21,83 |
| Kastenprofil des Gitterträgers | X ±2,3, Z ±1,9 | X −1,65..1,70, Z ±2,2; S1/P1 dreieckig, Spitze hinten |
| SARJ | Y ±27,4 | Y ±26,0 |
| Beta-Gelenke | Y ±33,8 / ±49,0, Masten 1,7 m neben der Achse | Y ±33,4 / ±48,45, Masten 2,04 / 2,75 m neben der Achse, 0,66 m seitlich |
| Äußeres Ende S6/P6 | Y ±52 | Y ±48,7 |
| Radiator (TRRJ) Wurzel / Spannweite | X −3,8, Y 11,3..20,7 | Gelenk X −0,15..−1,4 bei Y ±14,68, Spannweite Y 9,2..20,1, Platten bis X −24,7 |
| MT / MBS | X 2,3..3,5 / 3,5..4,9 | X 1,6..2,45 / 2,5..3,5 |
| Greifpunkte am MBS | geschätzte Ecken, gelernt | PDGF1 Steuerbord-Nadir, 2 Steuerbord-Zenit, 3 Backbord-Zenit, 4 Backbord-Nadir, X 3,5..3,7, Blick nach +X |
| PDGF am Lab | Backbordseite, horizontal | (3,52, −1,44, 6,72), Backbord-Nadir, IGOAL-System |
| PDGF an Node 2 | Zenit-Steuerbord | (7,59, −0,40, 7,20), Nadirseite des hinteren Harmony-Endes, IGOAL-System |
| ELC/ESP-Plätze | ESP-3 an P3 | ESP-3 S3 unten außen; P3 trägt ELC-3 (oben) und ELC-1 (unten) |
| Flügelkanäle Backbord | 2A/4B an den −Z-Masten | 4A/2B an den −Z-Masten (Backbordträger = um 180° gegierter Steuerbordträger; jedes BGA dreht jetzt gleichsinnig um seinen eigenen Mast) |

Canadarm2 ist aus dem IGOAL-Rig übertragen: LEE bis Schulter-Rollgelenk 1,359 m, Giergelenk
0,703 m neben der Rollachse, Nickgelenk 0,569 m entlang der Nickachse, zwei Ausleger von
7,110 m zwischen den Nickachsen mit 0,475 / 0,569 m Seitenversatz, Handgelenk-Gieren 0,703 m
neben der Auslegerlinie, Handgelenk-Rollen 0,292 m und LEE 1,064 m weiter.

Was IGOAL nicht liefert, ist die Abbildung der ISSLive-Gelenkwerte auf Rig-Winkel (Vorzeichen
und Nullpunkt je Gelenk) sowie den Rollwinkel jedes MBS-Greifpunkts. Jede Kombination aus
Vorzeichen und Halbdrehung wurde gegen die beiden aufgezeichneten Live-Posen getestet
(14.10.2026, Basis Node 2; 20.10.2026, MBS PDGF3, Basis LEE A, CRS-35 an IDA-3). Viele sind
kollisionsfrei; verwendet wird die einfachste mit dem größten Abstand: alle Vorzeichen +,
Nicken/Gieren null = gestreckter Arm, Offset des Schulter-Rollgelenks 180° im Rig-System,
Gelenke vom Betriebsbasis-Ende aus benannt, Rollwinkel der MBS-Greifpunkte 135° (Vorwissen;
wird weiter aus Live-Posen gelernt). v1.17: Vorzeichen SP −1 und PDGF3 mit 0°, an den Livebildern CP8 vom 10. und 11.11.2026 geprüft (siehe docs/MODELL_UND_KALIBRIERUNG.md). Damit ist der Arm vom 20.10. überall frei; sein freies
LEE ist etwa 1,6 m von der Verbindung Kapsel/Trunk des Cargo Dragon entfernt (CRS-35 brachte
das letzte iROSA-Paar, das Canadarm2 aus dem Trunk holen soll). Diese Abbildung ist eine
dokumentierte Annahme, keine veröffentlichte Konvention.

AMS-02 ist nur mit seinem Hauptkörper (Y 20,5..22,9), dem Detektorstapel und zwei Radiatorflächen modelliert.

## v1.8: Prüfung gegen die Sonne (ersetzt die BGA-Zeilen von v1.1 weiter unten)

Aufzeichnung `tests/live_sample_20261020.json`: 11 min ISSLive, beide SARJs in AUTOTRACK, bei
Sonnenlicht. Sonne im Körpersystem aus Zustandsvektor, Quaternion und Sonnenephemeride.

| Prüfung | Ergebnis |
|---|---|
| Richtung der Quaternion (Körper → LVLH), LVLH-Achsen | Fehler zum SARJ-Ziel −0,1 ± 0,14°; mit der inversen Quaternion: 18° |
| SARJ S / P | unverändert: S = r + 90, P = 90 − r; Backbord fällt, Steuerbord steigt, wie es die Sonnenbewegung verlangt |
| BGA Steuerbord 1A, 3B / 3A, 1B | +r − 135 / −r − 135 (0,09-0,5° RMS zum sonnenoptimalen Beta) |
| BGA Backbord 4A, 2B / 2A, 4B | +r + 45 / −r + 45 |
| Ausrichtung des ganzen Modells | richtig: Erdpunkt darunter, Spur voraus entlang +X, Norden auf der richtigen Seite; Harmony +X, Swesda −X, Columbus +Y, Kibo −Y. Eine 180°-Drehung um Z ist ausgeschlossen |
| Ku-SGANT (Z1000014/15) | Hauptstrahlrichtung trifft den geostationären Ring während der ganzen Aufzeichnung bei einer Länge zwischen 80 und 95° O (ein TDRS, Streuung < 1°) |
| TRRJ | Achse und Vorzeichen siehe Abschnitt v1.15; im Autotrack noch nicht beobachtet |

Die BGA-Abbildung von v1.1 unten wurde aus einem Schnappschuss mit geparkten SARJs abgeleitet,
bei dem sich die möglichen Konventionen nicht unterscheiden lassen; mit ihr zeigten nachführende
Flügel von der Sonne weg.

## v1.1: Kalibrierung gegen die Telemetrie (historisch)

Schnappschuss `tests/live_sample_20261014.json` (ISSLive, 20:33-20:40 UTC). Sonne im
Körpersystem aus Telemetrie-Zustandsvektor, Quaternion und einer einfachen Sonnenephemeride:
(−0,81, −0,34, −0,48), beleuchtet, β ≈ 14°. (USLAB000040 zeigte zur selben Zeit −63,6° und passt
nicht zum Zustandsvektor; das Dashboard berechnet β weiterhin selbst.)

| Gelenk | Werte | Abbildung (Modell = Vorzeichen·Wert + Offset) | Beleg |
|---|---|---|---|
| SARJ S / P | 270,58 / 89,73 | S: +r + 90, P: −r + 90 | P + S = 360,3: gespiegelte Gelenke; beide ergeben α = 0,6 / 0,3 |
| BGA S unten 1A, 3B / oben 3A, 1B | 160,04 / 199,96 | unten −r, oben +r | oben = 360 − unten |
| BGA P unten 2A, 4B / oben 4A, 2B | 19,95 / 340,05 | unten r − 180, oben 180 − r | Backbord = 180 − Steuerbord |
| TRRJ S / P | 25,0 / 40,0 | S +r, P +r um die X-Achse (v1.15) | siehe Abschnitt v1.15. Die Einträge von v1.1 bis v1.14 bezogen sich auf die falsche Klappachse |

Mit dieser Tabelle ergaben alle acht Flügel eine gemeinsame physikalische Ausrichtung, deren
Neigung aus der Ebene (sin 20° = 0,34) der Y-Komponente der Sonne (0,34) entspricht. Der mittlere
Einfall war 0,88, und die PV-Radiatoren zeigten von der Sonne weg. Die Daten vom 15.10. (beide
TRRJs und beide SARJs stundenlang geparkt) zeigen die HRS-Radiatoren tatsächlich in der Sonne;
das ist der echte Zustand der Station, kein Modellfehler. Der umgekehrte SARJ-Drehsinn passte
zur geparkten Probe genauso gut. (v1.8: mit Autotrack-Daten bei Sonnenlicht geklärt, siehe oben;
das Lernen zur Laufzeit wurde entfernt.)

Robotik im selben Schnappschuss: Canadarm2 an Node 2 (LEE B), Gelenke −27,7, 43,7, −102,7,
130,7, −171,2, 184,3, 230,4; MT −5,26 m; Dextre verstaut. Beide Arme sind mit seitlich
versetzten Nickgelenken und versetztem Handgelenk modelliert (wie beim echten SSRMS/SPDM). Die
geflogene Pose ist frei von aller modellierten Struktur. Ort und Rollwinkel des Greifpunkts an
Node 2 waren damals Modellentscheidungen, um diesen Abstand zu erfüllen, keine veröffentlichten
Koordinaten (seit v1.10 aus IGOAL).

Dieses prozedurale Modell ist **nicht 100 % lagegenau**. Öffentliche Zeichnungen und Maße legen
Montagebeziehungen, Größen und Bewegungsachsen fest, liefern aber keine vollständige
Koordinatenvermessung, nicht alle Greifpunkt-Transformationen und nicht den mechanischen
Nullpunkt und das Vorzeichen jedes öffentlichen Telemetriekanals. Die Korrekturen unten
verbessern das Modell, ohne geschätzte Koordinaten als Flugmessungen auszugeben.

## v1.0: Korrekturen

- **Station der inneren IEA.** Die Mitte der IEA an S4/P4 wanderte von 5,4 m auf 6,4 m außerhalb
  der SARJ-Mitte. Mit 11,6 m breiten Flügeln reichte die innere Zellbahnkante samt Staubox vorher
  0,35 m *innerhalb* der SARJ-Ebene. Weil sich die äußere Baugruppe endlos dreht, schwenkte die
  Box durch den SARJ-Ring und den rechteckigen Endrahmen von S3/P3. Die Kante liegt jetzt 0,65 m
  außerhalb der Ebene (0,2 m Abstand zum Ring). Der Flügelabstand S4-S6 beträgt etwa 3,6 m. Ein
  vollständiger Durchlauf über alle Alpha × Beta × TRRJ findet keine Berührungen.
- **Nutzlastplätze S3/P3.** AMS-02 und ELC-2 teilen die Zenitseite von S3 (AMS innen), ELC-4
  sitzt auf dem inneren Nadirplatz von S3, ELC-3 auf dem inneren Zenitplatz von P3, ESP-3 auf dem
  inneren Nadirplatz von P3 und ELC-1 auf dem äußeren Nadirplatz von P3. ELC-2 saß vorher bei
  y = 20 m, innerhalb von AMS-02 und teilweise über S1. Träger und Nutzlasten sind veranschaulichende
  Hüllkörper. (Seit v1.10 gelten die IGOAL-Plätze aus der Tabelle oben.)
- **Robotik.** Das obere LEE von Dextre berührt jetzt physisch das MBS. Der ERA (zwei Ausleger,
  Ellbogen und beide Endeffektoren) ist an der Rückseite von Nauka verstaut.

## Koordinaten und Korrektur der äußeren Träger

Kraftweg der Radiatoren (v1.15): Träger S1/P1 → festes TRRJ-Gehäuse an der hinteren Trägerspitze →
Rotor → Radiatorbalken → Wurzelrahmen der drei ORUs → Ausfahrgelenke → Platten. Nur Rotor, Balken
und ORUs drehen. Automatische Prüfungen bestätigen Anbindung und Freiraum über ±105°.

Die Ausrichtung im SIM wird über erzeugte Telemetrie und Plattennormalen im Szenensystem über zwei
volle Umläufe getestet. Bei Tag stehen die breiten Seiten kantig zur Sonne, auch wenn die
*Längsachse* der Platte zur Sonne zu zeigen scheint. Im Erdschatten maximiert das einachsige
Gelenk die zur Erde zeigende Fläche. Der SIM nutzt ideale Schnappschüsse, der Kommandomodus
schwenkt auf diese Ziele zu und kann vorübergehend mehr Sonneneinstrahlung haben.

Körperachsen sind +X vorwärts, +Y Steuerbord und +Z Nadir, in Metern. Die Lage ist eine
Quaternion (Skalarteil zuerst), die Körperkoordinaten nach LVLH abbildet. Gieren/Nicken/Rollen
folgen der Reihenfolge 3-2-1: Gieren um Z, Nicken um Y, Rollen um X.

Beide äußeren Baugruppen erhalten eine 180°-Drehung um die SARJ-Achse. Der BGA-Winkel des Meshes
wird zu 180° minus Beta-Winkel des Modells. Diese gepaarte Transformation erhält die Normale der
Zellseite und verlegt die PV-Radiatorstruktur auf die andere Seite. Für die Modellwinkel a und b
ist die Normale der Zellseite `(cos(a)cos(b), sin(b), -sin(a)cos(b))`; der ausgefahrene
PV-Radiator zeigt in Richtung `(-cos(a), 0, sin(a))`. Autotrack richtet also die Zellseite zur
Sonne und den Radiatorausleger von ihrer XZ-Projektion weg. Die Normalen der breiten
Radiatorseiten bleiben senkrecht zur Sonne. Das wird an den tatsächlichen Three.js-Transformationen
aller acht Flügel und aller vier Radiatorbaugruppen getestet.

Das sind **Montagekonventionen des Modells**. Die rohen Telemetriewerte und PUI-Zuordnungen
bleiben unverändert. Die Tabelle `CAL` übersetzt Telemetrie in Modellwinkel und ist gegen bekannte
Flugposen geprüft (siehe oben). Die veröffentlichte BGA-Darstellung der NASA zeigt
unterschiedliche Vorzeichen für gegenüberliegende Flügel; das ist mit der Tabelle von v1.8
berücksichtigt.

Die gegenüberliegenden Mastwurzeln teilen sich die Längsstation ihrer IEA. Der frühere
willkürliche Versatz von ±1,3 m in Trägerrichtung vergrößerte die Hülle geparkter Flügel und
legte die neu modellierten Stauboxen durch benachbarte ELC-Platzhalter. Ohne diesen Versatz sind
die Paare wieder ausgerichtet und diese Überlappungen verschwunden.

## Baugruppen im Überblick

| Baugruppe | Geprüft oder korrigiert | Verbleibende Näherung |
|---|---|---|
| S0, S1/P1, S3/P3, S4/P4, S5/P5, S6/P6 | Symmetrische Hierarchie Backbord/Steuerbord; S4/5/6 samt Solar- und PV-Radiatorstruktur bewegen sich gemeinsam auf ihrem SARJ | Profilmaße, Gelenkmittelpunkte, Gitterwerk und Ausrüstung sind schematisch |
| SARJs | Drehung um die Trägerachse Y; Ringdurchmesser nach JAXA-Angabe von 5 m auf etwa 3,5 m korrigiert | Axiale Dicke, Lagerdetails und Schnittstellenpositionen |
| Acht Solarflügel | S4: 1A/3A; S6: 3B/1B; P4: 2A/4A; P6: 4B/2B. Zwei Zellbahnen, ein Mast und zwei Stauboxen je Flügel; Breite 11,4-11,6 m; ausgefahren etwa 34-35 m | Genaue Versätze, Flexibilität, Einfahren und elektrische Details |
| Acht iROSAs | an allen acht Flügeln: 2B/4B (2021), 3A/4A (2022), 1A/1B (2023), 2A (29.10.2026), 3B (geplant 05.11.2026); erben deren Gelenke. 2A und 3B erscheinen zeitgesteuert (`IROSA_LATE`) | Näherungsmaße, Neigung (10°) und Halterungen; Zeitpunkte aus Presseberichten, für 3B geschätzt; keine Telemetrie für die iROSAs |
| Vier Photovoltaik-Radiatoren | je sieben gekoppelte Platten, von der äußeren Baugruppe getragen, beim Nachführen sonnenabgewandt | Gelenk-/Ausfahrdetails |
| Sechs Haupt-HRS-Radiatoren | drei ORUs je Seite auf einem Balken; das TRRJ rollt die ganze Fläche um die X-Achse, ±105° | Vorzeichen Backbord aus einem Livebild, Autotrack-Probe steht aus; Ausfahrmechanik schematisch |
| US-Module | Achskette Destiny/Unity/Harmony; Columbus Steuerbord, Kibo Backbord; Tranquility Backbord; Cupola Nadir | Zylinderformen, Andock-/Anlegeschnittstellen im Detail |
| Russische Module | Kette Sarja/Swesda; Poisk Zenit; Nauka/Prichal und Rasswet Nadir | Vereinfachte Modulprofile, Flügel, Andockrahmen und äußere Mechanismen |
| Canadarm2 / MT / MBS | Sieben Gelenke nach IGOAL; beide Enden als Anker; vier MBS-Greifpunkte bewegen sich mit dem MT, feste Modul-Greifpunkte nicht | Gelenkkonvention und MBS-Rollwinkel sind Annahmen (siehe oben); kein zertifiziertes Robotikmodell |
| Dextre / Antennen | Zwei Arme mit je sieben Gelenken plus Körperrollen; Ku und zwei S-Band-Gelenkpaare | Schematische Geometrie, Platzierung und mechanische Nullpunkte |
| Nutzlasten / Besuchsfahrzeuge / Antrieb | Anbringung und Eltern-Beziehungen geprüft | Box-Platzhalter, angenommene Fahrzeugtypen und Lage der virtuellen Düsen; kein vollständiges aktuelles Außeninventar |

Aus einer bestandenen Kollisionsprüfung darf man keine absolute Lagegenauigkeit ableiten. Der
Detektor nutzt orientierte Boxen als Grobprüfung und GJK auf den Hüllen der echten Meshes zur
Bestätigung, nimmt absichtliche Verbindungen und Paare fester Teile aus und hat weder die
vollständige ISS-Geometrie noch eine kontinuierliche Kollisionserkennung.

## Greifpunkte am MBS und die Gelenkkonvention bei LEE A (v1.7, historisch)

Das MBS hat vier Greifpunkte, „je einen an seinen vier oberen Ecken“; welche Ecke PDGF 1-4 ist
und wie jeder Greifpunkt gedreht ist, war nicht veröffentlicht. Ob ISSLive die Armgelenke nach
Hardware oder vom Betriebsbasis-Ende aus benennt, wenn LEE A die Basis ist, ist ebenfalls nicht
dokumentiert. Beides wurde aus Live-Posen gelernt (echte Posen kollidieren nie). Seit v1.10 kommen
die Ecken aus IGOAL; gelernt wird nur noch der Rollwinkel (8 Kandidaten je Greifpunkt) und die
Konvention (2 Kandidaten). Gespeichert wird im Browser unter `iss.cal.mss3`.

## Quellen

- [JAXA S3/S4 Spezifikation und Komponentenzeichnungen](https://iss.jaxa.jp/iss/13a/mission/payload/s3_s4truss/): SARJ-Durchmesser etwa 3,5 m; ausgefahrene Flügel etwa 11,6 m × 35 m; zwei Zellbahnen und Stauboxen je Flügel; Aufbau BGA/SARJ.
- [NASA ISS Payload Thermal Design, Folien 30-36](https://tfaws.nasa.gov/wp-content/uploads/TFAWS2015-SC-ISS-Payload-Thermal-Design.pdf): Lageachsen der Station, Gelenkdarstellungen und Radiatorstrategie „Kante zur Sonne / Fläche zur Erde“.
- [NASA Station Assembly Elements](https://www.nasa.gov/international-space-station/international-space-station-assembly-elements/): Modulbeziehungen und die 2021-2023 installierten iROSA-Kanalpaare.
- [NASA ATCS Overview](https://www.nasa.gov/wp-content/uploads/2021/02/473486main_iss_atcs_overview.pdf): Aufbau, Maße und Bewegungsgrenzen der Radiatoren.
- NASA TM-110318 (Simulation der Mikrogravitationsumgebung der ISS): Drehung des TRRJ um die +X-Richtung des Stationssystems.
- NASA, photogrammetrische Abstandsmessung zwischen S1-Radiator und CTC-2 auf ELC-4 (2010): engste Annäherung bei γ = 35°.
- [NASA 3D Resources, IGOAL-Modell](https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models): Positionen aller Elemente und die Canadarm2-Kinematik (seit v1.10).

Automatische Regressionstests prüfen die innere kinematische Konsistenz und ausgewählte
Quellmaße. v1.0 und v1.15 wurden zusätzlich in headless Chromium (WebGL über SwiftShader) visuell geprüft.
