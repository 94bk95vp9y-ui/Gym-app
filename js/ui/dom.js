// Kleine DOM-Helfer, die überall gebraucht werden.
export { escapeHtml as esc } from '../core/format.js';

export const qs = (sel, parent = document) => parent.querySelector(sel);
export const qsa = (sel, parent = document) => [...parent.querySelectorAll(sel)];

export const cls = (...names) => names.filter(Boolean).join(' ');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => reducedMotion.matches;

// Zentrale Aktionen: Elemente tragen data-action="name", die Ansichten melden
// ihre Handler hier an. Ein einziger Klick-Listener für die ganze App – kein
// Neubinden nach jedem Neuaufbau.
const actions = Object.create(null);
export function registerActions(map) {
  Object.assign(actions, map);
}
export function runAction(name, el, event) {
  const fn = actions[name];
  if (!fn) return false;
  fn(el, event);
  return true;
}

const inputs = Object.create(null);
export function registerInputs(map) {
  Object.assign(inputs, map);
}
export function runInput(name, el, event) {
  inputs[name]?.(el, event);
}

// Ein Element in seiner Höhe zusammenfallen lassen und danach entfernen.
export function collapseAway(el, done) {
  if (!el || prefersReducedMotion()) { done(); return; }
  const h = el.offsetHeight;
  el.style.height = `${h}px`;
  el.style.overflow = 'hidden';
  el.style.transition = 'height .22s ease, opacity .18s ease';
  requestAnimationFrame(() => {
    el.style.height = '0px';
    el.style.opacity = '0';
  });
  setTimeout(done, 230);
}

export function popIn(el) {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove('pop-in');
  void el.offsetWidth;
  el.classList.add('pop-in');
  el.addEventListener('animationend', () => el.classList.remove('pop-in'), { once: true });
}
