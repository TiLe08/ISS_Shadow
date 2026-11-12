# Kameras und Livebild

Dieses Dokument beschreibt die Außenkameras im Modell, ihre Sichtfelder, das Kamerafenster und die
Auswahl des Livestreams. Code: `cameras.mjs` (Browser), `streams.py` (Launcher).

## Was das Kamerafenster zeigt

Ein Klick auf eine Kamera im 3D-Modell oder der Knopf **Cameras** öffnet das Fenster. Links läuft
der Livestream, rechts zeigt der Zwilling dieselbe Ansicht: aus der Einbaulage der gewählten Kamera,
im Bildformat und mit dem Sichtfeld ihrer Optik. **Overlay** legt den Zwilling halbdurchsichtig über
das Livebild. In der Hauptansicht zeichnet ein Rahmen den Sichtkegel der gewählten Kamera.

Schwenk, Neigung, Zoom und die Frage, welche Kamera der Stream gerade zeigt, stehen nicht in der
öffentlichen Telemetrie. Diese Werte stellt man im Fenster so ein, dass der Zwilling zum Livebild
passt; sie werden je Kamera gespeichert (`localStorage iss.cams`).

Jede Kamera bringt ihren Stream mit (v1.17): CP3, CP8, CP9, CP13 und die MSS-Kameras zeigen den
NASA-Stream „Live Video“ (NASA schaltet darin selbst zwischen den Kameras um; welche gerade läuft, steht
nicht in der Telemetrie), die Harmony-HD-Kamera den NASA-HD-Stream, die drei Sen-Kameras SpaceTV-1.
Wer in der Liste einen anderen Stream oder einen eigenen Link wählt, ändert ihn für alle Kameras
derselben Zuordnung.

**Calibrate** öffnet das Kalibrierfeld (`calib-panel.mjs`, Beschreibung in
`MODELL_UND_KALIBRIERUNG.md`): Videoverzögerung, Gelenk-Nullpunkte und ein Feinversatz der Kamera
(`dx`/`dy`/`dz` in m entlang rechts/oben/hinten, `roll` in Grad), falls die Einbaulage nicht genau stimmt.

## Kameras und Einbaustellen

| Kamera | Einbaustelle | Beleg | Lage im Modell |
|---|---|---|---|
| CP8 | P1 außen, Zenit | Liste der Kameraports (J. McDowell, planet4589.org); Livebild 10.11.2026 | angenähert |
| CP9 | P1 außen, Nadir | wie oben; NASA: Kibo verdeckt von dort den vorderen Port von Harmony | angenähert |
| CP3 | S1 außen, Nadir, direkt innen neben ELC-4 | wie oben; NASA-Beschreibung der Kamera an S1 | angenähert |
| CP13 | Destiny, Zenit Steuerbord | wie oben; NASA: der Träger verdeckt von dort den vorderen Port von Harmony, deshalb im Modell hinter S0 | angenähert, unsicherste Lage |
| Harmony HD | vorderes Ende von Harmony, Blick nach vorn | Beschreibung des NASA-Streams „High-Definition Views“ | angenähert |
| Sen SpaceTV-1 (3 Kameras) | Bartolomeo an Columbus | Sen | angenähert |
| Canadarm2 LEE (2), Dextre, MBS | an den Roboterarmen | NASA-Übersicht der MSS-Kameras | folgt den Gelenken |

Jede Kameragruppe der NASA (ETVCG) trägt auf einem Trägerrohr einen Schwenk-Neige-Kopf mit
SD-Kamera, Leuchte und seit 2016 einer HD-Kamera. So ist sie auch im Modell gebaut.

## Sichtfelder

| Optik | Bildformat | Sichtfeld weit | Sichtfeld tele | Quelle |
|---|---|---|---|---|
| SD-Kamera der ETVCG | 4:3 (NTSC) | 77° × 61° | 10° × 8° | NASA, External Television Camera Group (NTRS 20150003019) |
| HD-Kamera EHDC (Nikon D4, 28-300 mm, 2×-Konverter) | 16:9 (720p) | 36° horizontal, 20,7° senkrecht | 3,4° horizontal, 1,9° senkrecht | NASA, External High Definition Camera (NTRS 20140009959) |
| Kameras an Canadarm2, Dextre, MBS | 4:3 | 52° × 40° | 6° × 4° | NTRS 20150003019 |
| Sen, Nadirkamera | 16:9 | 32° × 18° (fest) | | aus Sens Angabe 240 km Bildbreite bei etwa 415 km Höhe |
| Sen, Horizont- und Andockkamera | 16:9 | 60° bzw. 45° senkrecht | | **Schätzung**, keine veröffentlichten Werte |
| Harmony HD | 16:9 | 50° senkrecht | | **Schätzung** |

Das Fenster zeigt das Sichtfeld als „horizontal × senkrecht“. Der Zwilling wird im Bildformat der
Optik gezeichnet und so in den 16:9-Rahmen des YouTube-Spielers eingepasst, wie der Stream ein
4:3-Bild zeigt (seitliche Balken). Nur so decken sich Livebild und Zwilling in der Überlagerung.

**Verzeichnung.** Alle NASA-Kameras haben geradlinig abbildende Zoomobjektive, keine Fischaugen.
Der Zwilling rechnet mit einer idealen Lochkamera. Die tonnenförmige Verzeichnung am kurzen Zoomende
ist nicht veröffentlicht und wird nicht nachgebildet; am Bildrand können Livebild und Zwilling
deshalb um einige Bildpunkte auseinanderliegen. Für Sens Horizontkamera (Weitwinkel) ist die
Abbildung unbekannt.

**Prüfung am Livebild.** Im NASA-Bild von CP8 vom 10.11.2026 (4:3, also SD-Kamera) ist der 8,1 m
lange Dragon in etwa 22 m Entfernung 230 von 645 Bildzeilen hoch. Das ergibt ein senkrechtes
Sichtfeld von etwa 58°, also fast das weite Zoomende von 61°. Bis v1.14 rechnete der Zwilling mit
48° und zeigte den Dragon deshalb zu groß.

## Livestream

YouTube vergibt für Dauerstreams immer wieder neue Video-Kennungen; beendete Streams werden privat.
Ein fest eingetragener Link zeigt deshalb nach einiger Zeit „privates Video“. Die Auswahl im
Kamerafenster entsteht deshalb in dieser Reihenfolge:

1. **Mit Launcher** ermittelt `streams.py` alle 30 Minuten die gerade laufenden Streams und liefert
   sie als `/__streams`. Für Sen fragt es zuerst die Inhalts-Schnittstelle von sen.com ab
   (`api.sen.com/content/public/live`, Feld `youtubeId`; damit füllt sen.com/live seinen eigenen
   Spieler), sonst die YouTube-Stream-Seite. Für NASA liest es die YouTube-Stream-Seite des Kanals.
   Die Streams zur Station stehen vorn. Ein gespeicherter Stream, der nicht mehr läuft, wird ersetzt.
2. **Zuletzt geprüfte Streams** (`KNOWN_STREAMS` in `cameras.mjs`, mit Prüfdatum). Sie können
   inzwischen beendet sein; dann greift die Fehlererkennung unten.
3. **Kanal-Einbettung** von NASA und Sen: zeigt einen laufenden Livestream des Kanals.
4. **Eigener Link:** Jeder YouTube-Link (watch, youtu.be, live, Kanal) lässt sich einfügen.

Am 11.11.2026 im Browser geprüft (live, Einbetten erlaubt):

| Stream | Kennung | Inhalt laut Videobeschreibung | passende Kamera im Zwilling |
|---|---|---|---|
| NASA „Live Video from the International Space Station“ | `M3HKLzjvKPc` | Bild der Station in 4:3, wechselnd Außenkameras und Innenansichten | CP3, CP8, CP9, CP13 (je nach Szene) |
| NASA „Live High-Definition Views from the International Space Station“ | `ROboUHfPUrU` | feste HD-Kamera an Harmony, schräg nach vorn, IDA-2 im Bild | HD-Kamera Harmony |
| Sen „Live 4K video of Earth and space“ | `fO9e9jnhYK8` | SpaceTV-1 am Bartolomeo-Träger von Columbus, drei Kameras | Sen Nadir, Horizont, Andockport |

Quellen außerhalb von YouTube: NASA verweist auf nasa.gov/live für die Stationsbilder („Space Station
Views“) nur auf eine YouTube-Playlist (`PL2aBZuCeDwlQMf6xMgQAUAY_nbHAgW5jz`, enthält auch einen beendeten
Stream). NASA+ hat keinen Dauerstream der Station. Sen.com bettet denselben YouTube-Stream ein. Der
Sen-Kanal „Space Live“ auf ITVX ist nur in Großbritannien verfügbar und nicht einbettbar. Frühere
direkte Videoadressen (Ustream, Akamai-HLS von NASA TV) sind abgeschaltet.

Meldet der eingebettete Spieler einen Fehler (privat, entfernt, Einbetten gesperrt), zeigt das Fenster
einen Hinweis und versucht den nächsten Eintrag der Liste. Der Knopf **YouTube ↗** öffnet den Stream
in einem neuen Tab. YouTube spielt nur in Seiten, die über `http://localhost:8137` geladen sind, nicht
in als Datei geöffneten Seiten.

Grenzen: `streams.py` liest öffentliche Seiten ohne vertraglich zugesicherte Schnittstelle; ändert
YouTube oder Sen deren Aufbau, bleibt die Liste leer und es gelten die Wege 2 bis 4. Die
Erkennungsregeln wurden am 11.11.2026 im Browser auf die echten Seiten von NASA und Sen angewendet und
fanden genau die drei laufenden Streams; die Tests nutzen nachgebildete Seiten im selben Aufbau. Die
Fehlererkennung des eingebetteten Spielers (privates Video) ist nur mit nachgebildeten Meldungen getestet.

## Quellen

- [NASA: External High Definition Camera (EHDC)](https://ntrs.nasa.gov/api/citations/20140009959/downloads/20140009959.pdf)
- [NASA: ISS-Kameras, ETVCG und MSS-Kameras](https://ntrs.nasa.gov/api/citations/20150003019/downloads/20150003019.pdf)
- [NASA: Sicht der Kameraports auf anfliegende Fahrzeuge](https://ntrs.nasa.gov/api/citations/20170001382/downloads/20170001382.pdf)
- [NASA auf YouTube, Livestreams](https://www.youtube.com/@NASA/streams)
- [NASA Live, Übersicht der Übertragungswege](https://www.nasa.gov/live/)
- [Sen auf YouTube, Livestreams](https://www.youtube.com/@sen/streams) und [Sen Livestream](https://www.sen.com/live)
- J. McDowell, Liste der ISS-Kameraports (planet4589.org); Sen, SpaceTV-1.
