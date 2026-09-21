import { Store, MUSCLE_GROUPS, ACCENT_COLORS, REST_OPTIONS, WEEKLY_GOALS, uid } from './storage.js';
import { Icon } from './icons.js';
import { buildPlanPrompt, parsePlanText, normalizeExerciseName } from './plan-import.js';
import { buildMotivation } from './motivation.js';
import { Sound, setSoundEnabled } from './sound.js';
import { fatigueOf, muscleGroupLookup } from './fatigue.js';
import {
  formatDate, formatDateTime, formatDuration, elapsedLabel,
  estimate1RM, bestSet, escapeHtml, unitLabel, drawLineChart,
} from './utils.js';

const root = document.getElementById('app-root');
const sheetRoot = document.getElementById('sheet-root');
const toastRoot = document.getElementById('toast-root');

const state = {
  tab: 'start',
  librarySubTab: 'exercises',
  historySubTab: 'log',
  progressExerciseId: null,
  workoutOpen: false,
  workoutAddExerciseQuery: '',
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
};

let tickInterval = null;

function qs(sel, parent = document) { return parent.querySelector(sel); }
function qsa(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }

function applyAccent() {
  document.documentElement.style.setProperty('--accent', Store.getSettings().accent);
}

// iOS meldet in der installierten Web-App eine Safe Area unten (34px), auch
// wenn die Seite dort gar nicht hinreicht, weil das System die Ansicht schon
// verkürzt hat. Rechnet man den Wert dann trotzdem ein, steht die Leiste
// doppelt zu hoch. Deshalb: Ist der Bildschirm messbar höher als die Seite,
// hat das System den Platz bereits abgezogen – dann keinen eigenen Abstand
// mehr addieren.
function calibrateSafeArea() {
  const reserved = Math.round(window.screen.height - window.innerHeight);
  const portrait = window.innerWidth < window.innerHeight;
  // Nur in der installierten App: im normalen Safari fehlt unten Platz wegen
  // der Browserleiste, die Seite reicht dort aber sehr wohl bis zum
  // Home-Indikator – da muss der Abstand erhalten bleiben.
  const systemReservedBottom = navigator.standalone === true
    && portrait && reserved > 8 && reserved < 140;
  document.documentElement.style.setProperty(
    '--safe-bottom',
    systemReservedBottom ? '0px' : 'env(safe-area-inset-bottom, 0px)',
  );
  return { reserved, systemReservedBottom };
}

// Progressive Overload (opt-in in den Einstellungen): klassische
// "Doppelprogression" – wer eine Übung in den letzten 2 abgeschlossenen
// Einheiten jeweils bei GLEICHEM Gewicht und durchweg ≥10 Wiederholungen
// geschafft hat, ist bereit für mehr Gewicht. Größere Grundübungen
// (Beine/Rücken/Brust) bekommen einen größeren Sprung als Isolationsübungen,
// und der Schritt richtet sich nach der eingestellten Einheit.
const OVERLOAD_REP_THRESHOLD = 10;
const OVERLOAD_BIG_LIFT_GROUPS = ['Beine', 'Rücken', 'Brust'];

function overloadStep(muscleGroup, unit) {
  const big = OVERLOAD_BIG_LIFT_GROUPS.includes(muscleGroup);
  if (unit === 'lb') return big ? 10 : 5;
  return big ? 5 : 2.5;
}

// Letzte abgeschlossene Einheit, in der diese Übung wirklich trainiert wurde –
// inklusive Trainingskontext, um die Vorbelastung bestimmen zu können.
function lastSessionFor(exerciseId, excludeWorkoutId) {
  for (const w of Store.getWorkouts()) {
    if (!w.finishedAt || w.id === excludeWorkoutId) continue;
    const entryIndex = w.entries.findIndex(
      (e) => e.exerciseId === exerciseId && e.sets.some((s) => s.done),
    );
    if (entryIndex >= 0) return { workout: w, entryIndex, entry: w.entries[entryIndex] };
  }
  return null;
}

function getOverloadSuggestion(exercise, excludeWorkoutId) {
  if (!exercise) return null;
  const groupOf = muscleGroupLookup(Store.getExercises());
  const candidates = Store.getWorkouts()
    .filter((w) => w.finishedAt && w.id !== excludeWorkoutId)
    .map((w) => {
      const entryIndex = w.entries.findIndex(
        (e) => e.exerciseId === exercise.id && e.sets.some((s) => s.done),
      );
      return entryIndex < 0 ? null : { entry: w.entries[entryIndex], bucket: fatigueOf(w, entryIndex, groupOf).bucket };
    })
    .filter(Boolean);
  if (candidates.length < 2) return null;

  // Nur Einheiten mit vergleichbarer Vorbelastung heranziehen: zwei gleich
  // schwere Einheiten aus völlig verschiedenen Positionen im Training sagen
  // nichts darüber aus, ob mehr Gewicht fällig ist.
  const sameBucket = candidates.filter((c) => c.bucket === candidates[0].bucket);
  const sessions = (sameBucket.length >= 2 ? sameBucket : candidates).slice(0, 2).map((c) => c.entry);
  if (sessions.length < 2) return null;

  const analyzed = sessions.map((entry) => {
    const done = entry.sets.filter((s) => s.done && s.weight > 0);
    if (!done.length) return null;
    const weight = done[0].weight;
    const sameWeight = done.every((s) => s.weight === weight);
    const hitThreshold = done.every((s) => s.reps >= OVERLOAD_REP_THRESHOLD);
    return sameWeight && hitThreshold ? { weight } : null;
  });
  if (!analyzed[0] || !analyzed[1] || analyzed[0].weight !== analyzed[1].weight) return null;

  const unit = Store.getSettings().unit;
  const step = overloadStep(exercise.muscleGroup, unit);
  return { from: analyzed[0].weight, to: Math.round((analyzed[0].weight + step) * 10) / 10, threshold: OVERLOAD_REP_THRESHOLD };
}

// Neue Übung im Training: startet mit 2 Sätzen. Gibt es ein letztes Mal für diese
// Übung, werden Gewicht/Wdh davon als "Vorschlag" vorbelegt (grau, bis bestätigt) –
// sonst leer. Ist Progressive Overload aktiv und die Übung bereit für mehr
// Gewicht, wird direkt das gesteigerte Gewicht als Vorschlag genommen.
function defaultSets(exercise, excludeWorkoutId, count = 2) {
  const last = Store.lastEntryForExercise(exercise.id, excludeWorkoutId);
  const best = last ? bestSet(last.sets) : null;
  const overload = Store.getSettings().progressiveOverload ? getOverloadSuggestion(exercise, excludeWorkoutId) : null;
  const weight = overload ? overload.to : (best ? best.weight : 0);
  return Array.from({ length: Math.max(1, count) }, () => ({
    weight,
    reps: best ? best.reps : 0,
    done: false,
    suggested: !!best,
  }));
}

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
function prefersReducedMotion() { return reducedMotionQuery.matches; }

// Beim Screenwechsel gleiten die Blöcke leicht versetzt aus der Richtung des
// Wechsels herein. Während einer Ziehgeste bleibt es aus: dort folgt der
// Inhalt schon dem Finger, eine zusätzliche Animation würde nur flackern.
let isSwipeDragging = false;

function animateScreenIn(view) {
  const from = lastScreenPosition;
  const to = screenPosition();
  lastScreenPosition = to;
  // Beim View-Transition-Crossfade (Training verlassen/beenden) würde die
  // Einblendung doppelt laufen.
  if (prefersReducedMotion() || isSwipeDragging || inViewTransition || from === to) return;
  // Beim allerersten Rendern gibt es keine Richtung – dann nur sanft einblenden.
  view.style.setProperty('--enter-x', from === null ? '0px' : (to > from ? '16px' : '-16px'));
  view.classList.remove('screen-in');
  void view.offsetWidth;
  view.classList.add('screen-in');
}

// Ein frisch eingefügtes Element einmalig einblenden lassen.
function dropIn(el) {
  if (!el || prefersReducedMotion()) return;
  el.classList.add('item-in');
  el.addEventListener('animationend', () => el.classList.remove('item-in'), { once: true });
}

// Ein Element erst wegklappen, dann die eigentliche Änderung ausführen –
// sonst würde die Zeile beim Löschen einfach verschwinden.
function collapseAway(el, done) {
  if (!el || prefersReducedMotion()) { done(); return; }
  const height = el.getBoundingClientRect().height;
  const style = getComputedStyle(el);
  el.style.height = `${height}px`;
  el.style.marginTop = style.marginTop;
  el.style.marginBottom = style.marginBottom;
  el.style.overflow = 'hidden';
  void el.offsetHeight;
  el.style.transition = 'height 0.22s ease, opacity 0.16s ease, transform 0.22s ease, margin 0.22s ease, padding 0.22s ease';
  el.style.height = '0px';
  el.style.opacity = '0';
  el.style.transform = 'scale(0.97)';
  el.style.marginTop = '0px';
  el.style.marginBottom = '0px';
  el.style.paddingTop = '0px';
  el.style.paddingBottom = '0px';
  setTimeout(done, 210);
}

// Sheet nach unten wegwischen, wie in iOS: der Griff (und der Kopfbereich)
// folgt 1:1 dem Finger, beim Loslassen entscheidet Strecke ODER Schwung.
function enableSheetDragToClose(sheetEl) {
  if (!sheetEl) return;
  const grabArea = () => [qs('.sheet-handle', sheetEl), qs('.sheet-header', sheetEl)];

  sheetEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, textarea, select')) return;
    if (!grabArea().some((el) => el && el.contains(e.target))) return;

    const startY = e.clientY;
    let dy = 0;
    let lastY = startY;
    let lastT = performance.now();
    let velocity = 0;
    sheetEl.style.transition = 'none';

    const onMove = (ev) => {
      dy = Math.max(0, ev.clientY - startY);
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 4) {
        velocity = velocity * 0.7 + ((ev.clientY - lastY) / dt) * 0.3;
        lastY = ev.clientY;
        lastT = now;
      }
      sheetEl.style.transform = `translateY(${dy}px)`;
      const backdrop = qs('.sheet-backdrop', sheetRoot);
      if (backdrop) backdrop.style.opacity = String(Math.max(0, 1 - dy / 400));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const shouldClose = dy > sheetEl.getBoundingClientRect().height * 0.3 || velocity > 0.7;
      if (shouldClose) { dismissSheet(); return; }
      sheetEl.style.transition = 'transform 0.35s cubic-bezier(0.32, 1.3, 0.4, 1)';
      sheetEl.style.transform = '';
      const backdrop = qs('.sheet-backdrop', sheetRoot);
      if (backdrop) { backdrop.style.transition = 'opacity 0.25s'; backdrop.style.opacity = ''; }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}

// Weicher iOS-artiger Crossfade für bewusste Navigation (Tap auf Tab/Segment).
// Bei Drag-Gesten wird bewusst NICHT transitioniert – da folgt die Ansicht 1:1 dem Finger.
let inViewTransition = false;
function go(fn) {
  if (document.startViewTransition) {
    inViewTransition = true;
    const transition = document.startViewTransition(fn);
    transition.finished.catch(() => {}).finally(() => { inViewTransition = false; });
  } else {
    fn();
  }
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  toastRoot.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, 2200);
}

// Wird ein Sheet über Backdrop/X geschlossen, darf das etwas anderes bedeuten
// als "weg damit" – z.B. zurück zum Plan-Editor statt Entwurf verwerfen.
let sheetOnDismiss = null;

function closeSheet() {
  sheetOnDismiss = null;
  const sheetEl = qs('.sheet', sheetRoot);
  const backdrop = qs('.sheet-backdrop', sheetRoot);
  if (!sheetEl) {
    sheetRoot.innerHTML = '';
    sheetRoot.classList.remove('open');
    return;
  }
  sheetEl.style.animation = 'slideDown 0.26s cubic-bezier(0.32, 0.72, 0, 1) forwards';
  if (backdrop) backdrop.style.animation = 'fadeOut 0.24s ease forwards';
  setTimeout(() => {
    sheetRoot.innerHTML = '';
    sheetRoot.classList.remove('open');
  }, 240);
}

function dismissSheet() {
  const handler = sheetOnDismiss;
  if (handler) { sheetOnDismiss = null; handler(); return; }
  closeSheet();
}

function openSheet(title, bodyHtml, { footer = '', onMount, onDismiss = null } = {}) {
  sheetOnDismiss = onDismiss;
  const inner = `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <h2>${title}</h2>
      <button class="icon-btn" data-action="close-sheet" aria-label="Schließen">${Icon.close}</button>
    </div>
    <div class="sheet-body">${bodyHtml}</div>
    ${footer ? `<div class="sheet-footer">${footer}</div>` : ''}`;

  const existing = qs('.sheet', sheetRoot);
  if (existing) {
    // Innerhalb eines offenen Sheets nur den Inhalt tauschen (z.B. Plan-Editor
    // -> Übungsauswahl): sonst würde die Einblend-Animation jedes Mal erneut
    // laufen und wie ein Neuladen wirken. Die Höhe wandert dabei weich mit.
    swapSheetContent(existing, inner);
  } else {
    sheetRoot.innerHTML = `
      <div class="sheet-backdrop" data-action="close-sheet"></div>
      <div class="sheet">${inner}</div>`;
    sheetRoot.classList.add('open');
    enableSheetDragToClose(qs('.sheet', sheetRoot));
  }
  if (onMount) onMount(sheetRoot);
}

function swapSheetContent(sheetEl, inner) {
  if (prefersReducedMotion()) { sheetEl.innerHTML = inner; return; }
  const from = sheetEl.getBoundingClientRect().height;
  sheetEl.innerHTML = inner;
  const to = sheetEl.getBoundingClientRect().height;
  if (Math.abs(to - from) > 1) {
    sheetEl.style.height = `${from}px`;
    void sheetEl.offsetHeight;
    sheetEl.style.transition = 'height 0.32s cubic-bezier(0.32, 0.72, 0, 1)';
    sheetEl.style.height = `${to}px`;
    const done = (e) => {
      if (e.target !== sheetEl || e.propertyName !== 'height') return;
      sheetEl.style.transition = '';
      sheetEl.style.height = '';
      sheetEl.removeEventListener('transitionend', done);
    };
    sheetEl.addEventListener('transitionend', done);
  }
  const body = qs('.sheet-body', sheetEl);
  if (body) body.classList.add('sheet-content-in');
}

function stopTicking() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

function startTicking(fn) {
  stopTicking();
  tickInterval = setInterval(fn, 1000);
}

// ---------- Rendering ----------

// Nur beim tatsächlichen Betreten der Trainingsansicht soll sie von unten
// hereingleiten. render() wird aber bei jeder kleinsten Änderung (Satz
// hinzufügen, Übung wählen, Haken setzen ...) erneut aufgerufen und baut die
// ganze .workout-screen neu auf – ohne dieses Flag würde die Eingangs-
// Animation dabei jedes Mal erneut abspielen und wie ein Neuladen wirken.
let workoutEntering = false;

// render() ersetzt bei jeder Änderung das komplette innerHTML, wodurch ein
// brandneues .view-Element entsteht, das immer bei scrollTop 0 startet – ohne
// Gegenmaßnahme würde z.B. ein Satz-Haken mitten in einer langen Übungsliste
// die Seite jedes Mal nach oben springen lassen. Deshalb: Scroll-Position nur
// dann übernehmen, wenn es sich um den GLEICHEN Screen handelt (reine
// Datenänderung), nicht bei echter Navigation zu einer anderen Ansicht.
let lastRenderKey = null;

// Position des aktuellen Screens auf einer gedachten Achse (Tab + Unter-Tab).
// Daraus ergibt sich, ob ein Wechsel nach links oder rechts geht – der Inhalt
// gleitet dann aus der passenden Richtung herein.
function screenPosition() {
  const base = TAB_IDS.indexOf(state.tab);
  if (state.tab === 'history') return base + (state.historySubTab === 'progress' ? 0.5 : 0);
  if (state.tab === 'library') return base + (state.librarySubTab === 'routines' ? 0.5 : 0);
  return base;
}
let lastScreenPosition = null;

function render() {
  stopTicking();
  const key = `${state.tab}:${state.workoutOpen}:${state.historySubTab}:${state.librarySubTab}`;
  const prevView = qs('.view');
  const scrollTop = key === lastRenderKey && prevView ? prevView.scrollTop : 0;
  const screenChanged = key !== lastRenderKey;
  lastRenderKey = key;

  if (state.workoutOpen && Store.getActive()) {
    root.innerHTML = renderWorkout();
    workoutEntering = false;
    bindWorkoutEvents();
    const newView = qs('.view');
    if (newView) newView.scrollTop = scrollTop;
    syncRestBar(); // eine laufende Pause überlebt auch ein Neuladen
    startTicking(() => {
      const el = qs('#workout-timer');
      const active = Store.getActive();
      if (el && active) el.textContent = elapsedLabel(active.startedAt);
      syncRestBar();
    });
    return;
  }
  state.workoutOpen = false;

  root.innerHTML = `
    <header class="topbar">
      <h1>${tabTitle()}</h1>
      ${tabAction()}
    </header>
    <main class="view">${renderTab()}</main>
    <div class="tabbar-wrap">
      <nav class="tabbar">
        ${tabButton('start', Icon.home, 'Start')}
        ${tabButton('history', Icon.history, 'Verlauf')}
        ${tabButton('library', Icon.library, 'Bibliothek')}
        ${tabButton('settings', Icon.settings, 'Einstellungen')}
        <span class="tab-indicator" aria-hidden="true"></span>
      </nav>
    </div>`;
  const newView = qs('.view');
  if (newView) {
    newView.scrollTop = scrollTop;
    if (screenChanged) animateScreenIn(newView);
  }

  bindGlobalEvents();
  if (state.tab === 'start') bindStartEvents();
  if (state.tab === 'history') bindHistoryEvents();
  if (state.tab === 'library') bindLibraryEvents();
  if (state.tab === 'settings') bindSettingsEvents();

  if (state.tab === 'start' && Store.getActive()) {
    startTicking(() => {
      const el = qs('#active-elapsed');
      const active = Store.getActive();
      if (el && active) el.textContent = elapsedLabel(active.startedAt);
    });
  }
}

function tabTitle() {
  return {
    start: 'Training', history: 'Verlauf', library: 'Bibliothek', settings: 'Einstellungen',
  }[state.tab];
}

function tabAction() {
  if (state.tab === 'library' && state.librarySubTab === 'exercises') {
    return `<button class="icon-btn accent" data-action="add-exercise">${Icon.plus}</button>`;
  }
  if (state.tab === 'library' && state.librarySubTab === 'routines') {
    return `<button class="icon-btn accent" data-action="add-routine">${Icon.plus}</button>`;
  }
  return '';
}

function tabButton(id, icon, label) {
  const active = state.tab === id ? 'active' : '';
  return `<button class="tab-btn ${active}" data-action="set-tab" data-tab="${id}">
    <span class="tab-icon">${icon}</span><span class="tab-label">${label}</span>
  </button>`;
}

function renderTab() {
  if (state.tab === 'start') return renderStart();
  if (state.tab === 'history') return renderHistory();
  if (state.tab === 'library') return renderLibrary();
  if (state.tab === 'settings') return renderSettings();
  return '';
}

// ---- Start-Tab ----
function renderStart() {
  const active = Store.getActive();
  const routines = Store.getRoutines();

  const activeCard = active ? `
    <section class="card active-card">
      <div class="active-card-top">
        <span class="pill pill-live">Läuft</span>
        <span id="active-elapsed" class="elapsed">${elapsedLabel(active.startedAt)}</span>
      </div>
      <h3>${escapeHtml(active.routineName || 'Freies Training')}</h3>
      <p class="muted">${active.entries.length} Übung(en)</p>
      <div class="row gap">
        <button class="btn btn-primary" data-action="resume-workout">Weiter ${Icon.chevron}</button>
        <button class="btn btn-ghost danger" data-action="discard-workout">Verwerfen</button>
      </div>
    </section>` : '';

  const routineCards = routines.length ? routines.map((r) => `
    <div class="list-item">
      <div class="list-item-main">
        <strong>${escapeHtml(r.name)}</strong>
        <span class="muted">${r.exerciseIds.length} Übung(en)</span>
      </div>
      <button class="btn btn-small btn-primary" data-action="start-routine" data-id="${r.id}" ${active ? 'disabled' : ''}>Start</button>
    </div>`).join('') : `<p class="empty">Noch keine Pläne. Leg welche in der Bibliothek an.</p>`;

  return `
    ${activeCard}
    ${Store.getSettings().motivation ? renderMotivationCard() : renderWeekCard()}
    <section>
      <div class="section-title">Plan starten</div>
      <div class="card list">${routineCards}</div>
    </section>
    <section>
      <button class="btn btn-secondary full" data-action="start-blank" ${active ? 'disabled' : ''}>${Icon.plus} Leeres Training starten</button>
    </section>`;
}

const WEEKDAY_LETTERS = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];

function weekStripHtml(days, todayIndex) {
  return `<div class="week-strip">${WEEKDAY_LETTERS.map((label, i) => `
    <span class="week-day ${days[i] ? 'on' : ''} ${i === todayIndex ? 'today' : ''}">
      <span class="week-dot"></span>${label}
    </span>`).join('')}</div>`;
}

// Kleine Wochenübersicht: an welchen Tagen war ich da, wie viel kam zusammen.
function renderWeekCard() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const done = Store.getWorkouts().filter((w) => w.finishedAt && new Date(w.startedAt) >= monday);
  if (!Store.getWorkouts().some((w) => w.finishedAt)) return '';

  const unit = unitLabel(Store.getSettings().unit);
  const volume = done.reduce((sum, w) => sum + workoutVolume(w), 0);
  const minutes = done.reduce((sum, w) => sum + (new Date(w.finishedAt) - new Date(w.startedAt)) / 60000, 0);
  const days = Array.from({ length: 7 }, () => false);
  done.forEach((w) => { days[(new Date(w.startedAt).getDay() + 6) % 7] = true; });

  return `
    <section class="card week-card">
      <div class="section-title">Diese Woche</div>
      ${weekStripHtml(days, (now.getDay() + 6) % 7)}
      <div class="stat-row">
        <div><span class="stat-value">${done.length}</span><span class="muted small">Trainings</span></div>
        <div><span class="stat-value">${formatVolume(volume)}</span><span class="muted small">Volumen (${unit})</span></div>
        <div><span class="stat-value">${Math.round(minutes)}</span><span class="muted small">Minuten</span></div>
      </div>
    </section>`;
}

// Standortbestimmung: ein Urteil, die Belege dazu und ein konkreter nächster
// Schritt. Ersetzt die reine Wochenübersicht, wenn eingeschaltet.
function renderMotivationCard() {
  const settings = Store.getSettings();
  const m = buildMotivation({
    workouts: Store.getWorkouts(),
    exercises: Store.getExercises(),
    goal: settings.weeklyGoal,
    unit: unitLabel(settings.unit),
    stepFor: (ex) => overloadStep(ex.muscleGroup, settings.unit),
  });

  const trendRow = m.trend.comparable ? `
    <div class="trend-row">
      <span class="trend up">${m.trend.up}<small>↑</small></span>
      <span class="trend flat">${m.trend.flat}<small>→</small></span>
      <span class="trend down">${m.trend.down}<small>↓</small></span>
      <span class="muted small">Übungen, 4 Wochen</span>
    </div>` : '';

  return `
    <section class="card motivation tone-${m.verdict.tone}">
      <div class="verdict-row">
        <span class="verdict">${m.verdict.label}</span>
        ${m.streak ? `<span class="streak-badge">🔥 ${m.streak} ${m.streak === 1 ? 'Woche' : 'Wochen'}</span>` : ''}
      </div>
      <div class="goal-row">
        <span class="goal-count">${m.week.count}<span class="muted">/${m.week.goal}</span></span>
        <span class="muted small">Einheiten diese Woche</span>
      </div>
      ${weekStripHtml(m.week.days, m.week.todayIndex)}
      ${trendRow}
      <p class="coach-line">${escapeHtml(m.coachLine)}</p>
    </section>`;
}

function workoutVolume(workout) {
  return workout.entries.reduce((sum, e) =>
    sum + e.sets.filter((s) => s.done).reduce((n, s) => n + (s.weight || 0) * (s.reps || 0), 0), 0);
}

function formatVolume(value) {
  return Math.round(value).toLocaleString('de-DE');
}

function bindStartEvents() {
  qs('[data-action="start-blank"]')?.addEventListener('click', () => {
    if (Store.getActive()) return;
    Store.setActive({ id: uid(), routineId: null, routineName: null, startedAt: new Date().toISOString(), finishedAt: null, entries: [] });
    state.workoutOpen = true;
    workoutEntering = true;
    render();
  });
  qsa('[data-action="start-routine"]').forEach((btn) => btn.addEventListener('click', () => {
    if (Store.getActive()) return;
    const routine = Store.getRoutine(btn.dataset.id);
    if (!routine) return;
    const entries = routine.exerciseIds.map((eid) => {
      const ex = Store.getExercise(eid);
      const count = routine.setCounts?.[eid];
      return { exerciseId: eid, exerciseName: ex ? ex.name : 'Unbekannt', sets: ex ? defaultSets(ex, undefined, count ?? 2) : [] };
    });
    Store.setActive({ id: uid(), routineId: routine.id, routineName: routine.name, startedAt: new Date().toISOString(), finishedAt: null, entries });
    state.workoutOpen = true;
    workoutEntering = true;
    render();
  }));
  qs('[data-action="resume-workout"]')?.addEventListener('click', () => {
    state.workoutOpen = true;
    workoutEntering = true;
    render();
  });
  qs('[data-action="discard-workout"]')?.addEventListener('click', () => {
    if (confirm('Aktuelles Training wirklich verwerfen? Alle Sätze gehen verloren.')) {
      Store.clearActive();
      render();
    }
  });
}

// ---- Workout-Ansicht (Vollbild) ----
function renderWorkout() {
  const w = Store.getActive();
  const unit = unitLabel(Store.getSettings().unit);
  const overloadOn = Store.getSettings().progressiveOverload;
  const groupOf = muscleGroupLookup(Store.getExercises());
  const entries = w.entries.map((entry, ei) => {
    const lastSession = lastSessionFor(entry.exerciseId, w.id);
    const last = lastSession ? lastSession.entry : null;
    const lastBest = last ? bestSet(last.sets) : null;
    const overload = overloadOn ? getOverloadSuggestion(Store.getExercise(entry.exerciseId), w.id) : null;

    // Wenn die Übung damals unter deutlich anderer Vorbelastung lief, ist der
    // Vergleich mit "letztes Mal" irreführend – dann lieber dazusagen, warum.
    let contextNote = '';
    if (lastSession) {
      const then = fatigueOf(lastSession.workout, lastSession.entryIndex, groupOf);
      const nowCtx = fatigueOf(w, ei, groupOf);
      if (then.bucket !== nowCtx.bucket) {
        contextNote = `<p class="fatigue-note">Damals ${then.position}. Übung, heute ${nowCtx.position}. – `
          + `${nowCtx.priorSets > then.priorSets ? 'mehr' : 'weniger'} Vorbelastung, Zahlen nur bedingt vergleichbar.</p>`;
      }
    }
    const sets = entry.sets.map((s, si) => `
      <div class="set-row ${s.done ? 'done' : ''}" data-ei="${ei}" data-si="${si}">
        <span class="set-index">${si + 1}</span>
        <input type="number" inputmode="decimal" class="set-input ${s.suggested ? 'suggested' : ''}" placeholder="—"
          value="${s.suggested ? s.weight : (s.weight || '')}" data-field="weight" data-ei="${ei}" data-si="${si}" />
        <span class="set-x">×</span>
        <input type="number" inputmode="numeric" class="set-input small ${s.suggested ? 'suggested' : ''}" placeholder="—"
          value="${s.suggested ? s.reps : (s.reps || '')}" data-field="reps" data-ei="${ei}" data-si="${si}" />
        <button class="check-btn ${s.done ? 'on' : ''}" data-action="toggle-set" data-ei="${ei}" data-si="${si}">${Icon.check}</button>
        <button class="icon-btn small" data-action="remove-set" data-ei="${ei}" data-si="${si}">${Icon.close}</button>
        ${s.pr ? '<span class="pr-badge">PR</span>' : ''}
      </div>`).join('');

    return `
      <section class="card exercise-block" data-ei="${ei}">
        <div class="exercise-block-header">
          <strong>${escapeHtml(entry.exerciseName)}</strong>
          <button class="icon-btn small danger" data-action="remove-exercise" data-ei="${ei}">${Icon.trash}</button>
        </div>
        ${last ? `<p class="muted small">Letztes Mal: ${lastBest ? `${lastBest.weight}${unit} × ${lastBest.reps}` : '—'}</p>` : ''}
        ${contextNote}
        ${overload ? `<p class="overload-tip">💪 ${overload.threshold}+ Wdh bei ${overload.from}${unit} in Folge – neues Ziel ${overload.to}${unit}</p>` : ''}
        <div class="set-header-row">
          <span class="set-index"></span><span>${unit}</span><span></span><span>Wdh</span><span></span><span></span>
        </div>
        ${sets || '<p class="empty small">Noch keine Sätze.</p>'}
        <button class="btn btn-ghost small" data-action="add-set" data-ei="${ei}">${Icon.plus} Satz</button>
      </section>`;
  }).join('');

  return `
    <div class="workout-screen ${workoutEntering ? 'entering' : ''}">
      <header class="topbar workout-topbar">
        <button class="icon-btn" data-action="minimize-workout">${Icon.chevron}</button>
        <div class="workout-title">
          <strong>${escapeHtml(w.routineName || 'Freies Training')}</strong>
          <span id="workout-timer" class="muted small">${elapsedLabel(w.startedAt)}</span>
        </div>
        <button class="icon-btn danger" data-action="discard-workout">${Icon.trash}</button>
      </header>
      <main class="view">
        ${entries || '<p class="empty">Füge eine Übung hinzu, um loszulegen.</p>'}
        <div class="row gap workout-actions">
          <button class="btn btn-secondary" data-action="add-exercise-to-workout">${Icon.plus} Übung</button>
          ${w.entries.length > 1 ? `<button class="btn btn-secondary" data-action="reorder-workout">${Icon.grip} Reihenfolge</button>` : ''}
        </div>
        <button class="btn btn-primary full" data-action="finish-workout">Training beenden</button>
      </main>
      <div id="rest-slot"></div>
    </div>`;
}

// Rekord-Markierung für eine Übung neu bestimmen: ausgezeichnet wird der
// beste abgeschlossene Satz dieser Einheit – aber nur, wenn er auch alles
// übertrifft, was für die Übung bereits im Verlauf steht. Es wird immer die
// ganze Übung neu bewertet, damit eine Markierung mitwandert (oder verfällt),
// sobald ein stärkerer Satz dazukommt oder der bisher beste entfernt wird.
function refreshPrFlags(workout, ei) {
  const entry = workout.entries[ei];
  const historyBest = Store.getWorkouts()
    .filter((w) => w.finishedAt && w.id !== workout.id)
    .flatMap((w) => w.entries.filter((e) => e.exerciseId === entry.exerciseId))
    .flatMap((e) => e.sets.filter((s) => s.done))
    .reduce((best, s) => Math.max(best, estimate1RM(s.weight, s.reps)), 0);

  let bestIndex = -1;
  let bestValue = historyBest;
  entry.sets.forEach((set, i) => {
    set.pr = false;
    if (!set.done) return;
    const value = estimate1RM(set.weight, set.reps);
    if (value > bestValue) { bestValue = value; bestIndex = i; }
  });
  if (bestIndex >= 0) entry.sets[bestIndex].pr = true;
  return bestIndex;
}

function updatePrBadges(entry, ei) {
  entry.sets.forEach((set, si) => {
    const row = qs(`.set-row[data-ei="${ei}"][data-si="${si}"]`);
    if (!row) return;
    const existing = qs('.pr-badge', row);
    if (!!set.pr === !!existing) return;
    if (!set.pr) { existing.remove(); return; }
    const badge = document.createElement('span');
    badge.className = 'pr-badge item-in';
    badge.textContent = 'PR';
    row.append(badge); // absolut positioniert – verschiebt das Spaltenraster nicht
  });
}

// ---- Satzpause ----
// Nach dem Abhaken eines Satzes läuft (falls eingeschaltet) eine Pause. Die
// Leiste wird direkt ins DOM gehängt statt über render(), damit das Abhaken
// re-render-frei bleibt und die Animationen sauber durchlaufen.
function restBarHtml(remaining, duration) {
  const pct = Math.max(0, Math.min(100, (remaining / duration) * 100));
  return `
    <div class="rest-bar" id="rest-bar">
      <div class="rest-fill" id="rest-fill" style="width:${pct}%"></div>
      <div class="rest-content">
        <span class="rest-label">Pause</span>
        <span class="rest-time" id="rest-time">${formatClock(remaining)}</span>
        <button class="rest-btn" data-action="rest-adjust" data-delta="-15">−15</button>
        <button class="rest-btn" data-action="rest-adjust" data-delta="15">+15</button>
        <button class="rest-btn primary" data-action="rest-skip">Fertig</button>
      </div>
    </div>`;
}

function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function startRest() {
  const seconds = Store.getSettings().restSeconds;
  if (!seconds) return;
  Store.setRest({ endsAt: Date.now() + seconds * 1000, duration: seconds });
  syncRestBar();
}

function adjustRest(delta) {
  const rest = Store.getRest();
  if (!rest) return;
  const endsAt = Math.max(Date.now() + 1000, rest.endsAt + delta * 1000);
  const duration = Math.max(rest.duration + delta, Math.round((endsAt - Date.now()) / 1000));
  Store.setRest({ endsAt, duration });
  syncRestBar();
}

function stopRest() {
  Store.setRest(null);
  const bar = qs('#rest-bar');
  if (!bar) return;
  bar.classList.add('leaving');
  setTimeout(() => bar.remove(), 240);
}

// Baut die Leiste auf, entfernt sie oder aktualisiert nur die Zahl – je
// nachdem, was gerade nötig ist.
function syncRestBar() {
  const slot = qs('#rest-slot');
  if (!slot) return;
  const rest = Store.getRest();
  const bar = qs('#rest-bar');

  if (!rest) {
    if (bar && !bar.classList.contains('leaving')) {
      bar.classList.add('leaving');
      setTimeout(() => bar.remove(), 240);
      Sound.restOver();
      toast('Pause vorbei 🔔');
    }
    return;
  }

  const remaining = (rest.endsAt - Date.now()) / 1000;
  if (!bar) {
    slot.innerHTML = restBarHtml(remaining, rest.duration);
    bindRestEvents();
    return;
  }
  qs('#rest-time').textContent = formatClock(remaining);
  qs('#rest-fill').style.width = `${Math.max(0, Math.min(100, (remaining / rest.duration) * 100))}%`;
}

function bindRestEvents() {
  qsa('[data-action="rest-adjust"]').forEach((btn) =>
    btn.addEventListener('click', () => adjustRest(+btn.dataset.delta)));
  qs('[data-action="rest-skip"]')?.addEventListener('click', stopRest);
}

function bindWorkoutEvents() {
  const getActive = () => Store.getActive();

  qs('[data-action="minimize-workout"]').addEventListener('click', () => {
    go(() => { state.workoutOpen = false; state.tab = 'start'; render(); });
  });
  qs('[data-action="discard-workout"]').addEventListener('click', () => {
    if (confirm('Training wirklich verwerfen? Alle Sätze gehen verloren.')) {
      Store.clearActive();
      go(() => { state.workoutOpen = false; render(); });
    }
  });
  qs('[data-action="finish-workout"]').addEventListener('click', () => {
    const w = getActive();
    const totalSets = w.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    if (totalSets === 0 && !confirm('Keine Sätze abgeschlossen. Training trotzdem speichern?')) return;
    w.finishedAt = new Date().toISOString();
    Store.finishActiveWorkout(w);
    Sound.finish();
    go(() => {
      state.workoutOpen = false;
      state.tab = 'history';
      state.historySubTab = 'log';
      render();
    });
    toast('Training gespeichert 💪');
  });
  qs('[data-action="add-exercise-to-workout"]').addEventListener('click', openAddExerciseToWorkoutSheet);
  qs('[data-action="reorder-workout"]')?.addEventListener('click', openReorderSheet);

  qsa('[data-action="add-set"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei;
    const last = w.entries[ei].sets[w.entries[ei].sets.length - 1];
    w.entries[ei].sets.push({ weight: last ? last.weight : 0, reps: last ? last.reps : 0, done: false });
    const si = w.entries[ei].sets.length - 1;
    Store.setActive(w);
    render(); // sofort – ein einzelner Satz ist zu klein/häufig für einen Seitenübergang
    dropIn(qs(`.set-row[data-ei="${ei}"][data-si="${si}"]`));
  }));
  qsa('[data-action="remove-set"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei, si = +btn.dataset.si;
    collapseAway(btn.closest('.set-row'), () => {
      w.entries[ei].sets.splice(si, 1);
      Store.setActive(w);
      render();
    });
  }));
  qsa('[data-action="toggle-set"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei, si = +btn.dataset.si;
    const set = w.entries[ei].sets[si];
    set.done = !set.done;
    // Abhaken ohne eigene Eingabe übernimmt den grauen Vorschlagswert als echten Wert.
    if (set.done) set.suggested = false;
    const prIndex = refreshPrFlags(w, ei);
    Store.setActive(w);
    // Bewusst KEIN render(): ein Neuaufbau würde den Knopf durch ein frisches,
    // unanimiertes Element ersetzen – die Feder-Animation am Haken liefe nie.
    // Lokal umschalten ist außerdem spürbar direkter.
    const row = btn.closest('.set-row');
    btn.classList.toggle('on', set.done);
    row?.classList.toggle('done', set.done);
    qsa(`.set-input[data-ei="${ei}"][data-si="${si}"]`).forEach((el) => el.classList.remove('suggested'));
    updatePrBadges(w.entries[ei], ei);
    if (set.done) {
      startRest();
      if (prIndex === si) { Sound.record(); toast('Neuer Rekord 🏆'); } else Sound.setDone();
    } else {
      Sound.setUndone();
    }
  }));
  qsa('[data-action="remove-exercise"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei;
    if (!confirm('Übung aus diesem Training entfernen?')) return;
    collapseAway(btn.closest('.exercise-block'), () => {
      w.entries.splice(ei, 1);
      Store.setActive(w);
      render();
    });
  }));
  qsa('[data-field="weight"], [data-field="reps"]').forEach((input) => input.addEventListener('input', () => {
    const w = getActive();
    const ei = +input.dataset.ei, si = +input.dataset.si;
    const val = parseFloat(input.value.replace(',', '.')) || 0;
    const set = w.entries[ei].sets[si];
    set[input.dataset.field] = val;
    if (set.suggested) {
      set.suggested = false;
      // sofort optisch bestätigen (grau -> normal), ohne die ganze Zeile neu zu rendern
      qsa(`.set-input[data-ei="${ei}"][data-si="${si}"]`).forEach((el) => el.classList.remove('suggested'));
    }
    Store.setActive(w);
  }));
}

// Reihenfolge im laufenden Training ändern – z.B. wenn die Maschine für die
// nächste Übung belegt ist. Bewusst in einem eigenen Sheet mit kurzen Zeilen
// statt per Ziehen an den hohen Übungskarten: die enthalten Eingabefelder und
// stehen in einer scrollenden Liste, da wird eine Ziehgeste schnell zur
// Zitterpartie. Zusätzlich hebt ein Tipp auf den Pfeil eine Übung direkt nach
// ganz oben – der häufigste Fall mit einem Griff.
function openReorderSheet() {
  const order = Store.getActive().entries.map((e, i) => i);

  const rowsHtml = () => order.map((entryIndex, position) => {
    const entry = Store.getActive().entries[entryIndex];
    const doneSets = entry.sets.filter((s) => s.done).length;
    return `<div class="list-item reorder-item">
      <span class="drag-handle" data-drag-handle aria-hidden="true">${Icon.grip}</span>
      <div class="list-item-main">
        <strong>${escapeHtml(entry.exerciseName)}</strong>
        <span class="muted">${doneSets} von ${entry.sets.length} Sätzen</span>
      </div>
      ${position === 0 ? '<span class="pill pill-chosen">dran</span>'
        : `<button class="icon-btn small" data-action="to-top" data-pos="${position}" aria-label="Nach ganz oben">${Icon.toTop}</button>`}
    </div>`;
  }).join('');

  function renderSheet() {
    openSheet('Reihenfolge', `<div class="card list" id="reorder-list">${rowsHtml()}</div>
      <p class="muted small" style="margin-top:10px">Zum Verschieben den Griff gedrückt halten und ziehen.</p>`, {
      footer: '<button class="btn btn-primary full" data-action="apply-order">Übernehmen</button>',
      onMount: () => {
        enableDragReorder(qs('#reorder-list'), (from, to) => {
          order.splice(to, 0, ...order.splice(from, 1));
          renderSheet();
        });
        qsa('[data-action="to-top"]').forEach((btn) => btn.addEventListener('click', () => {
          const pos = +btn.dataset.pos;
          order.unshift(...order.splice(pos, 1));
          renderSheet();
        }));
        qs('[data-action="apply-order"]').addEventListener('click', () => {
          const w = Store.getActive();
          w.entries = order.map((i) => w.entries[i]);
          Store.setActive(w);
          closeSheet();
          render();
        });
      },
    });
  }

  renderSheet();
}

// Auswahl-Sheet für Übungen, geteilt von Training und Plan-Editor: Suche,
// Gliederung nach Muskelgruppe und Mehrfachauswahl, ohne dass sich das Sheet
// nach jeder Übung schließt.
function openExercisePickerSheet({ title, isChosen, chosenLabel, onPick, onDone }) {
  groupState.picker.query = '';

  const rowHtml = (ex) => `
    <button class="list-item selectable" data-action="pick-exercise" data-id="${ex.id}">
      <div class="list-item-main"><strong>${escapeHtml(ex.name)}</strong></div>
      ${isChosen(ex.id) ? `<span class="pill pill-chosen">${chosenLabel}</span>` : Icon.plus}
    </button>`;

  const listHtml = () => groupedExercisesHtml(Store.getExercises(), {
    query: groupState.picker.query,
    open: groupState.picker.open,
    rowHtml,
  });

  openSheet(title, `
    <input type="search" id="ex-search" class="text-input search-input" placeholder="Übung suchen…" />
    <div id="ex-pick-list" class="ex-groups">${listHtml()}</div>
  `, {
    footer: `<button class="btn btn-secondary full" data-action="picker-done">Fertig</button>`,
    onDismiss: onDone,
    onMount: () => {
      qs('[data-action="picker-done"]').addEventListener('click', () => (onDone ? onDone() : closeSheet()));
      const list = qs('#ex-pick-list');
      const refresh = () => { list.innerHTML = listHtml(); bind(); };
      function bind() {
        bindGroupToggles(list, groupState.picker.open);
        qsa('[data-action="pick-exercise"]', list).forEach((btn) => btn.addEventListener('click', () => {
          if (isChosen(btn.dataset.id)) return;
          onPick(btn.dataset.id);
          // Nur die betroffene Zeile umschreiben – so bleibt die Scroll-
          // Position erhalten und die Auswahl fühlt sich direkt an.
          const ex = Store.getExercise(btn.dataset.id);
          if (ex) btn.outerHTML = rowHtml(ex);
          bind();
        }));
      }
      bind();
      qs('#ex-search').addEventListener('input', (e) => { groupState.picker.query = e.target.value; refresh(); });
    },
  });
}

function openAddExerciseToWorkoutSheet() {
  openExercisePickerSheet({
    title: 'Übung hinzufügen',
    chosenLabel: 'dabei',
    isChosen: (id) => (Store.getActive()?.entries || []).some((e) => e.exerciseId === id),
    onPick: (id) => {
      const w = Store.getActive();
      const ex = Store.getExercise(id);
      if (!w || !ex) return;
      w.entries.push({ exerciseId: ex.id, exerciseName: ex.name, sets: defaultSets(ex, w.id) });
      Store.setActive(w);
      // Das Training im Hintergrund aktualisieren – das Sheet lebt in einem
      // eigenen Container und bleibt dabei offen.
      render();
      dropIn(qs(`.exercise-block[data-ei="${w.entries.length - 1}"]`));
    },
  });
}

// ---- Verlauf-Tab ----
function renderHistory() {
  const sub = state.historySubTab;
  return `
    <div class="segmented" id="history-segmented">
      <button class="${sub === 'log' ? 'active' : ''}" data-action="history-sub" data-sub="log">Verlauf</button>
      <button class="${sub === 'progress' ? 'active' : ''}" data-action="history-sub" data-sub="progress">Fortschritt</button>
      <span class="segmented-thumb" aria-hidden="true"></span>
    </div>
    ${sub === 'log' ? renderCalendar() + renderHistoryLog() : renderProgress()}`;
}

// Simpler Monatskalender: markiert Tage, an denen ein Training abgeschlossen wurde.
function renderCalendar() {
  const { calendarYear: year, calendarMonth: month } = state;
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Woche beginnt Montag
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const workoutDays = new Set(
    Store.getWorkouts().filter((w) => w.finishedAt).map((w) => {
      const d = new Date(w.startedAt);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );

  const monthLabel = first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const weekdayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  let cells = '';
  for (let i = 0; i < startWeekday; i++) cells += '<span class="cal-cell empty"></span>';
  for (let d = 1; d <= daysInMonth; d++) {
    const hasWorkout = workoutDays.has(`${year}-${month}-${d}`);
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    cells += `<span class="cal-cell ${hasWorkout ? 'has-workout' : ''} ${isToday ? 'today' : ''}">${d}</span>`;
  }

  return `
    <div class="card calendar">
      <div class="calendar-header">
        <button class="icon-btn small" data-action="cal-prev" aria-label="Vorheriger Monat">${Icon.chevron}</button>
        <strong>${monthLabel}</strong>
        <button class="icon-btn small" data-action="cal-next" aria-label="Nächster Monat">${Icon.chevron}</button>
      </div>
      <div class="calendar-weekdays">${weekdayLabels.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="calendar-grid">${cells}</div>
    </div>`;
}

function bindCalendarEvents() {
  qs('[data-action="cal-prev"]')?.addEventListener('click', () => shiftCalendar(-1));
  qs('[data-action="cal-next"]')?.addEventListener('click', () => shiftCalendar(1));
}

// Nur die Kalenderkarte austauschen statt der ganzen Seite – das hält die
// Scroll-Position und erlaubt, das neue Raster in Blätterrichtung einzublenden.
function shiftCalendar(direction) {
  const month = state.calendarMonth + direction;
  state.calendarYear += Math.floor(month / 12);
  state.calendarMonth = ((month % 12) + 12) % 12;

  const card = qs('.calendar');
  if (!card) { render(); return; }
  card.outerHTML = renderCalendar();
  bindCalendarEvents();
  const grid = qs('.calendar-grid');
  if (grid && !prefersReducedMotion()) {
    grid.style.setProperty('--enter-x', direction > 0 ? '20px' : '-20px');
    grid.classList.add('item-in');
    grid.addEventListener('animationend', () => grid.classList.remove('item-in'), { once: true });
  }
}

function renderHistoryLog() {
  const workouts = Store.getWorkouts().filter((w) => w.finishedAt);
  if (!workouts.length) return '<p class="empty">Noch keine abgeschlossenen Trainings.</p>';
  return `<div class="card list">${workouts.map((w) => {
    const sets = w.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    const dur = w.finishedAt ? formatDuration(new Date(w.finishedAt) - new Date(w.startedAt)) : '';
    return `<button class="list-item selectable" data-action="open-workout" data-id="${w.id}">
      <div class="list-item-main">
        <strong>${escapeHtml(w.routineName || 'Freies Training')}</strong>
        <span class="muted">${formatDate(w.startedAt)} · ${dur} · ${sets} Sätze</span>
      </div>
      ${Icon.chevron}
    </button>`;
  }).join('')}</div>`;
}

function renderProgress() {
  const exercises = Store.getExercises();
  const withHistory = exercises.filter((ex) => Store.getWorkouts().some((w) => w.entries.some((e) => e.exerciseId === ex.id && e.sets.some((s) => s.done))));
  if (!withHistory.length) return '<p class="empty">Noch keine Trainingsdaten für den Fortschritt.</p>';
  if (!state.progressExerciseId || !withHistory.some((e) => e.id === state.progressExerciseId)) {
    state.progressExerciseId = withHistory[0].id;
  }
  const unit = unitLabel(Store.getSettings().unit);
  const points = Store.getWorkouts()
    .filter((w) => w.finishedAt)
    .slice().reverse()
    .map((w) => {
      const entry = w.entries.find((e) => e.exerciseId === state.progressExerciseId);
      if (!entry) return null;
      const best = bestSet(entry.sets);
      if (!best) return null;
      return { value: estimate1RM(best.weight, best.reps), label: formatDate(w.startedAt), weight: best.weight, reps: best.reps };
    }).filter(Boolean);

  const pr = points.length ? points.reduce((a, b) => (b.weight > a.weight ? b : a)) : null;

  return `
    <select id="progress-select" class="text-input">
      ${withHistory.map((ex) => `<option value="${ex.id}" ${ex.id === state.progressExerciseId ? 'selected' : ''}>${escapeHtml(ex.name)}</option>`).join('')}
    </select>
    <div class="card">
      <div class="section-title">Geschätztes 1RM (Epley)</div>
      ${points.length ? `<canvas id="progress-chart" class="chart"></canvas>` : '<p class="empty">Noch keine Sätze für diese Übung.</p>'}
    </div>
    ${pr ? `<div class="card stat-row">
      <div><span class="stat-value">${pr.weight}${unit}</span><span class="muted small">Bestes Gewicht</span></div>
      <div><span class="stat-value">${pr.reps}</span><span class="muted small">bei Wdh (PR)</span></div>
      <div><span class="stat-value">${points.length}</span><span class="muted small">Einheiten</span></div>
    </div>` : ''}`;
}

function bindHistoryEvents() {
  qsa('[data-action="history-sub"]').forEach((btn) => btn.addEventListener('click', () => {
    historySwipe.selectWithSlide(btn.dataset.sub);
  }));
  qs('#history-segmented')?.addEventListener('pointerdown', historySwipe.onPointerDown);
  qsa('[data-action="open-workout"]').forEach((btn) => btn.addEventListener('click', () => openWorkoutDetailSheet(btn.dataset.id)));
  bindCalendarEvents();

  if (state.historySubTab === 'progress') {
    qs('#progress-select')?.addEventListener('change', (e) => { state.progressExerciseId = e.target.value; render(); });
    const canvas = qs('#progress-chart');
    if (canvas) {
      const workouts = Store.getWorkouts().filter((w) => w.finishedAt).slice().reverse();
      const points = workouts.map((w) => {
        const entry = w.entries.find((e) => e.exerciseId === state.progressExerciseId);
        if (!entry) return null;
        const best = bestSet(entry.sets);
        if (!best) return null;
        return { value: estimate1RM(best.weight, best.reps), label: formatDate(w.startedAt) };
      }).filter(Boolean);
      animateChart(canvas, points);
    }
  }
}

function animateChart(canvas, points) {
  if (prefersReducedMotion() || points.length < 2) { drawLineChart(canvas, points); return; }
  const duration = 620;
  const start = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    drawLineChart(canvas, points, { progress: eased });
    if (t < 1 && document.contains(canvas)) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function openWorkoutDetailSheet(id) {
  const w = Store.getWorkouts().find((x) => x.id === id);
  if (!w) return;
  const unit = unitLabel(Store.getSettings().unit);
  const body = w.entries.map((e) => `
    <div class="detail-exercise">
      <strong>${escapeHtml(e.exerciseName)}</strong>
      <div class="detail-sets">
        ${e.sets.filter((s) => s.done).map((s, i) => `<span class="set-chip ${s.pr ? 'pr' : ''}">${i + 1}. ${s.weight}${unit} × ${s.reps}${s.pr ? ' 🏆' : ''}</span>`).join('') || '<span class="muted small">Keine Sätze</span>'}
      </div>
    </div>`).join('');
  const doneSets = w.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  openSheet(escapeHtml(w.routineName || 'Freies Training'), `
    <p class="muted">${formatDateTime(w.startedAt)}</p>
    <div class="card stat-row detail-stats">
      <div><span class="stat-value">${formatDuration(new Date(w.finishedAt) - new Date(w.startedAt))}</span><span class="muted small">Dauer</span></div>
      <div><span class="stat-value">${doneSets}</span><span class="muted small">Sätze</span></div>
      <div><span class="stat-value">${formatVolume(workoutVolume(w))}</span><span class="muted small">Volumen (${unit})</span></div>
    </div>
    ${body}
  `, {
    footer: `<button class="btn btn-ghost danger full" data-action="delete-workout" data-id="${w.id}">${Icon.trash} Training löschen</button>`,
    onMount: () => {
      qs('[data-action="delete-workout"]').addEventListener('click', () => {
        if (confirm('Dieses Training wirklich löschen?')) {
          Store.deleteWorkout(w.id);
          closeSheet();
          render();
        }
      });
    },
  });
}

// ---- Übungslisten: Suche + Gliederung nach Muskelgruppe ----
// Bei über 130 Übungen ist eine flache Liste unbrauchbar. Deshalb überall
// dieselbe Darstellung: oben ein Suchfeld, darunter die Muskelgruppen als
// aufklappbare Abschnitte. Eine aktive Suche klappt alle Treffer automatisch
// auf, damit man nicht erst suchen und dann noch aufklappen muss.
const groupState = {
  library: { query: '', open: new Set() },
  picker: { query: '', open: new Set() },
};

function groupOf(exercise) {
  return MUSCLE_GROUPS.includes(exercise.muscleGroup) ? exercise.muscleGroup : 'Sonstiges';
}

function filterExercises(exercises, query) {
  const q = query.trim().toLowerCase();
  if (!q) return exercises;
  return exercises.filter((ex) => `${ex.name} ${ex.muscleGroup}`.toLowerCase().includes(q));
}

function groupedExercisesHtml(exercises, { query, open, rowHtml, emptyText = 'Keine Übung gefunden.' }) {
  const matches = filterExercises(exercises, query);
  if (!matches.length) return `<p class="empty">${emptyText}</p>`;
  const searching = !!query.trim();

  return MUSCLE_GROUPS.map((group) => {
    const rows = matches
      .filter((ex) => groupOf(ex) === group)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!rows.length) return '';
    const isOpen = searching || open.has(group);
    return `
      <section class="ex-group ${isOpen ? 'open' : ''}" data-group="${group}">
        <button class="ex-group-header" data-action="toggle-group" data-group="${group}">
          <strong>${group}</strong>
          <span class="ex-group-count">${rows.length}</span>
          <span class="ex-group-chevron">${Icon.chevron}</span>
        </button>
        <div class="ex-group-body"><div class="card list">${rows.map(rowHtml).join('')}</div></div>
      </section>`;
  }).join('');
}

function bindGroupToggles(container, openSet) {
  qsa('[data-action="toggle-group"]', container).forEach((btn) => btn.addEventListener('click', () => {
    const section = btn.closest('.ex-group');
    const group = btn.dataset.group;
    const willOpen = !section.classList.contains('open');
    if (willOpen) openSet.add(group); else openSet.delete(group);
    animateGroup(section, willOpen);
  }));
}

// Auf-/Zuklappen mit echter Höhen-Animation: die Zielhöhe wird gemessen,
// animiert und danach wieder an das CSS zurückgegeben, damit sich der Inhalt
// frei ändern kann (z.B. wenn ein Treffer dazukommt).
function animateGroup(section, open) {
  const body = qs('.ex-group-body', section);
  if (!body) return;
  const inner = body.firstElementChild;
  const from = body.getBoundingClientRect().height;
  const to = open ? inner.getBoundingClientRect().height : 0;
  section.classList.toggle('open', open);

  if (prefersReducedMotion()) { body.style.height = ''; return; }

  body.style.height = `${from}px`;
  void body.offsetHeight;
  body.style.transition = 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
  body.style.height = `${to}px`;
  const done = (e) => {
    if (e.target !== body || e.propertyName !== 'height') return;
    body.style.transition = '';
    body.style.height = '';
    body.removeEventListener('transitionend', done);
  };
  body.addEventListener('transitionend', done);
}

// ---- Bibliothek-Tab ----
function renderLibrary() {
  return `
    <div class="segmented" id="library-segmented">
      <button class="${state.librarySubTab === 'exercises' ? 'active' : ''}" data-action="library-sub" data-sub="exercises">Übungen</button>
      <button class="${state.librarySubTab === 'routines' ? 'active' : ''}" data-action="library-sub" data-sub="routines">Pläne</button>
      <span class="segmented-thumb" aria-hidden="true"></span>
    </div>
    ${state.librarySubTab === 'exercises' ? renderExerciseList() : renderRoutineList()}`;
}

const exerciseRowHtml = (ex) => `
  <button class="list-item selectable" data-action="edit-exercise" data-id="${ex.id}">
    <div class="list-item-main"><strong>${escapeHtml(ex.name)}</strong></div>
    ${Icon.chevron}
  </button>`;

function renderExerciseList() {
  if (!Store.getExercises().length) return '<p class="empty">Noch keine Übungen. Tippe oben rechts auf +.</p>';
  return `
    <input type="search" id="exercise-search" class="text-input search-input" placeholder="Übung suchen…"
      value="${escapeHtml(groupState.library.query)}" />
    <div id="exercise-groups" class="ex-groups">${renderExerciseGroups()}</div>`;
}

function renderExerciseGroups() {
  return groupedExercisesHtml(Store.getExercises(), {
    query: groupState.library.query,
    open: groupState.library.open,
    rowHtml: exerciseRowHtml,
  });
}

function renderRoutineList() {
  const routines = Store.getRoutines();
  if (!routines.length) return '<p class="empty">Noch keine Pläne. Tippe oben rechts auf +.</p>';
  return `<div class="card list">${routines.map((r) => `
    <button class="list-item selectable" data-action="edit-routine" data-id="${r.id}">
      <div class="list-item-main"><strong>${escapeHtml(r.name)}</strong><span class="muted">${r.exerciseIds.length} Übung(en)</span></div>
      ${Icon.chevron}
    </button>`).join('')}</div>`;
}

function bindLibraryEvents() {
  qsa('[data-action="library-sub"]').forEach((btn) => btn.addEventListener('click', () => {
    librarySwipe.selectWithSlide(btn.dataset.sub);
  }));
  qs('#library-segmented')?.addEventListener('pointerdown', librarySwipe.onPointerDown);
  qsa('[data-action="edit-routine"]').forEach((btn) => btn.addEventListener('click', () => openRoutineSheet(btn.dataset.id)));

  const groups = qs('#exercise-groups');
  if (groups) {
    const bindRows = () => {
      bindGroupToggles(groups, groupState.library.open);
      qsa('[data-action="edit-exercise"]', groups).forEach((btn) =>
        btn.addEventListener('click', () => openExerciseSheet(btn.dataset.id)));
    };
    bindRows();
    // Nur die Liste neu aufbauen statt render(): sonst verlöre das Suchfeld
    // bei jedem Tastendruck den Fokus.
    qs('#exercise-search')?.addEventListener('input', (e) => {
      groupState.library.query = e.target.value;
      groups.innerHTML = renderExerciseGroups();
      bindRows();
    });
  }
}

// Beste je geschaffte Leistung einer Übung, damit man beim Nachschlagen
// nicht erst in den Verlauf wechseln muss.
function exerciseBestHtml(exerciseId) {
  const unit = unitLabel(Store.getSettings().unit);
  let best = null;
  let bestDate = null;
  let sessions = 0;
  Store.getWorkouts().filter((w) => w.finishedAt).forEach((w) => {
    const entries = w.entries.filter((e) => e.exerciseId === exerciseId);
    if (!entries.length) return;
    const top = bestSet(entries.flatMap((e) => e.sets));
    if (!top) return;
    sessions += 1;
    if (!best || estimate1RM(top.weight, top.reps) > estimate1RM(best.weight, best.reps)) {
      best = top;
      bestDate = w.startedAt;
    }
  });
  if (!best) return '';
  return `
    <div class="card stat-row detail-stats">
      <div><span class="stat-value">${best.weight}${unit}</span><span class="muted small">Bestes Gewicht</span></div>
      <div><span class="stat-value">${best.reps}</span><span class="muted small">bei Wdh</span></div>
      <div><span class="stat-value">${sessions}</span><span class="muted small">Einheiten</span></div>
    </div>
    <p class="muted small">Bestleistung am ${formatDate(bestDate)}</p>`;
}

function openExerciseSheet(id) {
  const ex = id ? Store.getExercise(id) : { id: uid(), name: '', muscleGroup: MUSCLE_GROUPS[0], notes: '' };
  openSheet(id ? 'Übung bearbeiten' : 'Neue Übung', `
    ${id ? exerciseBestHtml(ex.id) : ''}
    <label class="field-label">Name</label>
    <input type="text" id="f-name" class="text-input" value="${escapeHtml(ex.name)}" placeholder="z.B. Bankdrücken" autofocus />
    <label class="field-label">Muskelgruppe</label>
    <select id="f-group" class="text-input">
      ${MUSCLE_GROUPS.map((g) => `<option value="${g}" ${g === ex.muscleGroup ? 'selected' : ''}>${g}</option>`).join('')}
    </select>
    <label class="field-label">Notizen (optional)</label>
    <textarea id="f-notes" class="text-input" rows="2" placeholder="z.B. Griffbreite, Setup...">${escapeHtml(ex.notes)}</textarea>
  `, {
    footer: `
      <button class="btn btn-primary full" data-action="save-exercise">Speichern</button>
      ${id ? `<button class="btn btn-ghost danger full" data-action="delete-exercise">${Icon.trash} Löschen</button>` : ''}
    `,
    onMount: () => {
      qs('[data-action="save-exercise"]').addEventListener('click', () => {
        const name = qs('#f-name').value.trim();
        if (!name) { qs('#f-name').focus(); return; }
        Store.saveExercise({ id: ex.id, name, muscleGroup: qs('#f-group').value, notes: qs('#f-notes').value.trim() });
        closeSheet();
        render();
      });
      qs('[data-action="delete-exercise"]')?.addEventListener('click', () => {
        if (confirm('Übung wirklich löschen? Sie wird auch aus Plänen entfernt.')) {
          Store.deleteExercise(ex.id);
          closeSheet();
          render();
        }
      });
    },
  });
}

// Lang drücken + ziehen, um eine Zeile innerhalb ihres Containers neu zu
// sortieren (z.B. Übungen in einem Plan). onReorder(fromIndex, toIndex) wird
// einmalig beim Loslassen aufgerufen, sobald sich die Position geändert hat.
function enableDragReorder(container, onReorder) {
  if (!container) return;
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-drag-handle]');
    if (!handle) return;
    const row = handle.closest('.list-item');
    if (!row) return;
    e.preventDefault();
    const rows = qsa('.list-item', container);
    const startIndex = rows.indexOf(row);
    const startY = e.clientY;
    const rowHeight = row.getBoundingClientRect().height;
    let order = rows.map((_, i) => i);
    let active = false;

    const pressTimer = setTimeout(() => {
      active = true;
      row.classList.add('drag-active');
    }, 160);

    function onMove(ev) {
      const dy = ev.clientY - startY;
      if (!active) {
        if (Math.abs(dy) > 8) teardown();
        return;
      }
      row.style.transform = `translateY(${dy}px) scale(1.02)`;
      const rawSlot = startIndex + Math.round(dy / rowHeight);
      const targetSlot = Math.max(0, Math.min(rows.length - 1, rawSlot));
      const currentSlot = order.indexOf(startIndex);
      if (targetSlot !== currentSlot) {
        order.splice(currentSlot, 1);
        order.splice(targetSlot, 0, startIndex);
        rows.forEach((r, i) => {
          if (i === startIndex) return;
          const slot = order.indexOf(i);
          const offset = (slot - i) * rowHeight;
          r.style.transition = 'transform 0.2s ease';
          r.style.transform = offset ? `translateY(${offset}px)` : '';
        });
      }
    }

    function onUp() {
      clearTimeout(pressTimer);
      teardown();
      if (!active) return;
      row.classList.remove('drag-active');
      rows.forEach((r) => { r.style.transform = ''; r.style.transition = ''; });
      const finalIndex = order.indexOf(startIndex);
      if (finalIndex !== startIndex) onReorder(startIndex, finalIndex);
    }

    function teardown() {
      clearTimeout(pressTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function openRoutineSheet(id) {
  const routine = id ? Store.getRoutine(id) : { id: uid(), name: '', exerciseIds: [], setCounts: {} };
  const draft = { ...routine, exerciseIds: [...routine.exerciseIds], setCounts: { ...(routine.setCounts || {}) } };

  const renderChosen = () => draft.exerciseIds.map((eid, i) => {
    const ex = Store.getExercise(eid);
    const sets = draft.setCounts?.[eid] ?? 2;
    return `<div class="list-item reorder-item">
      <span class="drag-handle" data-drag-handle aria-hidden="true">${Icon.grip}</span>
      <div class="list-item-main"><strong>${ex ? escapeHtml(ex.name) : 'Unbekannt'}</strong></div>
      <span class="set-stepper">
        <button class="step-btn" data-action="set-count" data-id="${eid}" data-delta="-1" aria-label="Weniger Sätze">−</button>
        <span class="step-value">${sets}×</span>
        <button class="step-btn" data-action="set-count" data-id="${eid}" data-delta="1" aria-label="Mehr Sätze">+</button>
      </span>
      <button class="icon-btn small danger" data-action="remove-from-routine" data-i="${i}">${Icon.close}</button>
    </div>`;
  }).join('') || '<p class="empty small">Noch keine Übungen gewählt.</p>';

  function renderEditor() {
    openSheet(id ? 'Plan bearbeiten' : 'Neuer Plan', `
      <label class="field-label">Name</label>
      <input type="text" id="f-rname" class="text-input" value="${escapeHtml(draft.name)}" placeholder="z.B. Push Day" />
      <label class="field-label">Übungen</label>
      <div class="card list" id="chosen-list">${renderChosen()}</div>
      <button class="btn btn-secondary small" data-action="add-to-routine">${Icon.plus} Übung wählen</button>
    `, {
      footer: `
        <button class="btn btn-primary full" data-action="save-routine">Speichern</button>
        ${id ? `<button class="btn btn-ghost danger full" data-action="delete-routine">${Icon.trash} Löschen</button>` : ''}
      `,
      onMount: bindEditor,
    });
  }

  function bindEditor() {
    const chosenList = qs('#chosen-list');
    enableDragReorder(chosenList, (from, to) => {
      const [moved] = draft.exerciseIds.splice(from, 1);
      draft.exerciseIds.splice(to, 0, moved);
      draft.name = qs('#f-rname').value;
      renderEditor();
    });
    qsa('[data-action="remove-from-routine"]').forEach((b) => b.addEventListener('click', () => {
      draft.exerciseIds.splice(+b.dataset.i, 1);
      draft.name = qs('#f-rname').value;
      renderEditor();
    }));
    qsa('[data-action="set-count"]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.id;
      draft.setCounts = draft.setCounts || {};
      const next = Math.max(1, Math.min(12, (draft.setCounts[id] ?? 2) + +b.dataset.delta));
      draft.setCounts[id] = next;
      // Nur die Zahl austauschen – ein Neuaufbau des Sheets wäre hier zu viel.
      b.parentElement.querySelector('.step-value').textContent = `${next}×`;
    }));
    qs('[data-action="add-to-routine"]').addEventListener('click', () => {
      draft.name = qs('#f-rname').value;
      openExercisePicker();
    });
    qs('[data-action="save-routine"]').addEventListener('click', () => {
      const name = qs('#f-rname').value.trim();
      if (!name) { qs('#f-rname').focus(); return; }
      Store.saveRoutine({ id: draft.id, name, exerciseIds: draft.exerciseIds, setCounts: draft.setCounts || {} });
      closeSheet();
      render();
    });
    qs('[data-action="delete-routine"]')?.addEventListener('click', () => {
      if (confirm('Plan wirklich löschen?')) {
        Store.deleteRoutine(draft.id);
        closeSheet();
        render();
      }
    });
  }

  function openExercisePicker() {
    openExercisePickerSheet({
      title: 'Übung wählen',
      chosenLabel: 'gewählt',
      isChosen: (id) => draft.exerciseIds.includes(id),
      onPick: (id) => { draft.exerciseIds.push(id); },
      onDone: renderEditor,
    });
  }

  renderEditor();
}

// ---- Einstellungen-Tab ----
function renderSettings() {
  const settings = Store.getSettings();
  return `
    <section class="card">
      <div class="section-title">Einheit</div>
      <div class="segmented">
        <button class="${settings.unit === 'kg' ? 'active' : ''}" data-action="set-unit" data-unit="kg">kg</button>
        <button class="${settings.unit === 'lb' ? 'active' : ''}" data-action="set-unit" data-unit="lb">lb</button>
        <span class="segmented-thumb" aria-hidden="true"></span>
      </div>
      <p class="muted small">Ändert nur die Anzeige-Einheit für neue Einträge, bestehende Werte werden nicht umgerechnet.</p>
    </section>
    <section class="card">
      <div class="section-title">Akzentfarbe</div>
      <div class="swatch-row">
        ${ACCENT_COLORS.map((c) => `
          <button class="swatch ${settings.accent === c.value ? 'active' : ''}" data-action="set-accent" data-color="${c.value}"
            style="background:${c.value}" aria-label="${c.label}">${settings.accent === c.value ? Icon.check : ''}</button>
        `).join('')}
      </div>
    </section>
    <section class="card">
      <div class="toggle-row">
        <div>
          <strong>Standortbestimmung</strong>
          <p class="muted small">Zeigt auf der Startseite ein ehrliches Urteil zu Konstanz und Kraftentwicklung – samt dem nächsten konkreten Schritt.</p>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggle-motivation" ${settings.motivation ? 'checked' : ''} />
          <span class="toggle-track"></span>
        </label>
      </div>
      ${settings.motivation ? `
        <div class="section-title" style="margin-top:14px">Wochenziel</div>
        <div class="chip-row">
          ${WEEKLY_GOALS.map((g) => `
            <button class="chip ${settings.weeklyGoal === g ? 'active' : ''}" data-action="set-goal" data-goal="${g}">${g}×</button>
          `).join('')}
        </div>` : ''}
    </section>
    <section class="card">
      <div class="toggle-row">
        <div>
          <strong>Töne</strong>
          <p class="muted small">Kurze Rückmeldung beim Abhaken, bei Rekorden und am Ende der Pause. Stummschalter des iPhones hat Vorrang.</p>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggle-sound" ${settings.sound ? 'checked' : ''} />
          <span class="toggle-track"></span>
        </label>
      </div>
    </section>
    <section class="card">
      <div class="section-title">Pause zwischen Sätzen</div>
      <div class="chip-row">
        ${REST_OPTIONS.map((s) => `
          <button class="chip ${settings.restSeconds === s ? 'active' : ''}" data-action="set-rest" data-seconds="${s}">
            ${s === 0 ? 'Aus' : `${s}s`}
          </button>`).join('')}
      </div>
      <p class="muted small">Startet automatisch, sobald du einen Satz abhakst.</p>
    </section>
    <section class="card">
      <div class="toggle-row">
        <div>
          <strong>Progressive Overload</strong>
          <p class="muted small">Schlägt vor, das Gewicht zu erhöhen, sobald du eine Übung in den letzten 2 Einheiten bei gleichem Gewicht mit durchweg 10+ Wiederholungen geschafft hast.</p>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggle-overload" ${settings.progressiveOverload ? 'checked' : ''} />
          <span class="toggle-track"></span>
        </label>
      </div>
    </section>
    <section class="card list">
      <button class="list-item selectable" data-action="export-data">
        <div class="list-item-main"><strong>Daten exportieren</strong><span class="muted">Backup als JSON-Datei speichern</span></div>
        ${Icon.download}
      </button>
      <label class="list-item selectable" for="import-file">
        <div class="list-item-main"><strong>Daten importieren</strong><span class="muted">Backup wiederherstellen (überschreibt alles)</span></div>
        ${Icon.upload}
      </label>
      <input type="file" id="import-file" accept="application/json" hidden />
    </section>
    <section class="card list">
      <button class="list-item selectable danger" data-action="wipe-data">
        <div class="list-item-main"><strong>Alle Daten löschen</strong><span class="muted">Setzt die App zurück</span></div>
        ${Icon.trash}
      </button>
    </section>
    <section class="card">
      <div class="section-title">Pläne per KI anlegen</div>
      <ol class="howto">
        <li>Prompt kopieren und an eine KI schicken.</li>
        <li>Plan beschreiben – per Sprachnachricht geht das am schnellsten.</li>
        <li>Antwort der KI hier einfügen und einlesen.</li>
      </ol>
      <button class="btn btn-secondary full" data-action="copy-plan-prompt">${Icon.copy} Prompt kopieren</button>
      <textarea id="plan-import-text" class="text-input import-area" rows="3"
        placeholder="Antwort der KI hier einfügen…"></textarea>
      <button class="btn btn-primary full" data-action="parse-plan-import">Pläne einlesen</button>
    </section>
    <p class="empty small">Alle Daten bleiben ausschließlich lokal auf diesem Gerät gespeichert.</p>`;
}

// ---- Pläne per KI importieren ----
// Die KI bekommt die eigene Übungsliste mit, damit sie exakt passende Namen
// verwendet. Beim Einlesen wird jede Zeile gegen die Bibliothek aufgelöst;
// was fehlt, wird als neue Übung angelegt – aber erst nach einer Vorschau,
// damit nichts unbemerkt in der Bibliothek landet.
function resolveImportedPlans(parsed) {
  const exercises = Store.getExercises();
  const byName = new Map(exercises.map((e) => [normalizeExerciseName(e.name), e]));

  const findExercise = (name) => {
    const norm = normalizeExerciseName(name);
    if (byName.has(norm)) return byName.get(norm);
    const base = normalizeExerciseName(name.replace(/\([^)]*\)/g, ''));
    if (base.length >= 4 && byName.has(base)) return byName.get(base);
    if (base.length < 4) return null;
    return exercises
      .filter((e) => {
        const n = normalizeExerciseName(e.name);
        return n.includes(base) || base.includes(n);
      })
      .sort((a, b) => a.name.length - b.name.length)[0] || null;
  };

  const created = new Map();
  const plans = parsed.plans.map((plan) => {
    const items = plan.items.map((item) => {
      const match = findExercise(item.name);
      if (match) return { exercise: match, sets: item.sets, isNew: false };

      const key = normalizeExerciseName(item.name);
      if (!created.has(key)) {
        created.set(key, {
          id: uid(),
          name: item.name,
          muscleGroup: MUSCLE_GROUPS.includes(item.muscleGroup) ? item.muscleGroup : 'Sonstiges',
          notes: '',
        });
      }
      return { exercise: created.get(key), sets: item.sets, isNew: true };
    });
    const existing = Store.getRoutines().find(
      (r) => r.name.trim().toLowerCase() === plan.name.trim().toLowerCase(),
    );
    return { name: plan.name, items, replaces: existing || null };
  });

  return { plans, newExercises: [...created.values()], warnings: parsed.warnings };
}

function applyImportedPlans(resolved) {
  resolved.newExercises.forEach((ex) => Store.saveExercise(ex));
  resolved.plans.forEach((plan) => {
    const setCounts = {};
    plan.items.forEach((item) => { setCounts[item.exercise.id] = item.sets; });
    Store.saveRoutine({
      id: plan.replaces ? plan.replaces.id : uid(),
      name: plan.name,
      exerciseIds: plan.items.map((i) => i.exercise.id),
      setCounts,
    });
  });
}

function openImportPreview(text) {
  const parsed = parsePlanText(text);
  if (!parsed.plans.length) {
    openSheet('Nichts gefunden', `
      <p class="muted">In dem Text steckt kein Plan im erwarteten Format. Erwartet wird:</p>
      <pre class="diag">PLAN: Push
- Bankdrücken (Langhantel) | 3
- Seitheben (Kurzhantel) | 4</pre>
      ${parsed.warnings.map((w) => `<p class="muted small">${escapeHtml(w)}</p>`).join('')}
      <p class="muted small">Tipp: Den Prompt oben kopieren – damit antwortet die KI im richtigen Format.</p>`);
    return;
  }

  const resolved = resolveImportedPlans(parsed);
  const body = resolved.plans.map((plan) => `
    <div class="import-plan">
      <strong>${escapeHtml(plan.name)}</strong>
      ${plan.replaces ? '<span class="pill">ersetzt vorhandenen</span>' : ''}
      <div class="detail-sets">
        ${plan.items.map((i) => `<span class="set-chip ${i.isNew ? 'pr' : ''}">${escapeHtml(i.exercise.name)} · ${i.sets}×${i.isNew ? ' neu' : ''}</span>`).join('')}
      </div>
    </div>`).join('');

  const planCount = resolved.plans.length;
  const newCount = resolved.newExercises.length;
  openSheet('Import prüfen', `
    ${body}
    ${newCount ? `<p class="muted small">${newCount === 1
      ? 'Eine Übung ist noch nicht in der Bibliothek und wird angelegt.'
      : `${newCount} Übungen sind noch nicht in der Bibliothek und werden angelegt.`}</p>` : ''}
    ${resolved.warnings.map((w) => `<p class="muted small">⚠️ ${escapeHtml(w)}</p>`).join('')}
  `, {
    footer: `<button class="btn btn-primary full" data-action="confirm-import">
      ${planCount === 1 ? 'Plan übernehmen' : `${planCount} Pläne übernehmen`}</button>`,
    onMount: () => {
      qs('[data-action="confirm-import"]').addEventListener('click', () => {
        applyImportedPlans(resolved);
        closeSheet();
        const area = qs('#plan-import-text');
        if (area) area.value = '';
        state.tab = 'library';
        state.librarySubTab = 'routines';
        go(render);
        toast(planCount === 1 ? 'Plan importiert' : `${planCount} Pläne importiert`);
      });
    },
  });
}

function bindPlanImportEvents() {
  qs('[data-action="copy-plan-prompt"]')?.addEventListener('click', async (e) => {
    const prompt = buildPlanPrompt(Store.getExercises(), MUSCLE_GROUPS);
    try {
      await navigator.clipboard.writeText(prompt);
      toast('Prompt kopiert');
    } catch {
      // Ohne Zwischenablage-Rechte: Text zum manuellen Kopieren anbieten.
      const area = qs('#plan-import-text');
      if (area) { area.value = prompt; area.focus(); area.select(); }
      toast('Bitte von Hand kopieren');
    }
    e.currentTarget.blur();
  });

  qs('[data-action="parse-plan-import"]')?.addEventListener('click', () => {
    const text = qs('#plan-import-text')?.value.trim();
    if (!text) { qs('#plan-import-text')?.focus(); return; }
    openImportPreview(text);
  });

}

function bindSettingsEvents() {
  bindPlanImportEvents();
  qsa('[data-action="set-unit"]').forEach((btn) => btn.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), unit: btn.dataset.unit });
    render();
  }));
  qsa('[data-action="set-rest"]').forEach((btn) => btn.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), restSeconds: +btn.dataset.seconds });
    qsa('[data-action="set-rest"]').forEach((b) => b.classList.toggle('active', b === btn));
  }));
  qs('#toggle-sound')?.addEventListener('change', (e) => {
    Store.saveSettings({ ...Store.getSettings(), sound: e.target.checked });
    setSoundEnabled(e.target.checked);
    if (e.target.checked) Sound.setDone(); // einmal vorhören
  });
  qs('#toggle-motivation')?.addEventListener('change', (e) => {
    Store.saveSettings({ ...Store.getSettings(), motivation: e.target.checked });
    render(); // blendet das Wochenziel direkt ein oder aus
  });
  qsa('[data-action="set-goal"]').forEach((btn) => btn.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), weeklyGoal: +btn.dataset.goal });
    qsa('[data-action="set-goal"]').forEach((b) => b.classList.toggle('active', b === btn));
  }));
  qs('#toggle-overload')?.addEventListener('change', (e) => {
    Store.saveSettings({ ...Store.getSettings(), progressiveOverload: e.target.checked });
  });
  qsa('[data-action="set-accent"]').forEach((btn) => btn.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), accent: btn.dataset.color });
    applyAccent();
    render();
  }));
  qs('[data-action="export-data"]')?.addEventListener('click', () => {
    const data = Store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gym-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  qs('#import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Import überschreibt alle aktuellen Daten. Fortfahren?')) { e.target.value = ''; return; }
    try {
      const data = JSON.parse(await file.text());
      Store.importAll(data);
      toast('Daten importiert');
      go(render);
    } catch {
      alert('Datei konnte nicht gelesen werden.');
    }
    e.target.value = '';
  });
  qs('[data-action="wipe-data"]')?.addEventListener('click', () => {
    if (confirm('Wirklich ALLE Daten unwiderruflich löschen?')) {
      Store.wipeAll();
      go(render);
      toast('Zurückgesetzt');
    }
  });
}

// ---- Globale Events ----
function bindGlobalEvents() {
  qsa('[data-action="set-tab"]').forEach((btn) => btn.addEventListener('click', () => {
    tabSwipe.selectWithSlide(btn.dataset.tab);
  }));
  qs('.tabbar')?.addEventListener('pointerdown', tabSwipe.onPointerDown);
  qs('[data-action="add-exercise"]')?.addEventListener('click', () => openExerciseSheet(null));
  qs('[data-action="add-routine"]')?.addEventListener('click', () => openRoutineSheet(null));
}

// ---- Wischbare Auswahl (Tabbar + Segmented Controls): das Pill-/Thumb-Element
// wird wie ein physisches Objekt gegriffen, folgt 1:1 dem Finger, rastet beim
// Loslassen per Feder-Simulation (inkl. Schwung) ein – UND gleitet bei einem
// simplen Klick genau so weich zur Zielposition, statt instantan zu springen
// (da render() den ganzen Container neu aufbaut und CSS-Transitions dabei
// nicht greifen würden). Eine Fabrik, damit Tabbar und beide Segmented
// Controls exakt dasselbe Verhalten teilen, ohne Code zu duplizieren.
function rubberBand(overshoot, dim = 90) {
  return (overshoot * dim) / (dim + Math.abs(overshoot));
}

function clampWithRubberBand(raw, min, max) {
  if (raw < min) return min - rubberBand(min - raw);
  if (raw > max) return max + rubberBand(raw - max);
  return raw;
}

function createSwipeSelector({
  barSelector, indicatorSelector, handleSelector, ids, getActive, setActive, onChange, onMove, dragClass,
}) {
  let drag = null; // { startX, startLeft, minLeft, maxLeft, slotWidth, barLeft, barWidth, lastX, lastT, velocity, currentLeft }
  let springFrame = null;
  let liveLeft = null; // Ist-Position während Drag/Feder, für nahtloses erneutes Greifen

  function clampIdx(i) { return Math.max(0, Math.min(ids.length - 1, i)); }

  function geometry() {
    const bar = qs(barSelector);
    const indicator = qs(indicatorSelector);
    if (!bar || !indicator) return null;
    const barRect = bar.getBoundingClientRect();
    const indRect = indicator.getBoundingClientRect();
    const minLeft = indRect.width > 0 ? indicator.offsetLeft : 6;
    return {
      bar, indicator,
      slotWidth: indRect.width,
      minLeft,
      maxLeft: bar.clientWidth - minLeft - indRect.width,
      barLeft: barRect.left,
      barWidth: barRect.width,
    };
  }

  function cancelSpring() {
    if (springFrame) { cancelAnimationFrame(springFrame); springFrame = null; }
  }

  // Gedämpfte Federsimulation (Masse-Feder-Dämpfer): weiches, dynamisches
  // Eingleiten statt abruptem Stopp, ähnlich UIKit-Spring-Animationen.
  function springTo(el, from, to, initialVelocityPxPerSec, baseLeft) {
    cancelSpring();
    const stiffness = 340;
    const damping = 30;
    let pos = from;
    let vel = initialVelocityPxPerSec;
    let lastT = performance.now();
    function frame(now) {
      const dt = Math.min((now - lastT) / 1000, 1 / 30);
      lastT = now;
      const displacement = pos - to;
      const accel = (-stiffness * displacement - damping * vel);
      vel += accel * dt;
      pos += vel * dt;
      if (Math.abs(pos - to) < 0.4 && Math.abs(vel) < 15) {
        el.style.transition = '';
        el.style.transform = '';
        springFrame = null;
        liveLeft = null;
        return;
      }
      el.style.transform = `translateX(${pos}px)`;
      liveLeft = baseLeft + pos;
      springFrame = requestAnimationFrame(frame);
    }
    springFrame = requestAnimationFrame(frame);
  }

  function onPointerDown(e) {
    if (!e.target.closest(handleSelector)) return;
    const geo = geometry();
    if (!geo) return;
    cancelSpring();
    const idx = Math.max(0, ids.indexOf(getActive()));
    const currentLeft = liveLeft !== null ? liveLeft : geo.minLeft + idx * geo.slotWidth;
    drag = {
      startX: e.clientX,
      startLeft: currentLeft,
      minLeft: geo.minLeft,
      maxLeft: geo.maxLeft,
      slotWidth: geo.slotWidth,
      barLeft: geo.barLeft,
      barWidth: geo.barWidth,
      lastX: e.clientX,
      lastT: performance.now(),
      velocity: 0,
      currentLeft,
    };
    geo.indicator.style.transition = 'none';
    if (dragClass) geo.bar.classList.add(dragClass);
    isSwipeDragging = true;
    activeSwipeSelector = { onPointerMove, onPointerUp };
    onMove?.((e.clientX - geo.barLeft) / geo.barWidth, 0);
  }

  function onPointerMove(e) {
    if (!drag) return;
    const now = performance.now();
    const dt = now - drag.lastT;
    // dt-Mindestwert verhindert, dass sehr dicht aufeinanderfolgende Events
    // die Geschwindigkeit künstlich in die Höhe treiben.
    if (dt > 4) {
      const instVel = Math.max(-2.5, Math.min(2.5, (e.clientX - drag.lastX) / dt));
      drag.velocity = drag.velocity * 0.72 + instVel * 0.28;
      drag.lastX = e.clientX;
      drag.lastT = now;
    }

    const rawLeft = drag.startLeft + (e.clientX - drag.startX);
    const left = clampWithRubberBand(rawLeft, drag.minLeft, drag.maxLeft);
    drag.currentLeft = left;
    liveLeft = left;

    const indicator = qs(indicatorSelector);
    if (indicator) indicator.style.transform = `translateX(${left - drag.minLeft}px)`;

    const idx = clampIdx(Math.round((left - drag.minLeft) / drag.slotWidth));
    const id = ids[idx];
    if (id !== getActive()) {
      setActive(id);
      onChange();
      const fresh = qs(indicatorSelector);
      if (fresh) {
        fresh.style.transition = 'none';
        fresh.style.transform = `translateX(${left - drag.minLeft}px)`;
      }
      if (dragClass) qs(barSelector)?.classList.add(dragClass);
    }
    onMove?.((e.clientX - drag.barLeft) / drag.barWidth, drag.velocity);
  }

  function onPointerUp() {
    if (!drag) return;
    const { currentLeft, minLeft, slotWidth, velocity } = drag;
    drag = null;
    isSwipeDragging = false;
    activeSwipeSelector = null;

    // Schwung der Geste einbeziehen: nur ein wirklich schneller Flick (oberhalb
    // einer Totzone) darf die nächste Option "mitnehmen", wenn die Loslass-
    // Position sie knapp verfehlt. Eine langsame, kontrollierte Bewegung
    // entscheidet rein über ihre Endposition.
    const velPxPerSec = velocity * 1000;
    const deadZone = 320;
    const fullBiasAt = 1100;
    const excess = Math.max(0, Math.abs(velPxPerSec) - deadZone);
    const bias = Math.sign(velPxPerSec) * Math.min(1, excess / (fullBiasAt - deadZone));
    const idx = clampIdx(Math.round((currentLeft - minLeft) / slotWidth + bias));
    const targetId = ids[idx];
    const targetLeft = minLeft + idx * slotWidth;

    if (targetId !== getActive()) {
      setActive(targetId);
      onChange();
    }
    const indicator = qs(indicatorSelector);
    if (indicator) {
      indicator.style.transition = 'none';
      indicator.style.transform = `translateX(${currentLeft - minLeft}px)`;
      springTo(indicator, currentLeft - minLeft, targetLeft - minLeft, velocity * 1000, minLeft);
    }
    const bar = qs(barSelector);
    if (bar && dragClass) bar.classList.remove(dragClass);
    onMove?.(null);
  }

  // Für Klicks: dieselbe Feder-Physik wie beim Loslassen einer Ziehgeste,
  // nur ohne Anfangsschwung – damit ein Tap genauso "clean rüberswiped"
  // statt instantan zu springen (render() baut den Container ja neu auf).
  function selectWithSlide(id) {
    if (id === getActive()) return;
    const geo = geometry();
    if (!geo) { setActive(id); onChange(); return; }
    cancelSpring();
    const fromIdx = Math.max(0, ids.indexOf(getActive()));
    const fromLeft = liveLeft !== null ? liveLeft : geo.minLeft + fromIdx * geo.slotWidth;
    setActive(id);
    onChange();
    const indicator = qs(indicatorSelector);
    if (!indicator) return;
    const toIdx = Math.max(0, ids.indexOf(id));
    const toLeft = geo.minLeft + toIdx * geo.slotWidth;
    indicator.style.transition = 'none';
    indicator.style.transform = `translateX(${fromLeft - geo.minLeft}px)`;
    void indicator.offsetHeight; // Reflow erzwingen: Startzustand sichtbar malen, bevor die Feder losläuft
    springTo(indicator, fromLeft - geo.minLeft, toLeft - geo.minLeft, 0, geo.minLeft);
  }

  return { onPointerDown, selectWithSlide };
}

let activeSwipeSelector = null;
window.addEventListener('pointermove', (e) => activeSwipeSelector?.onPointerMove(e));
window.addEventListener('pointerup', () => activeSwipeSelector?.onPointerUp());
window.addEventListener('pointercancel', () => activeSwipeSelector?.onPointerUp());

const TAB_IDS = ['start', 'history', 'library', 'settings'];
const tabSwipe = createSwipeSelector({
  barSelector: '.tabbar',
  indicatorSelector: '.tab-indicator',
  handleSelector: '.tab-btn',
  ids: TAB_IDS,
  getActive: () => state.tab,
  setActive: (id) => { state.tab = id; },
  onChange: render,
});

const historySwipe = createSwipeSelector({
  barSelector: '#history-segmented',
  indicatorSelector: '#history-segmented .segmented-thumb',
  handleSelector: 'button',
  ids: ['log', 'progress'],
  getActive: () => state.historySubTab,
  setActive: (id) => { state.historySubTab = id; },
  onChange: render,
});

const librarySwipe = createSwipeSelector({
  barSelector: '#library-segmented',
  indicatorSelector: '#library-segmented .segmented-thumb',
  handleSelector: 'button',
  ids: ['exercises', 'routines'],
  getActive: () => state.librarySubTab,
  setActive: (id) => { state.librarySubTab = id; },
  onChange: render,
});

sheetRoot.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="close-sheet"]')) dismissSheet();
});

window.addEventListener('beforeunload', () => stopTicking());

applyAccent();
setSoundEnabled(Store.getSettings().sound);
calibrateSafeArea();
window.addEventListener('resize', calibrateSafeArea);
window.addEventListener('orientationchange', () => setTimeout(calibrateSafeArea, 150));
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
