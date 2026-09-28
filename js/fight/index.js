// Fight-Modus: Kickboxen & Ausdauer. Eigene Startseite, eigene Navigation,
// eigene Optik – der Gym-Teil bleibt unberührt. app.js ruft renderFight()
// auf, solange der Modus aktiv ist.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { Store } from '../storage.js';
import { fx, qs, qsa, getProfile } from './core.js';
import { renderHome, bindHome, leaveHome } from './home.js';
import { renderTech, bindTech } from './tech.js';
import { renderEndurance, bindEndurance, enduHeaderAction } from './endurance.js';
import { renderMe, bindMe } from './me.js';
import { openStartSheet } from './start.js';
import { renderOnboarding, bindOnboarding } from './onboarding.js';

export const TABS = [
  { id: 'home', label: 'Heute', icon: 'home' },
  { id: 'tech', label: 'Technik', icon: 'glove' },
  { id: 'endu', label: 'Ausdauer', icon: 'run' },
  { id: 'me', label: 'Profil', icon: 'user' },
];

export const F = {
  tab: 'home',
  renderedTab: null,
  lastOrder: null,
};

export function initFight(ctx) {
  fx.ctx = ctx;
}

// Beim Verlassen des Modus laufende 3D-Szenen anhalten.
export function leaveFight() {
  leaveHome();
  F.renderedTab = null;
}

export function goTab(id) {
  if (F.tab === id) {
    // Nochmal antippen: nach oben scrollen
    qs('.f-view')?.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  F.tab = id;
  fx.ctx.render();
}

function headerHtml() {
  const profile = getProfile();
  const action = F.tab === 'endu' ? enduHeaderAction() : '';
  const title = {
    home: `<div class="f-brand"><span class="f-logo">Fight</span><span class="f-tagline">Kickboxen · Ausdauer</span></div>`,
    tech: '<h1 class="f-title">Technik</h1>',
    endu: '<h1 class="f-title teal">Ausdauer</h1>',
    me: '<h1 class="f-title">Profil</h1>',
  }[F.tab];
  return `
    <header class="f-top">
      ${title}
      <div class="f-top-actions">
        ${action}
        <button class="f-mode" data-f="to-gym" data-nosound aria-label="Zurück zum Gym-Modus">${Icon.dumbbell}<span>Gym</span></button>
      </div>
      ${profile.stance === 'southpaw' ? '' : ''}
    </header>`;
}

function dockHtml() {
  const tab = (t) => `
    <button class="f-tab ${F.tab === t.id ? 'active' : ''}" data-ftab="${t.id}" aria-label="${t.label}">
      ${Icon[t.icon]}<span>${t.label}</span>
    </button>`;
  return `
    <nav class="f-dock" aria-label="Fight-Navigation">
      ${tab(TABS[0])}${tab(TABS[1])}
      <div class="f-start-slot"><button class="f-start" data-f="start" data-nosound aria-label="Einheit starten">${Icon.bell}</button></div>
      ${tab(TABS[2])}${tab(TABS[3])}
    </nav>`;
}

function tabHtml() {
  if (F.tab === 'tech') return renderTech();
  if (F.tab === 'endu') return renderEndurance();
  if (F.tab === 'me') return renderMe();
  return renderHome();
}

export function renderFight(root) {
  const profile = getProfile();
  if (!profile.setupDone) {
    leaveHome();
    root.innerHTML = renderOnboarding();
    bindOnboarding(root);
    F.renderedTab = null;
    return;
  }
  const changed = F.renderedTab !== F.tab;
  const prevView = qs('.f-view', root);
  const scrollTop = !changed && prevView ? prevView.scrollTop : 0;
  if (changed && F.renderedTab === 'home') leaveHome();

  root.innerHTML = `
    <div class="f-app" data-tab="${F.tab}">
      ${headerHtml()}
      <main class="f-view">${tabHtml()}</main>
      ${dockHtml()}
    </div>`;
  const view = qs('.f-view', root);
  view.scrollTop = scrollTop;
  if (changed) animateIn(view);
  F.renderedTab = F.tab;

  qsa('[data-ftab]', root).forEach((b) => b.addEventListener('click', () => goTab(b.dataset.ftab)));
  qs('[data-f="to-gym"]', root).addEventListener('click', () => fx.ctx.switchMode('gym'));
  qs('[data-f="start"]', root).addEventListener('click', () => { Sound.boxBell(1); openStartSheet(); });

  if (F.tab === 'home') bindHome(view);
  else if (F.tab === 'tech') bindTech(view);
  else if (F.tab === 'endu') bindEndurance(view);
  else if (F.tab === 'me') bindMe(view);
}

// Blöcke gleiten aus der Richtung des Wechsels herein.
function animateIn(view) {
  const order = TABS.findIndex((t) => t.id === F.tab);
  const from = F.lastOrder;
  F.lastOrder = order;
  if (fx.ctx.prefersReducedMotion()) return;
  view.style.setProperty('--enter-x', from === null ? '0px' : order > from ? '18px' : '-18px');
  view.classList.add('f-in');
}

// Für andere Module: Store-Änderung + neu zeichnen.
export function refresh() { fx.ctx.render(); }

export { Store };
