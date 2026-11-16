// window-frame.mjs: macht ein festes Fenster (position: fixed) verschiebbar und in der Größe änderbar.
// Verschieben: an der Kopfleiste ziehen (nicht an Eingabefeldern, Auswahllisten und Knöpfen).
// Größe: an jeder Kante und jeder Ecke ziehen. Doppelklick auf eine freie Stelle der Kopfleiste stellt
// Lage und Größe zurück. Lage und Größe werden in localStorage gespeichert und beim Ändern der
// Fenstergröße des Browsers in den sichtbaren Bereich zurückgeholt.
// Während des Ziehens bekommen eingebettete iframes (YouTube) keine Mausereignisse, sonst verliert das
// Fenster den Zeiger, sobald er über das Video läuft.

export const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/* Neue Lage und Größe aus dem Ausgangsrechteck r = {x, y, w, h}, der Zeigerbewegung (dx, dy) und der
   gezogenen Kante ('move' oder eine aus EDGES). Grenzen: Mindestgröße minW × minH, Fenster vollständig im
   Bereich vw × vh. Rein rechnerisch, damit es ohne Browser prüfbar ist. */
export function frameRect(r, edge, dx, dy, { minW = 320, minH = 200, vw = 1e9, vh = 1e9 } = {}) {
  let { x, y, w, h } = r;
  if (edge === 'move') {
    x = Math.min(Math.max(0, x + dx), Math.max(0, vw - w));
    y = Math.min(Math.max(0, y + dy), Math.max(0, vh - h));
    return { x, y, w, h };
  }
  if (edge.includes('e')) w = Math.min(Math.max(minW, w + dx), vw - x);
  if (edge.includes('s')) h = Math.min(Math.max(minH, h + dy), vh - y);
  if (edge.includes('w')) { const nx = Math.min(Math.max(0, x + dx), x + w - minW); w += x - nx; x = nx; }
  if (edge.includes('n')) { const ny = Math.min(Math.max(0, y + dy), y + h - minH); h += y - ny; y = ny; }
  return { x, y, w, h };
}

// Rechteck in den sichtbaren Bereich holen; zu große Fenster werden verkleinert.
export function clampRect(r, { minW = 320, minH = 200, vw, vh }) {
  const w = Math.max(Math.min(minW, vw), Math.min(r.w, vw)), h = Math.max(Math.min(minH, vh), Math.min(r.h, vh));
  return { x: Math.min(Math.max(0, r.x), vw - w), y: Math.min(Math.max(0, r.y), vh - h), w, h };
}

const CSS = `
.wf-edge{position:absolute;z-index:5}
.wf-n,.wf-s{left:8px;right:8px;height:6px;cursor:ns-resize}.wf-n{top:-3px}.wf-s{bottom:-3px}
.wf-e,.wf-w{top:8px;bottom:8px;width:6px;cursor:ew-resize}.wf-e{right:-3px}.wf-w{left:-3px}
.wf-ne,.wf-nw,.wf-se,.wf-sw{width:14px;height:14px}
.wf-ne{top:-3px;right:-3px;cursor:nesw-resize}.wf-sw{bottom:-3px;left:-3px;cursor:nesw-resize}
.wf-nw{top:-3px;left:-3px;cursor:nwse-resize}.wf-se{bottom:-3px;right:-3px;cursor:nwse-resize}
.wf-se::after{content:'';position:absolute;right:5px;bottom:5px;width:7px;height:7px;border-right:2px solid var(--line2,#1f4458);border-bottom:2px solid var(--line2,#1f4458)}
.wf-grab{cursor:move}
.wf-busy iframe{pointer-events:none}
.wf-busy,.wf-busy *{user-select:none}
`;
let styled = false;
// Elemente in der Kopfleiste, an denen nicht gezogen wird.
const INTERACTIVE = 'input,select,button,a,textarea,label,option';

/* win: das Fenster, handle: Element zum Verschieben (Kopfleiste), key: Schlüssel in localStorage.
   Gibt { reset(), fit(), rect() } zurück; fit() holt das Fenster nach dem Einblenden in den sichtbaren Bereich. */
export function makeFrame(win, handle, { key, minW = 320, minH = 200, onChange } = {}) {
  if (!styled) { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); styled = true; }
  const view = () => ({ vw: document.documentElement.clientWidth || innerWidth, vh: document.documentElement.clientHeight || innerHeight });
  const lim = () => ({ minW, minH, ...view() });
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
  const apply = r => {
    Object.assign(win.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', right: 'auto', bottom: 'auto' });
    onChange?.(r);
  };
  const current = () => { const b = win.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  const store = r => { try { localStorage.setItem(key, JSON.stringify(r)); } catch (e) {} };
  const valid = r => r && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(r[k]));
  if (valid(saved)) apply(clampRect(saved, lim()));

  for (const e of EDGES) { const d = document.createElement('div'); d.className = 'wf-edge wf-' + e; d.dataset.edge = e; win.append(d); }
  handle.classList.add('wf-grab');

  let drag = null;
  function start(ev, edge) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    drag = { edge, x0: ev.clientX, y0: ev.clientY, r: current(), id: ev.pointerId, el: ev.currentTarget };
    try { drag.el.setPointerCapture(ev.pointerId); } catch (e) {}
    document.documentElement.classList.add('wf-busy');
  }
  function move(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    apply(frameRect(drag.r, drag.edge, ev.clientX - drag.x0, ev.clientY - drag.y0, lim()));
  }
  function end(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    try { drag.el.releasePointerCapture(ev.pointerId); } catch (e) {}
    drag = null; document.documentElement.classList.remove('wf-busy'); store(current());
  }
  const bind = (el, edge) => {
    el.addEventListener('pointerdown', ev => { if (edge === 'move' && ev.target.closest(INTERACTIVE)) return; start(ev, edge); });
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };
  bind(handle, 'move');
  for (const d of win.querySelectorAll(':scope > .wf-edge')) bind(d, d.dataset.edge);

  function reset() {
    try { localStorage.removeItem(key); } catch (e) {}
    for (const k of ['left', 'top', 'width', 'height', 'right', 'bottom']) win.style[k] = '';
    onChange?.(current());
  }
  handle.addEventListener('dblclick', ev => { if (!ev.target.closest(INTERACTIVE)) reset(); });
  // Fenster des Browsers verkleinert: Kamerafenster sichtbar halten (nur wenn schon verschoben).
  const fit = () => { if (win.style.left && !win.hidden) apply(clampRect(current(), lim())); };
  addEventListener('resize', fit);
  return { reset, fit, rect: current };
}
