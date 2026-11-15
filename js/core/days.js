// Tageslogik ohne Abhängigkeiten: der „logische“ Tag und Schlüssel der Form
// JJJJ-MM-TT. Eigene Datei, damit supplements.js und breaks.js sie teilen
// können, ohne sich gegenseitig zu importieren.

// Ein Tag beginnt um 4 Uhr statt um Mitternacht: wer sein Magnesium um 0:30
// vor dem Schlafen nimmt, meint damit noch den Vortag.
export const DAY_START_HOUR = 4;

function pad(n) { return String(n).padStart(2, '0'); }

export function keyOf(date) {
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
