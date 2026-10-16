// Datenlayer: alles liegt in localStorage, die App läuft rein clientseitig.
//
// Die Schlüssel sind dieselben wie in der vorigen Version der App – Pläne,
// Übungen, Trainings und Supplements sind nach dem Update also einfach noch
// da. Daten aus entfernten Bereichen (Fight, Challenges) bleiben unangetastet
// liegen, werden aber weder gelesen noch gesichert.
import { EXERCISE_CATALOG, MUSCLE_GROUPS } from './catalog.js';

export { MUSCLE_GROUPS };

const PREFIX = 'gym.';
const KEYS = {
  exercises: 'gym.exercises',
  routines: 'gym.routines',
  workouts: 'gym.workouts',
  active: 'gym.active',
  settings: 'gym.settings',
  catalogVersion: 'gym.catalogVersion',
  rest: 'gym.rest',
  supplements: 'gym.supplements',
  supplementLog: 'gym.supplementLog',
  mobilityLog: 'gym.mobilityLog',
  mobilityProfile: 'gym.mobilityProfile',
};

// Geparste Werte zwischenspeichern: ein Neuaufbau der Ansicht liest dieselben
// Schlüssel oft, und bei einem Jahr Trainingsdaten kostet jedes JSON.parse
// Zeit. Maßgeblich bleibt der Rohtext – hat er sich geändert, wird neu gelesen.
const cache = new Map();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const hit = cache.get(key);
    if (hit && hit.raw === raw) return hit.value;
    const value = JSON.parse(raw);
    cache.set(key, { raw, value });
    return value;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  const raw = JSON.stringify(value);
  localStorage.setItem(key, raw);
  cache.set(key, { raw, value });
}

function remove(key) {
  localStorage.removeItem(key);
  cache.delete(key);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Wird hochgezählt, wenn neue Übungen in den Katalog kommen: bestehende
// Bibliotheken bekommen sie dann einmalig nachgeliefert.
const CATALOG_VERSION = 1;

export const ACCENTS = [
  { id: 'blue', label: 'Blau', light: '#007AFF', dark: '#0A84FF' },
  { id: 'indigo', label: 'Indigo', light: '#5856D6', dark: '#7D7AFF' },
  { id: 'green', label: 'Grün', light: '#1F9D55', dark: '#30D158' },
  { id: 'orange', label: 'Orange', light: '#E8590C', dark: '#FF9F0A' },
  { id: 'graphite', label: 'Graphit', light: '#1C1C1E', dark: '#F2F2F7' },
];

export const REST_OPTIONS = [0, 45, 60, 90, 120, 150, 180, 240];
export const DEFAULT_PLAN_SETS = 3;

const SETTINGS_VERSION = 2;
const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  unit: 'kg',
  weeklyGoal: 3,
  restSeconds: 90,
  progressiveOverload: true,
  keepAwake: true,
  theme: 'light', // 'light' | 'dark' | 'system'
  accent: 'blue',
  sound: true,
  soundVolume: 0.6,
  mobilityBudget: 10,
  mobilityVoice: true,
  mobilityPrep: 10,
  backupReminder: true,
  lastBackupAt: null,
  backupSnoozedUntil: null,
  // Zuletzt gewählte Erinnerungszeit je Tageszeit (HHMM)
  supplementReminders: {},
};

function seedIfEmpty() {
  if (read(KEYS.exercises, null) === null) {
    write(KEYS.exercises, EXERCISE_CATALOG.map((e) => ({ ...e })));
    write(KEYS.catalogVersion, CATALOG_VERSION);
  }
  if (read(KEYS.routines, null) === null) write(KEYS.routines, []);
  if (read(KEYS.workouts, null) === null) write(KEYS.workouts, []);
  if (read(KEYS.settings, null) === null) write(KEYS.settings, DEFAULT_SETTINGS);
}

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

// Einstellungen der vorigen Version übernehmen, soweit sie noch passen. Die
// Optik ist neu – Akzentfarbe und Hell/Dunkel starten deshalb frisch.
function migrateSettings() {
  const old = read(KEYS.settings, null);
  if (!old || old.v >= SETTINGS_VERSION) return;
  const profile = read(KEYS.mobilityProfile, null);
  const next = { ...DEFAULT_SETTINGS };
  ['unit', 'weeklyGoal', 'restSeconds', 'keepAwake', 'sound', 'soundVolume', 'mobilityVoice',
    'mobilityPrep', 'lastBackupAt', 'supplementReminders'].forEach((k) => {
    if (old[k] !== undefined && old[k] !== null) next[k] = old[k];
  });
  if (profile && [5, 10, 15, 20].includes(profile.budget)) next.mobilityBudget = profile.budget;
  if (!REST_OPTIONS.includes(next.restSeconds)) next.restSeconds = 90;
  write(KEYS.settings, next);
}

seedIfEmpty();
mergeCatalog();
migrateSettings();

let sortedWorkouts = { source: null, sorted: [] };

// Prüft, ob eine Datei wirklich eine Sicherung dieser App ist, bevor sie
// alles überschreibt. Gibt eine Fehlermeldung zurück oder null.
export function validateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Die Datei enthält keine Gym-Sicherung.';
  const known = ['exercises', 'routines', 'workouts', 'settings', 'supplements', 'supplementLog', 'mobilityLog'];
  if (!known.some((k) => k in data)) return 'Die Datei enthält keine Gym-Sicherung.';
  const lists = ['exercises', 'routines', 'workouts', 'supplements', 'mobilityLog'];
  if (lists.some((k) => k in data && !Array.isArray(data[k]))) return 'Die Sicherung ist beschädigt.';
  if ((data.exercises || []).some((e) => !e || !e.id || typeof e.name !== 'string')) return 'Die Übungen in der Sicherung sind beschädigt.';
  if ((data.routines || []).some((r) => !r || !r.id || !Array.isArray(r.exerciseIds))) return 'Die Pläne in der Sicherung sind beschädigt.';
  if ((data.workouts || []).some((w) => !w || typeof w.startedAt !== 'string' || !Array.isArray(w.entries)
    || w.entries.some((e) => !e || !Array.isArray(e.sets)))) {
    return 'Die Trainings in der Sicherung sind beschädigt.';
  }
  if ('settings' in data && (typeof data.settings !== 'object' || Array.isArray(data.settings))) return 'Die Einstellungen in der Sicherung sind beschädigt.';
  if ('supplementLog' in data && (typeof data.supplementLog !== 'object' || Array.isArray(data.supplementLog))) return 'Die Supplement-Daten in der Sicherung sind beschädigt.';
  return null;
}

export const Store = {
  // ---------- Übungen ----------
  getExercises() {
    return read(KEYS.exercises, []);
  },
  getExercise(id) {
    return Store.getExercises().find((e) => e.id === id) || null;
  },
  saveExercise(exercise) {
    const list = [...Store.getExercises()];
    const i = list.findIndex((e) => e.id === exercise.id);
    if (i >= 0) list[i] = exercise;
    else list.push(exercise);
    write(KEYS.exercises, list);
  },
  updateExercise(id, patch) {
    const ex = Store.getExercise(id);
    if (ex) Store.saveExercise({ ...ex, ...patch });
  },
  deleteExercise(id) {
    write(KEYS.exercises, Store.getExercises().filter((e) => e.id !== id));
    write(KEYS.routines, Store.getRoutines().map((r) => ({
      ...r,
      exerciseIds: r.exerciseIds.filter((eid) => eid !== id),
    })));
  },

  // ---------- Pläne ----------
  getRoutines() {
    return read(KEYS.routines, []);
  },
  getRoutine(id) {
    return Store.getRoutines().find((r) => r.id === id) || null;
  },
  saveRoutine(routine) {
    const list = [...Store.getRoutines()];
    const i = list.findIndex((r) => r.id === routine.id);
    if (i >= 0) list[i] = routine;
    else list.push(routine);
    write(KEYS.routines, list);
  },
  deleteRoutine(id) {
    write(KEYS.routines, Store.getRoutines().filter((r) => r.id !== id));
  },

  // ---------- Trainings (Verlauf) ----------
  // Neueste zuerst. Sortiert wird eine Kopie; bei unveränderten Daten gar nicht.
  getWorkouts() {
    const list = read(KEYS.workouts, []);
    const entry = cache.get(KEYS.workouts) || null;
    if (!entry || sortedWorkouts.source !== entry) {
      sortedWorkouts = {
        source: entry,
        sorted: list.filter((w) => w && w.finishedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      };
    }
    return sortedWorkouts.sorted;
  },
  getWorkout(id) {
    return Store.getWorkouts().find((w) => w.id === id) || null;
  },
  deleteWorkout(id) {
    write(KEYS.workouts, read(KEYS.workouts, []).filter((w) => w.id !== id));
  },
  finishActiveWorkout(workout) {
    write(KEYS.workouts, [...read(KEYS.workouts, []), workout]);
    Store.clearActive();
  },

  // ---------- Laufendes Training ----------
  getActive() {
    return read(KEYS.active, null);
  },
  setActive(workout) {
    write(KEYS.active, workout);
  },
  clearActive() {
    remove(KEYS.active);
    remove(KEYS.rest);
  },

  // Laufende Satzpause – überlebt bewusst ein Neuladen der App.
  getRest() {
    const rest = read(KEYS.rest, null);
    if (!rest || rest.endsAt <= Date.now()) return null;
    return rest;
  },
  setRest(rest) {
    if (rest) write(KEYS.rest, rest);
    else remove(KEYS.rest);
  },

  // ---------- Supplements ----------
  // Entfernen ist nur ein Markieren: die Historie muss wissen, was an einem
  // vergangenen Tag dran war, sonst verschiebt ein abgesetztes Präparat
  // rückwirkend die Bilanz.
  getSupplements() {
    return read(KEYS.supplements, []);
  },
  getActiveSupplements() {
    return Store.getSupplements().filter((s) => !s.removedOn);
  },
  saveSupplement(supplement) {
    const list = [...Store.getSupplements()];
    const i = list.findIndex((s) => s.id === supplement.id);
    if (i >= 0) list[i] = supplement;
    else list.push(supplement);
    write(KEYS.supplements, list);
  },
  removeSupplement(id, onDay) {
    const list = Store.getSupplements().map((s) => ({ ...s }));
    const target = list.find((s) => s.id === id);
    if (!target) return;
    // Heute erst angelegt und gleich wieder weg: dann hat es nie gezählt.
    if (target.since >= onDay) {
      write(KEYS.supplements, list.filter((s) => s.id !== id));
      return;
    }
    target.removedOn = onDay;
    write(KEYS.supplements, list);
  },
  getSupplementLog() {
    return read(KEYS.supplementLog, {});
  },
  // Abhaken zieht eine Portion vom Vorrat ab, Zurücknehmen legt sie zurück –
  // aber nur, wenn sich der Zustand wirklich ändert.
  setSupplementsTaken(day, ids, taken) {
    const log = { ...Store.getSupplementLog() };
    const entry = { ...(log[day] || {}) };
    const changed = ids.filter((id) => !!entry[id] !== taken);
    changed.forEach((id) => {
      if (taken) entry[id] = true;
      else delete entry[id];
    });
    if (Object.keys(entry).length) log[day] = entry;
    else delete log[day];
    write(KEYS.supplementLog, log);
    if (!changed.length) return;
    const list = Store.getSupplements().map((s) => {
      if (!changed.includes(s.id) || typeof s.stock !== 'number') return s;
      return { ...s, stock: Math.max(0, s.stock + (taken ? -1 : 1)) };
    });
    write(KEYS.supplements, list);
  },

  // ---------- Mobility ----------
  getMobilityLog() {
    return read(KEYS.mobilityLog, []);
  },
  addMobilitySession(session) {
    write(KEYS.mobilityLog, [...Store.getMobilityLog(), session]);
  },

  // ---------- Einstellungen ----------
  getSettings() {
    return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, DEFAULT_SETTINGS) };
  },
  saveSettings(settings) {
    write(KEYS.settings, settings);
  },
  updateSettings(patch) {
    const next = { ...Store.getSettings(), ...patch };
    write(KEYS.settings, next);
    return next;
  },

  // ---------- Sicherung ----------
  exportAll() {
    return {
      app: 'gym',
      version: 2,
      exportedAt: new Date().toISOString(),
      exercises: Store.getExercises(),
      routines: Store.getRoutines(),
      workouts: read(KEYS.workouts, []),
      settings: Store.getSettings(),
      supplements: Store.getSupplements(),
      supplementLog: Store.getSupplementLog(),
      mobilityLog: Store.getMobilityLog(),
    };
  },
  importAll(data) {
    if (data.exercises) write(KEYS.exercises, data.exercises);
    if (data.routines) write(KEYS.routines, data.routines);
    if (data.workouts) write(KEYS.workouts, data.workouts);
    if (data.settings) write(KEYS.settings, data.settings);
    if (data.supplements) write(KEYS.supplements, data.supplements);
    if (data.supplementLog) write(KEYS.supplementLog, data.supplementLog);
    if (Array.isArray(data.mobilityLog)) write(KEYS.mobilityLog, data.mobilityLog);
    // Das Backup ist maßgeblich: gelöschte Katalog-Übungen sollen durch den
    // Import nicht wieder auftauchen.
    write(KEYS.catalogVersion, CATALOG_VERSION);
    migrateSettings();
  },
  // Setzt die App komplett zurück – auch Reste der vorigen Version.
  wipeAll() {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach(remove);
    cache.clear();
    seedIfEmpty();
  },
};
