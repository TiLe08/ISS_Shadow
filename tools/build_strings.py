"""Erzeugt i18n-strings.js neu aus den Übersetzungstabellen in diesem Ordner.

Jede Zeile einer strings-*.tsv: English|Deutsch|Español|Русский|Français|日本語
(der englische Text ist der Schlüssel; Trennzeichen ist | statt Tabulator).
  strings-ui.tsv       Beschriftungen der Oberfläche
  strings-status.tsv   Status- und Meldungstexte (Ereignisprotokoll, Tooltips)
  strings-command.tsv  Texte des Kommandofensters
Die Seite übersetzt zur Laufzeit mit t('English text') über i18n.js; fehlt ein Eintrag,
erscheint der englische Text. Nach jeder Änderung an einer Tabelle neu erzeugen:
Aufruf: python tools/build_strings.py"""
import json, pathlib
# Sprachen in Spaltenreihenfolge (Spalte 0 = Englisch = Schlüssel)
HERE = pathlib.Path(__file__).resolve().parent
L = ['de', 'es', 'ru', 'fr', 'ja']; D = {l: {} for l in L}
for f in sorted(HERE.glob('strings-*.tsv')):
    for n, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip(): continue
        parts = line.split('|')
        if len(parts) != 6: raise SystemExit(f'{f.name}:{n}: expected 6 columns, got {len(parts)}')
        for l, v in zip(L, parts[1:]): D[l][parts[0]] = v
# Ausgabe: ein klassisches Skript, das globalThis.I18N_STRINGS = {Sprache: {Englisch: Übersetzung}} setzt
out = HERE.parent / 'i18n-strings.js'
out.write_text('/* Übersetzungen der Oberfläche, Schlüssel ist der englische Text (siehe i18n.js). Erzeugt von tools/build_strings.py, nicht von Hand bearbeiten. */\nglobalThis.I18N_STRINGS = '
               + json.dumps(D, ensure_ascii=False, indent=0, sort_keys=True) + ';\n', encoding='utf-8')
print(f'{len(D["de"])} strings x {len(L)} languages -> {out.name}')
