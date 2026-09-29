// Mobility-Bereich: eigene Seite über der App (Gym oder Fight) mit Zurück,
// vier Bereichen – Heute, Pläne, Übungen, Fortschritt – und eigenem, ruhigem
// Design.

import { Store, uid } from '../storage.js';
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { escapeHtml, plural } from '../utils.js';
import { EXERCISES, REGIONS, REGION, KINDS, exercise } from './library.js';
import {
  DEEP, SITUATIONS, PROGRAMS, PROGRAM, PROGRAM_WEEKS, CHECK, CHECKS, CHECK_INTERVAL_DAYS, GUIDE,
  routineSeconds, PNF_SECONDS,
} from './plans.js';
import {
  getProfile, saveProfile, activePrograms, startProgram, stopProgram, todayPlan, dailyRoutine, deepRoutine,
  situationRoutine, customRoutines, saveCustomRoutines, customRoutine, situationSuggestions, regionVolume,
  regionTargets, weekStats, log, counted, sessionRegions, checks, checkDue, checkSelection, prepSeconds,
  mondayOf, startOfDay, weekdayIndex, DAY, nextDeepId,
} from './state.js';
import { mountFigure, stopFigure, fillThumbs, thumb, mzTheme } from './figures.js';

let ctx = null;
export function initArea(context) { ctx = context; }

const qs = (sel, parent = document) => parent.querySelector(sel);
const qsa = (sel, parent = document) => [...parent.querySelectorAll(sel)];
export const mins = (sec) => `${Math.max(1, Math.round(sec / 60))} Min`;
const LETTERS = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const TABS = [
  { id: 'today', label: 'Heute', icon: Icon.sun },
  { id: 'plans', label: 'Pläne', icon: Icon.layers },
  { id: 'library', label: 'Übungen', icon: Icon.body },
  { id: 'progress', label: 'Fortschritt', icon: Icon.chart },
];

let A = null; // offener Bereich
let startRoutine = null; // wird vom Player gesetzt (vermeidet Zyklus)
export function setStarter(fn) { startRoutine = fn; }

// ---------- Öffnen & Schließen ----------
export function openArea({ tab = 'today', focus = null } = {}) {
  if (A) { A.tab = tab; paint(); return; }
  const el = document.createElement('div');
  el.className = 'mz';
  el.innerHTML = `
    <header class="mz-top">
      <button class="mz-round" data-mz="back" aria-label="Zurück">${Icon.back}</button>
      <div class="mz-brand"><span class="mz-leaf">${Icon.leaf}</span><strong>Mobility</strong></div>
      <button class="mz-round" data-mz="settings" aria-label="Einstellungen">${Icon.sliders}</button>
    </header>
    <main class="mz-view"></main>
    <nav class="mz-nav">${TABS.map((t) => `<button data-tab="${t.id}" aria-label="${t.label}">${t.icon}<span>${t.label}</span></button>`).join('')}</nav>`;
  document.body.appendChild(el);
  A = { el, tab, scroll: {} };
  requestAnimationFrame(() => el.classList.add('open'));
  qs('[data-mz="back"]', el).addEventListener('click', closeArea);
  qs('[data-mz="settings"]', el).addEventListener('click', openSettings);
  qsa('.mz-nav [data-tab]', el).forEach((b) => b.addEventListener('click', () => goTab(b.dataset.tab)));
  paint();
  if (focus === 'check') openCheck();
}

export function closeArea() {
  if (!A) return;
  const { el } = A;
  stopFigure('hero');
  A = null;
  el.classList.remove('open');
  el.classList.add('closing');
  setTimeout(() => el.remove(), 360);
  ctx.render();
}

export function isAreaOpen() { return !!A; }
export function refreshArea() { if (A) paint(); }

function goTab(id) {
  if (!A) return;
  const view = qs('.mz-view', A.el);
  if (A.tab === id) { view.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  A.scroll[A.tab] = view.scrollTop;
  A.tab = id;
  paint();
  view.scrollTop = A.scroll[id] || 0;
}

function paint() {
  const view = qs('.mz-view', A.el);
  qsa('.mz-nav [data-tab]', A.el).forEach((b) => b.classList.toggle('on', b.dataset.tab === A.tab));
  stopFigure('hero');
  const html = { today: renderToday, plans: renderPlans, library: renderLibrary, progress: renderProgress }[A.tab]();
  view.innerHTML = `<div class="mz-page mz-page-${A.tab}">${html}</div>`;
  ({ today: bindToday, plans: bindPlans, library: bindLibrary, progress: bindProgress })[A.tab](view);
  fillThumbs(view);
}

// Sheets bekommen die Farben des Bereichs
function sheet(title, body, opts = {}) {
  ctx.openSheet(title, body, {
    ...opts,
    onMount: (root) => {
      qs('.sheet', root)?.classList.add('mz-sheet');
      opts.onMount?.(root);
      fillThumbs(root);
    },
  });
}
function remount(open) {
  const top = qs('#sheet-root .sheet-body')?.scrollTop || 0;
  open();
  const body = qs('#sheet-root .sheet-body');
  if (body) { body.classList.remove('sheet-content-in'); body.scrollTop = top; }
}

function start(routine) {
  if (!routine?.items?.length) { ctx.toast('Diese Routine hat noch keine Übungen'); return; }
  ctx.closeSheet();
  startRoutine?.(routine);
}

// ---------- Bausteine ----------
function regionChips(regions, cls = '') {
  return `<span class="mz-chips ${cls}">${regions.map((r) => `<span class="mz-chip">${REGION[r]?.short || r}</span>`).join('')}</span>`;
}
function routineRegions(items) {
  const set = new Set();
  items.forEach((x) => (exercise(x.id)?.regions || []).forEach((r) => set.add(r)));
  return [...set];
}
function weekStrip(stats, p) {
  return `<div class="mz-week">${LETTERS.map((l, i) => {
    const planned = (p.deepDays || []).includes(i) && p.deepPerWeek;
    return `<span class="mz-wd ${stats.days[i] ? 'on' : ''} ${stats.deepDaysDone[i] ? 'deep' : ''} ${i === stats.todayIndex ? 'today' : ''} ${i > stats.todayIndex ? 'future' : ''}">
      <i>${stats.days[i] ? Icon.check : ''}</i><b>${l}</b>${planned ? '<em title="Tiefe Einheit geplant"></em>' : ''}</span>`;
  }).join('')}</div>`;
}

// Körperkarte vorn/hinten. values: region -> 0..1 (null = neutral)
const BODY_FRONT = [
  ['head', 'circle', { cx: 50, cy: 17, r: 11 }],
  ['neck', 'rect', { x: 44, y: 27, width: 12, height: 10, rx: 4 }],
  ['shoulders', 'circle', { cx: 29, cy: 43, r: 9 }],
  ['shoulders', 'circle', { cx: 71, cy: 43, r: 9 }],
  ['chest', 'rect', { x: 34, y: 36, width: 32, height: 25, rx: 10 }],
  ['none', 'rect', { x: 36, y: 62, width: 28, height: 24, rx: 8 }],
  ['none', 'rect', { x: 18, y: 49, width: 10, height: 30, rx: 5 }],
  ['none', 'rect', { x: 72, y: 49, width: 10, height: 30, rx: 5 }],
  ['wrists', 'rect', { x: 14, y: 81, width: 10, height: 34, rx: 5 }],
  ['wrists', 'rect', { x: 76, y: 81, width: 10, height: 34, rx: 5 }],
  ['hipflex', 'rect', { x: 32, y: 88, width: 15, height: 46, rx: 7 }],
  ['hipflex', 'rect', { x: 53, y: 88, width: 15, height: 46, rx: 7 }],
  ['adductors', 'rect', { x: 45, y: 96, width: 10, height: 30, rx: 5 }],
  ['none', 'circle', { cx: 40, cy: 142, r: 6 }],
  ['none', 'circle', { cx: 60, cy: 142, r: 6 }],
  ['calves', 'rect', { x: 34, y: 149, width: 11, height: 42, rx: 5 }],
  ['calves', 'rect', { x: 55, y: 149, width: 11, height: 42, rx: 5 }],
];
const BODY_BACK = [
  ['head', 'circle', { cx: 50, cy: 17, r: 11 }],
  ['neck', 'rect', { x: 44, y: 27, width: 12, height: 10, rx: 4 }],
  ['shoulders', 'circle', { cx: 29, cy: 43, r: 9 }],
  ['shoulders', 'circle', { cx: 71, cy: 43, r: 9 }],
  ['tspine', 'rect', { x: 34, y: 36, width: 32, height: 26, rx: 10 }],
  ['lowback', 'rect', { x: 36, y: 63, width: 28, height: 21, rx: 8 }],
  ['none', 'rect', { x: 18, y: 49, width: 10, height: 30, rx: 5 }],
  ['none', 'rect', { x: 72, y: 49, width: 10, height: 30, rx: 5 }],
  ['wrists', 'rect', { x: 14, y: 81, width: 10, height: 34, rx: 5 }],
  ['wrists', 'rect', { x: 76, y: 81, width: 10, height: 34, rx: 5 }],
  ['hiprot', 'ellipse', { cx: 41, cy: 95, rx: 10, ry: 11 }],
  ['hiprot', 'ellipse', { cx: 59, cy: 95, rx: 10, ry: 11 }],
  ['hamstrings', 'rect', { x: 32, y: 106, width: 15, height: 30, rx: 7 }],
  ['hamstrings', 'rect', { x: 53, y: 106, width: 15, height: 30, rx: 7 }],
  ['none', 'circle', { cx: 40, cy: 142, r: 6 }],
  ['none', 'circle', { cx: 60, cy: 142, r: 6 }],
  ['calves', 'rect', { x: 34, y: 149, width: 11, height: 42, rx: 6 }],
  ['calves', 'rect', { x: 55, y: 149, width: 11, height: 42, rx: 6 }],
];
function bodyMap(values, { selected = null, tap = false } = {}) {
  const shape = ([region, tag, attrs], dx) => {
    const a = Object.entries(attrs).map(([k, v]) => `${k}="${k === 'x' || k === 'cx' ? v + dx : v}"`).join(' ');
    const v = values[region];
    const cls = region === 'head' || region === 'none' ? 'n' : `r ${selected === region ? 'sel' : ''}`;
    const style = typeof v === 'number' ? `style="--v:${Math.round(v * 100)}%"` : '';
    return `<${tag} ${a} class="${cls}" ${region !== 'head' && region !== 'none' ? `data-region="${region}"` : ''} ${style}/>`;
  };
  return `<svg class="mz-body ${tap ? 'tap' : ''}" viewBox="0 0 210 200" role="img" aria-label="Körperkarte">
    <g>${BODY_FRONT.map((s) => shape(s, 0)).join('')}</g>
    <g>${BODY_BACK.map((s) => shape(s, 110)).join('')}</g>
    <text x="50" y="199" text-anchor="middle">vorn</text><text x="160" y="199" text-anchor="middle">hinten</text>
  </svg>`;
}

// ---------- Heute ----------
function renderToday() {
  const p = getProfile();
  const plan = todayPlan();
  const now = new Date();
  const main = plan.main;
  const sec = routineSeconds(main.items, prepSeconds());
  const daily = main.kind === 'daily' ? main : plan.alt;
  const programs = activePrograms(p);
  const stats = plan.stats;
  const vol = regionVolume();
  const targets = regionTargets(p);
  const reached = REGIONS.filter((r) => vol[r.id] >= targets[r.id]).length;
  const due = checkDue();
  const tip = GUIDE[(now.getDate() + now.getMonth()) % GUIDE.length];
  const sits = situationSuggestions(now).slice(0, 6);

  const heroTitle = plan.done
    ? 'Heute erledigt'
    : main.kind === 'deep' ? `Tiefe Einheit ${main.letter}` : 'Deine tägliche Routine';
  const heroSub = main.kind === 'deep'
    ? main.short
    : `Kern + ${daily.focus.name}`;

  return `
    <div class="mz-hello">
      <span>${DAY_NAMES[weekdayIndex(now)]}, ${now.getDate()}. ${MONTHS[now.getMonth()]}</span>
      <h1>${plan.done ? 'Stark – heute ist Beweglichkeit schon drin.' : main.kind === 'deep' ? 'Heute darf’s tiefer gehen.' : 'Zehn Minuten für einen beweglichen Körper.'}</h1>
    </div>

    <section class="mz-hero ${plan.done ? 'done' : ''} ${main.kind}">
      <div class="mz-hero-stage" id="mz-hero-stage">${plan.done ? `<div class="mz-hero-done">${Icon.check}</div>` : ''}</div>
      <div class="mz-hero-body">
        <span class="mz-kicker">${main.kind === 'deep' ? `${Icon.layers} 1–2× pro Woche` : `${daily.focus.icon} Fokus heute`}</span>
        <h2>${heroTitle}</h2>
        <p class="mz-hero-sub">${escapeHtml(heroSub)} · ${mins(sec)} · ${plural(main.items.length, 'Übung', 'Übungen')}</p>
        ${main.kind === 'daily' && !plan.done ? `
          <div class="mz-budget" role="group" aria-label="Zeit">${[5, 10, 15, 20].map((m) => `<button data-budget="${m}" class="${p.budget === m ? 'on' : ''}">${m}</button>`).join('')}<span>Min</span></div>` : ''}
        <div class="mz-hero-actions">
          <button class="mz-btn primary" data-go="main" data-nosound>${Icon.play} ${plan.done ? 'Nochmal' : 'Starten'}</button>
          <button class="mz-btn ghost" data-view="main">Ablauf</button>
        </div>
        ${plan.alt ? `<button class="mz-link" data-go="alt">Lieber die tägliche Routine · ${mins(routineSeconds(plan.alt.items, prepSeconds()))}</button>` : ''}
      </div>
    </section>

    <section class="mz-card mz-weekcard">
      <div class="mz-row-head"><strong>Diese Woche</strong>
        <span class="mz-count">${stats.count}<small>/${stats.goal} Tage</small></span>
        ${stats.streak ? `<span class="mz-streak">🔥 ${plural(stats.streak, 'Woche', 'Wochen')}</span>` : ''}</div>
      ${weekStrip(stats, p)}
      <p class="mz-note">${stats.today ? (stats.count >= stats.goal ? 'Wochenziel erreicht – alles darüber ist Bonus.' : `Noch ${plural(stats.goal - stats.count, 'Tag', 'Tage')} bis zum Wochenziel.`) : stats.count >= stats.goal ? 'Wochenziel steht. Heute ist Bonus.' : `Noch ${plural(stats.goal - stats.count, 'Tag', 'Tage')} bis zum Wochenziel.`}
        ${p.deepPerWeek ? ` Tiefe Einheiten: ${stats.deepCount}/${p.deepPerWeek}.` : ''}</p>
    </section>

    <div class="mz-sec">Passend jetzt</div>
    <div class="mz-scroller">${sits.map((s) => {
      const r = situationRoutine(s.id);
      return `<button class="mz-sit" data-sit="${s.id}"><span class="mz-sit-icon">${s.icon}</span><strong>${escapeHtml(s.short)}</strong><span>${mins(routineSeconds(r.items, prepSeconds()))}</span></button>`;
    }).join('')}</div>

    ${programs.length ? `
      <div class="mz-sec">Deine Ziele</div>
      ${programs.map((a) => programCard(a)).join('')}` : `
      <button class="mz-card mz-goal-empty" data-tabgo="plans">${Icon.target}<span><strong>Ziel wählen</strong><span>Tiefe Hocke, hohe Kicks, Spagat … – 8 Wochen, Schritt für Schritt.</span></span>${Icon.chevron}</button>`}

    <button class="mz-card mz-bodycard" data-tabgo="progress">
      <div class="mz-bodycard-map">${bodyMap(Object.fromEntries(REGIONS.map((r) => [r.id, Math.min(1, vol[r.id] / targets[r.id])])))}</div>
      <div class="mz-bodycard-text">
        <span class="mz-kicker">${Icon.body} Wochenminuten</span>
        <strong>${reached} von ${REGIONS.length} Regionen im Ziel</strong>
        <span>Je Region zählen etwa 5–10 Minuten pro Woche. Satte Farbe = Ziel erreicht.</span>
      </div>
    </button>

    ${due.due ? `
      <button class="mz-card mz-check-cta" data-check>
        <span class="mz-check-icon">${Icon.chart}</span>
        <span><strong>${due.first ? 'Beweglichkeits-Test machen' : 'Test wieder fällig'}</strong><span>${due.first ? 'Ein paar Minuten, damit du siehst, was sich tut.' : `Letzter Test vor ${due.age} Tagen.`}</span></span>${Icon.chevron}
      </button>` : ''}

    <section class="mz-card mz-tip"><span class="mz-kicker">${Icon.info} Gut zu wissen</span><strong>${tip.title}</strong><p>${tip.text}</p></section>`;
}

function programCard(a) {
  const pct = Math.min(1, a.days / (PROGRAM_WEEKS * 7));
  return `
    <button class="mz-card mz-prog" data-prog="${a.program.id}">
      <span class="mz-prog-icon">${a.program.icon}</span>
      <span class="mz-prog-text">
        <strong>${escapeHtml(a.program.name)}</strong>
        <span>${a.finished ? 'Abgeschlossen – Zeit für den Test' : `Woche ${a.week} von ${PROGRAM_WEEKS} · ${a.phase.name}`}</span>
        <span class="mz-bar"><i style="transform:scaleX(${pct})"></i></span>
      </span>${Icon.chevron}
    </button>`;
}

function bindToday(view) {
  const plan = todayPlan();
  qsa('[data-go]', view).forEach((b) => b.addEventListener('click', () => start(b.dataset.go === 'alt' ? plan.alt : plan.main)));
  qs('[data-view="main"]', view)?.addEventListener('click', () => openRoutine(plan.main));
  qsa('[data-budget]', view).forEach((b) => b.addEventListener('click', () => {
    saveProfile({ budget: +b.dataset.budget });
    Sound.tap();
    paint();
  }));
  qsa('[data-sit]', view).forEach((b) => b.addEventListener('click', () => openRoutine(situationRoutine(b.dataset.sit))));
  qsa('[data-prog]', view).forEach((b) => b.addEventListener('click', () => openProgram(b.dataset.prog)));
  qsa('[data-tabgo]', view).forEach((b) => b.addEventListener('click', () => goTab(b.dataset.tabgo)));
  qs('[data-check]', view)?.addEventListener('click', () => openCheck());
  if (!plan.done) {
    // Für die Startkarte eine Übung ohne Wand oder Gurt – wirkt ruhiger
    const pick = plan.main.items.map((x) => exercise(x.id)).find((e) => e && !e.props && e.type === 'hold') || exercise(plan.main.items[0]?.id);
    const first = pick;
    mountFigure('hero', qs('#mz-hero-stage', view), first, 'L');
  }
}

// ---------- Pläne ----------
function renderPlans() {
  const p = getProfile();
  const active = activePrograms(p);
  const activeIds = new Set(active.map((a) => a.program.id));
  const prep = prepSeconds();
  const next = nextDeepId(p);
  const customs = customRoutines();
  return `
    <div class="mz-title"><h1>Pläne</h1><p>Ziele über 8 Wochen, tiefe Einheiten und Routinen für jede Situation.</p></div>

    <div class="mz-sec">Deine Ziele <span>${active.length}/2</span></div>
    ${active.length ? active.map((a) => programCard(a)).join('') : '<p class="mz-empty">Noch kein Ziel – wähle eins aus, dann passt sich deine tägliche Routine an.</p>'}
    <div class="mz-grid2">${PROGRAMS.filter((pr) => !activeIds.has(pr.id)).map((pr) => `
      <button class="mz-card mz-goal" data-prog="${pr.id}">
        <span class="mz-goal-icon">${pr.icon}</span>
        <strong>${escapeHtml(pr.name)}</strong>
        <span>${escapeHtml(pr.tagline)}</span>
      </button>`).join('')}</div>

    <div class="mz-sec">Tiefe Einheiten <span>${p.deepPerWeek ? `${p.deepPerWeek}× pro Woche` : 'aus'}</span></div>
    <div class="mz-list">${DEEP.map((d) => {
      const r = deepRoutine(d.id, p);
      return `
      <button class="mz-card mz-row" data-routine="${d.id}">
        <span class="mz-row-icon deep">${d.letter}</span>
        <span class="mz-row-text"><strong>${escapeHtml(d.short)}</strong><span>${mins(routineSeconds(r.items, prep))} · ${d.regions.map((x) => REGION[x].short).join(', ')}${d.id === next ? ' · <b>als Nächstes</b>' : ''}</span></span>${Icon.chevron}
      </button>`;
    }).join('')}</div>

    <div class="mz-sec">Für jede Situation</div>
    <div class="mz-list">
      <button class="mz-card mz-row" data-routine="daily">
        <span class="mz-row-icon">🌿</span>
        <span class="mz-row-text"><strong>Tägliche Routine</strong><span>${mins(routineSeconds(dailyRoutine().items, prep))} · Kern + Tagesfokus</span></span>${Icon.chevron}
      </button>
      ${SITUATIONS.map((s) => {
        const r = situationRoutine(s.id, p);
        return `
        <button class="mz-card mz-row" data-routine="${s.id}">
          <span class="mz-row-icon">${s.icon}</span>
          <span class="mz-row-text"><strong>${escapeHtml(s.name.split(' · ')[0])}${s.name.includes(' · ') ? ` <em>${escapeHtml(s.name.split(' · ')[1])}</em>` : ''}</strong><span>${mins(routineSeconds(r.items, prep))} · ${plural(r.items.length, 'Übung', 'Übungen')}</span></span>${Icon.chevron}
        </button>`;
      }).join('')}
    </div>

    <div class="mz-sec">Eigene Routinen</div>
    <div class="mz-list">${customs.map((r) => `
      <button class="mz-card mz-row" data-routine="${r.id}">
        <span class="mz-row-icon">✏️</span>
        <span class="mz-row-text"><strong>${escapeHtml(r.name)}</strong><span>${mins(routineSeconds(r.items.filter((x) => exercise(x.id)), prep))} · ${plural(r.items.length, 'Übung', 'Übungen')}</span></span>${Icon.chevron}
      </button>`).join('')}</div>
    <button class="mz-btn soft full" data-new>${Icon.plus} Eigene Routine bauen</button>`;
}

function bindPlans(view) {
  qsa('[data-prog]', view).forEach((b) => b.addEventListener('click', () => openProgram(b.dataset.prog)));
  qsa('[data-routine]', view).forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.routine;
    const r = id === 'daily' ? dailyRoutine() : DEEP.some((d) => d.id === id) ? deepRoutine(id) : situationRoutine(id) || customRoutine(id);
    openRoutine(r);
  }));
  qs('[data-new]', view)?.addEventListener('click', () => openEditor());
}

// ---------- Übungen ----------
let libFilter = { region: null, kind: null };
function renderLibrary() {
  const list = EXERCISES.filter((e) => (!libFilter.region || e.regions.includes(libFilter.region)) && (!libFilter.kind || e.kind === libFilter.kind));
  const counts = Object.fromEntries(REGIONS.map((r) => [r.id, EXERCISES.filter((e) => e.regions.includes(r.id)).length]));
  return `
    <div class="mz-title"><h1>Übungen</h1><p>${EXERCISES.length} Übungen mit 3D-Figur. Tippe eine Körperregion an.</p></div>
    <section class="mz-card mz-libmap">
      ${bodyMap(Object.fromEntries(REGIONS.map((r) => [r.id, libFilter.region === r.id ? 1 : 0.22])), { selected: libFilter.region, tap: true })}
      <div class="mz-libmap-label">${libFilter.region ? `<strong>${REGION[libFilter.region].name}</strong><span>${plural(counts[libFilter.region], 'Übung', 'Übungen')}</span><button class="mz-link" data-clear>Alle zeigen</button>` : '<strong>Alle Regionen</strong><span>Tippe auf die Karte</span>'}</div>
    </section>
    <div class="mz-filter">${[['', 'Alle'], ...Object.entries(KINDS).map(([k, v]) => [k, v.label])].map(([k, l]) => `<button data-kind="${k}" class="${(libFilter.kind || '') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="mz-tiles">${list.map((e) => `
      <button class="mz-tile" data-ex="${e.id}">
        ${thumb(e.id)}
        <strong>${escapeHtml(e.name)}</strong>
        <span>${KINDS[e.kind].label}${e.regions[0] ? ` · ${REGION[e.regions[0]].short}` : ''}</span>
      </button>`).join('') || '<p class="mz-empty">Keine Übung für diese Auswahl.</p>'}</div>`;
}

function bindLibrary(view) {
  qsa('[data-region]', view).forEach((r) => r.addEventListener('click', () => {
    libFilter.region = libFilter.region === r.dataset.region ? null : r.dataset.region;
    Sound.tap();
    paint();
  }));
  qs('[data-clear]', view)?.addEventListener('click', () => { libFilter.region = null; paint(); });
  qsa('[data-kind]', view).forEach((b) => b.addEventListener('click', () => { libFilter.kind = b.dataset.kind || null; paint(); }));
  qsa('[data-ex]', view).forEach((b) => b.addEventListener('click', () => openExercise(b.dataset.ex)));
}

// ---------- Fortschritt ----------
function renderProgress() {
  const p = getProfile();
  const vol = regionVolume();
  const targets = regionTargets(p);
  const stats = weekStats();
  const all = log();
  const done = all.filter(counted);
  const totalSec = all.reduce((n, s) => n + (s.seconds || 0), 0);
  const rows = [...REGIONS].sort((a, b) => (vol[a.id] / targets[a.id]) - (vol[b.id] / targets[b.id]));

  // Kalender: die letzten 12 Wochen, Minuten pro Tag
  const monday = mondayOf();
  const perDay = new Map();
  all.forEach((s) => {
    const k = startOfDay(new Date(s.startedAt)).getTime();
    perDay.set(k, (perDay.get(k) || 0) + (s.seconds || 0));
  });
  const weeks = 12;
  const cal = Array.from({ length: weeks }, (_, w) => {
    const m = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (weeks - 1 - w) * 7);
    return Array.from({ length: 7 }, (_, d) => {
      const day = new Date(m.getFullYear(), m.getMonth(), m.getDate() + d);
      const secs = perDay.get(day.getTime()) || 0;
      const future = day > new Date();
      const lvl = future ? -1 : secs === 0 ? 0 : secs < 300 ? 1 : secs < 720 ? 2 : 3;
      return `<i class="l${lvl}" title="${day.getDate()}.${day.getMonth() + 1}."></i>`;
    }).join('');
  });

  const chks = checks();
  const first = chks[0];
  const last = chks[chks.length - 1];
  const due = checkDue();
  const checkRows = last ? CHECKS.filter((c) => last.results[c.id] !== undefined).map((c) => {
    const now = last.results[c.id];
    const before = first.results[c.id];
    const score = (v) => (c.sides ? Math.round((v.L + v.R) / 2) : v);
    const delta = chks.length > 1 && before !== undefined ? score(now) - score(before) : 0;
    const label = c.sides ? `L ${now.L} · R ${now.R} cm` : c.options[now];
    const series = chks.map((x) => x.results[c.id]).filter((v) => v !== undefined).map(score);
    const max = c.sides ? c.max : c.options.length - 1;
    return `
      <div class="mz-test">
        <div><strong>${c.name}</strong><span>${escapeHtml(label)}</span></div>
        ${series.length > 1 ? `<svg class="mz-spark" viewBox="0 0 60 22" preserveAspectRatio="none"><polyline points="${series.map((v, i) => `${(i / (series.length - 1)) * 60},${20 - (v / max) * 18}`).join(' ')}"/></svg>` : ''}
        ${delta ? `<em class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'}${c.sides ? ` ${Math.abs(delta)} cm` : ''}</em>` : ''}
      </div>`;
  }).join('') : '';

  const recent = [...all].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8);

  return `
    <div class="mz-title"><h1>Fortschritt</h1><p>Was diese Woche schon drin ist – und was sich über die Wochen tut.</p></div>
    <div class="mz-stats">
      <div><b>${stats.count}<small>/${stats.goal}</small></b><span>Tage diese Woche</span></div>
      <div><b>${stats.streak}</b><span>${stats.streak === 1 ? 'Woche' : 'Wochen'} in Folge</span></div>
      <div><b>${done.length}</b><span>Einheiten</span></div>
      <div><b>${Math.round(totalSec / 60)}</b><span>Minuten gesamt</span></div>
    </div>

    <div class="mz-sec">Wochenminuten pro Region</div>
    <section class="mz-card mz-volume">
      ${bodyMap(Object.fromEntries(REGIONS.map((r) => [r.id, Math.min(1, vol[r.id] / targets[r.id])])))}
      <div class="mz-vol-list">${rows.map((r) => {
        const v = vol[r.id];
        const t = targets[r.id];
        return `<div class="mz-vol ${v >= t ? 'ok' : ''}"><span>${r.name}${t > 300 ? ' <em>Ziel</em>' : ''}</span><span class="mz-bar"><i style="transform:scaleX(${Math.min(1, v / t)})"></i></span><b>${Math.round(v / 60)}<small>/${Math.round(t / 60)}</small></b></div>`;
      }).join('')}</div>
      <p class="mz-note">Minuten pro Seite. Ab etwa 5 Minuten pro Woche wird eine Region beweglicher, rund 10 sind optimal – für die Regionen deiner Ziele ist deshalb 10 das Ziel.</p>
    </section>

    <div class="mz-sec">Die letzten 12 Wochen</div>
    <section class="mz-card mz-cal">
      <div class="mz-cal-days">${LETTERS.map((l) => `<span>${l}</span>`).join('')}</div>
      <div class="mz-cal-grid" style="--weeks:${weeks}">${cal.map((w) => `<div>${w}</div>`).join('')}</div>
      <div class="mz-cal-legend"><span>weniger</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><span>mehr</span></div>
    </section>

    <div class="mz-sec">Beweglichkeits-Tests ${last ? `<span>${chks.length > 1 ? `seit ${new Date(first.date).toLocaleDateString('de-DE')}` : 'erster Test'}</span>` : ''}</div>
    <section class="mz-card mz-tests">
      ${checkRows || '<p class="mz-empty">Noch kein Test. Mach ihn jetzt und alle vier Wochen wieder – so siehst du schwarz auf weiß, was sich tut.</p>'}
      <button class="mz-btn ${due.due ? 'primary' : 'soft'} full" data-check>${Icon.chart} ${due.first ? 'Ersten Test machen' : due.due ? 'Test machen – fällig' : `Test wiederholen · nächster in ${CHECK_INTERVAL_DAYS - due.age} Tagen`}</button>
    </section>

    <div class="mz-sec">Verlauf</div>
    <div class="mz-list">${recent.map((s) => {
      const d = new Date(s.startedAt);
      const regs = Object.entries(sessionRegions(s)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => REGION[r]?.short).filter(Boolean);
      return `<div class="mz-card mz-row static">
        <span class="mz-row-icon ${s.kind === 'deep' ? 'deep' : ''}">${s.kind === 'deep' ? DEEP.find((x) => x.id === s.routineId)?.letter || 'T' : counted(s) ? '✓' : '·'}</span>
        <span class="mz-row-text"><strong>${escapeHtml(s.name)}</strong><span>${d.getDate()}.${d.getMonth() + 1}. · ${mins(s.seconds || 0)}${regs.length ? ` · ${regs.join(', ')}` : ''}</span></span>
      </div>`;
    }).join('') || '<p class="mz-empty">Noch keine Einheit.</p>'}</div>`;
}

function bindProgress(view) {
  qsa('[data-check]', view).forEach((b) => b.addEventListener('click', () => openCheck()));
}

// ---------- Routine ansehen ----------
function itemTag(x) {
  if (x.mode === 'pnf') return '<em class="mz-tag pnf">Anspannen-Loslassen</em>';
  if (x.mode === 'active' || exercise(x.id)?.kind === 'active') return '<em class="mz-tag active">Aktiv</em>';
  if (x.goal) return `<em class="mz-tag goal">Ziel: ${escapeHtml(PROGRAM[x.goal]?.short || '')}</em>`;
  if (x.focus) return '<em class="mz-tag focus">Fokus</em>';
  if (x.from) return '<em class="mz-tag up">Stufe höher</em>';
  return '';
}
function itemRow(x) {
  const ex = exercise(x.id);
  return `
    <button class="mz-item" data-ex="${ex.id}">
      ${thumb(ex.id, 'small')}
      <span class="mz-item-text"><strong>${escapeHtml(ex.name)}</strong>
        <span>${x.mode === 'pnf' ? `${PNF_SECONDS} s` : `${x.seconds} s`}${ex.sides ? ' pro Seite' : ''} ${itemTag(x)}</span></span>
      ${Icon.chevron}
    </button>`;
}

export function openRoutine(r) {
  if (!r) return;
  const prep = prepSeconds();
  const regions = routineRegions(r.items);
  let groups;
  if (r.kind === 'daily') {
    groups = [
      ['Kern · jeden Tag', r.items.filter((x) => !x.focus && !x.goal)],
      [`Fokus heute · ${r.focus.name}`, r.items.filter((x) => x.focus)],
      ['Für deine Ziele', r.items.filter((x) => x.goal)],
    ];
  } else if (r.items.some((x) => x.section)) {
    const order = [];
    r.items.forEach((x) => { if (!order.includes(x.section)) order.push(x.section); });
    groups = order.map((sec) => [sec, r.items.filter((x) => x.section === sec)]);
  } else groups = [['Ablauf', r.items]];

  sheet(escapeHtml(r.name), `
    <div class="mz-rsum">
      <div><b>${mins(routineSeconds(r.items, prep))}</b><span>inkl. Pausen</span></div>
      <div><b>${r.items.length}</b><span>Übungen</span></div>
      <div><b>${regions.length}</b><span>Regionen</span></div>
    </div>
    ${r.description ? `<p class="mz-desc">${escapeHtml(r.description)}</p>` : ''}
    ${regionChips(regions)}
    ${groups.filter(([, list]) => list.length).map(([title, list]) => `
      <div class="mz-sec small">${escapeHtml(title)}</div>
      <div class="mz-items">${list.map(itemRow).join('')}</div>`).join('')}
    ${r.kind === 'deep' ? '<p class="mz-note">Anspannen-Loslassen: in der Dehnung 6 Sekunden sanft gegenhalten (etwa 30 % Kraft), loslassen und tiefer sinken – drei Durchgänge, die Stimme sagt an.</p>' : ''}`, {
    footer: `<button class="mz-btn primary full" data-go data-nosound>${Icon.play} Starten</button>${r.kind === 'custom' ? '<button class="btn btn-ghost full" data-edit>Bearbeiten</button>' : ''}`,
    onMount: (root) => {
      qs('[data-go]', root).addEventListener('click', () => start(r));
      qs('[data-edit]', root)?.addEventListener('click', () => openEditor(customRoutines().find((x) => x.id === r.id)));
      qsa('[data-ex]', root).forEach((b) => b.addEventListener('click', () => openExercise(b.dataset.ex, () => openRoutine(r))));
    },
  });
}

// ---------- Übung im Detail ----------
export function openExercise(id, back = null) {
  const ex = exercise(id);
  if (!ex) return;
  let side = 'L';
  const variant = (vid, label) => {
    const v = exercise(vid);
    return v ? `<button class="mz-variant" data-ex-go="${v.id}">${thumb(v.id, 'small')}<span><em>${label}</em><strong>${escapeHtml(v.name)}</strong></span>${Icon.chevron}</button>` : '';
  };
  const usedIn = [...DEEP.map((d) => [d.short, d.items]), ...SITUATIONS.map((s) => [s.short, s.items])]
    .filter(([, items]) => items.some((x) => x.id === id)).map(([n]) => n);
  sheet(escapeHtml(ex.name), `
    <div class="mz-stage mz-stage-sheet" id="mz-ex-stage">
      <span class="mz-rotate">${Icon.rotate} Drehen</span>
      ${ex.sides ? '<div class="mz-sides"><button class="on" data-side="L">Links</button><button data-side="R">Rechts</button></div>' : ''}
    </div>
    <div class="mz-pills">
      <span class="mz-pill kind-${ex.kind}">${KINDS[ex.kind].label}</span>
      ${ex.regions.map((r) => `<span class="mz-pill">${REGION[r].name}</span>`).join('')}
      ${ex.sides ? '<span class="mz-pill">pro Seite</span>' : ''}
    </div>
    <p class="mz-why">${ex.why}</p>
    ${ex.feel ? `<div class="mz-feel"><span>Hier spürst du es</span><strong>${escapeHtml(ex.feel)}</strong></div>` : ''}
    ${ex.tempo ? `<p class="mz-note">Tempo: ${escapeHtml(ex.tempo)}</p>` : ''}
    <ol class="mz-cues">${ex.cues.map((c) => `<li>${c}</li>`).join('')}</ol>
    <div class="mz-hints">
      <div class="warn"><span>Achte darauf</span><p>${ex.mistakes.join(' ')}</p></div>
      <div><span>Leichter</span><p>${ex.easier}</p></div>
      <div><span>Schwerer</span><p>${ex.harder}</p></div>
      ${ex.pnf ? `<div class="pnf"><span>Anspannen-Loslassen</span><p>${ex.pnf}</p></div>` : ''}
    </div>
    ${ex.harder && exercise(ex.harder) || ex.easier && exercise(ex.easier) ? `<div class="mz-sec small">Varianten</div>${variant(ex.easier, 'Leichtere Stufe')}${variant(ex.harder, 'Nächste Stufe')}` : ''}
    ${usedIn.length ? `<p class="mz-note">Kommt vor in: ${usedIn.map(escapeHtml).join(', ')}</p>` : ''}`, {
    footer: `<button class="mz-btn primary full" data-single data-nosound>${Icon.play} Einzeln üben · ${ex.seconds} s${ex.sides ? ' pro Seite' : ''}</button>`,
    onDismiss: back,
    onMount: (root) => {
      mountFigure('sheet', qs('#mz-ex-stage', root), ex, side);
      qsa('[data-side]', root).forEach((b) => b.addEventListener('click', () => {
        side = b.dataset.side;
        qsa('[data-side]', root).forEach((x) => x.classList.toggle('on', x === b));
        mountFigure('sheet', qs('#mz-ex-stage', root), ex, side);
      }));
      qsa('[data-ex-go]', root).forEach((b) => b.addEventListener('click', () => openExercise(b.dataset.exGo, () => openExercise(id, back))));
      qs('[data-single]', root).addEventListener('click', () => start({ id: null, kind: 'single', name: ex.name, items: [{ id: ex.id, seconds: ex.seconds }] }));
    },
  });
}

// ---------- Programm ----------
function openProgram(id) {
  const pr = PROGRAM[id];
  const active = activePrograms().find((a) => a.program.id === id);
  const full = !active && activePrograms().length >= 2;
  sheet(`${pr.icon} ${escapeHtml(pr.name)}`, `
    <p class="mz-why">${escapeHtml(pr.description)}</p>
    ${active ? `
      <div class="mz-prog-now">
        <div><b>${active.finished ? '✓' : active.week}</b><span>${active.finished ? 'geschafft' : `Woche von ${PROGRAM_WEEKS}`}</span></div>
        <span class="mz-bar"><i style="transform:scaleX(${Math.min(1, active.days / (PROGRAM_WEEKS * 7))})"></i></span>
      </div>` : ''}
    <div class="mz-sec small">So läuft es</div>
    <div class="mz-phases">${pr.phases.map((ph) => `
      <div class="mz-phase ${active && active.week >= ph.from && active.week <= ph.to ? 'now' : ''}">
        <span class="mz-phase-w">Wo ${ph.from}–${ph.to}</span>
        <div><strong>${ph.name}</strong><p>${escapeHtml(ph.text)}</p>
          <span class="mz-phase-ex">Täglich dazu: ${ph.daily.map((x) => escapeHtml(exercise(x.id).name)).join(', ')}</span></div>
      </div>`).join('')}</div>
    <div class="mz-sec small">Außerdem</div>
    <ul class="mz-bullets">
      <li>Die Regionen ${pr.regions.map((r) => `<b>${REGION[r].short}</b>`).join(', ')} bekommen 10 statt 5 Minuten als Wochenziel.</li>
      <li>Bevorzugte tiefe Einheit: ${pr.deep.map((d) => DEEP.find((x) => x.id === d).short).join(' und ')}.</li>
      <li>Dein Fortschritt zeigt sich im Test: ${pr.tests.map((t) => CHECK[t].name).join(', ')}.</li>
    </ul>
    ${full ? '<p class="mz-note">Du hast schon zwei Ziele. Beim Start wird das ältere beendet – mehr als zwei gleichzeitig verwässert es.</p>' : ''}`, {
    footer: active
      ? `<button class="btn btn-ghost danger full" data-stop>Ziel beenden</button>`
      : `<button class="mz-btn primary full" data-startprog>${Icon.target} Ziel starten · 8 Wochen</button>`,
    onMount: (root) => {
      qs('[data-startprog]', root)?.addEventListener('click', () => {
        startProgram(id);
        Sound.record();
        ctx.closeSheet();
        ctx.toast(`Ziel gestartet: ${pr.name}`);
        paint();
      });
      qs('[data-stop]', root)?.addEventListener('click', () => {
        if (!confirm(`„${pr.name}“ beenden?`)) return;
        stopProgram(id);
        ctx.closeSheet();
        paint();
      });
    },
  });
}

// ---------- Eigene Routine ----------
function openEditor(existing = null) {
  const r = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), name: 'Meine Routine', items: [], custom: true };
  let pickRegion = 'hipflex';
  const draw = () => `
    <label class="field-label">Name</label>
    <input type="text" class="text-input" id="mz-rname" value="${escapeHtml(r.name)}" />
    <p class="mz-note">${plural(r.items.length, 'Übung', 'Übungen')} · ${mins(routineSeconds(r.items.filter((x) => exercise(x.id)), prepSeconds()))}</p>
    <div class="mz-items edit">${r.items.map((x, i) => {
      const ex = exercise(x.id);
      if (!ex) return '';
      return `<div class="mz-item">
        ${thumb(ex.id, 'small')}
        <span class="mz-item-text"><strong>${escapeHtml(ex.name)}</strong>
          <span class="mz-step"><button data-sec="${i}" data-d="-15" aria-label="Kürzer">−</button><b>${x.seconds} s</b><button data-sec="${i}" data-d="15" aria-label="Länger">+</button>${ex.sides ? '<em>pro Seite</em>' : ''}</span></span>
        <button class="mz-mini" data-up="${i}" aria-label="Nach oben">${Icon.toTop}</button>
        <button class="mz-mini" data-rm="${i}" aria-label="Entfernen">${Icon.close}</button>
      </div>`;
    }).join('') || '<p class="mz-empty">Unten Übungen antippen.</p>'}</div>
    <div class="mz-sec small">Hinzufügen</div>
    <div class="mz-filter scroll">${REGIONS.map((reg) => `<button data-pr="${reg.id}" class="${pickRegion === reg.id ? 'on' : ''}">${reg.short}</button>`).join('')}</div>
    <div class="mz-items">${EXERCISES.filter((e) => e.regions.includes(pickRegion)).map((e) => `
      <button class="mz-item" data-add="${e.id}">${thumb(e.id, 'small')}<span class="mz-item-text"><strong>${escapeHtml(e.name)}</strong><span>${KINDS[e.kind].label} · ${e.seconds} s${e.sides ? ' pro Seite' : ''}</span></span><span class="mz-plus">${Icon.plus}</span></button>`).join('')}</div>`;
  const persist = () => {
    const list = customRoutines().filter((x) => x.id !== r.id);
    saveCustomRoutines([...list, r]);
  };
  const mount = () => remount(() => sheet(existing ? 'Routine bearbeiten' : 'Eigene Routine', draw(), {
    footer: `<button class="mz-btn primary full" data-save ${r.items.length ? '' : 'disabled'}>Speichern</button>${existing ? `<button class="btn btn-ghost danger full" data-del>${Icon.trash} Löschen</button>` : ''}`,
    onMount: (root) => {
      qs('#mz-rname', root).addEventListener('input', (e) => { r.name = e.target.value; });
      qsa('[data-sec]', root).forEach((b) => b.addEventListener('click', () => {
        const x = r.items[+b.dataset.sec];
        x.seconds = Math.max(15, Math.min(180, x.seconds + +b.dataset.d));
        mount();
      }));
      qsa('[data-up]', root).forEach((b) => b.addEventListener('click', () => {
        const i = +b.dataset.up;
        if (i > 0) { [r.items[i - 1], r.items[i]] = [r.items[i], r.items[i - 1]]; mount(); }
      }));
      qsa('[data-rm]', root).forEach((b) => b.addEventListener('click', () => { r.items.splice(+b.dataset.rm, 1); Sound.remove(); mount(); }));
      qsa('[data-pr]', root).forEach((b) => b.addEventListener('click', () => { pickRegion = b.dataset.pr; mount(); }));
      qsa('[data-add]', root).forEach((b) => b.addEventListener('click', () => {
        const ex = exercise(b.dataset.add);
        r.items.push({ id: ex.id, seconds: ex.seconds });
        Sound.setDone();
        mount();
      }));
      qs('[data-save]', root)?.addEventListener('click', () => {
        r.name = r.name.trim() || 'Meine Routine';
        persist();
        ctx.closeSheet();
        ctx.toast('Routine gespeichert');
        if (A) paint();
      });
      qs('[data-del]', root)?.addEventListener('click', () => {
        if (!confirm(`„${r.name}“ löschen?`)) return;
        saveCustomRoutines(customRoutines().filter((x) => x.id !== r.id));
        ctx.closeSheet();
        if (A) paint();
      });
    },
  }));
  mount();
}

// ---------- Einstellungen ----------
function openSettings() {
  const s = Store.getSettings();
  const p = getProfile();
  const seg = (key, values, current, fmt = (v) => v) => `<div class="mz-seg" data-seg="${key}">${values.map((v) => `<button data-v="${v}" class="${v === current ? 'on' : ''}">${fmt(v)}</button>`).join('')}</div>`;
  sheet('Mobility-Einstellungen', `
    <div class="mz-set"><strong>Wochenziel</strong><span>An wie vielen Tagen pro Woche?</span>${seg('mobilityGoal', [3, 4, 5, 6, 7], s.mobilityGoal, (v) => `${v}×`)}</div>
    <div class="mz-set"><strong>Zeit für die tägliche Routine</strong><span>Kürzer heißt: Zeiten schrumpfen, unwichtigere Übungen fallen weg.</span>${seg('budget', [5, 10, 15, 20], p.budget, (v) => `${v} Min`)}</div>
    <div class="mz-set"><strong>Tiefe Einheiten pro Woche</strong><span>30–35 Minuten, ersetzen an dem Tag die tägliche Routine.</span>${seg('deepPerWeek', [0, 1, 2, 3], p.deepPerWeek, (v) => (v ? `${v}×` : 'Aus'))}</div>
    <div class="mz-set"><strong>Bevorzugte Tage</strong><span>Am besten nicht direkt vor dem Beintraining.</span>
      <div class="mz-seg multi" data-days>${LETTERS.map((l, i) => `<button data-day="${i}" class="${p.deepDays.includes(i) ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="mz-set"><strong>Vorbereitung vor jeder Übung</strong>${seg('mobilityPrep', [5, 10, 15], s.mobilityPrep, (v) => `${v} s`)}</div>
    <div class="mz-set row"><div><strong>Sprachansage</strong><span>Übung, Seitenwechsel, Atmung und Anspannen-Loslassen.</span></div>
      <label class="toggle"><input type="checkbox" id="mz-voice" ${s.mobilityVoice ? 'checked' : ''}/><span class="toggle-track"></span></label></div>
    <div class="mz-set row"><div><strong>Karte auf der Startseite</strong><span>Mobility-Karte im Gym- und Fight-Modus.</span></div>
      <label class="toggle"><input type="checkbox" id="mz-card" ${s.mobility ? 'checked' : ''}/><span class="toggle-track"></span></label></div>`, {
    onMount: (root) => {
      qsa('[data-seg]', root).forEach((sg) => qsa('button', sg).forEach((b) => b.addEventListener('click', () => {
        const key = sg.dataset.seg;
        const v = +b.dataset.v;
        if (key === 'budget' || key === 'deepPerWeek') saveProfile({ [key]: v });
        else Store.saveSettings({ ...Store.getSettings(), [key]: v });
        qsa('button', sg).forEach((x) => x.classList.toggle('on', x === b));
        if (A) paint();
      })));
      qsa('[data-day]', root).forEach((b) => b.addEventListener('click', () => {
        const d = +b.dataset.day;
        const days = new Set(getProfile().deepDays);
        if (days.has(d)) days.delete(d); else days.add(d);
        saveProfile({ deepDays: [...days].sort() });
        b.classList.toggle('on', days.has(d));
        if (A) paint();
      }));
      qs('#mz-voice', root).addEventListener('change', (e) => Store.saveSettings({ ...Store.getSettings(), mobilityVoice: e.target.checked }));
      qs('#mz-card', root).addEventListener('change', (e) => Store.saveSettings({ ...Store.getSettings(), mobility: e.target.checked }));
    },
  });
}

// ---------- Beweglichkeits-Test ----------
export function openCheck(step = 0, answers = {}, ids = checkSelection()) {
  const test = CHECK[ids[step]];
  const last = checks().slice(-1)[0];
  const ex = exercise(test.exercise);
  const value = answers[test.id] ?? (test.sides ? { ...(last?.results[test.id] || { L: 8, R: 8 }) } : null);
  answers[test.id] = value;
  const isLast = step === ids.length - 1;
  const input = test.sides
    ? `<div class="mz-cm">${['L', 'R'].map((sd) => `
        <div><span>${sd === 'L' ? 'Links' : 'Rechts'}</span>
          <span class="mz-step big"><button data-cm="${sd}" data-d="-1" aria-label="Weniger">−</button><b data-v="${sd}">${value[sd]} cm</b><button data-cm="${sd}" data-d="1" aria-label="Mehr">+</button></span></div>`).join('')}</div>
      <p class="mz-note">Richtwert: ab etwa ${test.good} cm gilt das Sprunggelenk als gut beweglich.</p>`
    : `<div class="mz-options">${test.options.map((o, i) => `<button class="${value === i ? 'on' : ''}" data-opt="${i}"><i></i>${escapeHtml(o)}</button>`).join('')}</div>`;
  sheet(`Test ${step + 1}/${ids.length} · ${test.name}`, `
    <div class="mz-stage mz-stage-sheet" id="mz-check-stage"></div>
    <p class="mz-why">${test.how}</p>
    <div class="mz-sec small">${test.question}</div>
    ${input}`, {
    footer: `<button class="mz-btn primary full" data-next ${value === null ? 'disabled' : ''}>${isLast ? 'Ergebnis speichern' : 'Weiter'}</button>`,
    onDismiss: step > 0 ? () => openCheck(step - 1, answers, ids) : null,
    onMount: (root) => {
      mountFigure('sheet', qs('#mz-check-stage', root), ex, 'L');
      const next = qs('[data-next]', root);
      qsa('[data-opt]', root).forEach((b) => b.addEventListener('click', () => {
        answers[test.id] = +b.dataset.opt;
        qsa('[data-opt]', root).forEach((x) => x.classList.toggle('on', x === b));
        next.disabled = false;
        Sound.setDone();
      }));
      qsa('[data-cm]', root).forEach((b) => b.addEventListener('click', () => {
        const v = answers[test.id];
        v[b.dataset.cm] = Math.max(test.min, Math.min(test.max, v[b.dataset.cm] + +b.dataset.d));
        qs(`[data-v="${b.dataset.cm}"]`, root).textContent = `${v[b.dataset.cm]} cm`;
      }));
      next.addEventListener('click', () => {
        if (!isLast) { openCheck(step + 1, answers, ids); return; }
        Store.addMobilityCheck({ id: uid(), date: new Date().toISOString(), results: answers });
        Sound.record();
        ctx.closeSheet();
        ctx.toast('Test gespeichert');
        if (A) { A.tab = 'progress'; paint(); }
      });
    },
  });
}

export { mzTheme, bodyMap, weekStrip };
