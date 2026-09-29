// Pläne des Mobility-Bereichs: tägliche Routine (Kern + Tagesfokus),
// tiefe Einheiten, Routinen für bestimmte Situationen, Ziel-Programme und die
// Beweglichkeits-Tests.
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
// ein wechselnder Fokus-Block für den Rest des Körpers und 1–2 tiefe
// Einheiten pro Woche mit anderen Methoden.

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
  { day: 0, name: 'Brustwirbelsäule', icon: '🌀', regions: ['tspine'], items: [it('open-book', 30), it('thread-needle', 30)] },
  { day: 1, name: 'Schultern & Brust', icon: '🙆', regions: ['shoulders', 'chest'], items: [it('wall-slide', 40, { mode: 'active' }), it('doorway-pec', 30)] },
  { day: 2, name: 'Sprunggelenk & Füße', icon: '🦶', regions: ['calves'], items: [it('knee-to-wall', 30), it('shin-stretch', 40)] },
  { day: 3, name: 'Handgelenke & Nacken', icon: '✋', regions: ['wrists', 'neck'], items: [it('wrist-rock', 40), it('neck-side', 25)] },
  { day: 4, name: 'Hüftrotation aktiv', icon: '🔄', regions: ['hiprot'], items: [it('ninety-liftoff', 30, { mode: 'active' }), it('hip-cars', 30)] },
  { day: 5, name: 'Rücken & Seiten', icon: '🌿', regions: ['lowback', 'shoulders'], items: [it('cat-cow', 40), it('child-side', 30)] },
  { day: 6, name: 'Atmung & Entspannung', icon: '🌙', regions: [], items: [it('child-pose', 45), it('breath-9090', 60)] },
];

// ---------- Tiefe Einheiten ----------
export const DEEP = [
  {
    id: 'deep-a',
    letter: 'A',
    name: 'Tief A · Hüfte & Spagat',
    short: 'Hüfte & Spagat',
    icon: '🦵',
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
    id: 'deep-b',
    letter: 'B',
    name: 'Tief B · Rücken & Schultern',
    short: 'Rücken & Schultern',
    icon: '🙆',
    regions: ['tspine', 'shoulders', 'chest', 'neck'],
    description: 'Dreht und streckt den oberen Rücken und befreit die Schultern – gegen Schreibtisch-Haltung, für Überkopf-Kraft und eine lockere Deckung.',
    items: [
      it('cat-cow', 45, { section: 'Aufwärmen' }),
      it('towel-dislocate', 40, { section: 'Aufwärmen' }),
      it('open-book', 30, { section: 'Aufwärmen' }),
      it('worlds-greatest', 30, { section: 'Aufwärmen' }),
      pnf('doorway-pec', 'Anspannen-Loslassen'),
      pnf('puppy', 'Anspannen-Loslassen'),
      pnf('child-side', 'Anspannen-Loslassen'),
      it('wall-slide', 60, { mode: 'active', section: 'Kraft in der Dehnung' }),
      it('seated-twist', 45, { section: 'Kraft in der Dehnung' }),
      it('thread-needle', 90, { section: 'Lange halten' }),
      it('sphinx', 90, { section: 'Lange halten' }),
      it('neck-side', 40, { section: 'Lange halten' }),
      it('breath-9090', 90, { section: 'Ausklang' }),
    ],
  },
  {
    id: 'deep-c',
    letter: 'C',
    name: 'Tief C · Beinrückseite',
    short: 'Beinrückseite',
    icon: '🙇',
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

// ---------- Routinen für Situationen ----------
// when: wann die Routine auf „Heute“ bevorzugt vorgeschlagen wird
export const SITUATIONS = [
  {
    id: 'morning', name: 'Morgens · Wach werden', short: 'Morgens', icon: '☀️', when: 'morning',
    description: 'Dynamisch und sanft: bringt Wirbelsäule, Hüfte und Schultern in Schwung, ohne lange zu halten.',
    items: [it('cat-cow', 40), it('worlds-greatest', 30), it('hip-cars', 25), it('towel-dislocate', 30), it('squat-shift', 40), it('side-bend', 20)],
  },
  {
    id: 'evening', name: 'Abends · Runterkommen', short: 'Abends', icon: '🌙', when: 'evening',
    description: 'Ruhig, liegend, mit langer Ausatmung – beruhigt das Nervensystem und lässt dich besser einschlafen.',
    items: [it('child-pose', 60), it('knees-chest', 45), it('figure-four', 45), it('supine-twist', 45), it('butterfly', 60), it('breath-9090', 90)],
  },
  {
    id: 'desk', tagline: 'Gegen Sitzhaltung und Nacken.', name: 'Schreibtisch · 4 Minuten', short: 'Schreibtisch', icon: '💻', when: 'day',
    description: 'Im Stehen, ohne Matte: gegen runde Schultern, steifen Nacken und die Sitzhüfte.',
    items: [it('doorway-pec', 25), it('side-bend', 20), it('neck-side', 20), it('quad-standing', 25)],
  },
  {
    id: 'quick', name: 'Kurz · Nach dem Sitzen', short: 'Kurz', icon: '⏱️', when: 'day',
    description: 'Fünf Minuten für Tage mit wenig Zeit – oder zwischendurch nach langem Sitzen.',
    items: [it('hip-flexor', 40), it('forward-fold', 40), it('pigeon', 40), it('deep-squat', 45)],
  },
  {
    id: 'warmup', name: 'Aufwärmen · Vor dem Beintraining', short: 'Vor Beintag', icon: '🔥', when: 'gym',
    description: 'Nur dynamische Übungen – macht beweglich, ohne Kraft zu kosten.',
    items: [it('leg-swing', 30), it('hip-circles', 30), it('worlds-greatest', 40), it('cossack', 45, { mode: 'active' }), it('knee-to-wall', 30), it('deep-squat', 30)],
  },
  {
    id: 'pre-fight', name: 'Vor dem Kickboxen', short: 'Vor Kickboxen', icon: '🥊', when: 'fight',
    description: 'Hüfte auf, Schultern locker: dynamisch aufwärmen für Tritte und Schläge.',
    items: [it('leg-swing', 30), it('leg-swing-side', 30), it('hip-cars', 25), it('worlds-greatest', 30), it('cossack', 40, { mode: 'active' }), it('towel-dislocate', 30)],
  },
  {
    id: 'post-run', name: 'Nach dem Laufen', short: 'Nach Laufen', icon: '🏃', when: 'run',
    description: 'Waden, Hüftbeuger und Beinrückseite – was beim Laufen am meisten arbeitet.',
    items: [it('calf-wall', 40), it('soleus-wall', 30), it('hip-flexor', 40), it('quad-standing', 30), it('hamstring-supine', 40), it('pigeon', 40)],
  },
  {
    id: 'post-legs', name: 'Nach dem Beintag', short: 'Nach Beintag', icon: '🦵', when: 'legs',
    description: 'Lange Haltephasen für Hüfte und Beine, solange die Muskeln warm sind.',
    items: [it('hip-flexor', 45), it('pigeon', 45), it('hamstring-supine', 45), it('frog', 60), it('calf-wall', 30), it('knees-chest', 45)],
  },
  {
    id: 'post-push', name: 'Nach dem Push-Tag', short: 'Nach Push', icon: '💪', when: 'push',
    description: 'Brust, vordere Schultern und Handgelenke – nach Bankdrücken, Schulterdrücken und Dips.',
    items: [it('doorway-pec', 40), it('puppy', 45), it('thread-needle', 30), it('wrist-rock', 40), it('child-side', 30)],
  },
  {
    id: 'post-pull', name: 'Nach dem Pull-Tag', short: 'Nach Pull', icon: '🧗', when: 'pull',
    description: 'Lat, oberer Rücken und Nacken – nach Klimmzügen und Rudern.',
    items: [it('child-side', 40), it('puppy', 45), it('open-book', 30), it('doorway-pec', 30), it('neck-side', 25)],
  },
  {
    id: 'rest-day', name: 'Ruhetag · Ganzkörper sanft', short: 'Ruhetag', icon: '🍃', when: 'rest',
    description: 'Einmal durch den ganzen Körper, ruhig und ohne Anstrengung – aktive Erholung.',
    items: [
      it('cat-cow', 45), it('worlds-greatest', 30), it('hip-flexor', 50), it('pigeon', 50), it('thread-needle', 35),
      it('frog', 60), it('hamstring-supine', 50), it('child-pose', 60), it('breath-9090', 60),
    ],
  },
];

// ---------- Ziel-Programme (8 Wochen) ----------
export const PROGRAM_WEEKS = 8;
export const PROGRAMS = [
  {
    id: 'kicks', tagline: 'Höher und kontrollierter kicken.', name: 'Hohe Kicks & Hüftöffnung', short: 'Hohe Kicks', icon: '🦵',
    description: 'Beweglichkeit, die du auch aus eigener Kraft erreichst – damit Front-, Seit- und Roundkicks höher und kontrollierter werden.',
    regions: ['adductors', 'hamstrings', 'hiprot', 'hipflex'], deep: ['deep-a'], tests: ['legraise', 'straddle', 'ninety'],
    phases: [
      { from: 1, to: 2, name: 'Grundlage', text: 'Hüfte dynamisch öffnen, an die Positionen gewöhnen.', daily: [it('leg-swing-side', 30)] },
      { from: 3, to: 5, name: 'Aufbau', text: 'Kraft in der Öffnung: seitliches Beinheben jeden Tag.', daily: [it('leg-raise-side', 30, { mode: 'active' })] },
      { from: 6, to: 8, name: 'Vertiefen', text: 'Front und Seite aktiv, die tiefen Einheiten mit mehr Anspannen-Loslassen.', daily: [it('leg-raise-front', 30, { mode: 'active' }), it('leg-raise-side', 30, { mode: 'active' })] },
    ],
  },
  {
    id: 'squat', tagline: 'Entspannt tief in die Hocke.', name: 'Tiefe Hocke', short: 'Tiefe Hocke', icon: '🧘',
    description: 'Entspannt in der tiefen Hocke sitzen, Fersen am Boden – die Grundlage für eine tiefe, saubere Kniebeuge.',
    regions: ['calves', 'adductors', 'hiprot'], deep: ['deep-c'], tests: ['squat', 'ankle'],
    phases: [
      { from: 1, to: 2, name: 'Grundlage', text: 'Sprunggelenke mobilisieren, die Hocke täglich üben.', daily: [it('knee-to-wall', 30)] },
      { from: 3, to: 5, name: 'Aufbau', text: 'Bewegung in der Hocke: Gewicht von Seite zu Seite.', daily: [it('squat-shift', 45)] },
      { from: 6, to: 8, name: 'Vertiefen', text: 'Länger in der Hocke bleiben – bis es sich wie Sitzen anfühlt.', daily: [it('squat-shift', 45), it('soleus-wall', 30)] },
    ],
  },
  {
    id: 'splits', tagline: 'Schritt für Schritt zum Spagat.', name: 'Spagat', short: 'Spagat', icon: '🤸',
    description: 'Schritt für Schritt Richtung Front- und Seitspagat: Beinbeuger, Hüftbeuger und Adduktoren im Wechsel.',
    regions: ['hamstrings', 'hipflex', 'adductors'], deep: ['deep-a', 'deep-c'], tests: ['straddle', 'fold'],
    phases: [
      { from: 1, to: 2, name: 'Grundlage', text: 'Halber Spagat und Grätsche kennenlernen.', daily: [it('half-split', 40)] },
      { from: 3, to: 5, name: 'Aufbau', text: 'Eidechse dazu – tiefer Ausfallschritt für die Hüftbeuger.', daily: [it('half-split', 40), it('lizard', 40)] },
      { from: 6, to: 8, name: 'Vertiefen', text: 'Aktive Grätsche und längere Haltephasen.', daily: [it('lizard', 45), it('pancake-reach', 40, { mode: 'active' })] },
    ],
  },
  {
    id: 'fold', tagline: 'Hände flach auf den Boden.', name: 'Boden berühren', short: 'Vorbeuge', icon: '🙇',
    description: 'Mit gestreckten Beinen die Hände flach auf den Boden legen – dafür müssen Beinrückseite und unterer Rücken nachgeben.',
    regions: ['hamstrings', 'lowback', 'calves'], deep: ['deep-c'], tests: ['fold'],
    phases: [
      { from: 1, to: 2, name: 'Grundlage', text: 'Tägliche Vorbeuge, ruhig und ohne Wippen.', daily: [it('forward-fold', 40)] },
      { from: 3, to: 5, name: 'Aufbau', text: 'Sitzende Vorbeuge mit langem Rücken.', daily: [it('seated-pike', 45)] },
      { from: 6, to: 8, name: 'Vertiefen', text: 'Halber Spagat für jede Seite einzeln.', daily: [it('seated-pike', 45), it('half-split', 35)] },
    ],
  },
  {
    id: 'overhead', tagline: 'Arme frei über den Kopf.', name: 'Freie Schultern', short: 'Schultern', icon: '🙆',
    description: 'Arme gestreckt über den Kopf, ohne ins Hohlkreuz zu fallen – für Schulterdrücken, Klimmzüge und eine lockere Deckung.',
    regions: ['shoulders', 'tspine', 'chest'], deep: ['deep-b'], tests: ['overhead', 'rotation'],
    phases: [
      { from: 1, to: 2, name: 'Grundlage', text: 'Schulterblätter führen lernen.', daily: [it('wall-slide', 40, { mode: 'active' })] },
      { from: 3, to: 5, name: 'Aufbau', text: 'Welpe dazu – Überkopf-Dehnung für Lat und Brust.', daily: [it('wall-slide', 40, { mode: 'active' }), it('puppy', 40)] },
      { from: 6, to: 8, name: 'Vertiefen', text: 'Schulterkreisen mit dem Handtuch, enger greifen.', daily: [it('puppy', 45), it('towel-dislocate', 40)] },
    ],
  },
  {
    id: 'desk', name: 'Schreibtisch-Rücken', short: 'Rücken', icon: '💻',
    description: 'Gegen runde Schultern, steifen Nacken und die Sitzhüfte – für alle, die viel sitzen.',
    regions: ['tspine', 'chest', 'hipflex', 'neck'], deep: ['deep-b'], tests: ['rotation', 'overhead'],
    phases: [
      { from: 1, to: 2, name: 'Grundlage', text: 'Die Brustwirbelsäule wieder drehen lernen.', daily: [it('open-book', 30)] },
      { from: 3, to: 5, name: 'Aufbau', text: 'Nadel einfädeln dazu – Drehung und Schulter.', daily: [it('open-book', 30), it('thread-needle', 30)] },
      { from: 6, to: 8, name: 'Vertiefen', text: 'Brust öffnen und strecken.', daily: [it('doorway-pec', 30), it('sphinx', 40)] },
    ],
  },
];
export const PROGRAM = Object.fromEntries(PROGRAMS.map((p) => [p.id, p]));

export function programPhase(program, week) {
  return program.phases.find((ph) => week >= ph.from && week <= ph.to) || program.phases[program.phases.length - 1];
}

// ---------- Beweglichkeits-Tests ----------
export const CHECKS = [
  {
    id: 'fold', name: 'Vorbeuge', exercise: 'forward-fold',
    how: 'Füße zusammen, Knie gestreckt, langsam nach unten hängen lassen. Nicht wippen.',
    question: 'Wie weit kommen deine Fingerspitzen?',
    options: ['Über dem Knie', 'Knie bis Schienbein', 'Knöchel', 'Zehen', 'Finger am Boden', 'Handflächen am Boden'],
    good: 3,
  },
  {
    id: 'ankle', name: 'Knie zur Wand', exercise: 'knee-to-wall',
    how: 'Fuß vor die Wand, Knie zur Wand schieben, Ferse bleibt unten. Fuß so weit zurücksetzen, wie es gerade noch geht.',
    question: 'Größter Abstand Zehen–Wand in cm', sides: true, unit: 'cm', min: 0, max: 20, good: 10,
  },
  {
    id: 'squat', name: 'Tiefe Hocke', exercise: 'deep-squat',
    how: 'Füße schulterbreit, so tief wie möglich, Fersen bleiben am Boden. 30 Sekunden.',
    question: 'Wie gut geht das?',
    options: ['Nicht möglich', 'Nur mit Festhalten', 'Ja, aber anstrengend', 'Ja, ganz entspannt'],
    good: 2,
  },
  {
    id: 'ninety', name: '90/90-Sitz', exercise: 'ninety-hold',
    how: 'In den 90/90-Sitz gehen und aufrecht sitzen, ohne die Hände zu benutzen. Beide Seiten.',
    question: 'Kannst du aufrecht sitzen?',
    options: ['Nein', 'Nur mit Händen', 'Eine Seite geht', 'Beide Seiten'],
    good: 3,
  },
  {
    id: 'rotation', name: 'Rumpfdrehung', exercise: 'seated-twist',
    how: 'Aufrecht im Schneidersitz, Arme vor der Brust verschränkt. Langsam so weit wie möglich drehen – beide Seiten, die schwächere zählt.',
    question: 'Wohin kannst du schauen?',
    options: ['Kaum zur Seite', 'Genau zur Seite', 'Etwas hinter die Seite', 'Deutlich nach hinten'],
    good: 2,
  },
  {
    id: 'overhead', name: 'Arme über Kopf', exercise: 'wall-slide',
    how: 'Rücken, Po und Hinterkopf an die Wand, Füße eine Fußlänge davor. Gestreckte Arme über den Kopf nach hinten zur Wand führen – ohne Hohlkreuz.',
    question: 'Wie weit kommen die Daumen?',
    options: ['Weit weg von der Wand', 'Knapp vor der Wand', 'Berühren die Wand', 'Liegen entspannt an'],
    good: 2,
  },
  {
    id: 'legraise', name: 'Aktives Beinheben', exercise: 'leg-raise-front',
    how: 'Seitlich an der Wand festhalten. Das gestreckte Bein ohne Schwung nach vorn heben und 2 Sekunden halten.',
    question: 'Bis wohin kommt der Fuß?',
    options: ['Unter Kniehöhe', 'Kniehöhe', 'Hüfthöhe', 'Über Hüfthöhe', 'Brusthöhe'],
    good: 2,
  },
  {
    id: 'straddle', name: 'Grätsche', exercise: 'straddle',
    how: 'Beine so weit gegrätscht wie möglich, Knie gestreckt. Mit geradem Rücken nach vorn lehnen.',
    question: 'Wie weit kommst du?',
    options: ['Aufrecht, Hände hinter dem Becken', 'Hände vor dem Becken', 'Unterarme am Boden', 'Brust fast am Boden'],
    good: 2,
  },
];
export const CHECK = Object.fromEntries(CHECKS.map((c) => [c.id, c]));
export const CORE_CHECKS = ['fold', 'ankle', 'squat', 'ninety'];
export const CHECK_INTERVAL_DAYS = 28;

// ---------- Wissen ----------
export const GUIDE = [
  { title: 'Wochenminuten zählen', text: 'Entscheidend ist, wie viele Minuten eine Region pro Woche gedehnt wird: ab etwa 5 Minuten wirkt es, rund 10 Minuten sind optimal. Die Körperkarte unter „Fortschritt“ zeigt dir genau das.' },
  { title: 'Oft schlägt lang', text: 'Zehn Minuten an fünf Tagen bringen mehr als eine Stunde am Sonntag. Deshalb die kurze tägliche Routine – plus 1–2 tiefe Einheiten.' },
  { title: 'Spürbar, nicht schmerzhaft', text: 'Wie stark du dehnst, macht in Studien kaum einen Unterschied. Etwa 6 von 10 reicht völlig – stechender Schmerz bringt nichts.' },
  { title: 'Anspannen-Loslassen', text: 'In der Dehnung ein paar Sekunden sanft gegenhalten, dann loslassen und tiefer sinken. Wirkt so gut wie Halten und fühlt sich oft leichter an.' },
  { title: 'Kraft in der Dehnung', text: 'Für hohe Kicks reicht passive Beweglichkeit nicht: du musst die Position auch aus eigener Kraft erreichen. Dafür sind die aktiven Übungen da.' },
  { title: 'Richtiger Zeitpunkt', text: 'Vor dem Training dynamisch aufwärmen, langes Halten danach oder als eigene Einheit – direkt vorher kostet es etwas Kraft.' },
  { title: 'Krafttraining zählt mit', text: 'Kniebeugen, Ausfallschritte und rumänisches Kreuzheben über den vollen Bewegungsweg machen ebenfalls beweglicher.' },
  { title: 'Pausen kosten wenig', text: 'Nach ein paar Wochen Pause geht nur ein Teil verloren – du bleibst über deinem Startpunkt. Also einfach wieder anfangen.' },
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
