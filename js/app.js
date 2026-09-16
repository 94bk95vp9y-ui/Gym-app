import { Store, MUSCLE_GROUPS, uid } from './storage.js';
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
};

let tickInterval = null;

function qs(sel, parent = document) { return parent.querySelector(sel); }
function qsa(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }

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

function render() {
  stopTicking();
  if (state.workoutOpen && Store.getActive()) {
    root.innerHTML = renderWorkout();
    bindWorkoutEvents();
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
    </div>`).join('') : `<p class="empty">Noch keine Routinen. Leg welche in der Bibliothek an.</p>`;

  return `
    ${activeCard}
    <section>
      <div class="section-title">Routine starten</div>
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
    render();
  });
  qsa('[data-action="start-routine"]').forEach((btn) => btn.addEventListener('click', () => {
    if (Store.getActive()) return;
    const routine = Store.getRoutine(btn.dataset.id);
    if (!routine) return;
    const entries = routine.exerciseIds.map((eid) => {
      const ex = Store.getExercise(eid);
      return { exerciseId: eid, exerciseName: ex ? ex.name : 'Unbekannt', sets: [] };
    });
    Store.setActive({ id: uid(), routineId: routine.id, routineName: routine.name, startedAt: new Date().toISOString(), finishedAt: null, entries });
    state.workoutOpen = true;
    render();
  }));
  qs('[data-action="resume-workout"]')?.addEventListener('click', () => { state.workoutOpen = true; render(); });
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
  const entries = w.entries.map((entry, ei) => {
    const last = Store.lastEntryForExercise(entry.exerciseId, w.id);
    const lastBest = last ? bestSet(last.sets) : null;
    const sets = entry.sets.map((s, si) => `
      <div class="set-row ${s.done ? 'done' : ''}">
        <span class="set-index">${si + 1}</span>
        <input type="number" inputmode="decimal" class="set-input" placeholder="${lastBest ? lastBest.weight : '—'}"
          value="${s.weight || ''}" data-field="weight" data-ei="${ei}" data-si="${si}" />
        <span class="set-x">×</span>
        <input type="number" inputmode="numeric" class="set-input small" placeholder="${lastBest ? lastBest.reps : '—'}"
          value="${s.reps || ''}" data-field="reps" data-ei="${ei}" data-si="${si}" />
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
        <div class="set-header-row">
          <span class="set-index"></span><span>${unit}</span><span></span><span>Wdh</span><span></span><span></span>
        </div>
        ${sets || '<p class="empty small">Noch keine Sätze.</p>'}
        <button class="btn btn-ghost small" data-action="add-set" data-ei="${ei}">${Icon.plus} Satz</button>
      </section>`;
  }).join('');

  return `
    <div class="workout-screen">
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
    go(render);
  }));
  qsa('[data-action="remove-set"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei, si = +btn.dataset.si;
    w.entries[ei].sets.splice(si, 1);
    Store.setActive(w);
    go(render);
  }));
  qsa('[data-action="toggle-set"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei, si = +btn.dataset.si;
    w.entries[ei].sets[si].done = !w.entries[ei].sets[si].done;
    Store.setActive(w);
    render(); // lokaler Feder-Bounce am Haken reicht hier – kein Seitenweiter Crossfade nötig
  }));
  qsa('[data-action="remove-exercise"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei;
    if (!confirm('Übung aus diesem Training entfernen?')) return;
    w.entries.splice(ei, 1);
    Store.setActive(w);
    go(render);
  }));
  qsa('[data-field="weight"], [data-field="reps"]').forEach((input) => input.addEventListener('input', () => {
    const w = getActive();
    const ei = +input.dataset.ei, si = +input.dataset.si;
    const val = parseFloat(input.value.replace(',', '.')) || 0;
    w.entries[ei].sets[si][input.dataset.field] = val;
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
          w2.entries.push({ exerciseId: ex.id, exerciseName: ex.name, sets: [] });
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
    <div class="segmented">
      <button class="${sub === 'log' ? 'active' : ''}" data-action="history-sub" data-sub="log">Verlauf</button>
      <button class="${sub === 'progress' ? 'active' : ''}" data-action="history-sub" data-sub="progress">Fortschritt</button>
      <span class="segmented-thumb" aria-hidden="true"></span>
    </div>
    ${sub === 'log' ? renderHistoryLog() : renderProgress()}`;
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
    if (btn.dataset.sub === state.historySubTab) return;
    go(() => { state.historySubTab = btn.dataset.sub; render(); });
  }));
  qsa('[data-action="open-workout"]').forEach((btn) => btn.addEventListener('click', () => openWorkoutDetailSheet(btn.dataset.id)));

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
    <div class="segmented">
      <button class="${state.librarySubTab === 'exercises' ? 'active' : ''}" data-action="library-sub" data-sub="exercises">Übungen</button>
      <button class="${state.librarySubTab === 'routines' ? 'active' : ''}" data-action="library-sub" data-sub="routines">Routinen</button>
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
  if (!routines.length) return '<p class="empty">Noch keine Routinen. Tippe oben rechts auf +.</p>';
  return `<div class="card list">${routines.map((r) => `
    <button class="list-item selectable" data-action="edit-routine" data-id="${r.id}">
      <div class="list-item-main"><strong>${escapeHtml(r.name)}</strong><span class="muted">${r.exerciseIds.length} Übung(en)</span></div>
      ${Icon.chevron}
    </button>`).join('')}</div>`;
}

function bindLibraryEvents() {
  qsa('[data-action="library-sub"]').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.sub === state.librarySubTab) return;
    go(() => { state.librarySubTab = btn.dataset.sub; render(); });
  }));
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
        if (confirm('Übung wirklich löschen? Sie wird auch aus Routinen entfernt.')) {
          Store.deleteExercise(ex.id);
          closeSheet();
          render();
        }
      });
    },
  });
}

function openRoutineSheet(id) {
  const routine = id ? Store.getRoutine(id) : { id: uid(), name: '', exerciseIds: [] };
  const draft = { ...routine, exerciseIds: [...routine.exerciseIds] };

  const renderChosen = () => draft.exerciseIds.map((eid, i) => {
    const ex = Store.getExercise(eid);
    return `<div class="list-item">
      <div class="list-item-main"><strong>${ex ? escapeHtml(ex.name) : 'Unbekannt'}</strong></div>
      <div class="row">
        <button class="icon-btn small" data-action="move-up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn small" data-action="move-down" data-i="${i}" ${i === draft.exerciseIds.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="icon-btn small danger" data-action="remove-from-routine" data-i="${i}">${Icon.close}</button>
      </div>
    </div>`;
  }).join('') || '<p class="empty small">Noch keine Übungen gewählt.</p>';

  function renderEditor() {
    openSheet(id ? 'Routine bearbeiten' : 'Neue Routine', `
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
    qsa('[data-action="move-up"]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      [draft.exerciseIds[i - 1], draft.exerciseIds[i]] = [draft.exerciseIds[i], draft.exerciseIds[i - 1]];
      draft.name = qs('#f-rname').value;
      renderEditor();
    }));
    qsa('[data-action="move-down"]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      [draft.exerciseIds[i + 1], draft.exerciseIds[i]] = [draft.exerciseIds[i], draft.exerciseIds[i + 1]];
      draft.name = qs('#f-rname').value;
      renderEditor();
    }));
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
      if (confirm('Routine wirklich löschen?')) {
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
    if (btn.dataset.tab === state.tab) return;
    go(() => { state.tab = btn.dataset.tab; render(); });
  }));
  qs('.tabbar')?.addEventListener('pointerdown', onTabbarPointerDown);
  qs('[data-action="add-exercise"]')?.addEventListener('click', () => openExerciseSheet(null));
  qs('[data-action="add-routine"]')?.addEventListener('click', () => openRoutineSheet(null));
}

// ---- Tabbar-Drag: das Pill-Element wird wie ein physisches Objekt gegriffen,
// folgt 1:1 dem Finger und rastet beim Loslassen mit einer echten
// Feder-Simulation (inkl. Schwung aus der Geste) in die nächste Position ein.
const TAB_IDS = ['start', 'history', 'library', 'settings'];
let tabDrag = null; // { startX, startLeft, minLeft, maxLeft, slotWidth, lastX, lastT, velocity }
let springFrame = null;
let liveIndicatorLeft = null; // tatsächliche Ist-Position während Drag/Feder, damit ein erneutes Greifen mittendrin nahtlos anschließt

function rubberBand(overshoot, dim = 90) {
  return (overshoot * dim) / (dim + Math.abs(overshoot));
}

function clampWithRubberBand(raw, min, max) {
  if (raw < min) return min - rubberBand(min - raw);
  if (raw > max) return max + rubberBand(raw - max);
  return raw;
}

function indicatorGeometry() {
  const bar = qs('.tabbar');
  const indicator = qs('.tab-indicator');
  if (!bar || !indicator) return null;
  const barRect = bar.getBoundingClientRect();
  const indRect = indicator.getBoundingClientRect();
  const minLeft = indRect.width > 0 ? (indicator.offsetLeft) : 6;
  return {
    bar, indicator,
    slotWidth: indRect.width,
    minLeft,
    maxLeft: bar.clientWidth - minLeft - indRect.width,
    barLeft: barRect.left,
    barWidth: barRect.width,
  };
}

// Bewegt den Lichtreflex auf der Glas-Tabbar mit dem Finger mit – siehe
// .tabbar::after in styles.css. fraction: 0 (linker Rand) .. 1 (rechter Rand).
function updateSheen(fraction, velocity = 0) {
  const bar = qs('.tabbar');
  if (!bar) return;
  const x = 8 + Math.max(0, Math.min(1, fraction)) * 84; // 8%..92%, nie ganz am Rand
  const yBoost = Math.min(1, Math.abs(velocity) / 1.8) * 14;
  bar.style.setProperty('--sheen-x', `${x.toFixed(1)}%`);
  bar.style.setProperty('--sheen-y', `${(10 + yBoost).toFixed(1)}%`);
}

function onTabbarPointerDown(e) {
  if (!e.target.closest('.tab-btn')) return;
  const geo = indicatorGeometry();
  if (!geo) return;
  cancelSpring();
  const currentIdx = Math.max(0, TAB_IDS.indexOf(state.tab));
  const currentLeft = liveIndicatorLeft !== null ? liveIndicatorLeft : geo.minLeft + currentIdx * geo.slotWidth;
  tabDrag = {
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
  geo.bar.classList.add('dragging');
  updateSheen((e.clientX - geo.barLeft) / geo.barWidth);
}

function onWindowPointerMove(e) {
  if (!tabDrag) return;
  const now = performance.now();
  const dt = now - tabDrag.lastT;
  // dt-Mindestwert verhindert, dass zwei sehr dicht aufeinanderfolgende Events
  // (z.B. bei synthetischen/gebündelten Pointer-Events) die Geschwindigkeit künstlich in die Höhe treiben.
  if (dt > 4) {
    const instVel = Math.max(-2.5, Math.min(2.5, (e.clientX - tabDrag.lastX) / dt)); // px/ms, geclamped
    // Leicht geglättet, damit ein einzelner hektischer Frame den Schwung nicht verfälscht.
    tabDrag.velocity = tabDrag.velocity * 0.72 + instVel * 0.28;
    tabDrag.lastX = e.clientX;
    tabDrag.lastT = now;
  }

  const rawLeft = tabDrag.startLeft + (e.clientX - tabDrag.startX);
  const left = clampWithRubberBand(rawLeft, tabDrag.minLeft, tabDrag.maxLeft);
  tabDrag.currentLeft = left;
  liveIndicatorLeft = left;

  const indicator = qs('.tab-indicator');
  if (indicator) indicator.style.transform = `translateX(${left - tabDrag.minLeft}px)`;

  const idx = clampIdx(Math.round((left - tabDrag.minLeft) / tabDrag.slotWidth));
  const tabId = TAB_IDS[idx];
  if (tabId !== state.tab) {
    state.tab = tabId;
    render(); // Inhalt folgt sofort, ohne Überblendung – reines Direktmanipulieren.
    const freshIndicator = qs('.tab-indicator');
    if (freshIndicator) {
      freshIndicator.style.transition = 'none';
      freshIndicator.style.transform = `translateX(${left - tabDrag.minLeft}px)`;
    }
    qs('.tabbar')?.classList.add('dragging');
  }
  updateSheen((e.clientX - tabDrag.barLeft) / tabDrag.barWidth, tabDrag.velocity);
}

function clampIdx(i) { return Math.max(0, Math.min(TAB_IDS.length - 1, i)); }

function onWindowPointerUp() {
  if (!tabDrag) return;
  const { currentLeft, startLeft, minLeft, slotWidth, velocity } = tabDrag;
  tabDrag = null;

  // Schwung der Geste einbeziehen: nur ein wirklich schneller Flick (oberhalb
  // einer Totzone) darf das nächste Tab "mitnehmen", wenn die Loslass-Position
  // es knapp verfehlt. Eine langsame, kontrollierte Bewegung entscheidet rein
  // über ihre Endposition – sonst würde jede ruhige Bewegung überreagieren.
  const velPxPerSec = velocity * 1000;
  const deadZone = 320; // px/s – darunter zählt als "kein Schwung"
  const fullBiasAt = 1100; // px/s – ab hier zieht der Schwung ein volles Tab mit
  const excess = Math.max(0, Math.abs(velPxPerSec) - deadZone);
  const velocityBiasSlots = Math.sign(velPxPerSec) * Math.min(1, excess / (fullBiasAt - deadZone));
  let idx = clampIdx(Math.round((currentLeft - minLeft) / slotWidth + velocityBiasSlots));
  const targetTab = TAB_IDS[idx];
  const targetLeft = minLeft + idx * slotWidth;

  if (targetTab !== state.tab) {
    state.tab = targetTab;
    render();
  }
  const indicator = qs('.tab-indicator');
  if (indicator) {
    indicator.style.transition = 'none';
    indicator.style.transform = `translateX(${currentLeft - minLeft}px)`;
    springTo(indicator, currentLeft - minLeft, targetLeft - minLeft, velocity * 1000, minLeft);
  }
  const bar = qs('.tabbar');
  if (bar) {
    bar.classList.remove('dragging');
    bar.style.removeProperty('--sheen-x');
    bar.style.removeProperty('--sheen-y');
  }
}

function cancelSpring() {
  if (springFrame) { cancelAnimationFrame(springFrame); springFrame = null; }
}

// Gedämpfte Federsimulation (Masse-Feder-Dämpfer), damit das Element nach dem
// Loslassen weich – mit dem Schwung der Geste – in die Zielposition eingleitet
// statt abrupt zu stoppen, ähnlich UIKit-Spring-Animationen.
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
      liveIndicatorLeft = null;
      return;
    }
    el.style.transform = `translateX(${pos}px)`;
    liveIndicatorLeft = baseLeft + pos;
    springFrame = requestAnimationFrame(frame);
  }
  springFrame = requestAnimationFrame(frame);
}

window.addEventListener('pointermove', onWindowPointerMove);
window.addEventListener('pointerup', onWindowPointerUp);
window.addEventListener('pointercancel', onWindowPointerUp);

sheetRoot.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="close-sheet"]')) closeSheet();
});

window.addEventListener('beforeunload', () => stopTicking());

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
