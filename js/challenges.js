// Challenges: Ziele, die man sich erarbeiten muss.
//
// Grundgedanken:
// - Schwer statt billig: fünf Stufen je Challenge, ausgelegt für jemanden mit
//   Trainingserfahrung. Der erste Versuch ist die Einstufung – was man schon
//   kann, gibt nur ein Viertel der XP. Gefeiert wird echter Fortschritt.
// - Ein gewerteter Versuch pro Challenge und Tag: jeder Versuch zählt, man
//   kann nichts an einem Nachmittag "durchklicken".
// - Wo möglich misst die App selbst: Stoppuhr beim Halten, Zähler per
//   Tippen bei Liegestützen, Kraftwerte direkt aus den Trainings.
// - Immer ein nächstes Ziel: nach jeder Stufe steht die nächste bereit, dazu
//   jede Woche drei neue Wochen-Challenges aus den eigenen Daten.

import { Store, uid } from './storage.js';
import { Icon } from './icons.js';
import { Sound } from './sound.js';
import { escapeHtml, plural, formatNumber, formatWeight, formatDate, estimate1RM, drawLineChart } from './utils.js';
import {
  TIERS, CHALLENGES, CATEGORIES, PLACEMENT_SHARE, PB_XP, SWEEP_XP, MAX_ACTIVE, CUSTOM_ICONS, levelInfo,
} from './challenges-data.js';

let ctx = null; // openSheet, closeSheet, toast, render, prefersReducedMotion
export function initChallenges(context) { ctx = context; }

const qs = (sel, parent = document) => parent.querySelector(sel);
const qsa = (sel, parent = document) => [...parent.querySelectorAll(sel)];
const DAY = 86400000;

// ---------- Zustand ----------
function load() {
  return {
    active: [], progress: {}, xpLog: [], weekly: {}, custom: [], ...(Store.getChallengeState() || {}),
  };
}
function save(s) { Store.saveChallengeState(s); }

function all(s) { return [...CHALLENGES, ...(s.custom || [])]; }
function find(id, s) { return all(s).find((c) => c.id === id) || null; }

const lowerIsBetter = (ch) => ch.kind === 'time';
const meets = (ch, value, target) => (lowerIsBetter(ch) ? value <= target : value >= target);
const better = (ch, a, b) => b === null || b === undefined || (lowerIsBetter(ch) ? a < b : a > b);

function unit() { return Store.getSettings().unit === 'lb' ? 'lb' : 'kg'; }

// Zielwerte der fünf Stufen; Gewichte in der eingestellten Einheit.
function targets(ch) {
  if (ch.kind === 'steps') return [1, 2, 3, 4, 5];
  if (ch.kind === 'lift' && unit() === 'lb') return ch.tiers.map((kg) => Math.round((kg * 2.20462) / 5) * 5);
  return ch.tiers;
}

function clock(sec) {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
}

export function formatValue(ch, v) {
  if (v === null || v === undefined) return '–';
  if (ch.kind === 'reps') return `${v} Wdh${ch.unitLabel ? ` ${ch.unitLabel}` : ''}`;
  if (ch.kind === 'hold' || ch.kind === 'time') return clock(v);
  if (ch.kind === 'lift') return `${ch.id === 'weighted-pullup' ? '+' : ''}${formatWeight(v, unit())}`;
  if (ch.kind === 'steps') return v > 0 ? ch.tiers[v - 1] : 'noch keine Stufe';
  return String(v);
}
const targetLabel = (ch, i) => (ch.kind === 'steps' ? ch.tiers[i] : formatValue(ch, targets(ch)[i]));

function sameDay(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

function newProgress() {
  return { acceptedAt: new Date().toISOString(), placed: false, tiers: [null, null, null, null, null], best: null, attempts: [] };
}

// Bester Wert aus den Trainings (Kraft: schwerste Wiederholung; Körpergewicht:
// meiste Wiederholungen in einem Satz).
function autoBest(ch) {
  if (!ch.auto) return null;
  const ids = new Set(ch.auto);
  let best = null;
  let estimate = 0;
  Store.getWorkouts().forEach((w) => {
    if (!w.finishedAt) return;
    w.entries.forEach((e) => {
      if (!ids.has(e.exerciseId)) return;
      e.sets.forEach((set) => {
        if (!set.done || !(set.reps > 0)) return;
        let v;
        if (ch.kind === 'lift') {
          if (!(set.weight > 0)) return;
          v = set.weight;
          if (ch.id !== 'weighted-pullup') estimate = Math.max(estimate, estimate1RM(set.weight, set.reps));
        } else {
          v = set.reps;
        }
        if (!best || v > best.value) best = { value: v, at: w.startedAt };
      });
    });
  });
  return best ? { ...best, estimate } : null;
}

function bestOf(ch, p) {
  let best = null;
  p.attempts.forEach((a) => { if (best === null || better(ch, a.value, best)) best = a.value; });
  const auto = autoBest(ch);
  if (auto && better(ch, auto.value, best)) best = auto.value;
  return best;
}

function nextTierIndex(p) {
  const i = p.tiers.findIndex((t) => !t);
  return i < 0 ? null : i;
}
function currentTierIndex(p) {
  let i = -1;
  p.tiers.forEach((t, k) => { if (t) i = k; });
  return i;
}

function totalXp(s) { return s.xpLog.reduce((n, e) => n + e.xp, 0); }

function addXp(s, entry) {
  s.xpLog.push({ id: uid(), at: new Date().toISOString(), ...entry });
}

// Fortschritt einer Challenge mit allen Quellen abgleichen. Liefert die
// Ereignisse (neue Stufen, Einstufung, Bestwert), die gefeiert werden.
function sync(s, id) {
  const ch = find(id, s);
  const p = s.progress[id];
  if (!ch || !p || ch.kind === 'steps') return [];
  const best = bestOf(ch, p);
  if (best === null) return [];
  const events = [];
  const t = targets(ch);
  const placement = !p.placed;
  const unlocked = [];
  t.forEach((target, i) => {
    if (p.tiers[i] || !meets(ch, best, target)) return;
    p.tiers[i] = { at: new Date().toISOString(), placement };
    const xp = Math.round(TIERS[i].xp * (placement ? PLACEMENT_SHARE : 1));
    addXp(s, { kind: placement ? 'placement' : 'tier', challengeId: id, tier: i, xp });
    unlocked.push({ tier: i, xp });
  });
  if (placement) {
    p.placed = true;
    p.placementValue = best;
    events.push({ type: 'placement', ch, value: best, tiers: unlocked.map((u) => u.tier), xp: unlocked.reduce((n, u) => n + u.xp, 0) });
  } else if (unlocked.length) {
    unlocked.forEach((u) => events.push({ type: 'tier', ch, tier: u.tier, xp: u.xp, value: best }));
  } else if (better(ch, best, p.best)) {
    const today = new Date().toISOString();
    if (!p.lastPbXp || !sameDay(p.lastPbXp, today)) {
      p.lastPbXp = today;
      addXp(s, { kind: 'pb', challengeId: id, xp: PB_XP });
      events.push({ type: 'pb', ch, value: best, previous: p.best, xp: PB_XP });
    }
  }
  p.best = best;
  return events;
}

// ---------- Wochen-Challenges ----------
function monday(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}
function keyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function volumeOf(workouts) {
  return workouts.reduce((n, w) => n + w.entries.reduce((m, e) => m + e.sets.filter((x) => x.done).reduce((k, x) => k + (x.weight || 0) * (x.reps || 0), 0), 0), 0);
}
function setsOf(workouts) {
  return workouts.reduce((n, w) => n + w.entries.reduce((m, e) => m + e.sets.filter((x) => x.done).length, 0), 0);
}

function weekContext(s) {
  const start = monday();
  const prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
  const finished = Store.getWorkouts().filter((w) => w.finishedAt);
  const thisWeek = finished.filter((w) => new Date(w.startedAt) >= start);
  const lastWeek = finished.filter((w) => { const d = new Date(w.startedAt); return d >= prevStart && d < start; });
  const settings = Store.getSettings();
  const mobilityDays = new Set(Store.getMobilityLog()
    .filter((m) => (m.completed || m.seconds >= 180) && new Date(m.startedAt) >= start)
    .map((m) => new Date(m.startedAt).toDateString())).size;
  const manualActive = s.active.filter((id) => { const ch = find(id, s); return ch && ch.kind !== 'lift'; }).length;
  const attemptIds = new Set();
  Object.entries(s.progress).forEach(([id, p]) => p.attempts.forEach((a) => { if (new Date(a.at) >= start) attemptIds.add(id); }));
  return {
    settings,
    thisWeek,
    lastWeek,
    allWorkouts: finished.length,
    prs: thisWeek.reduce((n, w) => n + w.entries.reduce((m, e) => m + e.sets.filter((x) => x.pr).length, 0), 0),
    volume: volumeOf(thisWeek),
    lastVolume: volumeOf(lastWeek),
    sets: setsOf(thisWeek),
    lastSets: setsOf(lastWeek),
    mobilityDays,
    manualActive,
    activeCount: s.active.length,
    attempts: attemptIds.size,
    pbs: s.xpLog.filter((e) => (e.kind === 'pb' || e.kind === 'tier') && new Date(e.at) >= start).length,
  };
}

const WEEKLY = [
  { id: 'sessions', icon: '🗓️', xp: 80, eligible: () => true, target: (c) => c.settings.weeklyGoal + 1, value: (c) => c.thisWeek.length, text: (t) => `${t}× trainieren – eine Einheit mehr als dein Wochenziel` },
  { id: 'prs', icon: '🏆', xp: 100, eligible: (c) => c.allWorkouts >= 3, target: () => 3, value: (c) => c.prs, text: (t) => `${t} neue Rekorde im Training aufstellen` },
  { id: 'volume', icon: '📈', xp: 80, eligible: (c) => c.lastVolume > 0, target: (c) => Math.ceil((c.lastVolume * 1.1) / 100) * 100, value: (c) => c.volume, text: (t) => `${Math.round(t).toLocaleString('de-DE')} ${unit()} Volumen – 10 % mehr als letzte Woche` },
  { id: 'sets', icon: '🧱', xp: 60, eligible: (c) => c.lastSets > 0, target: (c) => Math.max(20, Math.ceil(c.lastSets * 1.15)), value: (c) => c.sets, text: (t) => `${t} Sätze abschließen – 15 % mehr als letzte Woche` },
  { id: 'attempts', icon: '🎯', xp: 60, eligible: (c) => c.manualActive >= 2, target: () => 2, value: (c) => c.attempts, text: () => 'In 2 verschiedenen Challenges einen Versuch machen' },
  { id: 'challenge-pb', icon: '⚡', xp: 100, eligible: (c) => c.activeCount >= 1, target: () => 1, value: (c) => c.pbs, text: () => 'In einer Challenge einen neuen Bestwert holen' },
  { id: 'mobility', icon: '🧘', xp: 60, eligible: (c) => c.settings.mobility, target: (c) => c.settings.mobilityGoal, value: (c) => c.mobilityDays, text: (t) => `${t}× Mobility machen` },
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Die Auswahl einer Woche wird beim ersten Öffnen festgeschrieben – sonst
// würden sich Aufgabe und Ziel mitten in der Woche ändern.
function weekly(s, c = weekContext(s)) {
  const key = keyOf(monday());
  if (!s.weekly[key]) {
    const pool = WEEKLY.filter((w) => w.eligible(c));
    const seed = hash(key);
    const shuffled = pool.map((w, i) => ({ w, r: hash(`${seed}:${w.id}:${i}`) })).sort((a, b) => a.r - b.r).map((x) => x.w);
    // Training kommt immer vor – die Gym-App bleibt eine Gym-App.
    const pick = [WEEKLY[0], ...shuffled.filter((w) => w.id !== 'sessions')].slice(0, 3);
    s.weekly[key] = { items: pick.map((w) => ({ id: w.id, target: w.target(c) })), done: [], sweep: false };
    // Alte Wochen aufräumen, nur die letzten 12 behalten
    Object.keys(s.weekly).sort().slice(0, -12).forEach((k) => delete s.weekly[k]);
  }
  const week = s.weekly[key];
  const items = week.items.map((it) => {
    const def = WEEKLY.find((w) => w.id === it.id);
    if (!def) return null;
    return { ...it, def, value: def.value(c), done: week.done.includes(it.id) };
  }).filter(Boolean);
  return { key, week, items };
}

function evaluateWeekly(s) {
  const { week, items } = weekly(s);
  const events = [];
  items.forEach((it) => {
    if (it.done || it.value < it.target) return;
    week.done.push(it.id);
    addXp(s, { kind: 'weekly', weeklyId: it.id, xp: it.def.xp });
    events.push({ type: 'weekly', icon: it.def.icon, text: it.def.text(it.target), xp: it.def.xp });
  });
  if (!week.sweep && items.length && items.every((it) => week.done.includes(it.id))) {
    week.sweep = true;
    addXp(s, { kind: 'sweep', xp: SWEEP_XP });
    events.push({ type: 'sweep', xp: SWEEP_XP });
  }
  return events;
}

// Alles abgleichen – nach dem Training, beim Öffnen des Tabs.
export function checkChallenges() {
  const s = load();
  const before = totalXp(s);
  const events = [];
  s.active.forEach((id) => events.push(...sync(s, id)));
  events.push(...evaluateWeekly(s));
  save(s);
  return { events, before, after: totalXp(s) };
}

// Für einen Hinweis mitten im Training: würde dieser Satz eine Stufe knacken?
export function challengeHintForSet(exerciseId, weight, reps) {
  const s = load();
  for (const id of s.active) {
    const ch = find(id, s);
    const p = s.progress[id];
    if (!ch || !p || !p.placed || !ch.auto?.includes(exerciseId) || !(reps > 0)) continue;
    const value = ch.kind === 'lift' ? weight : reps;
    if (ch.kind === 'lift' && !(weight > 0)) continue;
    const next = nextTierIndex(p);
    if (next === null) continue;
    if (meets(ch, value, targets(ch)[next])) return `🏆 ${TIERS[next].name} geknackt: ${ch.short} ${formatValue(ch, value)}!`;
  }
  return null;
}

// Für die Startseite/den Tab: gibt es diese Woche etwas Neues?
export function challengeBadge() {
  const s = load();
  return s.seenWeek !== keyOf(monday());
}

// ---------- Darstellung: Bausteine ----------
function medal(tier, { size = '', placement = false, content = '' } = {}) {
  if (tier === null || tier < 0) return `<span class="medal empty ${size}">${content}</span>`;
  return `<span class="medal t${tier} ${size} ${placement ? 'placed' : ''}">${content || ['I', 'II', 'III', 'IV', 'V'][tier]}</span>`;
}

function progressTowards(ch, p) {
  const next = nextTierIndex(p);
  const t = targets(ch);
  if (next === null) return { ratio: 1, text: 'Alle Stufen gemeistert' };
  if (ch.kind === 'steps') {
    return { ratio: next / 5, text: `Nächste Stufe: ${ch.tiers[next]}` };
  }
  const best = p.best ?? bestOf(ch, p);
  const target = t[next];
  if (best === null) return { ratio: 0, text: `Ziel: ${formatValue(ch, target)}` };
  const prev = next > 0 ? t[next - 1] : (lowerIsBetter(ch) ? Math.round(t[0] * 1.35) : 0);
  let ratio;
  if (lowerIsBetter(ch)) ratio = (prev - best) / (prev - target);
  else ratio = (best - prev) / (target - prev);
  ratio = Math.max(0.03, Math.min(1, ratio));
  let gap;
  if (ch.kind === 'hold' || ch.kind === 'time') gap = clock(Math.abs(target - best));
  else if (ch.kind === 'lift') gap = formatWeight(Math.abs(target - best), unit());
  else gap = `${Math.abs(target - best)} Wdh`;
  return { ratio, text: `Bestwert ${formatValue(ch, best)} · noch ${gap} bis ${TIERS[next].name}` };
}

function attemptState(ch, p) {
  if (ch.kind === 'lift') return { mode: 'auto' };
  if (!p.placed && ch.kind !== 'steps') return { mode: 'placement' };
  if (!p.placed && ch.kind === 'steps') return { mode: 'placement' };
  if (nextTierIndex(p) === null) return { mode: 'done' };
  const today = new Date().toISOString();
  const tried = p.attempts.some((a) => a.source !== 'auto' && sameDay(a.at, today));
  return { mode: tried ? 'tomorrow' : 'ready' };
}

function actionButton(ch, p) {
  const st = attemptState(ch, p);
  if (st.mode === 'auto') return `<span class="ch-auto">${Icon.chart} automatisch</span>`;
  if (st.mode === 'done') return '<span class="ch-auto done">gemeistert</span>';
  if (st.mode === 'tomorrow') return `<span class="ch-auto">${Icon.clock} morgen wieder</span>`;
  const label = st.mode === 'placement' ? 'Einstufen' : ch.kind === 'steps' ? 'Bestätigen' : 'Versuch';
  return `<button class="btn btn-small btn-primary ch-go" data-action="ch-attempt" data-id="${ch.id}">${label}</button>`;
}

// Vorschläge für den Einstieg: zuerst, was die Trainings schon hergeben
// (dort gibt es gleich eine Einstufung), dann eine bunte Mischung aus den
// übrigen Bereichen.
const STARTERS = ['pullups', 'pushups', 'muscleup', 'deadhang', 'bench', 'plank', 'run5k'];
function suggestions(s, count = 3) {
  const open = all(s).filter((ch) => !s.active.includes(ch.id) && !(s.progress[ch.id] && nextTierIndex(s.progress[ch.id]) === null));
  const known = open
    .map((ch) => ({ ch, auto: autoBest(ch) }))
    .filter((x) => x.auto && x.ch.kind !== 'steps')
    .map((x) => ({ ...x, reach: targets(x.ch).filter((t) => meets(x.ch, x.auto.value, t)).length, share: x.auto.value / targets(x.ch)[0] }))
    // am reizvollsten: knapp unter oder gerade über der ersten Stufe
    .sort((a, b) => Math.abs(1 - a.share) - Math.abs(1 - b.share));
  const picked = known.slice(0, 2);
  const cats = new Set(picked.map((x) => x.ch.category));
  for (const id of STARTERS) {
    if (picked.length >= count) break;
    const ch = open.find((c) => c.id === id);
    if (!ch || picked.some((x) => x.ch.id === id) || cats.has(ch.category)) continue;
    picked.push({ ch, auto: autoBest(ch) });
    cats.add(ch.category);
  }
  open.forEach((ch) => { if (picked.length < count && !picked.some((x) => x.ch.id === ch.id)) picked.push({ ch, auto: null }); });
  return picked.map(({ ch, auto }) => {
    let hint;
    if (auto && ch.kind !== 'steps') {
      const reached = targets(ch).filter((t) => meets(ch, auto.value, t)).length;
      hint = reached
        ? `Dein Bestwert ${formatValue(ch, auto.value)} – ${TIERS[reached - 1].name} hast du schon`
        : `Dein Bestwert ${formatValue(ch, auto.value)} · Bronze bei ${targetLabel(ch, 0)}`;
    } else {
      hint = ch.kind === 'steps' ? `${ch.tiers.length} Etappen bis ${ch.tiers[4]}` : `${targetLabel(ch, 0)} → ${targetLabel(ch, 4)}`;
    }
    return `
      <button class="list-item selectable ch-row" data-action="ch-pick" data-id="${ch.id}">
        <span class="ch-row-icon">${ch.icon}</span>
        <div class="list-item-main"><strong>${escapeHtml(ch.name)}</strong><span class="muted small">${escapeHtml(hint)}</span></div>
        ${Icon.chevron}
      </button>`;
  }).join('');
}

// ---------- Tab ----------
export function renderChallenges() {
  const s = load();
  const xp = totalXp(s);
  const lvl = levelInfo(xp);
  const medalsByTier = [0, 0, 0, 0, 0];
  Object.values(s.progress).forEach((p) => p.tiers.forEach((t, i) => { if (t) medalsByTier[i] += 1; }));
  const { items, week } = weekly(s);
  save(s); // eine neu ausgeloste Woche festschreiben
  const daysLeft = 7 - ((new Date().getDay() + 6) % 7);
  const R = 2 * Math.PI * 40;

  const weeklyHtml = items.map((it) => {
    const ratio = Math.min(1, it.value / it.target);
    return `
      <div class="ch-week-item ${it.done ? 'done' : ''}">
        <span class="ch-week-icon">${it.done ? Icon.check : it.def.icon}</span>
        <div class="ch-week-main">
          <span class="ch-week-text">${escapeHtml(it.def.text(it.target))}</span>
          <span class="ch-week-bar"><i style="transform:scaleX(${ratio})"></i></span>
        </div>
        <span class="ch-week-xp">${it.done ? '✓' : `+${it.def.xp}`}</span>
      </div>`;
  }).join('');

  const activeHtml = s.active.map((id) => {
    const ch = find(id, s);
    const p = s.progress[id];
    if (!ch || !p) return '';
    const cur = currentTierIndex(p);
    const prog = progressTowards(ch, p);
    const next = nextTierIndex(p);
    return `
      <div class="card ch-card ${next === null ? 'mastered' : ''}" data-id="${id}">
        <button class="ch-card-main" data-action="ch-open" data-id="${id}">
          ${medal(cur, { placement: cur >= 0 && p.tiers[cur]?.placement, content: cur >= 0 ? '' : ch.icon })}
          <span class="ch-card-text">
            <strong>${escapeHtml(ch.name)}</strong>
            <span class="muted small">${!p.placed ? 'Einstufung steht aus' : next === null ? 'Alle fünf Stufen' : `${TIERS[next].name}: ${escapeHtml(targetLabel(ch, next))}`}</span>
          </span>
        </button>
        ${actionButton(ch, p)}
        ${p.placed ? `<div class="ch-bar ${next !== null ? `to-t${next}` : ''}"><i style="transform:scaleX(${prog.ratio})"></i></div>
        <p class="muted small ch-progress-text">${escapeHtml(prog.text)}</p>` : ''}
      </div>`;
  }).join('');

  const trophies = [];
  Object.entries(s.progress).forEach(([id, p]) => {
    const ch = find(id, s);
    if (!ch) return;
    p.tiers.forEach((t, i) => { if (t) trophies.push({ ch, tier: i, at: t.at, placement: t.placement }); });
  });
  trophies.sort((a, b) => b.at.localeCompare(a.at));

  const feed = s.xpLog.slice(-6).reverse().map((e) => {
    const ch = e.challengeId ? find(e.challengeId, s) : null;
    const text = {
      tier: ch ? `${TIERS[e.tier].name} · ${ch.short}` : 'Stufe',
      placement: ch ? `Einstufung · ${ch.short}` : 'Einstufung',
      pb: ch ? `Neuer Bestwert · ${ch.short}` : 'Bestwert',
      weekly: 'Wochen-Challenge geschafft',
      sweep: 'Alle Wochen-Challenges',
    }[e.kind] || 'XP';
    return `<div class="ch-feed-row"><span>${escapeHtml(text)}</span><span class="muted small">${formatDate(e.at)}</span><strong>+${e.xp}</strong></div>`;
  }).join('');

  return `
    <section class="card ch-hero">
      <div class="ch-level">
        <svg viewBox="0 0 96 96"><circle class="ch-level-bg" cx="48" cy="48" r="40"/>
          <circle class="ch-level-fg" cx="48" cy="48" r="40" stroke-dasharray="${R}" stroke-dashoffset="${R * (1 - lvl.into / lvl.need)}"/></svg>
        <span class="ch-level-num"><small>Level</small>${lvl.level}</span>
      </div>
      <div class="ch-hero-text">
        <span class="ch-rank">${lvl.title}</span>
        <span class="muted small">${lvl.into.toLocaleString('de-DE')} / ${lvl.need.toLocaleString('de-DE')} XP bis Level ${lvl.level + 1}</span>
        <div class="ch-medal-row">${medalsByTier.map((n, i) => `<span class="ch-medal-count">${medal(i, { size: 'xs' })}${n}</span>`).join('')}</div>
      </div>
    </section>

    <section>
      <div class="section-title ch-section-head">Deine Challenges <span>${s.active.length}/${MAX_ACTIVE}</span></div>
      ${activeHtml || `
        <div class="card ch-empty">
          <div class="ch-empty-head">
            <span class="ch-empty-icon">🎯</span>
            <div>
              <strong>Such dir deine erste Challenge</strong>
              <p class="muted small">Tipp eine an – du siehst Stufen und Regeln und kannst sie direkt annehmen.</p>
            </div>
          </div>
          <div class="ch-suggest-title">Vorschläge für dich</div>
          <div class="list ch-suggest">${suggestions(s)}</div>
        </div>`}
      ${s.active.length < MAX_ACTIVE ? `<button class="btn ${s.active.length ? 'btn-secondary' : 'btn-primary'} full ch-add" data-action="ch-catalog">${s.active.length ? `${Icon.plus} Weitere Challenge wählen` : `Alle ${all(s).length} Challenges ansehen`}</button>` : ''}
    </section>

    <section>
      <div class="section-title ch-section-head">Wochen-Challenges <span>noch ${plural(daysLeft, 'Tag', 'Tage')}</span></div>
      <div class="card ch-week ${week.sweep ? 'sweep' : ''}">
        ${weeklyHtml}
        <p class="muted small ch-week-foot">${week.sweep ? '🔥 Woche komplett – Bonus eingesammelt.' : `Alle drei geschafft: +${SWEEP_XP} XP Bonus`}</p>
      </div>
    </section>

    ${trophies.length ? `
    <section>
      <div class="section-title ch-section-head">Trophäen <span>${trophies.length}</span></div>
      <div class="card ch-trophies">${trophies.map((t) => `
        <button class="ch-trophy" data-action="ch-open" data-id="${t.ch.id}">
          ${medal(t.tier, { size: 'sm', placement: t.placement })}
          <span>${escapeHtml(t.ch.short)}</span>
        </button>`).join('')}</div>
    </section>` : ''}

    ${feed ? `
    <section>
      <div class="section-title">Zuletzt verdient</div>
      <div class="card ch-feed">${feed}</div>
    </section>` : ''}`;
}

export function bindChallenges(root) {
  qsa('[data-action="ch-open"]', root).forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.id)));
  qsa('[data-action="ch-attempt"]', root).forEach((b) => b.addEventListener('click', () => startAttempt(b.dataset.id)));
  qsa('[data-action="ch-pick"]', root).forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.id)));
  qs('[data-action="ch-catalog"]', root)?.addEventListener('click', openCatalog);
  // Wochen gesehen – der Punkt am Tab verschwindet
  const s = load();
  const key = keyOf(monday());
  if (s.seenWeek !== key) { s.seenWeek = key; save(s); qs('.tab-btn[data-tab="challenges"]')?.classList.remove('has-news'); }
}

// Beim Öffnen des Tabs: Neues aus den Trainings abgleichen und feiern.
export function onChallengesShown() {
  const result = checkChallenges();
  if (result.events.length) {
    celebrate(result.events, result.before, () => ctx.render());
  }
}

// ---------- Katalog ----------
function openCatalog() {
  const s = load();
  const rows = CATEGORIES.map((cat) => {
    const list = all(s).filter((ch) => (ch.category || 'Eigene') === cat);
    if (!list.length) return '';
    return `<div class="section-title" style="margin-top:12px">${cat}</div>
      <div class="card list">${list.map((ch) => catalogRow(ch, s)).join('')}</div>`;
  }).join('');
  const custom = (s.custom || []).length ? `<div class="section-title" style="margin-top:12px">Eigene</div>
    <div class="card list">${s.custom.map((ch) => catalogRow(ch, s)).join('')}</div>` : '';
  ctx.openSheet('Challenge wählen', `
    <p class="muted small ch-catalog-intro">Fünf Stufen pro Challenge, von „anspruchsvoll“ bis „Monate Arbeit“. Wähle, was dich reizt – höchstens ${MAX_ACTIVE} gleichzeitig.</p>
    ${rows}${custom}
    <button class="btn btn-secondary full" style="margin-top:14px" data-action="ch-custom">${Icon.plus} Eigene Challenge erstellen</button>
  `, {
    onMount: (root) => {
      qsa('[data-action="ch-pick"]', root).forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.id, { back: openCatalog })));
      qs('[data-action="ch-custom"]', root).addEventListener('click', openCustomEditor);
    },
  });
}

function catalogRow(ch, s) {
  const active = s.active.includes(ch.id);
  const p = s.progress[ch.id];
  const cur = p ? currentTierIndex(p) : -1;
  const range = ch.kind === 'steps' ? `${ch.tiers.length} Etappen bis ${ch.tiers[4]}` : `${formatValue(ch, targets(ch)[0])} → ${formatValue(ch, targets(ch)[4])}`;
  return `
    <button class="list-item selectable ch-row" data-action="ch-pick" data-id="${ch.id}">
      <span class="ch-row-icon">${ch.icon}</span>
      <div class="list-item-main"><strong>${escapeHtml(ch.name)}</strong><span class="muted small">${escapeHtml(range)}</span></div>
      ${active ? '<span class="pill pill-chosen">aktiv</span>' : cur >= 0 ? medal(cur, { size: 'xs' }) : Icon.chevron}
    </button>`;
}

// Eigene Challenge: nur das große Ziel angeben – die Leiter dorthin rechnet
// die App (60 % bis 100 % des Ziels, bei Zeiten entsprechend langsamer).
function openCustomEditor() {
  const draft = { name: '', icon: CUSTOM_ICONS[0], kind: 'reps', goal: '' };
  const kinds = [
    { id: 'reps', label: 'Wiederholungen', hint: 'z. B. 150 Kniebeugen am Stück' },
    { id: 'hold', label: 'Halten (Stoppuhr)', hint: 'z. B. 3 Minuten Hohlkörper' },
    { id: 'time', label: 'Auf Zeit', hint: 'z. B. 1 km Rudern unter 3:20' },
  ];
  ctx.openSheet('Eigene Challenge', `
    <label class="field-label">Name</label>
    <input type="text" id="ch-name" class="text-input" placeholder="z. B. Hohlkörper halten" />
    <label class="field-label">Symbol</label>
    <div class="ch-icon-row">${CUSTOM_ICONS.map((ic, i) => `<button class="ch-icon-pick ${i === 0 ? 'active' : ''}" data-icon="${ic}">${ic}</button>`).join('')}</div>
    <label class="field-label">Art</label>
    <div class="ch-kind-list">${kinds.map((k, i) => `<button class="mob-option ${i === 0 ? 'active' : ''}" data-kind="${k.id}"><span class="mob-option-dot"></span><span><strong>${k.label}</strong><br><span class="muted small">${k.hint}</span></span></button>`).join('')}</div>
    <label class="field-label" id="ch-goal-label">Großes Ziel (Wiederholungen)</label>
    <input type="text" inputmode="numeric" id="ch-goal" class="text-input" placeholder="z. B. 150" />
    <p class="muted small" id="ch-ladder"></p>
  `, {
    footer: '<button class="btn btn-primary full" data-action="ch-custom-save">Challenge anlegen</button>',
    onDismiss: openCatalog,
    onMount: (root) => {
      const ladder = () => {
        const goal = parseGoal(qs('#ch-goal', root).value, draft.kind);
        qs('#ch-ladder', root).textContent = goal ? `Stufen: ${customTiers(goal, draft.kind).map((v) => formatValue({ kind: draft.kind }, v)).join(' → ')}` : '';
      };
      qsa('.ch-icon-pick', root).forEach((b) => b.addEventListener('click', () => {
        draft.icon = b.dataset.icon;
        qsa('.ch-icon-pick', root).forEach((x) => x.classList.toggle('active', x === b));
      }));
      qsa('[data-kind]', root).forEach((b) => b.addEventListener('click', () => {
        draft.kind = b.dataset.kind;
        qsa('[data-kind]', root).forEach((x) => x.classList.toggle('active', x === b));
        qs('#ch-goal-label', root).textContent = draft.kind === 'reps' ? 'Großes Ziel (Wiederholungen)' : draft.kind === 'hold' ? 'Großes Ziel (Zeit, z. B. 3:00)' : 'Großes Ziel (Bestzeit, z. B. 3:20)';
        qs('#ch-goal', root).inputMode = draft.kind === 'reps' ? 'numeric' : 'text';
        ladder();
      }));
      qs('#ch-goal', root).addEventListener('input', ladder);
      qs('[data-action="ch-custom-save"]', root).addEventListener('click', () => {
        const name = qs('#ch-name', root).value.trim();
        const goal = parseGoal(qs('#ch-goal', root).value, draft.kind);
        if (!name) { qs('#ch-name', root).focus(); return; }
        if (!goal) { qs('#ch-goal', root).focus(); return; }
        const s = load();
        const ch = {
          id: `custom-${uid()}`, name, short: name, icon: draft.icon, category: 'Eigene', kind: draft.kind, custom: true,
          tiers: customTiers(goal, draft.kind), tap: false,
          standard: ['Nur saubere Ausführung zählt – so, wie du sie dir selbst vorgenommen hast.'],
          tip: 'Regelmäßig üben, alle paar Tage ein ehrlicher Versuch. Fortschritt kommt in Wochen, nicht in Tagen.',
        };
        s.custom = [...(s.custom || []), ch];
        save(s);
        openDetail(ch.id, { back: openCatalog });
      });
    },
  });
}

function parseGoal(text, kind) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (kind === 'reps') { const n = parseInt(t, 10); return n > 0 ? n : null; }
  const m = t.match(/^(\d+)(?:[:.,](\d{1,2}))?$/);
  if (!m) return null;
  // Ohne Doppelpunkt: beim Halten Sekunden, bei Zeiten Minuten
  const sec = m[2] !== undefined ? +m[1] * 60 + +m[2] : (kind === 'hold' ? +m[1] : +m[1] * 60);
  return sec > 0 ? sec : null;
}

function customTiers(goal, kind) {
  if (kind === 'time') return [1.25, 1.17, 1.11, 1.05, 1].map((f) => Math.round(goal * f));
  const tiers = [0.6, 0.7, 0.8, 0.9, 1].map((f) => Math.max(1, Math.round(goal * f)));
  return tiers.map((v, i) => Math.max(v, (tiers[i - 1] || 0) + 1));
}

// ---------- Detail ----------
function ladderHtml(ch, p) {
  const next = p ? nextTierIndex(p) : 0;
  return `<div class="ch-ladder">${TIERS.map((tier, i) => {
    const got = p?.tiers[i];
    const cls = got ? 'got' : i === next ? 'next' : 'locked';
    return `
      <div class="ch-step ${cls}">
        ${got ? medal(i, { placement: got.placement }) : `<span class="medal empty ${i === next ? 'pulse' : ''}">${i === next ? ['I', 'II', 'III', 'IV', 'V'][i] : Icon.lock}</span>`}
        <div class="ch-step-text">
          <span class="ch-step-name">${tier.name}${got?.placement ? ' <em>eingestuft</em>' : ''}</span>
          <strong>${escapeHtml(targetLabel(ch, i))}</strong>
        </div>
        <span class="ch-step-xp">${got ? (got.placement ? formatDate(got.at) : `✓ ${formatDate(got.at)}`) : `+${tier.xp} XP`}</span>
      </div>`;
  }).join('')}</div>`;
}

function openDetail(id, { back = null } = {}) {
  const s = load();
  const ch = find(id, s);
  if (!ch) return;
  const p = s.progress[id];
  const active = s.active.includes(id);
  const best = p ? (p.best ?? bestOf(ch, p)) : bestOf(ch, newProgress());
  const auto = autoBest(ch);
  const attempts = p ? p.attempts.filter((a) => a.source !== 'auto') : [];
  const st = p && active ? attemptState(ch, p) : null;

  let footer;
  if (!active) {
    const full = s.active.length >= MAX_ACTIVE;
    footer = `<button class="btn btn-primary full" data-action="ch-accept" ${full ? 'disabled' : ''}>${full ? `Schon ${MAX_ACTIVE} aktiv – erst eine beenden` : 'Challenge annehmen'}</button>
      ${ch.custom ? `<button class="btn btn-ghost danger full" data-action="ch-delete">${Icon.trash} Eigene Challenge löschen</button>` : ''}`;
  } else {
    const label = { placement: 'Einstufung starten', ready: ch.kind === 'steps' ? 'Nächste Stufe bestätigen' : 'Versuch starten', tomorrow: 'Nächster Versuch ab morgen', done: 'Alle Stufen gemeistert', auto: 'Wird aus deinen Trainings übernommen' }[st.mode];
    const can = st.mode === 'placement' || st.mode === 'ready';
    footer = `<button class="btn btn-primary full" data-action="ch-detail-attempt" ${can ? '' : 'disabled'}>${label}</button>
      ${ch.kind === 'lift' && p.placed ? '<button class="btn btn-ghost full" data-action="ch-lift-manual">Außerhalb der App geschafft? Eintragen</button>' : ''}
      <button class="btn btn-ghost danger full" data-action="ch-drop">Challenge beenden</button>`;
  }

  const estimate = ch.kind === 'lift' && auto?.estimate ? `<p class="muted small">Geschätztes Maximum aus deinen Sätzen: <strong>${formatWeight(Math.round(auto.estimate), unit())}</strong></p>` : '';

  ctx.openSheet(`${ch.icon} ${escapeHtml(ch.name)}`, `
    ${active && p?.placed ? `
      <div class="card stat-row detail-stats">
        <div><span class="stat-value">${formatValue(ch, best).replace(' Wdh', '').replace(' je Bein', '')}</span><span class="muted small">Bestwert</span></div>
        <div><span class="stat-value">${attempts.length}</span><span class="muted small">Versuche</span></div>
        <div><span class="stat-value">${currentTierIndex(p) >= 0 ? TIERS[currentTierIndex(p)].name : '–'}</span><span class="muted small">Stufe</span></div>
      </div>` : ''}
    ${!active && best !== null && ch.kind !== 'steps' ? `<p class="ch-known">Aus deinen Trainings bekannt: <strong>${formatValue(ch, best)}</strong> – daraus wird deine Einstufung.</p>` : ''}
    ${estimate}
    ${ladderHtml(ch, active ? p : null)}
    ${attempts.length > 1 && ch.kind !== 'steps' ? '<div class="card"><div class="section-title">Deine Versuche</div><canvas class="chart ch-chart"></canvas></div>' : ''}
    <div class="section-title" style="margin-top:14px">So zählt es</div>
    <ul class="ch-rules">${ch.standard.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
    <div class="section-title" style="margin-top:14px">So kommst du hin</div>
    <p class="ch-tip">${escapeHtml(ch.tip)}</p>
  `, {
    footer,
    onDismiss: back,
    onMount: (root) => {
      const canvas = qs('.ch-chart', root);
      if (canvas) drawLineChart(canvas, attempts.map((a) => ({ value: a.value, label: formatDate(a.at) })));
      qs('[data-action="ch-accept"]', root)?.addEventListener('click', () => accept(id));
      qs('[data-action="ch-detail-attempt"]', root)?.addEventListener('click', () => { ctx.closeSheet(); startAttempt(id); });
      qs('[data-action="ch-lift-manual"]', root)?.addEventListener('click', () => { ctx.closeSheet(); startAttempt(id, { manualLift: true }); });
      qs('[data-action="ch-drop"]', root)?.addEventListener('click', () => {
        if (!confirm(`„${ch.name}“ beenden? Erreichte Stufen und XP bleiben erhalten.`)) return;
        const st2 = load();
        st2.active = st2.active.filter((x) => x !== id);
        save(st2);
        ctx.closeSheet();
        ctx.render();
      });
      qs('[data-action="ch-delete"]', root)?.addEventListener('click', () => {
        if (!confirm(`„${ch.name}“ löschen?`)) return;
        const st2 = load();
        st2.custom = st2.custom.filter((x) => x.id !== id);
        delete st2.progress[id];
        save(st2);
        openCatalog();
      });
    },
  });
}

function accept(id) {
  const s = load();
  if (s.active.length >= MAX_ACTIVE || s.active.includes(id)) return;
  const ch = find(id, s);
  s.active.push(id);
  const before = totalXp(s);
  if (!s.progress[id]) s.progress[id] = newProgress();
  const p = s.progress[id];
  // Was die Trainings schon hergeben, ist die Einstufung.
  let events = [];
  if (ch.kind !== 'steps') {
    if (autoBest(ch) || p.attempts.length) events = sync(s, id);
    else if (ch.kind === 'lift') p.placed = true; // noch keine Daten: der erste schwere Satz zählt voll
  }
  save(s);
  ctx.closeSheet();
  ctx.render();
  Sound.start();
  if (events.length) celebrate(events, before, () => ctx.render());
  else if (ch.kind !== 'lift') setTimeout(() => startAttempt(id), 350);
  else ctx.toast(`${ch.short}: wird ab jetzt aus deinen Trainings übernommen`);
}

// ---------- Versuch ----------
let attemptEl = null;

function startAttempt(id, { manualLift = false } = {}) {
  const s = load();
  const ch = find(id, s);
  const p = s.progress[id];
  if (!ch || !p || attemptEl) return;
  const st = attemptState(ch, p);
  if (!manualLift && st.mode !== 'placement' && st.mode !== 'ready') return;
  const placement = !p.placed;
  const next = nextTierIndex(p);
  const target = next !== null ? targets(ch)[next] : null;
  const best = p.best ?? bestOf(ch, p);

  const el = document.createElement('div');
  el.className = 'att';
  attemptEl = el;
  el.innerHTML = `
    <header class="mob-top">
      <button class="icon-btn" data-att="close" aria-label="Abbrechen">${Icon.close}</button>
      <div class="mob-title"><strong>${ch.icon} ${escapeHtml(ch.name)}</strong><span class="muted small">${placement ? 'Einstufung' : 'Gewerteter Versuch'}</span></div>
      <span></span>
    </header>
    <div class="att-body"></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  qs('[data-att="close"]', el).addEventListener('click', () => closeAttempt());

  const body = qs('.att-body', el);
  const intro = `
    <div class="att-goal">
      ${placement ? '<span class="att-tag">Einstufung</span><p>Gib alles – dieser Versuch zeigt, wo du stehst. Was du schon kannst, wird angerechnet, die Jagd beginnt danach.</p>'
        : `<span class="att-tag t${next}">${TIERS[next].name}</span>
           <div class="att-target">${escapeHtml(targetLabel(ch, next))}</div>
           <p class="muted">${best !== null && ch.kind !== 'steps' ? `Dein Bestwert: ${formatValue(ch, best)}` : ''}</p>`}
    </div>
    <ul class="ch-rules att-rules">${ch.standard.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`;

  const finish = (value) => submitAttempt(id, value, { manual: true });

  if (manualLift) {
    body.innerHTML = `${intro}${enterHtml(ch, 'Gewicht (1 saubere Wiederholung)')}`;
    bindEnter(body, ch, finish);
  } else if (ch.kind === 'steps') {
    stepsFlow(body, ch, p, intro, finish);
  } else if (ch.kind === 'hold') {
    body.innerHTML = `${intro}<button class="btn btn-primary full att-start" data-att="go">${Icon.play} Stoppuhr starten</button>
      <button class="btn btn-ghost full" data-att="enter">Zeit lieber eintragen</button>`;
    qs('[data-att="go"]', body).addEventListener('click', () => runTimer(body, ch, target, best, finish));
    qs('[data-att="enter"]', body).addEventListener('click', () => { body.innerHTML = `${intro}${enterHtml(ch, 'Gehaltene Zeit (m:ss)')}`; bindEnter(body, ch, finish); });
  } else if (ch.kind === 'reps' && ch.tap) {
    body.innerHTML = `${intro}<button class="btn btn-primary full att-start" data-att="go">${Icon.play} Mit Zähler starten</button>
      <p class="muted small att-hint">Handy flach unter die Brust legen und bei jeder Wiederholung mit Nase oder Kinn antippen.</p>
      <button class="btn btn-ghost full" data-att="enter">Ergebnis lieber eintragen</button>`;
    qs('[data-att="go"]', body).addEventListener('click', () => runCounter(body, ch, target, best, finish));
    qs('[data-att="enter"]', body).addEventListener('click', () => { body.innerHTML = `${intro}${enterHtml(ch, 'Wiederholungen am Stück')}`; bindEnter(body, ch, finish); });
  } else {
    const label = ch.kind === 'time' ? 'Deine Zeit (m:ss)' : ch.kind === 'lift' ? 'Gewicht' : `Wiederholungen${ch.unitLabel ? ` ${ch.unitLabel}` : ''} am Stück`;
    body.innerHTML = `${intro}${enterHtml(ch, label)}`;
    bindEnter(body, ch, finish);
  }
}

function closeAttempt() {
  const el = attemptEl;
  if (!el) return;
  attemptEl = null;
  cancelAnimationFrame(el._raf);
  el.classList.remove('open');
  el.classList.add('closing');
  setTimeout(() => el.remove(), 320);
}

function enterHtml(ch, label) {
  const time = ch.kind === 'time' || ch.kind === 'hold';
  return `
    <div class="att-enter">
      <label class="field-label">${label}</label>
      <input type="text" class="text-input att-input" inputmode="${time ? 'text' : 'decimal'}" placeholder="${time ? '3:45' : '0'}" autocomplete="off" />
      <button class="btn btn-primary full" data-att="save" disabled>Werten</button>
      <p class="muted small">Ehrlich eintragen – die App glaubt dir, und genau deshalb ist es etwas wert.</p>
    </div>`;
}

function parseEntry(ch, text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (ch.kind === 'time' || ch.kind === 'hold') {
    const m = t.match(/^(\d+)(?:[:.,](\d{1,2}))?$/);
    if (!m) return null;
    const sec = m[2] !== undefined ? +m[1] * 60 + +m[2] : (ch.kind === 'hold' && +m[1] < 1000 ? +m[1] : +m[1] * 60);
    return sec > 0 ? sec : null;
  }
  const n = parseFloat(t.replace(',', '.'));
  if (!(n > 0)) return null;
  return ch.kind === 'lift' ? Math.round(n * 100) / 100 : Math.floor(n);
}

function bindEnter(body, ch, finish) {
  const input = qs('.att-input', body);
  const btn = qs('[data-att="save"]', body);
  input.addEventListener('input', () => { btn.disabled = parseEntry(ch, input.value) === null; });
  btn.addEventListener('click', () => { const v = parseEntry(ch, input.value); if (v !== null) finish(v); });
  setTimeout(() => input.focus(), 300);
}

// Countdown 3-2-1, dann läuft die Zeit – der Ring füllt sich bis zum Ziel.
function countdown(body, then) {
  body.innerHTML = '<div class="att-countdown"><span></span></div>';
  const span = qs('span', body);
  let n = 3;
  const tick = () => {
    if (!attemptEl) return;
    if (n === 0) { Sound.beep(true); then(); return; }
    span.textContent = n;
    span.classList.remove('pop');
    void span.offsetWidth;
    span.classList.add('pop');
    Sound.beep(false);
    n -= 1;
    setTimeout(tick, 900);
  };
  tick();
}

const RING = 2 * Math.PI * 88;
function ringHtml(center, sub) {
  return `
    <div class="att-ring">
      <svg viewBox="0 0 200 200"><circle class="att-ring-bg" cx="100" cy="100" r="88"/>
        <circle class="att-ring-fg" cx="100" cy="100" r="88" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg>
      <span class="att-ring-value">${center}</span>
      <span class="att-ring-sub">${sub}</span>
    </div>
    <div class="att-flags"></div>`;
}

function flag(body, text, cls = '') {
  const f = document.createElement('span');
  f.className = `att-flag ${cls}`;
  f.textContent = text;
  qs('.att-flags', body).appendChild(f);
}

function runTimer(body, ch, target, best, finish) {
  countdown(body, () => {
    body.innerHTML = `${ringHtml('0 s', target ? `Ziel ${clock(target)}` : 'läuft')}
      <button class="btn btn-primary full att-stop" data-att="stop">Stopp</button>`;
    const start = performance.now();
    const fg = qs('.att-ring-fg', body);
    const val = qs('.att-ring-value', body);
    let passedBest = false;
    let passedTarget = false;
    let last = -1;
    const frame = () => {
      if (!attemptEl) return;
      const sec = (performance.now() - start) / 1000;
      const whole = Math.floor(sec);
      if (whole !== last) { last = whole; val.textContent = clock(whole); }
      const goal = target || Math.max(60, (best || 0) * 1.2);
      fg.style.strokeDashoffset = String(RING * (1 - Math.min(1, sec / goal)));
      if (best && !passedBest && sec > best) { passedBest = true; flag(body, 'Neuer Bestwert!'); Sound.rep(); }
      if (target && !passedTarget && sec >= target) { passedTarget = true; body.classList.add('hit'); flag(body, 'Ziel geknackt!', 'gold'); Sound.unlock(); }
      attemptEl._raf = requestAnimationFrame(frame);
    };
    attemptEl._raf = requestAnimationFrame(frame);
    qs('[data-att="stop"]', body).addEventListener('click', () => {
      cancelAnimationFrame(attemptEl._raf);
      finish(Math.floor((performance.now() - start) / 1000));
    });
  });
}

function runCounter(body, ch, target, best, finish) {
  countdown(body, () => {
    body.innerHTML = `
      <div class="att-tapzone" data-att="tap">
        ${ringHtml('0', target ? `Ziel ${target}` : 'Wdh')}
        <span class="att-tap-hint">Tippen = eine Wiederholung</span>
      </div>
      <div class="att-tap-actions">
        <button class="btn btn-secondary" data-att="undo">−1</button>
        <button class="btn btn-primary" data-att="done">Fertig</button>
      </div>`;
    let count = 0;
    const fg = qs('.att-ring-fg', body);
    const val = qs('.att-ring-value', body);
    const update = () => {
      val.textContent = count;
      val.classList.remove('bump');
      void val.offsetWidth;
      val.classList.add('bump');
      const goal = target || Math.max(10, (best || 0) + 5);
      fg.style.strokeDashoffset = String(RING * (1 - Math.min(1, count / goal)));
    };
    let passedBest = false;
    let passedTarget = false;
    qs('[data-att="tap"]', body).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      count += 1;
      Sound.rep();
      update();
      if (best && !passedBest && count > best) { passedBest = true; flag(body, 'Neuer Bestwert!'); }
      if (target && !passedTarget && count >= target) { passedTarget = true; body.classList.add('hit'); flag(body, 'Ziel geknackt!', 'gold'); Sound.unlock(); }
    });
    qs('[data-att="undo"]', body).addEventListener('click', () => { count = Math.max(0, count - 1); update(); });
    qs('[data-att="done"]', body).addEventListener('click', () => { if (count > 0) finish(count); else closeAttempt(); });
  });
}

// Fertigkeiten: bei der Einstufung wählen, was man schon kann; danach die
// nächste Etappe mit allen Kriterien bestätigen.
function stepsFlow(body, ch, p, intro, finish) {
  if (!p.placed) {
    body.innerHTML = `
      <div class="att-goal"><span class="att-tag">Einstufung</span><p>Was kannst du heute schon – sauber, nach den Kriterien unten?</p></div>
      <div class="mob-options">${['Noch keine Stufe', ...ch.tiers].map((t, i) => `<button class="mob-option ${i === 0 ? 'active' : ''}" data-v="${i}"><span class="mob-option-dot"></span>${escapeHtml(t)}</button>`).join('')}</div>
      <ul class="ch-rules att-rules">${ch.standard.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
      <button class="btn btn-primary full" data-att="save">Einstufung speichern</button>`;
    let v = 0;
    qsa('[data-v]', body).forEach((b) => b.addEventListener('click', () => {
      v = +b.dataset.v;
      qsa('[data-v]', body).forEach((x) => x.classList.toggle('active', x === b));
    }));
    qs('[data-att="save"]', body).addEventListener('click', () => finish(v));
    return;
  }
  const next = nextTierIndex(p);
  body.innerHTML = `${intro}
    <p class="att-check-title">Hake jedes Kriterium ehrlich ab:</p>
    <div class="att-checks">${[`Geschafft: ${ch.tiers[next]}`, ...ch.standard].map((r, i) => `
      <button class="att-check" data-i="${i}"><span class="supp-check">${Icon.check}</span><span>${escapeHtml(r)}</span></button>`).join('')}</div>
    <button class="btn btn-primary full" data-att="save" disabled>Stufe bestätigen</button>`;
  const checks = qsa('.att-check', body);
  checks.forEach((b) => b.addEventListener('click', () => {
    b.classList.toggle('on');
    Sound.setDone();
    qs('[data-att="save"]', body).disabled = !checks.every((x) => x.classList.contains('on'));
  }));
  qs('[data-att="save"]', body).addEventListener('click', () => finish(next + 1));
}

function submitAttempt(id, value) {
  const s = load();
  const ch = find(id, s);
  const p = s.progress[id];
  const before = totalXp(s);
  const previousBest = p.best ?? bestOf(ch, p);
  const at = new Date().toISOString();
  let events;
  if (ch.kind === 'steps') {
    p.attempts.push({ at, value, source: p.placed ? 'manual' : 'placement' });
    events = syncSteps(s, id, value);
  } else {
    p.attempts.push({ at, value, source: p.placed ? 'manual' : 'placement' });
    events = sync(s, id);
  }
  events.push(...evaluateWeekly(s));
  save(s);
  showResult(ch, value, previousBest, events, before);
}

function syncSteps(s, id, value) {
  const ch = find(id, s);
  const p = s.progress[id];
  const placement = !p.placed;
  const unlocked = [];
  for (let i = 0; i < value; i += 1) {
    if (p.tiers[i]) continue;
    p.tiers[i] = { at: new Date().toISOString(), placement };
    const xp = Math.round(TIERS[i].xp * (placement ? PLACEMENT_SHARE : 1));
    addXp(s, { kind: placement ? 'placement' : 'tier', challengeId: id, tier: i, xp });
    unlocked.push({ tier: i, xp });
  }
  p.best = Math.max(p.best || 0, value);
  if (placement) {
    p.placed = true;
    return [{ type: 'placement', ch, value, tiers: unlocked.map((u) => u.tier), xp: unlocked.reduce((n, u) => n + u.xp, 0) }];
  }
  return unlocked.map((u) => ({ type: 'tier', ch, tier: u.tier, xp: u.xp, value }));
}

// Ergebnis eines Versuchs: große Momente bekommen die Feier, sonst eine
// ehrliche Einordnung mit dem Abstand zum nächsten Ziel.
function showResult(ch, value, previousBest, events, before) {
  const body = qs('.att-body', attemptEl);
  const big = events.filter((e) => e.type === 'tier' || e.type === 'placement' || e.type === 'weekly' || e.type === 'sweep');
  const pb = events.find((e) => e.type === 'pb');
  const s = load();
  const p = s.progress[ch.id];
  const prog = progressTowards(ch, p);
  if (big.length) {
    celebrate(events, before, () => { closeAttempt(); ctx.render(); });
    return;
  }
  const improved = previousBest !== null && better(ch, value, previousBest);
  body.innerHTML = `
    <div class="att-result">
      <span class="att-result-label">${pb || improved ? 'Neuer Bestwert' : 'Gewertet'}</span>
      <div class="att-result-value">${formatValue(ch, value)}</div>
      ${pb ? `<span class="att-xp">+${pb.xp} XP</span>` : ''}
      <p class="att-result-text">${escapeHtml(prog.text)}</p>
      ${!improved && previousBest !== null ? `<p class="muted small">Bestwert bleibt ${formatValue(ch, previousBest)}. Morgen gibt es den nächsten Versuch.</p>` : '<p class="muted small">Nächster gewerteter Versuch ab morgen.</p>'}
      <div class="ch-bar big ${nextTierIndex(p) !== null ? `to-t${nextTierIndex(p)}` : ''}"><i style="transform:scaleX(${prog.ratio})"></i></div>
      <p class="ch-tip att-tip">${escapeHtml(ch.tip)}</p>
      <button class="btn btn-primary full" data-att="ok">Fertig</button>
    </div>`;
  if (pb || improved) Sound.record(); else Sound.setDone();
  qs('[data-att="ok"]', body).addEventListener('click', () => { closeAttempt(); ctx.render(); });
}

// ---------- Feier ----------
// Eine Bühne über allem: Strahlen, Medaille, Konfetti, XP zählen hoch. Mehrere
// Ereignisse laufen nacheinander, ein Level-Aufstieg kommt zum Schluss.
export function celebrate(events, xpBefore, done) {
  const screens = [];
  events.forEach((e) => {
    if (e.type === 'tier') screens.push(e);
    else if (e.type === 'placement') screens.push(e);
    else if (e.type === 'weekly' || e.type === 'sweep') screens.push(e);
  });
  const pbs = events.filter((e) => e.type === 'pb');
  if (!screens.length) {
    pbs.forEach((e) => ctx.toast(`⚡ Neuer Bestwert · ${e.ch.short}: ${formatValue(e.ch, e.value)} · +${e.xp} XP`));
    done?.();
    return;
  }
  const xpAfter = totalXp(load());
  const lvBefore = levelInfo(xpBefore);
  const lvAfter = levelInfo(xpAfter);
  if (lvAfter.level > lvBefore.level) screens.push({ type: 'level', level: lvAfter.level, title: lvAfter.title });

  const el = document.createElement('div');
  el.className = 'cel';
  el.innerHTML = '<canvas class="cel-confetti"></canvas><div class="cel-stage"></div>';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  let xpShown = xpBefore;

  const show = (i) => {
    if (i >= screens.length) {
      el.classList.remove('open');
      el.classList.add('closing');
      setTimeout(() => el.remove(), 350);
      done?.();
      return;
    }
    const e = screens[i];
    const stage = qs('.cel-stage', el);
    stage.innerHTML = celebrationHtml(e);
    stage.classList.remove('in');
    void stage.offsetWidth;
    stage.classList.add('in');
    const big = e.type === 'tier' || e.type === 'level' || (e.type === 'placement' && e.tiers.length);
    if (big) { confetti(qs('.cel-confetti', el), e.type === 'tier' ? e.tier : e.type === 'placement' ? Math.max(...e.tiers) : 2); }
    if (e.type === 'level') Sound.levelUp(); else if (big) Sound.unlock(); else Sound.record();
    // XP hochzählen und den Level-Balken mitziehen
    const gain = e.xp || 0;
    const counter = qs('.cel-xp-num', stage);
    const bar = qs('.cel-level-bar i', stage);
    const from = xpShown;
    const startLv = levelInfo(from);
    if (bar) bar.style.transform = `scaleX(${startLv.into / startLv.need})`;
    const label0 = qs('.cel-level-label', stage);
    if (label0) label0.textContent = `Level ${startLv.level} · ${startLv.into} / ${startLv.need} XP`;
    const to = xpShown + gain;
    xpShown = to;
    if (counter && gain) {
      const t0 = performance.now();
      const dur = 900;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const eased = 1 - (1 - k) ** 3;
        counter.textContent = `+${Math.round(gain * eased)}`;
        const lv = levelInfo(Math.round(from + gain * eased));
        if (bar) bar.style.transform = `scaleX(${lv.into / lv.need})`;
        const lvLabel = qs('.cel-level-label', stage);
        if (lvLabel) lvLabel.textContent = `Level ${lv.level} · ${lv.into} / ${lv.need} XP`;
        if (k < 1 && el.isConnected) requestAnimationFrame(step);
      };
      setTimeout(() => requestAnimationFrame(step), 450);
    }
    qs('[data-cel="next"]', stage).addEventListener('click', () => show(i + 1));
  };
  show(0);
}

function celebrationHtml(e) {
  if (e.type === 'level') {
    return `
      <div class="cel-rays lv"></div>
      <div class="cel-level-badge"><small>Level</small>${e.level}</div>
      <div class="cel-kicker">Level-Aufstieg</div>
      <h2 class="cel-title">${e.title}</h2>
      <p class="cel-sub">Jede Stufe bringt dich weiter nach oben.</p>
      <button class="btn btn-primary full cel-btn" data-cel="next">Weiter</button>`;
  }
  let medalHtml;
  let kicker;
  let title;
  let sub;
  if (e.type === 'tier') {
    const p = load().progress[e.ch.id];
    const next = p ? nextTierIndex(p) : null;
    medalHtml = medal(e.tier, { size: 'xl', content: e.ch.icon });
    kicker = `${TIERS[e.tier].name} freigeschaltet`;
    title = escapeHtml(e.ch.name);
    sub = `${escapeHtml(targetLabel(e.ch, e.tier))} geschafft.${next !== null ? ` Nächstes Ziel: <strong>${escapeHtml(targetLabel(e.ch, next))}</strong>` : ' Alle Stufen gemeistert – du bist eine Legende.'}`;
  } else if (e.type === 'placement') {
    const top = e.tiers.length ? Math.max(...e.tiers) : null;
    const p = load().progress[e.ch.id];
    const next = p ? nextTierIndex(p) : null;
    medalHtml = top !== null ? medal(top, { size: 'xl', content: e.ch.icon }) : `<span class="medal empty xl">${e.ch.icon}</span>`;
    kicker = 'Einstufung';
    title = top !== null ? `Du startest bei ${TIERS[top].name}` : 'Startpunkt gesetzt';
    sub = `${e.ch.kind === 'steps' ? '' : `${escapeHtml(formatValue(e.ch, e.value))} · `}${next !== null ? `Dein erstes Ziel: <strong>${TIERS[next].name} – ${escapeHtml(targetLabel(e.ch, next))}</strong>` : 'Schon alles gemeistert.'}`;
  } else if (e.type === 'weekly') {
    medalHtml = `<span class="medal wk xl">${e.icon}</span>`;
    kicker = 'Wochen-Challenge geschafft';
    title = escapeHtml(e.text);
    sub = 'Nächste Woche warten drei neue.';
  } else {
    medalHtml = '<span class="medal wk sweep xl">🔥</span>';
    kicker = 'Woche komplett';
    title = 'Alle drei Wochen-Challenges';
    sub = 'Bonus für die volle Woche.';
  }
  return `
    <div class="cel-rays ${e.type === 'tier' ? `t${e.tier}` : ''}"></div>
    <div class="cel-medal">${medalHtml}</div>
    <div class="cel-kicker">${kicker}</div>
    <h2 class="cel-title">${title}</h2>
    <p class="cel-sub">${sub}</p>
    ${e.xp ? `<div class="cel-xp"><span class="cel-xp-num">+0</span> XP</div>
      <div class="cel-level"><span class="cel-level-label"></span><span class="cel-level-bar"><i></i></span></div>` : ''}
    <button class="btn btn-primary full cel-btn" data-cel="next">Weiter</button>`;
}

const TIER_COLORS = [
  ['#e7a26b', '#a4622c'], ['#eef1f5', '#9aa4b0'], ['#ffe08a', '#d89a1c'], ['#c8f3f7', '#4fa8bb'], ['#f0abfc', '#7c3aed'],
];

function confetti(canvas, tier) {
  if (ctx.prefersReducedMotion()) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff5a36';
  const colors = [...TIER_COLORS[tier], accent, '#ffffff', '#ffd54f'];
  const parts = Array.from({ length: 150 }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x: fromLeft ? -10 : w + 10,
      y: h * (0.55 + Math.random() * 0.25),
      vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7),
      vy: -(9 + Math.random() * 9),
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      s: 5 + Math.random() * 6,
      c: colors[i % colors.length],
    };
  });
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    g.clearRect(0, 0, w, h);
    parts.forEach((p) => {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.globalAlpha = Math.max(0, 1 - t / 3200);
      g.fillStyle = p.c;
      g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      g.restore();
    });
    if (t < 3200 && canvas.isConnected) requestAnimationFrame(frame);
    else g.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(frame);
}
