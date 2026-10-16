// Tab „Heute“: das nächste Training, die Supplements des Tages, die Woche
// und – bewusst klein – Mobility.
import { Store } from '../core/store.js';
import {
  nextPlan, lastDoneMap, planMinutes, plannedSets, workoutProgress, workoutDoneSets, workoutVolume, workoutDuration,
  weekInfo, weekStreak, isSameDay, workoutPrs,
} from '../core/training.js';
import {
  formatLongDate, formatVolume, elapsedLabel, relativeDay, plural, unitLabel,
} from '../core/format.js';
import { esc, registerActions } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { registerPage, push, goTo, render } from '../ui/router.js';
import { openSheet } from '../ui/sheet.js';
import { startRoutine, startBlank } from './workout.js';
import { supplementsTodayHtml } from './supplements.js';
import { mobilityRowHtml } from './mobility.js';
import { backupDue, exportBackup } from './settings.js';
import { openPlanEditor } from './training.js';

const chev = `<span class="row-chev">${Icon.chevronRight}</span>`;

function heroHtml() {
  const active = Store.getActive();
  if (active) {
    const p = workoutProgress(active);
    return `
      <div class="card">
        <div class="hero-label"><span class="pulse-dot"></span>Training läuft</div>
        <h2 class="hero-title">${esc(active.routineName || 'Freies Training')}</h2>
        <p class="hero-meta"><span id="live-time" class="num">${elapsedLabel(active.startedAt)}</span> · ${p.done} von ${plural(p.total, 'Satz', 'Sätzen')}</p>
        <div class="hero-progress"><i style="transform:scaleX(${p.ratio})"></i></div>
        <button class="btn btn-primary btn-block" data-action="w-open">Fortsetzen</button>
      </div>`;
  }

  const workouts = Store.getWorkouts();
  const doneToday = workouts.find((w) => isSameDay(w.startedAt));
  if (doneToday) {
    const prs = workoutPrs(doneToday);
    return `
      <div class="card">
        <div class="hero-label success">${Icon.check}Heute erledigt</div>
        <h2 class="hero-title">${esc(doneToday.routineName || 'Freies Training')}</h2>
        <div class="stats divided hero-stats">
          <div class="stat"><b class="num">${Math.round(workoutDuration(doneToday) / 60000)}<small>Min</small></b><span>Dauer</span></div>
          <div class="stat"><b class="num">${workoutDoneSets(doneToday)}</b><span>Sätze</span></div>
          <div class="stat"><b class="num">${prs ? prs : formatVolume(workoutVolume(doneToday))}</b><span>${prs ? (prs === 1 ? 'Rekord' : 'Rekorde') : `Volumen (${unitLabel(Store.getSettings().unit)})`}</span></div>
        </div>
        <div class="hero-actions">
          <button class="btn btn-secondary btn-block" data-action="open-workout-detail" data-id="${doneToday.id}">Details ansehen</button>
          <button class="btn btn-plain" data-action="choose-workout">Weiteres Training starten</button>
        </div>
      </div>`;
  }

  const routines = Store.getRoutines();
  if (!routines.length) {
    return `
      <div class="card">
        <div class="hero-label">Los geht’s</div>
        <h2 class="hero-title">Erstelle deinen ersten Plan</h2>
        <p class="hero-meta">Selbst zusammenstellen oder mit einer KI aus einer Sprachnachricht.</p>
        <div class="hero-actions" style="margin-top:16px">
          <button class="btn btn-primary btn-block" data-action="today-new-plan">Plan erstellen</button>
          <button class="btn btn-plain" data-action="start-blank">Leeres Training starten</button>
        </div>
      </div>`;
  }

  const plan = nextPlan(routines, workouts);
  const lastDone = lastDoneMap(workouts);
  const minutes = planMinutes(plan);
  const items = plan.exerciseIds.map((id) => ({ ex: Store.getExercise(id), sets: plannedSets(plan, id) })).filter((x) => x.ex);
  const shown = items.slice(0, 5);
  return `
    <div class="card">
      <div class="hero-label">Nächstes Training</div>
      <h2 class="hero-title">${esc(plan.name)}</h2>
      <p class="hero-meta">${plural(items.length, 'Übung', 'Übungen')}${minutes ? ` · ca. ${minutes} Min` : ''} · ${lastDone.has(plan.id) ? `zuletzt ${relativeDay(lastDone.get(plan.id))}` : 'noch nicht trainiert'}</p>
      <ul class="hero-list">
        ${shown.map((x) => `<li><span>${esc(x.ex.name)}</span><span>${plural(x.sets, 'Satz', 'Sätze')}</span></li>`).join('')}
        ${items.length > shown.length ? `<li class="more">+ ${items.length - shown.length} weitere</li>` : ''}
      </ul>
      <div class="hero-actions">
        <button class="btn btn-primary btn-block" data-action="start-routine" data-id="${plan.id}" ${items.length ? '' : 'disabled'}>${Icon.play} Training starten</button>
        ${routines.length > 1 ? '<button class="btn btn-plain" data-action="choose-workout">Anderen Plan wählen</button>' : '<button class="btn btn-plain" data-action="start-blank">Leeres Training starten</button>'}
      </div>
    </div>`;
}

function weekHtml() {
  const settings = Store.getSettings();
  const info = weekInfo();
  const streak = weekStreak(settings.weeklyGoal);
  const letters = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
  return `
    <div class="section">
      <div class="section-head"><h2>Diese Woche</h2>${streak > 1 ? `<span class="muted small">${streak} Wochen in Folge</span>` : ''}</div>
      <div class="card week">
        <div class="week-days">
          ${letters.map((l, i) => `
            <div class="week-day ${info.days[i] ? 'on' : ''} ${i === info.todayIndex ? 'today' : ''}">
              <i>${info.days[i] ? Icon.check : ''}</i>${l}
            </div>`).join('')}
        </div>
        <div class="week-count"><b>${info.count}<small>/${settings.weeklyGoal}</small></b><span>Trainings</span></div>
      </div>
    </div>`;
}

function backupBannerHtml() {
  if (!backupDue()) return '';
  const last = Store.getSettings().lastBackupAt;
  return `
    <div class="banner">
      <span class="row-icon">${Icon.archive}</span>
      <div class="banner-text"><strong>Sicherung empfohlen</strong>${last ? `Letzte Sicherung ${relativeDay(last)}.` : 'Deine Daten liegen nur auf diesem Gerät.'}</div>
      <div class="banner-actions">
        <button class="btn btn-plain btn-sm" data-action="backup-snooze">Später</button>
        <button class="btn btn-tinted btn-sm" data-action="backup-now">Sichern</button>
      </div>
    </div>`;
}

registerPage('today', {
  title: 'Heute',
  kicker: () => formatLongDate(),
  right: () => `<button class="nav-btn icon-only" data-action="open-settings" aria-label="Einstellungen">${Icon.gear}</button>`,
  render: () => `
    ${heroHtml()}
    ${backupBannerHtml()}
    ${supplementsTodayHtml()}
    ${weekHtml()}
    ${mobilityRowHtml()}`,
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
      <div class="list">
        ${routines.map((r) => `
          <button class="row plan-row" data-pick-plan="${r.id}">
            <div class="row-main">
              <span class="row-title">${esc(r.name)}${r === next ? '<span class="tag">Als Nächstes</span>' : ''}</span>
              <span class="row-sub">${plural(r.exerciseIds.length, 'Übung', 'Übungen')} · ${lastDone.has(r.id) ? `zuletzt ${relativeDay(lastDone.get(r.id))}` : 'noch nicht trainiert'}</span>
            </div>${chev}
          </button>`).join('')}
      </div>
      <div class="section"><div class="list inset-icons">
        <button class="row" data-pick-plan=""><span class="row-icon accent">${Icon.plus}</span><div class="row-main"><span class="row-title">Leeres Training</span></div>${chev}</button>
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

