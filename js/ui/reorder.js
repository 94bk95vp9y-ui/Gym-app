// Sortieren per Ziehen am Griff. Die übrigen Zeilen weichen live aus; beim
// Loslassen meldet onReorder(von, nach).
import { qsa } from './dom.js';

export function enableReorder(container, { row = '.row', handle = '[data-drag-handle]', onReorder }) {
  if (!container || container.dataset.reorder) return;
  container.dataset.reorder = '1';
  container.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest(handle);
    if (!grip || !container.contains(grip)) return;
    const el = grip.closest(row);
    if (!el) return;
    e.preventDefault();
    const rows = qsa(row, container);
    const start = rows.indexOf(el);
    const startY = e.clientY;
    const h = el.getBoundingClientRect().height;
    let order = rows.map((_, i) => i);
    el.classList.add('drag-active');
    el.style.transition = 'none';

    function move(ev) {
      const dy = ev.clientY - startY;
      const min = -start * h;
      const max = (rows.length - 1 - start) * h;
      const clamped = Math.max(min - 10, Math.min(max + 10, dy));
      el.style.transform = `translateY(${clamped}px)`;
      const target = Math.max(0, Math.min(rows.length - 1, start + Math.round(dy / h)));
      const cur = order.indexOf(start);
      if (target === cur) return;
      order.splice(cur, 1);
      order.splice(target, 0, start);
      rows.forEach((r, i) => {
        if (i === start) return;
        const offset = (order.indexOf(i) - i) * h;
        r.style.transition = 'transform .2s ease';
        r.style.transform = offset ? `translateY(${offset}px)` : '';
      });
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.classList.remove('drag-active');
      rows.forEach((r) => { r.style.transform = ''; r.style.transition = ''; });
      const to = order.indexOf(start);
      if (to !== start) onReorder(start, to);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}
