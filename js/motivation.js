// Standortbestimmung für den Start-Tab.
//
// Zahlen allein motivieren nicht – ein Urteil tut es. Deshalb wird aus der
// Historie genau eine Einschätzung abgeleitet, dazu die Belege (Wochenziel,
// Kraftentwicklung) und ein einziger konkreter Satz, der sagt, was als
// Nächstes zu tun ist. Der unangenehme Fall wird dabei nicht weichgespült:
// eine Übung, die seit Wochen steht, wird beim Namen genannt.

import { estimate1RM } from './utils.js';
import { fatigueOf, muscleGroupLookup } from './fatigue.js';

const DAY = 86400000;
const WEEK = 7 * DAY;

export function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Woche beginnt Montag
  return d;
}

// Beste Leistung je Trainingseinheit für eine Übung, aufsteigend nach Datum,
// mitsamt der Vorbelastung (siehe fatigue.js).
function sessionsFor(workouts, exerciseId, groupOf) {
  return workouts
    .map((w) => {
      const entryIndex = w.entries.findIndex(
        (e) => e.exerciseId === exerciseId && e.sets.some((s) => s.done && s.weight > 0 && s.reps > 0),
      );
      if (entryIndex < 0) return null;
      const sets = w.entries[entryIndex].sets.filter((s) => s.done && s.weight > 0 && s.reps > 0);
      const best = sets.reduce((a, s) => (estimate1RM(s.weight, s.reps) > estimate1RM(a.weight, a.reps) ? s : a));
      return {
        date: new Date(w.startedAt).getTime(),
        e1rm: estimate1RM(best.weight, best.reps),
        weight: best.weight,
        reps: best.reps,
        bucket: fatigueOf(w, entryIndex, groupOf).bucket,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

// Sucht eine Vorbelastung, die in beiden Zeiträumen vorkommt – bevorzugt die
// der jüngsten Einheit. Gibt es keine, sind die Zeiträume schlicht nicht
// vergleichbar; dann wird lieber gar nichts behauptet, als eine verschobene
// Reihenfolge als Kraftverlust auszugeben.
function sharedBucket(recent, older) {
  const preferred = [recent[recent.length - 1].bucket, ...new Set(recent.map((s) => s.bucket))];
  return preferred.find((b) => recent.some((s) => s.bucket === b) && older.some((s) => s.bucket === b)) || null;
}

// Vergleicht die letzten 4 Wochen mit den 4 Wochen davor. Ein gleitender
// Vergleich statt "gegen die Bestleistung aller Zeiten": nach einer Pause
// oder Deload-Woche ist man sonst für immer im Minus.
function strengthTrend(workouts, exercises, now, groupOf) {
  const cut4 = now - 4 * WEEK;
  const cut8 = now - 8 * WEEK;
  let up = 0;
  let flat = 0;
  let down = 0;
  let best = null;

  exercises.forEach((ex) => {
    const sessions = sessionsFor(workouts, ex.id, groupOf);
    let recent = sessions.filter((s) => s.date >= cut4);
    let older = sessions.filter((s) => s.date >= cut8 && s.date < cut4);
    if (!recent.length || !older.length) return;

    // Nur bei vergleichbarer Vorbelastung urteilen, sonst gar nicht.
    const bucket = sharedBucket(recent, older);
    if (!bucket) return;
    recent = recent.filter((s) => s.bucket === bucket);
    older = older.filter((s) => s.bucket === bucket);

    const recentMax = Math.max(...recent.map((s) => s.e1rm));
    const olderMax = Math.max(...older.map((s) => s.e1rm));
    const delta = recentMax - olderMax;
    const tolerance = olderMax * 0.01;

    if (delta > tolerance) {
      up += 1;
      if (!best || delta > best.delta) best = { name: ex.name, delta: Math.round(delta * 10) / 10 };
    } else if (delta < -tolerance) {
      down += 1;
    } else {
      flat += 1;
    }
  });

  return { up, flat, down, best, comparable: up + flat + down };
}

// Übungen, die zwar weiter trainiert werden, aber seit Wochen keinen neuen
// Bestwert mehr gesehen haben – das sind die Kandidaten für mehr Gewicht.
function stagnatingLifts(workouts, exercises, now, stepFor, groupOf) {
  const result = [];
  exercises.forEach((ex) => {
    const all = sessionsFor(workouts, ex.id, groupOf);
    if (all.length < 3) return;
    // Nur mit Einheiten unter gleicher Vorbelastung vergleichen: ein alter
    // Bestwert aus frischem Zustand darf keine Stagnation melden, wenn die
    // Übung seither ans Ende des Trainings gerutscht ist.
    const last = all[all.length - 1];
    const sessions = all.filter((s) => s.bucket === last.bucket);
    if (sessions.length < 3) return; // zu wenig Vergleichbares für den Vorwurf
    const bestSession = sessions.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    const weeks = Math.floor((now - bestSession.date) / WEEK);
    if (weeks < 3 || last.date < now - 3 * WEEK) return;
    const step = stepFor(ex);
    result.push({
      name: ex.name,
      weeks,
      weight: bestSession.weight,
      next: Math.round((bestSession.weight + step) * 10) / 10,
    });
  });
  return result.sort((a, b) => b.weeks - a.weeks);
}

function weeklyCounts(workouts) {
  const counts = new Map();
  workouts.forEach((w) => {
    const key = startOfWeek(new Date(w.startedAt)).getTime();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

// Wochen in Folge, in denen das Ziel erreicht wurde. Die laufende Woche zählt
// erst mit, wenn das Ziel dort schon steht – sonst würde die Serie eine noch
// gar nicht geleistete Woche mitzählen.
function goalStreak(counts, goal, now) {
  let cursor = startOfWeek(new Date(now));
  let streak = 0;
  if ((counts.get(cursor.getTime()) || 0) >= goal) streak += 1;
  for (;;) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
    if ((counts.get(cursor.getTime()) || 0) < goal) break;
    streak += 1;
  }
  return streak;
}

function volumeOf(workout) {
  return workout.entries.reduce(
    (sum, e) => sum + e.sets.filter((s) => s.done).reduce((n, s) => n + (s.weight || 0) * (s.reps || 0), 0),
    0,
  );
}

const VERDICTS = {
  start: { label: 'LEG LOS', tone: 'neutral' },
  cold: { label: 'EINGEROSTET', tone: 'bad' },
  slipping: { label: 'NACHGELASSEN', tone: 'bad' },
  stall: { label: 'STAGNATION', tone: 'warn' },
  solid: { label: 'SOLIDE', tone: 'neutral' },
  strong: { label: 'STARK', tone: 'good' },
};

export function buildMotivation({ workouts, exercises, goal = 3, unit = 'kg', stepFor, now = Date.now() }) {
  const finished = workouts.filter((w) => w.finishedAt);
  const counts = weeklyCounts(finished);
  const weekStart = startOfWeek(new Date(now));
  const thisWeek = finished.filter((w) => new Date(w.startedAt) >= weekStart);
  const lastWeekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7);
  const lastWeek = finished.filter((w) => {
    const d = new Date(w.startedAt);
    return d >= lastWeekStart && d < weekStart;
  });

  const days = Array.from({ length: 7 }, () => false);
  thisWeek.forEach((w) => { days[(new Date(w.startedAt).getDay() + 6) % 7] = true; });

  const lastWorkout = finished.reduce(
    (latest, w) => (!latest || new Date(w.startedAt) > new Date(latest.startedAt) ? w : latest),
    null,
  );
  const daysSinceLast = lastWorkout
    ? Math.floor((now - new Date(lastWorkout.startedAt).getTime()) / DAY)
    : null;

  const groupOf = muscleGroupLookup(exercises);
  const trend = strengthTrend(finished, exercises, now, groupOf);
  const stagnating = stagnatingLifts(finished, exercises, now, stepFor, groupOf);
  const streak = goalStreak(counts, goal, now);
  const last14 = finished.filter((w) => new Date(w.startedAt).getTime() >= now - 14 * DAY).length;

  let key = 'solid';
  if (finished.length < 3) key = 'start';
  else if (daysSinceLast >= 10) key = 'cold';
  else if (last14 < goal) key = 'slipping';
  else if (trend.up === 0 && (trend.comparable >= 1 || stagnating.length)) key = 'stall';
  else if (trend.up > trend.down) key = 'strong';

  return {
    verdict: { key, ...VERDICTS[key] },
    week: {
      count: thisWeek.length,
      goal,
      days,
      todayIndex: (new Date(now).getDay() + 6) % 7,
      volume: thisWeek.reduce((s, w) => s + volumeOf(w), 0),
      lastWeekVolume: lastWeek.reduce((s, w) => s + volumeOf(w), 0),
    },
    streak,
    trend,
    stagnating,
    daysSinceLast,
    coachLine: coachLine({ key, daysSinceLast, stagnating, thisWeek, goal, trend, unit, now, last14 }),
  };
}

function num(value) {
  return String(value).replace('.', ',');
}

// Genau ein Satz – der, der gerade am meisten zählt. Reihenfolge nach
// Dringlichkeit: erst was schiefläuft, dann was ansteht, dann das Lob.
function coachLine({ key, daysSinceLast, stagnating, thisWeek, goal, trend, unit, now, last14 }) {
  const nbsp = ' ';
  const weight = (v) => `${num(v)}${nbsp}${unit}`;

  if (key === 'start') {
    return thisWeek.length
      ? 'Guter Anfang. Drei Einheiten, dann wird daraus eine Gewohnheit.'
      : 'Noch keine Historie. Das erste Training ist das, auf das es ankommt.';
  }
  if (key === 'cold') {
    return `${daysSinceLast} Tage nichts. Kraft verlierst du schneller, als du sie aufbaust.`;
  }
  if (key === 'slipping') {
    return last14 === 1
      ? 'Eine Einheit in zwei Wochen. Zu wenig, um besser zu werden.'
      : `Nur ${last14} Einheiten in zwei Wochen. Zu wenig, um besser zu werden.`;
  }

  const stuck = stagnating[0];
  if (stuck) {
    return `${stuck.name} steht seit ${stuck.weeks} Wochen bei ${weight(stuck.weight)}. `
      + `Nächstes Mal ${weight(stuck.next)} auflegen.`;
  }

  const missing = goal - thisWeek.length;
  const daysLeft = 7 - ((new Date(now).getDay() + 6) % 7);
  // Nur mahnen, wenn die Woche wirklich eng wird – am Montag ist "noch 3
  // Einheiten" keine Nachricht, sondern eine Selbstverständlichkeit.
  if (missing > daysLeft) {
    return `${missing} Einheiten fehlen, ${daysLeft} Tage bleiben. Wird eng.`;
  }
  if (trend.best) {
    return `${trend.best.name} ist ${weight(trend.best.delta)} stärker als vor vier Wochen. Genau so weiter.`;
  }
  if (missing > 0) {
    return missing === 1
      ? 'Noch eine Einheit, dann steht die Woche.'
      : `Noch ${missing} Einheiten, dann steht die Woche.`;
  }
  return 'Wochenziel steht. Jetzt geht es ums Gewicht auf der Stange.';
}
