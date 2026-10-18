// Zahlenfeld für das Training – ersetzt die iPhone-Tastatur: große Tasten,
// ± in sinnvollen Schritten und eine Haupttaste, die zum nächsten Feld springt
// oder den Satz abhakt. Die Ansicht entscheidet, was „Weiter“ bedeutet; das
// Zahlenfeld kümmert sich nur um die Eingabe.
import { Icon } from './icons.js';
import { haptic, HAP } from './haptics.js';

// ---------- Eingabelogik (ohne DOM, damit testbar) ----------
const MAX_INT_DIGITS = { decimal: 4, integer: 3 };

function toNumber(text) {
  const n = parseFloat(String(text || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function toText(n, decimal) {
  if (!decimal) return String(Math.round(n));
  const r = Math.round(n * 100) / 100;
  return String(r).replace('.', ',');
}

// state: { text, fresh } – fresh: der nächste Tastendruck ersetzt den Wert
// (wie markierter Text). opts: { decimal, step, fallback }
export function applyKey(state, key, { decimal = false, step = 1, fallback = '' } = {}) {
  let { text, fresh } = state;
  if (/^[0-9]$/.test(key)) {
    if (fresh || text === '0') text = '';
    const [int, frac] = text.split(',');
    if (frac !== undefined) {
      if (frac.length >= 2) return { text, fresh: false };
    } else if (int.length >= MAX_INT_DIGITS[decimal ? 'decimal' : 'integer']) {
      return { text, fresh: false };
    }
    return { text: text + key, fresh: false };
  }
  if (key === ',') {
    if (!decimal) return state;
    if (fresh || !text) return { text: '0,', fresh: false };
    if (text.includes(',')) return { text, fresh: false };
    return { text: `${text},`, fresh: false };
  }
  if (key === 'back') {
    if (fresh) return { text: '', fresh: false };
    return { text: text.slice(0, -1), fresh: false };
  }
  if (key === 'plus' || key === 'minus') {
    const base = text === '' ? toNumber(fallback) : toNumber(text);
    const next = Math.max(0, base + (key === 'plus' ? step : -step));
    return { text: next > 0 ? toText(next, decimal) : '', fresh: true };
  }
  return state;
}

// ---------- Oberfläche ----------
// opts: { host, value, decimal, step, label, primary: { label, icon }, onChange(text),
//         onPrimary(), onClose() }
let K = null;

function stepText(step, decimal) {
  return decimal ? toText(step, true) : String(step);
}

function html(o) {
  const digit = (d) => `<button class="kp-key" data-k="${d}">${HAP}${d}</button>`;
  return `
    <div class="kp-grid">
      ${digit(1)}${digit(2)}${digit(3)}
      <button class="kp-key kp-fn" data-k="minus" aria-label="Weniger">${HAP}−${stepText(o.step, o.decimal)}</button>
      ${digit(4)}${digit(5)}${digit(6)}
      <button class="kp-key kp-fn" data-k="plus" aria-label="Mehr">${HAP}+${stepText(o.step, o.decimal)}</button>
      ${digit(7)}${digit(8)}${digit(9)}
      <button class="kp-key kp-fn" data-k="back" aria-label="Löschen">${HAP}${Icon.backspace}</button>
      <button class="kp-key kp-fn" data-k="," ${o.decimal ? '' : 'disabled'} aria-label="Komma">${o.decimal ? HAP : ''},</button>
      ${digit(0)}
      <button class="kp-key kp-fn" data-k="hide" aria-label="Zahlenfeld schließen">${Icon.keyboardDown}</button>
      <button class="kp-key kp-primary" data-k="primary">${HAP}<span class="kp-primary-in">${o.primary?.icon || ''}<span>${o.primary?.label || 'Fertig'}</span></span></button>
    </div>`;
}

export function isKeypadOpen() { return !!K; }

export function openKeypad(opts) {
  const fresh = !K;
  if (!K) {
    const el = document.createElement('div');
    el.className = 'keypad';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Zahlenfeld');
    (opts.host || document.body).appendChild(el);
    K = { el, opts, state: { text: '', fresh: true } };
    el.addEventListener('click', onKey);
  }
  K.opts = opts;
  K.state = { text: opts.value ?? '', fresh: true };
  K.el.innerHTML = html(opts);
  if (fresh) {
    requestAnimationFrame(() => requestAnimationFrame(() => K?.el.classList.add('open')));
  }
  return K.el;
}

function onKey(e) {
  const b = e.target.closest('.kp-key');
  if (!b || b.disabled || !K) return;
  const key = b.dataset.k;
  haptic();
  if (key === 'hide') { closeKeypad(); return; }
  if (key === 'primary') { K.opts.onPrimary?.(); return; }
  const o = K.opts;
  K.state = applyKey(K.state, key, { decimal: o.decimal, step: o.step, fallback: o.fallback });
  o.onChange?.(K.state.text, K.state.fresh);
}

// Haupttaste umbenennen, ohne das Feld neu aufzubauen
export function setKeypadPrimary(primary) {
  if (!K) return;
  K.opts.primary = primary;
  const b = K.el.querySelector('[data-k="primary"] .kp-primary-in');
  if (b) b.innerHTML = `${primary.icon || ''}<span>${primary.label}</span>`;
}

export function keypadHeight() {
  return K ? K.el.getBoundingClientRect().height : 0;
}

export function closeKeypad({ silent = false } = {}) {
  if (!K) return;
  const { el, opts } = K;
  K = null;
  el.classList.remove('open');
  el.classList.add('closing');
  setTimeout(() => el.remove(), 320);
  if (!silent) opts.onClose?.();
}
