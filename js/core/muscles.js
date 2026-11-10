// Muskeln: welche Übung welchen Muskel wie stark trifft, Sätze pro Woche und
// eine grobe Einschätzung der Erholung. Ohne DOM, damit es sich mit
// erfundenen Verläufen prüfen lässt.
//
// Gezählt wird „fraktionell“: der Zielmuskel einer Übung bekommt einen ganzen
// Satz, deutlich mitarbeitende Muskeln einen halben (Bankdrücken: Brust 1,
// Trizeps und vordere Schulter je ½). Reine Zählung nach Zielmuskel
// unterschlägt sonst, dass Arme und Schultern bei jedem Drücken und Ziehen
// mitarbeiten.
import { Store } from './store.js';

const DAY = 86400000;
const HOUR = 3600000;

export const MAP_GROUPS = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Unterarme', 'Bauch', 'Beine', 'Po', 'Waden'];
export const SECONDARY_SHARE = 0.5;

// [Zielmuskel oder null für alle, Muster im Namen, mitarbeitende Muskeln]
// Die erste passende Regel gilt.
const SECONDARY_RULES = [
  ['Brust', /fliegende|butterfly|überz|pullover|cross/, []],
  ['Brust', /./, ['Trizeps', 'Schultern']],
  ['Rücken', /kreuzheben|deadlift/, ['Beine', 'Po']],
  ['Rücken', /rack pull|good morning|rückenstrecker|hyperextension/, ['Po', 'Beine']],
  ['Rücken', /shrug|nackenheben|überz|pullover/, []],
  ['Rücken', /./, ['Bizeps']],
  ['Schultern', /drück|press/, ['Trizeps']],
  ['Schultern', /face pull|reverse butterfly|vorgebeugt|aufrechtes rudern/, ['Rücken']],
  ['Trizeps', /bankdrück|dips/, ['Brust', 'Schultern']],
  ['Bizeps', /hammer/, ['Unterarme']],
  ['Unterarme', /reverse curl/, ['Bizeps']],
  ['Beine', /rumänisch|gestreckt|romanian|stiff/, ['Po', 'Rücken']],
  ['Beine', /strecker|beuger|adduktor|nordic|sissy/, []],
  ['Beine', /./, ['Po']],
  ['Po', /abduktor|kickback/, []],
  ['Po', /./, ['Beine']],
  ['Ganzkörper', /umsetzen und|thruster/, ['Beine', 'Schultern', 'Po']],
  ['Ganzkörper', /umsetzen|reißen|clean|snatch/, ['Beine', 'Rücken', 'Po']],
  ['Ganzkörper', /swing/, ['Po', 'Beine', 'Rücken']],
  ['Ganzkörper', /burpee/, ['Brust', 'Beine']],
];

// Anteile einer Übung: [[Muskel, Anteil], …] – nur Muskeln der Karte
export function muscleShares(exercise) {
  if (!exercise) return [];
  const group = exercise.muscleGroup || '';
  const name = String(exercise.name || '').toLowerCase();
  const rule = SECONDARY_RULES.find(([g, re]) => g === group && re.test(name));
  const out = [];
  if (MAP_GROUPS.includes(group)) out.push([group, 1]);
  (rule ? rule[2] : []).forEach((g) => { if (g !== group) out.push([g, SECONDARY_SHARE]); });
  return out;
}

// Anteile je Übung einmal je Stand der Übungsliste bestimmen
let shareCache = { source: null, map: new Map() };
function sharesById() {
  const list = Store.getExercises();
  if (shareCache.source !== list) {
    shareCache = { source: list, map: new Map(list.map((e) => [e.id, muscleShares(e)])) };
  }
  return shareCache.map;
}

const hardSets = (entry) => entry.sets.filter((s) => s.done && (s.reps > 0 || s.weight > 0)).length;

// Sätze je Muskel in einem Training: { Muskel: { sets, direct } }
export function workoutMuscles(workout, shares = sharesById()) {
  const out = {};
  workout.entries.forEach((e) => {
    const n = hardSets(e);
    if (!n) return;
    (shares.get(e.exerciseId) || []).forEach(([g, share]) => {
      const m = out[g] || (out[g] = { sets: 0, direct: 0 });
      m.sets += n * share;
      if (share === 1) m.direct += n;
    });
  });
  return out;
}

// Sätze pro Muskel in den letzten Tagen: { Muskel: { sets, direct } }
export function muscleSets(days = 7, now = Date.now(), workouts = Store.getWorkouts()) {
  const from = now - days * DAY;
  const shares = sharesById();
  const out = Object.fromEntries(MAP_GROUPS.map((g) => [g, { sets: 0, direct: 0 }]));
  for (const w of workouts) {
    const t = new Date(w.startedAt).getTime();
    if (t < from) break; // neueste zuerst
    if (t > now) continue;
    Object.entries(workoutMuscles(w, shares)).forEach(([g, m]) => {
      out[g].sets += m.sets;
      out[g].direct += m.direct;
    });
  }
  return out;
}

// ---------- Erholung ----------
// Eine Faustregel, keine Messung: nach einem harten Training braucht ein
// Muskel etwa 48–72 Stunden. Je mehr Sätze, desto länger – ab einem Tag
// (wenige Sätze) bis drei Tage (acht und mehr). Wie stark ein Training den
// Muskel belastet hat, hängt ebenfalls an den Sätzen: zwei, drei halbe Sätze
// als Hilfsmuskel brauchen etwas Ruhe, legen ihn aber nicht lahm. Schlaf,
// Ernährung und Trainingsstand kennt die App nicht.
const REST_MIN_H = 24;
const REST_MAX_H = 72;
const REST_PER_SET_H = 6;
const FULL_LOAD_SETS = 6; // ab hier gilt ein Muskel als voll belastet
const READY_BELOW = 0.15; // Restermüdung, unter der er als bereit gilt
const TIRED_FROM = 0.5;

export function restHours(sets) {
  return Math.max(REST_MIN_H, Math.min(REST_MAX_H, REST_MIN_H + REST_PER_SET_H * sets));
}

// { Muskel: { pct (1 = erholt), state ('tired' | 'recovering' | 'ready'),
//             hoursLeft bis „bereit“, lastAt (ms oder null), lastSets } }
export function recovery(now = Date.now(), workouts = Store.getWorkouts()) {
  const shares = sharesById();
  const out = Object.fromEntries(MAP_GROUPS.map((g) => [g, { pct: 1, state: 'ready', hoursLeft: 0, lastAt: null, lastSets: 0, fatigue: 0 }]));
  const from = now - 21 * DAY;
  for (const w of workouts) {
    const end = new Date(w.finishedAt || w.startedAt).getTime();
    if (end < from) break;
    if (end > now + HOUR) continue;
    const elapsed = Math.max(0, now - end) / HOUR;
    Object.entries(workoutMuscles(w, shares)).forEach(([g, m]) => {
      const r = out[g];
      if (r.lastAt === null) { r.lastAt = end; r.lastSets = m.sets; }
      const need = restHours(m.sets);
      const load = Math.min(1, m.sets / FULL_LOAD_SETS);
      const fatigue = Math.max(0, 1 - elapsed / need) * load;
      if (fatigue <= r.fatigue) return;
      r.fatigue = fatigue;
      // Zeit, bis die Restermüdung unter die Schwelle fällt
      r.hoursLeft = load > READY_BELOW ? Math.max(0, need * (1 - READY_BELOW / load) - elapsed) : 0;
    });
  }
  MAP_GROUPS.forEach((g) => {
    const r = out[g];
    r.pct = 1 - r.fatigue;
    r.state = r.fatigue < READY_BELOW ? 'ready' : r.fatigue >= TIRED_FROM ? 'tired' : 'recovering';
    r.hoursLeft = r.state === 'ready' ? 0 : Math.max(1, Math.round(r.hoursLeft));
  });
  return out;
}

// Wie frisch sind die Muskeln eines Plans? Mittel über die Zielmuskeln,
// gewichtet nach Sätzen. null, wenn der Plan keinen Muskel der Karte trifft.
export function planReadiness(routine, rec = recovery()) {
  const shares = sharesById();
  let sum = 0;
  let weight = 0;
  routine.exerciseIds.forEach((id) => {
    const n = routine.setCounts?.[id] ?? 2;
    (shares.get(id) || []).forEach(([g, share]) => {
      if (share < 1) return;
      sum += rec[g].pct * n;
      weight += n;
    });
  });
  return weight ? sum / weight : null;
}
