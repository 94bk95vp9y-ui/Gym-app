// Zustand des Mobility-Bereichs: Profil (Ziele, Zeitbudget, tiefe Einheiten,
// Bewertungen, Varianten), Tagesplan, Wochenminuten pro Region, Serien und
// die Übernahme der Daten aus der ersten Mobility-Version.

import { Store } from '../storage.js';
import { exercise, REGIONS } from './library.js';
import {
  CORE, FOCUS, DEEP, SITUATIONS, PROGRAM, PROGRAM_WEEKS, programPhase, fitToBudget,
  CHECK_INTERVAL_DAYS, CORE_CHECKS,
} from './plans.js';

export const DAY = 86400000;
export const COUNT_MIN_SECONDS = 180; // ab 3 Minuten Dehnzeit zählt ein Tag
export const TARGET_BASE = 300; // 5 Minuten pro Region und Woche
export const TARGET_FOCUS = 600; // 10 Minuten für die Regionen deiner Ziele

export const weekdayIndex = (d = new Date()) => (d.getDay() + 6) % 7;
export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function startOfDay(d = new Date()) { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); }
export function mondayOf(d = new Date()) { const x = startOfDay(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate() - weekdayIndex(x)); }

// ---------- Profil ----------
function defaultProfile() {
  const today = startOfDay().toISOString();
  return {
    v: 1,
    created: today,
    budget: 10,
    deepPerWeek: 2,
    deepDays: [2, 5], // Mittwoch und Samstag
    goals: { kicks: { start: today }, squat: { start: today } },
    ratings: {},
    levels: {},
    skip: {},
  };
}

export function getProfile() {
  let p = Store.getMobilityProfile();
  if (!p) {
    p = defaultProfile();
    Store.saveMobilityProfile(p);
  }
  const d = defaultProfile();
  return {
    ...d, ...p, goals: { ...(p.goals || {}) }, ratings: { ...(p.ratings || {}) }, levels: { ...(p.levels || {}) }, skip: { ...(p.skip || {}) },
  };
}
export function saveProfile(patch) {
  const p = { ...getProfile(), ...patch };
  Store.saveMobilityProfile(p);
  return p;
}
export function prepSeconds() { return Store.getSettings().mobilityPrep ?? 10; }

// ---------- Programme ----------
export function activePrograms(p = getProfile()) {
  return Object.entries(p.goals || {}).map(([id, g]) => {
    const program = PROGRAM[id];
    if (!program) return null;
    const days = Math.max(0, Math.floor((startOfDay() - startOfDay(new Date(g.start))) / DAY));
    const week = Math.min(PROGRAM_WEEKS, Math.floor(days / 7) + 1);
    return { program, start: g.start, days, week, phase: programPhase(program, week), finished: days >= PROGRAM_WEEKS * 7 };
  }).filter(Boolean);
}
export function startProgram(id) {
  const p = getProfile();
  const goals = { ...p.goals, [id]: { start: startOfDay().toISOString() } };
  // höchstens zwei Ziele gleichzeitig – sonst verwässert es
  const ids = Object.keys(goals);
  while (ids.length > 2) delete goals[ids.shift()];
  return saveProfile({ goals });
}
export function stopProgram(id) {
  const p = getProfile();
  const goals = { ...p.goals };
  delete goals[id];
  return saveProfile({ goals });
}

// ---------- Varianten & Bewertungen ----------
// levels: Basis-Übung -> gewählte (meist schwerere) Variante
export function applyLevels(items, p = getProfile()) {
  return items.map((x) => {
    const to = p.levels?.[x.id];
    return to && exercise(to) ? { ...x, id: to, from: x.id } : x;
  });
}
export function applySkip(items, p = getProfile()) {
  const today = dayKey();
  const skipped = new Set(Object.entries(p.skip || {}).filter(([, d]) => d === today).map(([r]) => r));
  if (!skipped.size) return items;
  return items.filter((x) => !skipped.has(exercise(x.id)?.regions?.[0]));
}
export function skipRegionToday(region) {
  const p = getProfile();
  saveProfile({ skip: { ...p.skip, [region]: dayKey() } });
}

// r: 1 = zu leicht, 0 = passt, -1 = zu schwer
export function recordRatings(list) {
  const p = getProfile();
  const ratings = { ...p.ratings };
  list.forEach(({ id, r }) => {
    ratings[id] = [...(ratings[id] || []), r].slice(-6);
  });
  saveProfile({ ratings });
  return suggestionsFrom(list.map((x) => x.id), { ...p, ratings });
}

// Vorschläge nach der Einheit: dreimal zu leicht -> schwerere Variante,
// zweimal zu schwer -> leichtere
function suggestionsFrom(ids, p) {
  const out = [];
  ids.forEach((id) => {
    const r = p.ratings[id] || [];
    const ex = exercise(id);
    if (!ex) return;
    const base = Object.keys(p.levels).find((b) => p.levels[b] === id);
    if (r.length >= 3 && r.slice(-3).every((v) => v === 1) && exercise(ex.up)) {
      out.push({ dir: 'up', base: base || id, from: id, to: ex.up });
    } else if (r.length >= 2 && r.slice(-2).every((v) => v === -1)) {
      if (base) out.push({ dir: 'down', base, from: id, to: base });
      else if (exercise(ex.down)) out.push({ dir: 'down', base: id, from: id, to: ex.down });
    }
  });
  return out;
}
export function setLevel(base, to) {
  const p = getProfile();
  const levels = { ...p.levels };
  if (!to || to === base) delete levels[base]; else levels[base] = to;
  // Bewertungen der neuen Übung starten frisch
  const ratings = { ...p.ratings };
  delete ratings[to];
  saveProfile({ levels, ratings });
}

// ---------- Routinen ----------
const OLD_BUILTIN = ['daily', 'quick', 'warmup', 'deep'];
export function customRoutines() {
  return (Store.getMobilityRoutines() || []).filter((r) => !r.builtin && !OLD_BUILTIN.includes(r.id) && Array.isArray(r.items));
}
export function saveCustomRoutines(list) {
  Store.saveMobilityRoutines(list.map((r) => ({ ...r, custom: true })));
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

export function dailyRoutine(date = new Date(), p = getProfile()) {
  const focus = FOCUS[weekdayIndex(date)];
  const extras = activePrograms(p).filter((a) => !a.finished)
    .flatMap((a) => a.phase.daily.map((x) => ({ ...x, prio: 2, goal: a.program.id })));
  let items = dedupe([...CORE, ...focus.items.map((x) => ({ ...x, prio: 2, focus: true })), ...extras]);
  items = applySkip(applyLevels(items, p), p);
  items = fitToBudget(items, p.budget, prepSeconds());
  return {
    id: 'daily',
    kind: 'daily',
    name: 'Tägliche Routine',
    short: 'Täglich',
    focus,
    items,
    description: `Kern für Hüfte & Beine – jeden Tag gleich. Dazu heute: ${focus.name}.`,
  };
}

export function deepRoutine(id, p = getProfile()) {
  const d = DEEP.find((x) => x.id === id) || DEEP[0];
  return { ...d, kind: 'deep', items: applySkip(applyLevels(d.items, p), p) };
}
export function situationRoutine(id, p = getProfile()) {
  const s = SITUATIONS.find((x) => x.id === id);
  if (!s) return null;
  return { ...s, kind: 'situation', items: applySkip(applyLevels(s.items, p), p) };
}
export function customRoutine(id) {
  const r = customRoutines().find((x) => x.id === id);
  return r ? { ...r, kind: 'custom', items: r.items.filter((x) => exercise(x.id)) } : null;
}
export function routineById(id) {
  if (id === 'daily') return dailyRoutine();
  if (DEEP.some((d) => d.id === id)) return deepRoutine(id);
  return situationRoutine(id) || customRoutine(id);
}

// ---------- Protokoll ----------
// Alte Einheiten (erste Version) hatten keine Regionen – Schätzung aus den
// damaligen Standard-Routinen, anteilig zur tatsächlichen Dehnzeit.
const LEGACY = {
  daily: [['ninety-switch', 60], ['hip-flexor', 45], ['pigeon', 45], ['frog', 60], ['hamstring-supine', 45], ['deep-squat', 60], ['calf-wall', 30]],
  quick: [['hip-flexor', 40], ['forward-fold', 40], ['pigeon', 40], ['deep-squat', 45]],
  warmup: [['leg-swing', 30], ['hip-circles', 30], ['worlds-greatest', 40], ['cossack', 45], ['knee-to-wall', 30], ['deep-squat', 30]],
  deep: [['ninety-switch', 60], ['hip-flexor', 60], ['ninety-hold', 60], ['pigeon', 60], ['frog', 90], ['butterfly', 60], ['straddle', 60], ['hamstring-supine', 60], ['calf-wall', 45], ['deep-squat', 90], ['supine-twist', 45]],
};
export function regionsOfItems(items) {
  const out = {};
  items.forEach(({ id, seconds }) => {
    (exercise(id)?.regions || []).forEach((r) => { out[r] = (out[r] || 0) + seconds; });
  });
  return out;
}
export function sessionRegions(s) {
  if (s.regions) return s.regions;
  const legacy = LEGACY[s.routineId] || LEGACY.daily;
  const planned = legacy.reduce((n, [id, sec]) => n + sec * (exercise(id)?.sides ? 2 : 1), 0);
  const f = Math.min(1, (s.seconds || 0) / planned);
  const out = regionsOfItems(legacy.map(([id, sec]) => ({ id, seconds: sec * f })));
  Object.keys(out).forEach((k) => { out[k] = Math.round(out[k]); });
  return out;
}
// Tiefe Einheit – auch die alte eingebaute "deep"-Routine von früher
export function isDeep(s) { return s.kind === 'deep' || s.routineId === 'deep'; }
export function counted(s) { return s.completed || (s.seconds || 0) >= COUNT_MIN_SECONDS; }
export function log() { return Store.getMobilityLog(); }

export function regionVolume(from = mondayOf(), to = new Date(Date.now() + DAY)) {
  const out = Object.fromEntries(REGIONS.map((r) => [r.id, 0]));
  log().forEach((s) => {
    const d = new Date(s.startedAt);
    if (d < from || d >= to) return;
    Object.entries(sessionRegions(s)).forEach(([r, sec]) => { if (r in out) out[r] += sec; });
  });
  return out;
}
export function regionTargets(p = getProfile()) {
  const focus = new Set(activePrograms(p).filter((a) => !a.finished).flatMap((a) => a.program.regions));
  return Object.fromEntries(REGIONS.map((r) => [r.id, focus.has(r.id) ? TARGET_FOCUS : TARGET_BASE]));
}

export function weekStats() {
  const now = new Date();
  const monday = mondayOf(now);
  const goal = Store.getSettings().mobilityGoal ?? 5;
  const days = Array.from({ length: 7 }, () => false);
  const deepDaysDone = Array.from({ length: 7 }, () => false);
  const counts = log().filter(counted);
  counts.forEach((s) => {
    const d = new Date(s.startedAt);
    if (d >= monday) {
      days[weekdayIndex(d)] = true;
      if (isDeep(s)) deepDaysDone[weekdayIndex(d)] = true;
    }
  });
  const perWeek = new Map();
  counts.forEach((s) => {
    const m = mondayOf(new Date(s.startedAt)).getTime();
    if (!perWeek.has(m)) perWeek.set(m, new Set());
    perWeek.get(m).add(dayKey(new Date(s.startedAt)));
  });
  const count = days.filter(Boolean).length;
  let streak = count >= goal ? 1 : 0;
  let cursor = monday;
  for (let i = 0; i < 200; i += 1) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
    if ((perWeek.get(cursor.getTime())?.size || 0) < goal) break;
    streak += 1;
  }
  const todayIndex = weekdayIndex(now);
  return { days, deepDaysDone, count, goal, todayIndex, today: days[todayIndex], streak, deepCount: deepDaysDone.filter(Boolean).length };
}
export function mobilityDoneToday() { return weekStats().today; }

// Tiefe Einheit heute? An den geplanten Tagen – oder nachholen, wenn die
// Woche sonst nicht mehr reicht. Nie zwei Tage hintereinander.
export function deepSuggestion(date = new Date(), p = getProfile()) {
  if (!p.deepPerWeek) return null;
  const stats = weekStats();
  const wd = weekdayIndex(date);
  const remaining = p.deepPerWeek - stats.deepCount;
  if (remaining <= 0 || stats.deepDaysDone[wd]) return null;
  const yesterdayDeep = wd > 0 && stats.deepDaysDone[wd - 1];
  if (yesterdayDeep) return null;
  const daysLeft = 7 - wd;
  const planned = (p.deepDays || []).includes(wd);
  // Verpasste Tage zählen erst ab dem Tag, an dem der Bereich eingerichtet wurde
  const createdIdx = p.created && new Date(p.created) > mondayOf(date) ? weekdayIndex(new Date(p.created)) : 0;
  const missed = (p.deepDays || []).filter((d) => d < wd && d >= createdIdx).length > stats.deepCount;
  const fresh = createdIdx > 0 && wd - createdIdx < 2; // die ersten Tage: erst mal die tägliche Routine
  if (fresh || !(planned || missed || (createdIdx === 0 && daysLeft <= remaining * 2 - 1))) return null;
  return deepRoutine(nextDeepId(p), p);
}
export function nextDeepId(p = getProfile()) {
  const prefs = [...new Set(activePrograms(p).filter((a) => !a.finished).flatMap((a) => a.program.deep))];
  const pool = prefs.length ? prefs : DEEP.map((d) => d.id);
  // Der Reihe nach: die am längsten nicht gemachte zuerst
  const lastAt = (id) => Math.max(0, ...log().filter((s) => s.routineId === id).map((s) => new Date(s.startedAt).getTime()));
  return [...pool].sort((a, b) => lastAt(a) - lastAt(b))[0];
}

export function todayPlan(date = new Date(), p = getProfile()) {
  const deep = deepSuggestion(date, p);
  const daily = dailyRoutine(date, p);
  const stats = weekStats();
  // Heute schon etwas gemacht: die tägliche Routine vorn, die tiefe Einheit bleibt als Angebot
  if (deep && stats.today) return { main: daily, alt: deep, deepDay: true, done: true, stats };
  return { main: deep || daily, alt: deep ? daily : null, deepDay: !!deep, done: stats.today, stats };
}

// ---------- Kontext: was passt gerade? ----------
function todaysWorkoutKind() {
  const today = dayKey();
  const w = Store.getWorkouts().find((x) => dayKey(new Date(x.startedAt)) === today);
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
export function situationSuggestions(date = new Date()) {
  const h = date.getHours();
  const today = dayKey(date);
  const ran = Store.getRuns().some((r) => dayKey(new Date(r.at)) === today);
  const wk = todaysWorkoutKind();
  const fight = Store.getSettings().mode === 'fight';
  const score = (s) => {
    let v = 0;
    if (s.when === 'morning' && h < 11) v += 5;
    if (s.when === 'evening' && h >= 19) v += 5;
    if (s.when === 'day' && h >= 9 && h < 19) v += 2;
    if (s.when === 'run' && ran) v += 6;
    if (['legs', 'push', 'pull'].includes(s.when) && wk === s.when) v += 7;
    if (s.when === 'fight' && fight) v += 3;
    if (s.when === 'gym' && !wk && h >= 9 && h < 20) v += 1;
    if (['legs', 'push', 'pull'].includes(s.when) && wk !== s.when) v -= 3;
    if (s.when === 'run' && !ran) v -= 1;
    return v;
  };
  return [...SITUATIONS].sort((a, b) => score(b) - score(a));
}

// ---------- Tests ----------
export function checks() { return Store.getMobilityChecks(); }
export function checkDue() {
  const list = checks();
  if (!list.length) return { due: true, first: true, age: null };
  const age = Math.floor((Date.now() - new Date(list[list.length - 1].date).getTime()) / DAY);
  return { due: age >= CHECK_INTERVAL_DAYS, first: false, age };
}
export function checkSelection(p = getProfile()) {
  const fromGoals = activePrograms(p).flatMap((a) => a.program.tests);
  return [...new Set([...CORE_CHECKS, ...fromGoals])];
}
