// Kurze Hinweise am unteren Rand, optional mit Aktion („Rückgängig“).
import { esc } from './dom.js';

const root = document.getElementById('toast-root');
let current = null;

export function toast(message, { action = null, onAction = null, duration = 2600 } = {}) {
  if (current) current.dismiss(true);
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button class="toast-action">${esc(action)}</button>` : ''}`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const handle = {
    dismiss(instant = false) {
      clearTimeout(timer);
      if (current === handle) current = null;
      el.classList.remove('show');
      setTimeout(() => el.remove(), instant ? 0 : 220);
    },
  };
  const timer = setTimeout(() => handle.dismiss(), action ? Math.max(duration, 4500) : duration);
  el.querySelector('.toast-action')?.addEventListener('click', () => {
    handle.dismiss();
    onAction?.();
  });
  current = handle;
  return handle;
}
