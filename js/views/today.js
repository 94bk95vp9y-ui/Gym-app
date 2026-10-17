// Tab „Heute“: oben das Training als Hauptkarte, darunter die Supplements des
// Tages, dann Woche und Mobility als Kacheln. Ein Sicherungshinweis steht –
// wenn fällig – ganz unten, damit er nicht vor dem Training im Weg ist.
import { Store } from '../core/store.js';
import {
  nextPlan, lastDoneMap, planMinutes, planMuscles, workoutProgress, workoutDoneSets, workoutVolume, workoutDuration,
  weekInfo, isSameDay, workoutPrs,
} from '../core/training.js';
import {
  formatLongDate, formatVolume, formatTime, elapsedLabel, relativeDay, plural, unitLabel,
} from '../core/format.js';
import { esc, registerActions } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { registerPage, push, goTo, render } from '../ui/router.js';
import { openSheet } from '../ui/sheet.js';
import { chips, chev, iconTile, TINT } from '../ui/components.js';
import { startRoutine, startBlank } from './workout.js';
import { supplementsTodayHtml } from './supplements.js';
import { mobilityTileHtml } from './mobility.js';
import { backupDue, exportBackup } from './settings.js';
import { openPlanEditor } from './training.js';

function heroHtml() {
  const active = Store.getActive();
  if (active) {
    const p = workoutProgress(active);
    return `
      <div class="hero">
        <div class="hero-top"><span class="hero-label"><span class="live-dot"></span>Training läuft</span></div>
        <div class="hero-time" id="live-time">${elapsedLabel(active.startedAt)}</div>
        <div class="hero-meta">${esc(active.routineName || 'Freies Training')} · ${p.done} von ${plural(p.total, 'Satz', 'Sätzen')}</div>
        <div class="hero-progress"><i style="transform:scaleX(${p.ratio})"></i></div>
        <div class="hero-actions"><button class="btn btn-hero" data-action="w-open">Fortsetzen</button></div>
      </div>`;
  }

  const workouts = Store.getWorkouts();
  const doneToday = workouts.find((w) => isSameDay(w.startedAt));
  if (doneToday) {
    const prs = workoutPrs(doneToday);
    const u = unitLabel(Store.getSettings().unit);
    return `
      <div class="hero calm">
        <div class="hero-top">
          <span class="hero-label">${Icon.check}Heute erledigt</span>
          <button class="hero-switch" data-action="choose-workout">Noch eins ${Icon.chevronRight}</button>
        </div>
        <h2 class="hero-title">${esc(doneToday.routineName || 'Freies Training')}</h2>
        <div class="hero-meta muted">${formatTime(doneToday.startedAt)} Uhr · ${Math.round(workoutDuration(doneToday) / 60000)} Min</div>
        <div class="hero-stats">
          <div><b>${workoutDoneSets(doneToday)}</b><span>Sätze</span></div>
          <div><b>${formatVolume(workoutVolume(doneToday))}</b><span>${u} Volumen</span></div>
          <div><b>${prs}</b><span>${prs === 1 ? 'Rekord' : 'Rekorde'}</span></div>
        </div>
        <div class="hero-actions"><button class="btn btn-secondary" data-action="open-workout-detail" data-id="${doneToday.id}">Details ansehen</button></div>
      </div>`;
  }

  const routines = Store.getRoutines();
  if (!routines.length) {
    return `
      <div class="hero">
        <div class="hero-top"><span class="hero-label">Los geht’s</span></div>
        <h2 class="hero-title">Erstelle deinen ersten Plan</h2>
        <div class="hero-meta">Selbst zusammenstellen oder mit einer KI aus einer Sprachnachricht.</div>
        <div class="hero-actions">
          <button class="btn btn-hero" data-action="today-new-plan">Plan erstellen</button>
          <button class="btn btn-hero-soft" data-action="start-blank">Leeres Training</button>
        </div>
      </div>`;
  }

  const plan = nextPlan(routines, workouts);
  const lastDone = lastDoneMap(workouts);
  const minutes = planMinutes(plan);
  const count = plan.exerciseIds.filter((id) => Store.getExercise(id)).length;
  return `
    <div class="hero">
      <div class="hero-top">
        <span class="hero-label">Nächstes Training</span>
        <button class="hero-switch" data-action="choose-workout">Wechseln ${Icon.chevronDown}</button>
      </div>
      <h2 class="hero-title">${esc(plan.name)}</h2>
      <div class="hero-meta">${plural(count, 'Übung', 'Übungen')}${minutes ? ` · ca. ${minutes} Min` : ''} · ${lastDone.has(plan.id) ? `zuletzt ${relativeDay(lastDone.get(plan.id))}` : 'noch nicht trainiert'}</div>
      ${chips(planMuscles(plan))}
      <div class="hero-actions">
        <button class="btn btn-hero" data-action="start-routine" data-id="${plan.id}" ${count ? '' : 'disabled'}>${Icon.play} Training starten</button>
      </div>
    </div>`;
}

function weekTileHtml() {
  const goal = Store.getSettings().weeklyGoal;
  const info = weekInfo();
  const letters = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
  return `
    <button class="tile" data-action="tab" data-tab="history">
      <div class="tile-head"><span class="tile-label">Diese Woche</span>${info.count >= goal ? `<span class="tag success">${Icon.check}Ziel</span>` : ''}</div>
      <div class="tile-value">${info.count}<small>/${goal} Trainings</small></div>
      <div class="week-dots tile-foot">
        ${letters.map((l, i) => `<span class="week-dot ${info.days[i] ? 'on' : ''} ${i === info.todayIndex ? 'today' : ''}"><i></i>${l}</span>`).join('')}
      </div>
    </button>`;
}

function backupHtml() {
  if (!backupDue()) return '';
  const last = Store.getSettings().lastBackupAt;
  return `
    <div class="section">
      <div class="list icons">
        <div class="row">
          ${iconTile(Icon.archive, TINT.orange)}
          <div class="row-main"><span class="row-title">Sicherung fällig</span>
            <span class="row-sub">${last ? `Zuletzt ${relativeDay(last)}` : 'Daten nur auf diesem Gerät'}</span></div>
          <button class="btn btn-tinted btn-sm" data-action="backup-now">Sichern</button>
          <button class="icon-btn" data-action="backup-snooze" aria-label="Später erinnern" style="margin-right:-8px">${Icon.close}</button>
        </div>
      </div>
    </div>`;
}

registerPage('today', {
  title: 'Heute',
  kicker: () => formatLongDate(),
  right: () => `<button class="nav-btn icon-only neutral" data-action="open-settings" aria-label="Einstellungen">${Icon.gear}</button>`,
  render: () => `
    ${heroHtml()}
    ${supplementsTodayHtml()}
    <div class="section"><div class="tiles">${weekTileHtml()}${mobilityTileHtml()}</div></div>
    ${backupHtml()}`,
});

function openWorkoutChooser() {
  const routines = Store.getRoutines();
  const next = nextPlan(routines);
  const lastDone = lastDoneMap();
  openSheet({
    title: 'Training wählen',
    left: { label: 'Abbrechen' },
    right: null,
    body: `
      ${routines.length ? `<div class="list">
        ${routines.map((r) => `
          <button class="row" data-pick-plan="${r.id}">
            <div class="row-main">
              <span class="row-title strong">${esc(r.name)}</span>
              <span class="row-sub">${esc(planMuscles(r).join(' · ') || plural(r.exerciseIds.length, 'Übung', 'Übungen'))} · ${lastDone.has(r.id) ? relativeDay(lastDone.get(r.id)) : 'neu'}</span>
            </div>
            ${r === next ? '<span class="tag">Als Nächstes</span>' : ''}${chev}
          </button>`).join('')}
      </div>` : ''}
      <div class="section"><div class="list icons">
        <button class="row" data-pick-plan="">${iconTile(Icon.plus, TINT.blue)}<div class="row-main"><span class="row-title">Leeres Training</span><span class="row-sub">Übungen spontan auswählen</span></div>${chev}</button>
      </div></div>`,
    onMount: (s) => s.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick-plan]');
      if (!b) return;
      s.close();
      if (b.dataset.pickPlan) startRoutine(b.dataset.pickPlan); else startBlank();
    }),
  });
}

registerActions({
  'open-settings': () => push('settings'),
  'choose-workout': () => openWorkoutChooser(),
  'today-new-plan': () => {
    goTo('training');
    openPlanEditor(null, { onSaved: (id) => push('plan', { id }) });
  },
  'open-workout-detail': (el) => goTo('history', 'workout', { id: el.dataset.id }),
  'backup-now': () => exportBackup().then(() => render()),
  'backup-snooze': () => {
    Store.updateSettings({ backupSnoozedUntil: new Date(Date.now() + 7 * 86400000).toISOString() });
    render();
  },
});
