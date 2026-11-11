# Weiterentwicklung

Praktische Hinweise für alle, die das Projekt verändern wollen.

## Arbeitsweise

- **Kein Build-Schritt.** Alle Dateien werden so ausgeliefert, wie sie im Ordner liegen. Nach einer
  Änderung genügt ein Neuladen der Seite (der Launcher schickt `Cache-Control: no-store`).
- **Klassische Skripte und Module.** `orbit-source.js`, `virtual-station.js`, `virtual-controls.js`,
  `channel-meta.js`, `i18n*.js`, `widgets.js` und `workspace.js` sind klassische Skripte, die je ein
  globales Objekt anlegen (`OrbitData`, `VirtualStation`, `VirtualControls`, `CHANNEL_META`, `I18N`,
  `ISSW`, `ISSWorkspace`). `orbit-source.js` und `virtual-station.js` funktionieren zusätzlich als
  Node-Module (`require`) für die Tests. `model-checks.mjs`, `earth-tiles.mjs` und
  `planet-overlay.mjs` sind ES-Module und werden vom Modul-Skript in `iss_twin.html` importiert.
- **Bibliotheken** kommen vom CDN (jsDelivr) mit festen Versionen: three.js 0.185.1 (über die
  Importmap im Kopf), Lightstreamer-Client 9.2.3, MQTT.js 5.15.2. Für die Tests liefert `npm install`
  `three` und `jsdom`.
- **Tests zuerst laufen lassen**, dann ändern, dann wieder: `npm test` und
  `python -m unittest discover -s tests`. Siehe [TESTS.md](TESTS.md).

## Kommentar- und Dokumentationskonventionen

- Kommentare und Dokumentation sind deutsch, mit echten Umlauten.
- Jede Datei beginnt mit einem Kopfkommentar: Zweck, Schnittstelle, Einheiten.
- Jede Funktion hat einen Kommentar bzw. Docstring direkt darüber (JS) oder darunter (Python).
- Einheiten immer nennen (km oder m, Grad oder Radiant, ms oder s, Stunden des Jahres).
- Annahmen, die nicht belegt sind, ausdrücklich als Annahme kennzeichnen und, wenn möglich, mit
  dem Datum der Prüfung und der Testdatei, die sie absichert.
- Oberflächentexte im Code bleiben englisch (sie sind die Schlüssel der Übersetzung, siehe unten).

## Typische Änderungen

### Einen Oberflächentext ergänzen oder übersetzen

1. Im Code den englischen Text mit `t('…')` verwenden (Platzhalter `{0}`, `{1}` …).
2. In `tools/strings-ui.tsv` (Beschriftungen), `strings-status.tsv` (Meldungen, Tooltips) oder
   `strings-command.tsv` (Kommandofenster) eine Zeile ergänzen:
   `English|Deutsch|Español|Русский|Français|日本語`.
3. `python tools/build_strings.py` ausführen; das erzeugt `i18n-strings.js` neu.
4. `node tests/test_ui.mjs` prüft, dass alle Sprachen dieselben Schlüssel haben.

Statisches HTML wird von `i18n.js` automatisch erfasst und beim Sprachwechsel neu übersetzt.

### Einen Kanal anders darstellen

- Einheit falsch? `UNIT_FIX` in `iss_twin.html` (Telemetrie-Verzeichnis) oder `units` in
  `channel-meta.js`.
- Statustexte fehlen? `ENUM` (Tabelle) und `CH_ENUM` (Zuordnung PUI → Tabelle) in `iss_twin.html`;
  diese haben Vorrang vor `CHANNEL_META.enums`.
- Wertebereich für Balken/Anzeigen: `ranges` in `channel-meta.js`.
- Soll eine Änderung ins Ereignisprotokoll? Eintrag in `WATCH` (PUI → Funktion(Wert) → Text).
- Zusammenfassung eines Panels: `buildPanels()` (HTML) und `updatePanels(D)` (Werte).

### Eine Gelenkkalibrierung ändern

`CAL` in `iss_twin.html`. Vorher eine Aufzeichnung machen, in der das Gelenk nachweislich etwas tut
(z. B. Autotrack bei Sonne), als JSON unter `tests/` ablegen und in `test_regression.mjs` einen Test ergänzen,
der die neue Abbildung gegen eine unabhängige Größe (Sonnenrichtung, Kollisionsfreiheit) prüft. Die
Begründung gehört in [../GEOMETRY.md](../GEOMETRY.md).

### Geometrie ändern

`buildISS()` und die Baugruppen-Funktionen in `iss_twin.html`. Koordinaten im Körpersystem in Metern;
Quelle (IGOAL oder Datenblatt) im Kommentar nennen. Danach `node tests/test_model.mjs` und
`node tests/test_regression.mjs` (Abstandsprüfungen über den gesamten Gelenkweg). Neue bewegliche Baugruppen
brauchen `userData.collisionGroup`, sonst gelten sie als fest.

### Ein Besuchsfahrzeug ergänzen

Form in einer `build…`-Funktion neben den vorhandenen Fahrzeugen, Typ in `vvTypeOf()` erkennen,
Ports, die es aufnehmen kann, in `VV_PORT_TYPES` eintragen. Launch Library 2 liefert An- und
Abflüge ohne Codeänderung.

### Version erhöhen

`PAGE_VERSION` in `iss_twin.html`, `VERSION` in `launcher.py` (müssen gleich sein), Titel und
Kopfzeile in `iss_twin.html`, Überschrift in `README.md`, Eintrag in `CHANGELOG.md`.

## Fehlersuche

- **Entwicklerkonsole:** `window.ISS` enthält die wichtigsten Zustände und Funktionen (`TM`, `LINK`,
  `ORB`, `NASA_ORBIT`, `CMD`, `MODEL`, `CAL`, `MSS_CAL`, `VV`, `ingest`, `applyJoints`, `liveJoints`,
  `liveJointsRaw`, `switchSource`, `enterCmd`, `commandVirtual` …). Beispiel: `ISS.TM.get('USLAB000086')` zeigt den letzten Stationsmodus.
- **Zeitmessung der Bildschleife:** `ISS.PERF.on = true`, nach einigen Sekunden `ISS.PERF.acc`
  ansehen (Millisekunden je Abschnitt).
- **Überlappungsbericht:** Klick auf das rote Banner speichert eine JSON-Datei mit Version, Pose und
  roher Telemetrie; daraus lässt sich ein Regressionstest bauen (wie `live_report_20261019.json`).
- **Feed-Probleme:** Tooltip der Feed-Pille (letzter Uhr-Tick, Uhrabweichung, Neuaufbauten), Topic
  `iss/bridge` (Status der Bridge), `logs/launcher.log`. Zum Nachstellen: `tests/mock_isslive.py` mit
  `/admin/freeze`, `/admin/drop`, `/admin/skew?s=40` usw.
- **Bridge allein:** `python bridge.py --broker localhost --port 1883` (braucht einen laufenden
  Broker) oder Wiedergabe `--replay logs/iss_tm_JJJJMMTT.csv --speed 10`.
- **Gespeicherte Zustände zurücksetzen:** Websitedaten für `localhost:8137` im Browser löschen
  (Layout, Dashboard, Kalibrierung, Sprache).

## Bekannte offene Punkte

- TRRJ-Vorzeichen Backbord nur aus einem Livebild belegt (die Radiatoren waren in jeder Aufzeichnung
  geparkt). `checkTrrjSense()` klärt es selbsttätig, sobald ein TRRJ bei Sonnenlicht im Autotrack läuft;
  die Meldung steht dann im Ereignisprotokoll.
- Kameralagen sind aus den veröffentlichten Einbaustellen und Livebildern angenähert; Schwenk, Neigung
  und Zoom stehen nicht in der Telemetrie (siehe KAMERAS.md).
- Die Stream-Erkennung (`streams.py`) liest öffentliche YouTube-Seiten, deren Format sich ändern kann.
  Fällt sie aus, bleibt die Kanal-Einbettung oder ein eigener Link.
- Gelenkkonvention von Canadarm2 und Rollwinkel der MBS-Greifpunkte sind dokumentierte Annahmen.
- Basen POA und SPDM für Canadarm2 werden nicht unterstützt (der Arm wird dann ausgeblendet).
- Bibliotheken vom CDN: Der erste Start braucht Internet. Für einen vollständig netzfreien Betrieb
  müssten three.js, Lightstreamer und MQTT.js lokal abgelegt und die Pfade angepasst werden.
- Flügelströme veröffentlicht NASA nicht; eine gemessene Leistung gibt es daher live nicht.
