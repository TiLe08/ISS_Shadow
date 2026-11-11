/* i18n.js: Sprache der Oberfläche (Englisch, Deutsch, Spanisch, Russisch, Französisch, Japanisch).

   Der englische Text ist der Schlüssel; jede Sprache bildet ihn auf ihre Übersetzung ab
   (Tabellen in i18n-strings.js = window.I18N_STRINGS, erzeugt von tools/build_strings.py).
   Fehlt ein Eintrag, bleibt der englische Text stehen. Platzhalter: {0}, {1}, ...
   Statisches HTML wird einmal markiert (autotag) und von apply() neu übersetzt;
   dynamischer Text wird im Code mit I18N.t() gebaut. NASA-Kanalnamen und -beschreibungen
   bleiben englisch.
   Klassisches Skript (kein Modul): stellt window.I18N bereit. */
(function (root) {
  'use strict';
  // Unterstützte Sprachen: Kürzel -> Anzeigename.
  const LANGS = { en: 'English', de: 'Deutsch', es: 'Español', ru: 'Русский', fr: 'Français', ja: '日本語' };
  // Übersetzungstabellen (aus i18n-strings.js).
  const D = () => root.I18N_STRINGS || {};
  // Startsprache: gespeicherte Wahl, sonst Browsersprache, sonst Englisch.
  const pick = () => {
    let l = null; try { l = localStorage.getItem('iss.lang'); } catch (e) {}
    if (!l && root.navigator) l = String(navigator.language || 'en').slice(0, 2).toLowerCase();
    return LANGS[l] ? l : 'en';
  };
  let lang = pick();
  // Platzhalter {0}, {1}, ... durch die Argumente ersetzen.
  const fill = (s, a) => a.length ? String(s).replace(/\{(\d)\}/g, (m, i) => a[i] ?? '') : s;
  // Übersetzen: englischer Text -> aktuelle Sprache (Leerräume werden vereinheitlicht).
  function t(s, ...a) {
    if (s == null) return '';
    if (/\s\s|\n/.test(s)) s = s.replace(/\s+/g, ' ').trim();
    const d = lang !== 'en' && D()[lang], r = d && Object.prototype.hasOwnProperty.call(d, s) ? d[s] : s;
    return fill(r, a);
  }
  const SRC = new WeakMap(), TEXTS = [];      // Textknoten in gemischtem Inhalt -> englischer Ausgangstext
  // Attribute, die ebenfalls übersetzt werden: [Markierungsattribut, Zielattribut].
  const TAGS = [['data-i18n-title', 'title'], ['data-i18n-ph', 'placeholder'], ['data-i18n-aria', 'aria-label']];
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  // Gibt es für diesen Text in irgendeiner Sprache eine Übersetzung?
  const known = s => { const k = norm(s); if (!/[A-Za-z]{2}/.test(k)) return false; const d = D(); for (const l in d) if (Object.prototype.hasOwnProperty.call(d[l], k)) return true; return false; };
  /* Den englischen Ausgangstext von statischem Text und Attributen merken (einmal, vor apply). */
  function autotag(rootEl) {
    const walk = el => {
      if (el.nodeType !== 1 || /^(SCRIPT|STYLE|CANVAS|CODE)$/.test(el.tagName) || el.hasAttribute('data-i18n-skip')) return;
      for (const [k, a] of TAGS) if (el.hasAttribute(a) && !el.hasAttribute(k) && known(el.getAttribute(a))) el.setAttribute(k, el.getAttribute(a));
      // Nur Text mit vorhandener Übersetzung wird markiert: Werte, die der Code schreibt, werden nie eingefroren.
      if (!el.hasAttribute('data-i18n') && (el.children.length === 0 || el.tagName === 'OPTION') && known(el.textContent)) el.setAttribute('data-i18n', norm(el.textContent));
      else if (el.children.length) for (const n of el.childNodes) if (n.nodeType === 3 && known(n.nodeValue) && !SRC.has(n)) { SRC.set(n, n.nodeValue); TEXTS.push(n); }   // gemischter Inhalt
      for (const c of el.children) walk(c);
    };
    walk(rootEl);
  }
  // Alle markierten Texte und Attribute (unter rootEl) in die aktuelle Sprache setzen.
  function apply(rootEl = document) {
    rootEl.querySelectorAll('[data-i18n]').forEach(el => { const v = t(el.getAttribute('data-i18n')); if (el.textContent !== v) el.textContent = v; });
    for (const [k, a] of TAGS) rootEl.querySelectorAll('[' + k + ']').forEach(el => el.setAttribute(a, t(el.getAttribute(k))));
    for (let i = TEXTS.length - 1; i >= 0; i--) {
      const n = TEXTS[i]; if (!n.isConnected) { TEXTS.splice(i, 1); continue; }
      if (rootEl !== document && !rootEl.contains(n)) continue;
      const en = SRC.get(n), m = en.match(/^(\s*)([\s\S]*?)(\s*)$/); n.nodeValue = m[1] + t(m[2]) + m[3];
    }
    if (rootEl.documentElement) rootEl.documentElement.lang = lang;
  }
  const listeners = [];
  // Sprache wechseln, speichern, Seite neu übersetzen und Zuhörer (z. B. Panels) benachrichtigen.
  function set(l) {
    if (!LANGS[l]) return; lang = l; try { localStorage.setItem('iss.lang', l); } catch (e) {}
    apply(document); listeners.forEach(f => { try { f(l); } catch (e) { console.error(e); } });
  }
  root.I18N = { LANGS, t, set, apply, autotag, onChange: f => listeners.push(f), get lang() { return lang; },
    /* Alle englischen Ausgangstexte des statischen HTML (Hilfe beim Entwickeln). */
    sources(rootEl = document) {
      const out = new Set(); rootEl.querySelectorAll('[data-i18n]').forEach(e => out.add(e.getAttribute('data-i18n')));
      for (const [k] of TAGS) rootEl.querySelectorAll('[' + k + ']').forEach(e => out.add(e.getAttribute(k)));
      for (const n of TEXTS) if (n.isConnected) out.add(SRC.get(n).trim());
      return [...out];
    },
    /* Texte ohne Übersetzung in der aktuellen Sprache (Hilfe beim Entwickeln). */
    missing(list) { const d = D()[lang] || {}; return list.filter(s => !(s in d)); } };
})(globalThis);
