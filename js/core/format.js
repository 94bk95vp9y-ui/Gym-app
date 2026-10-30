// Formatierer einmal anlegen statt bei jedem Aufruf (Listen formatieren
// Hunderte Daten – jedes toLocale… baut sonst einen neuen)
const fmt = (options) => new Intl.DateTimeFormat('de-DE', options);
const DATE = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const DATE_TIME = fmt({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const LONG_DATE = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const DAY_MONTH = fmt({ day: 'numeric', month: 'short' });
const TIME = fmt({ hour: '2-digit', minute: '2-digit' });
const VOLUME = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
// Ungültige Daten werfen bei Intl einen Fehler – lieber leer anzeigen
const day = (f, d) => (Number.isNaN(d.getTime()) ? '' : f.format(d));

export function formatDate(iso) {
  return day(DATE, new Date(iso));
}

export function formatDateTime(iso) {
  return day(DATE_TIME, new Date(iso));
}

export function formatDuration(ms) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m ? `${h} Std ${m} Min` : `${h} Std`;
  return `${m} Min`;
}

export function elapsedLabel(startedAt) {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// geschätztes 1RM nach Epley-Formel
export function estimate1RM(weight, reps) {
  if (!weight || !reps) return 0;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Bester Satz: mit Zusatzgewicht nach geschätztem 1RM, bei reinen
// Körpergewichtsübungen (Gewicht 0) nach Wiederholungen – sonst hätten
// Klimmzüge oder Liegestütze nie ein "Letztes Mal" und nie einen Rekord.
export function bestSet(sets) {
  const done = (sets || []).filter((s) => s.done && s.reps > 0);
  if (!done.length) return null;
  const loaded = done.filter((s) => s.weight > 0);
  if (loaded.length) {
    return loaded.reduce((best, s) => (estimate1RM(s.weight, s.reps) > estimate1RM(best.weight, best.reps) ? s : best));
  }
  return done.reduce((best, s) => (s.reps > best.reps ? s : best));
}

// Vergleichswert eines Satzes. Sätze mit Zusatzgewicht und reine
// Körpergewichtssätze werden getrennt bewertet (kind): 12 Liegestütze lassen
// sich nicht sinnvoll gegen ein 1RM rechnen.
export function setScore(set) {
  if (!set || !set.done || !(set.reps > 0)) return null;
  return set.weight > 0
    ? { kind: 'load', value: estimate1RM(set.weight, set.reps) }
    : { kind: 'reps', value: set.reps };
}

const NBSP = '\u00a0';

// Zahlen wie im Deutschen üblich: Komma statt Punkt, höchstens zwei
// Nachkommastellen, keine überflüssigen Nullen ("82,5" statt "82.50").
// Ein Formatierer für alle Aufrufe – toLocaleString legt sonst jedes Mal
// einen neuen an, und eine Seite formatiert Hunderte Zahlen.
const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2, useGrouping: false });
export function formatNumber(value) {
  return NUMBER.format(Math.round((Number(value) || 0) * 100) / 100);
}

// Eingaben dürfen Komma oder Punkt enthalten – das iPhone bietet je nach
// Region das eine oder das andere an.
export function parseNumber(text) {
  const n = parseFloat(String(text ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function formatWeight(value, unit) {
  return `${formatNumber(value)}${NBSP}${unit}`;
}

// Ein Satz in Kurzform: "82,5 kg × 8" – ohne Zusatzgewicht "8 Wdh".
export function formatSet(set, unit) {
  if (!set) return '—';
  return set.weight > 0 ? `${formatWeight(set.weight, unit)} × ${set.reps}` : `${set.reps}${NBSP}Wdh`;
}

// Alle Sätze einer Einheit kompakt: "82,5 kg × 8, 8, 7" – aufeinander-
// folgende Sätze mit gleichem Gewicht werden zusammengefasst.
export function formatSetList(sets, unit) {
  const groups = [];
  (sets || []).filter((s) => s.done && s.reps > 0).forEach((s) => {
    const last = groups[groups.length - 1];
    if (last && last.weight === (s.weight || 0)) last.reps.push(s.reps);
    else groups.push({ weight: s.weight || 0, reps: [s.reps] });
  });
  return groups.map((g) => (g.weight > 0
    ? `${formatWeight(g.weight, unit)} × ${g.reps.join(', ')}`
    : `${g.reps.join(', ')}${NBSP}Wdh`)).join(' · ');
}

export function plural(n, one, many) {
  return `${n}${NBSP}${n === 1 ? one : many}`;
}

// Ganze Kalendertage zwischen einem Zeitpunkt und jetzt.
export function daysAgo(iso, now = Date.now()) {
  const d = new Date(iso);
  const t = new Date(now);
  const a = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((a - b) / 86400000);
}

export function relativeDay(iso, now = Date.now()) {
  const n = daysAgo(iso, now);
  if (n <= 0) return 'heute';
  if (n === 1) return 'gestern';
  if (n < 14) return `vor ${n} Tagen`;
  if (n < 60) return `vor ${Math.round(n / 7)} Wochen`;
  return `vor ${Math.round(n / 30)} Monaten`;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function unitLabel(unit) {
  return unit === 'lb' ? 'lb' : 'kg';
}

// Einheit samt Art des Eintrags: "kg je Seite", kompakt "kg/Seite"
export function loadUnit(unit, load, compact = false) {
  if (load === 'side') return compact ? `${unit}/Seite` : `${unit} je Seite`;
  if (load === 'each') return compact ? `${unit}/Hantel` : `${unit} je Hantel`;
  return unit;
}

// Countdown-Anzeige: "1:05"
export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Pausenlänge für Listen: "90 s", "2 Min", "2:30 Min"
export function formatRest(seconds) {
  if (!seconds) return 'Aus';
  if (seconds < 120 && seconds % 60 !== 0) return `${seconds}${NBSP}s`;
  if (seconds % 60 === 0) return `${seconds / 60}${NBSP}Min`;
  return `${formatClock(seconds)}${NBSP}Min`;
}

export function formatMinutes(ms) {
  return `${Math.max(1, Math.round(ms / 60000))}${NBSP}Min`;
}

// Volumen mit Tausenderpunkt: "12.450"
export function formatVolume(value) {
  return VOLUME.format(Math.round(value));
}

export function formatLongDate(date = new Date()) {
  return day(LONG_DATE, date);
}

export function formatDayMonth(iso) {
  return day(DAY_MONTH, new Date(iso));
}

export function formatTime(iso) {
  return day(TIME, new Date(iso));
}
