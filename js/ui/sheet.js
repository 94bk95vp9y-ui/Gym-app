// Sheets (Fenster von unten), Aktionsmenüs und Dialoge – nach iOS-Vorbild.
// Sheets lassen sich stapeln: ein zweites Sheet legt sich über das erste,
// das dahinter leicht zurücktritt.
import { esc, qs, prefersReducedMotion } from './dom.js';

const root = document.getElementById('sheet-root');
const stack = [];
let backdrop = null;

function ensureBackdrop() {
  if (backdrop) return backdrop;
  backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.addEventListener('click', () => {
    const top = stack[stack.length - 1];
    if (top && top.dismissible) top.close();
  });
  root.appendChild(backdrop);
  return backdrop;
}

function syncStack() {
  ensureBackdrop().classList.toggle('show', stack.length > 0);
  document.documentElement.classList.toggle('sheet-open', stack.length > 0);
  stack.forEach((s, i) => s.el.classList.toggle('behind', i < stack.length - 1));
}

function headerButton(btn, side) {
  if (!btn) return `<span class="sheet-hbtn-spacer ${side}"></span>`;
  const style = btn.style === 'primary' ? 'primary' : btn.style === 'destructive' ? 'destructive' : '';
  return `<button class="sheet-hbtn ${side} ${style}" data-sheet-btn="${side}" ${btn.disabled ? 'disabled' : ''}>${esc(btn.label)}</button>`;
}

export function openSheet({
  title = '', body = '', footer = '', left = null, right, full = false, className = '',
  onMount = null, onClose = null, dismissible = true,
} = {}) {
  const el = document.createElement('section');
  el.className = `sheet ${full ? 'full' : ''} ${className}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  const ctl = {
    el,
    dismissible,
    closed: false,
    get body() { return qs('.sheet-body', el); },
    setBody(html) {
      const b = qs('.sheet-body', el);
      const top = b.scrollTop;
      b.innerHTML = html;
      b.scrollTop = top;
    },
    setFooter(html) {
      const f = qs('.sheet-footer', el);
      f.innerHTML = html;
      f.hidden = !html;
    },
    setTitle(text) { qs('.sheet-title', el).textContent = text; },
    setRight(btn) { replaceButton('right', btn); },
    close(result) {
      if (ctl.closed) return;
      ctl.closed = true;
      const i = stack.indexOf(ctl);
      if (i >= 0) stack.splice(i, 1);
      syncStack();
      el.classList.remove('open');
      el.classList.add('closing');
      const remove = () => el.remove();
      if (prefersReducedMotion()) remove();
      else setTimeout(remove, 320);
      onClose?.(result);
    },
  };
  const buttons = { left, right: right === undefined ? { label: 'Fertig' } : right };
  function replaceButton(side, btn) {
    buttons[side] = btn;
    const old = qs(`[data-sheet-btn="${side}"], .sheet-hbtn-spacer.${side}`, el);
    if (old) old.outerHTML = headerButton(btn, side);
    bindButton(side);
  }
  function bindButton(side) {
    const b = qs(`[data-sheet-btn="${side}"]`, el);
    if (!b) return;
    b.addEventListener('click', () => {
      const btn = buttons[side];
      if (btn?.action) btn.action(ctl);
      else ctl.close();
    });
  }

  el.innerHTML = `
    <div class="sheet-grab"><span class="grabber"></span>
      <div class="sheet-head">
        ${headerButton(buttons.left, 'left')}
        <h2 class="sheet-title">${esc(title)}</h2>
        ${headerButton(buttons.right, 'right')}
      </div>
    </div>
    <div class="sheet-body">${body}</div>
    <div class="sheet-footer" ${footer ? '' : 'hidden'}>${footer}</div>`;
  root.appendChild(el);
  bindButton('left');
  bindButton('right');
  stack.push(ctl);
  syncStack();
  enableDragToClose(ctl);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  onMount?.(ctl);
  return ctl;
}

export function closeAllSheets() {
  [...stack].reverse().forEach((s) => s.close());
}

export function topSheet() {
  return stack[stack.length - 1] || null;
}

// Nach unten ziehen schließt – gegriffen wird an der Kopfzeile, damit sich
// das nicht mit dem Scrollen des Inhalts in die Quere kommt.
function enableDragToClose(ctl) {
  const grab = qs('.sheet-grab', ctl.el);
  let start = null;
  grab.addEventListener('pointerdown', (e) => {
    if (!ctl.dismissible || e.target.closest('button')) return;
    start = { y: e.clientY, t: performance.now(), dy: 0 };
    ctl.el.style.transition = 'none';
    grab.setPointerCapture?.(e.pointerId);
  });
  grab.addEventListener('pointermove', (e) => {
    if (!start) return;
    start.dy = Math.max(0, e.clientY - start.y);
    ctl.el.style.transform = `translateY(${start.dy}px)`;
  });
  const end = () => {
    if (!start) return;
    const { dy, t } = start;
    const v = dy / Math.max(1, performance.now() - t);
    start = null;
    ctl.el.style.transition = '';
    ctl.el.style.transform = '';
    if (dy > 110 || (dy > 40 && v > 0.6)) ctl.close();
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);
}

// ---------- Aktionsmenü ----------
// actions: [{ label, style: 'destructive'|'default', handler }]
export function actionSheet({ title = '', message = '', actions = [], cancelLabel = 'Abbrechen' } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'action-sheet';
    el.innerHTML = `
      <div class="as-group">
        ${title || message ? `<div class="as-head">${title ? `<strong>${esc(title)}</strong>` : ''}${message ? `<span>${esc(message)}</span>` : ''}</div>` : ''}
        ${actions.map((a, i) => `<button class="as-btn ${a.style === 'destructive' ? 'destructive' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}
      </div>
      <button class="as-btn as-cancel" data-i="-1">${esc(cancelLabel)}</button>`;
    const shade = document.createElement('div');
    shade.className = 'as-shade';
    root.append(shade, el);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('open'); shade.classList.add('show'); }));
    const done = (i) => {
      el.classList.remove('open');
      shade.classList.remove('show');
      setTimeout(() => { el.remove(); shade.remove(); }, prefersReducedMotion() ? 0 : 260);
      if (i >= 0) actions[i].handler?.();
      resolve(i);
    };
    shade.addEventListener('click', () => done(-1));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) done(+b.dataset.i);
    });
  });
}

export async function confirmAction({ title, message = '', confirmLabel = 'OK', destructive = true }) {
  const i = await actionSheet({ title, message, actions: [{ label: confirmLabel, style: destructive ? 'destructive' : 'default' }] });
  return i === 0;
}

// ---------- Dialog (mittig, z. B. mit Eingabefeld) ----------
function dialog({ title, message = '', input = null, buttons }) {
  return new Promise((resolve) => {
    const shade = document.createElement('div');
    shade.className = 'dlg-shade';
    const el = document.createElement('div');
    el.className = 'dialog';
    el.setAttribute('role', 'alertdialog');
    el.innerHTML = `
      <div class="dlg-body">
        <strong>${esc(title)}</strong>
        ${message ? `<p>${esc(message)}</p>` : ''}
        ${input ? `<input class="dlg-input" type="text" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" ${input.inputmode ? `inputmode="${input.inputmode}"` : ''} autocomplete="off" />` : ''}
      </div>
      <div class="dlg-btns n${buttons.length}">
        ${buttons.map((b, i) => `<button data-i="${i}" class="${b.style || ''}">${esc(b.label)}</button>`).join('')}
      </div>`;
    root.append(shade, el);
    const field = qs('.dlg-input', el);
    // Synchron fokussieren: nur innerhalb der Nutzergeste öffnet iOS die Tastatur.
    if (field) { field.focus(); field.select(); }
    requestAnimationFrame(() => { el.classList.add('open'); shade.classList.add('show'); });
    const done = (i) => {
      const value = field ? field.value.trim() : null;
      el.classList.remove('open');
      shade.classList.remove('show');
      setTimeout(() => { el.remove(); shade.remove(); }, prefersReducedMotion() ? 0 : 200);
      resolve({ index: i, value });
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) done(+b.dataset.i);
    });
    field?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(buttons.length - 1); }
    });
  });
}

export async function promptDialog({ title, message = '', value = '', placeholder = '', confirmLabel = 'Sichern', inputmode = null }) {
  const r = await dialog({
    title, message, input: { value, placeholder, inputmode },
    buttons: [{ label: 'Abbrechen' }, { label: confirmLabel, style: 'strong' }],
  });
  return r.index === 1 ? r.value : null;
}

export async function alertDialog({ title, message = '' }) {
  await dialog({ title, message, buttons: [{ label: 'OK', style: 'strong' }] });
}

