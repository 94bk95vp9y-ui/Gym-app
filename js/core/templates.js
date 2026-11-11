// Plan-Vorlagen: bewährte Aufteilungen zum Übernehmen mit einem Tipp. Ohne
// DOM. Die Übungen stehen mit ihrem Katalognamen drin; was in der Bibliothek
// fehlt (gelöscht oder umbenannt), wird beim Übernehmen ausgelassen.
//
// Die Auswahl folgt gängigen Empfehlungen für den Muskelaufbau: jede
// Muskelgruppe etwa zweimal pro Woche, Grundübungen zuerst, zwei bis vier
// Arbeitssätze je Übung. Es sind Ausgangspunkte – jeder Plan lässt sich danach
// frei bearbeiten.
import { Store, uid } from './store.js';

const E = (name, sets = 3) => ({ name, sets });

export const PLAN_TEMPLATES = [
  {
    id: 'ppl',
    name: 'Push Pull Beine',
    days: '3 oder 6 Tage pro Woche',
    level: 'Beliebt',
    text: 'Drücken, Ziehen, Beine – jede Einheit hat ein klares Thema. Dreimal pro Woche oder der Reihe nach zweimal durch.',
    plans: [
      { name: 'Push', items: [E('Bankdrücken (Langhantel)'), E('Schrägbankdrücken (Kurzhantel)'), E('Schulterdrücken (Kurzhantel)'), E('Seitheben (Kurzhantel)'), E('Trizepsdrücken am Kabel (Seil)'), E('Überkopf-Trizepsdrücken (Kabel)', 2)] },
      { name: 'Pull', items: [E('Klimmzüge (Obergriff)'), E('Langhantelrudern'), E('Latzug (eng)'), E('Face Pulls'), E('Bizepscurls (SZ-Stange)'), E('Hammercurls', 2)] },
      { name: 'Beine', items: [E('Kniebeuge (Langhantel)'), E('Rumänisches Kreuzheben'), E('Beinpresse'), E('Beinbeuger (sitzend)'), E('Wadenheben (stehend)'), E('Beinheben (hängend)')] },
    ],
  },
  {
    id: 'upper-lower',
    name: 'Ober- / Unterkörper',
    days: '4 Tage pro Woche',
    level: 'Ausgewogen',
    text: 'Zwei Einheiten oben, zwei unten – jede Muskelgruppe zweimal pro Woche, mit genug Pause dazwischen.',
    plans: [
      { name: 'Oberkörper A', items: [E('Bankdrücken (Langhantel)'), E('Langhantelrudern'), E('Schulterdrücken (Kurzhantel)'), E('Latzug (breit)'), E('Bizepscurls (Kurzhantel)', 2), E('Trizepsdrücken am Kabel (Seil)', 2)] },
      { name: 'Unterkörper A', items: [E('Kniebeuge (Langhantel)'), E('Rumänisches Kreuzheben'), E('Beinstrecker'), E('Beinbeuger (liegend)'), E('Wadenheben (stehend)'), E('Unterarmstütz (Plank)')] },
      { name: 'Oberkörper B', items: [E('Schrägbankdrücken (Kurzhantel)'), E('Klimmzüge (Obergriff)'), E('Kabelrudern (sitzend)'), E('Seitheben (Kurzhantel)'), E('Hammercurls', 2), E('Stirndrücken (French Press)', 2)] },
      { name: 'Unterkörper B', items: [E('Kreuzheben'), E('Beinpresse'), E('Bulgarian Split Squat'), E('Hip Thrust'), E('Wadenheben (sitzend)'), E('Kabel-Crunches')] },
    ],
  },
  {
    id: 'full-body',
    name: 'Ganzkörper A/B',
    days: '2 bis 3 Tage pro Woche',
    level: 'Für den Einstieg',
    text: 'Zwei Einheiten im Wechsel, jede trifft den ganzen Körper. Wenig Übungen, viel Wirkung – ideal für den Anfang oder wenig Zeit.',
    plans: [
      { name: 'Ganzkörper A', items: [E('Kniebeuge (Langhantel)'), E('Bankdrücken (Langhantel)'), E('Langhantelrudern'), E('Schulterdrücken (Kurzhantel)', 2), E('Unterarmstütz (Plank)')] },
      { name: 'Ganzkörper B', items: [E('Kreuzheben'), E('Schrägbankdrücken (Kurzhantel)'), E('Latzug (breit)'), E('Beinpresse', 2), E('Beinheben (liegend)')] },
    ],
  },
  {
    id: 'machines',
    name: 'Maschinen-Start',
    days: '2 bis 3 Tage pro Woche',
    level: 'Ohne freie Gewichte',
    text: 'Geführte Bewegungen an Maschinen und Kabeln – gut, um Technik und Gefühl für die Übungen aufzubauen.',
    plans: [
      { name: 'Maschinen A', items: [E('Beinpresse'), E('Brustpresse (Maschine)'), E('Rudern (Maschine)'), E('Schulterdrücken (Maschine)', 2), E('Bauchpresse (Maschine)', 2)] },
      { name: 'Maschinen B', items: [E('Beinstrecker'), E('Beinbeuger (sitzend)'), E('Latzug (breit)'), E('Butterfly (Maschine)'), E('Bizepsmaschine', 2), E('Trizepsmaschine', 2)] },
    ],
  },
];

const norm = (name) => String(name).toLowerCase().replace(/\s+/g, ' ').trim();

// Vorlage gegen die eigene Bibliothek auflösen:
// [{ name, exists, items: [{ exercise, sets }], missing: [name] }]
export function resolveTemplate(template, exercises = Store.getExercises(), routines = Store.getRoutines()) {
  const byName = new Map(exercises.map((e) => [norm(e.name), e]));
  const taken = new Set(routines.map((r) => norm(r.name)));
  return template.plans.map((plan) => {
    const items = [];
    const missing = [];
    plan.items.forEach((item) => {
      const exercise = byName.get(norm(item.name));
      if (exercise) items.push({ exercise, sets: item.sets }); else missing.push(item.name);
    });
    return { name: plan.name, exists: taken.has(norm(plan.name)), items, missing };
  });
}

// Pläne anlegen. Gibt es schon einen Plan gleichen Namens, bekommt der neue
// eine Nummer – überschrieben wird nichts.
export function applyTemplate(template) {
  const created = [];
  resolveTemplate(template).forEach((plan) => {
    if (!plan.items.length) return;
    const names = new Set(Store.getRoutines().map((r) => norm(r.name)));
    let name = plan.name;
    for (let n = 2; names.has(norm(name)); n += 1) name = `${plan.name} ${n}`;
    const routine = {
      id: uid(),
      name,
      exerciseIds: plan.items.map((x) => x.exercise.id),
      setCounts: Object.fromEntries(plan.items.map((x) => [x.exercise.id, x.sets])),
    };
    Store.saveRoutine(routine);
    created.push(routine);
  });
  return created;
}
