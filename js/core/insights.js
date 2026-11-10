// Auswertungen für Statistik und „Heute“: Wochenreihen, Aktivität über die
// letzten Monate, Gesamtzahlen und Rekorde je Wiederholungszahl. Ohne DOM.
import { Store } from './store.js';
import {
  startOfWeek, workoutDoneSets, workoutVolume, workoutDuration, workoutPrs,
} from './training.js';

const DAY = 86400000;

function dayStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Alles, was von der Trainingsliste abhängt, wird je Stand einmal berechnet:
// die Liste bekommt bei jeder Änderung eine neue Identität.
const memo = new Map();
let memoSource = null;
function cached(key, fn) {
  const workouts = Store.getWorkouts();
  const exercises = Store.getExercises();
  if (memoSource?.w !== workouts || memoSource?.e !== exercises) {
    memo.clear();
    memoSource = { w: workouts, e: exercises };
  }
  if (!memo.has(key)) memo.set(key, fn(workouts));
  return memo.get(key);
}

function summarize(w) {
  return {
    sets: workoutDoneSets(w),
    volume: workoutVolume(w),
    minutes: workoutDuration(w) / 60000,
    prs: workoutPrs(w),
  };
}

// Kennzahlen je Training – die Grundlage für alle Reihen
function facts() {
  return cached('facts', (workouts) => workouts.map((w) => {
    const d = new Date(w.startedAt);
    return { id: w.id, time: d.getTime(), day: dayStart(d).getTime(), week: startOfWeek(d).getTime(), ...summarize(w) };
  }));
}

// Die letzten n Wochen, älteste zuerst: { from, count, sets, volume, minutes }
export function weeklySeries(n = 12, now = new Date()) {
  const monday = startOfWeek(now);
  const weeks = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i * 7);
    weeks.push({ from, count: 0, sets: 0, volume: 0, minutes: 0 });
  }
  const index = new Map(weeks.map((w, i) => [w.from.getTime(), i]));
  facts().forEach((f) => {
    const i = index.get(f.week);
    if (i === undefined) return;
    const w = weeks[i];
    w.count += 1;
    w.sets += f.sets;
    w.volume += f.volume;
    w.minutes += f.minutes;
  });
  weeks.forEach((w) => { w.minutes = Math.round(w.minutes); });
  return weeks;
}

// Aktivität je Tag über die letzten Wochen (für das Kachelraster): Spalten
// sind Wochen (älteste zuerst), Zeilen Montag bis Sonntag.
export function activityGrid(weeks = 20, now = new Date()) {
  const monday = startOfWeek(now);
  const first = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (weeks - 1) * 7);
  const today = dayStart(now).getTime();
  const byDay = new Map();
  facts().forEach((f) => {
    if (f.day < first.getTime()) return;
    const cur = byDay.get(f.day) || { sets: 0, count: 0, id: f.id };
    cur.sets += f.sets;
    cur.count += 1;
    byDay.set(f.day, cur);
  });
  const cols = [];
  let max = 0;
  for (let w = 0; w < weeks; w += 1) {
    const col = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + w * 7 + d);
      const hit = byDay.get(date.getTime());
      if (hit) max = Math.max(max, hit.sets);
      col.push({ date, future: date.getTime() > today, today: date.getTime() === today, sets: hit?.sets || 0, count: hit?.count || 0, id: hit?.id || null });
    }
    cols.push(col);
  }
  return { cols, max, first };
}

// Gesamtzahlen über alle Trainings
export function lifetime() {
  return cached('lifetime', (workouts) => {
    const list = facts();
    if (!list.length) return null;
    const total = list.reduce((a, f) => ({
      sets: a.sets + f.sets, volume: a.volume + f.volume, minutes: a.minutes + f.minutes, prs: a.prs + f.prs,
    }), { sets: 0, volume: 0, minutes: 0, prs: 0 });
    const since = workouts[workouts.length - 1].startedAt;
    const weeks = new Set(list.map((f) => f.week));
    const span = Math.max(1, Math.round((startOfWeek().getTime() - startOfWeek(new Date(since)).getTime()) / (7 * DAY)) + 1);
    return {
      count: list.length,
      sets: total.sets,
      volume: total.volume,
      minutes: Math.round(total.minutes),
      prs: total.prs,
      since,
      activeWeeks: weeks.size,
      perWeek: list.length / span,
      avgMinutes: Math.round(total.minutes / list.length),
    };
  });
}

// Längste Folge von Wochen mit erreichtem Ziel
export function bestWeekStreak(goal = Store.getSettings().weeklyGoal) {
  const counts = new Map();
  facts().forEach((f) => counts.set(f.week, (counts.get(f.week) || 0) + 1));
  const hit = [...counts.entries()].filter(([, n]) => n >= goal).map(([k]) => k).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = null;
  hit.forEach((k) => {
    // Sommer-/Winterzeit: eine Woche ist 167–169 Stunden lang
    run = prev !== null && Math.abs(k - prev - 7 * DAY) < 2 * 3600000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  });
  return best;
}

// Diese Woche gegen die vorige, jeweils bis zum selben Wochentag und zur
// selben Uhrzeit – sonst verliert die laufende Woche bis Sonntag jeden Vergleich.
export function weekCompare(now = new Date()) {
  const monday = startOfWeek(now).getTime();
  const offset = now.getTime() - monday;
  const prevMonday = startOfWeek(new Date(monday - 3 * DAY)).getTime();
  const cur = { count: 0, sets: 0, volume: 0, minutes: 0 };
  const prev = { count: 0, sets: 0, volume: 0, minutes: 0 };
  facts().forEach((f) => {
    const target = f.time >= monday ? cur : (f.time >= prevMonday && f.time - prevMonday <= offset ? prev : null);
    if (!target) return;
    target.count += 1;
    target.sets += f.sets;
    target.volume += f.volume;
    target.minutes += f.minutes;
  });
  return { cur, prev };
}

// Bestes Gewicht je Wiederholungszahl: das schwerste Gewicht, das mindestens
// so oft bewegt wurde. Wer 80 kg × 8 geschafft hat, hat damit auch 80 kg × 5.
export const REP_MARKS = [1, 3, 5, 8, 10, 12, 15];
export function repRecords(exerciseId) {
  return cached(`reps:${exerciseId}`, (workouts) => {
    const best = new Map();
    workouts.forEach((w) => {
      w.entries.forEach((e) => {
        if (e.exerciseId !== exerciseId) return;
        e.sets.forEach((s) => {
          if (!s.done || !(s.reps > 0) || !(s.weight > 0)) return;
          REP_MARKS.forEach((mark) => {
            if (s.reps < mark) return;
            const cur = best.get(mark);
            if (!cur || s.weight > cur.weight || (s.weight === cur.weight && s.reps > cur.reps)) {
              best.set(mark, { weight: s.weight, reps: s.reps, date: w.startedAt });
            }
          });
        });
      });
    });
    // Nur Marken zeigen, die etwas Eigenes aussagen: steckt dieselbe Leistung
    // auch in der nächsthöheren Marke, genügt die höhere
    const rows = REP_MARKS.filter((m) => best.has(m)).map((m) => ({ mark: m, ...best.get(m) }));
    return rows.filter((r, i) => {
      const next = rows[i + 1];
      return !next || next.weight !== r.weight || next.reps !== r.reps;
    });
  });
}

// Verlauf einer Übung in mehreren Lesarten (für die Umschaltung im Diagramm)
export function exerciseSeries(exerciseId, sideFactor = 1) {
  return cached(`series:${exerciseId}:${sideFactor}`, (workouts) => {
    const top = [];
    const volume = [];
    [...workouts].reverse().forEach((w) => {
      const sets = w.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets).filter((s) => s.done && s.reps > 0);
      if (!sets.length) return;
      const heavy = Math.max(...sets.map((s) => s.weight || 0));
      if (heavy > 0) top.push({ value: heavy, date: w.startedAt });
      const vol = sets.reduce((n, s) => n + (s.weight || 0) * s.reps, 0) * sideFactor;
      if (vol > 0) volume.push({ value: vol, date: w.startedAt });
    });
    return { top, volume };
  });
}
