// Laufendes Training: Vollbild über der App, mit Pausentimer, Rekorden,
// Vorschlagswerten und der Zusammenfassung am Ende.
import { Store, REST_OPTIONS } from '../core/store.js';
import {
  workoutFromRoutine, blankWorkout, newEntry, lastSessionFor, overloadSuggestion, refreshPrFlags,
  isEntryComplete, workoutProgress, workoutDoneSets, workoutVolume, workoutDuration, exerciseNames, entryName,
  planDiff, routineFromWorkout, exerciseHistory, compareToPrevious,
} from '../core/training.js';
import { fatigueOf, muscleGroupLookup } from '../core/fatigue.js';
import {
  formatNumber, parseNumber, formatSet, formatSetList, formatWeight, formatClock, formatRest,
  formatVolume, formatDate, elapsedLabel, plural, unitLabel, relativeDay, bestSet,
} from '../core/format.js';
import { dayKey, dayStatus } from '../core/supplements.js';
import { Sound } from '../core/sound.js';
import {
  esc, qs, qsa, registerActions, registerInputs, collapseAway, popIn, countUp, prefersReducedMotion, rollText,
} from '../ui/dom.js';
import { EASE } from '../ui/motion.js';
import { Icon } from '../ui/icons.js';
import { render, setLiveBar, goTo, nav } from '../ui/router.js';
import { openSheet, actionSheet, confirmAction, promptDialog, openMenu } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { enableReorder } from '../ui/reorder.js';
import { openKeypad, closeKeypad, isKeypadOpen, setKeypadPrimary, keypadHeight } from '../ui/keypad.js';
import { haptic, HAP } from '../ui/haptics.js';
import { enableSwipeDelete } from '../ui/swipe.js';
import {
  emptyState, iconTile, chev, deltaPill, TINT,
} from '../ui/components.js';
import { openExercisePicker } from './picker.js';

const root = document.getElementById('workout-root');
// expanded: fertige Übungen, die der Nutzer wieder aufgeklappt hat
// field: Feld, das gerade über das Zahlenfeld bearbeitet wird ({ ei, si, field })
const W = { open: false, ticker: null, restShown: false, expanded: new Set(), field: null };

// Eigenes Zahlenfeld statt iPhone-Tastatur (abschaltbar in den Einstellungen)
const useKeypad = () => Store.getSettings().appKeypad !== false;
const WEIGHT_STEP = { kg: 2.5, lb: 5 };

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

// from: Element, aus dem das Training herauswächst (Karte, Live-Leiste)
export async function startRoutine(id, { from = null } = {}) {
  const routine = Store.getRoutine(id);
  if (!routine) return;
  const active = Store.getActive();
  if (active && active.routineId === id) { openWorkout({ from }); return; }
  if (active && !(await confirmReplaceActive())) return;
  Store.clearActive();
  W.expanded.clear();
  Store.setActive(workoutFromRoutine(routine));
  Sound.start();
  openWorkout({ from: active ? null : from });
}

export async function startBlank() {
  if (!(await confirmReplaceActive())) return;
  Store.clearActive();
  W.expanded.clear();
  Store.setActive(blankWorkout());
  Sound.start();
  openWorkout();
  setTimeout(addExercises, 380);
}

// Das Training wächst aus der angetippten Karte bzw. der Live-Leiste heraus
// und schrumpft beim Minimieren wieder hinein – nur über transform und
// opacity, damit es auch auf dem iPhone flüssig bleibt.
const ZOOM_MS = 520;

function zoomFrames(rect, radius) {
  const vw = window.innerWidth;
  const s = Math.max(0.2, rect.width / vw);
  const tx = rect.left + rect.width / 2 - vw / 2;
  return {
    small: { transform: `translate(${tx}px, ${rect.top}px) scale(${s})`, borderRadius: `${radius / s}px`, opacity: 0 },
    big: { transform: 'translate(0, 0) scale(1)', borderRadius: '0px', opacity: 1 },
  };
}

function zoomSource(el) {
  if (!el || !el.isConnected) return null;
  const card = el.closest('.hero, .plan-card, .live-bar') || el;
  const r = card.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > window.innerHeight) return null;
  const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 24;
  return { rect: r, radius };
}

export function openWorkout({ instant = false, from = null } = {}) {
  if (!Store.getActive()) return;
  const src = !instant && !prefersReducedMotion() ? zoomSource(from) : null;
  W.open = true;
  document.documentElement.classList.add('workout-open');
  paint();
  const el = qs('.workout', root);
  if (instant || src) {
    el.classList.add('instant', 'open');
    requestAnimationFrame(() => el.classList.remove('instant'));
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  }
  if (src) {
    const { small, big } = zoomFrames(src.rect, src.radius);
    el.style.transformOrigin = 'top center';
    el.style.overflow = 'hidden';
    const anim = el.animate([small, { opacity: 1, offset: 0.3 }, big], { duration: ZOOM_MS, easing: EASE.nav });
    anim.finished.catch(() => {}).then(() => { el.style.overflow = ''; });
  }
  startTicker();
  requestWakeLock();
  render();
}

export function minimizeWorkout() {
  closeKeypad();
  const el = qs('.workout', root);
  W.open = false;
  document.documentElement.classList.remove('workout-open');
  releaseWakeLock();
  stopTicker();
  render();
  startLiveTicker();
  if (!el) return;
  // Ziel: die Live-Leiste bzw. die Karte auf „Heute“
  const target = prefersReducedMotion() ? null : zoomSource(document.querySelector('#live-slot .live-bar') || document.querySelector('#content .hero'));
  if (target) {
    const { small, big } = zoomFrames(target.rect, target.radius);
    el.style.transformOrigin = 'top center';
    el.style.overflow = 'hidden';
    el.classList.add('instant');
    const anim = el.animate([big, { opacity: 1, offset: 0.7 }, small], { duration: ZOOM_MS - 60, easing: EASE.nav, fill: 'forwards' });
    anim.finished.catch(() => {}).then(() => { if (!W.open) root.innerHTML = ''; });
    return;
  }
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

function fieldHtml(set, ei, si, field) {
  const value = field === 'weight' ? (set.weight > 0 ? formatNumber(set.weight) : '') : (set.reps > 0 ? String(set.reps) : '');
  const sug = set.suggested && !set.done ? 'suggested' : '';
  const label = `${field === 'weight' ? 'Gewicht' : 'Wiederholungen'} Satz ${si + 1}`;
  if (useKeypad()) {
    return `<button class="set-field ${sug}" data-action="w-field" data-field="${field}" data-ei="${ei}" data-si="${si}" aria-label="${label}"><span class="sf-val">${value || '<span class="sf-ph">0</span>'}</span></button>`;
  }
  return `<input class="set-in ${sug}" type="text" inputmode="${field === 'weight' ? 'decimal' : 'numeric'}" ${field === 'reps' ? 'pattern="[0-9]*"' : ''} autocomplete="off" placeholder="0" value="${value}"
    data-input="w-set" data-field="${field}" data-ei="${ei}" data-si="${si}" aria-label="${label}" />`;
}

function setRowHtml(set, ei, si, prev) {
  return `
    <div class="swipe-row" data-ei="${ei}" data-si="${si}">
    <button class="swipe-del" tabindex="-1" aria-label="Satz ${si + 1} löschen">${HAP}${Icon.trash}<span>Löschen</span></button>
    <div class="swipe-body set-cols set-row ${set.done ? 'done' : ''}" data-ei="${ei}" data-si="${si}">
      <button class="set-num ${set.pr ? 'pr' : ''}" data-action="w-set-menu" data-ei="${ei}" data-si="${si}" aria-label="Satz ${si + 1}">${set.pr ? 'PR' : si + 1}</button>
      ${prev ? `<button class="set-prev" data-action="w-prev" data-ei="${ei}" data-si="${si}" aria-label="Werte vom letzten Mal übernehmen">${HAP}${esc(prevSetText(prev))}</button>` : '<span class="set-prev">—</span>'}
      ${fieldHtml(set, ei, si, 'weight')}
      ${fieldHtml(set, ei, si, 'reps')}
      <button class="set-check" data-action="w-toggle" data-ei="${ei}" data-si="${si}" aria-label="Satz ${si + 1} abhaken">${HAP}${Icon.check}</button>
    </div>
    </div>`;
}

// Kurzfassung einer fertigen Übung: „3 Sätze · 100 kg × 8“
function summaryText(entry, u) {
  const done = entry.sets.filter((s) => s.done);
  const top = bestSet(done);
  return `${plural(done.length, 'Satz', 'Sätze')}${top ? ` · ${formatSet(top, u)}` : ''}`;
}

// Die erste Übung mit offenen Sätzen ist „dran“
function currentIndex(w) {
  return w.entries.findIndex((e) => !isEntryComplete(e));
}

function exerciseCardHtml(w, entry, ei, ctx) {
  const ex = Store.getExercise(entry.exerciseId);
  const last = lastSessionFor(entry.exerciseId, w.id);
  const prevSets = last ? last.entry.sets.filter((s) => s.done && s.reps > 0) : [];
  const overload = ex ? overloadSuggestion(ex, w.id) : null;
  const note = ex?.notes?.trim();
  const fatigue = fatigueNote(last, w, ei, ctx.groupOf);
  const showOverload = overload && entry.sets.some((s) => !s.done);
  const complete = isEntryComplete(entry);
  const collapsed = complete && !W.expanded.has(entry.exerciseId);
  const cls = [complete ? 'complete' : '', collapsed ? 'collapsed' : '', ei === ctx.current ? 'current' : ''].join(' ');
  return `
    <section class="ex-card ${cls}" data-ei="${ei}">
      <div class="ex-head">
        <button class="ex-head-main" data-action="w-ex-toggle" data-ei="${ei}" aria-expanded="${!collapsed}">
          <span class="ex-state">${complete ? Icon.check : ei + 1}</span>
          <span class="ex-titles">
            <h3 class="ex-name">${esc(entryName(entry, ctx.names))}</h3>
            <span class="ex-group">${esc([ex?.muscleGroup, plural(entry.sets.length, 'Satz', 'Sätze')].filter(Boolean).join(' · '))}</span>
            <span class="ex-summary">${esc(summaryText(entry, ctx.unit))}</span>
          </span>
        </button>
        <button class="icon-btn" data-action="w-ex-menu" data-ei="${ei}" aria-label="Optionen">${Icon.more}</button>
      </div>
      <div class="ex-body"><div class="ex-body-in">
        ${note ? `<button class="ex-note" data-action="w-note" data-ei="${ei}">${esc(note)}</button>` : ''}
        ${showOverload ? `<p class="ex-hint up">Mehr Gewicht: ${esc(formatWeight(overload.to, ctx.unit))} statt ${esc(formatWeight(overload.from, ctx.unit))} – zweimal ${overload.threshold}+ Wdh geschafft.</p>` : ''}
        ${fatigue ? `<p class="ex-hint">${esc(fatigue)}</p>` : ''}
        <div class="set-table">
          <div class="set-cols set-headrow"><span>Satz</span><span>Vorher</span><span>${ctx.unit}</span><span>Wdh</span><span></span></div>
          ${entry.sets.map((s, si) => setRowHtml(s, ei, si, prevSets[si])).join('')}
        </div>
        <button class="add-set" data-action="w-add-set" data-ei="${ei}">${Icon.plus} Satz</button>
      </div></div>
    </section>`;
}

function paint() {
  const w = Store.getActive();
  if (!w) return;
  const exercises = Store.getExercises();
  const ctx = { names: exerciseNames(), groupOf: muscleGroupLookup(exercises), unit: unit(), current: currentIndex(w) };
  const p = workoutProgress(w);
  const prev = qs('#w-content', root);
  const scroll = prev ? prev.scrollTop : 0;
  const wasOpen = qs('.workout', root)?.classList.contains('open');
  root.innerHTML = `
    <div class="workout ${wasOpen ? 'open instant' : ''}">
      <header class="w-bar">
        <div class="nav-left"><button class="w-min" data-action="w-minimize" aria-label="Minimieren">${Icon.chevronDown}</button></div>
        <div class="w-title"><strong>${esc(w.routineName || 'Freies Training')}</strong><span><span id="w-timer">${elapsedLabel(w.startedAt)}</span> · <span id="w-count">${p.done}/${p.total}</span> Sätze</span></div>
        <div class="nav-right"><button class="w-finish" data-action="w-finish">Beenden</button></div>
        <div class="w-progress"><i id="w-progress" style="transform:scaleX(${p.ratio})"></i></div>
      </header>
      <main class="content w-content" id="w-content">
        ${w.entries.length ? w.entries.map((e, ei) => exerciseCardHtml(w, e, ei, ctx)).join('') : emptyState({
    icon: Icon.dumbbell,
    title: 'Noch keine Übungen',
    text: 'Füge die erste Übung hinzu, um loszulegen.',
  })}
        <div class="w-actions">
          <div class="btn-row">
            <button class="btn btn-tinted" data-action="w-add-exercise">${Icon.plus} Übung</button>
            ${w.entries.length > 1 ? `<button class="btn btn-secondary" data-action="w-reorder">${Icon.reorder} Reihenfolge</button>` : ''}
          </div>
          <button class="btn btn-destructive btn-block" data-action="w-discard">Training verwerfen</button>
        </div>
      </main>
      <div id="rest-slot"></div>
    </div>`;
  qs('#w-content', root).scrollTop = scroll;
  if (wasOpen) requestAnimationFrame(() => qs('.workout', root)?.classList.remove('instant'));
  W.restShown = false;
  syncRest();
  // Neu gezeichnet wird nach Löschen, Rückgängig, Hinzufügen – danach kann
  // an derselben Stelle ein anderer Satz stehen. Zahlenfeld lieber schließen.
  if (W.field) closeKeypad();
}

function updateProgress(w) {
  const p = workoutProgress(w);
  const bar = qs('#w-progress', root);
  if (bar) bar.style.transform = `scaleX(${p.ratio})`;
  const count = qs('#w-count', root);
  if (count) count.textContent = `${p.done}/${p.total}`;
}

// Zustand einer Karte nachziehen, ohne neu zu zeichnen (sonst liefe die
// Animation am Haken nicht).
function updateCard(w, ei) {
  const entry = w.entries[ei];
  const card = qs(`.ex-card[data-ei="${ei}"]`, root);
  if (!card) return;
  const complete = isEntryComplete(entry);
  card.classList.toggle('complete', complete);
  qs('.ex-state', card).innerHTML = complete ? Icon.check : String(ei + 1);
  qs('.ex-summary', card).textContent = summaryText(entry, unit());
  if (!complete) card.classList.remove('collapsed');
  entry.sets.forEach((s, si) => {
    const num = qs(`.set-row[data-si="${si}"] .set-num`, card);
    if (!num) return;
    num.classList.toggle('pr', !!s.pr);
    num.textContent = s.pr ? 'PR' : String(si + 1);
  });
}

// Fertige Übung zuklappen und die nächste offene ins Bild holen
function advanceFocus(w, finishedIndex) {
  const next = currentIndex(w);
  qsa('.ex-card', root).forEach((c) => c.classList.toggle('current', +c.dataset.ei === next));
  if (finishedIndex === undefined) return;
  const done = qs(`.ex-card[data-ei="${finishedIndex}"]`, root);
  setTimeout(() => {
    const cur = Store.getActive();
    if (!done || !cur || !isEntryComplete(cur.entries[finishedIndex])) return;
    W.expanded.delete(cur.entries[finishedIndex].exerciseId);
    done.classList.add('collapsed');
    qs('.ex-head-main', done)?.setAttribute('aria-expanded', 'false');
    const target = next >= 0 ? qs(`.ex-card[data-ei="${next}"]`, root) : null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 650);
}

// Der nächste offene Satz – für die Pausenleiste
function nextSetInfo(w) {
  for (const entry of w.entries) {
    const si = entry.sets.findIndex((s) => !s.done);
    if (si >= 0) return { name: entryName(entry), si, set: entry.sets[si] };
  }
  return null;
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
    if (el) {
      if (el.classList.contains('hero-time')) rollText(el, liveText(w));
      else el.textContent = liveText(w);
    }
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
    <button class="live-bar glass" data-action="w-open">
      <span class="live-dot"></span>
      <span class="live-text"><strong>${esc(w.routineName || 'Freies Training')}</strong>
        <span><span id="live-time" class="num">${liveText(w)}</span> · ${p.done} von ${plural(p.total, 'Satz', 'Sätzen')}</span></span>
      <span class="live-go">Fortsetzen</span>
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
    const w = Store.getActive();
    const next = w ? nextSetInfo(w) : null;
    const nextText = next ? `${esc(next.name)} · Satz ${next.si + 1}${next.set.reps > 0 ? ` · ${esc(formatSet(next.set, unit()))}` : ''}` : '';
    slot.innerHTML = `
      <div class="rest glass">
        <div class="rest-main">
          <div class="rest-label"><span>Pause</span><b class="num" id="rest-time">${formatClock(remaining)}</b></div>
          <button class="rest-btn" data-action="rest-adjust" data-delta="-15" aria-label="15 Sekunden weniger">${HAP}−15</button>
          <button class="rest-btn" data-action="rest-adjust" data-delta="15" aria-label="15 Sekunden mehr">${HAP}+15</button>
          <button class="rest-btn primary" data-action="rest-skip">${HAP}Weiter</button>
        </div>
        ${nextText ? `<div class="rest-next">Als Nächstes: <strong>${nextText}</strong></div>` : ''}
        <span class="rest-fill" id="rest-fill"></span>
      </div>`;
    W.restShown = true;
  }
  rollText(qs('#rest-time', slot), formatClock(Math.ceil(remaining)));
  qs('.rest', slot)?.classList.toggle('ending', remaining <= 5);
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
      label: 'Fertig',
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
      <div class="section"><div class="list">${h.sessions.slice(0, 8).map((s) => `
        <div class="history-row"><span>${esc(formatDate(s.date))}</span><span>${esc(formatSetList(s.sets, u))}</span></div>`).join('')}</div></div>`
      : '<p class="empty">Noch kein Verlauf für diese Übung.</p>',
  });
}

function chooseRest(ei, anchor) {
  const w = Store.getActive();
  const id = w.entries[ei].exerciseId;
  const ex = Store.getExercise(id);
  if (!ex) return;
  const def = Store.getSettings().restSeconds;
  const current = ex.restSeconds ?? null;
  const options = [{ value: null, label: 'Standard', sub: formatRest(def) }, ...REST_OPTIONS.map((v) => ({ value: v, label: formatRest(v) }))];
  openMenu(anchor || qs(`.ex-card[data-ei="${ei}"] [data-action="w-ex-menu"]`, root), options.map((o) => ({
    label: o.label,
    sub: o.sub,
    checked: o.value === current,
    handler: () => { Store.updateExercise(id, { restSeconds: o.value }); toast('Pause gespeichert'); },
  })), { title: `Pause bei ${ex.name}` });
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
  const settings = Store.getSettings();
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = Store.getWorkouts().filter((x) => new Date(x.startedAt) >= monday).length;
  const minutes = Math.max(1, Math.round(workoutDuration(w) / 60000));
  const done = w.entries.filter((e) => e.sets.some((s) => s.done && s.reps > 0));

  const facts = [];
  if (prevVolume > 0 && volume > 0) {
    const pct = Math.round((volume / prevVolume - 1) * 100);
    facts.push({
      icon: Icon.trendUp,
      text: pct > 0 ? `${pct} % mehr Volumen als beim letzten Mal`
        : pct < 0 ? `${-pct} % weniger Volumen als beim letzten Mal` : 'Gleiches Volumen wie beim letzten Mal',
      sub: relativeDay(previous.startedAt),
    });
  }
  facts.push({
    icon: Icon.target,
    text: week >= settings.weeklyGoal ? 'Wochenziel erreicht' : `${week} von ${settings.weeklyGoal} Trainings diese Woche`,
    sub: week >= settings.weeklyGoal ? `${week} von ${settings.weeklyGoal} Trainings` : `noch ${settings.weeklyGoal - week}`,
  });
  const diffText = diff ? [
    diff.added ? `${plural(diff.added, 'Übung', 'Übungen')} hinzugefügt` : '',
    diff.removed ? `${plural(diff.removed, 'Übung', 'Übungen')} weggelassen` : '',
    diff.order ? 'Reihenfolge geändert' : '',
    diff.sets ? 'Satzzahl geändert' : '',
  ].filter(Boolean).join(' · ') : '';
  const supplementsOpen = Store.getActiveSupplements().length
    && !dayStatus(Store.getSupplements(), Store.getSupplementLog(), dayKey()).complete;

  const exerciseRows = done.map((e) => {
    const hasPr = e.sets.some((s) => s.done && s.pr);
    return `
      <div class="sum-ex">
        <div class="row-main">
          <span class="row-title">${esc(entryName(e, names))}${hasPr ? `<span class="pr-mark">${Icon.medal}PR</span>` : ''}</span>
          <span class="row-sub num">${esc(formatSetList(e.sets, u))}</span>
        </div>
        ${deltaPill(compareToPrevious(e, w), u)}
      </div>`;
  }).join('');

  openSheet({
    title: '',
    full: true,
    className: 'summary-sheet',
    left: null,
    right: { label: 'Fertig', style: 'primary' },
    body: `
      <div class="finish-head">
        <div class="finish-badge ${prs.length ? 'gold' : ''}">${prs.length ? Icon.trophy : Icon.check}</div>
        <h3>${prs.length ? (prs.length === 1 ? 'Neuer Rekord' : `${prs.length} neue Rekorde`) : 'Training gespeichert'}</h3>
        <p>${esc(w.routineName || 'Freies Training')} · ${esc(new Date(w.startedAt).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
      </div>
      <div class="sum-stats">
        <div><b class="num" data-count="${minutes}">${minutes}</b><span>Minuten</span></div>
        <div><b class="num" data-count="${workoutDoneSets(w)}">${workoutDoneSets(w)}</b><span>Sätze</span></div>
        <div><b class="num">${volume >= 1000 && u === 'kg' ? `${formatNumber(Math.round(volume / 100) / 10)}<small>t</small>` : `${formatVolume(volume)}<small>${u}</small>`}</b><span>Volumen</span></div>
      </div>
      ${prs.length ? `
        <div class="section"><div class="section-head"><h2>Rekorde</h2></div>
          <div class="list pr-list">${prs.map((p) => `
            <div class="row">${Icon.medal}<div class="row-main"><span class="row-title">${esc(p.name)}</span></div><span class="row-value num">${esc(formatSet(p.set, u))}</span></div>`).join('')}
          </div></div>` : ''}
      ${exerciseRows ? `
        <div class="section"><div class="section-head"><h2>Übungen</h2><span class="meta">im Vergleich zum letzten Mal</span></div>
          <div class="list">${exerciseRows}</div></div>` : ''}
      <div class="section"><div class="list icons">${facts.map((f) => `
        <div class="row">${iconTile(f.icon, f.icon === Icon.target ? TINT.red : TINT.green, 'soft')}
          <div class="row-main"><span class="row-title">${esc(f.text)}</span>${f.sub ? `<span class="row-sub">${esc(f.sub)}</span>` : ''}</div></div>`).join('')}
      </div></div>
      ${diff ? `
        <div class="section"><div class="card">
          <div class="card-title">Plan anpassen?</div>
          <p class="card-text">${esc(diffText)}. Soll „${esc(routine.name)}“ beim nächsten Mal so aussehen wie heute?</p>
          <button class="btn btn-tinted btn-block" data-sum="update-plan" style="margin-top:14px">Änderungen übernehmen</button>
        </div></div>` : ''}
      ${!w.routineId && w.entries.length ? `
        <div class="section"><div class="card">
          <div class="card-title">Als Plan speichern?</div>
          <p class="card-text">Dieses Training mit ${plural(w.entries.length, 'Übung', 'Übungen')} als festen Plan anlegen.</p>
          <button class="btn btn-tinted btn-block" data-sum="save-plan" style="margin-top:14px">Als Plan speichern</button>
        </div></div>` : ''}
      ${supplementsOpen ? `
        <div class="section"><div class="list icons">
          <button class="row" data-sum="supps">${iconTile(Icon.pill, TINT.pink)}
            <div class="row-main"><span class="row-title">Supplements noch offen</span><span class="row-sub">Jetzt abhaken, solange du dran denkst</span></div>
            ${chev}</button>
        </div></div>` : ''}`,
    onMount: (s) => {
      countUp(s.body);
      s.body.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-sum]');
        if (!b) return;
        if (b.dataset.sum === 'update-plan') {
          Store.saveRoutine(routineFromWorkout(w, Store.getRoutine(w.routineId)));
          b.outerHTML = '<p class="card-text done-text">Plan aktualisiert.</p>';
          haptic();
          render();
        } else if (b.dataset.sum === 'save-plan') {
          const name = await promptDialog({ title: 'Plan speichern', message: 'Wie soll der Plan heißen?', placeholder: 'z. B. Oberkörper', confirmLabel: 'Sichern' });
          if (!name) return;
          Store.saveRoutine(routineFromWorkout({ ...w, routineName: name }));
          b.outerHTML = '<p class="card-text done-text">Als Plan gespeichert.</p>';
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

// ---------- Satz abhaken ----------
function rowEl(ei, si) {
  return qs(`.ex-card[data-ei="${ei}"] .set-row[data-si="${si}"]`, root);
}

// Gibt false zurück, wenn der Satz nicht abgehakt werden kann (keine Wdh)
function toggleSet(ei, si) {
  const w = Store.getActive();
  const set = w?.entries[ei]?.sets[si];
  if (!set) return false;
  const row = rowEl(ei, si);
  if (!set.done && !(set.reps > 0)) {
    if (row) {
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
    }
    if (useKeypad()) openField(ei, si, 'reps');
    else qs('[data-field="reps"]', row)?.focus();
    return false;
  }
  set.done = !set.done;
  if (set.done) set.suggested = false;
  const prIndex = refreshPrFlags(w, ei);
  Store.setActive(w);
  if (row) {
    row.classList.toggle('done', set.done);
    qsa('.set-in, .set-field', row).forEach((i) => i.classList.remove('suggested'));
    const check = qs('.set-check', row);
    check.classList.remove('bump');
    void check.offsetWidth;
    check.classList.add('bump');
  }
  updateCard(w, ei);
  updateProgress(w);
  advanceFocus(w, set.done && isEntryComplete(w.entries[ei]) ? ei : undefined);
  if (set.done) {
    document.activeElement?.blur?.();
    startRest(w.entries[ei].exerciseId);
    if (prIndex === si) {
      Sound.record();
      haptic(2);
      celebratePr(row);
    } else {
      Sound.setDone();
      haptic();
    }
  } else {
    Sound.setUndone();
    haptic();
  }
  return true;
}

function celebratePr(row) {
  const num = row && qs('.set-num', row);
  if (num) {
    num.classList.remove('pr-pop');
    void num.offsetWidth;
    num.classList.add('pr-pop');
  }
  toast('Neuer Rekord');
}

// ---------- Zahlenfeld ----------
function fieldEl(ei, si, field) {
  return qs(`.set-row[data-ei="${ei}"][data-si="${si}"] .set-field[data-field="${field}"]`, root);
}

function markEditing(fresh = true) {
  qsa('.set-field.editing', root).forEach((x) => x.classList.remove('editing', 'fresh'));
  qsa('.set-row.editing', root).forEach((x) => x.classList.remove('editing'));
  if (!W.field) return;
  const { ei, si, field } = W.field;
  const el = fieldEl(ei, si, field);
  if (!el) return;
  el.classList.add('editing');
  el.classList.toggle('fresh', fresh);
  el.closest('.set-row')?.classList.add('editing');
}

function primaryFor(ei, si, field) {
  const set = Store.getActive()?.entries[ei]?.sets[si];
  if (field === 'reps' && set && !set.done) return { label: 'Abhaken', icon: Icon.check };
  return { label: 'Weiter', icon: '' };
}

// Nächster offener Satz nach (ei, si) – erst in derselben Übung, dann danach
function nextOpenSet(w, ei, si) {
  for (let e = ei; e < w.entries.length; e += 1) {
    const sets = w.entries[e].sets;
    for (let i = e === ei ? si + 1 : 0; i < sets.length; i += 1) {
      if (!sets[i].done) return { ei: e, si: i };
    }
  }
  return null;
}

function revealRow(ei, si) {
  const row = rowEl(ei, si);
  const content = qs('#w-content', root);
  if (!row || !content) return;
  const bar = qs('.w-bar', root);
  const rest = qs('.rest', root);
  const bottomLimit = window.innerHeight - keypadHeight() - (rest ? rest.offsetHeight + 12 : 0) - 14;
  const topLimit = (bar ? bar.getBoundingClientRect().bottom : 0) + 10;
  const rect = row.getBoundingClientRect();
  if (rect.bottom > bottomLimit) content.scrollBy({ top: rect.bottom - bottomLimit, behavior: 'smooth' });
  else if (rect.top < topLimit) content.scrollBy({ top: rect.top - topLimit, behavior: 'smooth' });
}

function openField(ei, si, field) {
  const w = Store.getActive();
  const set = w?.entries[ei]?.sets[si];
  if (!set) return;
  // Zugeklappte Übung zum Bearbeiten öffnen
  const card = qs(`.ex-card[data-ei="${ei}"]`, root);
  if (card?.classList.contains('collapsed')) {
    W.expanded.add(w.entries[ei].exerciseId);
    card.classList.remove('collapsed');
  }
  W.field = { ei, si, field };
  const value = field === 'weight' ? set.weight : set.reps;
  openKeypad({
    host: document.body,
    value: value > 0 ? (field === 'weight' ? formatNumber(value) : String(value)) : '',
    decimal: field === 'weight',
    step: field === 'weight' ? WEIGHT_STEP[unit()] : 1,
    primary: primaryFor(ei, si, field),
    onChange: (text, fresh) => applyFieldText(text, fresh),
    onPrimary: () => keypadPrimary(),
    onClose: () => {
      W.field = null;
      markEditing();
      document.documentElement.classList.remove('kp-open');
    },
  });
  document.documentElement.classList.add('kp-open');
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--kp-h', `${Math.round(keypadHeight())}px`);
    revealRow(ei, si);
  });
  markEditing(true);
}

function applyFieldText(text, fresh) {
  if (!W.field) return;
  const { ei, si, field } = W.field;
  const w = Store.getActive();
  const set = w?.entries[ei]?.sets[si];
  if (!set) return;
  const value = parseNumber(text);
  set[field] = field === 'reps' ? Math.floor(value) : value;
  const row = rowEl(ei, si);
  if (set.suggested) {
    set.suggested = false;
    qsa('.set-field', row).forEach((i) => i.classList.remove('suggested'));
  }
  if (set.done) {
    refreshPrFlags(w, ei);
    updateCard(w, ei);
  }
  Store.setActive(w);
  const el = fieldEl(ei, si, field);
  if (el) qs('.sf-val', el).innerHTML = text ? esc(text) : '<span class="sf-ph">0</span>';
  markEditing(fresh);
  setKeypadPrimary(primaryFor(ei, si, field));
}

function keypadPrimary() {
  if (!W.field) return;
  const { ei, si, field } = W.field;
  if (field === 'weight') { openField(ei, si, 'reps'); return; }
  const w = Store.getActive();
  const set = w?.entries[ei]?.sets[si];
  if (!set) { closeKeypad(); return; }
  if (!set.done) {
    if (toggleSet(ei, si)) closeKeypad();
    return;
  }
  const next = nextOpenSet(w, ei, si);
  if (next) openField(next.ei, next.si, 'weight'); else closeKeypad();
}

function deleteSet(ei, si) {
  closeKeypad();
  const row = rowEl(ei, si)?.closest('.swipe-row');
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
}

function removeExercise(ei) {
  closeKeypad();
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
}

enableSwipeDelete(root, { onDelete: (row) => deleteSet(+row.dataset.ei, +row.dataset.si) });

// Tippen neben die Felder schließt das Zahlenfeld
root.addEventListener('pointerdown', (e) => {
  if (!isKeypadOpen() || e.target.closest('.set-field, .set-check, .rest')) return;
  closeKeypad();
});

// ---------- Aktionen ----------
registerActions({
  'w-open': (el) => openWorkout({ from: el }),
  'w-minimize': () => minimizeWorkout(),
  'w-finish': () => finish(),
  'w-discard': () => discard(),
  'w-add-exercise': () => addExercises(),
  'w-reorder': () => openReorder(),
  'w-note': (el) => openNoteEditor(+el.dataset.ei),

  'w-toggle': (el) => {
    const ei = +el.dataset.ei;
    const si = +el.dataset.si;
    if (isKeypadOpen()) closeKeypad();
    toggleSet(ei, si);
  },

  'w-field': (el) => openField(+el.dataset.ei, +el.dataset.si, el.dataset.field),

  // Antippen von „Vorher“ übernimmt Gewicht und Wiederholungen vom letzten Mal
  'w-prev': (el) => {
    const ei = +el.dataset.ei;
    const si = +el.dataset.si;
    const w = Store.getActive();
    const entry = w?.entries[ei];
    const set = entry?.sets[si];
    const last = entry ? lastSessionFor(entry.exerciseId, w.id) : null;
    const prev = last ? last.entry.sets.filter((s) => s.done && s.reps > 0)[si] : null;
    if (!set || !prev) return;
    set.weight = prev.weight || 0;
    set.reps = prev.reps;
    set.suggested = false;
    if (set.done) refreshPrFlags(w, ei);
    Store.setActive(w);
    if (isKeypadOpen()) closeKeypad();
    const row = rowEl(ei, si);
    ['weight', 'reps'].forEach((field) => {
      const f = qs(`[data-field="${field}"]`, row);
      if (!f) return;
      const text = field === 'weight' ? (set.weight > 0 ? formatNumber(set.weight) : '') : String(set.reps);
      if (f.tagName === 'INPUT') f.value = text;
      else qs('.sf-val', f).innerHTML = text ? esc(text) : '<span class="sf-ph">0</span>';
      f.classList.remove('suggested');
      popIn(f);
    });
    if (set.done) updateCard(w, ei);
    haptic();
  },

  'w-ex-toggle': (el) => {
    const ei = +el.dataset.ei;
    const entry = Store.getActive()?.entries[ei];
    if (!entry || !isEntryComplete(entry)) return;
    const card = el.closest('.ex-card');
    const willOpen = card.classList.contains('collapsed');
    if (willOpen) W.expanded.add(entry.exerciseId); else W.expanded.delete(entry.exerciseId);
    card.classList.toggle('collapsed', !willOpen);
    el.setAttribute('aria-expanded', String(willOpen));
  },

  'w-add-set': (el) => {
    const w = Store.getActive();
    const ei = +el.dataset.ei;
    const sets = w.entries[ei].sets;
    const last = sets[sets.length - 1];
    sets.push({ weight: last ? last.weight : 0, reps: last ? last.reps : 0, done: false, suggested: !!last });
    Store.setActive(w);
    paint();
    popIn(qs(`.ex-card[data-ei="${ei}"] .swipe-row[data-si="${sets.length - 1}"]`, root));
  },

  'w-set-menu': async (el) => {
    const ei = +el.dataset.ei;
    const si = +el.dataset.si;
    await openMenu(el, [{ label: 'Satz löschen', icon: Icon.trash, destructive: true, handler: () => deleteSet(ei, si) }], { title: `Satz ${si + 1}` });
  },

  'w-ex-menu': (el) => {
    const ei = +el.dataset.ei;
    const w = Store.getActive();
    const entry = w.entries[ei];
    const ex = Store.getExercise(entry.exerciseId);
    const items = [];
    if (ex) {
      items.push(
        { label: ex.notes ? 'Notiz bearbeiten' : 'Notiz hinzufügen', icon: Icon.pencil, handler: () => openNoteEditor(ei) },
        { label: 'Satzpause', sub: formatRest(restFor(entry.exerciseId)), icon: Icon.timer, handler: () => chooseRest(ei, el) },
      );
    }
    items.push(
      { label: 'Verlauf', icon: Icon.clock, handler: () => openExerciseHistory(ei) },
      { label: 'Übung ersetzen', icon: Icon.swap, handler: () => replaceExercise(ei) },
      '-',
      { label: 'Übung entfernen', icon: Icon.trash, destructive: true, handler: () => removeExercise(ei) },
    );
    openMenu(el, items, { title: entryName(entry) });
  },

  'rest-adjust': (el) => {
    const rest = Store.getRest();
    if (!rest) return;
    haptic();
    const delta = +el.dataset.delta;
    const endsAt = Math.max(Date.now() + 1000, rest.endsAt + delta * 1000);
    const duration = Math.max(rest.duration + delta, Math.round((endsAt - Date.now()) / 1000));
    Store.setRest({ endsAt, duration });
    syncRest();
  },
  'rest-skip': () => {
    haptic();
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
