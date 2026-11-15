// Pausen (krank, Urlaub …): reine Logik ohne DOM. In einer Pause zählen
// verpasste Trainings und Supplements nicht als Versäumnis – Serien reißen
// nicht, das Wochenziel sinkt, Kalender zeigen „Pause“ statt „vergessen“.
import { Store } from './store.js';
import { dayKey, shiftDay, dateOfKey, keyOf } from './days.js';

export const BREAK_KINDS = [
  { id: 'sick', label: 'Krank', icon: 'thermo' },
  { id: 'vacation', label: 'Urlaub', icon: 'sun' },
  { id: 'other', label: 'Pause', icon: 'pause' },
];

export const kindOf = (id) => BREAK_KINDS.find((k) => k.id === id) || BREAK_KINDS[2];

// Die Schleifen der Serien laufen über Hunderte Wochen und Tausende Tage:
// Pausen werden je Stand der Liste (Identität) und Tag einmal aufbereitet.
let cache = { source: null, today: null, ranges: [] };
function ranges() {
  const list = Store.getBreaks();
  const today = dayKey();
  if (cache.source !== list || cache.today !== today) {
    cache = { source: list, today, ranges: list.map((b) => ({ b, from: b.from, to: b.to ?? today })) };
  }
  return cache.ranges;
}

// Die Pause, die diesen Tag abdeckt (oder null). Laufende Pausen zählen bis
// einschließlich heute.
export function breakOn(key, breaks) {
  if (breaks) {
    const today = dayKey();
    return breaks.find((b) => b.from <= key && key <= (b.to ?? today)) || null;
  }
  const hit = ranges().find((r) => r.from <= key && key <= r.to);
  return hit ? hit.b : null;
}

// Trainings rechnen nach Kalendertag, nicht nach dem Tag mit Wechsel um 4 Uhr.
export function isTrainingPaused(date) {
  return !!breakOn(keyOf(date));
}

export function isSupplementPaused(key) {
  return breakOn(key)?.supplements === true;
}

export function currentBreak() {
  return breakOn(dayKey());
}

// Tage (0–7) der Woche Montag–Sonntag, die in einer Pause liegen
export function pausedDaysInWeek(monday) {
  let n = 0;
  for (let i = 0; i < 7; i += 1) {
    if (isTrainingPaused(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))) n += 1;
  }
  return n;
}

// Wochenziel unter Abzug der Pausentage. Ziel 0 heißt: Woche pausiert.
export function weekGoal(monday, goal) {
  const free = 7 - pausedDaysInWeek(monday);
  if (free === 7) return goal;
  if (free === 0) return 0;
  return Math.max(0, Math.round((goal * free) / 7));
}

// Anzahl Tage einer Pause (laufende bis heute)
export function breakDays(b) {
  const end = dateOfKey(b.to ?? dayKey());
  return Math.round((end - dateOfKey(b.from)) / 86400000) + 1;
}

// Die zuletzt beendete Pause, wenn sie höchstens 10 Tage zurückliegt, mindestens
// 3 Tage dauerte und danach noch kein Training stattfand – für den Hinweis
// „Erstes Training nach der Pause“.
export function recentlyBack() {
  const today = dayKey();
  const ended = Store.getBreaks().filter((b) => b.to && b.to < today).sort((a, b) => b.to.localeCompare(a.to))[0];
  if (!ended) return null;
  if (ended.to < shiftDay(today, -10) || breakDays(ended) < 3) return null;
  const after = shiftDay(ended.to, 1);
  const trained = Store.getWorkouts().some((w) => keyOf(new Date(w.startedAt)) >= after);
  return trained ? null : ended;
}
