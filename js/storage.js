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
  supplements: 'gym.supplements',
  supplementLog: 'gym.supplementLog',
  mobilityRoutines: 'gym.mobilityRoutines',
  mobilityLog: 'gym.mobilityLog',
  mobilityChecks: 'gym.mobilityChecks',
};

// Geparste Werte werden zwischengespeichert: ein Neuaufbau der Ansicht liest
// dieselben Schlüssel zigmal, und bei einem Jahr Trainingsdaten kostet jedes
// JSON.parse spürbar Zeit. Maßgeblich bleibt der Rohtext im Speicher – hat er
// sich geändert (auch von außen), wird neu gelesen.
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
  motivation: true,
  weeklyGoal: 3,
  sound: true,
  soundVolume: 0.7,
  soundStyle: 'click',
  keepAwake: true,
  supplements: true,
  mobility: true,
  mobilityGoal: 5,
  mobilityPrep: 10,
  mobilityVoice: true,
  // Zuletzt gewählte Erinnerungszeit je Tageszeit (HHMM), nur fürs Formular
  supplementReminders: {},
};

export const REST_OPTIONS = [0, 60, 90, 120, 180];
export const WEEKLY_GOALS = [2, 3, 4, 5, 6];

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

let sortedWorkouts = { source: null, sorted: [] };

// Prüft, ob eine Datei wirklich eine Sicherung dieser App ist, bevor sie
// alles überschreibt. Gibt eine Fehlermeldung zurück oder null.
export function validateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Die Datei enthält keine Gym-Sicherung.';
  const known = ['exercises', 'routines', 'workouts', 'settings', 'supplements', 'supplementLog', 'mobilityLog'];
  if (!known.some((k) => k in data)) return 'Die Datei enthält keine Gym-Sicherung.';
  const lists = ['exercises', 'routines', 'workouts', 'supplements', 'mobilityLog', 'mobilityChecks'];
  const broken = lists.find((k) => k in data && !Array.isArray(data[k]));
  if (broken) return 'Die Sicherung ist beschädigt.';
  if ((data.exercises || []).some((e) => !e || !e.id || typeof e.name !== 'string')) return 'Die Übungen in der Sicherung sind beschädigt.';
  if ((data.routines || []).some((r) => !r || !r.id || !Array.isArray(r.exerciseIds))) return 'Die Pläne in der Sicherung sind beschädigt.';
  if ((data.workouts || []).some((w) => !w || typeof w.startedAt !== 'string' || !Array.isArray(w.entries)
    || w.entries.some((e) => !e || !Array.isArray(e.sets)))) {
    return 'Die Trainings in der Sicherung sind beschädigt.';
  }
  if ('settings' in data && (typeof data.settings !== 'object' || Array.isArray(data.settings))) return 'Die Einstellungen in der Sicherung sind beschädigt.';
  return null;
}

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
  // Neueste zuerst. Sortiert wird eine Kopie, damit der Zwischenspeicher
  // unangetastet bleibt; bei unveränderten Daten wird gar nicht neu sortiert.
  getWorkouts() {
    const list = read(KEYS.workouts, []);
    // Jeder Schreib- oder Neulesevorgang legt einen neuen Cache-Eintrag an –
    // dessen Identität zeigt zuverlässig, ob sich etwas geändert hat.
    const entry = cache.get(KEYS.workouts) || null;
    if (!entry || sortedWorkouts.source !== entry) {
      sortedWorkouts = { source: entry, sorted: [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) };
    }
    return sortedWorkouts.sorted;
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
    remove(KEYS.active);
    remove(KEYS.rest);
  },

  // Supplements. Entfernen ist bewusst nur ein Markieren: die Historie muss
  // wissen, was an einem vergangenen Tag dran war, sonst verschiebt ein
  // abgesetztes Präparat rückwirkend die Bilanz.
  getSupplements() {
    return read(KEYS.supplements, []);
  },
  getActiveSupplements() {
    return Store.getSupplements().filter((s) => !s.removedOn);
  },
  saveSupplement(supplement) {
    const list = Store.getSupplements();
    const i = list.findIndex((s) => s.id === supplement.id);
    if (i >= 0) list[i] = supplement;
    else list.push(supplement);
    write(KEYS.supplements, list);
  },
  removeSupplement(id, onDay) {
    const list = Store.getSupplements();
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
  setSupplementsTaken(day, ids, taken) {
    const log = Store.getSupplementLog();
    const entry = { ...(log[day] || {}) };
    ids.forEach((id) => {
      if (taken) entry[id] = true;
      else delete entry[id];
    });
    if (Object.keys(entry).length) log[day] = entry;
    else delete log[day];
    write(KEYS.supplementLog, log);
  },

  // Mobility: eigene Routinen (null = noch die Standard-Routinen), Einheiten
  // und die Ergebnisse des Beweglichkeits-Checks. Zählt bewusst nicht als
  // Training.
  getMobilityRoutines() {
    return read(KEYS.mobilityRoutines, null);
  },
  saveMobilityRoutines(list) {
    write(KEYS.mobilityRoutines, list);
  },
  getMobilityLog() {
    return read(KEYS.mobilityLog, []);
  },
  addMobilitySession(session) {
    write(KEYS.mobilityLog, [...Store.getMobilityLog(), session]);
  },
  getMobilityChecks() {
    return read(KEYS.mobilityChecks, []);
  },
  addMobilityCheck(check) {
    write(KEYS.mobilityChecks, [...Store.getMobilityChecks(), check]);
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
    else remove(KEYS.rest);
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
      supplements: Store.getSupplements(),
      supplementLog: Store.getSupplementLog(),
      mobilityRoutines: Store.getMobilityRoutines(),
      mobilityLog: Store.getMobilityLog(),
      mobilityChecks: Store.getMobilityChecks(),
    };
  },
  importAll(data) {
    if (data.exercises) write(KEYS.exercises, data.exercises);
    if (data.routines) write(KEYS.routines, data.routines);
    if (data.workouts) write(KEYS.workouts, data.workouts);
    if (data.settings) write(KEYS.settings, data.settings);
    if (data.supplements) write(KEYS.supplements, data.supplements);
    if (data.supplementLog) write(KEYS.supplementLog, data.supplementLog);
    if (Array.isArray(data.mobilityRoutines)) write(KEYS.mobilityRoutines, data.mobilityRoutines);
    if (data.mobilityLog) write(KEYS.mobilityLog, data.mobilityLog);
    if (data.mobilityChecks) write(KEYS.mobilityChecks, data.mobilityChecks);
    // Das Backup ist maßgeblich: gelöschte Katalog-Übungen sollen durch den
    // Import nicht wieder auftauchen.
    write(KEYS.catalogVersion, CATALOG_VERSION);
  },
  wipeAll() {
    Object.values(KEYS).forEach(remove);
    seedIfEmpty();
  },
};
