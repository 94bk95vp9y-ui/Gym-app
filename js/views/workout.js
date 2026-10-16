// Laufendes Training: Vollbild über der App, mit Pausentimer, Rekorden,
// Vorschlagswerten und der Zusammenfassung am Ende.
import { Store, REST_OPTIONS } from '../core/store.js';
import {
  workoutFromRoutine, blankWorkout, newEntry, lastSessionFor, overloadSuggestion, refreshPrFlags,
  isEntryComplete, workoutProgress, workoutDoneSets, workoutVolume, workoutDuration, exerciseNames, entryName,
  planDiff, routineFromWorkout, exerciseHistory,
} from '../core/training.js';
import { fatigueOf, muscleGroupLookup } from '../core/fatigue.js';
import {
  formatNumber, parseNumber, formatSet, formatSetList, formatWeight, formatDuration, formatClock, formatRest,
  formatVolume, formatDate, elapsedLabel, plural, unitLabel, relativeDay,
} from '../core/format.js';
import { dayKey, dayStatus } from '../core/supplements.js';
import { Sound } from '../core/sound.js';
import { esc, qs, qsa, registerActions, registerInputs, collapseAway, popIn } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { render, setLiveBar, goTo, nav } from '../ui/router.js';
import { openSheet, actionSheet, confirmAction, promptDialog } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { enableReorder } from '../ui/reorder.js';
import { openExercisePicker } from './picker.js';

const root = document.getElementById('workout-root');
const W = { open: false, ticker: null, restShown: false };

const unit = () => unitLabel(Store.getSettings().unit);

// ---------- Starten, öffnen, schließen ----------
async function confirmReplaceActive() {
  const active = Store.getActive();
  if (!active) return true;
  const choice = await actionSheet({
    title: 'Es läuft bereits ein Training',
    message: active.routineName || 'Freies Training',
    actions: [
      { label: 'Laufendes Training öffnen' },
      { label: 'Verwerfen und neu starten', style: 'destructive' },
    ],
  });
  if (choice === 0) openWorkout();
  return choice === 1;
}

export async function startRoutine(id) {
  const routine = Store.getRoutine(id);
  if (!routine) return;
  const active = Store.getActive();
  if (active && active.routineId === id) { openWorkout(); return; }
  if (!(await confirmReplaceActive())) return;
  Store.clearActive();
  Store.setActive(workoutFromRoutine(routine));
  Sound.start();
  openWorkout();
}

export async function startBlank() {
  if (!(await confirmReplaceActive())) return;
  Store.clearActive();
  Store.setActive(blankWorkout());
  Sound.start();
  openWorkout();
  setTimeout(addExercises, 380);
}

export function openWorkout({ instant = false } = {}) {
  if (!Store.getActive()) return;
  W.open = true;
  document.documentElement.classList.add('workout-open');
  paint();
  const el = qs('.workout', root);
  if (instant) {
    el.classList.add('instant', 'open');
    requestAnimationFrame(() => el.classList.remove('instant'));
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  }
  startTicker();
  requestWakeLock();
  render();
}

export function minimizeWorkout() {
  const el = qs('.workout', root);
  W.open = false;
  document.documentElement.classList.remove('workout-open');
  releaseWakeLock();
  stopTicker();
  render();
  startLiveTicker();
  if (!el) return;
  el.classList.remove('open');
  setTimeout(() => { if (!W.open) root.innerHTML = ''; }, 450);
}

// Beim App-Start: ein laufendes Training der letzten Stunden direkt öffnen
export function restoreWorkout() {
  const active = Store.getActive();
  if (!active) return;
  const age = Date.now() - new Date(active.startedAt).getTime();
  if (age < 3 * 3600000) openWorkout({ instant: true });
  else startLiveTicker();
}

export function onVisible() {
  if (W.open) { requestWakeLock(); syncRest(); }
}

export function isWorkoutOpen() { return W.open; }

// ---------- Darstellung ----------
function prevSetText(set) {
  if (!set) return '—';
  return set.weight > 0 ? `${formatNumber(set.weight)} × ${set.reps}` : `${set.reps} Wdh`;
}

function fatigueNote(lastSession, workout, ei, groupOf) {
  if (!lastSession) return '';
  const then = fatigueOf(lastSession.workout, lastSession.entryIndex, groupOf);
  const now = fatigueOf(workout, ei, groupOf, { planned: true });
  if (then.bucket === now.bucket) return '';
  const group = ['Ganzkörper', 'Cardio', 'Sonstiges'].includes(now.group) ? 'für ähnliche Muskeln' : now.group;
  const tail = now.priorSets > then.priorSets ? 'etwas weniger als letztes Mal ist normal.' : 'du gehst frischer rein als letztes Mal.';
  return `Heute ${plural(now.priorSets, 'Satz', 'Sätze')} ${group} davor, letztes Mal ${then.priorSets} – ${tail}`;
}

function setRowHtml(set, ei, si, prev) {
  const weight = set.weight > 0 ? formatNumber(set.weight) : '';
  const reps = set.reps > 0 ? String(set.reps) : '';
  const sug = set.suggested && !set.done ? 'suggested' : '';
  return `
    <div class="set-cols set-row ${set.done ? 'done' : ''}" data-ei="${ei}" data-si="${si}">
      <button class="set-num ${set.pr ? 'pr' : ''}" data-action="w-set-menu" data-ei="${ei}" data-si="${si}" aria-label="Satz ${si + 1}">${set.pr ? 'PR' : si + 1}</button>
      <span class="set-prev">${esc(prevSetText(prev))}</span>
      <input class="set-in ${sug}" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${weight}"
        data-input="w-set" data-field="weight" data-ei="${ei}" data-si="${si}" aria-label="Gewicht Satz ${si + 1}" />
      <input class="set-in ${sug}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="0" value="${reps}"
        data-input="w-set" data-field="reps" data-ei="${ei}" data-si="${si}" aria-label="Wiederholungen Satz ${si + 1}" />
      <button class="set-check" data-action="w-toggle" data-ei="${ei}" data-si="${si}" aria-label="Satz ${si + 1} abhaken">${Icon.check}</button>
    </div>`;
}

function exerciseCardHtml(w, entry, ei, ctx) {
  const ex = Store.getExercise(entry.exerciseId);
  const last = lastSessionFor(entry.exerciseId, w.id);
  const prevSets = last ? last.entry.sets.filter((s) => s.done && s.reps > 0) : [];
  const overload = ex ? overloadSuggestion(ex, w.id) : null;
  const note = ex?.notes?.trim();
  const fatigue = fatigueNote(last, w, ei, ctx.groupOf);
  const showOverload = overload && entry.sets.some((s) => !s.done);
  return `
    <section class="ex-card ${isEntryComplete(entry) ? 'complete' : ''}" data-ei="${ei}">
      <div class="ex-head">
        <h3 class="ex-name"><span class="done-mark">${Icon.check}</span>${esc(entryName(entry, ctx.names))}</h3>
        <button class="icon-btn" data-action="w-ex-menu" data-ei="${ei}" aria-label="Optionen">${Icon.more}</button>
      </div>
      ${note ? `<button class="ex-note" data-action="w-note" data-ei="${ei}">${esc(note)}</button>` : ''}
      ${showOverload ? `<p class="ex-hint up">Mehr Gewicht: ${esc(formatWeight(overload.to, ctx.unit))} statt ${esc(formatWeight(overload.from, ctx.unit))} – zweimal ${overload.threshold}+ Wdh geschafft.</p>` : ''}
      ${fatigue ? `<p class="ex-hint">${esc(fatigue)}</p>` : ''}
      <div class="set-table">
        <div class="set-cols set-headrow"><span>Satz</span><span>Vorher</span><span>${ctx.unit}</span><span>Wdh</span><span></span></div>
        ${entry.sets.map((s, si) => setRowHtml(s, ei, si, prevSets[si])).join('')}
      </div>
      <button class="add-set" data-action="w-add-set" data-ei="${ei}">${Icon.plus} Satz</button>
    </section>`;
}

function paint() {
  const w = Store.getActive();
  if (!w) return;
  const exercises = Store.getExercises();
  const ctx = { names: exerciseNames(), groupOf: muscleGroupLookup(exercises), unit: unit() };
  const p = workoutProgress(w);
  const prev = qs('#w-content', root);
  const scroll = prev ? prev.scrollTop : 0;
  const wasOpen = qs('.workout', root)?.classList.contains('open');
  root.innerHTML = `
    <div class="workout ${wasOpen ? 'open instant' : ''}">
      <header class="w-bar">
        <div class="nav-left"><button class="nav-btn icon-only" data-action="w-minimize" aria-label="Minimieren">${Icon.chevronDown}</button></div>
        <div class="w-title"><strong>${esc(w.routineName || 'Freies Training')}</strong><span id="w-timer">${elapsedLabel(w.startedAt)}</span></div>
        <div class="nav-right"><button class="nav-btn strong" data-action="w-finish">Beenden</button></div>
        <div class="w-progress"><i id="w-progress" style="transform:scaleX(${p.ratio})"></i></div>
      </header>
      <main class="content w-content" id="w-content">
        ${w.entries.length ? w.entries.map((e, ei) => exerciseCardHtml(w, e, ei, ctx)).join('') : `
          <div class="card empty"><strong>Noch keine Übungen</strong>Füge die erste Übung hinzu, um loszulegen.</div>`}
        <div class="w-actions">
          <button class="btn btn-tinted btn-block" data-action="w-add-exercise">${Icon.plus} Übung hinzufügen</button>
          ${w.entries.length > 1 ? `<button class="btn btn-secondary btn-block" data-action="w-reorder">${Icon.reorder} Reihenfolge ändern</button>` : ''}
          <button class="btn btn-destructive btn-block" data-action="w-discard">Training verwerfen</button>
        </div>
      </main>
      <div id="rest-slot"></div>
    </div>`;
  qs('#w-content', root).scrollTop = scroll;
  if (wasOpen) requestAnimationFrame(() => qs('.workout', root)?.classList.remove('instant'));
  W.restShown = false;
  syncRest();
}

function updateProgress(w) {
  const p = workoutProgress(w);
  const bar = qs('#w-progress', root);
  if (bar) bar.style.transform = `scaleX(${p.ratio})`;
}

function updateCard(w, ei) {
  const entry = w.entries[ei];
  const card = qs(`.ex-card[data-ei="${ei}"]`, root);
  if (!card) return;
  card.classList.toggle('complete', isEntryComplete(entry));
  entry.sets.forEach((s, si) => {
    const num = qs(`.set-row[data-si="${si}"] .set-num`, card);
    if (!num) return;
    num.classList.toggle('pr', !!s.pr);
    num.textContent = s.pr ? 'PR' : String(si + 1);
  });
}

// ---------- Ticker: Uhr, Pause ----------
function startTicker() {
  stopTicker();
  W.ticker = setInterval(() => {
    const w = Store.getActive();
    if (!w) { stopTicker(); return; }
    const t = qs('#w-timer', root);
    if (t) t.textContent = elapsedLabel(w.startedAt);
    syncRest();
  }, 250);
}
function stopTicker() {
  clearInterval(W.ticker);
  W.ticker = null;
}

// Minimiert: Leiste zeigt die laufende Pause, sonst die Trainingsdauer.
function liveText(w) {
  const rest = Store.getRest();
  return rest ? `Pause ${formatClock(Math.ceil((rest.endsAt - Date.now()) / 1000))}` : elapsedLabel(w.startedAt);
}

let liveTicker = null;
function startLiveTicker() {
  clearInterval(liveTicker);
  let resting = !!Store.getRest();
  liveTicker = setInterval(() => {
    const w = Store.getActive();
    if (!w || W.open) { clearInterval(liveTicker); return; }
    const el = qs('#live-time');
    if (el) el.textContent = liveText(w);
    const now = !!Store.getRest();
    if (resting && !now && document.visibilityState === 'visible') {
      Sound.restOver();
      toast('Pause vorbei');
    }
    resting = now;
  }, 500);
}

setLiveBar(() => {
  const w = Store.getActive();
  if (!w || W.open) return '';
  if (nav.tab === 'today' && !nav.stacks.today.length) return '';
  const p = workoutProgress(w);
  return `
    <button class="live-bar" data-action="w-open">
      <span class="live-dot"></span>
      <span class="live-text"><strong>${esc(w.routineName || 'Freies Training')}</strong>
        <span><span id="live-time" class="num">${liveText(w)}</span> · ${p.done} von ${plural(p.total, 'Satz', 'Sätzen')}</span></span>
      <span class="live-go">Fortsetzen${Icon.chevronRight}</span>
    </button>`;
});

// ---------- Pause ----------
function restFor(exerciseId) {
  const ex = Store.getExercise(exerciseId);
  return ex?.restSeconds ?? Store.getSettings().restSeconds;
}

function startRest(exerciseId) {
  const seconds = restFor(exerciseId);
  if (!seconds) return;
  Store.setRest({ endsAt: Date.now() + seconds * 1000, duration: seconds });
  syncRest();
}

function syncRest() {
  const slot = qs('#rest-slot', root);
  if (!slot) return;
  const rest = Store.getRest();
  const bar = qs('.rest', slot);
  if (!rest) {
    if (bar && !bar.classList.contains('leaving')) {
      bar.classList.add('leaving');
      setTimeout(() => bar.remove(), 240);
      if (W.restShown && !bar.dataset.skipped && document.visibilityState === 'visible') {
        Sound.restOver();
        toast('Pause vorbei');
      }
    }
    W.restShown = false;
    return;
  }
  const remaining = Math.max(0, (rest.endsAt - Date.now()) / 1000);
  if (!bar) {
    slot.innerHTML = `
      <div class="rest">
        <div class="rest-label"><span>Pause</span><b class="num" id="rest-time">${formatClock(remaining)}</b></div>
        <button class="rest-btn" data-action="rest-adjust" data-delta="-15">−15</button>
        <button class="rest-btn" data-action="rest-adjust" data-delta="15">+15</button>
        <button class="rest-btn primary" data-action="rest-skip">Weiter</button>
        <span class="rest-fill" id="rest-fill"></span>
      </div>`;
    W.restShown = true;
  }
  const time = qs('#rest-time', slot);
  if (time) time.textContent = formatClock(Math.ceil(remaining));
  const fill = qs('#rest-fill', slot);
  if (fill) fill.style.width = `${Math.min(100, (remaining / rest.duration) * 100)}%`;
}

// ---------- Bildschirm anlassen ----------
let wakeLock = null;
async function requestWakeLock() {
  if (!Store.getSettings().keepAwake || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  if (wakeLock && !wakeLock.released) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (W.open) wakeLock = lock; else lock.release().catch(() => {});
  } catch { wakeLock = null; }
}
function releaseWakeLock() {
  if (wakeLock && !wakeLock.released) wakeLock.release().catch(() => {});
  wakeLock = null;
}

// ---------- Übungen hinzufügen, ersetzen, sortieren ----------
function addExercises() {
  const w = Store.getActive();
  if (!w) return;
  openExercisePicker({
    fixed: w.entries.map((e) => e.exerciseId),
    onDone: (ids) => {
      const cur = Store.getActive();
      if (!cur) return;
      const first = cur.entries.length;
      ids.forEach((id) => {
        const ex = Store.getExercise(id);
        if (ex) cur.entries.push(newEntry(ex, cur.id));
      });
      Store.setActive(cur);
      paint();
      const card = qs(`.ex-card[data-ei="${first}"]`, root);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        popIn(card);
      }
    },
  });
}

function replaceExercise(ei) {
  const w = Store.getActive();
  openExercisePicker({
    title: 'Übung ersetzen',
    fixed: w.entries.map((e) => e.exerciseId),
    onDone: (ids) => {
      const cur = Store.getActive();
      const ex = Store.getExercise(ids[0]);
      if (!cur || !ex) return;
      const count = cur.entries[ei].sets.length;
      cur.entries[ei] = newEntry(ex, cur.id, count);
      Store.setActive(cur);
      paint();
      popIn(qs(`.ex-card[data-ei="${ei}"]`, root));
      if (ids.length > 1) toast('Ersetzt – weitere Auswahl ignoriert');
    },
  });
}

function openReorder() {
  const w = Store.getActive();
  const names = exerciseNames();
  const order = w.entries.map((_, i) => i);
  const rows = () => order.map((i, pos) => {
    const e = Store.getActive().entries[i];
    const done = e.sets.filter((s) => s.done).length;
    return `
      <div class="row edit-row" data-pos="${pos}">
        <span class="drag-handle" data-drag-handle>${Icon.reorder}</span>
        <div class="row-main"><span class="row-title">${esc(entryName(e, names))}</span><span class="row-sub">${done} von ${plural(e.sets.length, 'Satz', 'Sätzen')}</span></div>
        ${isEntryComplete(e) ? '<span class="tag success">fertig</span>' : `<button class="icon-btn" data-top="${pos}" aria-label="Als Nächstes">${Icon.toTop}</button>`}
      </div>`;
  }).join('');
  const sheet = openSheet({
    title: 'Reihenfolge',
    left: { label: 'Abbrechen' },
    right: {
      label: 'Übernehmen',
      style: 'primary',
      action: (s) => {
        const cur = Store.getActive();
        cur.entries = order.map((i) => cur.entries[i]);
        Store.setActive(cur);
        s.close();
        paint();
      },
    },
    body: `<div class="list" data-list>${rows()}</div>
      <p class="section-foot">Am Griff ziehen – oder mit dem Pfeil eine Übung direkt als nächste nehmen.</p>`,
  });
  const list = qs('[data-list]', sheet.body);
  enableReorder(list, {
    row: '.edit-row',
    onReorder: (from, to) => {
      order.splice(to, 0, ...order.splice(from, 1));
      list.innerHTML = rows();
    },
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-top]');
    if (!b) return;
    const entries = Store.getActive().entries;
    const [moved] = order.splice(+b.dataset.top, 1);
    const firstOpen = order.findIndex((i) => !isEntryComplete(entries[i]));
    order.splice(firstOpen < 0 ? order.length : firstOpen, 0, moved);
    list.innerHTML = rows();
  });
}

function openNoteEditor(ei) {
  const w = Store.getActive();
  const id = w.entries[ei].exerciseId;
  const ex = Store.getExercise(id);
  if (!ex) return;
  openSheet({
    title: 'Notiz',
    left: { label: 'Abbrechen' },
    right: {
      label: 'Sichern',
      style: 'primary',
      action: (s) => {
        Store.updateExercise(id, { notes: qs('textarea', s.body).value.trim() });
        s.close();
        paint();
      },
    },
    body: `
      <p class="muted small" style="margin:0 4px 10px">${esc(ex.name)} – gilt für alle Trainings mit dieser Übung.</p>
      <textarea class="input" rows="4" placeholder="z. B. Ellbogen nah am Körper, Rücken gerade, Sitz auf Stufe 4">${esc(ex.notes || '')}</textarea>`,
    onMount: (s) => qs('textarea', s.body).focus(),
  });
}

function openExerciseHistory(ei) {
  const w = Store.getActive();
  const id = w.entries[ei].exerciseId;
  const h = exerciseHistory(id);
  const u = unit();
  openSheet({
    title: entryName(w.entries[ei]),
    body: h.sessions.length ? `
      ${h.best ? `<div class="card"><div class="stats divided" style="--cols:2">
        <div class="stat"><b class="num">${esc(formatSet(h.best.top, u))}</b><span>Bestleistung</span></div>
        <div class="stat"><b class="num">${h.sessions.length}</b><span>Einheiten</span></div>
      </div></div>` : ''}
      <div class="section"><div class="card tight">${h.sessions.slice(0, 8).map((s) => `
        <div class="history-row"><span>${esc(formatDate(s.date))}</span><span>${esc(formatSetList(s.sets, u))}</span></div>`).join('')}</div></div>`
      : '<p class="empty">Noch kein Verlauf für diese Übung.</p>',
  });
}

function chooseRest(ei) {
  const w = Store.getActive();
  const id = w.entries[ei].exerciseId;
  const ex = Store.getExercise(id);
  if (!ex) return;
  const def = Store.getSettings().restSeconds;
  const options = [{ value: null, label: `Standard (${formatRest(def)})` }, ...REST_OPTIONS.map((v) => ({ value: v, label: formatRest(v) }))];
  actionSheet({
    title: `Pause bei ${ex.name}`,
    message: `Aktuell: ${formatRest(ex.restSeconds ?? def)}`,
    actions: options.map((o) => ({ label: o.label, handler: () => { Store.updateExercise(id, { restSeconds: o.value }); toast('Pause gespeichert'); } })),
  });
}

// ---------- Beenden ----------
async function finish() {
  const w = Store.getActive();
  if (!w) return;
  const done = workoutDoneSets(w);
  const total = workoutProgress(w).total;
  if (!done) {
    const choice = await actionSheet({
      title: 'Noch kein Satz abgehakt',
      actions: [{ label: 'Training verwerfen', style: 'destructive' }],
      cancelLabel: 'Weiter trainieren',
    });
    if (choice === 0) discard(true);
    return;
  }
  const open = total - done;
  const ok = await confirmAction({
    title: 'Training beenden?',
    message: open ? `${plural(open, 'Satz ist', 'Sätze sind')} nicht abgehakt und ${open === 1 ? 'wird' : 'werden'} nicht gezählt.` : 'Alle Sätze erledigt.',
    confirmLabel: 'Beenden und speichern',
    destructive: false,
  });
  if (!ok) return;
  const cur = Store.getActive();
  cur.finishedAt = new Date().toISOString();
  cur.entries.forEach((e) => e.sets.forEach((s) => { delete s.suggested; }));
  Store.finishActiveWorkout(cur);
  Sound.finish();
  minimizeWorkout();
  setTimeout(() => openSummary(cur.id), 260);
}

async function discard(skipConfirm = false) {
  if (!skipConfirm && !(await confirmAction({ title: 'Training verwerfen?', message: 'Alle eingetragenen Sätze gehen verloren.', confirmLabel: 'Verwerfen' }))) return;
  Store.clearActive();
  minimizeWorkout();
  toast('Training verworfen');
}

function openSummary(id) {
  const w = Store.getWorkout(id);
  if (!w) return;
  const u = unit();
  const names = exerciseNames();
  const prs = w.entries.flatMap((e) => e.sets.filter((s) => s.done && s.pr).map((s) => ({ name: entryName(e, names), set: s })));
  const volume = workoutVolume(w);
  const routine = w.routineId ? Store.getRoutine(w.routineId) : null;
  const diff = routine ? planDiff(w, routine) : null;
  const previous = w.routineId
    ? Store.getWorkouts().find((x) => x.id !== w.id && x.routineId === w.routineId && x.startedAt < w.startedAt)
    : null;
  const prevVolume = previous ? workoutVolume(previous) : 0;
  const lines = [];
  if (prevVolume > 0 && volume > 0) {
    const pct = Math.round((volume / prevVolume - 1) * 100);
    lines.push(pct > 0 ? `${pct} % mehr Volumen als beim letzten Mal (${relativeDay(previous.startedAt)}).`
      : pct < 0 ? `${-pct} % weniger Volumen als beim letzten Mal (${relativeDay(previous.startedAt)}).`
        : 'Gleiches Volumen wie beim letzten Mal.');
  }
  const settings = Store.getSettings();
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = Store.getWorkouts().filter((x) => new Date(x.startedAt) >= monday).length;
  lines.push(week >= settings.weeklyGoal
    ? `Wochenziel erreicht: ${week} von ${settings.weeklyGoal} Trainings.`
    : `${week} von ${settings.weeklyGoal} Trainings diese Woche.`);
  const diffText = diff ? [
    diff.added ? `${plural(diff.added, 'Übung', 'Übungen')} hinzugefügt` : '',
    diff.removed ? `${plural(diff.removed, 'Übung', 'Übungen')} weggelassen` : '',
    diff.order ? 'Reihenfolge geändert' : '',
    diff.sets ? 'Satzzahl geändert' : '',
  ].filter(Boolean).join(' · ') : '';
  const supplementsOpen = Store.getActiveSupplements().length
    && !dayStatus(Store.getSupplements(), Store.getSupplementLog(), dayKey()).complete;

  openSheet({
    title: '',
    full: false,
    right: { label: 'Fertig', style: 'primary' },
    body: `
      <div class="finish-head">
        <div class="finish-icon pop">${Icon.check}</div>
        <h3>${prs.length ? (prs.length === 1 ? 'Neuer Rekord' : `${prs.length} neue Rekorde`) : 'Training gespeichert'}</h3>
        <p>${esc(w.routineName || 'Freies Training')} · ${formatDuration(workoutDuration(w))}</p>
      </div>
      <div class="card"><div class="stats divided">
        <div class="stat"><b class="num">${workoutDoneSets(w)}</b><span>Sätze</span></div>
        <div class="stat"><b class="num">${formatVolume(volume)}</b><span>Volumen (${u})</span></div>
        <div class="stat"><b class="num">${prs.length}</b><span>Rekorde</span></div>
      </div></div>
      <div class="card">${lines.map((l) => `<p class="note-line">${esc(l)}</p>`).join('')}</div>
      ${prs.length ? `
        <div class="section"><div class="section-head"><h2>Rekorde</h2></div>
          <div class="list">${prs.map((p) => `
            <div class="row"><div class="row-main"><span class="row-title">${esc(p.name)}</span></div><span class="row-value num">${esc(formatSet(p.set, u))}</span></div>`).join('')}
          </div></div>` : ''}
      ${diff ? `
        <div class="section"><div class="card">
          <strong style="font-size:16px">Plan anpassen?</strong>
          <p class="muted small" style="margin:4px 0 12px">${esc(diffText)}. Soll „${esc(routine.name)}“ beim nächsten Mal so aussehen wie heute?</p>
          <button class="btn btn-tinted btn-block" data-sum="update-plan">Änderungen in Plan übernehmen</button>
        </div></div>` : ''}
      ${!w.routineId && w.entries.length ? `
        <div class="section"><div class="card">
          <strong style="font-size:16px">Als Plan speichern?</strong>
          <p class="muted small" style="margin:4px 0 12px">Dieses Training mit ${plural(w.entries.length, 'Übung', 'Übungen')} als festen Plan anlegen.</p>
          <button class="btn btn-tinted btn-block" data-sum="save-plan">Als Plan speichern</button>
        </div></div>` : ''}
      ${supplementsOpen ? `
        <div class="section"><div class="list inset-icons">
          <button class="row" data-sum="supps"><span class="row-icon accent">${Icon.pill}</span>
            <div class="row-main"><span class="row-title">Supplements noch offen</span><span class="row-sub">Jetzt abhaken, solange du dran denkst</span></div>
            <span class="row-chev">${Icon.chevronRight}</span></button>
        </div></div>` : ''}`,
    onMount: (s) => {
      s.body.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-sum]');
        if (!b) return;
        if (b.dataset.sum === 'update-plan') {
          Store.saveRoutine(routineFromWorkout(w, Store.getRoutine(w.routineId)));
          b.outerHTML = '<p class="muted small">Plan aktualisiert.</p>';
          toast('Plan aktualisiert');
          render();
        } else if (b.dataset.sum === 'save-plan') {
          const name = await promptDialog({ title: 'Plan speichern', message: 'Wie soll der Plan heißen?', placeholder: 'z. B. Oberkörper', confirmLabel: 'Sichern' });
          if (!name) return;
          const routine2 = routineFromWorkout({ ...w, routineName: name });
          Store.saveRoutine(routine2);
          b.outerHTML = '<p class="muted small">Als Plan gespeichert.</p>';
          toast(`Plan „${name}“ gespeichert`);
          render();
        } else if (b.dataset.sum === 'supps') {
          s.close();
          goTo('supplements');
        }
      });
    },
  });
}

// ---------- Aktionen ----------
registerActions({
  'w-open': () => openWorkout(),
  'w-minimize': () => minimizeWorkout(),
  'w-finish': () => finish(),
  'w-discard': () => discard(),
  'w-add-exercise': () => addExercises(),
  'w-reorder': () => openReorder(),
  'w-note': (el) => openNoteEditor(+el.dataset.ei),

  'w-toggle': (el) => {
    const w = Store.getActive();
    const ei = +el.dataset.ei;
    const si = +el.dataset.si;
    const set = w?.entries[ei]?.sets[si];
    if (!set) return;
    const row = el.closest('.set-row');
    if (!set.done && !(set.reps > 0)) {
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      qs('[data-field="reps"]', row)?.focus();
      return;
    }
    set.done = !set.done;
    if (set.done) set.suggested = false;
    const prIndex = refreshPrFlags(w, ei);
    Store.setActive(w);
    row.classList.toggle('done', set.done);
    qsa('.set-in', row).forEach((i) => i.classList.remove('suggested'));
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    updateCard(w, ei);
    updateProgress(w);
    if (set.done) {
      document.activeElement?.blur?.();
      startRest(w.entries[ei].exerciseId);
      if (prIndex === si) { Sound.record(); toast('Neuer Rekord'); } else Sound.setDone();
    } else {
      Sound.setUndone();
    }
  },

  'w-add-set': (el) => {
    const w = Store.getActive();
    const ei = +el.dataset.ei;
    const sets = w.entries[ei].sets;
    const last = sets[sets.length - 1];
    sets.push({ weight: last ? last.weight : 0, reps: last ? last.reps : 0, done: false, suggested: !!last });
    Store.setActive(w);
    paint();
    popIn(qs(`.ex-card[data-ei="${ei}"] .set-row[data-si="${sets.length - 1}"]`, root));
  },

  'w-set-menu': async (el) => {
    const ei = +el.dataset.ei;
    const si = +el.dataset.si;
    const choice = await actionSheet({ title: `Satz ${si + 1}`, actions: [{ label: 'Satz löschen', style: 'destructive' }] });
    if (choice !== 0) return;
    const row = qs(`.ex-card[data-ei="${ei}"] .set-row[data-si="${si}"]`, root);
    Sound.remove();
    collapseAway(row, () => {
      const w = Store.getActive();
      const entry = w?.entries[ei];
      if (!entry) return;
      const [removed] = entry.sets.splice(si, 1);
      refreshPrFlags(w, ei);
      Store.setActive(w);
      paint();
      toast(`Satz ${si + 1} gelöscht`, {
        action: 'Rückgängig',
        onAction: () => {
          const cur = Store.getActive();
          const index = cur?.entries.findIndex((x) => x.exerciseId === entry.exerciseId) ?? -1;
          if (index < 0) return;
          cur.entries[index].sets.splice(Math.min(si, cur.entries[index].sets.length), 0, removed);
          refreshPrFlags(cur, index);
          Store.setActive(cur);
          paint();
        },
      });
    });
  },

  'w-ex-menu': async (el) => {
    const ei = +el.dataset.ei;
    const w = Store.getActive();
    const entry = w.entries[ei];
    const ex = Store.getExercise(entry.exerciseId);
    const actions = [
      { label: ex?.notes ? 'Notiz bearbeiten' : 'Notiz hinzufügen', handler: () => openNoteEditor(ei) },
      { label: `Pause: ${formatRest(restFor(entry.exerciseId))}`, handler: () => chooseRest(ei) },
      { label: 'Verlauf ansehen', handler: () => openExerciseHistory(ei) },
      { label: 'Übung ersetzen', handler: () => replaceExercise(ei) },
      {
        label: 'Übung entfernen',
        style: 'destructive',
        handler: () => {
          const card = qs(`.ex-card[data-ei="${ei}"]`, root);
          Sound.remove();
          collapseAway(card, () => {
            const cur = Store.getActive();
            const [removed] = cur.entries.splice(ei, 1);
            Store.setActive(cur);
            paint();
            toast(`${entryName(removed)} entfernt`, {
              action: 'Rückgängig',
              onAction: () => {
                const again = Store.getActive();
                if (!again) return;
                again.entries.splice(Math.min(ei, again.entries.length), 0, removed);
                Store.setActive(again);
                paint();
              },
            });
          });
        },
      },
    ];
    if (!ex) actions.splice(0, 2);
    actionSheet({ title: entryName(entry), actions });
  },

  'rest-adjust': (el) => {
    const rest = Store.getRest();
    if (!rest) return;
    const delta = +el.dataset.delta;
    const endsAt = Math.max(Date.now() + 1000, rest.endsAt + delta * 1000);
    const duration = Math.max(rest.duration + delta, Math.round((endsAt - Date.now()) / 1000));
    Store.setRest({ endsAt, duration });
    syncRest();
  },
  'rest-skip': () => {
    const bar = qs('.rest', root);
    if (bar) bar.dataset.skipped = '1';
    Store.setRest(null);
    syncRest();
  },
});

registerInputs({
  'w-set': (el) => {
    const w = Store.getActive();
    const ei = +el.dataset.ei;
    const si = +el.dataset.si;
    const set = w?.entries[ei]?.sets[si];
    if (!set) return;
    const value = parseNumber(el.value);
    set[el.dataset.field] = el.dataset.field === 'reps' ? Math.floor(value) : value;
    if (set.suggested) {
      set.suggested = false;
      qsa(`.set-row[data-ei="${ei}"][data-si="${si}"] .set-in`, root).forEach((i) => i.classList.remove('suggested'));
    }
    if (set.done) {
      refreshPrFlags(w, ei);
      updateCard(w, ei);
    }
    Store.setActive(w);
  },
});

// Tippen ins Feld markiert den Inhalt: der neue Wert ersetzt den alten.
// Verdeckt die Tastatur das Feld, rückt die Liste es in den sichtbaren Teil.
root.addEventListener('focusin', (e) => {
  const input = e.target.closest('.set-in');
  if (!input) return;
  requestAnimationFrame(() => {
    try { input.setSelectionRange(0, input.value.length); } catch { /* nicht unterstützt */ }
  });
  setTimeout(() => {
    const vv = window.visualViewport;
    const content = qs('#w-content', root);
    if (!vv || !content || document.activeElement !== input) return;
    const rect = input.getBoundingClientRect();
    const visibleBottom = vv.offsetTop + vv.height - 16;
    if (rect.bottom > visibleBottom) content.scrollBy({ top: rect.bottom - visibleBottom + 60, behavior: 'smooth' });
  }, 350);
});
