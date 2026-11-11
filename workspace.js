/* workspace.js: Arbeitsbereich: Kanalmenü, Kanal-Browser und modulares Dashboard.
   Klassisches Skript (window.ISSWorkspace); die Seite ruft ISSWorkspace.init(api) einmal auf.
   api: { ctx (Widget-Kontext aus widgets.js), t (Übersetzung), channels() -> [PUI],
          groups -> [[id, Titel, Code]], groupOf(p), pinned(p), togglePin(p, an),
          raw(p) -> {raw, ts, rx, source}, panels() -> [[id, Titel]],
          elements: { view3d, map }, onLayout() }
   PUI = NASA-Kanalkennung (z. B. 'USLAB000086'). Das Dashboard-Layout wird im Browser
   gespeichert (localStorage 'iss.dash'); fehlt es oder ist es kaputt, gilt defaultDash(). */
(function (root) {
  'use strict';
  let A = null;                    // Schnittstelle der Seite (siehe Kopfkommentar), gesetzt in init()
  // Hilfsfunktionen: $ = querySelector, t = Übersetzung, esc = HTML-Escaping,
  // uid = kurze Zufalls-ID für Gruppen und Widgets.
  const $ =(s, r = document) => r.querySelector(s);
  const t = (...a) => A ? A.t(...a) : a[0];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const VIEW_NAMES = { value: 'Value', graph: 'Graph', bar: 'Bar', gauge: 'Gauge', dial: 'Dial', state: 'State' };
  const SIZES = ['s', 'm', 'l', 'w', 'x'];
  const SIZE_NAMES = { s: 'Small', m: 'Wide', l: 'Large', w: 'Extra wide', x: 'Huge' };

  /* ---------- Speicher ---------- */
  // localStorage-Zugriff mit Fehlerschutz (privates Fenster, gesperrter Speicher): load liefert
  // bei jedem Fehler den Vorgabewert d, save schlägt still fehl.
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  // Standard-Dashboard: Gruppen Station (3D, Karte, Crew), Energie, Lebenserhaltung und Lage,
  // jeweils mit einer passenden Darstellung pro Kanal.
  function defaultDash() {
    const ch = (p, view, size = 's') => ({ id: uid(), type: 'channel', p, view, size });
    return { groups: [
      { id: uid(), title: t('Station'), widgets: [{ id: uid(), type: 'view3d', size: 'x' }, { id: uid(), type: 'map', size: 'w' }, { id: uid(), type: 'panel', panel: 'pCrew', size: 'l' }] },
      { id: uid(), title: t('Power'), widgets: [ch('S4000001', 'gauge'), ch('S6000004', 'gauge'), ch('P4000001', 'gauge'), ch('P6000004', 'gauge'), ch('S0000004', 'dial'), ch('S0000003', 'dial'), ch('S0000008', 'state'), ch('S0000009', 'state')] },
      { id: uid(), title: t('Life support'), widgets: [ch('NODE3000005', 'bar'), ch('NODE3000008', 'bar'), ch('NODE3000009', 'bar'), ch('NODE3000003', 'graph', 'm'), ch('USLAB000058', 'value'), ch('NODE3000001', 'value')] },
      { id: uid(), title: t('Attitude'), widgets: [ch('USLAB000010', 'bar'), ch('USLAB000012', 'state'), ch('USLAB000086', 'state'), ch('USLAB000026', 'graph', 'm')] },
    ] };
  }
  let DASH = null;
  const saveDash = () => save('iss.dash', DASH);

  /* ---------- Kanalmenü ---------- */
  // Kanalmenü schließen und die globalen Listener (Klick außerhalb, Escape) entfernen.
  function closeMenu() { $('#chMenu')?.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escKey, true); }
  function outside(e) { if (!e.target.closest('#chMenu')) closeMenu(); }
  function escKey(e) { if (e.key === 'Escape') { closeMenu(); e.stopPropagation(); } }
  // Kontextmenü für einen Kanal p an der Position von anchor: in „Graphs“ anheften,
  // zu einer Dashboard-Gruppe hinzufügen, im Kanal-Browser öffnen, PUI kopieren.
  function channelMenu(p, anchor) {
    closeMenu(); if (!A) return;
    const info = A.ctx.info(p), pinned = A.pinned(p);
    const m = document.createElement('div'); m.id = 'chMenu'; m.className = 'menu'; m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="mh"><b>${esc(info.label)}</b><code>${esc(p)}</code></div>
      <button role="menuitem" data-a="pin">${pinned ? t('Remove from Graphs') : t('Graph it (Graphs panel)')}</button>
      <div class="msub">${t('Add to dashboard')}</div>
      ${DASH.groups.map(g => `<button role="menuitem" data-a="add" data-g="${g.id}">+ ${esc(g.title)}</button>`).join('')}
      <button role="menuitem" data-a="addnew">+ ${t('New group…')}</button>
      <div class="msep"></div>
      <button role="menuitem" data-a="browse">${t('Open in channel browser')}</button>
      <button role="menuitem" data-a="copy">${t('Copy PUI')}</button>`;
    document.body.append(m);
    const r = anchor?.getBoundingClientRect?.() || { left: innerWidth / 2, bottom: innerHeight / 2, top: innerHeight / 2 };
    const mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(6, Math.min(innerWidth - mw - 6, r.left)) + 'px';
    m.style.top = (r.bottom + mh + 6 < innerHeight ? r.bottom + 4 : Math.max(6, r.top - mh - 4)) + 'px';
    m.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'pin') A.togglePin(p, !pinned);
      else if (a === 'add') addChannel(b.dataset.g, p);
      else if (a === 'addnew') { const g = addGroup(prompt(t('Name of the new group'), info.label.split(' ')[0]) || t('Group')); addChannel(g.id, p); }
      else if (a === 'browse') openBrowser({ select: p });
      else if (a === 'copy') navigator.clipboard?.writeText(p);
      closeMenu();
    });
    m.querySelector('button')?.focus();
    setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escKey, true); });
  }

  /* ---------- Kanal-Browser ---------- */
  // Zustand des Kanal-Browsers: ausgewählter Kanal, Tabellenzeilen je PUI, Vorschau-Widgets,
  // vorgewählte Zielgruppe und Sortierung.
  const CB = { sel: null, rows: new Map(), widgets: [], pickGroup: null, order: 'group' };
  // Kanal-Browser öffnen. o.select: diesen Kanal anwählen; o.group: Zielgruppe für „Hinzufügen“.
  function openBrowser(o = {}) {
    const m = $('#mCh'); m.hidden = false; CB.pickGroup = o.group || null;
    if (!m.dataset.built) buildBrowser();
    fillGroupSelects();
    if (o.select) { $('#cbQ').value = ''; $('#cbSys').value = ''; renderList(); select(o.select); CB.rows.get(o.select)?.scrollIntoView?.({ block: "center" }); }
    else { renderList(); if (!CB.sel) select(A.channels()[0]); }
    $('#cbQ').focus();
  }
  function closeBrowser() { $('#mCh').hidden = true; CB.widgets = []; }
  // Einmaliger Aufbau des Browsers: Filter, Tastatursteuerung (Pfeiltasten, Escape), Klicks.
  function buildBrowser() {
    const m = $('#mCh'); m.dataset.built = '1';
    $('#cbSys').innerHTML = `<option value="">${t('All subsystems')}</option>` + A.groups.map(([id, title]) => `<option value="${id}">${esc(t(title))}</option>`).join('');
    for (const id of ['#cbQ', '#cbSys', '#cbLive', '#cbPinned', '#cbSort']) $(id).addEventListener('input', renderList);
    $('#cbClose').onclick = closeBrowser;
    m.addEventListener('pointerdown', e => { if (e.target === m) closeBrowser(); });
    m.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeBrowser(); e.stopPropagation(); }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.closest('.cblist,#cbQ')) {
        const vis = [...CB.rows.values()].filter(r => !r.hidden), i = vis.findIndex(r => r.dataset.p === CB.sel);
        const n = vis[Math.max(0, Math.min(vis.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) { select(n.dataset.p); n.scrollIntoView?.({ block: "nearest" }); e.preventDefault(); }
      }
    });
    $('#cbBody').addEventListener('click', e => { const r = e.target.closest('tr[data-p]'); if (r) select(r.dataset.p); });
  }
  // Tabelle nach Suchtext, Subsystem, „nur live“, „nur angeheftet“ filtern und sortieren.
  function renderList() {
    const q = $('#cbQ').value.trim().toLowerCase(), sys = $('#cbSys').value, live = $('#cbLive').checked, pin = $('#cbPinned').checked, sort = $('#cbSort').value;
    let ps = A.channels().filter(p => {
      const i = A.ctx.info(p);
      if (sys && i.group !== sys) return false;
      if (pin && !A.pinned(p)) return false;
      if (live && !A.raw(p)) return false;
      return !q || (p + ' ' + i.label + ' ' + (i.name || '') + ' ' + (i.desc || '') + ' ' + t(A.groups.find(g => g[0] === i.group)?.[1] || '')).toLowerCase().includes(q);
    });
    const gi = p => A.groups.findIndex(g => g[0] === A.ctx.info(p).group);
    if (sort === 'group') ps.sort((a, b) => gi(a) - gi(b) || a.localeCompare(b));
    else if (sort === 'name') ps.sort((a, b) => A.ctx.info(a).label.localeCompare(A.ctx.info(b).label));
    else if (sort === 'age') ps.sort((a, b) => (A.ctx.read(a).age) - (A.ctx.read(b).age));
    else ps.sort();
    const body = $('#cbBody'); body.textContent = ''; CB.rows.clear();
    for (const p of ps) {
      const i = A.ctx.info(p), tr = document.createElement('tr'); tr.dataset.p = p; tr.tabIndex = -1;
      tr.innerHTML = `<td class="pin">${A.pinned(p) ? '<i title="' + esc(t('In Graphs')) + '"></i>' : ''}</td><td><span class="cn">${esc(i.label)}</span><code>${p}</code></td><td class="p">${esc(t(A.groups.find(g => g[0] === i.group)?.[1] || ''))}</td><td class="v"></td><td class="age"></td>`;
      if (p === CB.sel) tr.classList.add('sel');
      body.append(tr); CB.rows.set(p, tr);
    }
    $('#cbCount').textContent = t('{0} of {1} channels', ps.length, A.channels().length);
    tickBrowser(Date.now(), true);
  }
  // Alter in ms als kurzer Text (s, min, h).
  function fmtAge(ms) { if (!isFinite(ms)) return '-'; const s = ms / 1000; return s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h'; }
  // Kanal p im Browser auswählen und die Detailansicht aufbauen: Wert-Widget, 3-h-Verlauf,
  // Metadaten, Rohwert, Empfangsalter und Schaltflächen zum Anheften/Hinzufügen.
  function select(p) {
    if (!p) return; CB.sel = p;
    for (const [k, r] of CB.rows) r.classList.toggle('sel', k === p);
    const i = A.ctx.info(p), d = $('#cbDetail'), pinned = A.pinned(p);
    const views = ['value', 'graph', 'bar', 'gauge', 'dial', 'state'];
    d.innerHTML = `<h3>${esc(i.label)}</h3><code>${p}${i.name && i.name !== i.label ? ' · ' + esc(i.name) : ''}</code>
      <div class="cbw"></div><div class="cbg"></div>
      <dl><dt>${t('Subsystem')}</dt><dd>${esc(t(A.groups.find(g => g[0] === i.group)?.[1] || ''))} (${esc(i.cat || '-')})</dd>
      <dt>${t('Unit')}</dt><dd>${esc(i.unit || '-')}</dd><dt>${t('Raw value')}</dt><dd class="cbraw">-</dd><dt>${t('Received')}</dt><dd class="cbage">-</dd>
      <dt>${t('Description')}</dt><dd>${esc(i.desc || '-')}</dd></dl>
      <div class="cbact"><button class="btn" data-a="pin">${pinned ? t('Remove from Graphs') : t('Graph it (Graphs panel)')}</button></div>
      <div class="cbadd"><label>${t('Add to dashboard')}</label><select class="cbgrp"></select><select class="cbview">${views.map(v => `<option value="${v}"${v === root.ISSW.defaultView(i.kind) ? ' selected' : ''}>${t(VIEW_NAMES[v])}</option>`).join('')}</select><button class="btn" data-a="add">${t('Add')}</button></div>
      <div class="note cbmsg" role="status"></div>`;
    fillGroupSelects();
    const w1 = root.ISSW.make(root.ISSW.defaultView(i.kind), p, A.ctx), w2 = root.ISSW.make('graph', p, A.ctx, { span: 3 * 3600e3 });
    d.querySelector('.cbw').append(w1.el); d.querySelector('.cbg').append(w2.el); CB.widgets = [w1, w2];
    w1.update(Date.now(), true); w2.update(Date.now(), true);
    d.querySelector('[data-a="pin"]').onclick = () => { A.togglePin(p, !A.pinned(p)); select(p); };
    d.querySelector('[data-a="add"]').onclick = () => {
      let g = d.querySelector('.cbgrp').value;
      if (g === '+') g = addGroup(prompt(t('Name of the new group'), t('Group')) || t('Group')).id;
      addChannel(g, p, d.querySelector('.cbview').value);
      d.querySelector('.cbmsg').textContent = t('Added to “{0}”.', DASH.groups.find(x => x.id === g)?.title || '');
      CB.pickGroup = g;
    };
    tickBrowser(Date.now(), true);
  }
  // Gruppenauswahlen mit den aktuellen Dashboard-Gruppen füllen (plus „Neue Gruppe…“).
  function fillGroupSelects() {
    for (const s of document.querySelectorAll('.cbgrp')) {
      s.innerHTML = DASH.groups.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('') + `<option value="+">${t('New group…')}</option>`;
      if (CB.pickGroup) s.value = CB.pickGroup;
    }
  }
  // Laufende Aktualisierung des Browsers: nur sichtbare Zeilen (außer all = true), Vorschau-Widgets
  // und Rohwert/Alter des ausgewählten Kanals. Kanäle, die NASA mit Wert 0 und Zeitstempel 0
  // ausliefert, gelten als „nicht veröffentlicht“.
  function tickBrowser(now, all = false) {
    if ($('#mCh').hidden) return;
    const box = $('#cbList'), top = box.scrollTop, bottom = top + box.clientHeight;
    for (const [p, tr] of CB.rows) {
      if (!all && (tr.offsetTop + tr.offsetHeight < top || tr.offsetTop > bottom)) continue;
      const r = A.ctx.read(p, now), v = tr.children[3], a = tr.children[4], txt = r.text + (r.unit ? ' ' + r.unit : '');
      if (v.textContent !== txt) v.textContent = txt;
      const age = r.ns ? t('not published') : fmtAge(r.age); if (a.textContent !== age) a.textContent = age;
      tr.classList.toggle('fresh', !!r.fresh);
    }
    for (const w of CB.widgets) w.update(now);
    if (CB.sel) {
      const raw = A.raw(CB.sel), d = $('#cbDetail'), r = A.ctx.read(CB.sel, now);
      const rv = d.querySelector('.cbraw'), ag = d.querySelector('.cbage');
      if (rv) rv.textContent = raw ? String(raw.raw) + (raw.source ? ' · ' + raw.source : '') : '-';
      if (ag) ag.textContent = r.ns ? t('not published by NASA (value 0, timestamp 0)') : raw ? t('{0} ago', fmtAge(r.age)) : t('no reading yet');
    }
  }

  /* ---------- Dashboard ---------- */
  const DW = new Map();            // Widget-ID -> { cfg, el, w (ISSW-Widget) }
  const HOME = new Map();          // verschobenes Element -> Platzhalter-Kommentar an seiner Ursprungsstelle
  let editing = false, open = false;
  // Neue Dashboard-Gruppe anlegen und speichern.
  function addGroup(title) { const g = { id: uid(), title, widgets: [] }; DASH.groups.push(g); saveDash(); if (open) render(); fillGroupSelects(); return g; }
  // Kanal p als Widget in Gruppe gid aufnehmen (Darstellung view oder die passende Vorgabe).
  function addChannel(gid, p, view) {
    const g = DASH.groups.find(x => x.id === gid) || DASH.groups[0] || addGroup(t('Group'));
    const kind = A.ctx.info(p).kind;
    g.widgets.push({ id: uid(), type: 'channel', p, view: view || root.ISSW.defaultView(kind), size: view === 'graph' ? 'm' : 's' });
    saveDash(); if (open) render();
  }
  // Sonder-Widget (3D-Ansicht, Karte oder Seitenpanel) in die erste Gruppe aufnehmen.
  function addSpecial(type, extra = {}) {
    const g = DASH.groups[0] || addGroup(t('Station'));
    g.widgets.push({ id: uid(), type, size: type === 'view3d' ? 'x' : type === 'map' ? 'w' : 'l', ...extra }); saveDash(); render();
  }
  // Sonder-Widgets verschieben echte Seitenelemente (3D-Ansicht, Karte, Panels) ins Dashboard.
  // An der alten Stelle bleibt ein Kommentar als Platzhalter, damit sie zurückkehren können.
  function moveHome(el) { const h = HOME.get(el); if (h) { h.replaceWith(el); HOME.delete(el); } }
  function moveInto(el, box) { if (!el) return; if (!HOME.has(el)) { const h = document.createComment('home'); el.before(h); HOME.set(el, h); } box.append(el); }
  function restoreAll() { for (const el of [...HOME.keys()]) moveHome(el); }
  // Dashboard ein- oder ausblenden; beim Schließen kehren alle verschobenen Elemente zurück.
  function toggleDashboard(on = !open) {
    open = on; const app = $('#app'), d = $('#dash');
    if (open) { d.hidden = false; app.classList.add('dashing'); render(); }
    else { restoreAll(); d.hidden = true; app.classList.remove('dashing'); DW.clear(); $('#dashGroups').textContent = ''; }
    $('#bDash')?.setAttribute('aria-pressed', String(open));
    A.onLayout();
  }
  // Titel eines Sonder-Widgets.
  function specialTitle(c) {
    if (c.type === 'view3d') return t('3D station view');
    if (c.type === 'map') return t('Ground track');
    if (c.type === 'panel') return t((A.panels().find(p => p[0] === c.panel) || [0, c.panel])[1]);
    return '';
  }
  // Baut das Dashboard komplett neu auf (nach jeder Änderung). Jedes Seitenelement kann nur in
  // einem Widget gleichzeitig stehen; weitere Widgets desselben Elements zeigen einen Hinweis.
  function render() {
    restoreAll(); DW.clear();
    const box = $('#dashGroups'); box.textContent = ''; box.classList.toggle('editing', editing);
    $('#dashEdit').setAttribute('aria-pressed', String(editing)); $('#dashEdit').textContent = editing ? t('Done') : t('Edit layout');
    const used = new Set();
    for (const g of DASH.groups) {
      const sec = document.createElement('section'); sec.className = 'dg' + (g.collapsed ? ' collapsed' : ''); sec.dataset.g = g.id;
      sec.innerHTML = `<header class="dgh"${editing ? ' draggable="true"' : ''}><button class="dgc" title="${esc(t('Collapse / expand'))}" aria-expanded="${!g.collapsed}">${g.collapsed ? '+' : '−'}</button>
        <h3${editing ? ' contenteditable="true" spellcheck="false"' : ''}>${esc(g.title)}</h3><span class="dgn">${g.widgets.length}</span><span class="grow"></span>
        <button class="btn sm" data-a="addch" title="${esc(t('Pick channels in the channel browser'))}">+ ${t('Channel')}</button>
        ${editing ? `<button class="btn sm" data-a="up" title="${esc(t('Move group up'))}">↑</button><button class="btn sm" data-a="down" title="${esc(t('Move group down'))}">↓</button><button class="btn sm warn" data-a="del" title="${esc(t('Delete group'))}">×</button>` : ''}</header>
        <div class="dgb"></div>`;
      box.append(sec);
      const body = sec.querySelector('.dgb');
      if (!g.widgets.length) body.innerHTML = `<div class="note dempty">${t('Empty group. Use “+ Channel”, or click any channel in the side panels and choose this group.')}</div>`;
      for (const c of g.widgets) {
        const card = document.createElement('div'); card.className = 'dw size-' + (c.size || 's') + ' t-' + c.type; card.dataset.id = c.id; if (editing) card.draggable = true;
        let w = null;
        if (c.type === 'channel') {
          if (!A.ctx.info(c.p)) continue;
          w = root.ISSW.make(c.view || 'value', c.p, A.ctx, { span: c.span }); card.append(w.el); w.setPinned(A.pinned(c.p));
          w.el.title = c.p + ' · ' + (A.ctx.info(c.p).desc || '');
        } else {
          card.innerHTML = `<div class="wh"><span class="wl">${esc(specialTitle(c))}</span></div><div class="dwb"></div>`;
          const target = c.type === 'view3d' ? A.elements.view3d : c.type === 'map' ? A.elements.map : c.type === 'panel' ? document.getElementById(c.panel) : null;
          if (target && !used.has(target)) { used.add(target); moveInto(target, card.querySelector('.dwb')); target.classList.remove('collapsed'); }
          else card.querySelector('.dwb').innerHTML = `<div class="note">${t('Shown in another widget of this dashboard.')}</div>`;
        }
        if (editing) {
          const tb = document.createElement('div'); tb.className = 'dwt';
          tb.innerHTML = (c.type === 'channel' ? `<select data-a="view" title="${esc(t('Display'))}">${root.ISSW.VIEWS.map(v => `<option value="${v}"${v === c.view ? ' selected' : ''}>${t(VIEW_NAMES[v])}</option>`).join('')}</select>` : '')
            + `<button data-a="size" title="${esc(t('Size'))}: ${esc(t(SIZE_NAMES[c.size || 's']))}">${(c.size || 's').toUpperCase()}</button><button data-a="rm" title="${esc(t('Remove'))}">×</button>`;
          card.append(tb);
        }
        body.append(card); DW.set(c.id, { cfg: c, el: card, w });
        w?.update(Date.now(), true);
      }
    }
    A.onLayout();
  }
  // Sucht ein Widget über alle Gruppen: [Gruppe, Index] oder [null, -1].
  function findWidget(id) { for (const g of DASH.groups) { const i = g.widgets.findIndex(w => w.id === id); if (i >= 0) return [g, i]; } return [null, -1]; }
  // Ereignisbehandlung des Dashboards (einmalig): Einklappen, Größe, Entfernen, Gruppen
  // verschieben/löschen, Darstellung wählen, Gruppentitel bearbeiten, Ziehen und Ablegen,
  // sowie die Schaltflächen der Dashboard-Kopfzeile.
  function bindDash() {
    const box = $('#dashGroups');
    box.addEventListener('click', e => {
      const b = e.target.closest('button'), sec = e.target.closest('.dg'), g = sec && DASH.groups.find(x => x.id === sec.dataset.g);
      if (b?.classList.contains('dgc') && g) { g.collapsed = !g.collapsed; saveDash(); render(); return; }
      const card = e.target.closest('.dw');
      if (b && card) {
        const [wg, i] = findWidget(card.dataset.id); if (!wg) return; const c = wg.widgets[i];
        if (b.dataset.a === 'rm') wg.widgets.splice(i, 1);
        else if (b.dataset.a === 'size') c.size = SIZES[(SIZES.indexOf(c.size || 's') + 1) % SIZES.length];
        saveDash(); render(); return;
      }
      if (b && g) {
        const gi = DASH.groups.indexOf(g);
        if (b.dataset.a === 'addch') { openBrowser({ group: g.id }); return; }
        if (b.dataset.a === 'up' && gi > 0) DASH.groups.splice(gi - 1, 0, ...DASH.groups.splice(gi, 1));
        if (b.dataset.a === 'down' && gi < DASH.groups.length - 1) DASH.groups.splice(gi + 1, 0, ...DASH.groups.splice(gi, 1));
        if (b.dataset.a === 'del' && (!g.widgets.length || confirm(t('Delete group “{0}” and its {1} widgets?', g.title, g.widgets.length)))) DASH.groups.splice(gi, 1);
        saveDash(); render(); return;
      }
      if (!editing && card) { const c = findWidget(card.dataset.id); const cfg = c[0]?.widgets[c[1]]; if (cfg?.type === 'channel' && !e.target.closest('.view,.mapwrap,.panel')) channelMenu(cfg.p, card); }
    });
    box.addEventListener('change', e => {
      const s = e.target.closest('select[data-a="view"]'); if (!s) return;
      const [g, i] = findWidget(s.closest('.dw').dataset.id); if (!g) return; g.widgets[i].view = s.value; if (s.value === 'graph' && g.widgets[i].size === 's') g.widgets[i].size = 'm'; saveDash(); render();
    });
    box.addEventListener('focusout', e => {
      const h = e.target.closest('.dgh h3'); if (!h) return;
      const g = DASH.groups.find(x => x.id === h.closest('.dg').dataset.g); const v = h.textContent.trim(); if (g && v && v !== g.title) { g.title = v; saveDash(); }
    });
    box.addEventListener('keydown', e => { if (e.target.closest('.dgh h3') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
    // Ziehen und Ablegen (nur im Bearbeitungsmodus): Widgets innerhalb und zwischen Gruppen,
    // Gruppen über ihre Kopfzeile.
    let drag = null;
    box.addEventListener('dragstart', e => {
      const card = e.target.closest('.dw'), head = e.target.closest('.dgh');
      if (card) drag = { kind: 'w', id: card.dataset.id }; else if (head) drag = { kind: 'g', id: head.closest('.dg').dataset.g }; else return;
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag.id); (card || head.closest('.dg')).classList.add('dragging');
    });
    box.addEventListener('dragend', () => { drag = null; box.querySelectorAll('.dragging,.drop-before,.drop-into').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-into')); });
    box.addEventListener('dragover', e => {
      if (!drag) return; e.preventDefault();
      box.querySelectorAll('.drop-before,.drop-into').forEach(x => x.classList.remove('drop-before', 'drop-into'));
      if (drag.kind === 'w') { const c = e.target.closest('.dw'); if (c && c.dataset.id !== drag.id) c.classList.add('drop-before'); else e.target.closest('.dgb')?.classList.add('drop-into'); }
      else e.target.closest('.dg')?.classList.add('drop-before');
    });
    box.addEventListener('drop', e => {
      if (!drag) return; e.preventDefault();
      if (drag.kind === 'w') {
        const [g0, i0] = findWidget(drag.id); if (!g0) return; const [cfg] = g0.widgets.splice(i0, 1);
        const c = e.target.closest('.dw'), sec = e.target.closest('.dg'); const g1 = DASH.groups.find(x => x.id === sec?.dataset.g) || g0;
        if (c && c.dataset.id !== drag.id) { const [, i1] = findWidget(c.dataset.id); g1.widgets.splice(Math.max(0, i1), 0, cfg); } else g1.widgets.push(cfg);
      } else {
        const sec = e.target.closest('.dg'); if (!sec || sec.dataset.g === drag.id) return;
        const i0 = DASH.groups.findIndex(g => g.id === drag.id), [g] = DASH.groups.splice(i0, 1), i1 = DASH.groups.findIndex(x => x.id === sec.dataset.g); DASH.groups.splice(i1, 0, g);
      }
      saveDash(); render();
    });
    $('#dashEdit').onclick = () => { editing = !editing; render(); };
    $('#dashAddGroup').onclick = () => { addGroup(t('Group {0}', DASH.groups.length + 1)); editing = true; render(); };
    $('#dashAddCh').onclick = () => openBrowser({ group: DASH.groups[DASH.groups.length - 1]?.id });
    $('#dashAdd').onchange = e => { const v = e.target.value; e.target.value = ''; if (!v) return; if (v.startsWith('panel:')) addSpecial('panel', { panel: v.slice(6) }); else addSpecial(v); };
    $('#dashReset').onclick = () => { if (confirm(t('Replace this dashboard with the default layout?'))) { DASH = defaultDash(); saveDash(); render(); } };
    $('#dashClose').onclick = () => toggleDashboard(false);
  }
  // Auswahlliste „+ Ansicht hinzufügen…“ füllen (3D, Karte, alle Panels).
  function fillAddMenu() {
    $('#dashAdd').innerHTML = `<option value="">${t('+ Add view…')}</option><option value="view3d">${t('3D station view')}</option><option value="map">${t('Ground track')}</option>`
      + `<optgroup label="${esc(t('Panels'))}">` + A.panels().map(([id, title]) => `<option value="panel:${id}">${esc(t(title))}</option>`).join('') + '</optgroup>';
  }
  // Pro Bild von der Seite aufgerufen: Browser und sichtbare Dashboard-Widgets aktualisieren.
  function tick(now) {
    tickBrowser(now);
    if (!open) return;
    for (const { w, el } of DW.values()) if (w && el.offsetParent) w.update(now);
  }
  // Nach Änderungen an angehefteten Kanälen: Browser und Pin-Markierungen neu zeichnen.
  function refresh() {
    if (!$('#mCh').hidden) { renderList(); if (CB.sel) select(CB.sel); }
    for (const { w, cfg } of DW.values()) if (w) w.setPinned(A.pinned(cfg.p));
  }
  // Nach einem Sprachwechsel: alle Texte neu aufbauen.
  function relang() {
    const m = $('#mCh'); delete m.dataset.built; if (!m.hidden) { buildBrowser(); renderList(); if (CB.sel) select(CB.sel); }
    fillAddMenu(); if (open) render();
  }
  // Einstieg: Schnittstelle der Seite übernehmen, Layout laden und Schaltflächen verbinden.
  function init(api) {
    A = api; DASH = load('iss.dash', null);
    if (!DASH || !Array.isArray(DASH.groups)) DASH = defaultDash();
    bindDash(); fillAddMenu();
    $('#bDash')?.addEventListener('click', () => toggleDashboard());
    $('#bTlm')?.addEventListener('click', () => openBrowser());
  }
  // Öffentliche Schnittstelle (window.ISSWorkspace).
  root.ISSWorkspace = { init, channelMenu, openBrowser, closeBrowser, toggleDashboard, tick, refresh, relang, addChannel, addGroup, get dash() { return DASH; }, get open() { return open; } };
})(globalThis);
