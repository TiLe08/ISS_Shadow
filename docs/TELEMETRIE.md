# Telemetrie: NASA ISSLive, Zeitbasis, Signalzustand, Dekodierung

Dieses Dokument beschreibt die Datenquelle des digitalen Schattens und alles, was das Programm tun
muss, um sie richtig zu lesen. Viele Regeln hier wurden an echten Aufzeichnungen erarbeitet; die
Belege liegen in `tests/` (siehe [TESTS.md](TESTS.md)).

## Die Quelle

NASA veröffentlicht einen Teil der Bordtelemetrie der ISS über **ISSLive**, einen öffentlichen
Lightstreamer-Server:

- Server: `https://push.lightstreamer.com`, Adapter-Set `ISSLIVE` (im Setup änderbar)
- Protokoll: Lightstreamer TLCP über WebSocket/HTTP; Abo-Modus `MERGE` mit Schnappschuss
- Felder je Kanal: `TimeStamp` (Bordzeit, siehe unten), `Value` (Text), beim Uhrkanal zusätzlich
  `Status.Class` (`24` = Bodenkontakt, AOS)
- Kanalkennung: **PUI** (Program Unique Identifier), z. B. `S0000004` (Backbord-SARJ-Winkel),
  `USLAB000086` (Stationsmodus), `TIME_000001` (Uhr)

Das öffentliche Verzeichnis (Arbeitsblatt `ISS_Public_Telemetry.xlsx` des Projekts ISS Mimic) enthält
**336 eindeutige PUIs**; mit `CSAMT000002` sind es 337 Kanäle. Beide Abo-Wege (Seite und
`bridge.py`) abonnieren alle, in Paketen zu 24 Kanälen. Lehnt der Server ein Paket ab (weil NASA
einen Kanal entfernt hat), wird es halbiert, bis der fehlerhafte Kanal isoliert ist.

**Wichtige Eigenschaften des Feeds:**

- ISSLive sendet einen Wert **nur, wenn er sich ändert** (plus einmal beim Abonnieren). Ein geparktes
  Gelenk kann also stundenlang keinen neuen Wert schicken und trotzdem aktuell sein. Graphen halten
  deshalb den letzten Wert (Treppenverlauf).
- `TIME_000001` ändert sich ständig: NASA sendet die Uhr etwa **24-mal pro Sekunde** (gemessen am
  26.10.2026). Ihr `Value` ist dieselbe Uhr in Millisekunden.
- Einige Kanäle liefert der öffentliche Feed **nie**: Wert `0`, Zeitstempel `0` (z. B. alle acht
  Flügelströme). Das Programm zeigt sie als „nicht veröffentlicht“ (n/a), nicht als 0.
- Der Verzug zwischen Bord und Bildschirm liegt typischerweise bei 4-5 s.
- Es gibt echte Funkunterbrechungen (LOS, `Status.Class` ≠ 24, meist Sekunden bis wenige Minuten)
  und Zeiten, in denen **NASAs Feed selbst einfriert** (am 21.10.2026 über 11,5 h: die Uhr stand,
  die Sitzung blieb offen).

## Zeitstempel und Zeitbasis

`TimeStamp` ist als „Stunden seit 1. Januar 00:00 UTC“ dokumentiert. In der Praxis gilt:

- Die Uhr von ISSLive zählt ab **31. Dezember 00:00 UTC**, geht also gegenüber den Stunden des
  Jahres **24 h vor**. Das ist der Normalfall.
- Am 14.10.2026 nutzte der Feed kurzzeitig eine ganz andere Epoche (~1047 h statt ~6885 h).
- Die PC-Uhr kann Sekunden bis Minuten falsch gehen.

Deshalb lernen Seite (`observeClock`, `TIMEBASE`) und Bridge (`TimeBase`) einen **Offset** zwischen
Feed-Uhr und PC-Uhr: das Minimum von (lokale Stunden − Zeitstempel von `TIME_000001`) über die letzten
zwei Minuten, eine Probe pro Sekunde. Jeder Zeitstempel des Feeds wird damit auf die PC-Uhr
abgebildet (`correctTs` bzw. `TimeBase.correct`), sofern er höchstens 72 h alt ist.

Regeln, damit ein eingefrorener Feed nie als aktuell gilt:

- Nur **Ticks** zählen: Ein Uhrwert zählt nur, wenn sein Zeitstempel vorgerückt ist. Den
  Schnappschuss, den ein Neuverbinden erneut sendet, ist kein Tick.
- Vor zwei Ticks wird nichts gelernt.
- Ein Sprung um mehr als eine Stunde (Epochenwechsel, Neujahr) wird sofort neu gelernt.
- **Vor dem Lernen** wird der Verzug mit `feedLagH` / `feed_lag_h` bestimmt: der kleinere Verzug der
  beiden plausiblen Epochen (1. Januar und 31. Dezember), Werte aus der Zukunft ausgenommen. Liegt
  die Uhr mehr als **120 s** zurück, ist NASAs Feed eingefroren: Meldung im Ereignisprotokoll,
  Signal STALE, Feed-Pille „bei NASA eingefroren · Dauer“.

Die Abweichung der PC-Uhr wird modulo 24 h angezeigt (Tooltip der Feed-Pille, Statusfeld
`clock_offset_s` der Bridge).

## Signalzustand: AOS, LOS, STALE

| Zustand | Bedeutung | Bedingung |
|---|---|---|
| **AOS** | Acquisition of Signal: Feed liefert aktuelle Daten | `Status.Class` = 24 und die Uhr ist aktuell, oder frische Kanäle kommen an |
| **LOS** | Loss of Signal: kein Bodenkontakt der ISS | `Status.Class` ≠ 24 |
| **STALE** | Feed liefert nichts Aktuelles | Uhr > 15 s im Rückstand **und** in den letzten 15 s kein frischer Kanal; oder Feed bei NASA eingefroren |

„Frischer Kanal“ heißt: ein geänderter Wert, dessen korrigierter Zeitstempel weniger als 15 s
zurückliegt. Das hält die Verbindung auf AOS, auch wenn NASAs Uhrkanal kurz hängt
(`LINK.itemFreshRx` in der Seite, `last_item_fresh` in der Bridge). Die Anzeige nutzt
`effectiveSignal()`: AOS wird zu STALE, wenn 30 s weder Uhr noch frische Kanäle kamen.

**Watchdog.** ISSLive kann eine Sitzung offen halten und nichts senden. Seite und Bridge prüfen alle
2 s: nach 30 s Stille eine Meldung, nach 60 s wird der Client neu aufgebaut, mit wachsender Wartezeit
bis 5 min. Über MQTT baut die Seite die Broker-Verbindung neu auf, wenn die Bridge 60 s schweigt (sie
sendet ihren Status mindestens alle 10 s). Jeder Client hat eine **Generationsnummer**; Callbacks
eines ersetzten Clients werden ignoriert.

**Ist „stale“ ein Fehler des Programms?** In aller Regel nicht. Die Feed-Pille zeigt, wann NASAs Uhr
zuletzt lief. Steht dort „bei NASA eingefroren“, liegt es am NASA-Server; das Programm erholt sich
selbst, sobald der Feed wieder läuft. Bereits empfangene Werte bleiben erhalten.

## Einheiten

Das NASA-Arbeitsblatt nennt für einige Kanäle andere Einheiten, als ISSLive tatsächlich liefert
(geprüft mit Live-Werten am 14./15.10.2026). Korrigiert in `UNIT_FIX`:

| Kanäle | Arbeitsblatt | tatsächlich |
|---|---|---|
| Zustandsvektor USLAB000032-37 | FT, FT/S | km, m/s (an der Größenordnung erkannt; Fuß wird weiter akzeptiert) |
| Drehraten USLAB000025-27 | RAD/S | Grad/s (Nicken −0,064 = Bahnrate) |
| Lagefehler USLAB000022-24 | RAD | Grad |
| Partial-, Kabinen- und Crewlock-Drücke (NODE3000001-03, USLAB000053-55, USLAB000058, AIRLOCK000049/54) | PSIA/PSI | mmHg (ppO2 ≈ 154, ppN2 ≈ 574, Kabine ≈ 741) |
| CMG-Momente / -Drehimpuls (USLAB000006-09, USLAB000038) | - | N·m bzw. N·m·s |
| externe Kühlkreise (S1/P1000001-03) | - | kg/h, kPa, °C |

Anzeigeeinheiten für Kanäle, die das Arbeitsblatt nur als CNT oder N/A führt (Flügelvolt, CMG-U/min
usw.), kommen aus `channel-meta.js` (telemetry.space, MIT-Lizenz). Die Arbeitsblatt-Einheit steht im
Tooltip.

## Dekodierung von Status- und Moduskanälen

Statustexte kommen aus `ENUM`/`CH_ENUM` in `iss_twin.html` (Vorrang) und `CHANNEL_META.enums`.

**US-Stationsmodus `USLAB000086`** ist ein **Bitcode**:

| Wert | Modus |
|---|---|
| 1 | STANDARD |
| 2 | MICROGRAVITY |
| 4 | REBOOST |
| 8 | PROX OPS (Annäherung eines Fahrzeugs) |
| 16 | **EXTERNAL OPS** (Außenbordeinsatz EVA oder Robotikbetrieb EVR) |
| 32 | SURVIVAL |
| 64 | ASCR (Assured Safe Crew Return) |

Geprüft gegen telemetry.space und NASA ISS Mimic; live am 26.10.2026: 1 (Standard), passend zu den
übrigen Modi.

**Russischer Stationsmodus `RUSSEG000001`** hat eine **eigene Reihenfolge 1..7** (wie in ISS Mimic):
1 CREW RESCUE, 2 SURVIVAL, 3 REBOOST, 4 PROX OPS, 5 EVA, 6 MICROGRAVITY, 7 STANDARD.

Weitere Dekodierungen (Auswahl):

| Kanal | Bedeutung | Werte |
|---|---|---|
| `USLAB000012` | US-GNC-Modus | 0 DEFAULT, 1 WAIT, 3 STANDBY, 4 CMG ATT CTRL, **5 CMG + THR ASSIST** (Normalbetrieb: Düsen nur bereit), 6 USER DATA GEN, 7 FREE DRIFT |
| `S0000006-09` | Modi TRRJ/SARJ | 1 STANDBY, 2 RESTART, 3 CHECKOUT, 4 DIR POS (geparkt), 5 AUTOTRACK, 6 BLIND, 7 SHUTDOWN, 8 SWITCHOVER |
| `RUSSEG000021` | SUDN-Lagemodus | 0 INERTIAL, 1 LVLH SM, 2 SOLAR ORIENTATION, 3 CURRENT LVLH, 4 CURRENT INERTIAL, 5 DAMPING, 6 TEA, 7 X-POP |
| `RUSSEG000025` | SUDN-Dynamikmodus | 0 RESERVE, 1 THRUSTERS, 2 GYRODINES, 3/4 Entsättigung US/RS, 5 TRANSLATION THRUSTERS, 6 THRUSTERS HELP CMG, 7 FREE DRIFT |
| `RUSSEG000022-24` | Master-, Freiflug-, Triebwerksflags | RS MASTER, PREPARED, PRE-START/TERMINATED |
| `RUSSEG000014/17/18/19` | Belegung der russischen Ports (Swesda hinten, Prichal, MRM-1, MRM-2) | 0 frei, 1 belegt |
| `CSASSRMS002`, `CSASPDM0002` | Basisort von Canadarm2 bzw. Dextre | 1 LAB, 2 NODE 3, 4 NODE 2, 7/8/11/13 MBS PDGF1/2/3/4, 14 FGB, 16 POA, 19 SSRMS TIP LEE, 63 UNDEFINED |
| `CSASSRMS003` | welches LEE die Basis ist | 0 = LEE A, sonst LEE B |

Wechsel von Stations-, RS- und GNC-Modus, Lagemanöver, Portbelegung und SARJ-Modi kommen ins
Ereignisprotokoll (`WATCH`).

**Triebwerke:** ISSLive hat keinen Kanal pro Triebwerk. GNC-Modus 5 heißt nur, dass Düsen bereitstehen;
das wird nicht als Dauerfeuer gezeichnet. Abgasstrahlen erscheinen bei kommandierter Bahnanhebung
(Stationsmodus Reboost) und als seltene abgeleitete Pulse, solange das russische Segment die Lage mit
Triebwerken hält.

## Energieversorgung aus der Spannung

Je Solarflügel (Kanäle 1A … 4B) liefert der Feed die **Spannung** und den 120-V-Ein/Aus-Status, aber
keine Ströme. Eine gemessene Leistung gibt es live deshalb nicht, und das Programm schätzt auch keine.
Aus der Spannung lässt sich aber der Betriebszustand ablesen, mit denselben Schwellen, die NASA und
ISS Mimic verwenden:

| Spannung | Zustand | Bedeutung |
|---|---|---|
| < 151,5 V | DISCHARGE | Flügel im Schatten, Batterien entladen |
| 151,5-160 V | CHARGING | beleuchtet, Batterien werden geladen |
| > 160 V | CHARGED | Batterien voll, Flügel teilweise abgeregelt |

Das Energie-Panel zeigt je Flügel Beta-Winkel, Spannung und Zustand, dazu die Zahl der Flügel in der
Sonne, den Batteriezustand und die mittlere Spannung; der Verlauf zeigt die mittlere Spannung (Tag und
Nacht sind darin deutlich zu sehen). Leistung (V × I) erscheint nur, wenn Ströme vorliegen
(Simulator, virtuelle Station). Die Pille „Sunlit/Shadow“ vergleicht die Bahngeometrie mit diesen
Spannungen (≥ 151,5 V = beleuchtet).

## MQTT-Schnittstelle der Bridge

Präfix einstellbar (Vorgabe `iss`, im Setup „Topic root“).

| Topic | Richtung | Inhalt |
|---|---|---|
| `iss/tm/<PUI>` | Bridge → alle, retained | `{"v": Wert, "t": Stunden des Jahres (auf PC-Uhr korrigiert), "rx": Unix-s, "source": "ISSLIVE" \| "REPLAY"}` |
| `iss/link` | Bridge → alle, retained | `{"sig": "AOS" \| "LOS" \| "STALE", "t": …, "rx": …}` |
| `iss/bridge` | Bridge → alle, retained | Status: `state`, `ls` (Lightstreamer-Zustand), `n`, `error`, `last_tm`, `last_time`, `subs_ok`, `sub_error`, `bad_items`, `restarts`, `clock_offset_s`, `feed_clock`; Last Will `{"state": "offline"}` |
| `iss/orbit` | Bridge → alle, retained | NASA-Bahnvorhersage, alle 5 s (siehe [BAHN_UND_PHYSIK.md](BAHN_UND_PHYSIK.md)) |
| `iss/cmd/<Ziel>` | Dashboard → Bridge | Kommando im Kommandomodus: `{"id", "target", "value", "ts", "operator", "mode"}` |
| `iss/ack/<id>` | Bridge → Dashboard | Quittung `{"id", "status": "SIMULATED", "reason", "rx"}` |
| `iss/virtual/state` | Dashboard → alle | Zustand der virtuellen Station, einmal pro Sekunde im Kommandomodus |

`TIME_000001` wird nicht als `iss/tm/…` weitergeleitet; die Bridge richtet die Zeitstempel selbst
aus. Kommandos werden in `logs/commands.jsonl` protokolliert und nur als „auf die virtuelle Station
angewendet“ quittiert. Die echte ISS ist für die Öffentlichkeit nicht kommandierbar.

## Protokoll der Prozessdaten

Die Bridge schreibt jeden empfangenen Wert in `logs/iss_tm_JJJJMMTT.csv` (eine Datei pro UTC-Tag,
Spalten `rx_utc, pui, value, sc_hours_of_year`). Eine solche Datei lässt sich wiedergeben:
`python bridge.py --replay logs/iss_tm_20261026.csv --speed 10`. Die Seite kennzeichnet dann alles als
RECORDED. Unabhängig davon lädt „Log CSV“ in der oberen Leiste den im Browser gesammelten Verlauf
ausgewählter Kanäle als Tabelle herunter (eine Zeile pro Sekunde, eine Spalte pro Kanal); im
Kommandomodus wird stattdessen die virtuelle Sitzung als JSON exportiert.

## Besuchsfahrzeuge und Crew

ISSLive meldet nur, ob die vier russischen Ports belegt sind, nicht womit, und nichts über die
US-Ports oder die Crew. Diese Angaben kommen aus **Launch Library 2** (TheSpaceDevs), einer
öffentlichen Datenbank (`vehicles.py`, im Browser `refreshVehicles`):

- Andockereignisse alle 30 min, Station/Crew, Ereignisse und Starts alle 2 h (insgesamt etwa 3,5
  Anfragen pro Stunde; LL2 erlaubt anonym 15 pro Stunde und Adresse).
- Russische Ports: Das Telemetrie-Flag entscheidet, ob belegt; LL2 nennt Fahrzeug und Typ.
  US-Ports: LL2 entscheidet.
- Ohne LL2-Daten gilt ein datiertes Manifest (`VV_MANIFEST`, Stand 20.10.2026).
- Zeiten, die LL2 nur auf Tag/Monat/Jahr kennt, werden auch nur so genau angezeigt.

## Simulator

Quelle „Sim“ (`simTick`) erzeugt jede Sekunde Bahn (418 km, 51,64°), Lage (XVV mit kleinem Rauschen),
Sonnennachführung der Gelenke, Energie, Kreisel, Lebenserhaltung, Thermal, Kommunikation und
Funkunterbrechungen (~12 min LOS alle 90 min), in denselben Kanälen, Einheiten und Gelenkkonventionen
wie der echte Feed. Die Robotik steht in der am 14.10.2026 geflogenen Pose.

Zum Testen der Verbindung ohne NASA gibt es außerdem einen nachgebildeten ISSLive-Server
(`tests/mock_isslive.py`), der Stillstand, Ausfall, Uhrabweichung und andere Epochen nachstellen kann
(siehe [TESTS.md](TESTS.md)).

## Kanalliste `CHANNELS.csv`

Eine Zeile pro Kanal (337), Spalten:

| Spalte | Bedeutung |
|---|---|
| `PUI` | Kanalkennung |
| `Category` | zuständige Konsolenposition der Flugkontrolle laut NASA: ADCO (Lage/Bewegung), TOPO (Bahn), SPARTAN (Energie), ETHOS (Lebenserhaltung und Thermal), CATO (Kommunikation), CDH bzw. ODIN (Rechner und Daten), EVA, CSA (kanadische Robotik), VVO (Besuchsfahrzeuge, russisches Segment) |
| `Native unit` | Einheit laut NASA-Arbeitsblatt (die tatsächliche Einheit kann abweichen, siehe oben) |
| `Name`, `Description` | Bezeichnung und Beschreibung von NASA (englisch, unverändert übernommen) |
| `Subscription` | `Browser and bridge` (beide Abo-Wege) oder `Separate status subscription` (`TIME_000001` mit Statusfeld) |
| `3D articulation` | wofür der Kanal im 3D-Modell verwendet wird (z. B. `SARJ`, `Solar beta joint`, `Canadarm2 joint`) oder `Raw telemetry / panels / derived use` |
| `Virtual model` | `Modeled` (136 Kanäle mit virtuellem Wert im Kommandomodus) oder `Frozen reference or unmodeled` |

Die Werte bleiben englisch, weil sie sich auf NASAs Bezeichnungen beziehen. Die Datei ist eine
Übersicht für Menschen und Tabellenprogramme; das Programm selbst liest sie nicht (die Kanäle stehen
in `DICT_RAW` in `iss_twin.html` und in `ITEMS` in `bridge.py`).
