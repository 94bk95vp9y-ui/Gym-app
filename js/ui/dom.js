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

// Eine CSS-Animation neu starten, ohne den Browser zum sofortigen Layout zu
// zwingen (der übliche Trick mit offsetWidth vermisst die ganze Seite neu –
// bei jedem Abhaken spürbar). Läuft die Animation noch, beginnt sie von
// vorn; sonst kommt die Klasse ein Bild später wieder dazu.
export function replay(el, cls) {
  if (!el) return;
  if (!el.classList.contains(cls)) { el.classList.add(cls); return; }
  const running = el.getAnimations ? el.getAnimations().filter((a) => a.animationName) : [];
  if (running.length) {
    running.forEach((a) => { a.currentTime = 0; a.play(); });
    return;
  }
  el.classList.remove(cls);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add(cls)));
}

export function popIn(el) {
  if (!el || prefersReducedMotion()) return;
  replay(el, 'pop-in');
  el.addEventListener('animationend', () => el.classList.remove('pop-in'), { once: true });
}

// Zahlen hochzählen lassen (Zusammenfassung): Elemente mit data-count
export function countUp(scope, ms = 700) {
  if (prefersReducedMotion()) return;
  qsa('[data-count]', scope).forEach((el) => {
    const target = +el.dataset.count;
    if (!(target > 1)) return;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - p) ** 3;
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    el.textContent = '0';
    requestAnimationFrame(tick);
  });
}

// Ziffern wie bei iOS-Timern weiterrollen: nur geänderte Zeichen bewegen sich.
export function rollText(el, text) {
  if (!el) return;
  const old = el.dataset.roll ?? el.textContent;
  if (old === text) return;
  el.dataset.roll = text;
  if (prefersReducedMotion() || old.length !== text.length) {
    el.textContent = text;
    return;
  }
  const spans = el.children.length === text.length ? [...el.children] : null;
  if (!spans) {
    el.innerHTML = [...text].map((c) => `<span class="roll-ch">${c}</span>`).join('');
    return;
  }
  [...text].forEach((c, i) => {
    if (spans[i].textContent === c) return;
    spans[i].textContent = c;
    replay(spans[i], 'roll');
  });
}

// Titel in einer Kopfleiste: mittig, wenn genug Platz ist – sonst mittig
// zwischen den Knöpfen (wie in iOS), notfalls mit Auslassungspunkten.
export function placeTitle(bar, title, left, right, gap = 12) {
  if (!bar || !title) return;
  const W = bar.clientWidth;
  const l = left?.offsetWidth || 0;
  const r = right?.offsetWidth || 0;
  const pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
  title.style.left = '';
  title.style.right = '';
  title.classList.remove('between');
  const need = title.scrollWidth;
  const side = Math.max(l, r) + pad + gap;
  if (need <= W - 2 * side) {
    bar.style.setProperty('--side', `${Math.max(l, r)}px`);
    return;
  }
  title.classList.add('between');
  title.style.left = `${pad + l + gap}px`;
  title.style.right = `${pad + r + gap}px`;
}
