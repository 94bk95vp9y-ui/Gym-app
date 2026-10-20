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
// Kurze Pause zwischen zwei Sätzen derselben Übung
export const SET_REST = 10;

// Anspannen-Loslassen: erst dehnen (lead), dann Durchgänge aus Anspannen,
// Loslassen und tieferem Halten. Ein Plan kann das pro Eintrag anpassen
// (item.pnf), Standard sind 3 Durchgänge mit 20 s Halten.
export const PNF = { lead: 20, cycles: 3, contract: 6, relax: 3, hold: 20 };
export const pnfOf = (item) => ({ ...PNF, ...(item?.pnf || {}) });
export const pnfSeconds = (cfg = PNF) => cfg.lead + cfg.cycles * (cfg.contract + cfg.relax + cfg.hold);
export const PNF_SECONDS = pnfSeconds(PNF);

const it = (id, seconds, extra = {}) => ({ id, seconds, ...extra });
const pnf = (id, section, cfg = null, extra = {}) => ({
  id, seconds: pnfSeconds({ ...PNF, ...(cfg || {}) }), mode: 'pnf', section, ...(cfg ? { pnf: cfg } : {}), ...extra,
});

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

// ---------- Beinplan ----------
// Vier Blöcke: Aufwärmen, belastet in tiefer Position, statisch dehnen,
// aktive Beweglichkeit. An den Tagen ohne Gewicht fällt Block 2 weg, dafür
// gibt es in Block 4 einen dritten Satz.
const WARMUP = 'Aufwärmen';
const LOADED = 'Belastet in tiefer Position';
const STATIC = 'Statisch dehnen';
const ACTIVE = 'Aktive Beweglichkeit';

function legPlan(withWeight) {
  return [
    it('leg-swing', 20, {
      section: WARMUP,
      ex: { tempo: '10× vor und zurück, Schwung langsam steigern', cues: ['An der Wand festhalten, Oberkörper aufrecht.', '10× vor und zurück schwingen.', 'Den Schwung langsam steigern.'] },
    }),
    it('leg-swing-side', 20, {
      section: WARMUP,
      ex: { tempo: '10× seitlich, Schwung langsam steigern', cues: ['An der Wand festhalten, Oberkörper aufrecht.', '10× zur Seite schwingen.', 'Den Schwung langsam steigern.'] },
    }),
    it('deep-squat', 40, {
      section: WARMUP,
      ex: { name: 'Tiefe Kniebeuge halten', cues: ['Füße schulterbreit, leicht nach außen.', 'So tief wie möglich, Fersen bleiben am Boden.', 'Ellbogen drücken die Knie nach außen.'] },
    }),
    ...(withWeight ? [
      it('cossack-loaded', 60, { section: LOADED, sets: 2 }),
      it('rdl', 52, { section: LOADED, sets: 2 }),
    ] : []),
    it('hamstring-supine', 45, {
      section: STATIC,
      sets: 2,
      ex: { name: 'Beinbeuger liegend', cues: ['Auf dem Rücken, Gurt oder Handtuch um den Fußballen.', 'Gestrecktes Bein zur Decke ziehen.', 'Becken bleibt am Boden, Fuß locker.'] },
    }),
    it('frog', 60, {
      section: STATIC,
      sets: 2,
      ex: { cues: ['Vierfüßler, Knie weit auseinander, Unterschenkel parallel.', 'Polster unter die Knie.', 'Gesäß Richtung Fersen schieben.'] },
    }),
    it('couch-stretch', 45, {
      section: STATIC,
      sets: 2,
      ex: {
        cues: ['Hinteres Knie am Boden, Fuß an Wand oder Sofa.', 'Oberkörper aufrecht, Gesäß anspannen.', 'Nicht ins Hohlkreuz fallen.'],
        easier: 'Tiefer Ausfallschritt ohne Wand.',
      },
    }),
    it('figure-four', 45, {
      section: STATIC,
      sets: 2,
      ex: { name: 'Figur-4 liegend', cues: ['Rückenlage, Knöchel auf das gegenüberliegende Knie.', 'Dieses Bein zur Brust ziehen.', 'Ruhig atmen, Schultern bleiben locker.'], harder: 'Später: die Taube.' },
    }),
    // Waden: erst mit gestrecktem, dann mit leicht gebeugtem Knie
    it('calf-wall', 45, {
      section: STATIC,
      ex: { cues: ['Hinteres Bein gestreckt, Ferse am Boden.', 'Hüfte nach vorn schieben.', 'Ruhig halten.'] },
    }),
    it('soleus-wall', 45, {
      section: STATIC,
      ex: { cues: ['Wie eben, jetzt das hintere Knie leicht beugen.', 'Ferse bleibt am Boden.', 'Die Dehnung wandert tiefer in die Wade.'] },
    }),
    it('leg-raise-front-hold', 48, {
      section: ACTIVE,
      sets: withWeight ? 2 : 3,
      ex: { cues: ['Hand an der Wand, aufrecht stehen.', 'Gestrecktes Bein langsam und ohne Schwung so hoch wie möglich heben.', 'Oben 5 Sekunden halten, langsam senken.'] },
    }),
    it('leg-raise-side-hold', 48, {
      section: ACTIVE,
      sets: withWeight ? 2 : 3,
      ex: { cues: ['Hand an der Wand, Oberkörper aufrecht.', 'Gestrecktes Bein zur Seite heben, Zehen zeigen nach vorn.', 'Oben 5 Sekunden halten, langsam senken.'] },
    }),
  ];
}

export const LEG_PLAN = [
  {
    id: 'legs-weight',
    short: 'Mit Gewicht',
    name: 'Beinplan · mit Gewicht',
    description: 'Aufwärmen, belastet in tiefer Position (Kurzhantel oder Kettlebell), statisch dehnen, aktive Beweglichkeit.',
    items: legPlan(true),
  },
  {
    id: 'legs-light',
    short: 'Ohne Gewicht',
    name: 'Beinplan · ohne Gewicht',
    description: 'Für die anderen Tage: ohne den Block mit Gewicht, dafür ein Satz mehr aktive Beweglichkeit.',
    items: legPlan(false),
  },
];

// ---------- Hilfen ----------
export function itemSeconds(item, prep) {
  const ex = exercise(item.id);
  if (!ex) return 0;
  const sets = item.sets || 1;
  const work = item.seconds * (ex.sides ? 2 : 1) + (ex.sides ? SWITCH_SECONDS : 0);
  return prep + sets * work + (sets - 1) * (item.rest ?? SET_REST);
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

// ---------- Tägliche Mobility-Routine für hohe Kicks ----------
// Nach deinem Plan (PDF): jeden Tag gleich, ca. 55 Minuten, getrennt vom Gym.
// Fünf Teile: A Aufwärmen, B statisch und Anspannen-Loslassen, C aktive
// Beweglichkeit, D kontrollierte Kicks, E Kraft in Dehnposition.
// Varianten: „Kurz“ halbiert Teil B, „Nach Beintag“ macht Teil E nur
// einen Satz (bei starkem Muskelkater).
const KA = 'A · Aufwärmen';
const KB = 'B · Statisch und PNF dehnen';
const KC = 'C · Aktive Beweglichkeit';
const KD = 'D · Kontrollierte Kicks';
const KE = 'E · Kraft in Dehnposition';
const INTENSITY = 'Dehnintensität 6–7 von 10: deutliches Ziehen, ruhiges Atmen noch möglich.';

export const KICK_RULES = [
  'Nicht direkt vor dem Gym-Beintag – an diesem Tag nach dem Gym oder zu einer anderen Tageszeit.',
  'Am Tag nach dem Beintag bei starkem Muskelkater: Variante „Nach Beintag“ (Teil E nur 1 Satz, Dehnintensität 5–6).',
  'Fällt ein Tag aus, nicht nachholen.',
  'Wenn 55 Minuten zu lang werden: Variante „Kurz“ (Teil B halbiert).',
  `${INTENSITY} Abbrechen bei stechendem Schmerz, Gelenkschmerz, Kribbeln oder Taubheit.`,
  'Teil E: jeden Satz 2–3 Wiederholungen vor der Erschöpfung beenden, nie bis zum Muskelversagen.',
  'Die Kicks in Teil D ersetzen kein Techniktraining – die Technik selbst sollte dir ein Trainer zeigen.',
];

const HAM_PNF = { lead: 20, cycles: 2, contract: 5, relax: 2, hold: 20 };
const FROG_PNF = { lead: 0, cycles: 3, contract: 5, relax: 2, hold: 20 };
const HAM_TEXT = {
  name: 'Beinheben mit Gurt',
  cues: [
    'Rückenlage, ein Bein gestreckt am Boden, der Oberschenkel bleibt unten.',
    'Gurt um den Fußballen, das gestreckte Bein nach oben ziehen, bis es hinten deutlich zieht.',
    'Becken flach am Boden, Knie gestreckt, Fuß locker.',
  ],
  mistakes: ['Fuß stark anziehen (verstärkt den Nervenzug, Kribbeln möglich).', 'Becken hebt sich.', 'Knie beugt sich.'],
};

function kickPlan({ short = false, sore = false } = {}) {
  // Teil B halbieren: halbe Haltezeit bzw. halbe Satzzahl
  const half = (seconds) => (short ? Math.max(20, Math.round(seconds / 2 / 5) * 5) : seconds);
  const halfSets = (sets) => (short ? Math.ceil(sets / 2) : sets);
  const eSets = sore ? 1 : 2;
  return [
    it('jump-rope', 180, { section: KA }),
    it('leg-swing', 25, {
      section: KA,
      ex: {
        name: 'Beinpendeln vor und zurück',
        tempo: '12 pro Seite – klein anfangen, jede Wiederholung etwas höher',
        cues: ['Seitlich zur Wand, eine Hand an der Wand, Standbein minimal gebeugt.', 'Das äußere Bein locker gestreckt vor und zurück schwingen.', 'Klein anfangen, mit jeder Wiederholung etwas höher. Oberkörper bleibt aufrecht.'],
        mistakes: ['Mit dem Oberkörper mitschaukeln, um Höhe zu schummeln.'],
      },
    }),
    it('leg-swing-side', 25, {
      section: KA,
      ex: {
        name: 'Beinpendeln seitlich',
        tempo: '12 pro Seite – nach außen immer etwas höher',
        cues: ['Gesicht zur Wand, beide Hände an der Wand.', 'Ein Bein vor dem Körper seitlich hin und her schwingen.', 'Nach außen immer etwas höher.'],
      },
    }),
    it('calf-step', 75, { section: KB, sets: halfSets(2) }),
    it('calf-step-bent', half(60), { section: KB }),
    it('hamstring-supine', half(60), { section: KB, ex: { ...HAM_TEXT, name: 'Beinheben mit Gurt · statisch' } }),
    pnf('hamstring-supine', KB, HAM_PNF, {
      sets: halfSets(2),
      ex: {
        ...HAM_TEXT,
        name: 'Beinheben mit Gurt · PNF',
        pnf: 'Ferse mit etwa halber Kraft gegen den Gurt nach unten drücken – das Bein bewegt sich nicht.',
      },
    }),
    it('couch-stretch', 75, {
      section: KB,
      sets: halfSets(2),
      ex: {
        cues: ['Vor Wand oder Sofakante knien, Kissen unter das hintere Knie, Unterschenkel senkrecht an der Wand.', 'Gesäß des hinteren Beins fest anspannen, Becken leicht nach hinten kippen.', 'Dann den Oberkörper langsam aufrichten – das Ziehen ist vorn an Hüfte und Oberschenkel, nicht im unteren Rücken.'],
        mistakes: ['Hohlkreuz statt Hüftstreckung.', 'Gesäß nicht angespannt.'],
        easier: 'Knie weiter von der Wand weg, Hände auf dem vorderen Knie abstützen.',
      },
    }),
    it('pigeon', 60, {
      section: KB,
      sets: halfSets(2),
      ex: {
        cues: ['Aus dem Vierfüßlerstand ein Knie nach vorn hinter die Hand derselben Seite, Unterschenkel schräg.', 'Das andere Bein gestreckt nach hinten schieben, Becken gerade nach unten sinken lassen.', 'Für mehr Dehnung den Oberkörper mit geradem Rücken nach vorn ablegen.'],
        mistakes: ['Schmerz im vorderen Knie ignorieren.', 'Becken kippt zur Seite.'],
        easier: 'Bei Knieschmerz: Figur 4 in Rückenlage. Kommt die Hüfte nicht zum Boden, ein Kissen darunter.',
      },
    }),
    it('frog', half(90), {
      section: KB,
      ex: {
        cues: ['Vierfüßlerstand auf weicher Matte, Knie weit auseinander und im rechten Winkel, Unterschenkel parallel.', 'Auf die Unterarme gehen, Rücken gerade.', 'Gesäß langsam nach hinten Richtung Fersen schieben, bis es innen zieht.'],
        mistakes: ['Ins Hohlkreuz fallen.'],
      },
    }),
    pnf('frog', KB, short ? { ...FROG_PNF, cycles: 2 } : FROG_PNF, {
      ex: { name: 'Frosch · PNF', pnf: 'Knie mit halber Kraft in den Boden drücken, als wolltest du sie zusammenziehen.' },
    }),
    it('straddle', half(90), {
      section: KB,
      ex: {
        name: 'Grätschsitz',
        cues: ['Beine gestreckt maximal grätschen, Knie und Zehen zeigen zur Decke.', 'Aufrecht sitzen – bei Rundrücken auf ein Kissen.', 'Mit geradem Rücken die Brust nach vorn Richtung Boden – die Bewegung kommt aus der Hüfte.'],
        mistakes: ['Rücken rund machen.', 'Knie nach innen drehen lassen.'],
      },
    }),
    it('seated-leg-lift', 54, { section: KC, sets: 2 }),
    it('leg-raise-front-3', 46, {
      section: KC,
      sets: 2,
      ex: {
        cues: ['Seitlich zur Wand, eine Hand an der Wand, aufrecht stehen.', 'Gestrecktes Bein in 2 Sekunden nach vorn so hoch wie möglich heben.', 'Oben 3 Sekunden halten, in 2 Sekunden ablassen – kein Schwung.'],
        mistakes: ['Nach hinten lehnen.', 'Standbein beugen.'],
      },
    }),
    it('leg-raise-side-3', 46, {
      section: KC,
      sets: 2,
      ex: {
        cues: ['Hand an Wand oder Stuhllehne, aufrecht stehen.', 'Gestrecktes Bein seitlich so hoch wie möglich heben, Zehen zeigen nach vorn.', 'Oben 3 Sekunden halten, langsam ablassen. Oberkörper möglichst aufrecht.'],
        mistakes: ['Oberkörper weit zur Seite kippen.', 'Bein nach vorn drehen, um höher zu kommen.'],
      },
    }),
    it('knee-hold', 44, { section: KC, sets: 2 }),
    it('kick-front-slow', 37, { section: KD }),
    it('kick-side-slow', 37, { section: KD }),
    it('kick-round-slow', 37, { section: KD }),
    it('kick-set', 25, { section: KD }),
    it('cossack-slow', 75, { section: KE, sets: eSets }),
    it('single-leg-rdl', 46, { section: KE, sets: eSets }),
    it('split-squat-deep', 50, { section: KE, sets: eSets }),
    it('hanging-leg-raise', 46, { section: KE, sets: eSets }),
    it('copenhagen', 18, { section: KE, sets: eSets, mode: 'hold' }),
    it('side-lying-abduction', 50, { section: KE, sets: eSets }),
  ];
}

export const KICK_PLAN = [
  {
    id: 'kicks-full',
    short: 'Komplett',
    name: 'Kick-Routine · komplett',
    description: `Hüft- und Beinbeweglichkeit für hohe Kicks: Aufwärmen, Dehnen mit Anspannen-Loslassen, aktive Beweglichkeit, Kicks in Zeitlupe und Kraft in der Dehnposition. ${INTENSITY}`,
    items: kickPlan(),
  },
  {
    id: 'kicks-short',
    short: 'Kurz',
    name: 'Kick-Routine · kurz',
    description: 'Wie die komplette Routine, aber Teil B halbiert – für Tage, an denen 55 Minuten zu lang sind.',
    items: kickPlan({ short: true }),
  },
  {
    id: 'kicks-sore',
    short: 'Nach Beintag',
    name: 'Kick-Routine · nach Beintag',
    description: 'Bei starkem Muskelkater am Tag nach dem Beintag: Teil E nur 1 Satz, beim Dehnen nur Intensität 5–6.',
    items: kickPlan({ sore: true }),
  },
];

// ---------- Mobility-Plan Unterkörper ----------
// Nach deinem zweiten Plan (PDF): jeden Tag gleich, ca. 63 Minuten. Kraft
// und Kontrolle vor dem Dehnen. Nerv-Gleiten und Kicks sind optional und
// lassen sich in der Vorschau zuschalten.
const L1 = '01 · Aufwärmen';
const L2 = '02 · Aktive Kontrolle';
const L3 = '03 · Kraft in Dehnposition';
const L4 = '04 · Dehnen';
const L5 = '05 · Optional: Kicks';
export const OPTIONAL_LABELS = { nerve: 'Nerv-Gleiten', kicks: 'Kicks' };
// Wiederholungen und Haltezeiten starten am unteren Ende der Spannen aus dem
// Plan (z. B. 8 von 8–12) – gesteigert wird über die schwereren Varianten.
const LOWER_PNF = { lead: 0, cycles: 3, contract: 5, relax: 2, hold: 20 };

export const LOWER_RULES = [
  'Jeden Tag alle Abschnitte in derselben Reihenfolge. Kraft und Kontrolle kommen vor dem Dehnen, weil sie frische Muskeln brauchen.',
  'Ausführung vor Höhe: lieber weniger Bewegungsweite und sauber als mehr mit Schwung oder Ausweichbewegung.',
  'Wird eine Übung leicht, nutze die schwerere Variante, die bei der Übung steht.',
  'Beine mehrere Tage müde: im Kraftabschnitt eine Gewichtsstufe zurück.',
  'Ein Tag fällt aus: nicht nachholen, am nächsten Tag normal weiter.',
  'Fortschritt: alle 2 Wochen unter gleichen Bedingungen filmen – Beinheben vorn und seitlich und Vorbeugen im Stand.',
  'Sofort abbrechen bei stechendem Schmerz, Gelenkschmerz, Kribbeln oder Taubheit, das nicht direkt wieder weggeht. Bei wiederkehrenden Beschwerden fachlich abklären lassen.',
  'Kraftabschnitt: immer in 3 Sekunden absenken, moderates Gewicht, jeden Satz deutlich vor dem Muskelversagen beenden. Die App zählt das untere Ende der Spannen (z. B. 8 von 8–12) – schaffst du sauber mehr, mach mehr.',
  'Die Kicks ersetzen kein Techniktraining – die genaue Technik sollte dir ein Trainer zeigen.',
];

export const LOWER_PLAN = [{
  id: 'lower-body',
  short: 'Unterkörper',
  name: 'Mobility-Plan Unterkörper',
  description: 'Mehr Beweglichkeit und Kraft in Beinen und Hüfte: Aufwärmen, aktive Kontrolle, Kraft in Dehnposition, Dehnen. Optional Nerv-Gleiten und Kicks.',
  items: [
    it('jump-rope', 180, {
      section: L1,
      ex: {
        tempo: 'Locker starten, nach etwa einer Minute steigern',
        cues: ['Zügig auf der Stelle marschieren, Seilspringen, Hampelmänner oder Treppensteigen.', 'Locker starten und nach etwa einer Minute das Tempo steigern.', 'Bis du leicht schwitzt und schneller atmest, aber noch sprechen könntest.'],
        mistakes: ['Zu locker, dann wirst du nicht warm.', 'Zu intensiv, dann fehlt Kraft für den Rest.'],
      },
    }),
    it('hip-cars-slow', 54, { section: L1 }),
    it('leg-swing', 30, {
      section: L1,
      ex: {
        name: 'Beinpendeln vor und zurück',
        tempo: '15 pro Seite – die ersten 3–4 klein, dann mit jedem Schwung etwas höher',
        cues: ['Seitlich zur Wand, innere Hand auf Schulterhöhe, Standknie minimal gebeugt.', 'Das äußere Bein locker gestreckt nach vorn und hinten schwingen, der Fuß bleibt locker.', 'Nach hinten nur so weit, dass kein Hohlkreuz entsteht.'],
        mistakes: ['Oberkörper schaukelt mit oder rundet sich.', 'Sofort maximal hoch schwingen.'],
      },
    }),
    it('leg-swing-side', 30, {
      section: L1,
      ex: {
        name: 'Beinpendeln seitlich',
        tempo: '15 pro Seite – nach außen jedes Mal etwas höher',
        cues: ['Gesicht zur Wand, ein Schritt Abstand, beide Hände auf Schulterhöhe.', 'Ein Bein vor dem Körper quer nach innen, dann nach außen schwingen.', 'Zehen zeigen nach vorn, Becken bleibt zur Wand ausgerichtet.'],
        mistakes: ['Standbein knickt ein.', 'Hüfte dreht mit, um mehr Höhe zu bekommen.'],
      },
    }),
    it('deep-squat', 60, {
      section: L1,
      ex: {
        cues: ['Füße schulterbreit oder etwas weiter, Zehen 15–30° nach außen.', 'Hüfte nach hinten unten, so tief es geht – Fersen bleiben am Boden, Knie zeigen zu den Zehen.', 'Hände vor der Brust, Ellbogen drücken die Knie sanft nach außen. Brust aufrecht, tief atmen.'],
        easier: 'An einem Türrahmen festhalten. Heben die Fersen ab, eine dünne Unterlage darunter.',
      },
    }),
    it('nerve-floss', 20, { section: L1, optional: 'nerve' }),
    it('seated-leg-lift', 48, {
      section: L2,
      sets: 3,
      ex: {
        tempo: 'Bein 5–10 cm heben, 2 Sek halten, in 2 Sek ablegen – 8 pro Seite',
        harder: 'Hände weiter vorn Richtung Knöchel, später Gewichtsmanschette.',
      },
    }),
    it('leg-raise-front-3', 46, {
      section: L2,
      sets: 3,
      ex: {
        cues: ['Seitlich zur Wand, innere Hand auf Schulterhöhe, Standknie gestreckt, nicht durchgedrückt.', 'Bauch leicht fest, das gestreckte Bein in 2 Sekunden so hoch wie möglich heben.', 'Oben 3 Sekunden nur mit Muskelkraft halten, in 2 Sekunden ablassen.'],
        mistakes: ['Nach hinten lehnen.', 'Standbein beugt sich.', 'Becken rollt ein, Rücken rundet sich.', 'Schwung.'],
        harder: 'Länger halten (bis 6 Sekunden), dann Gewichtsmanschette 0,5 kg.',
      },
    }),
    it('leg-raise-side-3', 46, {
      section: L2,
      sets: 3,
      ex: {
        cues: ['An Wand oder Stuhllehne festhalten, aufrecht stehen.', 'Das gestreckte Bein in 2 Sekunden seitlich abspreizen – Zehen und Knie zeigen nach vorn.', 'Oben 3 Sekunden halten, in 2 Sekunden ablassen.'],
        mistakes: ['Bein dreht nach außen, Zehen zeigen nach oben.', 'Oberkörper kippt stark zur Seite.'],
        harder: 'Länger halten, dann Gewichtsmanschette.',
      },
    }),
    it('leg-raise-back', 61, { section: L2, sets: 2 }),
    it('liftoff-strap', 95, { section: L2, sets: 2 }),
    it('knee-hold', 44, { section: L2, sets: 2, ex: { harder: 'Gewichtsmanschette am Knöchel.' } }),
    it('ninety-switch', 29, {
      section: L2,
      sets: 2,
      ex: {
        name: '90/90-Wechsel',
        tempo: '8 Wechsel, auf jeder Seite aufrichten und 1 Sekunde halten',
        cues: ['Im 90/90-Sitz aufrecht, Hände anfangs hinten aufstützen.', 'Beide Knie gleichzeitig anheben und zur anderen Seite kippen – die Fersen sind der Drehpunkt.', 'Auf der anderen Seite aufrichten, 1 Sekunde halten, zurück.'],
        mistakes: ['Rundrücken.', 'Knie mit Schwung fallen lassen. Bei Kniedruck kleiner bewegen.'],
        easier: 'Hände hinten aufstützen.',
        harder: 'Ohne Hände, Arme vor der Brust verschränkt.',
      },
    }),
    it('rdl', 52, {
      section: L3,
      sets: 2,
      rest: 60,
      ex: {
        tempo: '3 Sek absenken, 1 Sek halten, aufrichten – 8–12',
        cues: ['Füße hüftbreit, Kurzhanteln vor den Oberschenkeln, Knie 15–20° gebeugt, Rücken gerade.', 'Hüfte nach hinten schieben, die Hanteln gleiten in 3 Sekunden nah an den Beinen nach unten.', 'Stopp, sobald es hinten deutlich zieht (meist Schienbeinmitte), 1 Sekunde halten, Gesäß anspannen und aufrichten.'],
        mistakes: ['Rücken rundet sich.', 'Knie beugen sich immer mehr.', 'Hanteln weit weg vom Körper.'],
        harder: '1–2 kg pro Hand mehr, wenn du in beiden Sätzen 12 saubere Wiederholungen schaffst.',
      },
    }),
    it('cossack-slow', 75, {
      section: L3,
      sets: 2,
      rest: 30,
      ex: { tempo: '3 Sek runter, unten 2 Sek halten, über die Ferse hochdrücken – 6–10 pro Seite', harder: 'Eine Kurzhantel vor der Brust – hilft auch als Gegengewicht.' },
    }),
    it('split-squat-db', 57, { section: L3, sets: 2, rest: 30 }),
    it('calf-raise-eccentric', 60, { section: L3, sets: 2, rest: 30 }),
    it('copenhagen', 20, {
      section: L3,
      sets: 2,
      rest: 30,
      mode: 'hold',
      ex: { tempo: '15–30 Sekunden halten', harder: 'Knöchel statt Knie auf die Bank – erst wenn 30 Sekunden sicher gehen.' },
    }),
    it('hanging-leg-raise', 35, {
      section: L3,
      sets: 2,
      rest: 60,
      ex: {
        name: 'Beinheben gestreckt',
        tempo: '2 Sek heben, 1 Sek halten, 3 Sek ablassen – 6–10',
        easier: 'Reihenfolge: liegend mit Manschette, dann hängend mit gebeugten Knien, dann hängend gestreckt.',
      },
    }),
    it('side-lying-abduction', 46, {
      section: L3,
      sets: 2,
      rest: 30,
      ex: { tempo: 'So hoch wie möglich, 1 Sek halten, in 2–3 Sek ablassen – 10–15 pro Seite', harder: 'Schwerere Manschette (0,5–2 kg).' },
    }),
    it('hamstring-supine', 60, { section: L4, ex: { ...HAM_TEXT, name: 'Beinrückseite mit Gurt · statisch' } }),
    pnf('hamstring-supine', L4, LOWER_PNF, {
      ex: { ...HAM_TEXT, name: 'Beinrückseite mit Gurt · PNF', pnf: 'Ferse mit etwa halber Kraft gegen den Gurt nach unten drücken – das Bein bewegt sich nicht.' },
    }),
    it('couch-stretch', 60, {
      section: L4,
      sets: 2,
      ex: {
        cues: ['Vor Wand oder Sofakante knien, Kissen unter das hintere Knie, Fußrücken zur Wand, vorderes Knie über dem Knöchel.', 'Hände aufs vordere Knie, Gesäß hinten fest anspannen, Becken nach hinten kippen.', 'Erst dann den Oberkörper langsam aufrichten, bis es vorn an Hüfte und Oberschenkel zieht.'],
        mistakes: ['Hohlkreuz statt Dehnung vorn an der Hüfte.', 'Gesäß nicht angespannt.', 'Kniedruck: mehr Polster.'],
        easier: 'Hüftbeuger-Dehnung im halben Kniestand ohne Wand, gleiche Technik.',
      },
    }),
    it('calf-step', 60, { section: L4, sets: 2, ex: { harder: 'Einbeinig.' } }),
    it('calf-step-bent', 45, { section: L4 }),
    it('frog', 60, {
      section: L4,
      ex: {
        cues: ['Vierfüßlerstand auf weicher Unterlage, Kissen unter den Knien, Knie weit auseinander und im rechten Winkel.', 'Unterschenkel parallel nach hinten, auf die Unterarme gehen, Rücken gerade.', 'Gesäß langsam Richtung Fersen schieben, bis es innen zieht.'],
        mistakes: ['Ins Hohlkreuz fallen.', 'Füße drehen nach innen.', 'Schmerz innen am Knie: weniger weit öffnen, mehr Polster.'],
      },
    }),
    pnf('frog', L4, LOWER_PNF, { ex: { name: 'Frosch · PNF', pnf: 'Knie mit halber Kraft in den Boden drücken, als wolltest du sie zusammenziehen.' } }),
    it('pigeon', 60, {
      section: L4,
      ex: {
        cues: ['Aus dem Vierfüßlerstand ein Knie hinter die Hand derselben Seite, Unterschenkel schräg, das andere Bein gestreckt nach hinten.', 'Becken gerade sinken lassen, beide Hüftknochen zeigen nach vorn. Erst 15–20 Sekunden aufrecht bleiben.', 'Dann mit geradem Rücken auf die Unterarme ablegen und weiter halten.'],
        mistakes: ['Becken kippt zur Seite.', 'Schmerz im vorderen Knie ignorieren – Unterschenkel näher ran oder Figur 4.'],
        easier: 'Bei Kniedruck: Figur 4 in Rückenlage.',
      },
    }),
    it('straddle', 60, {
      section: L4,
      ex: {
        name: 'Grätschsitz',
        cues: ['Beine gestreckt so weit gegrätscht, wie es angenehm geht – Knie und Zehen zur Decke.', 'Aufrecht sitzen, Becken nach vorn kippen, Hände vor dir auf den Boden.', 'Mit geradem Rücken die Brust nach vorn – stoppen bei 6–7 von 10 oder wenn der Rücken rund wird.'],
        mistakes: ['Rücken rund machen.', 'Knie drehen nach innen.', 'Füße kippen nach vorn.'],
      },
    }),
    it('kick-front-slow', 37, { section: L5, optional: 'kicks' }),
    it('kick-side-slow', 37, { section: L5, optional: 'kicks' }),
    it('kick-round-slow', 37, { section: L5, optional: 'kicks' }),
    it('kick-set', 25, { section: L5, optional: 'kicks' }),
  ],
}];
