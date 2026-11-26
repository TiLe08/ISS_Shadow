# Abdeckung und Validierung (Stand v1.12, 03.11.2026)

**Dies ist ein digitaler Zwilling für die Lehre, kein vollständiger ISS- oder Flugsimulator.**
Dieses Dokument beschreibt, welche öffentlichen Kanäle genutzt werden, was das Modell und die
virtuelle Station tatsächlich nachbilden und wo die Grenzen liegen. Die Herkunft der Geometrie
steht in [GEOMETRY.md](GEOMETRY.md), der Aufbau des Programms in [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).

## Kurzüberblick nach Version

- **v1.12:** Alle acht iROSAs; 2A (29.10.2026) und 3B (geplant 05.11.2026) erscheinen zeitgesteuert,
  weil ISSLive keinen Kanal für die iROSAs hat.
- **v1.11:** Luftwiderstand in der Bahn der virtuellen Station (≈ 94 m/Tag Absenkung bei 415 km,
  geprüft); Schub wirkt nachweislich nach Δa = 2a²vΔv/μ (Test). Stationsmodus als Bitcode
  (16 = External Operations) und russischer Stationsmodus (eigene Reihenfolge 1..7) dekodiert.
  Energie-Panel zeigt den Zustand je Flügel aus der Spannung (Entladung / Laden / voll), weil NASA
  die Ströme nicht veröffentlicht. Erkennung eines bei NASA eingefrorenen Feeds ab dem ersten
  Schnappschuss. Streifen auf der Erdkugel im Fotomodus behoben (radiale Normalen).
- **v1.10:** Anordnung aller Elemente aus dem NASA-IGOAL-Modell; Canadarm2 mit echter
  Gliedgeometrie.
- **v1.0-v1.9:** Kalibrierung gegen Live-Daten, exakte Kollisionsprüfung (GJK), Vorhersage über
  Datenlücken, Widgets für jeden Kanal, Dashboard, Kanal-Browser, Crew, sechs Sprachen.
  Einzelheiten in [CHANGELOG.md](CHANGELOG.md).

Alle Einträge des geprüften öffentlichen Verzeichnisses sind abonniert und im Kanal-Browser
sichtbar. Das heißt nicht, dass NASA jeden Eintrag derzeit sendet, oder dass jeder physische
Mechanismus einen öffentlichen Kanal oder ein Simulationsmodell hat.

## Kanalverzeichnis

Referenz: [öffentliches Arbeitsblatt von ISS Mimic](https://github.com/ISS-Mimic/Mimic/blob/main/Telemetry/ISS_Public_Telemetry.xlsx).
Das heruntergeladene Arbeitsblatt enthält 337 befüllte Datenzeilen, aber nur **336 eindeutige
PUIs**: `CSAMT000001` steht zweimal darin. Keine eindeutige PUI des Arbeitsblatts fehlt in einem
der beiden Abo-Wege (Seite und Bridge). `TIME_000001` hat ein eigenes Abo mit Statusfeld. Zusätzlich
wird die vorhandene Arbeitsplatzkennung `CSAMT000002` abonniert, insgesamt also **337 verschiedene
Kanaldefinitionen**. Es wird kein Zugang zu unveröffentlichter NASA-Telemetrie vorausgesetzt. Ein
erfolgreiches Abo beweist nicht, dass Daten kommen.

`CHANNELS.csv` listet jede PUI mit Quellkategorie, Einheit, Beschreibung, Verwendung im 3D-Modell
und Abdeckung durch das virtuelle Modell. `tests/public_channels.json` hält Herkunft und Prüfsumme
des Arbeitsblatts fest, `tests/test_channel_audit.py` prüft die Abdeckung in Seite und Bridge.
Definitionen mit leerer oder unklarer Einheit oder einem Fragezeichen im Arbeitsblatt bleiben als
solche gekennzeichnet; ihre Bedeutung wurde nicht erfunden.

**Nicht veröffentlichte Kanäle.** Einige Kanäle liefert der öffentliche Feed immer mit Wert 0 und
Zeitstempel 0, insbesondere alle acht Flügelströme (S4000002/5, S6000002/5, P4000002/5,
P6000002/5). Das Dashboard zeigt sie als „nicht veröffentlicht“ (n/a), nicht als 0. Eine Leistung
(V × I) gibt es deshalb nur im Simulator und in der virtuellen Station; im Live-Betrieb zeigt das
Energie-Panel stattdessen den Zustand aus der Spannung (siehe [docs/TELEMETRIE.md](docs/TELEMETRIE.md)).

**136 Kanäle erhalten virtuelle Werte.** Andere Kanäle behalten im Kommandomodus ihren Wert vom
Zeitpunkt der Abspaltung mit der Kennzeichnung FROZEN REFERENCE oder zeigen UNMODELED, wenn es
keinen Wert gibt. Der Live-Strom kann eine Abspaltung im Kommandomodus nicht überschreiben.
Vorhergesagte Bahn, Live-Messungen, synthetische Vorführdaten und virtueller Zustand bleiben
unterscheidbar.

## Gelenke und Mechanismen

| Baugruppe | Genutzte öffentliche Kanäle | Umgesetzt | Verbleibende Grenzen |
|---|---|---|---|
| Solar-Alpha-Gelenke (SARJ) | S0000003-4; Modi 8-9 | Zwei SARJ-Drehungen, Sollwertregler, Autotrack-Vorhersage in Datenlücken | Kalibrierung gegen Autotrack-Daten vom 20.10.2026 |
| Solar-Beta-Gelenke (BGA) | Acht BGA-Positions-PUIs (siehe CHANNELS.csv) | Acht unabhängige Drehungen, Antriebe, Ziele, einfallsabhängige Erzeugung | Durchbiegung, Abschattung durch die Station und Ausfahren der Zellbahnen fehlen |
| Haupt-Radiatoren (TRRJ) | S0000001-2; Modi 6-7 | Zwei Seiten, je drei ORUs auf einem Balken, der um die X-Achse rollt; ±105° Software-Weg, eigene automatische Sonnenvermeidung | Vereinfachte Strategie, nicht NASAs vollständiger RGAC-/Frostschutz-Algorithmus; Vorzeichen Backbord aus einem Livebild, Prüfung im Autotrack läuft automatisch |
| Ausfahren der HRS-Radiatoren | kein Positionskanal im Arbeitsblatt | Szenario-Regler; jeder Radiator mit gekoppelten Faltplatten | Veranschaulichende Gelenke, Rate und Abstände; keine unabhängigen Achsen |
| Photovoltaik-Radiatoren | kein Positionskanal im Arbeitsblatt | Vier Ketten mit je sieben Platten, bewegen sich mit ihrer SARJ-Baugruppe | Kein eigenes Drehgelenk; PVTCS-Flüssigkeitskreise nicht simuliert |
| Canadarm2 | CSASSRMS004-010 | Sieben Gelenke nach IGOAL-Kinematik; jedes Ende als Anker; inverse Kinematik, geplantes Umsetzen mit Abstandsprüfung, Greifen und Lösen | Gelenkkonvention ist eine dokumentierte Annahme; keine Last-/Durchbiegungsdynamik |
| Verankerung des Arms | CSASSRMS002-003 | Vier MBS-Greifpunkte; Anker an LAB, Node 2, Node 3 und FGB; feste Anker unabhängig vom MT | POA-/SPDM-Basen nicht unterstützt: der Arm wird dann ausgeblendet statt auf einen geratenen Anker gesetzt |
| Mobile Transporter | CSAMT000001; ergänzend 000002 | Schienenfahrt trägt MBS und angebrachten Arm mit | Bereich ±21 m und gleichmäßig verteilte virtuelle Arbeitsplatz-IDs sind Modellkonventionen |
| Dextre | CSASPDM0002-0009, 0011-0017, 0020 | Zwei Arme mit je sieben Gelenken plus Körperrollen; steht auf dem gemeldeten Greifpunkt (oder hängt am freien LEE von Canadarm2) | Schematische Geometrie; Werkzeug-, Nutzlast- und Verriegelungskanäle bleiben Rohwerte |
| Ku-Antenne | Z1000014-15 | Elevation und Kreuzelevation, an Live-Ausrichtung angepasst | Gelenkweg und Schwenkgeschwindigkeit genähert |
| S-Band-Antennen | S1000004-5, P1000004-5 | Zwei Azimut-/Elevationspaare | Versätze, Weg und Raten genähert |
| Russische Flügel, Nauka-Radiator, Besuchsfahrzeuge | Ausgewählte RUSSEG-Status-PUIs (Portbelegung); Fahrzeug, Typ und Belegung der US-Ports aus Launch Library 2 (nicht Telemetrie) | Genäherte statische Geometrie; ein Modell je Fahrzeugtyp und Port | Für diese Mechanismen keine Winkelkanäle; Typ nur angenommen, wenn ein russischer Port belegt ist und LL2 nichts meldet |
| Weitere Robotik und Mechanismen | keine passenden Winkelkanäle | keine erfundene Telemetrie | ERA (nur verstaut gezeichnet), JEMRMS, Dextre-Werkzeuge, Verriegelungen, Andockdynamik, Luken in 3D, EVA-Ausrüstung und viele Experimentmechanismen fehlen |

Die Haupt-HRS-Radiatoren geben Wärme über beide Seiten ab. Bei Sonnenlicht stellt der einfache
Regler ihre breiten Seiten **kantig zur Sonne**; im Erdschatten richtet er eine Seite zur Erde.
Gegenüberliegende Normalen sind dafür thermisch gleichwertig. Ein um 180° gleichwertiges Ziel wird
innerhalb von ±105° gewählt; der Mechanismus schwenkt mit höchstens 0,75°/s und bewegt sich linear
durch seinen erlaubten Weg, statt durch einen Schlauchanschlag zu drehen. Während eines Schwenks,
vor allem beim Wechsel zwischen gleichwertigen Ausrichtungen, kann er Sonne abbekommen. Die
Normalen der ausgefahrenen Meshes werden in den Geometrietests gegen den Sonnenvektor geprüft.

## Was die virtuellen Bedienelemente tatsächlich nachbilden

- Vier einzeln schaltbare CMG-Antriebe und Regelkanäle, Fehler, allmähliches Auslaufen,
  Nennmoment und begrenzte Drehimpulsspeicherung (6600 U/min, 4760 N·m·s und 258 N·m je Kreisel).
  Umgesetzt als begrenzter Drehimpuls-Aktuator, **nicht** als echte Doppelkardan-Steuerung,
  Singularitätsvermeidung oder Dynamik einzelner Rotororientierungen.
- Zwölf idealisierte Lageregelungsdüsen und zwei idealisierte Haupttriebwerke am Heck von Swesda.
  Jede Einheit lässt sich freigeben, feuern und stören; Lagedüsen auch als zeitgesteuerte Pulse.
  Kraft, Moment über den Hebelarm, endlicher Treibstoff und Bahnwirkung sind gekoppelt. IDs und Lagen
  sind Konstrukte des Simulators, keine echten Ventilkennungen. Brennvorgänge schieben entlang
  Körper +X; mit der Station rückwärts ausgerichtet senkt ein Brennvorgang die Bahn.
- **Bahn (v1.11):** Zweikörperproblem + J2, RK4, plus Schub der virtuellen Station und
  Luftwiderstand (exponentielle Dichtebänder nach Vallado, Cd·A = 2,2 × 1500 m², Geschwindigkeit
  relativ zur mitrotierenden Atmosphäre, aktuelle Masse). Getestet: 1 m/s Anhebung erhöht die große
  Halbachse um 1775 m (Theorie 1775 m); ein Tag freier Flug senkt sie um ≈ 94 m. Sonnenaktivität,
  Lage-abhängige Querschnittsfläche und Mondeinfluss fehlen.
- Lage als Quaternion, Hauptträgheitsachsen, Kreiselkopplung und Gravitationsgradient. Die Dynamik
  relativ zu LVLH lässt vollständige Terme des rotierenden Bezugssystems, Durchbiegung, wandernde
  Schwerpunkte, Gelenk-Rückwirkungsmomente, aerodynamische Momente und Strahlauftreffen weg.
- Acht Flügel-/Batteriekanäle mit Sonneneinfall, Erdschatten, Verbrauch, endlicher Ladung und
  Wandlungsverlusten. Die Kanäle teilen sich einen Gesamtbus; echte Schalttopologie,
  iROSA-Verschaltung und Batteriehardware sind nicht nachgebildet. Kapazitäten und die meisten Lasten
  sind Lehrparameter.
- Zwei zusammengefasste Thermalkreise, Pumpen und Durchflussventile; die Wärmebilanz der Kabine hängt
  von Last, Kühlung, ausgefahrenen Radiatoren und Sonnenlicht ab. Keine detaillierten
  Strömungsvorgänge, Gefrierchemie, Leckorte oder Bauteil-Wärmenetze.
- Stoffwechsel der Crew, O₂-Erzeugung, CO₂-Entfernung, Wasser-/Sauerstoffvorräte und
  Abwasseraufbereitung; ein druckbasiertes Luftschleusen-Szenario mit Lukenverriegelung. Raten und
  Tankgrößen sind vereinfacht; das sind keine Lebenserhaltungsverfahren.
- Antriebssperren, Kommunikations-/Navigationsschalter, Fehlerszenarien, Nachschub, Pause,
  Zeitraffer und Sitzungsexport. Kommunikationsschalter ändern nur virtuelle Geräteflags; sie
  trennen nicht das Dashboard selbst.

Sollwertregler bleiben ratenbegrenzt. **Geführte Lageregler** sind voreingestellt und drehen die
Lage direkt, ohne Winkelraten aufzubauen; sie sind eine ausdrücklich kinematische Lernhilfe,
unabhängig vom virtuellen Bus, mit 0,1°/s für die gesamte Quaternion-Drehung. Gieren/Nicken/Rollen
geben absolute LVLH-Ziele in der Reihenfolge 3-2-1 vor, keine drei unabhängigen Ratenbefehle. Bei
±90° Nicken sind Gieren und Rollen entartet; die Anzeige der aktuellen Lage nutzt dann eine
gleichwertige Darstellung mit Rollen = 0, die Regler behalten das eingegebene Ziel. Eine
Zieländerung oder Lage-Voreinstellung bricht eingerasteten Schub ab und aktiviert die Lagehaltung,
die Antriebsfreigabe bleibt. Ein physikalischer Regelmodus, das Bedienen eines Kreisels oder ein
erfolgreicher Düsenschuss schaltet auf physikalische Dynamik. Ein aus dem geführten Modus manuell
gefeuerter Düsenschuss wählt freies Driften, damit seine Drehung sichtbar wird. Ein abgelehntes
Kommando ändert den Führungsmodus nicht.

Die physikalische Lageregelung nutzt eine mit dem Drehimpuls verträgliche Zielrate und verteilt
begrenztes CMG-Moment, bevor die verbleibende RCS-Unterstützung berechnet wird. RCS braucht
Treibstoff und Strom; absichtliches freies Driften und Geräteausfälle können die Kontrolle kosten.
Manöver nur mit CMGs ohne Freigabe der Düsen können simulierte Stunden dauern. **Damp rates** gibt
die virtuellen RCS frei, beendet manuelles Feuern und bremst mit den verfügbaren Aktuatoren.
**Reset motion (sim)** löscht Winkelraten und gespeicherten Drehimpuls ausdrücklich, ohne ein
physikalisches Manöver vorzutäuschen. Pause friert die simulierte Zeit ein. STOP ALL THRUST sperrt
den Antrieb, bricht Pulse und Brennvorgänge ab und löscht eingerastete Feuerbefehle; bereits
übertragener Drehimpuls bleibt.

## Kollisionswarnungen

Die Überwachung prüft sichtbare modellierte Körper und Platten: Orientierte Bounding-Boxen finden
Kandidaten, GJK auf den konvexen Hüllen der echten Meshes bestätigt sie, mit einer Hülle von 4 cm um
Platten ohne Dicke. Betroffene Teile werden rot markiert und mögliche Überlappungen protokolliert,
auch bei Live- und SIM-Posen (dort heißt eine Überlappung, dass die Abbildung Telemetrie → Modell
falsch ist). Benachbarte Glieder, Halterungen und absichtliche Gelenke sind ausgenommen. Geprüft wird
höchstens 4-mal pro Sekunde Echtzeit und nur bei geänderter Pose; schnelle oder beschleunigte
Bewegung kann zwischen zwei Proben „durchtunneln“. Es ist **keine** kontinuierliche
Kollisionserkennung, keine Kontaktreaktion, kein automatischer Bewegungsstopp und keine
flugtaugliche Abstandsanalyse. Weggelassene Geometrie kann Kollisionen verbergen. Die Bahnplanung
für das Umsetzen von Canadarm2 prüft alle ≤ 2° Gelenkweg.

## Erdbilder

NASA GIBS BlueMarble_ShadedRelief_Bathymetry, EPSG:4326, 500-m-Matrix. Fünfzehn grobe
Ersatzkacheln liegen bei (assets/earth/2); sichtbare Kacheln werden schrittweise bis Stufe 7
(nominell 500 m) geladen, mit Mipmaps, bilinearer Vergrößerung und anisotroper Filterung. Der Cache
ist auf 160 Kacheln begrenzt. Eine Eltern-Kachel wird erst ersetzt, wenn alle gültigen Kinder bereit
sind; Eltern und Kinder werden nie gemeinsam gezeichnet. Nach innen gezogene Schürzen schließen die
Fugen zwischen Detailstufen; seit v1.11 haben auch die Schürzen exakt radiale Normalen, wodurch die
hellen Linien und unterschiedlich getönten Kacheln im Fotomodus verschwunden sind. Die Bilder sind
ein **statisches Komposit**, kein aktuelles Wetter. Schlägt eine Detailanfrage fehl, bleibt die
gröbere Stufe oder die dunkle Ozean-Unterlage. Die Einblendung unten nennt Detailstufe und
Ladefehler.

**Earth radar** zeichnet Küstenlinien, Ländergrenzen und ein Gradnetz als 3D-Linien, unabhängig von
der Bildauflösung. **Earth photo** zeigt wieder die Bilder. **Earth labels** schaltet die
Ortsbeschriftungen in beiden Modi, mit Ausblendung hinter dem Horizont und ohne Überlappung.
Grenzen und Beschriftungspunkte stammen aus Natural Earth 1:50m (gemeinfrei, heruntergeladen am
9.10.2026). Das ist ein kartografischer Datensatz, kein aktueller geopolitischer Feed.

## Wichtigste Quellen

- [NASA ATCS Overview](https://www.nasa.gov/wp-content/uploads/2021/02/473486main_iss_atcs_overview.pdf): Radiatoranordnung, Maße der PV-Radiatoren, TRRJ-Grenzen und Ausrichtungsstrategie.
- [NASA: Operating an Outpost](https://www.nasa.gov/wp-content/uploads/2018/04/iss-operating_an_outpost-tagged.pdf): drei Radiatoren mit je acht Platten an jedem drehenden Balken; begrenzter Schlauchweg.
- [NASA CMG Operational History](https://ntrs.nasa.gov/citations/20100021932): Kenndaten der CMGs.
- [CSA Canadarm2](https://www.asc-csa.gc.ca/eng/iss/canadarm2/about.asp), [Mobile Base](https://www.asc-csa.gc.ca/eng/iss/mobile-base/) und [Dextre](https://www.asc-csa.gc.ca/eng/iss/dextre/about.asp): Mechanismen und Aufbau.
- [NASA ISS Reference Guide](https://www.nasa.gov/sites/default/files/atoms/files/np-2015-05-022-jsc-iss-guide-2015-update-111015-508c.pdf): Columbus Steuerbord / Kibo Backbord.
- [Natural Earth Countries](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries/): Vektorgrenzen und Beschriftungen.
- [NASA GIBS Dokumentation](https://nasa-gibs.github.io/gibs-api-docs/access-basics/): Bilddienst.
- Vallado, *Fundamentals of Astrodynamics and Applications*: exponentielles Atmosphärenmodell.

## Grenzen der Validierung

Automatische Prüfungen decken ab: öffentliches Kanalverzeichnis, Invarianten der Offline-Physik,
echte Three.js-Transformationen, beide Verankerungsrichtungen von Canadarm2, Mitbewegung mit dem
MT bzw. feste Anbringung, Normalen der ausgefahrenen Radiatoren und Solarflügel, Falten, bekannte
Kollisions-/Trennungsfälle, Ausnahmen für absichtliche Verbindungen, Kachelgrenzen, abgeschaltete
Antriebe, Regler, Pause, Quellen-Rückfall, Umgang mit veralteten Daten, Zeitbasis und Epochen,
eingefrorene Feeds, Bahnwirkung von Schub und Luftwiderstand, Dekodierung der Stationsmodi sowie
das Umsetzen von Canadarm2. Die Liste je Testdatei steht in [docs/TESTS.md](docs/TESTS.md).
Vollständiges WebGL-Rendering in einem echten Browser und der Start per Doppelklick unter Windows
werden nicht automatisch getestet; das bleiben manuelle Abnahmeprüfungen auf dem Zielrechner.

## Herkunft der Kanal-Metadaten

- Statustexte für Aufzählungskanäle (GPS-Status, CCAA- und UPA/WPA-Zustände, GNC- und
  Stationsmodi, Lage-/Ratenquellen) und Anzeigeeinheiten für Kanäle, die das NASA-Arbeitsblatt als
  CNT oder N/A führt, stammen von telemetry.space (github.com/sensedata/space-telemetry,
  MIT-Lizenz), geprüft am 20.10.2026, in `channel-meta.js`.
- Der US-Stationsmodus (USLAB000086) ist ein Bitcode: 1 Standard, 2 Microgravity, 4 Reboost,
  8 Proximity Ops, 16 External Ops (EVA/EVR), 32 Survival, 64 ASCR. Der russische Stationsmodus
  (RUSSEG000001) hat eine eigene Reihenfolge 1..7 (1 Crew Rescue … 7 Standard). Geprüft gegen
  telemetry.space und NASA ISS Mimic sowie live am 26.10.2026.
- Wertebereiche für Balken und Zeigerinstrumente sind Darstellungsentscheidungen (Nennbereiche),
  keine Grenzwerte.
- Crew, Expedition, Ereignisse, Starts und Andockereignisse: Launch Library 2 (TheSpaceDevs),
  keine Telemetrie.
