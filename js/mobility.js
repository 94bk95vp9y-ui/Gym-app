// Mobility: Anbindung an die App. Der eigentliche Bereich (eigene Seite mit
// Heute, Plänen, Übungen und Fortschritt) liegt in js/mobility/, hier nur
// die Karte für die Startseiten (Gym und Fight) und die Einstiege von außen.
//
// Zählt bewusst nicht als Training: eigene Einheiten, eigenes Wochenziel.
// Die 3D-Darstellung (three.js) wird erst geladen, wenn der Bereich oder der
// Player geöffnet wird.

import { Store } from './storage.js';
import { Icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { initArea, openArea, refreshArea, isAreaOpen, setStarter, openCheck } from './mobility/area.js';
import { initPlayer, startRoutine } from './mobility/player.js';
import {
  todayPlan, weekStats, situationRoutine, dailyRoutine, routineById, mobilityDoneToday as doneToday, prepSeconds,
} from './mobility/state.js';
import { routineSeconds } from './mobility/plans.js';

let ctx = null;
export function initMobility(context) {
  ctx = context;
  initArea(context);
  initPlayer({ ...context, onPlayerClosed: () => { if (isAreaOpen()) refreshArea(); else ctx.render(); } });
  setStarter(startRoutine);
}

const qs = (sel, parent = document) => parent.querySelector(sel);
const mins = (sec) => `${Math.max(1, Math.round(sec / 60))} Min`;

export function mobilityDoneToday() { return doneToday(); }

export function openMobilityArea(opts) { openArea(opts); }

// ---------- Karte auf der Startseite ----------
export function renderMobilityCard() {
  if (!Store.getSettings().mobility) return '';
  const plan = todayPlan();
  const stats = plan.stats;
  const sec = routineSeconds(plan.main.items, prepSeconds());
  const sub = plan.done
    ? `Heute erledigt · ${stats.count}/${stats.goal} diese Woche`
    : plan.deepDay
      ? `Heute: Tiefe Einheit ${plan.main.letter} · ${mins(sec)}`
      : `Heute: ${escapeHtml(plan.main.focus.name)} · ${mins(sec)} · ${stats.count}/${stats.goal}`;
  return `
    <section class="card mob-card mz-entry ${plan.done ? 'done' : ''}">
      <button class="mob-card-main" data-action="open-mobility">
        <span class="mob-card-icon">${plan.done ? Icon.check : Icon.leaf}</span>
        <span class="mob-card-text"><strong>Mobility</strong><span class="muted small">${sub}</span></span>
        <span class="mz-entry-dots">${stats.days.map((on, i) => `<i class="${on ? 'on' : ''} ${i === stats.todayIndex ? 'today' : ''}"></i>`).join('')}</span>
      </button>
      ${plan.done ? '' : `<button class="mob-card-play" data-action="mob-quickstart" aria-label="Mobility starten">${Icon.play}</button>`}
    </section>`;
}

export function bindMobilityCard(root = document) {
  qs('[data-action="open-mobility"]', root)?.addEventListener('click', () => openArea());
  qs('[data-action="mob-quickstart"]', root)?.addEventListener('click', () => startRoutine(todayPlan().main));
}

// Einstieg von außen, z. B. nach dem Training oder aus dem Fight-Plan.
// 'after-workout' wählt die Routine passend zum heutigen Training.
export function startMobilityRoutine(id) {
  let r = null;
  if (id === 'after-workout') {
    const kind = todaysKind();
    r = situationRoutine(kind ? `post-${kind}` : 'quick');
  } else if (id === 'today') r = todayPlan().main;
  else r = routineById(id) || situationRoutine('quick') || dailyRoutine();
  if (r) startRoutine(r);
}

function todaysKind() {
  const today = new Date().toDateString();
  const w = Store.getWorkouts().find((x) => new Date(x.startedAt).toDateString() === today);
  if (!w) return null;
  const groups = { legs: 0, push: 0, pull: 0 };
  w.entries.forEach((e) => {
    const g = Store.getExercise(e.exerciseId)?.muscleGroup;
    if (['Beine', 'Po', 'Waden'].includes(g)) groups.legs += 1;
    else if (['Brust', 'Schultern', 'Trizeps'].includes(g)) groups.push += 1;
    else if (['Rücken', 'Bizeps'].includes(g)) groups.pull += 1;
  });
  const best = Object.entries(groups).sort((a, b) => b[1] - a[1])[0];
  return best[1] ? best[0] : null;
}

export { weekStats, openCheck };
