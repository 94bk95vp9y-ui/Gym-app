// Die Position einer Übung im Training verändert die Zahlen erheblich: als
// vierte Brustübung drückt niemand das, was er frisch drücken würde. Wird das
// ignoriert, meldet die App eine Verschlechterung, obwohl sich nur die
// Reihenfolge geändert hat.
//
// Bewusst NICHT korrigiert wird dabei der Wert selbst – ein hochgerechnetes
// "das hättest du frisch geschafft" wäre eine erfundene Zahl. Stattdessen
// wird nur bestimmt, welche Einheiten überhaupt miteinander vergleichbar
// sind: verglichen wird mit Einheiten unter ähnlicher Vorbelastung.
//
// Maß dafür ist nicht die reine Position, sondern die Anzahl bereits
// absolvierter Sätze derselben Muskelgruppe – drei Sätze Beine vorher
// ermüden die Brust nicht.

const FRESH_MAX = 2;
const MID_MAX = 7;

export function bucketOf(priorSets) {
  if (priorSets <= FRESH_MAX) return 'fresh';
  if (priorSets <= MID_MAX) return 'mid';
  return 'late';
}

export function fatigueOf(workout, entryIndex, muscleGroupOf) {
  const entry = workout.entries[entryIndex];
  const group = muscleGroupOf(entry.exerciseId);
  let priorSets = 0;
  for (let i = 0; i < entryIndex; i += 1) {
    const other = workout.entries[i];
    if (muscleGroupOf(other.exerciseId) !== group) continue;
    priorSets += other.sets.filter((s) => s.done).length;
  }
  return { priorSets, bucket: bucketOf(priorSets), position: entryIndex + 1 };
}

export function muscleGroupLookup(exercises) {
  const map = new Map(exercises.map((e) => [e.id, e.muscleGroup]));
  return (id) => map.get(id) || 'Sonstiges';
}
