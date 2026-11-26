# Übergabe: ISS Shadow (Stand v1.16, 11.11.2026)

Diese Datei zusammen mit `ISS-Shadow_v1.16.zip` in einen neuen Chat geben. Sie enthält alles, was zum
Weiterarbeiten nötig ist: Ziel, Regeln, Architektur, Konventionen, Belege, offene Punkte.

## 1. Wer und wie

- Nutzer: Tim, Ingenieur für Energietechnik in Ulm, Masterstudium an der THU. Gruppenprojekt.
- Stil: knapp, keine Emojis. „Weiter“ heißt weitermachen.
- Bei jeder Überarbeitung die Version hochzählen, auch in Dateinamen und Titel (nächste: v1.17).
- Keine Gedankenstriche und keine typischen KI-Formulierungen in Code, Oberfläche, Übersetzungen und
  Dokumentation. Für das Minuszeichen in Formeln „−“ verwenden, als Platzhalter „-“.
- Dokumentation und Code-Kommentare auf Deutsch. Jede Datei beginnt mit einer Zweckbeschreibung.
  Die Oberfläche ist englisch mit Übersetzungen in sechs Sprachen.
- Nichts erfinden: Näherungen und Schätzungen im Code und in der Doku als solche kennzeichnen.
- Browser-Werkzeuge nur nach Rückfrage verwenden (für die Streamprüfung am 11.11. erlaubt). Die Shell
  erreicht weder push.lightstreamer.com noch YouTube. Live-Werte und Livebilder liefert Tim per Bildschirmfoto.

## 2. Aufgabe (Kurs „Technologies and Trends in Digitalization and Connectivity“, Prof. Völker, WiSe 2026/27)

Aufgabenblatt: `referenz/Aufgabenblatt_CaseStudy_DigitalTwin.pdf`.

- Pflicht: digitaler Schatten mit automatischer Aktualisierung über einen Standard (MQTT oder OPC UA)
  und Zustandsüberwachung in Echtzeit (mindestens alphanumerisch).
- Optional: digitaler Zwilling mit Steuerung, 2D/3D, Simulation/Vorhersage, Protokollierung.
- Lieferumfang: der Zwilling, eine technische Dokumentation, eine Vorführung und ein Poster.
- Meilensteine laut Blatt: 21.10. Team, 04.11. technisches Konzept (erledigt), 25.11. erstes Review,
  23.12. zweites Review, 13.01. Doku, 20.01. Demo und Poster. Bei 5 und 6 steht im Blatt das Jahr 2026,
  gemeint ist vermutlich 2027. Das noch mit dem Professor klären.
- Teamnamen sind überall Platzhalter: „(Namen der Gruppenmitglieder eintragen)“ in den Markdown-Dateien,
  „Namen eintragen“ im Poster.

Tims Anspruch: Alles, was sich an der Station bewegt, soll sich im Modell genauso bewegen, auch Dinge,
die mit Roboterarmen umgesetzt werden. Das Modell soll in Maßen, Winkeln und Farben zur echten Station
passen. Livekameras sitzen im Modell, damit Zwilling und Livebild nebeneinander verglichen werden können.

## 3. Architektur in einem Absatz

NASA ISSLive (Lightstreamer, Adapter ISSLIVE, 337 Kanäle) geht an `bridge.py`. Die Bridge korrigiert
die Zeitstempel und veröffentlicht über MQTT (eingebetteter amqtt-Broker, 1883 TCP, 9001 WebSocket) an
`iss/tm/<PUI>` (retained), dazu `iss/link`, `iss/bridge`, `iss/orbit`, `iss/cmd/<Ziel>`, `iss/ack/<id>`
und `iss/virtual/state`. `launcher.py` startet Broker, Bridge, `ephemeris.py` (NASA-OEM), `vehicles.py`
(Launch Library 2), `streams.py` (laufende YouTube-Streams, neu) und einen Webserver auf Port 8137.
Die Oberfläche `iss_twin.html` kommt ohne Build-Schritt aus; sie nutzt three.js und MQTT.js vom CDN und
die Module im Projektordner. Das 3D-Modell steht seit v1.15 in `iss-model.mjs`, die Kameras in
`cameras.mjs`, Radiatorziel und Kollisionsprüfung in `model-checks.mjs`.

Ausführlich: `docs/ARCHITEKTUR.md`, `docs/KAMERAS.md`, `GEOMETRY.md`, `Dokumentation/Technische_Dokumentation.pdf`.

## 4. Was v1.15 und v1.16 geändert haben (11.11.2026)

Vollständig in `CHANGELOG.md`.

**v1.16 (Livestreams).** Am 11.11. in Tims Chrome geprüft, alle live und einbettbar:

| Stream | Kennung | Inhalt |
|---|---|---|
| NASA „Live Video from the International Space Station“ | `M3HKLzjvKPc` | Stationsbild 4:3, wechselnde Außenkameras (CP-Ports), Innenansichten |
| NASA „Live High-Definition Views from the International Space Station“ | `ROboUHfPUrU` | feste HD-Kamera an Harmony, IDA-2 im Bild |
| Sen „Live 4K video of Earth and space“ | `fO9e9jnhYK8` | SpaceTV-1 an Columbus/Bartolomeo |

- Die Erkennungsregeln von `streams.py` finden auf den echten Seiten genau diese drei.
- Sen kommt jetzt zuerst über `api.sen.com/content/public/live` (JSON, Feld `youtubeId`), sonst über YouTube.
- `cameras.mjs` führt die drei als `KNOWN_STREAMS` (mit Prüfdatum) und beide Kanalkennungen
  (NASA `UCLA_DiR1FfKNvjuUpBHmylQ`, Sen `UCkvW_7kp9LJrztmgA4q4bJQ`).
- Außerhalb von YouTube gibt es keine nutzbare Quelle: nasa.gov/live verweist auf eine YouTube-Playlist,
  NASA+ hat keinen Stationsstream, sen.com bettet YouTube ein, ITVX nur in Großbritannien.

**v1.15.** Das Wichtigste:

1. **Radiatoren (TRRJ) drehen um die Körper-X-Achse.** Bis v1.14 klappten sie um die Trägerachse Y
   auf und ab; die dort als „verifiziert“ notierte Achse war falsch. Jetzt rollt die Fläche aus drei
   ORUs (22 m × 10,9 m) um ihre Mittelachse. Modellwinkel = Rechtsdrehung um +X, 0° = Platten flach,
   Normale `(0, −sin a, cos a)`, Weg ±105°.
   - Achse: NASA TM-110318 (Drehung um +X), Regelstrategie „Kante zur Sonne, Fläche zur Erde“.
   - Vorzeichen Steuerbord +r: NASA-Abstandsmessung an CTC-2 auf ELC-4 (engste Annäherung bei γ = +35°).
   - Vorzeichen Backbord +r: baugleiche Gelenke und das Livebild CP8 vom 10.11. Dieser Beleg ist
     schwächer als der für Steuerbord.
   - `checkTrrjSense()` prüft beide Vorzeichen, sobald ein TRRJ bei Sonnenlicht im AUTOTRACK läuft
     (kantig zur Sonne), und korrigiert die Tabelle bei Widerspruch (`localStorage iss.cal.trrj`,
     Meldung im Ereignisprotokoll).
   - Die Sperrzone Bishop (+40°) aus v1.14 ist entfallen: Beide Radiatoren sind über ±105° frei
     (kleinster Abstand P1-Radiator/Bishop 0,4 m bei +46°).
2. **3D-Modell neu aufgebaut** (`iss-model.mjs`, 531 Bauteile mit Fahrzeugen). Druckmodule als
   Rotationskörper, Träger als Prismen und Stabgitter, Farben nach Fotos, Zellraster als Textur.
   Ergänzt unter anderem: zweite SGANT, Kühlgeräte an S1/P1, ESP-1, Columbus-Nutzlasten, JEMRMS,
   Cupola-Fenster, Nauka-Schleuse, Details an Dragon und AMS-02. Lage und Hauptmaße weiter nach IGOAL.
3. **Flimmern (Z-Fighting) beseitigt.** Ursache waren Rasterlinien genau auf den Flächen. In Solid gibt
   es keine Linien auf Flächen mehr. `tests/test_zfight.mjs` sucht deckungsgleiche Flächen.
4. **Transporter:** Arbeitsplatz-Nummer aus der Tabelle `MT_WORKSITES` statt aus einer Formel.
5. **Kameras** (`cameras.mjs`, `docs/KAMERAS.md`): Sichtfelder nach NASA (SD 77° × 61° bis 10° × 8°,
   HD 36° bis 3,4° horizontal, MSS 52° × 40° bis 6° × 4°), Bildformat je Optik, Kamerakopf wählbar,
   Kameragruppen als Modell, Sichtkegel in der Hauptansicht. Geradlinige Objektive, keine Fischaugen;
   Verzeichnung nicht nachgebildet.
6. **Streams:** keine feste Video-Kennung mehr. `streams.py` liest die laufenden Streams von
   `@NASA/streams` und `@sen/streams` (`/__streams`); sonst Kanal-Einbettung oder eigener Link. Bei
   gesperrtem Video Hinweis und nächster Stream.
7. **Aufräumen:** `iss_twin.html` von 4376 auf 3758 Zeilen, toter Code entfernt, Tests auf ein
   gemeinsames Gerüst (`tests/harness.mjs`) umgestellt, Testdateien nach Inhalt benannt.
8. **Dokumentation:** technische Dokumentation (30 Seiten), Demo-Ablauf, Poster, Diagramme,
   Bildschirmfotos und Viewer (`ISS_Model_Viewer_v1.3.html`) neu. Das technische Konzept bleibt auf dem
   abgegebenen Stand vom 04.11. (v1.13); `pdf_bauen.py` baut es nur noch auf ausdrücklichen Wunsch.

## 5. Offene Punkte

Erledigt aus der Liste von v1.14: Kamerasichtfeld (Punkt 1), Antenne am Bildrand (zweite SGANT),
TRRJ-Achse und Autotrack-Prüfung, MT-Arbeitsplätze, Streamlinks (v1.16 im Browser geprüft).

1. **Am echten System prüfen** (aus der Arbeitsumgebung nicht erreichbar):
   - `streams.py` aus dem Launcher heraus (Python-Abruf statt Browser): Im Kamerafenster müssen oben die
     laufenden Streams ohne Datum stehen, sonst `http://localhost:8137/__streams` ansehen (`errors`).
     Die Erkennungsregeln sind an den echten Seiten geprüft, der Abruf mit Python nicht (Einwilligungsseite
     der EU, Sperren).
   - Fehlererkennung des YouTube-Spielers (postMessage `onError`) mit einem privaten Video.
   - TRRJ-Vorzeichen Backbord, sobald ein TRRJ im AUTOTRACK läuft: Das Ereignisprotokoll meldet dann
     Bestätigung oder Korrektur. Bis dahin Livebild und Zwilling von CP8 oder CP9 vergleichen.
2. **Kamera- und Detaillagen sind Näherungen.** Kameraports nach NASA-Beschreibung, nicht vermessen.
   Der Vergleich `Dokumentation/bilder/vergleich_cp8.png` passt in Größe und Anordnung, nicht auf
   den Pixel. Geschätzt sind die Sichtfelder von Sen (Horizont, Andockport) und der HD-Kamera an Harmony.
3. **Nicht identifiziert:** weißer Kasten mit runder dunkler Öffnung auf der Zenitseite von Kibo
   (im CP8-Bild links). Erst identifizieren, dann modellieren.
4. **iROSA an 3B:** Der Zeitpunkt kommt aus `IROSA_LATE`/LL2; der tatsächliche Stand ist nicht geprüft.
5. **Greifen:** Greifpunkte von Cygnus und HTV-X sind angenähert, die POA-Lage ebenso. Ein Knopf zum
   Zurücksetzen von `iss.payloads` fehlt (bisher `ISS.resetPayloads()` in der Konsole).
6. **Ohne öffentliche Kanäle** (starr oder vorhergesagt, so gekennzeichnet): JEMRMS, ERA, zweite SGANT,
   Luken außer der abgeleiteten EV-Luke, Flügel von Nauka, Schwenk/Neigung/Zoom der Kameras.
7. **Physik:** Die Drehrate im Physikmodell ist relativ zu LVLH; freier Flug hält deshalb die LVLH-Lage.
8. **Teamnamen** eintragen und die Meilensteintermine klären (Abschnitt 2).

## 6. Konventionen, die man kennen muss

- Körpersystem: +X vorwärts (Node 2), +Y Steuerbord, +Z Nadir; Längen in m.
- Szene: LVLH mit `rotation.x = 90°` (Zenit = Welt +Y), darunter die Lage (`S.att`), darunter `MODEL.root`.
- Gelenkkalibrierung `CAL`: Modellwinkel = Vorzeichen · Telemetrie + Offset.
  - SARJ: S +r+90, P −r+90. BGA: Tabelle in `iss_twin.html`.
  - TRRJ: S +r, P +r, Drehung um X (`pivot.rotation.x`).
- Radiatorziel (`radiatorGoal`): Sonne `atan2(s_z, s_y)`, im Erdschatten `atan2(−n_y, n_z)`, begrenzt
  auf ±105° (`radiatorTarget` in `model-checks.mjs`).
- Bauteile (`part()` in `iss-model.mjs`): `decor` = Detail ohne Kollisionskörper, `proxy` = Hülle, nur
  im Holo-Modus sichtbar, aber Kollisionskörper, `solidOnly` = Stabgitter nur in Solid.
- Darstellung: `setRenderStyle(holo)`. In Solid keine Linien auf Flächen (sonst Flimmern).
- Greifpunkt: +Y zeigt aus dem Greifpunkt heraus; gegriffen heißt, das Greifpunktsystem fällt mit
  `MODEL.armTip` zusammen.
- Kameras: Eintrag in `CAMERAS` mit `pos`, `target` oder `dir`, `optics` und `ptu`; Optiken in `OPTICS`.
- Übersetzungen: `tools/strings-*.tsv`, danach `python tools/build_strings.py`.

## 7. Bauen, testen, prüfen

```sh
cd ISS-Shadow
npm install                       # three, jsdom, mermaid für Tests und Doku
npm test                          # 13 Testdateien, 15 PASS-Zeilen (v1.16)
npm run test:py                   # 24 Python-Tests, OK (mit requirements.txt läuft auch der Feed-Test)
python launcher.py                # oder unter Windows: Start ISS Shadow.bat
node tools/export_viewer.mjs      # 3D-Viewer neu
cd Dokumentation && python skripte/screenshots.py && python skripte/pdf_bauen.py && python skripte/poster_bauen.py
```

Prüfwerkzeuge in `pruefwerkzeuge/` (Playwright mit Chromium oder Chrome; der Projektordner braucht
`npm install`):

| Werkzeug | Zweck |
|---|---|
| `render.py <Projekt> jobs_beispiel.json` | rendert Ansichten aus einer Kamera im Körpersystem mit gegebener Telemetrie und optional geänderter `CAL`; `T0=<UTC>` stellt die Uhr (Beleuchtung) |
| `camshot.py <Projekt> aus.png cp8 -18 5 58 sd` | Zwillingsansicht einer Außenkamera mit Schwenk, Neigung, Sichtfeld |
| `vergleich.py live.png zwilling.png aus.png "Titel" "Titel"` | setzt Livebild und Zwilling nebeneinander |
| `longrun.py <Projekt>` | 12 h Befehlsmodus mit voller Lagephysik (v1.15: 0° Abweichung, Kreisel 22 %) |

So entstand `vergleich_cp8.png`:

```sh
T0=2026-11-10T13:26:00Z TM='{"S0000001":24.8,"S0000002":15.2,"S0000003":59.8,"S0000004":300.3,"CSAMT000001":287.02}' \
  python camshot.py ../ISS-Shadow zwilling.png cp8 -18 5 58 sd
python vergleich.py ../referenz/live_CP8_2026-11-10_1326_ausschnitt.png zwilling.png vergleich_cp8.png \
  "NASA-Livebild CP8 · 10.11.2026 13:26 UTC" "Zwilling v1.15 · CP8, SD-Kamera, Sichtfeld 73° × 58°"
```

Live-Werte vom 10.11.2026 13:25 UTC aus Tims Twin: SARJ P 300,3 / S 59,8 (AUTOTRACK), TRRJ P 15,2 /
S 24,8 (DIR POS), MT 2,87 m (WS4), Lage LVLH Y −4,03 P −7,63 R 1,23, Höhe 417,1 km. Cargo Dragon C211 an
IDA-3 (Harmony Zenit), Crew Dragon Grace an IDA-2. Die Stellung der Beta-Gelenke fehlt in dieser
Aufzeichnung; die Solarflügel im Vergleichsbild sind deshalb vorhergesagt und stehen anders als im Livebild.

## 8. Inhalt dieses Pakets

| Datei | Inhalt |
|---|---|
| `ISS-Shadow_v1.16.zip` | gesamtes Projekt ohne node_modules und logs, mit Ordner `Dokumentation/` (PDFs, Bilder, Quellen) |
| `referenz/Aufgabenblatt_CaseStudy_DigitalTwin.pdf` | Aufgabenblatt |
| `referenz/live_CP8_*.png`, `zwilling_v1.13_*.png` | Tims Livebilder (NASA-Stream, CP8) und Twin-Ansicht vom 10.11. |
| `referenz/live_CP8_2026-11-10_1326_ausschnitt.png` | Ausschnitt des Livebilds für den Vergleich |
| `referenz/vergleich_live_vs_v1.14.png`, `vergleich_live_vs_v1.15.png` | Livebild neben Zwilling, alter und neuer Stand |
| `pruefwerkzeuge/` | Render-, Kamera- und Langzeitprüfung (Abschnitt 7) |

Startsatz für den neuen Chat: „Hier ist die Übergabe zu ISS Shadow v1.16. Lies HANDOFF.md und entpacke
das Projekt. Weiter mit den offenen Punkten aus Abschnitt 5.“
