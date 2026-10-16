// Navigation: vier Tabs, jeder mit eigenem Stapel an Unterseiten (wie bei
// iOS). Seiten melden sich mit registerPage an und liefern HTML.
import { esc, qs } from './dom.js';
import { Icon } from './icons.js';

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
//         kicker?(), large?: boolean, mount?(contentEl, params) }
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
  return typeof page.title === 'function' ? page.title(entry.params || {}) : page.title;
}

let lastKey = null;
let pendingAnim = null;
let liveBarHtml = () => '';
let afterRender = [];

export function setLiveBar(fn) { liveBarHtml = fn; }
export function onAfterRender(fn) { afterRender.push(fn); }

export function render() {
  const entry = current();
  const page = pages[entry.id];
  if (!page) return;
  const params = entry.params || {};
  const stack = nav.stacks[nav.tab];
  const pushed = stack.length > 0;
  const key = `${nav.tab}:${stack.length}:${entry.id}:${JSON.stringify(params)}`;
  const prevContent = qs('#content');
  const scrollTop = key === lastKey && prevContent ? prevContent.scrollTop : 0;
  lastKey = key;

  const title = titleOf(entry);
  const parent = stack.length > 1 ? stack[stack.length - 2] : { id: nav.tab, params: {} };
  const backLabel = titleOf(parent) || TABS.find((t) => t.id === nav.tab)?.label || 'Zurück';
  const large = !pushed && page.large !== false;
  const kicker = large && page.kicker ? page.kicker(params) : '';
  const anim = pendingAnim;
  pendingAnim = null;

  root.innerHTML = `
    <div class="screen ${pushed ? 'is-pushed' : ''} ${anim || ''}" data-page="${entry.id}">
      <header class="navbar">
        <div class="nav-left">${pushed
    ? `<button class="nav-btn nav-back" data-action="nav-back" aria-label="Zurück">${Icon.chevronLeft}<span>${esc(backLabel)}</span></button>`
    : (page.left ? page.left(params) : '')}</div>
        <div class="nav-title">${esc(title)}</div>
        <div class="nav-right">${page.right ? page.right(params) : ''}</div>
      </header>
      <main class="content" id="content">
        ${large ? `<div class="page-head">${kicker ? `<div class="page-kicker">${esc(kicker)}</div>` : ''}<h1 class="large-title">${esc(title)}</h1></div>` : ''}
        ${page.render(params)}
      </main>
    </div>
    ${liveBarHtml()}
    <nav class="tabbar" aria-label="Navigation">
      ${TABS.map((t) => `
        <button class="tab ${t.id === nav.tab ? 'active' : ''}" data-action="tab" data-tab="${t.id}" aria-label="${t.label}" ${t.id === nav.tab ? 'aria-current="page"' : ''}>
          ${Icon[t.icon]}<span>${t.label}</span>
        </button>`).join('')}
    </nav>`;

  const content = qs('#content');
  const screen = qs('.screen');
  content.scrollTop = scrollTop;
  const threshold = 38;
  const onScroll = () => screen.classList.toggle('scrolled', content.scrollTop > threshold);
  onScroll();
  content.addEventListener('scroll', onScroll, { passive: true });
  if (anim) screen.addEventListener('animationend', () => screen.classList.remove(anim), { once: true });
  page.mount?.(content, params);
  afterRender.forEach((fn) => fn());
}

export function push(id, params = {}) {
  nav.stacks[nav.tab].push({ id, params });
  pendingAnim = 'push-in';
  render();
}

export function pop() {
  const stack = nav.stacks[nav.tab];
  if (!stack.length) return;
  stack.pop();
  pendingAnim = 'pop-in';
  render();
}

// Aktuelle Unterseite ersetzen (z. B. nach dem Umbenennen eines Plans)
export function replaceParams(params) {
  const stack = nav.stacks[nav.tab];
  if (stack.length) stack[stack.length - 1].params = params;
  render();
}

export function switchTab(id) {
  if (nav.tab === id) {
    // Erneutes Antippen: zurück zur Wurzel bzw. nach oben scrollen
    if (nav.stacks[id].length) {
      nav.stacks[id] = [];
      pendingAnim = 'pop-in';
      render();
    } else {
      qs('#content')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  nav.tab = id;
  render();
}

// Von irgendwo direkt zu einer Seite in einem Tab springen
export function goTo(tab, id = null, params = {}) {
  nav.tab = tab;
  nav.stacks[tab] = id ? [{ id, params }] : [];
  pendingAnim = id ? 'push-in' : null;
  render();
}

export function currentPage() {
  return current();
}

// Vom linken Rand nach rechts wischen geht eine Seite zurück. Gestartet wird
// nur am Rand, und nur wenn die Bewegung klar waagerecht ist – sonst bleibt es
// beim normalen Scrollen.
let swipe = null;
root.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (e.touches.length !== 1 || t.clientX > 22 || !nav.stacks[nav.tab].length) return;
  if (document.documentElement.classList.contains('sheet-open') || document.documentElement.classList.contains('workout-open')) return;
  swipe = { x: t.clientX, y: t.clientY, dx: 0, active: false, screen: qs('.screen') };
}, { passive: true });
root.addEventListener('touchmove', (e) => {
  if (!swipe) return;
  const t = e.touches[0];
  const dx = t.clientX - swipe.x;
  const dy = t.clientY - swipe.y;
  if (!swipe.active) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
    if (dx < 10) return;
    swipe.active = true;
  }
  swipe.dx = Math.max(0, dx);
  swipe.screen.style.transition = 'none';
  swipe.screen.style.transform = `translateX(${swipe.dx}px)`;
}, { passive: true });
root.addEventListener('touchend', () => {
  if (!swipe) return;
  const { active, dx, screen } = swipe;
  swipe = null;
  if (!active) return;
  if (dx > window.innerWidth * 0.3) {
    screen.style.transition = 'transform .2s ease';
    screen.style.transform = 'translateX(100%)';
    setTimeout(() => {
      nav.stacks[nav.tab].pop();
      render();
    }, 180);
  } else {
    screen.style.transition = 'transform .25s ease';
    screen.style.transform = '';
  }
});
