// Datenlayer: alles liegt in localStorage, die App läuft rein clientseitig.
import { EXERCISE_CATALOG, MUSCLE_GROUPS } from './exercise-catalog.js';

export { MUSCLE_GROUPS };

const KEYS = {
  exercises: 'gym.exercises',
  routines: 'gym.routines',
  workouts: 'gym.workouts',
  active: 'gym.active',
  settings: 'gym.settings',
  catalogVersion: 'gym.catalogVersion',
  rest: 'gym.rest',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Wird hochgezählt, wenn neue Übungen in den Katalog kommen: bestehende
// Bibliotheken bekommen sie dann einmalig nachgeliefert.
const CATALOG_VERSION = 1;

// Bewusst keine Standard-Rot/Blau/Grün-Töne, sondern ein paar kräftige,
// unverwechselbare Akzentfarben, die alle mit weißer Schrift gut lesbar bleiben.
export const ACCENT_COLORS = [
  { id: 'sunset', label: 'Sonnenuntergang', value: '#ff5a36' },
  { id: 'raspberry', label: 'Himbeere', value: '#e1306c' },
  { id: 'indigo', label: 'Indigo', value: '#6c5ce7' },
  { id: 'teal', label: 'Türkis', value: '#12b3a6' },
  { id: 'amber', label: 'Bernstein', value: '#cc7a00' },
  { id: 'emerald', label: 'Smaragd', value: '#12a454' },
];

// restSeconds: 0 schaltet den Pausentimer ab.
const DEFAULT_SETTINGS = {
  unit: 'kg',
  accent: ACCENT_COLORS[0].value,
  progressiveOverload: false,
  restSeconds: 90,
};

export const REST_OPTIONS = [0, 60, 90, 120, 180];

function seedIfEmpty() {
  if (read(KEYS.exercises, null) === null) {
    write(KEYS.exercises, EXERCISE_CATALOG.map((e) => ({ ...e })));
    write(KEYS.catalogVersion, CATALOG_VERSION);
  }
  if (read(KEYS.routines, null) === null) write(KEYS.routines, []);
  if (read(KEYS.workouts, null) === null) write(KEYS.workouts, []);
  if (read(KEYS.settings, null) === null) write(KEYS.settings, DEFAULT_SETTINGS);
}

// Namen normalisieren, damit "Bankdrücken" aus einer alten Installation nicht
// neben "Bankdrücken (Langhantel)" ... – exakte Dubletten aber sicher erkannt
// und nicht ein zweites Mal angelegt werden.
function normalizeName(name) {
  return String(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

// Bestehende Bibliotheken bekommen neue Katalog-Übungen nachgeliefert, ohne
// dass eigene Übungen, IDs oder deren Historie angefasst werden.
function mergeCatalog() {
  if (read(KEYS.catalogVersion, 0) >= CATALOG_VERSION) return;
  const existing = read(KEYS.exercises, []);
  const known = new Set(existing.map((e) => normalizeName(e.name)));
  const additions = EXERCISE_CATALOG
    .filter((e) => !known.has(normalizeName(e.name)))
    .map((e) => ({ ...e }));
  if (additions.length) write(KEYS.exercises, [...existing, ...additions]);
  write(KEYS.catalogVersion, CATALOG_VERSION);
}

seedIfEmpty();
mergeCatalog();

export const Store = {
  // Übungen
  getExercises() {
    return read(KEYS.exercises, []);
  },
  saveExercise(exercise) {
    const list = Store.getExercises();
    const i = list.findIndex((e) => e.id === exercise.id);
    if (i >= 0) list[i] = exercise;
    else list.push(exercise);
    write(KEYS.exercises, list);
  },
  deleteExercise(id) {
    write(KEYS.exercises, Store.getExercises().filter((e) => e.id !== id));
    // aus Routinen entfernen
    const routines = Store.getRoutines().map((r) => ({
      ...r,
      exerciseIds: r.exerciseIds.filter((eid) => eid !== id),
    }));
    write(KEYS.routines, routines);
  },
  getExercise(id) {
    return Store.getExercises().find((e) => e.id === id) || null;
  },

  // Routinen
  getRoutines() {
    return read(KEYS.routines, []);
  },
  saveRoutine(routine) {
    const list = Store.getRoutines();
    const i = list.findIndex((r) => r.id === routine.id);
    if (i >= 0) list[i] = routine;
    else list.push(routine);
    write(KEYS.routines, list);
  },
  deleteRoutine(id) {
    write(KEYS.routines, Store.getRoutines().filter((r) => r.id !== id));
  },
  getRoutine(id) {
    return Store.getRoutines().find((r) => r.id === id) || null;
  },

  // Workouts (Verlauf)
  getWorkouts() {
    return read(KEYS.workouts, []).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },
  deleteWorkout(id) {
    write(KEYS.workouts, read(KEYS.workouts, []).filter((w) => w.id !== id));
  },
  finishActiveWorkout(workout) {
    const list = read(KEYS.workouts, []);
    list.push(workout);
    write(KEYS.workouts, list);
    Store.clearActive();
  },
  lastEntryForExercise(exerciseId, excludeWorkoutId) {
    const workouts = Store.getWorkouts().filter((w) => w.id !== excludeWorkoutId);
    for (const w of workouts) {
      const entry = w.entries.find((e) => e.exerciseId === exerciseId);
      if (entry && entry.sets.some((s) => s.done)) return entry;
    }
    return null;
  },

  // Aktives Training
  getActive() {
    return read(KEYS.active, null);
  },
  setActive(workout) {
    write(KEYS.active, workout);
  },
  clearActive() {
    localStorage.removeItem(KEYS.active);
    localStorage.removeItem(KEYS.rest);
  },

  // Laufende Satzpause – überlebt bewusst auch ein Neuladen der App,
  // damit die Pause beim Zurückkehren noch stimmt.
  getRest() {
    const rest = read(KEYS.rest, null);
    if (!rest || rest.endsAt <= Date.now()) return null;
    return rest;
  },
  setRest(rest) {
    if (rest) write(KEYS.rest, rest);
    else localStorage.removeItem(KEYS.rest);
  },

  // Einstellungen
  getSettings() {
    return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, DEFAULT_SETTINGS) };
  },
  saveSettings(settings) {
    write(KEYS.settings, settings);
  },

  // Backup
  exportAll() {
    return {
      exportedAt: new Date().toISOString(),
      exercises: Store.getExercises(),
      routines: Store.getRoutines(),
      workouts: read(KEYS.workouts, []),
      settings: Store.getSettings(),
    };
  },
  importAll(data) {
    if (data.exercises) write(KEYS.exercises, data.exercises);
    if (data.routines) write(KEYS.routines, data.routines);
    if (data.workouts) write(KEYS.workouts, data.workouts);
    if (data.settings) write(KEYS.settings, data.settings);
    // Das Backup ist maßgeblich: gelöschte Katalog-Übungen sollen durch den
    // Import nicht wieder auftauchen.
    write(KEYS.catalogVersion, CATALOG_VERSION);
  },
  wipeAll() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    seedIfEmpty();
  },
};
