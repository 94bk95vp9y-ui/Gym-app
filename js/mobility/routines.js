// Mobility-Routinen und -Protokoll: die tägliche Routine (Kern für Hüfte und
// Beine plus wechselnder Tagesfokus, passend zur eingestellten Dauer) und die
// zwei tiefen Einheiten für die Beine.
import { Store } from '../core/store.js';
import { CORE, FOCUS, DEEP, LEG_PLAN, fitToBudget, routineSeconds } from './plans.js';
import { exercise } from './library.js';

const DAY = 86400000;
export const COUNT_MIN_SECONDS = 180; // ab 3 Minuten Dehnzeit zählt ein Tag

export const weekdayIndex = (d = new Date()) => (d.getDay() + 6) % 7;
export const prepSeconds = () => Store.getSettings().mobilityPrep ?? 10;
export const mins = (sec) => `${Math.max(1, Math.round(sec / 60))} Min`;

function dedupe(items) {
  const seen = new Set();
  return items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

export function dailyRoutine(date = new Date()) {
  const focus = FOCUS[weekdayIndex(date)];
  let items = dedupe([...CORE, ...focus.items.map((x) => ({ ...x, prio: 2 }))]);
  items = fitToBudget(items, Store.getSettings().mobilityBudget || 10, prepSeconds()).filter((x) => exercise(x.id));
  return {
    id: 'daily',
    kind: 'daily',
    name: 'Tägliche Routine',
    description: `Hüfte und Beine, heute dazu: ${focus.name}.`,
    items,
  };
}

export function deepRoutines() {
  return DEEP.map((d) => ({
    ...d,
    kind: 'deep',
    name: `Tiefe Einheit · ${d.short}`,
    items: d.items.filter((x) => exercise(x.id)),
  }));
}

// Dein Beinplan: mit Gewicht und ohne (für die anderen Tage)
export function planRoutines() {
  return LEG_PLAN.map((d) => ({ ...d, kind: 'plan', items: d.items.filter((x) => exercise(x.id)) }));
}

export function routineById(id) {
  if (id === 'daily') return dailyRoutine();
  return [...planRoutines(), ...deepRoutines()].find((r) => r.id === id) || null;
}

export function routineTotal(routine) {
  return routineSeconds(routine.items, prepSeconds());
}

const counted = (s) => s.completed || (s.seconds || 0) >= COUNT_MIN_SECONDS;

export function lastSession(routineId = null) {
  const log = Store.getMobilityLog().filter(counted);
  const list = routineId ? log.filter((s) => s.routineId === routineId || (routineId === 'daily' && s.kind === 'daily')) : log;
  return list.reduce((a, b) => (!a || b.startedAt > a.startedAt ? b : a), null);
}

export function doneToday() {
  const today = new Date();
  return Store.getMobilityLog().some((s) => counted(s) && new Date(s.startedAt).toDateString() === today.toDateString());
}

// Tage mit Mobility in dieser Woche
export function weekCount() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekdayIndex(now));
  const days = new Set(Store.getMobilityLog()
    .filter((s) => counted(s) && new Date(s.startedAt) >= monday)
    .map((s) => new Date(s.startedAt).toDateString()));
  return days.size;
}

export function daysSince(iso) {
  const a = new Date();
  const b = new Date(iso);
  return Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(b.getFullYear(), b.getMonth(), b.getDate())) / DAY);
}
