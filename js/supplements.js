// Supplement-Tracking: reine Logik ohne DOM, damit sie sich isoliert prüfen
// lässt.
//
// Ziel ist nicht Buchhaltung, sondern dass die Einnahme nicht mehr vergessen
// wird. Deshalb zählt vor allem die Serie (lückenlose Tage) – und ein Tag gilt
// erst als erledigt, wenn alles genommen wurde, was an dem Tag dran war.

// Ein Tag beginnt um 4 Uhr statt um Mitternacht: wer sein Magnesium um 0:30
// vor dem Schlafen nimmt, meint damit noch den Vortag.
const DAY_START_HOUR = 4;

export const SLOTS = [
  { id: 'morning', label: 'Morgens', icon: '☀️', from: 4, to: 11, reminder: '0730' },
  { id: 'noon', label: 'Mittags', icon: '🌤️', from: 11, to: 15, reminder: '1230' },
  { id: 'evening', label: 'Abends', icon: '🌆', from: 15, to: 21, reminder: '1900' },
  { id: 'night', label: 'Vor dem Schlafen', icon: '🌙', from: 21, to: 28, reminder: '2200' },
];

// Vorschläge zum schnellen Anlegen. Die Tageszeit ist nur ein üblicher
// Ausgangspunkt und jederzeit änderbar; Dosierungen bewusst leer – die trägt
// jeder selbst ein.
export const SUPPLEMENT_PRESETS = [
  { name: 'Kreatin', slot: 'morning' },
  { name: 'Vitamin D3 + K2', slot: 'morning' },
  { name: 'Omega-3', slot: 'morning' },
  { name: 'Magnesium', slot: 'night' },
  { name: 'Ashwagandha', slot: 'night' },
  { name: 'Zink', slot: 'evening' },
  { name: 'Whey Protein', slot: 'morning' },
  { name: 'Multivitamin', slot: 'morning' },
  { name: 'Vitamin B12', slot: 'morning' },
  { name: 'Vitamin C', slot: 'morning' },
  { name: 'Eisen', slot: 'morning' },
  { name: 'Elektrolyte', slot: 'noon' },
];

function pad(n) { return String(n).padStart(2, '0'); }

function keyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Der "logische" Tag eines Zeitpunkts – mit Tageswechsel um 4 Uhr.
export function dayKey(date = new Date()) {
  return keyOf(new Date(date.getTime() - DAY_START_HOUR * 3600000));
}

export function shiftDay(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + days));
}

export function dateOfKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function slotOf(id) {
  return SLOTS.find((s) => s.id === id) || SLOTS[0];
}

// Welcher Zeitabschnitt gerade dran ist (Nacht reicht über Mitternacht).
export function currentSlot(date = new Date()) {
  const h = date.getHours();
  const hour = h < DAY_START_HOUR ? h + 24 : h;
  return (SLOTS.find((s) => hour >= s.from && hour < s.to) || SLOTS[3]).id;
}

// Ein Supplement zählt ab dem Tag, an dem es angelegt wurde, und bis zu dem
// Tag, an dem es entfernt wurde – so drücken weder neue noch abgesetzte
// Präparate rückwirkend auf die Bilanz.
export function activeOn(supplements, key) {
  return supplements.filter((s) => s.since <= key && (!s.removedOn || key < s.removedOn));
}

export function dayStatus(supplements, log, key) {
  const expected = activeOn(supplements, key);
  const taken = log[key] || {};
  const done = expected.filter((s) => taken[s.id]).length;
  return {
    expected: expected.length,
    done,
    complete: expected.length > 0 && done === expected.length,
  };
}

// Lückenlose Tage am Stück. Der laufende Tag zählt erst, wenn er komplett
// ist – bis dahin bleibt die Serie von gestern stehen, statt schon morgens um
// acht als gerissen zu gelten.
export function streak(supplements, log, today) {
  let count = dayStatus(supplements, log, today).complete ? 1 : 0;
  let key = shiftDay(today, -1);
  for (let guard = 0; guard < 3660; guard += 1) {
    const status = dayStatus(supplements, log, key);
    if (!status.complete) break;
    count += 1;
    key = shiftDay(key, -1);
  }
  return count;
}

// Anteil vollständiger Tage in den letzten `days` Tagen (ohne heute, der ist
// noch nicht vorbei). Tage vor dem ersten Supplement zählen nicht mit.
export function adherence(supplements, log, today, days = 30) {
  let counted = 0;
  let complete = 0;
  for (let i = 1; i <= days; i += 1) {
    const status = dayStatus(supplements, log, shiftDay(today, -i));
    if (!status.expected) continue;
    counted += 1;
    if (status.complete) complete += 1;
  }
  return counted ? { percent: Math.round((complete / counted) * 100), days: counted } : null;
}

// Dateiname der passenden Kalender-Erinnerung (liegt als statische Datei bei).
export function reminderFile(hhmm) {
  return `reminders/supplements-${hhmm}.ics`;
}

export const REMINDER_TIMES = (() => {
  const times = [];
  for (let h = 5; h <= 23; h += 1) {
    times.push(`${pad(h)}00`, `${pad(h)}30`);
  }
  return times;
})();
