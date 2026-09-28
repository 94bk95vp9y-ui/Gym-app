// Gemeinsame Bausteine des Fight-Modus: Zugriff auf die App-Funktionen,
// Profil mit Standardwerten, Formatierung und Wochen-/Belastungsrechnung.
import { Store } from '../storage.js';
import { escapeHtml, plural } from '../utils.js';
import { dayKey } from '../supplements.js';

export { escapeHtml, plural, dayKey };

// Funktionen aus app.js (Sheets, Toasts, Rendern …), gesetzt von initFight().
export const fx = { ctx: null };

export const qs = (sel, parent = document) => parent.querySelector(sel);
export const qsa = (sel, parent = document) => [...parent.querySelectorAll(sel)];
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const DAY = 86400000;

// Offenes Sheet mit neuem Inhalt aufbauen (Editoren, Baukästen), ohne dass
// die Liste nach oben springt oder der Inhalt neu einblendet.
export function remountSheet(open) {
  const top = document.querySelector('#sheet-root .sheet-body')?.scrollTop || 0;
  open();
  const body = document.querySelector('#sheet-root .sheet-body');
  if (!body) return;
  body.classList.remove('sheet-content-in');
  body.scrollTop = top;
}

// ---------- Profil ----------
// Vorbelegt mit dem, was schon bekannt ist: Kickboxen ohne Vorerfahrung,
// Training im eigenen Zimmer mit Springseil, kleinem Wandsack, Kurzhanteln
// und Spiegel, Laufen draußen.
const PROFILE_DEFAULTS = {
  setupDone: false,
  style: 'kickboxing',
  stance: 'orthodox', // Linksauslage (Rechtshänder) | 'southpaw'
  experience: 'none', // 'none' | 'some' | 'good'
  equipment: { rope: true, bag: true, dumbbells: true, mirror: true, gloves: false },
  space: 'small', // 'small' | 'medium' | 'large'
  quiet: 'evening', // 'never' | 'evening' | 'always'
  age: 19,
  hrMax: null,
  hrRest: null,
  watch: false,
  runEstimate: null, // geschätzte 5-km-Zeit in Sekunden
  runGoal: 'fight', // 'base' | '5k' | 'fight'
  fightPerWeek: 3,
  runPerWeek: 2,
  sessionMinutes: 30,
  voiceStyle: 'mixed', // 'numbers' | 'names' | 'mixed'
  coach: { rounds: 4, roundSec: 180, restSec: 60, tempo: 2 },
  showFigure: true,
  gps: true,
};

export function getProfile() {
  const saved = Store.getFightProfile() || {};
  return {
    ...PROFILE_DEFAULTS,
    ...saved,
    equipment: { ...PROFILE_DEFAULTS.equipment, ...(saved.equipment || {}) },
    coach: { ...PROFILE_DEFAULTS.coach, ...(saved.coach || {}) },
  };
}

export function saveProfile(patch) {
  const next = { ...getProfile(), ...patch };
  Store.saveFightProfile(next);
  return next;
}

export const southpaw = () => getProfile().stance === 'southpaw';

// Leise sein? Abends ab 20 Uhr, wenn so eingestellt.
export function quietNow(profile = getProfile(), date = new Date()) {
  if (profile.quiet === 'always') return true;
  if (profile.quiet === 'evening') return date.getHours() >= 20 || date.getHours() < 7;
  return false;
}

// ---------- Formatierung ----------
export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtMin(sec) {
  return `${Math.max(1, Math.round(sec / 60))} Min`;
}

export function fmtKm(m, digits = 2) {
  if (!(m > 0)) return '0 km';
  return `${(m / 1000).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} km`;
}

export function fmtPace(secPerKm) {
  if (!(secPerKm > 0) || !Number.isFinite(secPerKm)) return '–:–';
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function parseClock(text) {
  const t = String(text || '').trim().replace(',', '.');
  if (!t) return null;
  const parts = t.split(':').map((x) => Number(x));
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) return null;
  if (parts.length === 1) return Math.round(parts[0] * 60); // nur Minuten
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return null;
}

// ---------- Zeit ----------
export function mondayOf(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}
export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function daysBetween(a, b) {
  return Math.round((startOfDay(new Date(b)) - startOfDay(new Date(a))) / DAY);
}
export const weekdayIndex = (d) => (new Date(d).getDay() + 6) % 7;

// ---------- Einheiten & Belastung ----------
// Kampfsport-Einheiten (alles außer reinen Werkzeug-Einträgen) und Läufe.
export const FIGHT_TYPES = {
  shadow: { label: 'Shadowboxing', icon: '🥊' },
  lesson: { label: 'Technik', icon: '🎯' },
  bag: { label: 'Sack', icon: '🥊' },
  rope: { label: 'Seilspringen', icon: '🪢' },
  conditioning: { label: 'Kondition', icon: '🔥' },
  pads: { label: 'Pratzen', icon: '🎯' },
  opponent: { label: 'Gegner', icon: '🛡️' },
  reflex: { label: 'Reflexe', icon: '⚡' },
  exam: { label: 'Gürtelprüfung', icon: '🥋' },
  timer: { label: 'Runden', icon: '⏱️' },
  club: { label: 'Vereinstraining', icon: '🏟️' },
  camera: { label: 'Kamera-Coach', icon: '📷' },
};

export function sessionMinutes(entry) {
  return Math.max(0, (entry.seconds || 0) / 60);
}

// Belastung nach Foster: Anstrengung (1–10) × Minuten. Ohne Angabe wird
// eine mittlere Anstrengung angenommen.
export function loadOf(entry) {
  const rpe = entry.rpe || (entry.kind === 'intervals' || entry.type === 'exam' ? 7 : 5);
  return Math.round(rpe * sessionMinutes(entry));
}

export function fightSessions() { return Store.getFightLog().filter((f) => f.type !== 'reaction'); }
export function runs() { return Store.getRuns(); }

// Wochenübersicht über alle Bereiche (inkl. Gym, nur lesend).
export function weekSummary(ref = new Date()) {
  const start = mondayOf(ref);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const inWeek = (iso) => { const d = new Date(iso); return d >= start && d < end; };
  const fight = fightSessions().filter((f) => inWeek(f.at));
  const run = runs().filter((r) => inWeek(r.at));
  const gym = Store.getWorkouts().filter((w) => w.finishedAt && inWeek(w.startedAt));
  const days = Array.from({ length: 7 }, () => ({ fight: false, run: false, gym: false }));
  fight.forEach((f) => { days[weekdayIndex(f.at)].fight = true; });
  run.forEach((r) => { days[weekdayIndex(r.at)].run = true; });
  gym.forEach((w) => { days[weekdayIndex(w.startedAt)].gym = true; });
  const rounds = fight.reduce((n, f) => n + (f.rounds || 0), 0);
  const km = run.reduce((n, r) => n + (r.distance || 0), 0) / 1000;
  const minutes = Math.round([...fight, ...run].reduce((n, e) => n + sessionMinutes(e), 0));
  const load = [...fight, ...run].reduce((n, e) => n + loadOf(e), 0);
  return { start, fight, run, gym, days, rounds, km, minutes, load, today: weekdayIndex(new Date()) };
}

// Einheiten der letzten Tage für Belastungs- und Planungsfragen.
export function recentEntries(days = 3) {
  const since = Date.now() - days * DAY;
  return [
    ...fightSessions().map((f) => ({ ...f, area: 'fight' })),
    ...runs().map((r) => ({ ...r, area: 'run' })),
  ].filter((e) => new Date(e.at).getTime() >= since).sort((a, b) => b.at.localeCompare(a.at));
}

export function hardSession(e) {
  if (e.area === 'run') return e.kind === 'intervals' || e.kind === 'tempo' || e.kind === 'test' || (e.rpe || 0) >= 8;
  return e.type === 'exam' || e.type === 'conditioning' || (e.rpe || 0) >= 8;
}

export function uidShort() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
