// Mobility: dezente Karte auf der Startseite, Übersicht mit Routinen und
// Übungen, geführter Ablauf mit 3D-Figur und der Beweglichkeits-Check.
//
// Zählt bewusst nicht als Training: eigene Einheiten, eigenes Wochenziel.
// Die 3D-Darstellung (three.js, ~700 KB) wird erst geladen, wenn der
// Bereich geöffnet wird – der Start der App bleibt davon unberührt.

import { Store, uid } from './storage.js';
import { Icon } from './icons.js';
import { Sound } from './sound.js';
import { escapeHtml, plural, formatDate, daysAgo } from './utils.js';
import {
  MOBILITY_EXERCISES, MOBILITY_AREAS, DEFAULT_MOBILITY_ROUTINES, MOBILITY_CHECKS,
  CHECK_INTERVAL_DAYS, MOBILITY_GUIDE, BREATH, mobilityExercise,
} from './mobility-data.js';

// Vom Hauptmodul gereicht: openSheet, closeSheet, toast, render,
// enableDragReorder, dropIn, prefersReducedMotion
let ctx = null;
export function initMobility(context) { ctx = context; }

const qs = (sel, parent = document) => parent.querySelector(sel);
const qsa = (sel, parent = document) => [...parent.querySelectorAll(sel)];

const SWITCH_SECONDS = 6;
const COUNT_MIN_SECONDS = 180; // ab 3 Minuten Dehnzeit zählt eine Einheit
const GOALS = [3, 4, 5, 6, 7];
const PREPS = [5, 10, 15];

// ---------- 3D (lazy) ----------
let figureModule = null;
function loadFigure() {
  if (!figureModule) figureModule = import('./mobility-figure.js');
  return figureModule;
}
let liveStage = null;
async function stage() {
  const m = await loadFigure();
  if (!liveStage) liveStage = new m.FigureStage();
  liveStage.applyTheme();
  return liveStage;
}

// Standbilder für die Übersicht: einmal gerendert, danach aus dem Speicher.
let thumbStage = null;
const thumbCache = new Map();
function themeKey() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return `${getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()}:${dark}`;
}
async function fillThumbs(root) {
  const imgs = qsa('img[data-thumb]', root);
  if (!imgs.length) return;
  const m = await loadFigure();
  if (!thumbStage) thumbStage = new m.FigureStage({ thumb: true });
  thumbStage.applyTheme();
  const key = themeKey();
  for (const img of imgs) {
    const ex = mobilityExercise(img.dataset.thumb);
    if (!ex) continue;
    const cacheKey = `${ex.id}:${key}`;
    if (!thumbCache.has(cacheKey)) {
      // Ein Bild pro Frame – sonst stockt das Öffnen des Sheets.
      await new Promise((r) => requestAnimationFrame(r));
      thumbCache.set(cacheKey, thumbStage.snapshot(ex, 'L', 240));
    }
    if (!img.isConnected) continue;
    img.src = thumbCache.get(cacheKey);
    img.classList.add('loaded');
  }
}
const thumbImg = (id, cls = '') => `<img class="mob-thumb ${cls}" data-thumb="${id}" alt="" />`;

// ---------- Daten ----------
function clone(v) { return JSON.parse(JSON.stringify(v)); }

function routines() {
  return Store.getMobilityRoutines() || clone(DEFAULT_MOBILITY_ROUTINES);
}
function saveRoutines(list) { Store.saveMobilityRoutines(list); }
function routineById(id) { return routines().find((r) => r.id === id) || null; }

function validItems(items) {
  return (items || []).filter((it) => mobilityExercise(it.id));
}

function routineSeconds(r) {
  const prep = Store.getSettings().mobilityPrep;
  return validItems(r.items).reduce((n, it) => {
    const ex = mobilityExercise(it.id);
    return n + prep + it.seconds * (ex.sides ? 2 : 1) + (ex.sides ? SWITCH_SECONDS : 0);
  }, 0);
}
const minutes = (sec) => `${Math.max(1, Math.round(sec / 60))} Min`;
const shortName = (r) => r.name.split(' · ')[0];

function counted(session) {
  return session.completed || session.seconds >= COUNT_MIN_SECONDS;
}

function dayOf(iso) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function weekStats() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const goal = Store.getSettings().mobilityGoal;
  const days = Array.from({ length: 7 }, () => false);
  const log = Store.getMobilityLog().filter(counted);
  log.forEach((s) => {
    const d = new Date(s.startedAt);
    if (d >= monday) days[(d.getDay() + 6) % 7] = true;
  });
  const todayIndex = (now.getDay() + 6) % 7;
  // Wochen in Folge mit erreichtem Ziel (die laufende zählt erst, wenn sie steht)
  const perWeek = new Map();
  log.forEach((s) => {
    const d = new Date(s.startedAt);
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
    if (!perWeek.has(m)) perWeek.set(m, new Set());
    perWeek.get(m).add(dayOf(s.startedAt));
  });
  const count = days.filter(Boolean).length;
  let streak = count >= goal ? 1 : 0;
  let cursor = monday;
  for (;;) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
    if ((perWeek.get(cursor.getTime())?.size || 0) < goal) break;
    streak += 1;
  }
  return { days, count, goal, todayIndex, today: days[todayIndex], streak };
}

export function mobilityDoneToday() {
  return weekStats().today;
}

function suggestedRoutine() {
  const last = Store.getSettings().mobilityLastRoutine;
  return routines().find((r) => r.id === last && validItems(r.items).length)
    || routines().find((r) => validItems(r.items).length)
    || null;
}

function weekDotsHtml(stats, cls = '') {
  const letters = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
  return `<div class="mob-week-dots ${cls}">${letters.map((l, i) => `
    <span class="mob-day ${stats.days[i] ? 'on' : ''} ${i === stats.todayIndex ? 'today' : ''}"><i></i>${l}</span>`).join('')}</div>`;
}

// ---------- Startseite ----------
export function renderMobilityCard() {
  if (!Store.getSettings().mobility) return '';
  const stats = weekStats();
  const r = suggestedRoutine();
  const sub = stats.today
    ? `Heute erledigt · ${stats.count}/${stats.goal} diese Woche`
    : `${stats.count}/${stats.goal} diese Woche${r ? ` · ${escapeHtml(shortName(r))}, ${minutes(routineSeconds(r))}` : ''}`;
  return `
    <section class="card mob-card ${stats.today ? 'done' : ''}">
      <button class="mob-card-main" data-action="open-mobility">
        <span class="mob-card-icon">${stats.today ? Icon.check : Icon.mobility}</span>
        <span class="mob-card-text"><strong>Mobility</strong><span class="muted small">${sub}</span></span>
      </button>
      ${r ? `<button class="mob-card-play" data-action="mob-quickstart" aria-label="${escapeHtml(r.name)} starten">${Icon.play}</button>` : ''}
    </section>`;
}

export function bindMobilityCard(root = document) {
  qs('[data-action="open-mobility"]', root)?.addEventListener('click', () => openMobilitySheet());
  qs('[data-action="mob-quickstart"]', root)?.addEventListener('click', () => {
    const r = suggestedRoutine();
    if (r) startSession(r);
  });
}

// Für die Zusammenfassung nach dem Training: kurze Routine direkt starten.
export function startMobilityRoutine(id) {
  const r = routineById(id) || suggestedRoutine();
  if (r) startSession(r);
}

// ---------- Übersicht ----------
function checkSummaryHtml() {
  const checks = Store.getMobilityChecks();
  if (!checks.length) {
    return `
      <div class="card mob-check-card">
        <p class="mob-check-intro">Wie beweglich bist du gerade? Vier kurze Tests, etwa drei Minuten.
          Alle vier Wochen wiederholt, zeigen sie schwarz auf weiß, was die Arbeit bringt.</p>
        <button class="btn btn-secondary full" data-action="mob-check">${Icon.chart} Check starten</button>
      </div>`;
  }
  const last = checks[checks.length - 1];
  const first = checks[0];
  const age = daysAgo(last.date);
  const due = age >= CHECK_INTERVAL_DAYS;
  const rows = MOBILITY_CHECKS.map((test) => {
    const now = last.results[test.id];
    if (now === undefined) return '';
    const delta = checks.length > 1 ? checkScore(test, now) - checkScore(test, first.results[test.id]) : 0;
    const trend = checks.length > 1 && first.results[test.id] !== undefined
      ? `<span class="mob-trend ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '▲' : delta < 0 ? '▼' : '='} ${test.sides ? `${delta > 0 ? '+' : ''}${delta} cm` : ''}</span>`
      : '';
    return `<div class="mob-check-row"><span>${test.name}</span><strong>${checkLabel(test, now)}</strong>${trend}</div>`;
  }).join('');
  return `
    <div class="card mob-check-card">
      ${rows}
      <p class="muted small mob-check-meta">${checks.length > 1 ? `Vergleich mit deinem ersten Check vom ${formatDate(first.date)}. ` : ''}
        Letzter Check ${age === 0 ? 'heute' : age === 1 ? 'gestern' : `vor ${age} Tagen`} · ${due ? 'wieder fällig' : `nächster in ${CHECK_INTERVAL_DAYS - age} Tagen`}</p>
      <button class="btn ${due ? 'btn-primary' : 'btn-secondary'} full" data-action="mob-check">${Icon.chart} ${due ? 'Check jetzt machen' : 'Check wiederholen'}</button>
    </div>`;
}

function checkLabel(test, value) {
  if (test.sides) return `L ${value.L} · R ${value.R} cm`;
  return test.options[value] ?? '–';
}
function checkScore(test, value) {
  if (value === undefined) return 0;
  if (test.sides) return Math.round((value.L + value.R) / 2);
  return value;
}

function overviewHtml() {
  const settings = Store.getSettings();
  const stats = weekStats();
  const list = routines();
  const coach = stats.today
    ? (stats.count >= stats.goal ? 'Wochenziel steht. Alles darüber hinaus ist Bonus.' : 'Heute erledigt. Morgen wieder – die Regelmäßigkeit macht den Unterschied.')
    : stats.count >= stats.goal ? 'Wochenziel steht – heute ist Bonus.'
      : `Noch ${plural(stats.goal - stats.count, 'Einheit', 'Einheiten')} bis zum Wochenziel.`;

  const routineRows = list.map((r) => {
    const items = validItems(r.items);
    return `
      <div class="list-item mob-routine" data-id="${r.id}">
        <button class="mob-routine-main" data-action="mob-routine" data-id="${r.id}">
          <strong>${escapeHtml(r.name)}</strong>
          <span class="muted">${minutes(routineSeconds(r))} · ${plural(items.length, 'Übung', 'Übungen')}</span>
          ${r.description ? `<span class="muted small mob-routine-desc">${escapeHtml(r.description)}</span>` : ''}
        </button>
        <button class="mob-play" data-action="mob-start" data-id="${r.id}" aria-label="${escapeHtml(r.name)} starten" ${items.length ? '' : 'disabled'}>${Icon.play}</button>
      </div>`;
  }).join('');

  const tiles = MOBILITY_EXERCISES.map((ex) => `
    <button class="mob-tile" data-action="mob-exercise" data-id="${ex.id}">
      ${thumbImg(ex.id)}
      <strong>${escapeHtml(ex.name)}</strong>
      <span class="muted small">${ex.area}</span>
    </button>`).join('');

  return `
    <div class="card mob-week-card">
      <div class="mob-week-head">
        <strong>Diese Woche</strong>
        <span class="mob-week-count">${stats.count}<span class="muted">/${stats.goal}</span></span>
        ${stats.streak ? `<span class="streak-badge">🔥 ${plural(stats.streak, 'Woche', 'Wochen')}</span>` : ''}
      </div>
      ${weekDotsHtml(stats)}
      <p class="muted small mob-coach">${coach}</p>
    </div>

    <div class="section-title">Routinen</div>
    <div class="card list mob-routines">${routineRows}</div>
    <button class="btn btn-ghost small mob-new" data-action="mob-new">${Icon.plus} Eigene Routine</button>

    <div class="section-title">Übungen</div>
    <div class="mob-grid">${tiles}</div>

    <div class="section-title">Beweglichkeits-Check</div>
    ${checkSummaryHtml()}

    <div class="section-title">So bringt’s was</div>
    <div class="card mob-guide">
      ${MOBILITY_GUIDE.map((g) => `<div class="mob-guide-item"><strong>${g.title}</strong><p class="muted small">${g.text}</p></div>`).join('')}
    </div>

    <div class="section-title">Einstellungen</div>
    <div class="card settings-card">
      <div class="setting">
        <div class="setting-head"><strong>Wochenziel</strong></div>
        <div class="chip-row">${GOALS.map((g) => `<button class="chip ${settings.mobilityGoal === g ? 'active' : ''}" data-action="mob-goal" data-value="${g}">${g}×</button>`).join('')}</div>
      </div>
      <div class="setting">
        <div class="setting-head"><strong>Vorbereitung vor jeder Übung</strong></div>
        <div class="chip-row">${PREPS.map((p) => `<button class="chip ${settings.mobilityPrep === p ? 'active' : ''}" data-action="mob-prep" data-value="${p}">${p} s</button>`).join('')}</div>
      </div>
      <div class="setting toggle-row">
        <div><strong>Sprachansage</strong><p class="muted small">Sagt Übung, Seitenwechsel und Ende an – du musst nicht aufs Handy schauen.</p></div>
        <label class="toggle"><input type="checkbox" id="mob-voice" ${settings.mobilityVoice ? 'checked' : ''} /><span class="toggle-track"></span></label>
      </div>
    </div>`;
}

export function openMobilitySheet({ focus } = {}) {
  ctx.openSheet('Mobility', overviewHtml(), {
    onMount: (root) => {
      const body = qs('.sheet-body', root);
      bindOverview(body);
      fillThumbs(body);
      // Nach dem Check direkt die Ergebnisse zeigen
      if (focus === 'check') {
        const card = qs('.mob-check-card', body);
        if (card) body.scrollTop += card.getBoundingClientRect().top - body.getBoundingClientRect().top - 44;
      }
    },
  });
}

function bindOverview(body) {
  qsa('[data-action="mob-start"]', body).forEach((b) => b.addEventListener('click', () => {
    const r = routineById(b.dataset.id);
    if (r) { ctx.closeSheet(); startSession(r); }
  }));
  qsa('[data-action="mob-routine"]', body).forEach((b) => b.addEventListener('click', () => openRoutineSheet(b.dataset.id)));
  qsa('[data-action="mob-exercise"]', body).forEach((b) => b.addEventListener('click', () =>
    openExerciseSheet(b.dataset.id, () => openMobilitySheet())));
  qs('[data-action="mob-new"]', body)?.addEventListener('click', () => {
    const list = routines();
    const r = { id: uid(), name: 'Meine Routine', items: [] };
    list.push(r);
    saveRoutines(list);
    openRoutineSheet(r.id, { pickFirst: true });
  });
  qsa('[data-action="mob-check"]', body).forEach((b) => b.addEventListener('click', () => openCheck()));
  qsa('[data-action="mob-goal"]', body).forEach((b) => b.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), mobilityGoal: +b.dataset.value });
    qsa('[data-action="mob-goal"]', body).forEach((x) => x.classList.toggle('active', x === b));
    const stats = weekStats();
    const count = qs('.mob-week-count', body);
    if (count) count.innerHTML = `${stats.count}<span class="muted">/${stats.goal}</span>`;
    ctx.render();
  }));
  qsa('[data-action="mob-prep"]', body).forEach((b) => b.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), mobilityPrep: +b.dataset.value });
    qsa('[data-action="mob-prep"]', body).forEach((x) => x.classList.toggle('active', x === b));
    qsa('.mob-routine', body).forEach((row) => {
      const r = routineById(row.dataset.id);
      const meta = qs('.mob-routine-main .muted', row);
      if (r && meta) meta.textContent = `${minutes(routineSeconds(r))} · ${plural(validItems(r.items).length, 'Übung', 'Übungen')}`;
    });
  }));
  qs('#mob-voice', body)?.addEventListener('change', (e) => {
    Store.saveSettings({ ...Store.getSettings(), mobilityVoice: e.target.checked });
    if (e.target.checked) say('Sprachansage an.');
  });
}

// ---------- Übung im Detail ----------
function exerciseInfoHtml(ex, { compact = false } = {}) {
  return `
    <div class="mob-ex-head">
      <span class="pill">${ex.area}</span>
      <span class="pill">${ex.type === 'hold' ? 'Halten' : 'Bewegen'}${ex.sides ? ' · pro Seite' : ''}</span>
    </div>
    <p class="mob-why">${ex.why}</p>
    ${ex.tempo ? `<p class="muted small">Tempo: ${ex.tempo}</p>` : ''}
    <ol class="mob-cues">${ex.cues.map((c) => `<li>${c}</li>`).join('')}</ol>
    ${compact ? '' : `
      <div class="mob-hints">
        <div><span class="mob-hint-label warn">Achte darauf</span><p>${ex.mistakes.join(' ')}</p></div>
        <div><span class="mob-hint-label">Leichter</span><p>${ex.easier}</p></div>
        <div><span class="mob-hint-label">Schwerer</span><p>${ex.harder}</p></div>
      </div>`}`;
}

function stageHtml(extra = '') {
  return `<div class="mob-stage mob-stage-sheet">
    <span class="mob-rotate-hint">${Icon.rotate} Drehen</span>${extra}
  </div>`;
}

async function mountStage(container, ex, side = 'L') {
  if (!container) return null;
  container.classList.add('loading');
  const s = await stage();
  if (!container.isConnected) return null;
  s.stop();
  s.mount(container);
  s.setExercise(ex, side);
  s.onInteract = () => container.classList.add('touched');
  s.start();
  container.classList.remove('loading');
  return s;
}

function openExerciseSheet(id, back) {
  const ex = mobilityExercise(id);
  if (!ex) return;
  let side = 'L';
  ctx.openSheet(escapeHtml(ex.name), `
    ${stageHtml(ex.sides ? `<div class="mob-side-toggle"><button class="active" data-side="L">Links</button><button data-side="R">Rechts</button></div>` : '')}
    ${exerciseInfoHtml(ex)}
  `, {
    footer: `<button class="btn btn-primary full" data-action="mob-single">${Icon.play} Einzeln üben · ${ex.seconds} s${ex.sides ? ' pro Seite' : ''}</button>`,
    onDismiss: back,
    onMount: (root) => {
      const container = qs('.mob-stage', root);
      mountStage(container, ex, side);
      qsa('.mob-side-toggle button', root).forEach((b) => b.addEventListener('click', () => {
        side = b.dataset.side;
        qsa('.mob-side-toggle button', root).forEach((x) => x.classList.toggle('active', x === b));
        liveStage?.setExercise(ex, side);
      }));
      qs('[data-action="mob-single"]', root).addEventListener('click', () => {
        ctx.closeSheet();
        startSession({ id: null, name: ex.name, items: [{ id: ex.id, seconds: ex.seconds }] });
      });
    },
  });
}

// ---------- Routine bearbeiten ----------
function openRoutineSheet(id, { pickFirst = false } = {}) {
  const r = routineById(id);
  if (!r) return;
  const builtin = DEFAULT_MOBILITY_ROUTINES.find((d) => d.id === r.id);
  const modified = builtin && JSON.stringify(builtin.items) !== JSON.stringify(r.items);

  const save = (mutate) => {
    const list = routines();
    const target = list.find((x) => x.id === r.id);
    if (!target) return;
    mutate(target);
    saveRoutines(list);
    Object.assign(r, target);
  };

  const itemsHtml = () => validItems(r.items).map((it, i) => {
    const ex = mobilityExercise(it.id);
    return `
      <div class="list-item reorder-item mob-item">
        <span class="drag-handle" data-drag-handle aria-hidden="true">${Icon.grip}</span>
        ${thumbImg(ex.id, 'small')}
        <div class="list-item-main">
          <strong>${escapeHtml(ex.name)}</strong>
          <div class="mob-item-time">
            <span class="set-stepper">
              <button class="step-btn" data-action="mob-sec" data-i="${i}" data-delta="-15" aria-label="Kürzer">−</button>
              <span class="step-value">${it.seconds}s</span>
              <button class="step-btn" data-action="mob-sec" data-i="${i}" data-delta="15" aria-label="Länger">+</button>
            </span>
            <span class="muted small">${ex.sides ? 'pro Seite' : ''}</span>
          </div>
        </div>
        <button class="icon-btn small danger" data-action="mob-remove" data-i="${i}" aria-label="Entfernen">${Icon.close}</button>
      </div>`;
  }).join('') || '<p class="empty small">Noch keine Übungen. Füge unten welche hinzu.</p>';

  const metaText = () => `${minutes(routineSeconds(r))} · ${plural(validItems(r.items).length, 'Übung', 'Übungen')} · inkl. Vorbereitung und Seitenwechsel`;

  function paint(root) {
    const list = qs('#mob-items', root);
    list.innerHTML = itemsHtml();
    qs('.mob-meta', root).textContent = metaText();
    const start = qs('[data-action="mob-routine-start"]', root);
    if (start) start.disabled = !validItems(r.items).length;
    bindItems(root);
    fillThumbs(list);
  }

  function bindItems(root) {
    const list = qs('#mob-items', root);
    qsa('[data-action="mob-sec"]', list).forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      save((t) => {
        const items = validItems(t.items);
        items[i].seconds = Math.max(15, Math.min(180, items[i].seconds + +b.dataset.delta));
        t.items = items;
      });
      b.parentElement.querySelector('.step-value').textContent = `${validItems(r.items)[i].seconds}s`;
      qs('.mob-meta', root).textContent = metaText();
    }));
    qsa('[data-action="mob-remove"]', list).forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      Sound.remove();
      save((t) => { t.items = validItems(t.items).filter((_, k) => k !== i); });
      paint(root);
    }));
  }

  function openPicker() {
    const added = new Set();
    const rows = MOBILITY_AREAS.map((area) => {
      const inArea = MOBILITY_EXERCISES.filter((ex) => ex.area === area);
      if (!inArea.length) return '';
      return `<div class="section-title" style="margin-top:10px">${area}</div>
        <div class="card list">${inArea.map((ex) => `
          <button class="list-item selectable mob-pick" data-action="mob-pick" data-id="${ex.id}">
            ${thumbImg(ex.id, 'small')}
            <div class="list-item-main"><strong>${escapeHtml(ex.name)}</strong><span class="muted small">${ex.type === 'hold' ? 'Halten' : 'Bewegen'} · ${ex.seconds} s${ex.sides ? ' pro Seite' : ''}</span></div>
            <span class="mob-pick-state">${Icon.plus}</span>
          </button>`).join('')}</div>`;
    }).join('');
    ctx.openSheet('Übung hinzufügen', rows, {
      footer: '<button class="btn btn-secondary full" data-action="mob-pick-done">Fertig</button>',
      onDismiss: () => openRoutineSheet(r.id),
      onMount: (root) => {
        fillThumbs(root);
        qsa('[data-action="mob-pick"]', root).forEach((b) => b.addEventListener('click', () => {
          const ex = mobilityExercise(b.dataset.id);
          save((t) => { t.items = [...validItems(t.items), { id: ex.id, seconds: ex.seconds }]; });
          added.add(ex.id);
          Sound.setDone();
          qs('.mob-pick-state', b).innerHTML = `<span class="pill pill-chosen">+${[...validItems(r.items)].filter((x) => x.id === ex.id).length}</span>`;
        }));
        qs('[data-action="mob-pick-done"]', root).addEventListener('click', () => openRoutineSheet(r.id));
      },
    });
  }

  ctx.openSheet('Routine', `
    <label class="field-label">Name</label>
    <input type="text" id="mob-rname" class="text-input" value="${escapeHtml(r.name)}" />
    ${r.description ? `<p class="muted small mob-desc">${escapeHtml(r.description)}</p>` : ''}
    <p class="muted small mob-meta">${metaText()}</p>
    <div class="card list" id="mob-items"></div>
    <button class="btn btn-secondary small mob-add" data-action="mob-add">${Icon.plus} Übung hinzufügen</button>
    <p class="muted small" style="margin-top:12px">Zeiten gelten pro Seite. Reihenfolge: am Griff halten und ziehen.</p>
  `, {
    footer: `
      <button class="btn btn-primary full" data-action="mob-routine-start">${Icon.play} Starten</button>
      ${builtin ? (modified ? `<button class="btn btn-ghost full" data-action="mob-reset">Auf Standard zurücksetzen</button>` : '')
        : `<button class="btn btn-ghost danger full" data-action="mob-delete">${Icon.trash} Routine löschen</button>`}`,
    onDismiss: () => openMobilitySheet(),
    onMount: (root) => {
      paint(root);
      ctx.enableDragReorder(qs('#mob-items', root), (from, to) => {
        save((t) => {
          const items = validItems(t.items);
          items.splice(to, 0, ...items.splice(from, 1));
          t.items = items;
        });
        paint(root);
      });
      qs('#mob-rname', root).addEventListener('change', (e) => {
        const name = e.target.value.trim();
        if (name) save((t) => { t.name = name; });
      });
      qs('[data-action="mob-add"]', root).addEventListener('click', openPicker);
      qs('[data-action="mob-routine-start"]', root).addEventListener('click', () => {
        const name = qs('#mob-rname', root).value.trim();
        if (name) save((t) => { t.name = name; });
        ctx.closeSheet();
        startSession(routineById(r.id));
      });
      qs('[data-action="mob-reset"]', root)?.addEventListener('click', () => {
        save((t) => { Object.assign(t, clone(builtin)); });
        openRoutineSheet(r.id);
      });
      qs('[data-action="mob-delete"]', root)?.addEventListener('click', () => {
        if (!confirm(`„${r.name}“ löschen?`)) return;
        saveRoutines(routines().filter((x) => x.id !== r.id));
        openMobilitySheet();
      });
      if (pickFirst) openPicker();
    },
  });
}

// ---------- Sprachansage ----------
let germanVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  germanVoice = voices.find((v) => v.lang === 'de-DE' && /Anna|Helena|Petra|Markus|Google/i.test(v.name))
    || voices.find((v) => v.lang?.startsWith('de')) || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}
function say(text) {
  if (!Store.getSettings().mobilityVoice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 1.02;
    if (germanVoice) u.voice = germanVoice;
    speechSynthesis.speak(u);
  } catch { /* ohne Ansage weiter */ }
}

// ---------- Bildschirm anlassen ----------
let playerLock = null;
async function holdScreen() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { playerLock = await navigator.wakeLock.request('screen'); } catch { playerLock = null; }
}
function releaseScreen() {
  if (playerLock && !playerLock.released) playerLock.release().catch(() => {});
  playerLock = null;
}

// ---------- Geführter Ablauf ----------
function buildSteps(items, prep) {
  const steps = [];
  validItems(items).forEach((item, index) => {
    const ex = mobilityExercise(item.id);
    steps.push({ kind: 'prep', ex, item, index, side: 'L', duration: prep });
    (ex.sides ? ['L', 'R'] : ['L']).forEach((side, si) => {
      if (si > 0) steps.push({ kind: 'switch', ex, item, index, side, duration: SWITCH_SECONDS });
      steps.push({ kind: 'work', ex, item, index, side, duration: item.seconds });
    });
  });
  return steps;
}

const RING = 2 * Math.PI * 52;

let player = null;

function startSession(routine) {
  if (!routine || player) return;
  const items = validItems(routine.items);
  if (!items.length) return;
  const settings = Store.getSettings();
  if (routine.id) Store.saveSettings({ ...settings, mobilityLastRoutine: routine.id });
  const steps = buildSteps(items, settings.mobilityPrep);
  const itemTotals = items.map((it, i) => steps.filter((s) => s.index === i).reduce((n, s) => n + s.duration, 0));

  const el = document.createElement('div');
  el.className = 'mob-player';
  el.innerHTML = `
    <header class="mob-top">
      <button class="icon-btn" data-mob="close" aria-label="Beenden">${Icon.close}</button>
      <div class="mob-title"><strong>${escapeHtml(routine.name)}</strong><span class="muted small" id="mob-left"></span></div>
      <button class="icon-btn" data-mob="voice" aria-label="Sprachansage">${settings.mobilityVoice ? Icon.voiceOn : Icon.voiceOff}</button>
    </header>
    <div class="mob-segments">${itemTotals.map((t, i) => `<span class="mob-seg" style="flex:${t}" data-i="${i}"><i></i></span>`).join('')}</div>
    <div class="mob-stage mob-stage-player">
      <span class="mob-side-pill" id="mob-side"></span>
      <span class="mob-rotate-hint">${Icon.rotate} Drehen</span>
    </div>
    <div class="mob-info">
      <div class="mob-phase" id="mob-phase"></div>
      <h2 class="mob-name" id="mob-name"></h2>
      <p class="mob-cue" id="mob-cue"></p>
      <div class="mob-breath" id="mob-breath"><i></i><span></span></div>
    </div>
    <div class="mob-controls">
      <button class="mob-ctrl" data-mob="prev" aria-label="Zurück">${Icon.skipBack}</button>
      <button class="mob-ring" data-mob="toggle" aria-label="Pause">
        <svg viewBox="0 0 120 120"><circle class="mob-ring-bg" cx="60" cy="60" r="52"/><circle class="mob-ring-fg" id="mob-ring" cx="60" cy="60" r="52" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
        <span class="mob-time" id="mob-time"></span>
        <span class="mob-state" id="mob-state"></span>
      </button>
      <button class="mob-ctrl" data-mob="next" aria-label="Weiter">${Icon.skipForward}</button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));

  player = {
    dom: {
      time: qs('#mob-time', el), ring: qs('#mob-ring', el), state: qs('#mob-state', el),
      breath: qs('#mob-breath', el), breathText: qs('#mob-breath span', el),
      left: qs('#mob-left', el), segs: qsa('.mob-seg > i', el),
    },
    el, routine, steps, itemTotals, i: 0,
    stepStart: performance.now(), figureStart: performance.now(),
    paused: false, pausedElapsed: 0,
    workDone: 0, startedAt: new Date().toISOString(),
    lastWhole: null, cueIndex: -1, stage: null, shown: null,
  };

  Sound.start();
  holdScreen();
  enterStep(true);
  bindPlayer();
  stage().then((s) => {
    if (!player || player.el !== el) return;
    s.stop();
    s.mount(qs('.mob-stage', el));
    s.onInteract = () => qs('.mob-stage', el)?.classList.add('touched');
    player.stage = s;
    player.shown = null;
    showFigure();
    loop();
  });
}

function currentElapsed() {
  if (!player) return 0;
  return player.paused ? player.pausedElapsed : (performance.now() - player.stepStart) / 1000;
}

// Figur zur aktuellen Übung/Seite wechseln – mit kurzer Überblendung.
function showFigure() {
  const p = player;
  if (!p?.stage) return;
  const step = p.steps[p.i];
  const key = `${step.ex.id}:${step.side}`;
  if (p.shown === key) return;
  const first = p.shown === null;
  p.shown = key;
  const box = qs('.mob-stage', p.el);
  if (first || ctx.prefersReducedMotion()) {
    p.stage.setExercise(step.ex, step.side);
    return;
  }
  box.classList.add('swap');
  setTimeout(() => {
    if (!player || player !== p) return;
    p.stage.setExercise(step.ex, step.side);
    box.classList.remove('swap');
  }, 200);
}

function enterStep(first = false) {
  const p = player;
  const step = p.steps[p.i];
  const prevStep = p.steps[p.i - 1];
  p.stepStart = performance.now();
  p.pausedElapsed = 0;
  p.lastWhole = null;
  p.cueIndex = -1;
  // Die Figur atmet ab der Vorbereitung durch; bei neuer Seite beginnt sie neu.
  if (step.kind !== 'work' || !prevStep || prevStep.side !== step.side || prevStep.index !== step.index) {
    p.figureStart = performance.now();
  }
  showFigure();

  const ex = step.ex;
  qs('#mob-name', p.el).textContent = ex.name;
  const total = new Set(p.steps.map((s) => s.index)).size;
  const sideText = ex.sides ? (step.side === 'L' ? 'Linke Seite' : 'Rechte Seite') : '';
  const sidePill = qs('#mob-side', p.el);
  sidePill.textContent = sideText;
  sidePill.hidden = !sideText;
  const phase = {
    prep: `Gleich · Übung ${step.index + 1} von ${total}`,
    switch: 'Seite wechseln',
    work: `Übung ${step.index + 1} von ${total} · ${ex.type === 'hold' ? 'Halten' : 'Bewegen'}`,
  }[step.kind];
  qs('#mob-phase', p.el).textContent = phase;
  p.el.dataset.kind = step.kind;
  p.el.classList.toggle('paused', p.paused);
  updateCue(true);

  if (step.kind === 'prep') {
    Sound.bell();
    say(`${first ? 'Los geht’s. ' : 'Als Nächstes: '}${ex.name}${ex.sides ? ', linke Seite' : ''}.`);
  } else if (step.kind === 'switch') {
    Sound.bell();
    say('Seite wechseln.');
  } else {
    Sound.go();
  }
}

function updateCue(force) {
  const p = player;
  const step = p.steps[p.i];
  const cues = step.ex.cues;
  let index;
  if (step.kind === 'prep') index = 0;
  else if (step.kind === 'switch') index = -2;
  else index = Math.min(cues.length - 1, Math.floor(currentElapsed() / Math.max(8, step.duration / cues.length)));
  if (!force && index === p.cueIndex) return;
  p.cueIndex = index;
  const el = qs('#mob-cue', p.el);
  const text = index === -2 ? 'Kurz lockern und auf die andere Seite wechseln.' : cues[index];
  if (el.textContent === text) return;
  if (ctx.prefersReducedMotion()) { el.textContent = text; return; }
  el.classList.add('fade');
  setTimeout(() => { el.textContent = text; el.classList.remove('fade'); }, 160);
}

function loop() {
  const p = player;
  if (!p) return;
  const step = p.steps[p.i];
  const elapsed = currentElapsed();
  const remaining = Math.max(0, step.duration - elapsed);

  const { dom } = p;
  dom.time.textContent = formatSeconds(Math.ceil(remaining - 0.001));
  dom.ring.style.strokeDashoffset = String(RING * (1 - Math.min(1, elapsed / step.duration)));
  if (dom.stateIcon !== p.paused) {
    dom.stateIcon = p.paused;
    dom.state.innerHTML = p.paused ? Icon.play : Icon.pause;
  }

  // Countdown-Ticks in den letzten drei Sekunden
  const whole = Math.ceil(remaining);
  if (!p.paused && whole !== p.lastWhole) {
    if (p.lastWhole !== null && whole <= 3 && whole >= 1 && step.kind !== 'switch') Sound.tick();
    p.lastWhole = whole;
  }

  // Atemrhythmus bei gehaltenen Übungen, synchron zur Figur
  const figureTime = p.paused ? (p.figurePausedAt ?? 0) : (performance.now() - p.figureStart) / 1000;
  // Bei Bewegungsübungen steht an derselben Stelle das Tempo.
  const { breath } = dom;
  const working = step.kind === 'work';
  breath.classList.toggle('on', working);
  breath.classList.toggle('tempo', working && !step.ex.breath);
  if (working && step.ex.breath) {
    const phase = figureTime % BREATH.loop;
    const exhale = phase < BREATH.exhale;
    breath.classList.toggle('exhale', exhale);
    dom.breathText.textContent = exhale ? 'Ausatmen · tiefer sinken' : 'Einatmen';
  } else if (working) {
    breath.classList.remove('exhale');
    dom.breathText.textContent = step.ex.tempo || 'Ruhig und kontrolliert';
  }
  updateCue(false);

  // Restzeit der ganzen Einheit und Fortschrittsbalken
  const left = p.steps.slice(p.i + 1).reduce((n, s) => n + s.duration, 0) + remaining;
  dom.left.textContent = `noch ${formatSeconds(Math.ceil(left))}`;
  dom.segs.forEach((bar, i) => {
    let fill = 0;
    if (i < step.index) fill = 1;
    else if (i === step.index) {
      const done = p.steps.filter((s, k) => s.index === i && k < p.i).reduce((n, s) => n + s.duration, 0) + elapsed;
      fill = Math.min(1, done / p.itemTotals[i]);
    }
    bar.style.transform = `scaleX(${fill})`;
  });

  if (p.stage) p.stage.update(figureTime);

  if (!p.paused && elapsed >= step.duration) {
    advance();
    if (!player || player.finished) return;
  }
  p.raf = requestAnimationFrame(loop);
}

function formatSeconds(s) {
  const v = Math.max(0, s);
  return v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v}`;
}

function advance() {
  const p = player;
  const step = p.steps[p.i];
  if (step.kind === 'work') p.workDone += Math.min(step.duration, currentElapsed());
  if (p.i >= p.steps.length - 1) { finishSession(true); return; }
  p.i += 1;
  p.paused = false;
  enterStep();
}

function goBack() {
  const p = player;
  const step = p.steps[p.i];
  const prepIndex = p.steps.findIndex((s) => s.index === step.index && s.kind === 'prep');
  if (p.i > prepIndex && currentElapsed() > 2) {
    // Laufenden Abschnitt neu beginnen
    p.stepStart = performance.now();
    p.pausedElapsed = 0;
    p.lastWhole = null;
    return;
  }
  const target = p.i > prepIndex ? prepIndex
    : Math.max(0, p.steps.findIndex((s) => s.index === step.index - 1 && s.kind === 'prep'));
  p.i = target;
  p.paused = false;
  enterStep();
}

function togglePause() {
  const p = player;
  if (p.paused) {
    p.stepStart = performance.now() - p.pausedElapsed * 1000;
    p.figureStart = performance.now() - (p.figurePausedAt || 0) * 1000;
    p.paused = false;
  } else {
    p.pausedElapsed = currentElapsed();
    p.figurePausedAt = (performance.now() - p.figureStart) / 1000;
    p.paused = true;
  }
  p.el.classList.toggle('paused', p.paused);
}

function bindPlayer() {
  const p = player;
  const el = p.el;
  qs('[data-mob="toggle"]', el).addEventListener('click', togglePause);
  qs('[data-mob="next"]', el).addEventListener('click', advance);
  qs('[data-mob="prev"]', el).addEventListener('click', goBack);
  qs('[data-mob="voice"]', el).addEventListener('click', (e) => {
    const on = !Store.getSettings().mobilityVoice;
    Store.saveSettings({ ...Store.getSettings(), mobilityVoice: on });
    e.currentTarget.innerHTML = on ? Icon.voiceOn : Icon.voiceOff;
    if (on) say('Sprachansage an.');
    else if ('speechSynthesis' in window) speechSynthesis.cancel();
  });
  qs('[data-mob="close"]', el).addEventListener('click', () => {
    if (p.finished) { closePlayer(); return; }
    const step = p.steps[p.i];
    const done = p.workDone + (step.kind === 'work' ? currentElapsed() : 0);
    if (done >= 10) {
      const counts = done >= COUNT_MIN_SECONDS;
      if (!confirm(`Mobility beenden? Bisher ${minutes(done)} – ${counts ? 'zählt für heute.' : 'unter 3 Minuten zählt noch nicht.'}`)) return;
    }
    if (step.kind === 'work') p.workDone += Math.min(step.duration, currentElapsed());
    finishSession(false);
  });
}

// App im Hintergrund: anhalten statt weiterzählen – sonst wären beim
// Zurückkommen mehrere Übungen einfach vorbei.
document.addEventListener('visibilitychange', () => {
  if (!player) return;
  if (document.visibilityState === 'hidden') {
    if (!player.paused && !player.finished) togglePause();
  } else {
    holdScreen();
  }
});

function finishSession(reachedEnd) {
  const p = player;
  cancelAnimationFrame(p.raf);
  p.finished = true;
  const seconds = Math.round(p.workDone);
  // Durchgeklickt ist nicht gemacht: als vollständig gilt eine Einheit erst
  // mit mindestens 60 % der geplanten Dehnzeit.
  const planned = p.steps.filter((s) => s.kind === 'work').reduce((n, s) => n + s.duration, 0);
  const completed = reachedEnd && seconds >= planned * 0.6;
  if (completed || seconds >= 10) {
    Store.addMobilitySession({
      id: uid(),
      routineId: p.routine.id || null,
      name: p.routine.name,
      startedAt: p.startedAt,
      finishedAt: new Date().toISOString(),
      seconds,
      completed,
    });
  }
  if (!reachedEnd) { closePlayer(); return; }

  const stats = weekStats();
  const countsToday = completed || seconds >= COUNT_MIN_SECONDS;
  Sound.finish();
  say(countsToday ? 'Geschafft. Stark gemacht.' : 'Fertig.');
  const line = !countsToday
    ? 'Diesmal viel übersprungen – gezählt wird ab 3 Minuten Dehnzeit.'
    : stats.count >= stats.goal
    ? (stats.count === stats.goal ? 'Wochenziel erreicht. Genau so entsteht Beweglichkeit.' : 'Mehr als dein Wochenziel – stark.')
    : `Noch ${plural(stats.goal - stats.count, 'Einheit', 'Einheiten')} bis zum Wochenziel.`;
  p.el.dataset.kind = 'done';
  const content = document.createElement('div');
  content.className = 'mob-done';
  content.innerHTML = `
    <div class="mob-done-badge ${countsToday ? '' : 'muted'}">${Icon.check}</div>
    <h2>${countsToday ? 'Mobility erledigt' : 'Einheit beendet'}</h2>
    <p class="muted">${escapeHtml(p.routine.name)} · ${minutes(seconds)} Dehnzeit</p>
    <div class="card mob-week-card">
      <div class="mob-week-head">
        <strong>Diese Woche</strong>
        <span class="mob-week-count">${stats.count}<span class="muted">/${stats.goal}</span></span>
        ${stats.streak ? `<span class="streak-badge">🔥 ${plural(stats.streak, 'Woche', 'Wochen')}</span>` : ''}
      </div>
      ${weekDotsHtml(stats)}
      <p class="muted small mob-coach">${line}</p>
    </div>
    <button class="btn btn-primary full" data-mob="done">Fertig</button>`;
  qsa('.mob-stage, .mob-info, .mob-controls, .mob-segments', p.el).forEach((x) => x.remove());
  qs('#mob-left', p.el).textContent = '';
  p.el.appendChild(content);
  qs('[data-mob="done"]', content).addEventListener('click', closePlayer);
  releaseScreen();
}

function closePlayer() {
  const p = player;
  if (!p) return;
  cancelAnimationFrame(p.raf);
  p.stage?.stop();
  releaseScreen();
  if ('speechSynthesis' in window && !p.finished) speechSynthesis.cancel();
  player = null;
  p.el.classList.remove('open');
  p.el.classList.add('closing');
  setTimeout(() => p.el.remove(), 320);
  ctx.render();
}

// ---------- Beweglichkeits-Check ----------
function openCheck(step = 0, answers = {}) {
  const test = MOBILITY_CHECKS[step];
  const last = Store.getMobilityChecks().slice(-1)[0];
  const ex = mobilityExercise(test.exercise);
  const value = answers[test.id] ?? (test.sides ? { ...(last?.results[test.id] || { L: 8, R: 8 }) } : null);
  answers[test.id] = value;
  const isLast = step === MOBILITY_CHECKS.length - 1;

  const input = test.sides
    ? `<div class="mob-check-sides">${['L', 'R'].map((s) => `
        <div class="mob-check-side">
          <span class="muted small">${s === 'L' ? 'Links' : 'Rechts'}</span>
          <span class="set-stepper big">
            <button class="step-btn" data-action="cm" data-side="${s}" data-delta="-1" aria-label="Weniger">−</button>
            <span class="step-value" data-side-value="${s}">${value[s]} cm</span>
            <button class="step-btn" data-action="cm" data-side="${s}" data-delta="1" aria-label="Mehr">+</button>
          </span>
        </div>`).join('')}</div>
      <p class="muted small">Richtwert: ab etwa ${test.good} cm gilt das Sprunggelenk als gut beweglich.</p>`
    : `<div class="mob-options">${test.options.map((o, i) => `
        <button class="mob-option ${value === i ? 'active' : ''}" data-action="opt" data-value="${i}">
          <span class="mob-option-dot"></span>${o}</button>`).join('')}</div>`;

  ctx.openSheet(`Check ${step + 1}/${MOBILITY_CHECKS.length} · ${test.name}`, `
    ${stageHtml()}
    <p class="mob-why">${test.how}</p>
    <div class="field-label" style="margin-top:12px">${test.question}</div>
    ${input}
  `, {
    footer: `<button class="btn btn-primary full" data-action="check-next" ${value === null ? 'disabled' : ''}>${isLast ? 'Ergebnis speichern' : 'Weiter'}</button>`,
    onDismiss: step > 0 ? () => openCheck(step - 1, answers) : () => openMobilitySheet(),
    onMount: (root) => {
      mountStage(qs('.mob-stage', root), ex, 'L');
      const next = qs('[data-action="check-next"]', root);
      qsa('[data-action="opt"]', root).forEach((b) => b.addEventListener('click', () => {
        answers[test.id] = +b.dataset.value;
        qsa('[data-action="opt"]', root).forEach((x) => x.classList.toggle('active', x === b));
        next.disabled = false;
        Sound.setDone();
      }));
      qsa('[data-action="cm"]', root).forEach((b) => b.addEventListener('click', () => {
        const v = answers[test.id];
        v[b.dataset.side] = Math.max(test.min, Math.min(test.max, v[b.dataset.side] + +b.dataset.delta));
        qs(`[data-side-value="${b.dataset.side}"]`, root).textContent = `${v[b.dataset.side]} cm`;
      }));
      next.addEventListener('click', () => {
        if (!isLast) { openCheck(step + 1, answers); return; }
        Store.addMobilityCheck({ id: uid(), date: new Date().toISOString(), results: answers });
        Sound.record();
        ctx.toast('Check gespeichert');
        openMobilitySheet({ focus: 'check' });
      });
    },
  });
}
