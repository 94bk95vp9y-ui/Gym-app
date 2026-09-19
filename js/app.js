import { Store, MUSCLE_GROUPS, ACCENT_COLORS, uid } from './storage.js';
import { Icon } from './icons.js';
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

function getOverloadSuggestion(exercise, excludeWorkoutId) {
  if (!exercise) return null;
  const sessions = Store.getWorkouts()
    .filter((w) => w.finishedAt && w.id !== excludeWorkoutId)
    .map((w) => w.entries.find((e) => e.exerciseId === exercise.id))
    .filter((e) => e && e.sets.some((s) => s.done))
    .slice(0, 2);
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
function defaultSets(exercise, excludeWorkoutId) {
  const last = Store.lastEntryForExercise(exercise.id, excludeWorkoutId);
  const best = last ? bestSet(last.sets) : null;
  const overload = Store.getSettings().progressiveOverload ? getOverloadSuggestion(exercise, excludeWorkoutId) : null;
  const weight = overload ? overload.to : (best ? best.weight : 0);
  return [0, 1].map(() => ({
    weight,
    reps: best ? best.reps : 0,
    done: false,
    suggested: !!best,
  }));
}

// Weicher iOS-artiger Crossfade für bewusste Navigation (Tap auf Tab/Segment).
// Bei Drag-Gesten wird bewusst NICHT transitioniert – da folgt die Ansicht 1:1 dem Finger.
function go(fn) {
  if (document.startViewTransition) {
    document.startViewTransition(fn);
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

function closeSheet() {
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

function openSheet(title, bodyHtml, { footer = '', onMount } = {}) {
  sheetRoot.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h2>${title}</h2>
        <button class="icon-btn" data-action="close-sheet" aria-label="Schließen">${Icon.close}</button>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
      ${footer ? `<div class="sheet-footer">${footer}</div>` : ''}
    </div>`;
  sheetRoot.classList.add('open');
  if (onMount) onMount(sheetRoot);
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

function render() {
  stopTicking();
  const key = `${state.tab}:${state.workoutOpen}:${state.historySubTab}:${state.librarySubTab}`;
  const prevView = qs('.view');
  const scrollTop = key === lastRenderKey && prevView ? prevView.scrollTop : 0;
  lastRenderKey = key;

  if (state.workoutOpen && Store.getActive()) {
    root.innerHTML = renderWorkout();
    workoutEntering = false;
    bindWorkoutEvents();
    const newView = qs('.view');
    if (newView) newView.scrollTop = scrollTop;
    startTicking(() => {
      const el = qs('#workout-timer');
      const active = Store.getActive();
      if (el && active) el.textContent = elapsedLabel(active.startedAt);
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
    <nav class="tabbar">
      ${tabButton('start', Icon.home, 'Start')}
      ${tabButton('history', Icon.history, 'Verlauf')}
      ${tabButton('library', Icon.library, 'Bibliothek')}
      ${tabButton('settings', Icon.settings, 'Einstellungen')}
      <span class="tab-indicator" aria-hidden="true"></span>
    </nav>`;
  const newView = qs('.view');
  if (newView) newView.scrollTop = scrollTop;

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
    <section>
      <div class="section-title">Plan starten</div>
      <div class="card list">${routineCards}</div>
    </section>
    <section>
      <button class="btn btn-secondary full" data-action="start-blank" ${active ? 'disabled' : ''}>${Icon.plus} Leeres Training starten</button>
    </section>`;
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
      return { exerciseId: eid, exerciseName: ex ? ex.name : 'Unbekannt', sets: ex ? defaultSets(ex) : [] };
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
  const entries = w.entries.map((entry, ei) => {
    const last = Store.lastEntryForExercise(entry.exerciseId, w.id);
    const lastBest = last ? bestSet(last.sets) : null;
    const overload = overloadOn ? getOverloadSuggestion(Store.getExercise(entry.exerciseId), w.id) : null;
    const sets = entry.sets.map((s, si) => `
      <div class="set-row ${s.done ? 'done' : ''}">
        <span class="set-index">${si + 1}</span>
        <input type="number" inputmode="decimal" class="set-input ${s.suggested ? 'suggested' : ''}" placeholder="—"
          value="${s.suggested ? s.weight : (s.weight || '')}" data-field="weight" data-ei="${ei}" data-si="${si}" />
        <span class="set-x">×</span>
        <input type="number" inputmode="numeric" class="set-input small ${s.suggested ? 'suggested' : ''}" placeholder="—"
          value="${s.suggested ? s.reps : (s.reps || '')}" data-field="reps" data-ei="${ei}" data-si="${si}" />
        <button class="check-btn ${s.done ? 'on' : ''}" data-action="toggle-set" data-ei="${ei}" data-si="${si}">${Icon.check}</button>
        <button class="icon-btn small" data-action="remove-set" data-ei="${ei}" data-si="${si}">${Icon.close}</button>
      </div>`).join('');

    return `
      <section class="card exercise-block">
        <div class="exercise-block-header">
          <strong>${escapeHtml(entry.exerciseName)}</strong>
          <button class="icon-btn small danger" data-action="remove-exercise" data-ei="${ei}">${Icon.trash}</button>
        </div>
        ${last ? `<p class="muted small">Letztes Mal: ${lastBest ? `${lastBest.weight}${unit} × ${lastBest.reps}` : '—'}</p>` : ''}
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
        <button class="btn btn-secondary full" data-action="add-exercise-to-workout">${Icon.plus} Übung hinzufügen</button>
        <button class="btn btn-primary full" data-action="finish-workout">Training beenden</button>
      </main>
    </div>`;
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
    go(() => {
      state.workoutOpen = false;
      state.tab = 'history';
      state.historySubTab = 'log';
      render();
    });
    toast('Training gespeichert 💪');
  });
  qs('[data-action="add-exercise-to-workout"]').addEventListener('click', openAddExerciseToWorkoutSheet);

  qsa('[data-action="add-set"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei;
    const last = w.entries[ei].sets[w.entries[ei].sets.length - 1];
    w.entries[ei].sets.push({ weight: last ? last.weight : 0, reps: last ? last.reps : 0, done: false });
    Store.setActive(w);
    render(); // sofort – ein einzelner Satz ist zu klein/häufig für einen Seitenübergang
  }));
  qsa('[data-action="remove-set"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei, si = +btn.dataset.si;
    w.entries[ei].sets.splice(si, 1);
    Store.setActive(w);
    render();
  }));
  qsa('[data-action="toggle-set"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei, si = +btn.dataset.si;
    const set = w.entries[ei].sets[si];
    set.done = !set.done;
    // Abhaken ohne eigene Eingabe übernimmt den grauen Vorschlagswert als echten Wert.
    if (set.done) set.suggested = false;
    Store.setActive(w);
    render(); // lokaler Feder-Bounce am Haken reicht hier – kein Seitenweiter Crossfade nötig
  }));
  qsa('[data-action="remove-exercise"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei;
    if (!confirm('Übung aus diesem Training entfernen?')) return;
    w.entries.splice(ei, 1);
    Store.setActive(w);
    render();
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
      qsa(`[data-ei="${ei}"][data-si="${si}"]`).forEach((el) => el.classList.remove('suggested'));
    }
    Store.setActive(w);
  }));
}

function openAddExerciseToWorkoutSheet() {
  const w = Store.getActive();
  const usedIds = new Set(w.entries.map((e) => e.exerciseId));
  const renderList = (query) => Store.getExercises()
    .filter((ex) => ex.name.toLowerCase().includes(query.toLowerCase()))
    .map((ex) => `
      <button class="list-item selectable" data-action="pick-exercise" data-id="${ex.id}">
        <div class="list-item-main"><strong>${escapeHtml(ex.name)}</strong><span class="muted">${ex.muscleGroup}</span></div>
        ${usedIds.has(ex.id) ? `<span class="pill">bereits dabei</span>` : Icon.plus}
      </button>`).join('') || '<p class="empty">Keine Übung gefunden.</p>';

  openSheet('Übung hinzufügen', `
    <input type="text" id="ex-search" class="text-input" placeholder="Übung suchen…" autofocus />
    <div class="card list" id="ex-pick-list">${renderList('')}</div>
  `, {
    onMount: () => {
      const list = qs('#ex-pick-list');
      qs('#ex-search').addEventListener('input', (e) => { list.innerHTML = renderList(e.target.value); bindPick(); });
      bindPick();
      function bindPick() {
        qsa('[data-action="pick-exercise"]', list).forEach((btn) => btn.addEventListener('click', () => {
          const w2 = Store.getActive();
          const ex = Store.getExercise(btn.dataset.id);
          if (!ex || w2.entries.some((e) => e.exerciseId === ex.id)) { closeSheet(); return; }
          w2.entries.push({ exerciseId: ex.id, exerciseName: ex.name, sets: defaultSets(ex, w2.id) });
          Store.setActive(w2);
          closeSheet();
          render();
        }));
      }
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
  qs('[data-action="cal-prev"]')?.addEventListener('click', () => {
    state.calendarMonth -= 1;
    if (state.calendarMonth < 0) { state.calendarMonth = 11; state.calendarYear -= 1; }
    render();
  });
  qs('[data-action="cal-next"]')?.addEventListener('click', () => {
    state.calendarMonth += 1;
    if (state.calendarMonth > 11) { state.calendarMonth = 0; state.calendarYear += 1; }
    render();
  });

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
      drawLineChart(canvas, points);
    }
  }
}

function openWorkoutDetailSheet(id) {
  const w = Store.getWorkouts().find((x) => x.id === id);
  if (!w) return;
  const unit = unitLabel(Store.getSettings().unit);
  const body = w.entries.map((e) => `
    <div class="detail-exercise">
      <strong>${escapeHtml(e.exerciseName)}</strong>
      <div class="detail-sets">
        ${e.sets.filter((s) => s.done).map((s, i) => `<span class="set-chip">${i + 1}. ${s.weight}${unit} × ${s.reps}</span>`).join('') || '<span class="muted small">Keine Sätze</span>'}
      </div>
    </div>`).join('');
  openSheet(escapeHtml(w.routineName || 'Freies Training'), `
    <p class="muted">${formatDateTime(w.startedAt)} · ${formatDuration(new Date(w.finishedAt) - new Date(w.startedAt))}</p>
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

function renderExerciseList() {
  const exercises = Store.getExercises().slice().sort((a, b) => a.muscleGroup.localeCompare(b.muscleGroup) || a.name.localeCompare(b.name));
  if (!exercises.length) return '<p class="empty">Noch keine Übungen. Tippe oben rechts auf +.</p>';
  return `<div class="card list">${exercises.map((ex) => `
    <button class="list-item selectable" data-action="edit-exercise" data-id="${ex.id}">
      <div class="list-item-main"><strong>${escapeHtml(ex.name)}</strong><span class="muted">${escapeHtml(ex.muscleGroup)}</span></div>
      ${Icon.chevron}
    </button>`).join('')}</div>`;
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
  qsa('[data-action="edit-exercise"]').forEach((btn) => btn.addEventListener('click', () => openExerciseSheet(btn.dataset.id)));
  qsa('[data-action="edit-routine"]').forEach((btn) => btn.addEventListener('click', () => openRoutineSheet(btn.dataset.id)));
}

function openExerciseSheet(id) {
  const ex = id ? Store.getExercise(id) : { id: uid(), name: '', muscleGroup: MUSCLE_GROUPS[0], notes: '' };
  openSheet(id ? 'Übung bearbeiten' : 'Neue Übung', `
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
  const routine = id ? Store.getRoutine(id) : { id: uid(), name: '', exerciseIds: [] };
  const draft = { ...routine, exerciseIds: [...routine.exerciseIds] };

  const renderChosen = () => draft.exerciseIds.map((eid, i) => {
    const ex = Store.getExercise(eid);
    return `<div class="list-item reorder-item">
      <span class="drag-handle" data-drag-handle aria-hidden="true">${Icon.grip}</span>
      <div class="list-item-main"><strong>${ex ? escapeHtml(ex.name) : 'Unbekannt'}</strong></div>
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
    qs('[data-action="add-to-routine"]').addEventListener('click', () => {
      draft.name = qs('#f-rname').value;
      openExercisePicker();
    });
    qs('[data-action="save-routine"]').addEventListener('click', () => {
      const name = qs('#f-rname').value.trim();
      if (!name) { qs('#f-rname').focus(); return; }
      Store.saveRoutine({ id: draft.id, name, exerciseIds: draft.exerciseIds });
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
    const list = Store.getExercises().map((ex) => `
      <button class="list-item selectable" data-action="pick" data-id="${ex.id}">
        <div class="list-item-main"><strong>${escapeHtml(ex.name)}</strong><span class="muted">${ex.muscleGroup}</span></div>
        ${draft.exerciseIds.includes(ex.id) ? `<span class="pill">gewählt</span>` : Icon.plus}
      </button>`).join('') || '<p class="empty">Noch keine Übungen in der Bibliothek.</p>';
    openSheet('Übung wählen', `<div class="card list">${list}</div>`, {
      onMount: (el) => {
        qsa('[data-action="pick"]', el).forEach((btn) => btn.addEventListener('click', () => {
          const eid = btn.dataset.id;
          if (!draft.exerciseIds.includes(eid)) draft.exerciseIds.push(eid);
          renderEditor();
        }));
      },
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
    <p class="empty small">Alle Daten bleiben ausschließlich lokal auf diesem Gerät gespeichert.</p>`;
}

function bindSettingsEvents() {
  qsa('[data-action="set-unit"]').forEach((btn) => btn.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), unit: btn.dataset.unit });
    render();
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
  if (e.target.closest('[data-action="close-sheet"]')) closeSheet();
});

window.addEventListener('beforeunload', () => stopTicking());

applyAccent();
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
