// Sheets (Fenster von unten), Aktionsmenüs und Dialoge – nach iOS-Vorbild.
// Sheets lassen sich stapeln: ein zweites Sheet legt sich über das erste,
// das dahinter leicht zurücktritt.
import {
  esc, qs, prefersReducedMotion, placeTitle,
} from './dom.js';
import { Icon } from './icons.js';
import { dimStatusBar } from './theme.js';

const root = document.getElementById('sheet-root');
const stack = [];
// Ein Doppeltipp auf einen Knopf soll ein Sheet nicht gleich wieder
// schließen: der zweite Tipp landet sonst auf dem frisch eingeblendeten Schatten.
let shownAt = 0;
const justOpened = () => performance.now() - shownAt < 350;
let backdrop = null;

function ensureBackdrop() {
  if (backdrop) return backdrop;
  backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.addEventListener('click', () => {
    if (justOpened()) return;
    const top = stack[stack.length - 1];
    if (top && top.dismissible) top.close();
  });
  root.appendChild(backdrop);
  return backdrop;
}

function syncStack() {
  if (!stack.length && document.documentElement.classList.contains('sheet-open')) {
    window.dispatchEvent(new Event('sheets-closed'));
  }
  ensureBackdrop().classList.toggle('show', stack.length > 0);
  dimStatusBar(stack.length > 0);
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
  shownAt = performance.now();
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
    setTitle(text) { qs('.sheet-title', el).textContent = text; layoutHead(); },
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
  const buttons = { left, right: right === undefined ? { label: 'Fertig', style: 'primary' } : right };
  function replaceButton(side, btn) {
    buttons[side] = btn;
    const old = qs(`[data-sheet-btn="${side}"], .sheet-hbtn-spacer.${side}`, el);
    if (old) old.outerHTML = headerButton(btn, side);
    bindButton(side);
    layoutHead();
  }
  // Titel bleibt mittig; Platz bekommt er nach dem breiteren Knopf
  function layoutHead() {
    const head = qs('.sheet-head', el);
    placeTitle(head, qs('.sheet-title', head), qs('[data-sheet-btn="left"]', head), qs('[data-sheet-btn="right"]', head));
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
  layoutHead();
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

// ---------- Menü am Knopf ----------
// Wie die Pull-down-Menüs von iOS: klappt direkt am auslösenden Knopf auf
// statt als Blatt von unten. items: [{ label, sub?, icon?, destructive?,
// disabled?, checked?, handler }] – '-' trennt Gruppen.
let openMenuCtl = null;

// preview: true hebt das Element selbst hervor (Kontextmenü nach langem
// Drücken) – der Hintergrund verschwimmt, das Element schwebt darüber.
let lastMenuClose = { anchor: null, at: 0 };
export function openMenu(anchor, items, { title = '', preview = false } = {}) {
  // Erneutes Antippen desselben Knopfs schließt nur (kein sofortiges Wiederöffnen)
  if (openMenuCtl) { openMenuCtl.close(-1); return Promise.resolve(-1); }
  if (lastMenuClose.anchor === anchor && performance.now() - lastMenuClose.at < 400) return Promise.resolve(-1);
  return new Promise((resolve) => {
    let rect = anchor.getBoundingClientRect();
    const shade = document.createElement('div');
    shade.className = `menu-shade ${preview ? 'ctx' : ''}`;
    let lifted = null;
    if (preview) {
      lifted = anchor.cloneNode(true);
      lifted.classList.add('ctx-preview');
      lifted.removeAttribute('id');
      lifted.setAttribute('aria-hidden', 'true');
      lifted.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
    }
    const el = document.createElement('div');
    el.className = 'menu glass';
    el.setAttribute('role', 'menu');
    el.innerHTML = `
      ${title ? `<div class="menu-title">${esc(title)}</div>` : ''}
      ${items.map((it, i) => (it === '-' ? '<div class="menu-sep" role="separator"></div>' : `
        <button class="menu-item ${it.destructive ? 'destructive' : ''} ${it.checked ? 'checked' : ''}" role="menuitem" data-i="${i}" ${it.disabled ? 'disabled' : ''}>
          <span class="menu-check">${it.checked ? Icon.check : ''}</span>
          <span class="menu-label">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>
          <span class="menu-icon">${it.icon || ''}</span>
        </button>`)).join('')}`;
    root.append(shade, ...(lifted ? [lifted] : []), el);
    el.classList.toggle('has-checks', items.some((it) => it && it.checked !== undefined));

    // Unter oder über dem Knopf, bündig zur näheren Seite
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const safeTop = 0; // die Home-Screen-App beginnt unter der Statusleiste
    const alignLeft = rect.left + rect.width / 2 < vw / 2;
    let left = alignLeft ? rect.left : rect.right - w;
    left = Math.max(8, Math.min(vw - w - 8, left));
    if (lifted && rect.bottom + 8 + h > vh - 12 && rect.top - 8 - h < safeTop + 8) {
      // Weder darunter noch darüber Platz: Element nach oben schieben
      const shift = Math.max(safeTop + 8, vh - 12 - h - 8 - rect.height) - rect.top;
      lifted.style.setProperty('--shift', `${shift}px`);
      rect = { left: rect.left, right: rect.right, width: rect.width, top: rect.top + shift, bottom: rect.bottom + shift };
    }
    let top = rect.bottom + 8;
    let below = true;
    if (top + h > vh - 12) { top = rect.top - h - 8; below = false; }
    top = Math.max(safeTop + 8, Math.min(vh - h - 12, top));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    const ox = Math.max(0, Math.min(w, rect.left + rect.width / 2 - left));
    el.style.transformOrigin = `${ox}px ${below ? 0 : h}px`;
    anchor.classList.add(preview ? 'ctx-source' : 'menu-anchor');
    requestAnimationFrame(() => {
      el.classList.add('open');
      shade.classList.add('show');
      lifted?.classList.add('ctx-lifted');
    });

    const ctl = {
      close(i) {
        if (openMenuCtl !== ctl) return;
        openMenuCtl = null;
        // Nur ein Wegtippen sperrt das Wiederöffnen – nach einer Auswahl darf
        // direkt ein Folgemenü am selben Knopf aufgehen (z. B. Satzpause)
        if (i < 0) lastMenuClose = { anchor, at: performance.now() };
        anchor.classList.remove('menu-anchor');
        el.classList.remove('open');
        el.classList.add('closing');
        shade.classList.remove('show');
        lifted?.classList.remove('ctx-lifted');
        setTimeout(() => {
          el.remove();
          shade.remove();
          lifted?.remove();
          anchor.classList.remove('ctx-source');
        }, prefersReducedMotion() ? 0 : 240);
        const item = i >= 0 ? items[i] : null;
        // Erst schließen, dann handeln – sonst liegt ein folgendes Sheet unter dem Menü
        if (item?.handler) setTimeout(() => item.handler(), 10);
        resolve(i);
      },
    };
    openMenuCtl = ctl;
    // Schließen erst beim Klick: würde schon das Aufsetzen schließen, landete
    // der Klick danach auf dem Knopf darunter und öffnete das Menü gleich wieder.
    shade.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); ctl.close(-1); });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b && !b.disabled) ctl.close(+b.dataset.i);
    });
  });
}

export function closeMenu() {
  openMenuCtl?.close(-1);
}

// ---------- Langes Drücken ----------
// Elemente mit data-menu="art" öffnen nach langem Drücken ein Kontextmenü.
// Die Einträge liefert ein registrierter Baustein: registerContextMenu(art, (el) => items).
const contextMenus = Object.create(null);
export function registerContextMenu(kind, build) {
  contextMenus[kind] = build;
}

let pressTimer = null;
let press = null;
let swallowClick = false;
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  const el = e.target.closest('[data-menu]');
  if (!el || !contextMenus[el.dataset.menu]) return;
  press = { el, x: e.clientX, y: e.clientY };
  el.classList.add('pressing');
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    if (!press) return;
    const target = press.el;
    press = null;
    target.classList.remove('pressing');
    const items = contextMenus[target.dataset.menu](target);
    if (!items?.length) return;
    swallowClick = true;
    openMenu(target, items, { preview: true });
  }, 480);
}, { passive: true });
const cancelPress = () => {
  clearTimeout(pressTimer);
  press?.el.classList.remove('pressing');
  press = null;
};
document.addEventListener('pointermove', (e) => {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
}, { passive: true });
document.addEventListener('pointerup', () => {
  cancelPress();
  if (swallowClick) setTimeout(() => { swallowClick = false; }, 350);
});
document.addEventListener('pointercancel', cancelPress);
document.addEventListener('scroll', cancelPress, true);
// Der Klick nach dem langen Drücken soll das Element nicht auch noch öffnen
document.addEventListener('click', (e) => {
  if (!swallowClick) return;
  if (e.target.closest('.menu')) return;
  e.stopPropagation();
  e.preventDefault();
}, true);
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('[data-menu]')) e.preventDefault();
});

// ---------- Aktionsmenü ----------
// actions: [{ label, style: 'destructive'|'default', handler }]
export function actionSheet({ title = '', message = '', actions = [], cancelLabel = 'Abbrechen' } = {}) {
  return new Promise((resolve) => {
    shownAt = performance.now();
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
    dimStatusBar(true);
    const done = (i) => {
      el.classList.remove('open');
      shade.classList.remove('show');
      dimStatusBar(stack.length > 0);
      setTimeout(() => { el.remove(); shade.remove(); }, prefersReducedMotion() ? 0 : 260);
      if (i >= 0) actions[i].handler?.();
      resolve(i);
    };
    shade.addEventListener('click', () => { if (!justOpened()) done(-1); });
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
    dimStatusBar(true);
    const done = (i) => {
      const value = field ? field.value.trim() : null;
      el.classList.remove('open');
      shade.classList.remove('show');
      dimStatusBar(stack.length > 0);
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

