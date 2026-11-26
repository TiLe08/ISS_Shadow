# Änderungsprotokoll

Neueste Version oben. Datumsangaben beziehen sich auf 2026.

# v1.29: Darstellung „Realistisch“, realistischer Tag-Nacht-Übergang der Erde (25.11.)

- **Neue Darstellung *Realistic* (Realistisch)** neben Holo und Solid (Display → Station): texturierte
  PBR-Materialien je Bauteilart (Trümmerschutzbleche mit Fugen und Nieten, gesteppte Isolationsdecken,
  zerknitterte Goldfolie, gebürstetes Metall der Träger, Solarzellen mit Leiterbahnen), Spiegelung und
  diffuses Licht von Erde und Weltraum (Umgebungskarte nach Sonnenstand, neu nur bei ≈ 2° Änderung)
  und Schatten der Sonne auf der Station (2048², nur jedes dritte Bild neu gezeichnet).
- **Abgleich mit Fotos und Live-Bildern (CP3, CP8, CP13):** Die Aluminium-Schutzbleche der Module sind satiniert
  metallisch und spiegeln Erde und All, und an den Druckmodulen sitzen Reihen von EVA-Handläufen (gelblich,
  auf Stützen, ≈ 300 Stück, je Modul ein Zeichenaufruf, nur in Realistisch, nicht Teil der Kollisionsprüfung).
  Die NASA-3D-Modelle der ISS (3D Resources „ISS (A)“ 6 600 und „ISS (B)“ 174 000 Dreiecke) wurden geprüft:
  ohne Texturen, starr und ältere Konfiguration, also nicht besser als das eigene Modell (230 000 Dreiecke, beweglich).
- Geometrie, Gelenke, Nullpunkte und Kamerakalibrierung bleiben unverändert: Der Modus tauscht nur
  Materialien und Licht (`tests/test_realistic.mjs` prüft gleiche Geometrie und Sichtbarkeit wie Solid).
- Alle Texturen entstehen zur Laufzeit aus Rauschen und Rastern, es gibt keine heruntergeladenen
  Modelle oder Bilder (keine Lizenzfragen). Das NASA-3D-Modell der ISS wurde bewusst nicht verwendet:
  Es ist ein starres Gesamtnetz in älterer Konfiguration und ließe sich nicht mit SARJ, BGA, TRRJ und
  Arm bewegen. Kostet mehr Grafikleistung als Solid und wird erst bei der ersten Wahl aufgebaut.
- **Erde in Solid und Realistic:** Beleuchtung nach Sonnenhöhe (flacher Stand dunkler), weiche Dämmerung
  mit rötlichem Saum, dunkle Nachtseite mit Stadtlichtern (NASA VIIRS, zur Laufzeit geladen),
  Sonnenglanz auf dem Meer und ein dünner, an der Dämmerung rötlicher Atmosphärensaum. Holo bleibt wie bisher.

# v1.28: Dextre-Arme und Rumpfkameras nach NASA DOUG (25.11.)

- **Arme von Dextre falsch geknickt:** Dem Schulter-Nickgelenk beider Arme fehlte die feste Drehung aus DOUG
  (yaw 90°, roll −90°, `DEXTRE_CHAIN` in `iss-model.mjs`). Alles ab der Schulter stand dadurch verdreht, das
  Handgelenk bis zu 3 m neben der richtigen Stelle. Jetzt liegen beide Handgelenke in der Paketpose von DOUG auf
  1 mm genau (`tests/test_doug.mjs`). Die Telemetrie vom 24.11. meldet dieselben Gelenkwinkel wie das DOUG-Paket.
- **Schwebende Rumpfkameras:** Die beiden CLPAs von Dextre sitzen nach DOUG 1,02 m neben der Rumpfachse und
  hatten keinen Halter. Ein Halter vom Rumpf zu jeder Kamera ist ergänzt (Querschnitt geschätzt).

# v1.27.2: NASA-Bahn wieder da, Konsolenfenster friert Dienste nicht mehr ein (25.11.)

- **NASA-Bahn (OEM):** Das aktuelle NASA-Produkt vom 23.11. 18:47 UTC war am 25.11. abends älter als
  48 h und wurde deshalb abgelehnt („older than 48 hours“), obwohl es bis 08.12. gültig ist. NASA lässt
  manchmal mehr als zwei Tage zwischen zwei Produkten. Grenze jetzt 7 Tage; maßgeblich bleibt der
  Gültigkeitsbereich im Produkt.
- **Konsolenfenster:** Die Schnellbearbeitung (QuickEdit) der Windows-Konsole wird beim Start
  abgeschaltet. Ein Klick ins Fenster startete sonst eine Textauswahl, und jede Log-Ausgabe blockierte,
  bis Esc gedrückt wurde; dabei konnten Bridge (Telemetrie) und Bahndienst stehen bleiben.

# v1.27.1: Radar zeigt nur Objekte innerhalb der Kugel (25.11.)

- Objekte außerhalb des eingestellten Bildradius werden nicht mehr als Pfeil am Kugelrand mit Entfernung
  gezeichnet, sondern erscheinen erst, wenn man weit genug herauszoomt. Die Liste unter dem Radar nennt
  weiterhin die nächsten Objekte mit Abstand; „Auto“ wählt den Bildradius so, dass das nächste Objekt
  hineinpasst. Der blaue Erdbogen am Rand bleibt.

# v1.27: Ersatzquelle bei CelesTrak-Ausfall, Erde immer im Radar, Bahn auf Klick (25.11.)

- **CelesTrak-Ausfall abgefangen:** Am 25.11. antwortete die ganze Seite celestrak.org mit HTTP 503
  (Server nicht verfügbar, auch die Startseite), das Radar blieb leer. Nach 5xx- und Netzfehlern versucht
  `tle.py` es jetzt nach 15, 30 und 60 min erneut (CelesTrak erlaubt 2-3 Wiederholungen), erst dann alle
  2 h. Nach 403/404 bleibt es bei 2 h Pause.
- **Ersatzquelle SatNOGS:** Hat CelesTrak keine (oder über einen Tag alte) Daten, holt der Launcher
  höchstens alle 2 h die Bahnelemente der SatNOGS-Datenbank (db.satnogs.org, Quelle Space-Track, etwa
  1700 Objekte mit ISS und Nauka, aber ohne Dragon, Progress und Sojus). Ohne Launcher macht der Browser
  dasselbe. Die Quelle steht in der Zeile unter dem Radar („Bahnen: SatNOGS …“). Sechsstellige Nummern
  kommen dort im Alpha-5-Format, die Nummer wird aus dem Datensatz übernommen.
- **Erde immer sichtbar:** Liegt die Erdoberfläche weit außerhalb des Bildradius, zeigt ein blauer Bogen
  am Kugelrand in Nadirrichtung, wo die Erde ist und wie weit ihre Oberfläche entfernt ist („Erde 415 km“).
  Ohne Bahndaten wird eine Bahnhöhe von 415 km angenommen (vorher fehlte die Erde dann ganz).
- **Bahn auf Klick:** Ein Klick auf ein Objekt im Radar oder in der Liste darunter zeigt seine Bahn relativ
  zur ISS von −45 bis +45 min (SGP4, im LVLH-System der ISS zum jeweiligen Zeitpunkt, alle 30 s neu
  gerechnet) mit Zeitmarken alle 15 min; Vergangenheit gestrichelt. Bei modellierten An- und Abflügen ist
  es die Portachse bis zum Port. Erneuter Klick oder Klick ins Leere hebt die Auswahl auf.

# v1.26: CelesTrak repariert, Radar als drehbare Kugel mit Erde (25.11.)

- **CelesTrak im OMM/JSON-Format:** Launcher (`tle.py`) und Browser holen die Bahnelemente jetzt mit
  `FORMAT=json` statt im TLE-Textformat und rechnen sie mit `json2satrec` (satellite.js 6.0.1). Grund: Seit
  Mitte 2026 vergibt der Katalog sechsstellige Nummern (ab 100000), die das TLE-Format nicht darstellen kann.
  Neue Objekte fehlten deshalb im TLE-Abruf, gerade die Gruppe „last-30-days“ (Fahrzeuge im Anflug).
  Eine leere Gruppe („No GP data found“) gilt nicht mehr als Fehler.
- **Abrufregeln von CelesTrak eingehalten:** Nach einer HTTP-Fehlerantwort (403, 404, 5xx …) ruht der
  Dienst 2 h statt alle 15 min neu zu fragen (CelesTrak sperrt IPs, die Fehlerantworten ignorieren). Nach
  drei Netzfehlern in Folge ebenfalls 2 h Pause. Der Browser fragt CelesTrak nur noch direkt, wenn kein
  Launcher läuft (vorher zusätzlich, sobald der Launcher noch keine Daten hatte). Neuer Zwischenspeicher
  `cache/gp.json` bzw. `iss.gp` im Browser; der alte `cache/tle.json` wird nicht mehr gelesen.
- **Radar als Kugel:** Ziehen dreht die Ansicht frei in Azimut und Blickhöhe (auch von unten), das Mausrad
  zoomt stufenlos (200 m bis 40 000 km), Doppelklick setzt die Ansicht zurück. Umriss und zwei senkrechte
  Großkreise zeigen die Kugel, Rückseiten sind gestrichelt. Neue Stufe 20 000 km.
- **Erde im Radar:** Sobald die Erdoberfläche in die Nähe des Bildradius rückt (ab etwa 300 km), erscheint die
  Erde in Nadirrichtung mit Rand, Äquator und Nordpol (aus der Bahn der ISS berechnet). Objekte hinter der
  Erde werden schwach gezeichnet.
- Tests: `tests/test_tle.py` (JSON, sechsstellige Nummern, Pause nach HTTP 403, Netzfehler),
  `tests/test_proxops.mjs` (OMM-Auswertung, Erde, Zoom).

# v1.25: UHF-Antenne an das CP13-Livebild angepasst (25.11.)

- Der Antennenkopf sitzt 0,45 m vom DOUG-Gelenk entlang dessen Z-Achse (0,09 m in X versetzt), nicht im
  Gelenk selbst. Damit liegen die Radome im CP13-Bild dort, wo sie im Livebild sind (vorher rund 5° zu tief).
- Radome schlanker und abgerundet (0,8 m lang, Ø 0,2 m, Abstand 1,3 m), Querträger 1,6 m statt 2,3 m.
  Alle Kopfmaße sind am Livebild vom 25.11. geschätzt, DOUG enthält nur Mast und Gelenk.

# v1.24: UHF-Antennen und POA nach NASA DOUG (25.11.)

- **UHF-Antennen ergänzt:** Destiny (nadirseitig Steuerbord, 45°) und P1 (Zenitseite) tragen jetzt die
  UHF-Antennen für den Sprechfunk bei Außeneinsätzen. Fußpunkt, Mast und Gelenk stammen aus NASA DOUG.
  Querträger und Radome sind aus dem CP13-Livebild vom 25.11. geschätzt (Querträger 2,3 m, Radome 0,85 m).
  Die Destiny-Antenne ist das T-förmige Teil unten im Bild von CP13.
- **POA an die richtige Stelle:** Das LEE des MBS sitzt nach DOUG an der Vorderseite des MBS und greift nach
  Backbord (−Y, 10° gegiert), nicht auf der Zenitseite. Die Platzhalter-Nutzlast hängt jetzt an dessen Spitze.
- Änderungsprotokoll: Der Eintrag zum Konsolenfenster heißt wieder v1.22.1.

# v1.23.1: Countdown bis Sonnenaufgang/-untergang (25.11.)

- **Countdown „Sunrise in 12:34“ / „Sunset in 45:10“** als Pille in der 3D-Ansicht, als Zeile im
  Orbit-Panel (*Next sunrise/Next sunset*, T−mm:ss) und in der Kopfzeile der Zwillingsansicht im
  Kamerafenster. Gerechnet wird der Austritt aus bzw. Eintritt in den Erdschatten **an der Station**
  (Bahnhöhe), nicht das Überfliegen des Terminators am Boden: `nextSunEvent()` propagiert die Bahn in
  20-s-Schritten mit demselben Schattenzylinder wie `inShadow()` und grenzt den Übergang auf 0,5 s ein;
  neu gerechnet nach jedem Ereignis, jede Minute und nach Bahnsprüngen. Genauigkeit etwa ±10 s
  (Halbschatten und Atmosphäre nicht modelliert). Hoher Beta-Winkel ohne Schatten: „Continuous sunlight“.
  Im Kommandomodus mit erzwungener Beleuchtung ausgeblendet. Übersetzungen in allen sechs Sprachen.
- Neuer Test `tests/test_sun_event.mjs` (Ereignis auf 1 s am Umschlag, Phasenlängen, Beta 90°, Zwischenspeicher).

# v1.23: Nullpunkt der Solarflügel (BGA) nach NASA (25.11.)

- **BGA wie SSP 30219 und NASA DOUG:** Offset Steuerbord −90 statt −135, Backbord +90 statt +45 (`CAL` in
  `iss_twin.html`). Zwei Livebilder von CP13 (24.11. und 25.11.2026) zeigen den Flügel S4 nur so deckungsgleich;
  am 25.11. passten Kamera und Sichtfeld über den ganzen Flügel, nachdem Tim ihn von Hand um 45° gedreht hatte.
- Die alte Tabelle war am 20.10. unter der Annahme bestimmt, die Flügel zeigten genau zur Sonne. Nach der Norm
  standen sie damals alle rund 45° neben der Sonne (2B rund 41°). `tests/test_regression.mjs` prüft jetzt diesen
  Versatz, `tests/test_ssp30219.mjs` die genaue Übereinstimmung mit der Norm.
- **Vorhersage in Datenlücken:** Die Seite merkt sich bei frischen Daten, wie weit jeder Flügel neben dem
  Sonnenoptimum steht (`PRED.bias`), und hält diesen Abstand, statt auf das Optimum zu springen.
- Ein im Kalibrierfeld von Hand gesetzter BGA-Zusatzoffset von +45° ist damit doppelt: auf 0 zurückstellen.

# v1.22.1: Sichtbares Konsolenfenster als Ausschalter (25.11.)

- `Start ISS Shadow.bat` startet den Launcher mit `python` statt `pythonw` in einem eigenen Konsolenfenster
  „ISS Digital Shadow“, das offen bleibt, solange das Programm läuft.
- Fenster schließen oder Strg+C beendet Broker, Bridge, Dienste und Webserver sofort und geordnet
  (`SetConsoleCtrlHandler` für das Schließen, zweites Strg+C beendet hart). Danach `os._exit`, damit kein
  Bibliotheks-Thread den Prozess am Leben hält.
- Hauptschleife prüft jede Sekunde statt alle 5 s. Leerlauf-Abschaltung nach 4 min bleibt als Rückfall.

# v1.22: Entwicklermodus (25.11.)

- **Entwicklermodus** (neues Modul `dev-panel.mjs`): Schalter „Dev mode“ in Setup (`localStorage iss.dev`),
  dann Knopf **Dev** neben Setup und „?“. Das Fenster (verschiebbar, nur englisch, keine Übersetzungen)
  löst Ereignisse von Hand aus, um Animationen zu prüfen; reine Anzeige, Meldungen mit „[DEV]“:
  - **Vehicles:** Anflug an einen freien Port mit wählbarem Typ, sofort hinsetzen, Abflug, sofort entfernen,
    zurück zu den Daten. Zeitraffer 1× bis 300×. Cygnus/HTV-X verkürzt: Anflug, Halt am Einfangpunkt,
    geradlinig an den CBM (Arm unbewegt, vereinfacht).
  - **Spacewalk:** Crewlock auspumpen und wieder befüllen, Stationsmodus External ops, Eintrag wie aus LL2.
  - **Moving parts:** gesetzte Telemetriewerte (`DEV.tm`, gelesen über `tv()`) für SARJ, BGA, TRRJ, MT,
    Canadarm2 mit Spitzen-LEE, Dextre und Ku-Antenne; laufen mit der Gelenkrate zum Ziel. Solange einer
    gesetzt ist, ruhen Posenvorhersage, `learnTracking` und `checkTrrjSense` (sonst würde die Kalibrierung
    aus erfundenen Werten lernen). Knopf zum Zurücksetzen der gespeicherten Nutzlastlagen (`iss.payloads`,
    offener Punkt 5 der Übergabe).
  - Ausschalten verwirft alle Eingriffe.
- **Quest-EV-Luke** schwenkt jetzt in 8 s auf und zu (Schätzung) statt zu springen.
- Neuer Test `tests/test_dev.mjs`.

# v1.21: Kameras nach NASA DOUG, LEE-Kamera am LEE (24.11.)

- **Alle schwenkbaren Kameras mit der DOUG-Kette** (`DOUG_RIGS` in `cameras.mjs`, erzeugt mit dem neuen
  `tools/doug_cameras.mjs`): CP3, CP8, CP9, CP13, beide Auslegerkameras, MBS-Kamera und jetzt beide
  Rumpfkameras von Dextre. Schwenk und Neigung sind die echten Gelenkwinkel (0/0 = NASA-Nullstellung), das
  Auge wandert mit. Trägerrohre und Köpfe in DOUG-Maßen (Rohr 1,3 m, Neigeachse 0,65 m über dem
  Schwenkgehäuse, SD-Kamera 0,18 m und HD-Kamera 0,38 m seitlich, Leuchte gegenüber). Gespeicherte Schwenk-,
  Neige- und Rollwerte dieser Kameras werden einmalig zurückgesetzt. CP13 zum Livebild vom 24.11. (09:04 UTC,
  LEE zeigt auf die Kamera): Schwenk −8,5°, Neigung −29,5°, Rollen 4,5°.
- **Lagefehler behoben:** Die Auslegerkameras saßen 0,9 m statt 2,65 m vom Ellbogen und auf der falschen
  Seite des Auslegers, die MBS-Kamera 1,6 m hinter und 2 m neben ihrer DOUG-Lage. CP13 stand bei der
  Ansicht vom 24.11. 0,35 m zu weit hinten (fester Augpunkt statt Kette).
- **LEE-Kameras** sitzen seitlich am LEE hinter der Stirnfläche (DOUG CLA), nicht mehr frei vor dem Greifer,
  und haben ein Gehäuse mit Objektiv und Leuchtenfenster wie auf dem Livebild.
- `pruefwerkzeuge/camshot.mjs`: Zwillingsansicht einer Kamera ohne Python aufnehmen (Node, Playwright),
  mit Telemetrie aus einer JSON-Datei, Uhrzeit und einem Prüfausdruck.
- **Offen, nicht geändert (Solarflügel):** Auf dem Livebild von CP13 vom 24.11. zeigt der Flügel rechts
  vom Arm (S4, 1A/3A) seine orange Rückseite fast von vorn; der Zwilling zeigt ihn um etwa 60° schräg. Mit
  BGA + 45° (so wie SSP 30219 und DOUG) passt das Bild. Die Sonnenprüfung vom 20.10. (`test_regression.mjs`,
  Autotrack auf 0,09-0,5° genau) spricht dagegen. `CAL` bleibt deshalb, bis ein zweites Livebild mit
  Flügel und bekannter Sonnenlage die Frage entscheidet.

# v1.20: An- und Abflug wie in echt, Nahbereichsradar (24.11.)

- **An- und Abflug** (`proxops.mjs`): Ein Fahrzeug verschwindet beim Abdocken nicht mehr und taucht beim
  Andocken nicht mehr auf, es fliegt den Ablauf seiner Baureihe entlang der Portachse:
  - Dragon/Starliner: Anflug über Wegpunkt 1 (220 m) und Wegpunkt 2 (20 m) mit Halten, Endanflug, weiches
    und festes Ankoppeln. Abflug: Zurücksetzen, Abflugzündungen, Austritt aus der 200-m-Sicherheitskugel,
    die **Nasenkappe schließt** (Drehung um ein Scharnier), danach wird das Fahrzeug ausgeblendet (18 min).
  - Sojus/Progress: Umfliegen, Halten in etwa 180 m, Endanflug; Abflug mit Federn, Trennzündung nach 3 min.
    Läuft Kurs, ersetzt der gemeldete Abstand (RUSSEG000005) den geschätzten.
  - Cygnus/HTV-X werden **angelegt, nicht angedockt**: R-Bar-Anflug von unten bis zum Einfangpunkt 10 m
    unter dem CBM, dort halten sie, bis Canadarm2 sie greift (CSASSRMS011 = CAPTURED); sie fliegen nie
    selbst in den Port. Dann folgen sie dem Arm; lässt der Arm sie am CBM los, gelten sie sofort als
    angelegt (auch bevor LL2 das Ereignis führt). Lässt er sie abseits los, ist das die Freigabe: Abflug
    ab genau dieser Stelle, nach unten, dann ausgeblendet. Ohne Armtelemetrie warten sie am Einfangpunkt,
    bis die Daten sie als angelegt führen.
  - Zeitpunkte: abfallendes russisches Portflag (echte Zeit), LL2-Abdockzeit und, neu, der LL2-Ereignisplan
    (minutengenaue Docking-/Undocking-Ereignisse, Abgleich über die Missionskennung, Port aus dem Text).
    Nach einer geplanten Ankunft gilt das Fahrzeug bis zu 12 h als angedockt, bis LL2 das Ereignis führt.
  - Wegpunkte und Zeiten sind Richtwerte aus Missionsabläufen (Schätzung, je Flug verschieden).
  - Im Docking-Panel spielen **▶ Undock** und **▶ Dock** den Ablauf 30-fach beschleunigt als Vorschau ab
    (nur Anzeige, kein Protokoll, z. B. für die Vorführung). `globalThis.ISS_PROX.activities()` liefert die
    laufenden Abläufe für andere Teile der Seite.
- **Nahbereichsradar** (neues Panel, experimentell, `radar.mjs`, `tle.py`): Objekte um die ISS im LVLH-System
  (Ebene V-Bar/H-Bar, oben Zenit, ziehen zum Drehen), Reichweite automatisch oder 1 km bis 5000 km. Quellen:
  CelesTrak-Bahnelemente (Gruppen stations und last-30-days, SGP4 mit satellite.js 6.0.1 vom CDN, auf
  etwa 1 km genau), Kurs-Abstand als Ring, modellierte An- und Abflüge (orange). Angedockte Fahrzeuge werden
  über den Namen oder über Abstand < 2 km bei < 1 m/s erkannt, Elementsätze älter als 3 Tage ausgeblendet.
  Gerechnet wird nur bei offenem Panel, einmal pro Sekunde.
- Neue Tests `tests/test_proxops.mjs`, `tests/test_tle.py`.

# Kamerafenster: größeres Sichtfeld, feinere Regler (18.11.)

- **Sichtfeld** lässt sich jetzt für jede Kamera von 0,5° bis 150° (senkrecht) einstellen, auch über den
  Zoombereich der Optik hinaus und auch bei der Sen-Nadirkamera. Der Regler läuft logarithmisch, damit lange
  Brennweiten genauso fein gehen wie kurze. Der Zoombereich der Optik steht im Hinweis; ein Wert außerhalb
  wird orange angezeigt.
- **Schwenk, Neigung, Rollen, Sichtfeld** haben je ein Zahlenfeld (Eingabe auf 0,01° genau). Pfeiltasten und
  Mausrad auf Regler oder Zahlenfeld: 0,1°, mit Umschalt 1°, mit Alt 0,01°. Schwenk und Rollen laufen über
  ±180° herum.


# v1.19: Laufende Aktivitäten, Quest-Luke nach innen (18.11.)

- Neues Panel **Current activities** (rechte Leiste und Standard-Dashboard, `activities.js`): zeigt, was gerade
  an der Station passiert.
  - **EVA:** laufender oder gerade beendeter Außenbordeinsatz mit EV-Crew und Dauer aus dem neuen LL2-Feed
    `/spacewalks/` (Ende leer = läuft), geplante EVAs der nächsten 48 h, Crewlock-Druck (drucklos = Luke offen,
    Druckabfall / Wiederbefüllung), Stationsmodus „External ops“, RS-Modus EVA.
  - **Robotik:** Canadarm2, Dextre und Mobile Transporter, wenn sich ihre Gelenke bzw. die Position in den
    letzten 2 min bewegt haben (Schwellen geschätzt), mit Basis und gegriffener Nutzlast.
  - **Verkehr:** Ankunft und Abflug in den nächsten 72 h, An- und Abdocken der letzten 6 h (LL2), gestartete
    Fahrzeuge auf dem Weg, Kurs-Anflug (nur bei eingeschaltetem Kurs), Stationsmodus „Prox ops“.
  - **Solarflügel/Radiatoren:** SARJ oder TRRJ nicht im Autotrack (hält / dreht), BGA drehen, sonst
    „folgt der Sonne“ mit Drehrate. **Lage:** Lagemanöver, Bahnanhebung, freier Flug.
  - Wo die Astronauten draußen sind, veröffentlicht keine Quelle (NASA, LL2, ISSLive); das Panel sagt das.
- `vehicles.py` ruft dafür `/spacewalks/` alle 30 min ab (LL2-Budget jetzt etwa 5,5 von 15 Anfragen/h).
- **Quest-EV-Luke:** Die druckdichte Luke öffnet wie in echt nach innen in die Crewlock; neu ist die nach außen
  aufklappende Thermalabdeckung. Bisher klappte die Luke selbst nach außen.
- Neuer Test `tests/test_activities.mjs`, Übersetzungen in `tools/strings-activities.tsv`.
# v1.18.4: freischwebende Teile angebunden, Dragon C211 gedreht (18.11.)

- Suche nach Teilen ohne Verbindung zur Station (Oberflächenpunkte im Abstand von 0,12 m): Vorher
  14 lose Gruppen, jetzt keine mehr.
  - **Beta-Gelenke (BGA):** neues Gehäuse von der IEA bis zum Mastbehälter. Die Mastbehälter von 1A und 2A
    samt Flügel und iROSA hingen bis zu 1,25 m frei neben der IEA.
  - **Stauboxen** der Solarflügel reichen innen bis an den Mastbehälter und außen bis an die Zellbahn.
  - **S-Band-Masten (SASA)** reichen bis zur Zenitfläche von S1/P1; der Steuerbordmast endete in der Luft.
  - **Dextre:** Stütze unter dem oberen Greifpunkt (der Greifpunkt schwebte 0,35 m über dem Rumpf).
  - **JEM-Roboterarm** gefaltet auf der Zenitseite von Kibo geparkt statt frei über der Exposed Facility
    (Parkstellung genähert, keine Telemetrie).
- Dragon an Harmony zenit (C211) weitere 90° gegen den Uhrzeigersinn (von Zenit gesehen) gedreht:
  Die geöffnete Nasenkappe zeigt nach achtern.

# v1.18.3: Dragon an Harmony zenit gedreht, Kameramarkierungen aus (18.11.)

- Fahrzeuge an Harmony zenit (IDA-3) sind um 90° um die Andockachse gedreht (`clock` in `PORTS`): Die
  geöffnete Nasenkappe des Dragon zeigt jetzt nach Backbord zu CP8, wie im Livebild vom 18.11.2026.
- Kameramarkierungen in der Hauptansicht sind beim ersten Start aus (Schalter „Cameras“ unter Display);
  eine gespeicherte Wahl bleibt erhalten.

# v1.18.2: Rollregler im Kamerafenster (18.11.)

- Neben Schwenk und Neigung gibt es einen Regler **Rollen** (−180° bis +180°): dreht das Zwillingsbild um
  die Blickachse, damit es sich mit dem Livebild deckt. Er gilt für alle Kameras, auch feste, wird je
  Kamera gespeichert und ist derselbe Wert wie „roll“ im Kalibrierfeld; „Reset camera“ setzt ihn zurück.

# v1.18.1: Dextre am Canadarm2, Überlappungsmonitor, Kameramasten (18.11.)

- **Dextre hing quer durch das LEE**, wenn Canadarm2 es trägt (Basis 19): Der obere Greifpunkt von Dextre
  hatte vertauschte Achsen. Jetzt hängt Dextre koaxial unter dem LEE (neuer Test mit der Pose vom 18.11.).
- **Überlappungsmonitor:** Er merkte sich die Kollisionsgruppe jedes Teils beim ersten Prüfen. Nach dem
  Umhängen von Dextre ans Armende galten veraltete Gruppen (falsche oder übersehene Meldungen). Dextre hat
  jetzt eine eigene Gruppe.
- Kameramasten von CP3, CP8, CP9 und CP13 reichen bis zur Modellhülle; CP13 schwebte frei vor Destiny.
- Die eigene, frei platzierbare Kamera entfällt.

# v1.18: Nullstellungen aus NASA DOUG und SSP 30219 (17.11.)

- **NASA DOUG** (Robotik-Grafikwerkzeug der Besatzung, öffentliches Flugpaket Stage 75-7 vom 16.9.2026)
  enthält die vollständigen Kinematikketten und die Abbildung Telemetrie -> Gelenk. Übernommen:
  - MBS-Greifpunkte PDGF1-4 mit ihren schrägen Einbaurahmen (`MBS_AXES`). Die acht Rollkandidaten und das
    Lernen aus Kollisionen der Live-Posen entfallen; gespeicherte Lernstände (`iss.cal.mss*`) werden gelöscht.
  - Canadarm2: DOUG-Abbildung SR, −SY, −SP, −EP, −WP, −WY, +WR, alle 0 = gestreckter Arm, im Modell
    `SSRMS_CONVS.doug` (Spitze auf 3 mm, Spitzenrahmen exakt; `tests/test_doug.mjs`). Bei LEE A als Basis
    heißen die Gelenke immer vom Basisende aus.
  - MT-Arbeitsplätze WS1-8 (ISSLive bestätigt WS4 und WS5 auf den Zentimeter), Lage der S-Band-Antennen
    und Azimut-Nullpunkt +45°, Augpunkte der Kameras CP3, CP8, CP9 und CP13.
  - Dextre: Körper und beide Arme mit DOUGs Kette (SPDM.str) neu aufgebaut, Gelenke ohne Vorzeichenwechsel
    (`setDougJoint`). Beleg: Die ISSLive-Winkel beider Arme vom 19.10. sind genau DOUGs Parkstellung. Ohne
    Basis-Telemetrie steht Dextre auf MBS PDGF2; am Canadarm2 hängt es an seinem oberen Greifpunkt.
  - Bestätigt ohne Änderung: SARJ, TRRJ, Ku-Band. BGA: DOUG liegt wie SSP 30219 45° neben ISSLive, `CAL` bleibt.
- **Offen:** Das Livebild CP8 vom 10.11. (Kamera an Dragon und S-Band-Schüssel eingepasst) passt besser
  zur v1.17-Armkonvention als zu DOUG. Das Kalibrierfeld kann deshalb zwischen „NASA DOUG“ (Standard)
  und „v1.17“ umschalten; v1.17 nutzt dabei die alten, nur gerollten MBS-Rahmen. Bisher gespeicherte
  Canadarm2-Korrekturen und MBS-Rollwinkel im Kalibrierfeld werden einmalig zurückgesetzt.

- **SSP 30219 Rev. K** (ISS-Bezugssysteme, NASA, 1.2.2019, Bild 4.0-8) legt Nullpunkt und Drehsinn von
  SARJ (alpha), BGA (beta) und TRRJ (gamma) fest. SARJ und TRRJ im Modell stimmen damit genau überein
  (alpha_port = -alpha_stbd, alpha = 0: Zellseite nach Zenit; gamma = 0: Radiatoren in der X-Y-Ebene).
  Die BGA-Formeln der Norm liegen 45° neben den ISSLive-Kanälen; die Livedaten vom 20.10. (alle acht Flügel
  genau zur Sonne, Skalarprodukt 1,000 statt 0,71 mit der Norm) bestätigen die bisherige Tabelle `CAL`.
  Neuer Test `tests/test_ssp30219.mjs`. Für Canadarm2, Dextre und die Antennen enthält die Norm nur
  Bezugssysteme, keine Gelenkwinkel.

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
