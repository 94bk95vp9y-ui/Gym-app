// Trainingslogik ohne DOM: Vorschläge, Rekorde, Statistik, Plan-Rotation.
import { Store, uid } from './store.js';
import { fatigueOf, muscleGroupLookup } from './fatigue.js';
import { estimate1RM, bestSet, setScore } from './format.js';

const DAY = 86400000;

// ---------- Gewichts-Empfehlung ----------
// Klassische Doppelprogression: wer eine Übung in den letzten 2 Einheiten bei
// GLEICHEM Gewicht durchweg mit 10+ Wiederholungen geschafft hat, ist bereit
// für mehr. Große Grundübungen bekommen einen größeren Sprung.
export const OVERLOAD_REP_THRESHOLD = 10;
const BIG_LIFT_GROUPS = ['Beine', 'Rücken', 'Brust'];

export function overloadStep(muscleGroup, unit) {
  const big = BIG_LIFT_GROUPS.includes(muscleGroup);
  if (unit === 'lb') return big ? 10 : 5;
  return big ? 5 : 2.5;
}

// Letzte abgeschlossene Einheit, in der diese Übung wirklich trainiert wurde –
// samt Trainingskontext, um die Vorbelastung bestimmen zu können.
export function lastSessionFor(exerciseId, excludeWorkoutId) {
  for (const w of Store.getWorkouts()) {
    if (w.id === excludeWorkoutId) continue;
    const entryIndex = w.entries.findIndex((e) => e.exerciseId === exerciseId && e.sets.some((s) => s.done));
    if (entryIndex >= 0) return { workout: w, entryIndex, entry: w.entries[entryIndex] };
  }
  return null;
}

export function overloadSuggestion(exercise, excludeWorkoutId) {
  if (!exercise) return null;
  const settings = Store.getSettings();
  if (!settings.progressiveOverload) return null;
  const groupOf = muscleGroupLookup(Store.getExercises());
  const candidates = [];
  for (const w of Store.getWorkouts()) {
    if (w.id === excludeWorkoutId) continue;
    const entryIndex = w.entries.findIndex((e) => e.exerciseId === exercise.id && e.sets.some((s) => s.done));
    if (entryIndex >= 0) candidates.push({ entry: w.entries[entryIndex], bucket: fatigueOf(w, entryIndex, groupOf).bucket });
    if (candidates.length >= 6) break;
  }
  if (candidates.length < 2) return null;

  // Nur Einheiten mit vergleichbarer Vorbelastung heranziehen.
  const sameBucket = candidates.filter((c) => c.bucket === candidates[0].bucket);
  const sessions = (sameBucket.length >= 2 ? sameBucket : candidates).slice(0, 2).map((c) => c.entry);

  const analyzed = sessions.map((entry) => {
    const done = entry.sets.filter((s) => s.done && s.weight > 0);
    if (!done.length) return null;
    const weight = done[0].weight;
    const sameWeight = done.every((s) => s.weight === weight);
    const hit = done.every((s) => s.reps >= OVERLOAD_REP_THRESHOLD);
    return sameWeight && hit ? { weight } : null;
  });
  if (!analyzed[0] || !analyzed[1] || analyzed[0].weight !== analyzed[1].weight) return null;

  const step = overloadStep(exercise.muscleGroup, settings.unit);
  return { from: analyzed[0].weight, to: Math.round((analyzed[0].weight + step) * 10) / 10, threshold: OVERLOAD_REP_THRESHOLD };
}

// ---------- Sätze vorbereiten ----------
// Satzzahl laut Plan. Ältere Pläne speichern nicht für jede Übung eine Zahl –
// dort galten 2 Sätze.
export function plannedSets(routine, exerciseId) {
  return routine?.setCounts?.[exerciseId] ?? 2;
}

// Werte vom letzten Mal, Satz für Satz (grau als Vorschlag, bis bestätigt).
// Ist die Gewichts-Empfehlung fällig, steht direkt das neue Gewicht drin –
// mit den Wiederholungen, die bei gleicher Leistung (geschätztes 1RM) zu
// erwarten sind, statt der alten Zahl.
export function defaultSets(exercise, excludeWorkoutId, count) {
  const last = lastSessionFor(exercise.id, excludeWorkoutId);
  const lastDone = last ? last.entry.sets.filter((s) => s.done && s.reps > 0) : [];
  const overload = overloadSuggestion(exercise, excludeWorkoutId);
  const total = Math.max(1, count ?? Math.min(8, lastDone.length || 3));
  return Array.from({ length: total }, (_, i) => {
    const src = lastDone[Math.min(i, lastDone.length - 1)];
    if (!src) return { weight: 0, reps: 0, done: false, suggested: false };
    if (overload && src.weight > 0) {
      const reps = Math.max(1, Math.floor(30 * (estimate1RM(src.weight, src.reps) / overload.to - 1)));
      return { weight: overload.to, reps: Math.min(src.reps, reps), done: false, suggested: true };
    }
    return { weight: src.weight, reps: src.reps, done: false, suggested: true };
  });
}

export function newEntry(exercise, workoutId, count) {
  return { exerciseId: exercise.id, exerciseName: exercise.name, sets: defaultSets(exercise, workoutId, count) };
}

export function workoutFromRoutine(routine) {
  const id = uid();
  const entries = routine.exerciseIds.map((eid) => {
    const ex = Store.getExercise(eid);
    return ex ? newEntry(ex, id, plannedSets(routine, eid)) : null;
  }).filter(Boolean);
  return { id, routineId: routine.id, routineName: routine.name, startedAt: new Date().toISOString(), finishedAt: null, entries };
}

export function blankWorkout() {
  return { id: uid(), routineId: null, routineName: null, startedAt: new Date().toISOString(), finishedAt: null, entries: [] };
}

// ---------- Rekorde ----------
// Ausgezeichnet wird der beste abgeschlossene Satz dieser Einheit – aber nur,
// wenn er alles übertrifft, was für die Übung schon im Verlauf steht. Ohne
// Verlauf gibt es nichts zu schlagen, sonst wäre beim ersten Training jede
// Übung ein Rekord. Zusatzgewicht zählt über das geschätzte 1RM, reines
// Körpergewicht über die Wiederholungen.
const bestCache = new Map();
let bestCacheSource = null;
function historyBest(exerciseId, excludeWorkoutId) {
  // Die Liste wird bei jeder Änderung neu erzeugt – ihre Identität zeigt,
  // ob der Zwischenspeicher noch stimmt.
  if (Store.getWorkouts() !== bestCacheSource) {
    bestCache.clear();
    bestCacheSource = Store.getWorkouts();
  }
  const key = `${exerciseId}|${excludeWorkoutId}`;
  if (bestCache.has(key)) return bestCache.get(key);
  const best = { load: 0, reps: 0, any: false };
  Store.getWorkouts().forEach((w) => {
    if (w.id === excludeWorkoutId) return;
    w.entries.forEach((e) => {
      if (e.exerciseId !== exerciseId) return;
      e.sets.forEach((s) => {
        const score = setScore(s);
        if (!score) return;
        best.any = true;
        best[score.kind] = Math.max(best[score.kind], score.value);
      });
    });
  });
  bestCache.set(key, best);
  return best;
}

// Gibt den Index des Rekordsatzes zurück (oder -1).
export function refreshPrFlags(workout, ei) {
  const entry = workout.entries[ei];
  const hist = historyBest(entry.exerciseId, workout.id);
  const best = { load: hist.load, reps: hist.reps };
  const winner = { load: -1, reps: -1 };
  entry.sets.forEach((set, i) => {
    set.pr = false;
    const score = hist.any ? setScore(set) : null;
    if (!score || score.value <= best[score.kind]) return;
    best[score.kind] = score.value;
    winner[score.kind] = i;
  });
  const index = winner.load >= 0 ? winner.load : winner.reps;
  if (index >= 0) entry.sets[index].pr = true;
  return index;
}

// ---------- Kennzahlen eines Trainings ----------
export function isEntryComplete(entry) {
  return entry.sets.length > 0 && entry.sets.every((s) => s.done);
}

export function workoutProgress(workout) {
  const total = workout.entries.reduce((n, e) => n + e.sets.length, 0);
  const done = workout.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return { done, total, ratio: total ? done / total : 0 };
}

export function workoutDoneSets(workout) {
  return workout.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
}

export function workoutVolume(workout) {
  return workout.entries.reduce((sum, e) =>
    sum + e.sets.filter((s) => s.done).reduce((n, s) => n + (s.weight || 0) * (s.reps || 0), 0), 0);
}

export function workoutDuration(workout) {
  return Math.max(0, new Date(workout.finishedAt || Date.now()) - new Date(workout.startedAt));
}

export function workoutPrs(workout) {
  return workout.entries.reduce((n, e) => n + e.sets.filter((s) => s.done && s.pr).length, 0);
}

// Aktuelle Übungsnamen: im Verlauf steht der Name, der beim Speichern galt.
// Wurde eine Übung später umbenannt, soll überall der neue Name erscheinen.
export function exerciseNames() {
  return new Map(Store.getExercises().map((e) => [e.id, e.name]));
}

export function entryName(entry, names = exerciseNames()) {
  return names.get(entry.exerciseId) || entry.exerciseName || 'Übung';
}

// ---------- Pläne ----------
// Welcher Plan ist als Nächstes dran? Betrachtet werden Pläne, die in den
// letzten 30 Tagen trainiert wurden (die aktuelle Rotation). Dran ist der,
// dessen letzte Einheit am längsten her ist; ohne Rotation der am längsten
// nicht (oder noch nie) trainierte.
export function lastDoneMap(workouts = Store.getWorkouts()) {
  const lastDone = new Map();
  workouts.forEach((w) => {
    if (w.routineId && !lastDone.has(w.routineId)) lastDone.set(w.routineId, w.startedAt);
  });
  return lastDone;
}

export function nextPlan(routines = Store.getRoutines(), workouts = Store.getWorkouts()) {
  if (!routines.length) return null;
  const lastDone = lastDoneMap(workouts);
  const cutoff = new Date(Date.now() - 30 * DAY).toISOString();
  const rotation = routines.filter((r) => lastDone.has(r.id) && lastDone.get(r.id) >= cutoff);
  if (rotation.length >= 2) {
    return rotation.reduce((a, b) => (lastDone.get(b.id) < lastDone.get(a.id) ? b : a));
  }
  return [...routines].sort((a, b) => (lastDone.get(a.id) || '').localeCompare(lastDone.get(b.id) || ''))[0];
}

// Die Muskelgruppen eines Plans, häufigste zuerst – für die Chips
export function planMuscles(routine, limit = 3) {
  const count = new Map();
  routine.exerciseIds.forEach((id) => {
    const g = Store.getExercise(id)?.muscleGroup;
    if (g && g !== 'Sonstiges') count.set(g, (count.get(g) || 0) + 1);
  });
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([g]) => g);
}

// Dauer eines Plans: wie lange er zuletzt gedauert hat
export function planMinutes(routine) {
  const w = Store.getWorkouts().find((x) => x.routineId === routine.id);
  return w ? Math.round(workoutDuration(w) / 60000) : null;
}

// Weicht das Training vom Plan ab (andere Übungen, Reihenfolge oder Satzzahl)?
export function planDiff(workout, routine) {
  if (!routine) return null;
  const ids = workout.entries.map((e) => e.exerciseId);
  const added = ids.filter((id) => !routine.exerciseIds.includes(id)).length;
  const removed = routine.exerciseIds.filter((id) => !ids.includes(id)).length;
  const kept = ids.filter((id) => routine.exerciseIds.includes(id));
  const order = kept.join('|') !== routine.exerciseIds.filter((id) => ids.includes(id)).join('|');
  const sets = workout.entries.filter((e) => routine.exerciseIds.includes(e.exerciseId)
    && e.sets.length !== plannedSets(routine, e.exerciseId)).length;
  const changed = added || removed || order || sets;
  return changed ? { added, removed, order, sets } : null;
}

export function routineFromWorkout(workout, base = null) {
  const ids = [];
  const setCounts = {};
  workout.entries.forEach((e) => {
    if (ids.includes(e.exerciseId)) return;
    ids.push(e.exerciseId);
    setCounts[e.exerciseId] = Math.max(1, Math.min(12, e.sets.length || 3));
  });
  return {
    ...(base || {}),
    id: base?.id || uid(),
    name: base?.name || workout.routineName || 'Neuer Plan',
    exerciseIds: ids,
    setCounts,
  };
}

// ---------- Übungs-Statistik ----------
// Verlauf einer Übung für Chart und Kennzahlen. Mit Zusatzgewicht zählt das
// geschätzte 1RM des besten Satzes je Einheit; bei reinen Körpergewichts-
// übungen die meisten Wiederholungen.
export function exerciseHistory(exerciseId) {
  const sessions = [];
  Store.getWorkouts().forEach((w) => {
    const sets = w.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
    const top = bestSet(sets);
    if (top) sessions.push({ workout: w, date: w.startedAt, sets, top });
  });
  const loaded = sessions.some((s) => s.top.weight > 0);
  const relevant = sessions.filter((s) => (loaded ? s.top.weight > 0 : true));
  const value = (s) => (loaded ? estimate1RM(s.top.weight, s.top.reps) : s.top.reps);
  const points = [...relevant].reverse().map((s) => ({ value: value(s), date: s.date }));
  const best = relevant.length ? relevant.reduce((a, b) => (value(b) > value(a) ? b : a)) : null;
  return { sessions, loaded, points, best, bestValue: best ? value(best) : 0 };
}

export function lastPerformanceMap() {
  const map = new Map();
  Store.getWorkouts().forEach((w) => {
    w.entries.forEach((e) => {
      if (map.has(e.exerciseId)) return;
      const best = bestSet(e.sets);
      if (best) map.set(e.exerciseId, { best, date: w.startedAt });
    });
  });
  return map;
}

export function recentRecords(days = 30, limit = 6) {
  const from = Date.now() - days * DAY;
  const names = exerciseNames();
  const seen = new Set();
  const out = [];
  for (const w of Store.getWorkouts()) {
    if (new Date(w.startedAt).getTime() < from) break;
    for (const e of w.entries) {
      if (seen.has(e.exerciseId)) continue;
      const prs = e.sets.filter((s) => s.done && s.pr);
      if (!prs.length) continue;
      seen.add(e.exerciseId);
      out.push({ id: e.exerciseId, name: entryName(e, names), set: bestSet(prs) || prs[0], date: w.startedAt });
    }
  }
  return out.slice(0, limit);
}

// Die meisttrainierten Übungen der letzten Monate mit ihrer Entwicklung.
export function keyLifts(limit = 6) {
  const from = Date.now() - 120 * DAY;
  const count = new Map();
  Store.getWorkouts().forEach((w) => {
    if (new Date(w.startedAt).getTime() < from) return;
    w.entries.forEach((e) => {
      if (e.sets.some((s) => s.done && s.reps > 0)) count.set(e.exerciseId, (count.get(e.exerciseId) || 0) + 1);
    });
  });
  return [...count.entries()]
    .filter(([id, n]) => n >= 2 && Store.getExercise(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => {
      const ex = Store.getExercise(id);
      const { loaded, points } = exerciseHistory(id);
      const last = points[points.length - 1];
      const since = Date.now() - 56 * DAY;
      const base = points.find((p) => new Date(p.date).getTime() >= since) || points[0];
      return { ex, loaded, points: points.slice(-12), value: last?.value || 0, delta: last && base ? last.value - base.value : 0 };
    });
}

// ---------- Woche ----------
export function startOfWeek(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function weekInfo(now = new Date()) {
  const monday = startOfWeek(now);
  const week = Store.getWorkouts().filter((w) => new Date(w.startedAt) >= monday);
  const days = Array(7).fill(false);
  week.forEach((w) => { days[(new Date(w.startedAt).getDay() + 6) % 7] = true; });
  return {
    workouts: week,
    count: week.length,
    days,
    todayIndex: (now.getDay() + 6) % 7,
    sets: week.reduce((n, w) => n + workoutDoneSets(w), 0),
    volume: week.reduce((n, w) => n + workoutVolume(w), 0),
    minutes: Math.round(week.reduce((n, w) => n + workoutDuration(w), 0) / 60000),
  };
}

// Wochen in Folge mit erreichtem Ziel. Die laufende Woche zählt erst mit,
// wenn das Ziel dort schon steht.
export function weekStreak(goal = Store.getSettings().weeklyGoal) {
  const counts = new Map();
  Store.getWorkouts().forEach((w) => {
    const key = startOfWeek(new Date(w.startedAt)).getTime();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  let cursor = startOfWeek();
  let streak = (counts.get(cursor.getTime()) || 0) >= goal ? 1 : 0;
  for (let guard = 0; guard < 520; guard += 1) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
    if ((counts.get(cursor.getTime()) || 0) < goal) break;
    streak += 1;
  }
  return streak;
}

// Trainings pro Woche, die letzten n Wochen (älteste zuerst)
export function weeklyCounts(n = 8) {
  const out = [];
  const monday = startOfWeek();
  for (let i = n - 1; i >= 0; i -= 1) {
    const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i * 7);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    const count = Store.getWorkouts().filter((w) => {
      const d = new Date(w.startedAt);
      return d >= from && d < to;
    }).length;
    out.push({ from, count });
  }
  return out;
}

// Harte Sätze pro Muskelgruppe in den letzten 7 Tagen. Etwa 10–20 Sätze pro
// Muskel und Woche bringen den meisten Muskelaufbau (Dosis-Wirkungs-
// Metaanalysen, z. B. Schoenfeld et al. 2017).
export const SET_TARGET_MIN = 10;
export const SET_TARGET_MAX = 20;
export const MUSCLE_MAP_GROUPS = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Unterarme', 'Bauch', 'Beine', 'Po', 'Waden'];

export function weeklySets(days = 7) {
  const groupOf = new Map(Store.getExercises().map((e) => [e.id, e.muscleGroup]));
  const from = Date.now() - days * DAY;
  const out = Object.fromEntries(MUSCLE_MAP_GROUPS.map((g) => [g, 0]));
  Store.getWorkouts().forEach((w) => {
    if (new Date(w.startedAt).getTime() < from) return;
    w.entries.forEach((e) => {
      const g = groupOf.get(e.exerciseId);
      if (!(g in out)) return;
      out[g] += e.sets.filter((s) => s.done && (s.reps > 0 || s.weight > 0)).length;
    });
  });
  return out;
}

export function isSameDay(iso, ref = new Date()) {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}
