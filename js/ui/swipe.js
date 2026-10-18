// Nach links wischen zum Löschen – wie in den Listen von iOS. Ein kurzer
// Wisch legt den roten Knopf frei, ein langer löscht direkt. Senkrechtes
// Scrollen bleibt unberührt: entschieden wird erst nach ein paar Pixeln.
//
// Aufbau: <div class="swipe-row"><button class="swipe-del">…</button>
//           <div class="swipe-body">…</div></div>
import { qsa } from './dom.js';
import { haptic } from './haptics.js';

const OPEN = 84;

function setX(row, x, animate = false) {
  const body = row.querySelector('.swipe-body');
  body.style.transition = animate ? 'transform .32s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
  body.style.transform = x ? `translateX(${x}px)` : '';
  row.classList.toggle('swiped', x < 0);
  row.style.setProperty('--reveal', `${Math.min(1, -x / OPEN)}`);
}

export function closeSwipes(except = null, scope = document) {
  qsa('.swipe-row.swiped', scope).forEach((r) => { if (r !== except) setX(r, 0, true); });
}

export function enableSwipeDelete(container, { onDelete }) {
  if (!container || container.dataset.swipe) return;
  container.dataset.swipe = '1';
  let g = null;
  let suppressClick = false;

  container.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const row = e.target.closest('.swipe-row');
    if (!row || e.target.closest('.swipe-del')) return;
    closeSwipes(row, container);
    const body = row.querySelector('.swipe-body');
    const m = /translateX\((-?[\d.]+)px\)/.exec(body.style.transform || '');
    g = { row, id: e.pointerId, x0: e.clientX, y0: e.clientY, base: m ? +m[1] : 0, x: 0, active: false, w: row.clientWidth };
  });

  container.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.active) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }
      if (Math.abs(dx) < 10) return;
      g.active = true;
      try { g.row.setPointerCapture(e.pointerId); } catch { /* egal */ }
    }
    let x = Math.min(0, g.base + dx);
    // Über die volle Breite hinaus wird es zäh
    if (x < -g.w * 0.75) x = -g.w * 0.75 + (x + g.w * 0.75) * 0.3;
    g.x = x;
    const far = x < -g.w * 0.55;
    if (far !== g.row.classList.contains('far')) {
      g.row.classList.toggle('far', far);
      if (far) haptic();
    }
    setX(g.row, x);
  });

  const end = (e) => {
    if (!g || (e && e.pointerId !== g.id)) return;
    const { row, active, x, w } = g;
    g = null;
    if (!active) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 60);
    row.classList.remove('far');
    if (x < -w * 0.55) {
      setX(row, -w, true);
      setTimeout(() => onDelete(row), 180);
    } else if (x < -OPEN * 0.5) {
      setX(row, -OPEN, true);
    } else {
      setX(row, 0, true);
    }
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);

  // Nach einem Wisch kein versehentliches Antippen auslösen
  container.addEventListener('click', (e) => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); return; }
    const del = e.target.closest('.swipe-del');
    if (del) {
      e.stopPropagation();
      onDelete(del.closest('.swipe-row'));
      return;
    }
    // Antippen irgendwo anders schließt offene Zeilen
    if (qsa('.swipe-row.swiped', container).length && !e.target.closest('.swipe-row.swiped')) closeSwipes(null, container);
  }, true);
}
