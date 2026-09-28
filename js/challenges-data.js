// Challenges: Katalog, Stufen und Level.
//
// Jede Challenge ist eine Leiter aus fünf Stufen. Die Stufen sind für
// jemanden mit Trainingserfahrung ausgelegt: die erste ist eine echte
// Hürde, die letzte ein Ziel für Monate. Der erste Versuch stuft ein – was
// man schon kann, wird nur angerechnet, nicht gefeiert. Belohnt wird der
// Fortschritt danach.
//
// kind:
//   reps  – Wiederholungen am Stück (mehr ist besser), optional mit Zähler
//   hold  – Halten auf Zeit mit Stoppuhr (Sekunden, mehr ist besser)
//   time  – auf Zeit (Sekunden, weniger ist besser)
//   lift  – Gewicht für eine saubere Wiederholung, kommt aus den Trainings
//   steps – Fertigkeit in Etappen, jede Etappe wird mit Kriterien bestätigt
// auto: Übungs-IDs, aus deren Trainingssätzen der Wert automatisch kommt.

export const TIERS = [
  { name: 'Bronze', xp: 100 },
  { name: 'Silber', xp: 200 },
  { name: 'Gold', xp: 350 },
  { name: 'Platin', xp: 550 },
  { name: 'Legende', xp: 800 },
];

export const PLACEMENT_SHARE = 0.25; // was man schon kann: ein Viertel der XP
export const PB_XP = 20; // neuer Bestwert ohne neue Stufe
export const SWEEP_XP = 100; // alle Wochen-Challenges geschafft
export const MAX_ACTIVE = 4;

export const CATEGORIES = ['Körpergewicht', 'Kraft', 'Halten', 'Skills', 'Ausdauer'];

export const CHALLENGES = [
  // ---- Körpergewicht ----
  {
    id: 'pushups', name: 'Liegestütze am Stück', short: 'Liegestütze', icon: '💪', category: 'Körpergewicht',
    kind: 'reps', tap: true, auto: ['cat-liegestuetze'], tiers: [40, 50, 60, 80, 100],
    standard: [
      'Körper bleibt eine gerade Linie – kein durchhängendes Becken.',
      'Brust kommt bis eine Faust über den Boden, oben Arme ganz gestreckt.',
      'Pausen nur in der oberen Position, höchstens 2 Sekunden.',
    ],
    tip: 'Zwei- bis dreimal pro Woche: 5 Sätze mit 60–70 % deines Bestwerts, 90 Sekunden Pause. Einmal pro Woche ein Satz bis kurz vor Schluss.',
  },
  {
    id: 'pullups', name: 'Klimmzüge am Stück', short: 'Klimmzüge', icon: '🧗', category: 'Körpergewicht',
    kind: 'reps', auto: ['cat-klimmzuege-obergriff', 'cat-klimmzuege-untergriff'], tiers: [12, 15, 20, 25, 30],
    standard: [
      'Unten aus dem vollständig gestreckten Hang starten.',
      'Kinn klar über die Stange, kein Schwung, kein Kippen.',
      'Obergriff oder Untergriff, schulterbreit.',
    ],
    tip: 'Viele saubere Wiederholungen mit Reserve schlagen seltenes Ausreizen: täglich ein paar Sätze mit der Hälfte deines Maximums („Greasing the Groove“), dazu einmal pro Woche schwer mit Zusatzgewicht.',
  },
  {
    id: 'dips', name: 'Dips am Stück', short: 'Dips', icon: '🔱', category: 'Körpergewicht',
    kind: 'reps', auto: ['cat-dips-brust', 'cat-dips-trizeps'], tiers: [20, 25, 30, 40, 50],
    standard: [
      'Am Barren, Füße ohne Bodenkontakt.',
      'Unten Oberarme mindestens parallel zum Boden.',
      'Oben Arme vollständig gestreckt.',
    ],
    tip: 'Zweimal pro Woche 4–5 Sätze mit 70 % deines Bestwerts. Zusätzlich schwere Dips mit Gewicht für 5–8 Wiederholungen bauen die Kraftreserve auf.',
  },
  {
    id: 'pistols', name: 'Pistol Squats', short: 'Pistols', icon: '🦵', category: 'Körpergewicht',
    kind: 'reps', unitLabel: 'je Bein', tiers: [3, 5, 8, 12, 20],
    standard: [
      'Einbeinig bis ganz nach unten, Gesäß kurz über der Ferse.',
      'Freies Bein bleibt in der Luft, keine Hand am Boden oder Halt.',
      'Gezählt wird die schwächere Seite.',
    ],
    tip: 'Oft ist das Sprunggelenk die Grenze, nicht die Kraft – die Mobility-Übungen „Knie zur Wand“ und „Tiefe Hocke“ helfen direkt. Trainiere erst auf eine Kiste, dann immer tiefer.',
  },
  {
    id: 'burpees', name: '100 Burpees auf Zeit', short: 'Burpees', icon: '🔥', category: 'Körpergewicht',
    kind: 'time', tiers: [540, 450, 390, 345, 300],
    standard: [
      'Brust berührt unten den Boden.',
      'Oben ganz aufrichten und springen, Hände über dem Kopf.',
      'Uhr läuft ab der ersten Wiederholung bis zur hundertsten.',
    ],
    tip: 'Einteilen statt Vollgas: ein gleichmäßiges Tempo schlägt einen schnellen Start. Übe Blöcke à 10 mit fester Taktung (z. B. jede Minute 10).',
  },

  // ---- Kraft ----
  {
    id: 'bench', name: 'Bankdrücken', short: 'Bankdrücken', icon: '🏋️', category: 'Kraft',
    kind: 'lift', auto: ['cat-bankdruecken-langhantel'], tiers: [80, 100, 120, 140, 160],
    standard: ['Eine saubere Wiederholung mit der Langhantel.', 'Stange berührt die Brust, oben Arme gestreckt.', 'Gesäß bleibt auf der Bank.'],
    tip: 'Wird automatisch aus deinen Trainings übernommen. Doppelprogression mit 5–8 Wiederholungen, alle paar Wochen ein schwerer Dreier-Satz – Progressive Overload in den Einstellungen hilft beim Steigern.',
  },
  {
    id: 'squat', name: 'Kniebeuge', short: 'Kniebeuge', icon: '🏋️', category: 'Kraft',
    kind: 'lift', auto: ['cat-kniebeuge-langhantel'], tiers: [100, 130, 160, 180, 200],
    standard: ['Eine saubere Wiederholung mit der Langhantel.', 'Hüftfalte unter Kniehöhe.', 'Ohne Hilfe wieder hoch.'],
    tip: 'Wird automatisch aus deinen Trainings übernommen. Tiefe braucht Beweglichkeit – die Mobility-Routinen für Hüfte und Sprunggelenk zahlen direkt auf diese Challenge ein.',
  },
  {
    id: 'deadlift', name: 'Kreuzheben', short: 'Kreuzheben', icon: '🏋️', category: 'Kraft',
    kind: 'lift', auto: ['cat-kreuzheben', 'cat-sumo-kreuzheben'], tiers: [140, 170, 200, 220, 250],
    standard: ['Eine saubere Wiederholung vom Boden.', 'Rücken bleibt neutral.', 'Oben vollständig aufgerichtet.'],
    tip: 'Wird automatisch aus deinen Trainings übernommen. Schwer, aber selten: einmal pro Woche reicht meist, dazu rumänisches Kreuzheben für die Rückseite.',
  },
  {
    id: 'ohp', name: 'Schulterdrücken stehend', short: 'Schulterdrücken', icon: '🏋️', category: 'Kraft',
    kind: 'lift', auto: ['cat-schulterdruecken-langhantel', 'cat-militaerpresse-stehend'], tiers: [50, 60, 70, 80, 90],
    standard: ['Eine saubere Wiederholung mit der Langhantel, stehend.', 'Kein Schwung aus den Beinen.', 'Oben Arme vollständig gestreckt.'],
    tip: 'Wird automatisch aus deinen Trainings übernommen. Kleine Sprünge – 1,25-kg-Scheiben machen hier den Unterschied.',
  },
  {
    id: 'weighted-pullup', name: 'Klimmzug mit Zusatzgewicht', short: 'Gewichtsklimmzug', icon: '⛓️', category: 'Kraft',
    kind: 'lift', auto: ['cat-klimmzuege-obergriff', 'cat-klimmzuege-untergriff'], tiers: [15, 25, 35, 45, 60],
    standard: ['Eine saubere Wiederholung mit Zusatzgewicht am Gürtel oder in der Weste.', 'Aus dem gestreckten Hang, Kinn über die Stange.'],
    tip: 'Trag bei Klimmzügen im Training das Zusatzgewicht ein – die App übernimmt es automatisch.',
  },

  // ---- Halten ----
  {
    id: 'plank', name: 'Unterarmstütz', short: 'Plank', icon: '⏱️', category: 'Halten',
    kind: 'hold', tiers: [150, 210, 300, 420, 600],
    standard: ['Auf Unterarmen und Zehen, Körper eine gerade Linie.', 'Vorbei, sobald die Hüfte absackt oder deutlich hochgeht.'],
    tip: 'Nicht nur halten, sondern aktiv spannen: Gesäß fest, Bauchnabel zur Wirbelsäule. Dreimal pro Woche 3 Sätze mit 60 % deines Bestwerts.',
  },
  {
    id: 'deadhang', name: 'Toter Hang', short: 'Toter Hang', icon: '🪝', category: 'Halten',
    kind: 'hold', tiers: [60, 90, 120, 150, 180],
    standard: ['Beidarmig an der Klimmzugstange, Füße ohne Bodenkontakt.', 'Kein Umgreifen, kein Kreide-Nachlegen.'],
    tip: 'Griffkraft wächst schnell mit Häufigkeit: nach jedem Training zwei lange Hänge. Schwere Rudern und Kreuzheben ohne Zughilfen helfen mit.',
  },
  {
    id: 'lsit', name: 'L-Sitz', short: 'L-Sitz', icon: '📐', category: 'Halten',
    kind: 'hold', tiers: [10, 20, 30, 45, 60],
    standard: ['Am Barren, an Griffen oder am Boden.', 'Beine gestreckt und mindestens waagerecht.', 'Vorbei, sobald die Fersen absinken.'],
    tip: 'Braucht Kraft in den Hüftbeugern und Beweglichkeit in der Beinrückseite: beginne mit angezogenen Knien und strecke jede Woche ein Stück mehr.',
  },
  {
    id: 'wallsit', name: 'Wandsitz', short: 'Wandsitz', icon: '🧱', category: 'Halten',
    kind: 'hold', tiers: [90, 150, 210, 270, 360],
    standard: ['Rücken an der Wand, Oberschenkel waagerecht.', 'Hände nicht auf den Beinen.'],
    tip: 'Mentale Challenge: teile die Zeit in Abschnitte und zähl ruhig mit. Schwere Kniebeugen und Beinpresse bauen die Grundlage.',
  },

  // ---- Skills ----
  {
    id: 'muscleup', name: 'Muscle-Up', short: 'Muscle-Up', icon: '🤸', category: 'Skills',
    kind: 'steps',
    tiers: ['5 Brust-zur-Stange-Klimmzüge', '3 negative Muscle-Ups à 5 Sekunden', 'Erster sauberer Muscle-Up', '3 Muscle-Ups am Stück', '5 Muscle-Ups am Stück'],
    standard: ['Ohne Kipping aus dem ruhigen Hang.', 'Oben im Stütz Arme vollständig gestreckt.', 'Beide Arme gleichzeitig über die Stange.'],
    tip: 'Der Schlüssel ist ein explosiver Zug bis zur Brust. Übe hohe, schnelle Klimmzüge und Dips im Wechsel; negative Muscle-Ups bringen das Gefühl für den Übergang.',
  },
  {
    id: 'handstand', name: 'Handstand', short: 'Handstand', icon: '🙃', category: 'Skills',
    kind: 'steps',
    tiers: ['60 s Handstand an der Wand (Bauch zur Wand)', 'Freier Handstand 5 s', 'Freier Handstand 15 s', 'Freier Handstand 30 s', '5 Handstand-Liegestütze an der Wand'],
    standard: ['Arme gestreckt, Körper gerade.', 'Frei heißt: ohne Wand und ohne Hilfe.', 'Zeit läuft ab dem stabilen Stand.'],
    tip: 'Täglich 5–10 Minuten schlagen eine lange Einheit pro Woche. Balance kommt aus den Fingern – leicht in den Boden krallen.',
  },
  {
    id: 'frontlever', name: 'Front Lever', short: 'Front Lever', icon: '🦅', category: 'Skills',
    kind: 'steps',
    tiers: ['Tuck Front Lever 10 s', 'Advanced Tuck 10 s', 'Einbeiniger Front Lever 8 s', 'Straddle Front Lever 5 s', 'Voller Front Lever 5 s'],
    standard: ['Arme gestreckt, Körper waagerecht.', 'Schulterblätter nach unten gezogen.', 'Position ruhig halten, nicht durchschwingen.'],
    tip: 'Zweimal pro Woche 5–6 Halteversuche in der aktuellen Stufe, dazu langsame Negativen aus der Umkehr. Geduld – das ist eine Challenge für Monate.',
  },

  // ---- Ausdauer ----
  {
    id: 'run5k', name: '5 km Lauf', short: '5 km', icon: '🏃', category: 'Ausdauer',
    kind: 'time', tiers: [1620, 1440, 1320, 1200, 1110],
    standard: ['5 km am Stück, Laufband mit mindestens 1 % Steigung oder draußen.', 'Zeit aus Uhr oder Lauf-App.'],
    tip: 'Einmal pro Woche Intervalle (z. B. 6 × 800 m etwas schneller als Zieltempo), sonst locker. Die meisten Läufe sollten sich leicht anfühlen.',
  },
  {
    id: 'row2k', name: '2000 m Rudern', short: '2 km Rudern', icon: '🚣', category: 'Ausdauer',
    kind: 'time', tiers: [480, 450, 430, 410, 390],
    standard: ['Am Rudergerät, Widerstand frei wählbar.', 'Zeit laut Monitor.'],
    tip: 'Technik vor Kraft: Beine – Oberkörper – Arme. Einmal pro Woche 4 × 500 m im Zieltempo mit 2 Minuten Pause.',
  },
];

export const CUSTOM_ICONS = ['🎯', '💪', '🔥', '⚡', '🏆', '🦾', '🧗', '🏃', '🚴', '🏊', '🥊', '🦵'];

// Level: jede Stufe braucht etwas mehr als die vorige.
export function levelInfo(xp) {
  let level = 1;
  let base = 0;
  let need = 150;
  while (xp >= base + need) {
    base += need;
    level += 1;
    need = 150 + 75 * (level - 1);
  }
  return { level, into: xp - base, need, title: rankTitle(level) };
}

export function rankTitle(level) {
  if (level >= 20) return 'Legende';
  if (level >= 15) return 'Champion';
  if (level >= 10) return 'Elite';
  if (level >= 6) return 'Athlet';
  if (level >= 3) return 'Kämpfer';
  return 'Rookie';
}
