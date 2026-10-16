// Mobility-Pläne: die tägliche Routine (Kern + Tagesfokus) und zwei tiefe
// Einheiten für die Beine.
//
// Hintergrund (Studienlage 2018–2025):
// - Entscheidend ist die Dehnzeit pro Region und Woche: ab ca. 5 Minuten
//   wirkt es, rund 10 Minuten sind optimal – verteilt auf möglichst viele
//   Tage. Die Länge einer einzelnen Einheit ist zweitrangig.
// - Die Intensität spielt kaum eine Rolle: deutlich spürbar reicht.
// - Halten und Anspannen-Loslassen wirken langfristig gleich gut; dynamische
//   Übungen eignen sich zum Aufwärmen.
// - Kraft in der Endposition macht Beweglichkeit nutzbar (aktive
//   Beweglichkeit, z. B. für Kicks).
// Daher: ein gleichbleibender Kern jeden Tag (Gewohnheit, Wochenminuten),
// ein wechselnder Fokus-Block für den Rest des Körpers und ab und zu eine
// tiefe Einheit mit anderen Methoden.

import { exercise } from './library.js';

export const SWITCH_SECONDS = 6;

// Anspannen-Loslassen: 3 Durchgänge, danach ein letztes, tieferes Halten
export const PNF = { cycles: 3, stretch: 20, contract: 6, relax: 3, final: 20 };
export const PNF_SECONDS = PNF.cycles * (PNF.stretch + PNF.contract + PNF.relax) + PNF.final;

const it = (id, seconds, extra = {}) => ({ id, seconds, ...extra });
const pnf = (id, section) => ({ id, seconds: PNF_SECONDS, mode: 'pnf', section });

// ---------- Tägliche Routine ----------
// Kern: jeden Tag gleich (deine bisherige tägliche Routine, leicht verdichtet)
export const CORE = [
  it('ninety-switch', 45, { prio: 3 }),
  it('hip-flexor', 40, { prio: 3 }),
  it('pigeon', 40, { prio: 3 }),
  it('frog', 45, { prio: 2 }),
  it('hamstring-supine', 40, { prio: 3 }),
  it('deep-squat', 45, { prio: 2 }),
  it('calf-wall', 30, { prio: 1 }),
];

// Tagesfokus: wechselt mit dem Wochentag (0 = Montag) und bringt den Rest
// des Körpers über die Woche auf seine Minuten.
export const FOCUS = [
  { day: 0, name: 'Brustwirbelsäule', regions: ['tspine'], items: [it('open-book', 30), it('thread-needle', 30)] },
  { day: 1, name: 'Schultern & Brust', regions: ['shoulders', 'chest'], items: [it('wall-slide', 40, { mode: 'active' }), it('doorway-pec', 30)] },
  { day: 2, name: 'Sprunggelenk & Füße', regions: ['calves'], items: [it('knee-to-wall', 30), it('shin-stretch', 40)] },
  { day: 3, name: 'Handgelenke & Nacken', regions: ['wrists', 'neck'], items: [it('wrist-rock', 40), it('neck-side', 25)] },
  { day: 4, name: 'Hüftrotation aktiv', regions: ['hiprot'], items: [it('ninety-liftoff', 30, { mode: 'active' }), it('hip-cars', 30)] },
  { day: 5, name: 'Rücken & Seiten', regions: ['lowback', 'shoulders'], items: [it('cat-cow', 40), it('child-side', 30)] },
  { day: 6, name: 'Atmung & Entspannung', regions: [], items: [it('child-pose', 45), it('breath-9090', 60)] },
];

// ---------- Tiefe Einheiten ----------
export const DEEP = [
  {
    id: 'deep-a',
    letter: 'A',
    name: 'Tief A · Hüfte & Spagat',
    short: 'Hüfte & Spagat',
   
    regions: ['hipflex', 'hamstrings', 'adductors', 'hiprot'],
    description: 'Öffnet die Hüfte in alle Richtungen und baut Kraft in der Dehnung auf – für Kicks, tiefe Stände und den Weg zum Spagat.',
    items: [
      it('leg-swing', 30, { section: 'Aufwärmen' }),
      it('leg-swing-side', 30, { section: 'Aufwärmen' }),
      it('hip-cars', 30, { section: 'Aufwärmen' }),
      it('worlds-greatest', 40, { section: 'Aufwärmen' }),
      pnf('hip-flexor', 'Anspannen-Loslassen'),
      pnf('half-split', 'Anspannen-Loslassen'),
      pnf('frog', 'Anspannen-Loslassen'),
      it('cossack', 60, { mode: 'active', section: 'Kraft in der Dehnung' }),
      it('ninety-liftoff', 30, { mode: 'active', section: 'Kraft in der Dehnung' }),
      it('leg-raise-front', 36, { mode: 'active', section: 'Kraft in der Dehnung' }),
      it('leg-raise-side', 36, { mode: 'active', section: 'Kraft in der Dehnung' }),
      it('lizard', 90, { section: 'Lange halten' }),
      it('straddle', 120, { section: 'Lange halten' }),
      it('breath-9090', 90, { section: 'Ausklang' }),
    ],
  },
  {
    id: 'deep-c',
    letter: 'C',
    name: 'Tief C · Beinrückseite',
    short: 'Beinrückseite',
   
    regions: ['hamstrings', 'calves', 'lowback'],
    description: 'Beinbeuger, Waden und unterer Rücken – für eine tiefe Vorbeuge, eine saubere Kniebeuge und lockere Beine nach dem Laufen.',
    items: [
      it('leg-swing', 30, { section: 'Aufwärmen' }),
      it('cat-cow', 40, { section: 'Aufwärmen' }),
      it('squat-shift', 45, { section: 'Aufwärmen' }),
      pnf('hamstring-supine', 'Anspannen-Loslassen'),
      pnf('straddle', 'Anspannen-Loslassen'),
      pnf('calf-wall', 'Anspannen-Loslassen'),
      it('pancake-reach', 45, { mode: 'active', section: 'Kraft in der Dehnung' }),
      it('leg-raise-front', 36, { mode: 'active', section: 'Kraft in der Dehnung' }),
      it('cossack', 45, { mode: 'active', section: 'Kraft in der Dehnung' }),
      it('half-split', 90, { section: 'Lange halten' }),
      it('seated-pike', 120, { section: 'Lange halten' }),
      it('deep-squat', 90, { section: 'Lange halten' }),
      it('knees-chest', 45, { section: 'Ausklang' }),
      it('breath-9090', 60, { section: 'Ausklang' }),
    ],
  },
];

// ---------- Hilfen ----------
export function itemSeconds(item, prep) {
  const ex = exercise(item.id);
  if (!ex) return 0;
  return prep + item.seconds * (ex.sides ? 2 : 1) + (ex.sides ? SWITCH_SECONDS : 0);
}
export function routineSeconds(items, prep) {
  return items.reduce((n, item) => n + itemSeconds(item, prep), 0);
}

// Routine auf ein Zeitbudget bringen: erst Zeiten anpassen, dann
// unwichtige Übungen weglassen. Die wichtigsten Übungen bleiben.
export function fitToBudget(items, budgetMin, prep) {
  const target = budgetMin * 60;
  let list = items.map((x) => ({ ...x }));
  const total = () => routineSeconds(list, prep);
  const holdCap = (x) => (x.mode === 'active' || exercise(x.id)?.kind === 'dynamic' ? 60 : 90);
  if (total() > target) {
    // Kürzen bis 25 s, danach Übungen mit niedriger Priorität weglassen
    const fixed = list.reduce((n, x) => n + prep + (exercise(x.id).sides ? SWITCH_SECONDS : 0), 0);
    const work = list.reduce((n, x) => n + x.seconds * (exercise(x.id).sides ? 2 : 1), 0);
    const f = Math.max(0.6, (target - fixed) / work);
    list = list.map((x) => ({ ...x, seconds: Math.max(25, Math.round((x.seconds * f) / 5) * 5) }));
    while (total() > target && list.length > 3) {
      let drop = -1;
      list.forEach((x, i) => { if (drop < 0 || (x.prio ?? 2) < (list[drop].prio ?? 2)) drop = i; });
      list.splice(drop, 1);
    }
  } else if (total() < target * 0.85) {
    const f = Math.min(1.6, target / Math.max(1, total()));
    list = list.map((x) => ({ ...x, seconds: Math.min(holdCap(x), Math.round((x.seconds * f) / 5) * 5) }));
  }
  return list;
}
