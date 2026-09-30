// Muskelkarte (vorn/hinten) und Wochensätze pro Muskelgruppe.
// Gegenstück zur Körperkarte im Mobility-Bereich: gleiche Silhouette,
// aber nach Muskeln statt nach Dehn-Regionen eingeteilt.
//
// Forschungsstand (Dosis-Wirkungs-Metaanalysen, z. B. Schoenfeld et al. 2017):
// Mehr Wochensätze pro Muskel bringen mehr Muskelaufbau, der größte Teil des
// Effekts liegt bei etwa 10–20 harten Sätzen pro Woche. Gezählt wird hier die
// Hauptmuskelgruppe jeder Übung – so sind die Übungen gespeichert.

export const SET_TARGET_MIN = 10;
export const SET_TARGET_MAX = 20;

// Muskelgruppen der App, die auf der Karte einen Platz haben
export const MAP_GROUPS = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Unterarme', 'Bauch', 'Beine', 'Po', 'Waden'];

// [Gruppe, Form, Attribute] – 'n' = neutraler Körperteil ohne Muskelgruppe
const FRONT = [
  ['n', 'circle', { cx: 50, cy: 17, r: 11 }],
  ['n', 'rect', { x: 44, y: 27, width: 12, height: 10, rx: 4 }],
  ['Schultern', 'circle', { cx: 29, cy: 43, r: 9 }],
  ['Schultern', 'circle', { cx: 71, cy: 43, r: 9 }],
  ['Brust', 'rect', { x: 34, y: 36, width: 32, height: 24, rx: 10 }],
  ['Bauch', 'rect', { x: 37, y: 61, width: 26, height: 25, rx: 8 }],
  ['Bizeps', 'rect', { x: 18, y: 50, width: 10, height: 28, rx: 5 }],
  ['Bizeps', 'rect', { x: 72, y: 50, width: 10, height: 28, rx: 5 }],
  ['Unterarme', 'rect', { x: 14, y: 81, width: 10, height: 32, rx: 5 }],
  ['Unterarme', 'rect', { x: 76, y: 81, width: 10, height: 32, rx: 5 }],
  ['Beine', 'rect', { x: 32, y: 89, width: 16, height: 46, rx: 7 }],
  ['Beine', 'rect', { x: 52, y: 89, width: 16, height: 46, rx: 7 }],
  ['n', 'circle', { cx: 40, cy: 142, r: 6 }],
  ['n', 'circle', { cx: 60, cy: 142, r: 6 }],
  ['n', 'rect', { x: 35, y: 150, width: 10, height: 41, rx: 5 }],
  ['n', 'rect', { x: 55, y: 150, width: 10, height: 41, rx: 5 }],
];
const BACK = [
  ['n', 'circle', { cx: 50, cy: 17, r: 11 }],
  ['n', 'rect', { x: 44, y: 27, width: 12, height: 10, rx: 4 }],
  ['Schultern', 'circle', { cx: 29, cy: 43, r: 9 }],
  ['Schultern', 'circle', { cx: 71, cy: 43, r: 9 }],
  ['Rücken', 'rect', { x: 34, y: 36, width: 32, height: 48, rx: 10 }],
  ['Trizeps', 'rect', { x: 18, y: 50, width: 10, height: 28, rx: 5 }],
  ['Trizeps', 'rect', { x: 72, y: 50, width: 10, height: 28, rx: 5 }],
  ['Unterarme', 'rect', { x: 14, y: 81, width: 10, height: 32, rx: 5 }],
  ['Unterarme', 'rect', { x: 76, y: 81, width: 10, height: 32, rx: 5 }],
  ['Po', 'ellipse', { cx: 41, cy: 96, rx: 10, ry: 11 }],
  ['Po', 'ellipse', { cx: 59, cy: 96, rx: 10, ry: 11 }],
  ['Beine', 'rect', { x: 32, y: 107, width: 16, height: 29, rx: 7 }],
  ['Beine', 'rect', { x: 52, y: 107, width: 16, height: 29, rx: 7 }],
  ['n', 'circle', { cx: 40, cy: 142, r: 6 }],
  ['n', 'circle', { cx: 60, cy: 142, r: 6 }],
  ['Waden', 'rect', { x: 34, y: 149, width: 12, height: 42, rx: 6 }],
  ['Waden', 'rect', { x: 54, y: 149, width: 12, height: 42, rx: 6 }],
];

// values: Gruppe -> 0..1 (Intensität der Färbung). labels: vorn/hinten zeigen.
export function muscleMap(values = {}, { labels = true, cls = '' } = {}) {
  const shape = ([group, tag, attrs], dx) => {
    const a = Object.entries(attrs).map(([k, v]) => `${k}="${k === 'x' || k === 'cx' ? v + dx : v}"`).join(' ');
    if (group === 'n') return `<${tag} ${a} class="n"/>`;
    const v = values[group];
    const style = typeof v === 'number' ? ` style="--v:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"` : '';
    return `<${tag} ${a} class="m${v >= 1 ? ' full' : ''}" data-group="${group}"${style}/>`;
  };
  return `<svg class="g-muscles ${cls}" viewBox="0 0 210 ${labels ? 200 : 192}" role="img" aria-label="Muskelkarte">
    <g>${FRONT.map((s) => shape(s, 0)).join('')}</g>
    <g>${BACK.map((s) => shape(s, 110)).join('')}</g>
    ${labels ? '<text x="50" y="199" text-anchor="middle">vorn</text><text x="160" y="199" text-anchor="middle">hinten</text>' : ''}
  </svg>`;
}

// Abgeschlossene Sätze pro Muskelgruppe in den letzten `days` Tagen
export function weeklySets(workouts, exercises, { days = 7, now = Date.now() } = {}) {
  const groupOf = new Map(exercises.map((e) => [e.id, e.muscleGroup]));
  const from = now - days * 86400000;
  const out = Object.fromEntries(MAP_GROUPS.map((g) => [g, 0]));
  workouts.forEach((w) => {
    if (!w.finishedAt || new Date(w.startedAt).getTime() < from) return;
    w.entries.forEach((e) => {
      const g = groupOf.get(e.exerciseId);
      if (!(g in out)) return;
      out[g] += e.sets.filter((s) => s.done && (s.reps > 0 || s.weight > 0)).length;
    });
  });
  return out;
}

// Färbung: bis zum Mindestziel ansteigend, ab 10 Sätzen voll
export function setShade(sets) {
  if (!sets) return 0;
  return Math.min(1, 0.25 + (sets / SET_TARGET_MIN) * 0.75);
}

// Gruppen eines Plans, gewichtet nach Anzahl Übungen – für die Karte im Plan
export function planGroups(exerciseIds, exercises) {
  const groupOf = new Map(exercises.map((e) => [e.id, e.muscleGroup]));
  const count = {};
  exerciseIds.forEach((id) => {
    const g = groupOf.get(id);
    if (MAP_GROUPS.includes(g)) count[g] = (count[g] || 0) + 1;
  });
  const max = Math.max(1, ...Object.values(count));
  return Object.fromEntries(Object.entries(count).map(([g, n]) => [g, 0.55 + 0.45 * (n / max)]));
}
