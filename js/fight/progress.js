// Lernstand: Gürtel, Stand jeder Technik und Wiederholung über die Zeit.
//
// Aus der Bewegungslernforschung übernommen:
// - Verteiltes Üben schlägt geballtes: gezählt werden auch die Tage, an
//   denen geübt wurde, nicht nur die Wiederholungen.
// - Was sitzt, muss trotzdem wiederkommen – je sicherer eine Technik, desto
//   größer der Abstand bis zur nächsten Wiederholung (2, 5, 12 Tage).
//   Überfällige Techniken „verblassen“ und tauchen im Coach häufiger auf.
import { Store } from '../storage.js';
import { TECHNIQUES, TECH, BELTS, techniquesOfBelt, COMBOS } from './data-tech.js';
import { dayKey, DAY, fightSessions } from './core.js';

const fresh = () => ({ belt: 0, beltSince: new Date().toISOString(), techniques: {}, exams: [], combos: {} });

export function getProgress() {
  const p = Store.getFightProgress();
  if (!p) return fresh();
  return { ...fresh(), ...p, techniques: { ...(p.techniques || {}) }, exams: [...(p.exams || [])], combos: { ...(p.combos || {}) } };
}
export function saveProgress(p) { Store.saveFightProgress(p); }

export const STATE_LABEL = ['Neu', 'Gesehen', 'Geübt', 'Sitzt', 'Automatisch'];
export const STATE_HINT = [
  'Noch nicht angeschaut.',
  'Angeschaut – jetzt in einer Lektion üben.',
  'Geübt – sie wird jetzt im Coach abgefragt.',
  'Sitzt – sauber und an vielen Tagen geübt.',
  'Automatisch – über Wochen gefestigt.',
];
const REVIEW_DAYS = [0, 1, 2, 5, 12];

function entryOf(p, id) {
  return p.techniques[id] || { seen: null, lessons: 0, reps: 0, days: [], last: null, checks: [] };
}

export function techEntry(id, p = getProgress()) { return entryOf(p, id); }

// Stand aus den Rohdaten berechnen – nachvollziehbar statt Punktekonto.
export function stateOf(e) {
  if (!e) return 0;
  const days = e.days?.length || 0;
  const span = days ? (new Date(e.days[e.days.length - 1]) - new Date(e.days[0])) / DAY : 0;
  const checkedOk = (e.checks || []).some((c) => c.ok);
  if (e.reps >= 800 && days >= 10 && span >= 21 && checkedOk) return 4;
  if (e.reps >= 300 && days >= 5 && checkedOk) return 3;
  if (e.lessons >= 1 || (e.reps >= 80 && days >= 2)) return 2;
  if (e.seen || e.reps > 0) return 1;
  return 0;
}

// Wie „frisch“ ist eine Technik? due: Wiederholung fällig; fade 0..1
export function freshness(e, now = Date.now()) {
  const state = stateOf(e);
  if (state < 2 || !e.last) return { due: false, fade: 0, days: null };
  const since = (now - new Date(e.last).getTime()) / DAY;
  const interval = REVIEW_DAYS[state] || 2;
  return { due: since >= interval, fade: Math.max(0, Math.min(1, (since - interval) / (interval * 2 + 2))), days: Math.floor(since) };
}

export function techStates(p = getProgress()) {
  const out = {};
  TECHNIQUES.forEach((t) => {
    const e = entryOf(p, t.id);
    out[t.id] = { state: stateOf(e), entry: e, fresh: freshness(e), locked: t.belt > p.belt };
  });
  return out;
}

export function markSeen(id) {
  const p = getProgress();
  const e = entryOf(p, id);
  if (e.seen) return false;
  p.techniques[id] = { ...e, seen: new Date().toISOString() };
  saveProgress(p);
  return true;
}

// Übung verbuchen: counts = { techId: Wiederholungen }. Liefert Aufstiege
// (z. B. „Jab sitzt jetzt“), die gefeiert werden können.
export function recordPractice(counts, { lesson = null, at = new Date() } = {}) {
  const p = getProgress();
  const day = dayKey(at);
  const promoted = [];
  Object.entries(counts).forEach(([id, reps]) => {
    if (!TECH[id] || !(reps > 0)) return;
    const e = entryOf(p, id);
    const before = stateOf(e);
    const days = e.days.includes(day) ? e.days : [...e.days, day].slice(-60);
    const next = {
      ...e,
      reps: (e.reps || 0) + Math.round(reps),
      days,
      last: at.toISOString(),
      lessons: (e.lessons || 0) + (lesson === id ? 1 : 0),
      seen: e.seen || at.toISOString(),
    };
    p.techniques[id] = next;
    const after = stateOf(next);
    if (after > before) promoted.push({ id, from: before, to: after });
  });
  saveProgress(p);
  return promoted;
}

export function recordCheck(id, ok) {
  const p = getProgress();
  const e = entryOf(p, id);
  const before = stateOf(e);
  const next = { ...e, checks: [...(e.checks || []), { at: new Date().toISOString(), ok: !!ok }].slice(-12) };
  p.techniques[id] = next;
  saveProgress(p);
  const after = stateOf(next);
  return after > before ? { id, from: before, to: after } : null;
}

export function recordCombos(ids) {
  const p = getProgress();
  ids.forEach((id) => {
    const c = p.combos[id] || { reps: 0, last: null };
    p.combos[id] = { reps: c.reps + 1, last: new Date().toISOString() };
  });
  saveProgress(p);
}

// Techniken, die der Coach ansagen darf: alles aus früheren Gürteln plus
// die schon angeschauten des aktuellen Gürtels.
export function coachPool(p = getProgress(), { all = false } = {}) {
  const states = techStates(p);
  return TECHNIQUES.filter((t) => {
    if (t.cat === 'stance') return false;
    if (all) return t.belt <= Math.max(p.belt, 0);
    if (t.belt < p.belt) return true;
    return t.belt === p.belt && states[t.id].state >= 1;
  });
}

export function comboPool(p = getProgress(), opts) {
  const pool = new Set(coachPool(p, opts).map((t) => t.id));
  const custom = Store.getFightCombos().map((c) => ({ ...c, custom: true }));
  return [...COMBOS, ...custom].filter((c) => c.seq.length && c.seq.every((id) => pool.has(id)));
}

// ---------- Gürtel ----------
export function beltStatus(p = getProgress()) {
  const belt = BELTS[p.belt];
  const next = BELTS[p.belt + 1] || null;
  const states = techStates(p);
  const list = techniquesOfBelt(p.belt).map((t) => ({ tech: t, ...states[t.id] }));
  const since = new Date(p.beltSince);
  const daysSince = Math.floor((Date.now() - since.getTime()) / DAY);
  const sessions = fightSessions().filter((f) => new Date(f.at) >= since).length;
  const needSessions = 4;
  const practiced = list.filter((x) => x.state >= 2).length;
  const missing = [];
  if (practiced < list.length) missing.push(`${list.length - practiced} ${list.length - practiced === 1 ? 'Technik' : 'Techniken'} noch üben`);
  if (sessions < needSessions) missing.push(`noch ${needSessions - sessions} ${needSessions - sessions === 1 ? 'Einheit' : 'Einheiten'}`);
  if (daysSince < belt.minDays) missing.push(`frühestens in ${belt.minDays - daysSince} ${belt.minDays - daysSince === 1 ? 'Tag' : 'Tagen'}`);
  const ready = !!next && missing.length === 0;
  const progress = next ? Math.min(1, (practiced / Math.max(1, list.length)) * 0.6
    + Math.min(1, sessions / needSessions) * 0.2 + Math.min(1, daysSince / Math.max(1, belt.minDays)) * 0.2) : 1;
  return { belt, index: p.belt, next, list, practiced, sessions, needSessions, daysSince, missing, ready, progress };
}

export const BELT_XP = [0, 300, 450, 600, 800, 1000, 1500];

export function passExam(result) {
  const p = getProgress();
  const from = p.belt;
  p.exams.push({ at: new Date().toISOString(), belt: from, passed: true, ...result });
  p.belt = Math.min(BELTS.length - 1, from + 1);
  p.beltSince = new Date().toISOString();
  saveProgress(p);
  return { from, to: p.belt, xp: BELT_XP[p.belt] || 0 };
}

export function failExam(result) {
  const p = getProgress();
  p.exams.push({ at: new Date().toISOString(), belt: p.belt, passed: false, ...result });
  saveProgress(p);
}

// Techniken, die als Nächstes dran sind (für Startseite/Lektionen)
export function nextToLearn(p = getProgress()) {
  const states = techStates(p);
  return techniquesOfBelt(p.belt).find((t) => states[t.id].state < 2) || null;
}

export function dueReviews(p = getProgress()) {
  const states = techStates(p);
  return TECHNIQUES.filter((t) => t.belt <= p.belt && states[t.id].fresh.due)
    .sort((a, b) => states[b.id].fresh.fade - states[a.id].fresh.fade);
}
