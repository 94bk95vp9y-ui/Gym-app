// Navigation: vier Tabs, jeder mit eigenem Stapel an Unterseiten (wie bei
// iOS). Seiten melden sich mit registerPage an und liefern HTML.
//
// Seitenwechsel laufen wie in iOS: die neue Seite schiebt sich von rechts über
// die alte, die dabei leicht nach links zurückweicht und dunkler wird. Vom
// linken Rand wischen geht zurück und zeigt die vorige Seite schon während
// des Wischens. Tableiste und Live-Leiste bleiben stehen und werden nur
// aktualisiert – so kann die Markierung des aktiven Tabs gleiten.
import {
  esc, qs, qsa, prefersReducedMotion, placeTitle,
} from './dom.js';
import { Icon, IconFill } from './icons.js';
import { EASE } from './motion.js';

export const TABS = [
  { id: 'today', label: 'Heute', icon: 'home' },
  { id: 'training', label: 'Training', icon: 'dumbbell' },
  { id: 'supplements', label: 'Supplements', icon: 'pill' },
  { id: 'history', label: 'Verlauf', icon: 'chart' },
];

const pages = Object.create(null);
const root = document.getElementById('app-root');

export const nav = {
  tab: 'today',
  stacks: Object.fromEntries(TABS.map((t) => [t.id, []])),
};

// page: { title(params), render(params), right?(params), left?(params),
//         kicker?(), footer?(params), mount?(contentEl, params) }
// Wurzelseiten zeigen den großen Titel mit den Aktionen in einer Zeile; die
// kompakte Leiste erscheint erst beim Scrollen. Unterseiten haben oben einen
// runden Zurück-Knopf. footer: feste Aktion unten, schwebt über der
// Tableiste (die bleibt wie in iOS immer sichtbar).
export function registerPage(id, def) {
  pages[id] = def;
}

function current() {
  const stack = nav.stacks[nav.tab];
  return stack[stack.length - 1] || { id: nav.tab, params: {} };
}

function titleOf(entry) {
  const page = pages[entry.id];
  if (!page) return '';
  return typeof page.title === 'function' ? safely(() => page.title(entry.params || {})) : page.title;
}

let liveBarHtml = () => '';
const afterRender = [];
export function setLiveBar(fn) { liveBarHtml = fn; }
export function onAfterRender(fn) { afterRender.push(fn); }

// ---------- Gerüst ----------
let stage = null;
let chrome = null;
let tabbar = null;
let liveSlot = null;
let active = null; // aktuelles .screen-Element
let busy = false; // läuft gerade ein Seitenwechsel?
// Scrollposition je Seite: zurück und beim Tabwechsel geht es dort weiter,
// wo man war – wie in iOS.
const scrollMemo = new Map();

function saveScroll() {
  if (active?.isConnected) scrollMemo.set(active.dataset.key, qs('.content', active).scrollTop);
}

function takeScroll(key) {
  const top = scrollMemo.get(key) || 0;
  scrollMemo.delete(key);
  return top;
}

function ensureShell() {
  if (stage) return;
  root.innerHTML = `
    <div class="stage" id="stage"></div>
    <div class="bottom-chrome" id="bottom-chrome">
      <div class="live-slot" id="live-slot"></div>
      <nav class="tabbar glass" aria-label="Navigation">
        <span class="tab-pill" aria-hidden="true"></span>
        ${TABS.map((t, i) => `
          <button class="tab" data-action="tab" data-tab="${t.id}" data-i="${i}" aria-label="${t.label}">
            <span class="tab-icon"><span class="ic-line">${Icon[t.icon]}</span><span class="ic-fill">${IconFill[t.icon]}</span></span>
            <span class="tab-label">${t.label}</span>
          </button>`).join('')}
      </nav>
    </div>`;
  stage = qs('#stage', root);
  chrome = qs('#bottom-chrome', root);
  tabbar = qs('.tabbar', chrome);
  liveSlot = qs('#live-slot', chrome);
  // Höhe der schwebenden Leisten unten – der Inhalt braucht so viel Luft
  const measure = () => document.documentElement.style.setProperty('--chrome-h', `${Math.round(chrome.getBoundingClientRect().height)}px`);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(chrome);
  measure();
  enableSwipeBack();
}

function keyOf(entry, tab = nav.tab, depth = nav.stacks[tab].length) {
  return `${tab}:${depth}:${entry.id}:${JSON.stringify(entry.params || {})}`;
}

// Auffangnetz: wirft eine Seite (etwa wegen kaputter Daten), bleibt die App
// bedienbar – mit Hinweis und dem Weg zu Sicherung und Einstellungen.
function safely(fn, fallback = '') {
  try { return fn(); } catch (err) {
    console.error(err);
    return fallback;
  }
}

const ERROR_HTML = `
  <div class="empty-state">
    <span class="empty-icon">${Icon.info}</span>
    <strong>Ansicht konnte nicht geladen werden</strong>
    <p>Deine Daten bleiben erhalten. In den Einstellungen kannst du eine Sicherung erstellen.</p>
    <button class="btn btn-tinted" data-action="open-settings">Einstellungen</button>
  </div>`;

function buildScreen(entry, { tab = nav.tab, depth = nav.stacks[nav.tab].length } = {}) {
  const page = pages[entry.id];
  const params = entry.params || {};
  const pushed = depth > 0;
  const stack = nav.stacks[tab];
  const title = titleOf(entry);
  const kicker = !pushed && page.kicker ? safely(() => page.kicker(params)) : '';
  const right = page.right ? safely(() => page.right(params)) : '';
  const footer = page.footer ? safely(() => page.footer(params)) : '';
  const parent = depth > 1 ? stack[depth - 2] : { id: tab, params: {} };
  const backLabel = titleOf(parent) || TABS.find((t) => t.id === tab)?.label || 'Zurück';
  const el = document.createElement('div');
  el.className = `screen ${pushed ? 'is-pushed' : 'is-root'} ${footer ? 'has-footer' : ''}`;
  el.dataset.page = entry.id;
  el.dataset.key = keyOf(entry, tab, depth);
  el.innerHTML = `
    <div class="edge" aria-hidden="true"></div>
    <header class="topbar">
      <div class="nav-left">${pushed
    ? `<button class="nav-btn nav-back glass" data-action="nav-back" aria-label="Zurück zu ${esc(backLabel)}">${Icon.chevronLeft}</button>`
    : (page.left ? page.left(params) : '')}</div>
      <div class="nav-title">${esc(title)}</div>
      <div class="nav-right">${right}</div>
    </header>
    <main class="content">
      ${pushed ? '' : `
      <div class="page-head">
        <div class="page-head-text">${kicker ? `<div class="page-kicker">${esc(kicker)}</div>` : ''}<h1 class="large-title">${esc(title)}</h1></div>
        ${right ? `<div class="page-head-actions">${right}</div>` : ''}
      </div>`}
      ${safely(() => page.render(params), ERROR_HTML)}
    </main>
    ${footer ? `<div class="screen-footer">${footer}</div>` : ''}`;
  return el;
}

// Seite aktiv schalten: Scroll-Verhalten, id="content", mount
function activate(el, scrollTop = 0) {
  qsa('.content#content', stage).forEach((c) => c.removeAttribute('id'));
  const content = qs('.content', el);
  content.id = 'content';
  content.scrollTop = scrollTop;
  // Titel mittig, aber nie unter den Knöpfen
  const bar = qs('.topbar', el);
  placeTitle(bar, qs('.nav-title', bar), qs('.nav-left', bar), qs('.nav-right', bar));
  const threshold = el.classList.contains('is-pushed') ? 24 : 44;
  const onScroll = () => el.classList.toggle('scrolled', content.scrollTop > threshold);
  onScroll();
  content.addEventListener('scroll', onScroll, { passive: true });
  active = el;
  const entry = current();
  safely(() => pages[entry.id]?.mount?.(content, entry.params || {}));
}

function updateChrome() {
  const index = TABS.findIndex((t) => t.id === nav.tab);
  tabbar.style.setProperty('--tab-i', index);
  qsa('.tab', tabbar).forEach((b) => {
    const on = b.dataset.tab === nav.tab;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const live = liveBarHtml();
  // Die laufende Uhr ändert sich jede Sekunde – sie zählt nicht als Änderung,
  // sonst würde die Leiste bei jedem Seitenwechsel neu einfliegen.
  const key = live.replace(/<span id="live-time"[^>]*>[^<]*<\/span>/, '');
  if (liveSlot.dataset.key !== key) {
    const appearing = !liveSlot.dataset.key;
    liveSlot.innerHTML = live;
    liveSlot.dataset.key = key;
    qs('.live-bar', liveSlot)?.classList.toggle('enter', appearing);
  }
  chrome.classList.toggle('has-live', !!live);
}

function finish() {
  updateChrome();
  afterRender.forEach((fn) => fn());
}

// Aktuelle Seite neu zeichnen (nach Datenänderungen), Scrollposition bleibt
export function render() {
  ensureShell();
  settle();
  const entry = current();
  if (!pages[entry.id]) return;
  const el = buildScreen(entry);
  const keep = active && active.dataset.key === el.dataset.key && active.isConnected;
  const scroll = keep ? qs('.content', active).scrollTop : takeScroll(el.dataset.key);
  if (active && active.isConnected) active.replaceWith(el);
  else stage.replaceChildren(el);
  qsa('.screen', stage).forEach((s) => { if (s !== el) s.remove(); });
  activate(el, scroll);
  finish();
}

// ---------- Übergänge ----------
const NAV_MS = 520;
const PARALLAX = -0.3;

function dimLayer(el) {
  let d = qs(':scope > .screen-dim', el);
  if (!d) {
    d = document.createElement('div');
    d.className = 'screen-dim';
    el.appendChild(d);
  }
  return d;
}

// Laufenden Übergang sofort abschließen (z. B. wenn während der Animation ein
// Tab angetippt wird) – sonst ginge der Tipp verloren.
let running = null;
let abortSwipe = null; // bricht ein laufendes Wischen ab (siehe enableSwipeBack)
function settle() {
  abortSwipe?.();
  running?.done();
}

function slide(kind, from, to) {
  const w = stage.clientWidth;
  const top = kind === 'push' ? to : from; // die Seite, die oben liegt
  const under = kind === 'push' ? from : to;
  const opts = { duration: NAV_MS, easing: EASE.nav, fill: 'both' };
  const topFrames = kind === 'push'
    ? [{ transform: `translateX(${w}px)` }, { transform: 'translateX(0)' }]
    : [{ transform: 'translateX(0)' }, { transform: `translateX(${w}px)` }];
  const underFrames = kind === 'push'
    ? [{ transform: 'translateX(0)' }, { transform: `translateX(${w * PARALLAX}px)` }]
    : [{ transform: `translateX(${w * PARALLAX}px)` }, { transform: 'translateX(0)' }];
  const dimFrames = kind === 'push' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
  top.classList.add('is-top');
  const dim = dimLayer(under);
  const anims = [top.animate(topFrames, opts), under.animate(underFrames, opts), dim.animate(dimFrames, opts)];
  return {
    anims,
    cleanup() {
      anims.forEach((a) => a.cancel());
      top.classList.remove('is-top');
      dim.remove();
    },
  };
}

function transition(kind) {
  ensureShell();
  settle();
  const entry = current();
  const old = active && active.isConnected ? active : null;
  if (!old || prefersReducedMotion()) { render(); return; }
  const el = buildScreen(entry);
  if (kind === 'push') stage.appendChild(el); else stage.insertBefore(el, old);
  busy = true;
  stage.classList.add('animating');
  activate(el, kind === 'pop' ? takeScroll(el.dataset.key) : 0);
  finish();
  const anim = slide(kind, old, el);
  let ended = false;
  const done = () => {
    if (ended) return;
    ended = true;
    anim.cleanup();
    old.remove();
    busy = false;
    stage.classList.remove('animating');
    if (running?.done === done) running = null;
  };
  running = { done };
  Promise.all(anim.anims.map((a) => a.finished.catch(() => {}))).then(done);
}

export function push(id, params = {}) {
  saveScroll();
  nav.stacks[nav.tab].push({ id, params });
  scrollMemo.delete(keyOf(current()));
  transition('push');
}

export function pop() {
  const stack = nav.stacks[nav.tab];
  if (!stack.length) return;
  stack.pop();
  transition('pop');
}

// Aktuelle Unterseite ersetzen (z. B. nach dem Umbenennen eines Plans)
export function replaceParams(params) {
  const stack = nav.stacks[nav.tab];
  if (stack.length) stack[stack.length - 1].params = params;
  render();
}

export function switchTab(id) {
  settle();
  if (busy) return; // gerade wird gewischt
  if (nav.tab === id) {
    // Erneutes Antippen: zurück zur Wurzel bzw. nach oben scrollen
    if (nav.stacks[id].length) {
      nav.stacks[id] = [];
      transition('pop');
    } else {
      qs('#content')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  saveScroll();
  nav.tab = id;
  render();
}

// Von irgendwo direkt zu einer Seite in einem Tab springen
export function goTo(tab, id = null, params = {}) {
  const sameTab = nav.tab === tab;
  saveScroll();
  nav.tab = tab;
  nav.stacks[tab] = [];
  if (!id) { render(); return; }
  if (!sameTab) render();
  push(id, params);
}

export function currentPage() {
  return current();
}

export function isNavigating() { return busy; }

// ---------- Vom Rand wischen ----------
// Gestartet wird nur am linken Rand und nur, wenn die Bewegung klar
// waagerecht ist – sonst bleibt es beim normalen Scrollen. Die vorige Seite
// liegt dabei schon darunter und zieht mit.
function enableSwipeBack() {
  let s = null;
  // Wird während des Wischens neu gezeichnet (z. B. Daten-Aktualisierung),
  // bricht das Wischen ab – sonst bliebe die Bühne gesperrt.
  abortSwipe = () => {
    if (!s?.active) return;
    const g = s;
    s = null;
    g.under?.remove();
    if (g.top) { g.top.style.transform = ''; g.top.classList.remove('is-top'); }
    busy = false;
    stage.classList.remove('animating');
  };
  stage.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (busy || e.touches.length !== 1 || t.clientX > 24 || !nav.stacks[nav.tab].length) return;
    const html = document.documentElement;
    if (html.classList.contains('sheet-open') || html.classList.contains('workout-open')) return;
    s = { x: t.clientX, y: t.clientY, dx: 0, t: performance.now(), v: 0, active: false };
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      if (dx < 8) return;
      s.active = true;
      // Vorige Seite darunter legen
      const stack = nav.stacks[nav.tab];
      const depth = stack.length - 1;
      const parentEntry = depth > 0 ? stack[depth - 1] : { id: nav.tab, params: {} };
      s.under = buildScreen(parentEntry, { depth });
      s.under.classList.add('is-under');
      stage.insertBefore(s.under, active);
      qs('.content', s.under).scrollTop = scrollMemo.get(s.under.dataset.key) || 0;
      s.dim = dimLayer(s.under);
      s.top = active;
      s.top.classList.add('is-top');
      s.w = stage.clientWidth;
      busy = true;
      stage.classList.add('animating');
    }
    const now = performance.now();
    const x = Math.max(0, dx);
    s.v = (x - s.dx) / Math.max(1, now - s.t);
    s.t = now;
    s.dx = x;
    const p = Math.min(1, x / s.w);
    s.top.style.transform = `translateX(${x}px)`;
    s.under.style.transform = `translateX(${(1 - p) * PARALLAX * s.w}px)`;
    s.dim.style.opacity = String(1 - p);
  }, { passive: true });

  const end = () => {
    if (!s) return;
    const g = s;
    s = null;
    if (!g.active) return;
    const done = g.dx > g.w * 0.35 || (g.v > 0.45 && g.dx > 40);
    const remaining = done ? g.w - g.dx : g.dx;
    const ms = Math.max(160, Math.min(380, remaining / Math.max(0.6, Math.abs(g.v))));
    const opts = { duration: ms, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' };
    const topTo = done ? g.w : 0;
    const underTo = done ? 0 : PARALLAX * g.w;
    const anims = [
      g.top.animate([{ transform: g.top.style.transform }, { transform: `translateX(${topTo}px)` }], opts),
      g.under.animate([{ transform: g.under.style.transform }, { transform: `translateX(${underTo}px)` }], opts),
      g.dim.animate([{ opacity: g.dim.style.opacity }, { opacity: done ? 0 : 1 }], opts),
    ];
    // Als laufender Übergang anmelden: ein Tab-Tipp währenddessen schließt
    // ihn sofort ab, statt verloren zu gehen.
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (running?.done === finish) running = null;
      anims.forEach((a) => a.cancel());
      busy = false;
      stage.classList.remove('animating');
      if (done) {
        nav.stacks[nav.tab].pop();
        render();
      } else {
        g.top.style.transform = '';
        g.top.classList.remove('is-top');
        g.under.remove();
      }
    };
    running = { done: finish };
    Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(finish);
  };
  stage.addEventListener('touchend', end);
  stage.addEventListener('touchcancel', end);
}
