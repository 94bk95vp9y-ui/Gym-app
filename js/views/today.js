// Tab „Heute“: oben die Woche als Streifen, dann das Training als Hauptkarte
// (mit dem, was heute ansteht), die Supplements des Tages, die Erholung der
// Muskeln und Mobility. Ein Sicherungshinweis steht – wenn fällig – ganz
// unten, damit er nicht vor dem Training im Weg ist.
import { Store } from '../core/store.js';
import {
  nextPlan, lastDoneMap, planMinutes, planMuscles, plannedSets, workoutProgress, workoutDoneSets, workoutVolume, workoutDuration,
  weekInfo, weekStreak, isSameDay, workoutPrs,
} from '../core/training.js';
import { progressionOf } from '../core/progression.js';
import { recovery, workoutMuscles, muscleShares, MAP_GROUPS } from '../core/muscles.js';
import {
  formatLongDate, formatVolume, formatTime, elapsedLabel, relativeDay, plural, unitLabel,
} from '../core/format.js';
import { esc, registerActions } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { registerPage, push, goTo, render } from '../ui/router.js';
import { openMenu, openSheet } from '../ui/sheet.js';
import { iconTile, ring, chips, TINT } from '../ui/components.js';
import { bodyMap } from '../ui/bodymap.js';
import { startRoutine, startBlank } from './workout.js';
import { supplementsTodayHtml } from './supplements.js';
import { mobilityTileHtml } from './mobility.js';
import { backupDue, exportBackup } from './settings.js';
import { openPlanEditor, openTemplates } from './training.js';
import { bodyTileHtml } from './body.js';
import { showStats } from './history.js';

// Größe des Plan-Namens nach Länge: kurze Namen stehen plakativ groß
function titleSize(name) {
  const longest = Math.max(...String(name).split(/\s+/).map((w) => w.length));
  const n = String(name).length;
  return longest > 11 || n > 18 ? 'len-l' : longest > 6 || n > 9 ? 'len-m' : '';
}

// Die Zielmuskeln eines Plans als Figur: Zielmuskel voll, Hilfsmuskel halb
function planMapHtml(exercises, setsOf) {
  const load = {};
  exercises.forEach((ex) => {
    muscleShares(ex).forEach(([g, share]) => { load[g] = Math.max(load[g] || 0, share * (setsOf(ex) ? 1 : 0)); });
  });
  if (!Object.keys(load).length) return '';
  return `<div class="hero-map" aria-hidden="true">${bodyMap((g) => (load[g] >= 1 ? 'on' : load[g] > 0 ? 'half' : ''), { caption: false })}</div>`;
}

function heroHtml() {
  const active = Store.getActive();
  if (active) {
    const p = workoutProgress(active);
    return `
      <div class="hero live">
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
    const name = doneToday.routineName || 'Freies Training';
    return `
      <div class="hero calm">
        <div class="hero-top">
          <span class="hero-label">${Icon.check}Heute erledigt</span>
          <button class="hero-switch" data-action="choose-workout">Noch eins ${Icon.chevronRight}</button>
        </div>
        <h2 class="hero-title">${esc(name)}</h2>
        <div class="hero-meta">${formatTime(doneToday.startedAt)} Uhr · ${Math.max(1, Math.round(workoutDuration(doneToday) / 60000))} Min</div>
        ${chips(Object.entries(workoutMuscles(doneToday)).filter(([, m]) => m.direct > 0).sort((a, b) => b[1].direct - a[1].direct).slice(0, 4).map(([g]) => g))}
        <div class="hero-stats">
          <div><b>${workoutDoneSets(doneToday)}</b><span>${workoutDoneSets(doneToday) === 1 ? 'Satz' : 'Sätze'}</span></div>
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
        <h2 class="hero-title len-m">Dein erster Plan</h2>
        <div class="hero-meta">Nimm eine bewährte Vorlage, stell selbst zusammen – oder lass eine KI aus deiner Sprachnachricht einen Plan bauen.</div>
        <div class="hero-actions">
          <button class="btn btn-hero" data-action="today-templates">Vorlage wählen</button>
        </div>
        <div class="hero-actions" style="margin-top:10px">
          <button class="btn btn-hero-soft" data-action="today-new-plan">Selbst erstellen</button>
          <button class="btn btn-hero-soft" data-action="start-blank">Leeres Training</button>
        </div>
      </div>`;
  }

  const plan = nextPlan(routines, workouts);
  const lastDone = lastDoneMap(workouts);
  const minutes = planMinutes(plan);
  const exercises = plan.exerciseIds.map((id) => Store.getExercise(id)).filter(Boolean);
  const count = exercises.length;
  const sets = exercises.reduce((n, ex) => n + plannedSets(plan, ex.id), 0);
  return `
    <div class="hero">
      <div class="hero-top">
        <span class="hero-label">Nächstes Training</span>
        <button class="hero-switch" data-action="choose-workout">Wechseln ${Icon.chevronDown}</button>
      </div>
      <div class="hero-body">
        <div class="hero-text">
          <h2 class="hero-title ${titleSize(plan.name)}">${esc(plan.name)}</h2>
          <div class="hero-meta">${plural(count, 'Übung', 'Übungen')}${minutes ? ` · ca. ${minutes} Min` : ` · ${plural(sets, 'Satz', 'Sätze')}`}<br>${lastDone.has(plan.id) ? `zuletzt ${relativeDay(lastDone.get(plan.id))}` : 'noch nie trainiert'}</div>
        </div>
        ${planMapHtml(exercises, (ex) => plannedSets(plan, ex.id))}
      </div>
      ${chips(planMuscles(plan, 4))}
      ${focusHtml(plan, exercises)}
      <div class="hero-actions">
        <button class="btn btn-hero" data-action="start-routine" data-id="${plan.id}" ${count ? '' : 'disabled'}>${Icon.play} Training starten</button>
      </div>
    </div>`;
}

// Was heute in diesem Plan drin ist: wo mehr Gewicht ansteht, wo es hakt –
// und ob die Zielmuskeln noch vom letzten Training erholen. Höchstens drei
// kurze Zeilen; ohne Besonderheit bleibt die Karte ruhig.
function focusHtml(plan, exercises) {
  const lines = [];
  const kinds = { up: [], plateau: [], comeback: [] };
  exercises.forEach((ex) => {
    const kind = progressionOf(ex).target?.kind;
    if (kind === 'increase' || kind === 'addLoad') kinds.up.push(ex.name);
    else if (kind === 'plateau') kinds.plateau.push(ex.name);
    else if (kind === 'comeback') kinds.comeback.push(ex.name);
  });
  const short = (names) => (names.length === 1 ? names[0].replace(/\s*\([^)]*\)$/, '') : plural(names.length, 'Übung', 'Übungen'));
  if (kinds.up.length) lines.push({ icon: Icon.arrowUp, text: `Mehr Gewicht drin: ${short(kinds.up)}` });
  if (kinds.plateau.length) lines.push({ icon: Icon.plateau, text: `Plateau: ${short(kinds.plateau)}` });
  if (kinds.comeback.length) lines.push({ icon: Icon.restore, text: `Wiedereinstieg: ${kinds.comeback.length === exercises.length ? 'heute leichter starten' : short(kinds.comeback)}` });
  const rec = recovery();
  const tired = planMuscles(plan, 4).filter((g) => rec[g] && rec[g].state !== 'ready').sort((a, b) => rec[b].hoursLeft - rec[a].hoursLeft);
  if (tired.length) {
    lines.push({ icon: Icon.clock, text: `${tired.slice(0, 2).join(' und ')} ${tired.length === 1 ? 'erholt' : 'erholen'} sich noch (ca. ${hoursText(rec[tired[0]].hoursLeft)})` });
  }
  if (!lines.length) return '';
  return `<ul class="hero-focus">${lines.slice(0, 3).map((l) => `<li>${l.icon}<span>${esc(l.text)}</span></li>`).join('')}</ul>`;
}

function hoursText(h) {
  return h >= 36 ? `${Math.round(h / 24)} Tage` : h >= 20 ? '1 Tag' : `${Math.max(1, h)} Std`;
}

// Die Woche oben: Stand zum Wochenziel als große Zahl, die sieben Tage als
// Felder, darunter das Ziel als Scheiben auf der Stange und die Serie.
function weekStripHtml() {
  const goal = Store.getSettings().weeklyGoal;
  const info = weekInfo();
  const streak = weekStreak(goal);
  const letters = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const hit = info.count >= goal;
  const left = goal - info.count;
  const daysLeft = 6 - info.todayIndex + (info.days[info.todayIndex] ? 0 : 1);
  const status = hit
    ? (info.count > goal ? '<b>Ziel übertroffen</b>' : '<b>Wochenziel erreicht</b>')
    : left > daysLeft ? `Noch <b>${left}</b> – wird knapp`
      : `Noch <b>${left}</b> bis zum Ziel`;
  return `
    <button class="week" data-action="open-stats" aria-label="Diese Woche: ${info.count} von ${goal} Trainings">
      <span class="wk-main">
        <span class="wk-count">${info.count}<small>/${goal}</small></span>
        <span class="wk-cap">Diese Woche</span>
      </span>
      <span class="wk-days">${letters.map((l, i) => `<span class="wk-day ${info.days[i] ? 'on' : ''} ${i === info.todayIndex ? 'today' : ''} ${i > info.todayIndex ? 'future' : ''}"><i>${info.days[i] ? Icon.check : ''}</i>${l}</span>`).join('')}</span>
      <span class="wk-foot">
        <span class="wk-plates" aria-hidden="true">${Array.from({ length: Math.max(goal, info.count) }, (_, i) => `<i class="${i < info.count ? 'on' : ''}"></i>`).join('')}</span>
        <span>${status}</span>
        ${streak >= 2 ? `<span class="wk-streak">${Icon.flame}${streak} Wo.</span>` : ''}
        <span class="row-chev">${Icon.chevronRight}</span>
      </span>
    </button>`;
}

// ---------- Erholung ----------
const STATE_LABEL = { tired: 'Belastet', recovering: 'Erholt sich', ready: 'Bereit' };

function recoveryData() {
  const rec = recovery();
  const groups = MAP_GROUPS.filter((g) => rec[g].lastAt !== null);
  return { rec, groups, busy: groups.filter((g) => rec[g].state !== 'ready').sort((a, b) => rec[b].hoursLeft - rec[a].hoursLeft) };
}

const recoveryClass = (rec) => (g) => (rec[g]?.lastAt === null ? 'st-none' : `st-${rec[g].state}`);

// Karte auf „Heute“: links die Körperkarte, rechts je Zustand die Muskeln
function recoveryCardHtml() {
  const { rec, groups } = recoveryData();
  if (!groups.length) return '';
  const names = (list) => `${list.slice(0, 3).join(', ')}${list.length > 3 ? ` +${list.length - 3}` : ''}`;
  const lines = ['tired', 'recovering', 'ready'].map((state) => {
    const list = groups.filter((g) => rec[g].state === state).sort((x, y) => rec[y].hoursLeft - rec[x].hoursLeft);
    return list.length ? `<li><i class="rec-dot st-${state}"></i><span><b>${STATE_LABEL[state]}</b>${esc(names(list))}</span></li>` : '';
  }).join('');
  return `
    <button class="card recovery-card" data-action="recovery-open">
      ${bodyMap(recoveryClass(rec), { caption: false })}
      <span class="rc-text">
        <span class="tile-label">Erholung</span>
        <ul class="rc-list">${lines}</ul>
      </span>
      <span class="row-chev">${Icon.chevronRight}</span>
    </button>`;
}

function openRecovery() {
  const { rec, groups } = recoveryData();
  const order = { tired: 0, recovering: 1, ready: 2 };
  const rows = [...groups].sort((a, b) => order[rec[a].state] - order[rec[b].state] || rec[b].hoursLeft - rec[a].hoursLeft).map((g) => {
    const r = rec[g];
    const sets = Math.round(r.lastSets * 10) / 10;
    return `
      <div class="row rec-row">
        <span class="rec-dot st-${r.state}"></span>
        <div class="row-main"><span class="row-title">${esc(g)}</span>
          <span class="row-sub">${relativeDay(new Date(r.lastAt).toISOString())} · ${String(sets).replace('.', ',')} ${sets === 1 ? 'Satz' : 'Sätze'}</span></div>
        <span class="rec-state">
          <span class="rec-label">${STATE_LABEL[r.state]}${r.state === 'ready' ? '' : ` · noch ${hoursText(r.hoursLeft)}`}</span>
          <span class="progress rec-bar st-${r.state}"><i style="transform:scaleX(${r.pct.toFixed(2)})"></i></span>
        </span>
      </div>`;
  }).join('');
  openSheet({
    title: 'Erholung',
    body: `
      <div class="card rec-card">
        ${bodyMap(recoveryClass(rec))}
        <div class="map-legend"><span><i class="st-tired"></i>Belastet</span><span><i class="st-recovering"></i>Erholt sich</span><span><i class="st-ready"></i>Bereit</span></div>
      </div>
      <div class="section"><div class="list">${rows}</div></div>
      <p class="section-foot">Eine Faustregel, keine Messung: je mehr Sätze ein Muskel abbekommen hat, desto länger die Pause – zwischen einem und drei Tagen. Mitarbeitende Muskeln zählen halb (z. B. Trizeps beim Bankdrücken). Schlaf, Ernährung und Tagesform kennt die App nicht.</p>`,
  });
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
  render: () => {
    return `
    ${weekStripHtml()}
    ${heroHtml()}
    ${supplementsTodayHtml()}
    <div class="section">
      ${recoveryCardHtml()}
      <div class="tiles today-tiles">${mobilityTileHtml()}${bodyTileHtml()}</div>
    </div>
    ${backupHtml()}`;
  },
});

// „Wechseln“ / „Noch eins“: Menü am Knopf mit allen Plänen – Antippen startet
function openWorkoutChooser(anchor) {
  const routines = Store.getRoutines();
  const next = nextPlan(routines);
  const lastDone = lastDoneMap();
  const hero = anchor.closest('.hero');
  openMenu(anchor, [
    ...routines.map((r) => ({
      label: r.name,
      sub: `${planMuscles(r, 2).join(' · ') || plural(r.exerciseIds.length, 'Übung', 'Übungen')} · ${lastDone.has(r.id) ? relativeDay(lastDone.get(r.id)) : 'neu'}`,
      checked: r === next,
      disabled: !r.exerciseIds.length,
      handler: () => startRoutine(r.id, { from: hero }),
    })),
    ...(routines.length ? ['-'] : []),
    { label: 'Leeres Training', icon: Icon.plus, handler: () => startBlank() },
  ], { title: 'Training wählen' });
}

registerActions({
  'open-settings': () => push('settings'),
  'open-stats': () => { showStats(); goTo('history'); },
  'recovery-open': () => openRecovery(),
  'choose-workout': (el) => openWorkoutChooser(el),
  'today-templates': () => { goTo('training'); openTemplates(); },
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
