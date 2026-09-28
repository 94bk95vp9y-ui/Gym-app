// „Heute dran“: ein konkreter Vorschlag für heute – abgeleitet aus
// Wochenzielen, dem, was diese Woche schon passiert ist, der Belastung der
// letzten Tage und dem Gym-Plan (harte Laufintervalle nicht direkt vor oder
// nach dem Beintag – Laufen stört den Kraftaufbau in den Beinen mehr als
// anderes Ausdauertraining).
import { Store } from '../storage.js';
import { fx, getProfile, weekSummary, recentEntries, hardSession, quietNow, DAY, startOfDay, weekdayIndex } from './core.js';
import { TECH } from './data-tech.js';
import { nextToLearn, dueReviews, beltStatus } from './progress.js';
import { mobilityDoneToday } from '../mobility.js';

// Hat ein Gym-Training (oder der nächste Plan) Schwerpunkt Beine?
function legHeavy(entryIds) {
  const groups = new Map(Store.getExercises().map((e) => [e.id, e.muscleGroup]));
  const legs = entryIds.filter((id) => groups.get(id) === 'Beine').length;
  return legs >= 2 || (entryIds.length && legs / entryIds.length >= 0.4);
}

function gymContext() {
  const today = startOfDay();
  const workouts = Store.getWorkouts().filter((w) => w.finishedAt);
  const todayLegs = workouts.some((w) => new Date(w.startedAt) >= today && legHeavy(w.entries.map((e) => e.exerciseId)));
  const yesterday = new Date(today.getTime() - DAY);
  const yesterdayLegs = workouts.some((w) => { const d = new Date(w.startedAt); return d >= yesterday && d < today && legHeavy(w.entries.map((e) => e.exerciseId)); });
  let nextLegs = false;
  try {
    const routines = Store.getRoutines();
    const { next } = fx.ctx.planRotation(routines, Store.getWorkouts());
    const plan = routines.find((r) => r.id === next);
    nextLegs = !!plan && legHeavy(plan.exerciseIds);
  } catch { /* ohne Gym-Daten */ }
  const gymToday = workouts.some((w) => new Date(w.startedAt) >= today);
  return { todayLegs, yesterdayLegs, nextLegs, gymToday };
}

export function todayPlan() {
  const profile = getProfile();
  const week = weekSummary();
  const today = startOfDay();
  const doneToday = [...week.fight, ...week.run].filter((e) => new Date(e.at) >= today);
  const recent = recentEntries(1.6);
  const hardYesterday = recent.some((e) => hardSession(e) && new Date(e.at) < today);
  const gym = gymContext();
  const quiet = quietNow(profile);
  const next = nextToLearn();
  const due = dueReviews();
  const belt = beltStatus();
  const minutes = profile.sessionMinutes || 30;
  const fightLeft = Math.max(0, profile.fightPerWeek - week.fight.length);
  const runLeft = Math.max(0, profile.runPerWeek - week.run.length);
  const daysLeft = 7 - weekdayIndex(new Date());
  const lastLesson = Store.getFightLog().filter((f) => f.type === 'lesson').slice(-1)[0];
  const lessonRecently = lastLesson && Date.now() - new Date(lastLesson.at).getTime() < 1.5 * DAY;
  const intervalsThisWeek = week.run.some((r) => r.kind === 'intervals' || r.kind === 'tempo');
  const conditioningThisWeek = week.fight.some((f) => f.type === 'conditioning');

  // Schon trainiert heute
  if (doneToday.length) {
    if (!mobilityDoneToday() && Store.getSettings().mobility) {
      return { icon: '🧘', title: 'Erholung: Mobility', sub: '10 Minuten – vor allem Hüfte, gut für hohe Tritte.', why: 'Heute ist schon trainiert. Beweglichkeit ist der beste Nachschlag.', action: { type: 'mobility' } };
    }
    return { icon: '✅', title: 'Heute erledigt', sub: 'Erholung gehört zum Training. Morgen geht’s weiter.', why: `${doneToday.length} ${doneToday.length === 1 ? 'Einheit' : 'Einheiten'} heute.`, action: { type: 'reaction' }, actionLabel: 'Kurzer Reaktionstest' };
  }

  if (belt.ready) {
    return { icon: '🥋', title: `Prüfung zum ${belt.next.name}`, sub: '3 Runden + Selbst-Check · ca. 10 Min', why: 'Alle Techniken sind geübt – zeig, was du kannst.', action: { type: 'exam' } };
  }

  const runFirst = runLeft > 0 && (fightLeft === 0 || runLeft / daysLeft > fightLeft / daysLeft || (recent[0]?.area === 'fight' && runLeft >= fightLeft));
  if (runFirst) {
    const legConflict = gym.todayLegs || gym.yesterdayLegs || gym.nextLegs;
    if (!intervalsThisWeek && !hardYesterday && !legConflict) {
      const fightIntervals = week.run.length % 2 === 1;
      return {
        icon: '🔥', title: fightIntervals ? 'Kampf-Intervalle' : '4 × 4 Intervalle', sub: fightIntervals ? '5 × 3 Min zügig · ca. 30 Min' : '4 × 4 Min hart · ca. 40 Min', tone: 'teal',
        why: `${week.run.length}/${profile.runPerWeek} Läufe diese Woche – einmal pro Woche hart bringt am meisten.`, action: { type: 'run', template: fightIntervals ? 'fight' : '4x4' },
      };
    }
    return {
      icon: '🌿', title: 'Lockerer Lauf', sub: `${Math.max(20, minutes)} Min im Sprechtempo`, tone: 'teal',
      why: legConflict ? 'Beintag in der Nähe – deshalb locker statt Intervalle.' : hardYesterday ? 'Gestern war hart – heute locker.' : `${week.run.length}/${profile.runPerWeek} Läufe diese Woche.`,
      action: { type: 'run', template: 'easy', minutes: [20, 30, 40, 50].reduce((a, b) => (Math.abs(b - minutes) < Math.abs(a - minutes) ? b : a)) },
    };
  }

  if (fightLeft > 0 || runLeft === 0) {
    if (next && !lessonRecently && !(due.length >= 3)) {
      return { icon: '🎯', title: `Lernen: ${next.name}`, sub: 'Neue Technik Schritt für Schritt · ca. 5 Min', why: `Nächste Technik für den ${belt.next ? belt.next.name : 'nächsten Grad'}.`, action: { type: 'lesson', tech: next.id } };
    }
    if (due.length) {
      return { icon: '🔁', title: 'Wiederholen', sub: `${due.slice(0, 3).map((t) => t.name).join(', ')}${due.length > 3 ? ' …' : ''}`, why: 'Diese Techniken waren länger nicht dran – sonst verblassen sie.', action: { type: 'review' } };
    }
    if (!conditioningThisWeek && !hardYesterday && !(gym.todayLegs)) {
      return { icon: '🔥', title: quiet ? 'Fight-Zirkel leise' : 'Kampfrunden-Simulation', sub: quiet ? '4 Runden, ohne Sprünge · ca. 20 Min' : '5 Runden à 3 Min · ca. 20 Min', why: 'Diese Woche noch keine Kondition.', action: { type: 'conditioning', circuit: quiet ? 'quiet' : 'fight' } };
    }
    const c = profile.coach;
    return { icon: '🥊', title: 'Shadowboxing', sub: `${c.rounds} × ${Math.round(c.roundSec / 60)} Min mit Coach`, why: `${week.fight.length}/${profile.fightPerWeek} Kampfsport-Einheiten diese Woche.`, action: { type: 'shadow' } };
  }

  return { icon: '⚡', title: 'Bonus', sub: 'Wochenziele erreicht – Reflex-Drill oder Mobility', why: 'Alles geschafft. Heute darf es leicht sein.', action: { type: 'reaction' } };
}

// Vorschlag ausführen
export async function runPlan(action) {
  switch (action.type) {
    case 'lesson': {
      const m = await import('./lesson.js');
      m.startLesson(action.tech);
      break;
    }
    case 'review': {
      const m = await import('./start.js');
      m.startShadow({ rounds: 3, roundSec: 120, restSec: 45, themes: ['review', 'review', 'combos'], title: 'Wiederholung' });
      break;
    }
    case 'shadow': {
      const m = await import('./start.js');
      m.startShadow({});
      break;
    }
    case 'exam': {
      const m = await import('./exam.js');
      m.openExamIntro();
      break;
    }
    case 'run': {
      const m = await import('./endurance.js');
      const { RUN_TEMPLATES } = await import('./endu-data.js');
      const tpl = RUN_TEMPLATES.find((t) => t.id === action.template);
      m.startRun({ template: tpl, minutes: action.minutes || tpl?.defMin || null, gps: getProfile().gps !== false });
      break;
    }
    case 'conditioning': {
      const m = await import('./conditioning.js');
      m.openConditioning();
      break;
    }
    case 'reaction': {
      const m = await import('./reaction.js');
      m.openReaction();
      break;
    }
    case 'mobility':
      fx.ctx.startMobilityRoutine('quick');
      break;
    default:
      break;
  }
}

export { TECH };
