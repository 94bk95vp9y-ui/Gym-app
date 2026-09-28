// Geführte Läufe. Blöcke mit Ziel-Zone; die App übersetzt die Zone in
// persönliche Tempos (aus dem letzten Test) und Pulsbereiche.
//
// Auswahl nach dem, was für Ausdauer belegt ist: der Großteil locker (Z2),
// dazu gezielt harte Einheiten. 4×4 Minuten nahe am Maximum (Helgerud) sind
// besonders wirksam für die maximale Sauerstoffaufnahme; Kampf-Intervalle
// bilden den Rundenrhythmus ab.

const warm = (sec = 600) => ({ label: 'Einlaufen', sec, zone: 'easy', note: 'Locker anfangen, die letzte Minute etwas zügiger.' });
const cool = (sec = 300) => ({ label: 'Auslaufen', sec, zone: 'easy', note: 'Ganz locker austraben.' });
const rep = (n, work, rest) => Array.from({ length: n }, (_, i) => [
  { ...work, label: `${work.label} ${i + 1}/${n}` },
  ...(i < n - 1 ? [rest] : []),
]).flat();

export const RUN_TEMPLATES = [
  {
    id: 'easy', name: 'Lockerer Dauerlauf', kind: 'easy', icon: '🌿', minutes: [20, 30, 40, 50], defMin: 30,
    desc: 'Grundlage: so locker, dass du dich unterhalten könntest. Der wichtigste Lauf der Woche.',
    blocks: (m) => [{ label: 'Locker', sec: m * 60, zone: 'easy', note: 'Sprechtempo. Lieber zu langsam als zu schnell.' }],
  },
  {
    id: 'long', name: 'Langer Lauf', kind: 'long', icon: '🛣️', minutes: [45, 60, 75, 90], defMin: 60,
    desc: 'Einmal pro Woche länger, genauso locker. Macht das Herz-Kreislauf-System robust.',
    blocks: (m) => [{ label: 'Locker & lang', sec: m * 60, zone: 'easy', note: 'Gleichmäßig, Trinkpause ist erlaubt.' }],
  },
  {
    id: '4x4', name: '4 × 4 Intervalle', kind: 'intervals', icon: '🔥',
    desc: '4 × 4 Minuten hart (fast am Maximum), dazwischen 3 Minuten traben. Klassiker für mehr VO₂max.',
    blocks: () => [warm(600), ...rep(4, { label: 'Intervall', sec: 240, zone: 'interval', note: 'Hart, aber gleichmäßig – die letzte Minute ist die schwerste.' }, { label: 'Traben', sec: 180, zone: 'recovery', note: 'Locker weiterlaufen, Atmung beruhigen.' }), cool(300)],
  },
  {
    id: 'fight', name: 'Kampf-Intervalle', kind: 'intervals', icon: '🥊',
    desc: 'Wie Kampfrunden: 5 × 3 Minuten zügig, 1 Minute gehen. Genau der Rhythmus für den Ring.',
    blocks: () => [warm(480), ...rep(5, { label: 'Runde', sec: 180, zone: 'threshold', note: 'Zügig an der Schwelle, konstant halten.' }, { label: 'Gehen', sec: 60, zone: 'walk', note: 'Gehen, tief ausatmen.' }), cool(300)],
  },
  {
    id: '3030', name: '30 / 30', kind: 'intervals', icon: '⚡',
    desc: '10 × 30 Sekunden schnell, 30 Sekunden locker. Kurz, knackig, gut für Tempo.',
    blocks: () => [warm(600), ...rep(10, { label: 'Schnell', sec: 30, zone: 'rep', note: 'Schnell, aber locker in den Schultern.' }, { label: 'Locker', sec: 30, zone: 'recovery', note: 'Traben.' }), cool(300)],
  },
  {
    id: 'tempo', name: 'Tempolauf', kind: 'tempo', icon: '🎯', minutes: [15, 20, 25], defMin: 20,
    desc: 'Anstrengend, aber kontrolliert – an der Schwelle. Hebt das Tempo, das du lange halten kannst.',
    blocks: (m) => [warm(600), { label: 'Tempo', sec: m * 60, zone: 'threshold', note: 'Kontrolliert hart – sprechen nur in kurzen Sätzen.' }, cool(300)],
  },
  {
    id: 'hills', name: 'Hügelsprints', kind: 'intervals', icon: '⛰️',
    desc: '8 × 12 Sekunden bergauf mit voller Kraft, zurück gehen. Explosivität für die Beine.',
    blocks: () => [warm(600), ...rep(8, { label: 'Sprint', sec: 12, zone: 'sprint', note: 'Volle Kraft bergauf, Arme mitnehmen.' }, { label: 'Zurückgehen', sec: 90, zone: 'walk', note: 'Ganz ruhig zurück.' }), cool(300)],
  },
  {
    id: 'fartlek', name: 'Fahrtspiel', kind: 'tempo', icon: '🎲', minutes: [20, 30], defMin: 20,
    desc: 'Spontane Tempowechsel: der Coach ruft zufällige Tempo-Abschnitte aus.',
    blocks: (m) => {
      const blocks = [warm(480)];
      let left = m * 60;
      let fast = false;
      let seed = 7;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      while (left > 0) {
        const sec = Math.min(left, fast ? 30 + Math.round(rnd() * 60) : 60 + Math.round(rnd() * 90));
        blocks.push(fast ? { label: 'Tempo!', sec, zone: 'threshold', note: 'Tempo hoch bis zur Ansage.' } : { label: 'Locker', sec, zone: 'easy', note: 'Erholen im Lauf.' });
        left -= sec;
        fast = !fast;
      }
      blocks.push(cool(300));
      return blocks;
    },
  },
  {
    id: 'cooper', name: 'Cooper-Test', kind: 'test', icon: '📏', test: 'cooper',
    desc: '12 Minuten so weit wie möglich. Ergibt deine geschätzte VO₂max – alle 4 Wochen wiederholen.',
    blocks: () => [warm(600), { label: 'Cooper-Test', sec: 720, zone: 'max', note: 'Gleichmäßig schnell, am Ende alles geben.', test: true }, cool(300)],
  },
  {
    id: '5k', name: '5-km-Test', kind: 'test', icon: '🏁', test: '5k', distance: 5000,
    desc: '5 km so schnell wie möglich. Daraus rechnet die App deine persönlichen Tempos.',
    blocks: () => [warm(600), { label: '5 km', sec: 3600, zone: 'max', note: 'Erster Kilometer nicht zu schnell!', test: true, distance: 5000 }, cool(300)],
  },
];

export const RUN_TYPES = [
  { id: 'run', label: 'Laufen draußen', icon: '🏃' },
  { id: 'treadmill', label: 'Laufband', icon: '🏃‍♂️' },
  { id: 'bike', label: 'Rad / Ergometer', icon: '🚴' },
  { id: 'row', label: 'Rudern', icon: '🚣' },
  { id: 'cross', label: 'Crosstrainer', icon: '🌀' },
  { id: 'rope', label: 'Seilspringen', icon: '🪢' },
  { id: 'other', label: 'Sonstiges', icon: '💪' },
];
export const RUN_KINDS = [
  { id: 'easy', label: 'Locker' },
  { id: 'long', label: 'Lang' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'intervals', label: 'Intervalle' },
  { id: 'test', label: 'Test' },
];

export const ZONE_TEXT = {
  easy: 'locker – du kannst reden',
  recovery: 'ganz locker traben',
  walk: 'gehen',
  threshold: 'zügig an der Schwelle',
  interval: 'hart – fast am Maximum',
  rep: 'schnell, locker in den Schultern',
  sprint: 'Vollgas',
  max: 'dein bestes Tempo',
};
