// Der Coach: plant Runden und sagt Kombinationen an.
//
// - Angesagt wird nur, was man schon kennt (aktueller Gürtel + frühere).
// - Fällige Wiederholungen (Technik-Gedächtnis) kommen häufiger dran.
// - Jede Runde hat ein Thema; die letzten Sekunden sind Vollgas.
// - Kleines Zimmer: Beinarbeit auf der Stelle statt Wege. Leise: keine
//   Sprünge (Switch-Kick) und keine Ansagen für Stampfen.
import { TECH, clipOf, comboSpeech, TECHNIQUES, techniquesOfBelt, combosOfBelt } from './data-tech.js';
import { comboSeconds } from './anim.js';
import { coachPool, comboPool, dueReviews, getProgress } from './progress.js';
import { getProfile, quietNow } from './core.js';

// Seite jeder Technik für die Farben der Anzeige (Führ- vs. Schlagseite)
const SIDE = {
  jab: 'lead', 'hook-lead': 'lead', 'upper-lead': 'lead', 'jab-body': 'lead', 'hook-body': 'lead', teep: 'lead',
  switchkick: 'lead', feint: 'lead', 'step-jab': 'lead', check: 'lead',
  cross: 'rear', 'hook-rear': 'rear', 'upper-rear': 'rear', 'cross-body': 'rear', lowkick: 'rear', bodykick: 'rear',
  highkick: 'rear', knee: 'rear', 'teep-rear': 'rear', backfist: 'rear', parry: 'rear',
};
// Was sich an Pratzen sinnvoll zeigen lässt (Abwehr = der Partner schwingt zurück)
export const PADABLE = new Set(['jab', 'cross', 'hook-lead', 'hook-rear', 'upper-lead', 'upper-rear', 'jab-body', 'cross-body', 'hook-body',
  'bodykick', 'teep', 'knee', 'slip', 'roll', 'block', 'parry', 'pullback', 'step-jab']);
export const sideOf = (id) => SIDE[id] || (TECH[id]?.cat === 'defense' || TECH[id]?.cat === 'footwork' ? 'def' : 'lead');

export const TEMPO_LABEL = ['', 'Ruhig', 'Locker', 'Zügig', 'Schnell', 'Wettkampf'];
const GAP = [0, 3.6, 2.7, 2.0, 1.45, 1.05]; // Sekunden Luft nach einer Kombination

const has = (c, test) => c.seq.some((id) => test(TECH[id]));
export const THEMES = {
  warmup: { label: 'Einstieg', text: 'Locker bewegen – Jab, Beinarbeit, Deckung.', tempo: 0.75, filter: (c) => c.seq.length <= 2 },
  combos: { label: 'Kombinationen', text: 'Sauber und flüssig, nach jeder Kombi zurück in die Deckung.', tempo: 1 },
  counter: { label: 'Konter', text: 'Erst verteidigen, dann sofort zurückschlagen.', tempo: 1, filter: (c) => c.tag === 'counter' || has(c, (t) => t.cat === 'defense') },
  body: { label: 'Körper & Kopf', text: 'Unten öffnen, oben treffen – Ebene aus den Beinen wechseln.', tempo: 1, filter: (c) => has(c, (t) => /body/.test(t.id)) },
  kicks: { label: 'Hände & Beine', text: 'Kombinationen mit Tritten – Hände bleiben oben.', tempo: 0.9, filter: (c) => has(c, (t) => t.cat === 'kick' || t.cat === 'knee') },
  review: { label: 'Wiederholung', text: 'Techniken, die länger nicht dran waren.', tempo: 0.9 },
  pressure: { label: 'Druck', text: 'Hohes Tempo, kurze Pausen – durchziehen.', tempo: 1.45 },
  freestyle: { label: 'Freestyle', text: 'Eigene Kombinationen. Der Coach gibt nur Tempo und Aufgaben vor.', tempo: 1, freestyle: true },
  power: { label: 'Kraft', text: 'Einzelne harte Schläge mit voller Drehung.', tempo: 0.65 },
  speed: { label: 'Speed', text: 'Schnelle Geraden, schnell zurück in die Deckung.', tempo: 1.5, filter: (c) => c.seq.every((id) => ['jab', 'cross'].includes(id)) },
};

const COACH_CUES = [
  'Kinn runter!', 'Hände hoch!', 'Atmen – bei jedem Schlag ausatmen.', 'Kopf bewegen!', 'Zurück in die Deckung!',
  'Locker bleiben, schnell treffen.', 'Füße aktiv!', 'Nach dem Schlag nicht stehen bleiben.',
];
const FREESTYLE_TASKS = [
  'Nur Jab – mit Beinarbeit.', 'Jetzt Körper und Kopf mischen.', 'Kombinationen mit Tritt beenden.', 'Tempo hoch!',
  'Kopfbewegung nach jeder Kombination.', 'Zwei Kombis, dann Winkel wechseln.', 'Ruhiger – auf Technik achten.',
];
const SMALL_ROOM_FOOTWORK = ['Pivot auf der Stelle!', 'Kurzer Schritt vor und zurück!', 'Wippen – Füße aktiv!'];

export function tokensOf(seq) {
  return seq.map((id) => ({ id, code: TECH[id]?.code || '?', label: TECH[id]?.say || '', side: sideOf(id), cat: TECH[id]?.cat }));
}

// Runden-Themen passend zum Können
export function roundThemes(rounds, pool, { mode = 'shadow', due = [] } = {}) {
  const combos = comboPool();
  const avail = (id) => !THEMES[id].filter || combos.some(THEMES[id].filter);
  if (mode === 'bag') {
    const list = ['warmup', 'power', 'combos', 'speed', 'combos', 'pressure'];
    return Array.from({ length: rounds }, (_, i) => (i === rounds - 1 && rounds > 1 ? 'pressure' : list[i % list.length])).map((id) => (avail(id) ? id : 'combos'));
  }
  const middle = ['combos', due.length ? 'review' : 'counter', 'kicks', 'body', 'counter', 'freestyle', 'combos'].filter((id) => avail(id));
  return Array.from({ length: rounds }, (_, i) => {
    if (i === 0) return 'warmup';
    if (i === rounds - 1 && rounds > 2) return 'pressure';
    return middle[(i - 1) % middle.length] || 'combos';
  });
}

export class Coach {
  constructor({ mode = 'shadow', tempo, style, exam = null, onlyTech = null } = {}) {
    const profile = getProfile();
    const progress = getProgress();
    this.mode = mode;
    this.tempo = tempo || profile.coach.tempo || 2;
    this.style = style || profile.voiceStyle || 'mixed';
    this.small = profile.space === 'small';
    this.quiet = quietNow(profile);
    const bag = mode === 'bag';
    this.exam = exam;
    this.onlyTech = onlyTech;
    this.due = new Set(dueReviews(progress).map((t) => t.id));
    let combos = comboPool(progress);
    if (exam) combos = [...combosOfBelt(progress.belt), ...combos.filter((c) => c.belt < progress.belt)];
    if (onlyTech) combos = combos.filter((c) => c.seq.includes(onlyTech));
    if (bag) combos = combos.filter((c) => c.seq.every((id) => ['punch', 'defense'].includes(TECH[id].cat) && id !== 'backfist'));
    if (mode === 'pads') combos = combos.filter((c) => c.seq.every((id) => PADABLE.has(id)));
    if (this.quiet) combos = combos.filter((c) => c.seq.every((id) => TECH[id].quiet !== false));
    if (!combos.length) combos = [{ id: 'c1', seq: ['jab'] }, { id: 'c12', seq: ['jab', 'cross'] }];
    this.combos = combos;
    this.pool = coachPool(progress);
    this.counts = {};
    this.comboIds = [];
    this.calls = 0;
  }

  startRound(theme, seconds) {
    this.theme = THEMES[theme] || THEMES.combos;
    this.themeId = theme;
    this.roundSeconds = seconds;
    this.nextAt = 2.2;
    this.lastCue = 0;
    this.lastCombo = null;
    this.flurry = false;
    this.freestyleAt = 1.5;
    if (this.exam && theme === 'examTech') this.examQueue = shuffle([...this.exam.techniques, ...this.exam.techniques]);
  }

  pick() {
    const theme = this.theme;
    let list = this.combos;
    if (theme.filter) {
      const f = list.filter(theme.filter);
      if (f.length) list = f;
    }
    if (this.themeId === 'review' && this.due.size) {
      const f = list.filter((c) => c.seq.some((id) => this.due.has(id)));
      if (f.length) list = f;
    }
    // Gewichtung: fällige Techniken ×3, längere Kombis bei höherem Tempo
    const weights = list.map((c) => {
      let w = 1;
      if (c.seq.some((id) => this.due.has(id))) w *= 3;
      if (this.tempo >= 4 && c.seq.length >= 3) w *= 1.4;
      if (this.lastCombo && c.id === this.lastCombo.id) w *= 0.15;
      return w;
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i += 1) { r -= weights[i]; if (r <= 0) return list[i]; }
    return list[0];
  }

  // Nächste Ansage für den Zeitpunkt t (Sekunden seit Rundenbeginn), oder null.
  next(t) {
    const left = this.roundSeconds - t;
    if (this.mode !== 'lesson' && !this.flurry && left <= 15 && this.roundSeconds >= 60) {
      this.flurry = true;
      this.nextAt = Infinity;
      return { kind: 'flurry', text: 'Letzte Sekunden – Vollgas!', speech: 'Letzte Sekunden. Vollgas!', tokens: tokensOf(['jab', 'cross', 'jab', 'cross']) };
    }
    if (t < this.nextAt) return null;

    // Prüfung, Runde 1: jede Technik einzeln
    if (this.examQueue) {
      const id = this.examQueue.shift();
      if (!id) { this.examQueue = null; this.nextAt = t + 1; return null; }
      this.count([id]);
      this.nextAt = t + comboSeconds([clipOf(id)]) + GAP[Math.min(5, this.tempo)] * 0.9;
      return { kind: 'combo', seq: [id], tokens: tokensOf([id]), speech: TECH[id].say, text: TECH[id].name };
    }

    if (this.theme.freestyle) {
      const text = FREESTYLE_TASKS[Math.floor(Math.random() * FREESTYLE_TASKS.length)];
      this.nextAt = t + 22 + Math.random() * 10;
      return { kind: 'task', text, speech: text };
    }

    // Ab und zu ein Coaching-Hinweis statt einer Kombination
    if (t - this.lastCue > 38 && Math.random() < 0.3 && this.calls > 2) {
      this.lastCue = t;
      const cues = this.small && this.mode === 'shadow' ? [...COACH_CUES, ...SMALL_ROOM_FOOTWORK] : COACH_CUES;
      const text = cues[Math.floor(Math.random() * cues.length)];
      this.nextAt = t + 2.4;
      return { kind: 'cue', text, speech: text };
    }

    const combo = this.pick();
    this.lastCombo = combo;
    this.count(combo.seq);
    this.comboIds.push(combo.id);
    this.calls += 1;
    const clips = combo.seq.map((id) => clipOf(id));
    const dur = comboSeconds(clips);
    const speedUp = this.theme.tempo || 1;
    const kickExtra = combo.seq.some((id) => TECH[id].cat === 'kick') ? 0.7 : 0;
    const gap = GAP[Math.min(5, Math.max(1, this.tempo))] / speedUp;
    // Ansage braucht selbst Zeit (~0,32 s pro Wort) – vorher nichts Neues
    const speakTime = combo.seq.length * 0.34;
    this.nextAt = t + Math.max(dur + 0.5, speakTime) + kickExtra + gap * (0.8 + Math.random() * 0.45);
    return {
      kind: 'combo',
      combo,
      seq: combo.seq,
      tokens: tokensOf(combo.seq),
      speech: comboSpeech(combo.seq, this.style),
      text: combo.seq.map((id) => TECH[id].name).join(' · '),
    };
  }

  count(seq) {
    seq.forEach((id) => { this.counts[id] = (this.counts[id] || 0) + 1; });
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Sitzungen planen ----------
// Liefert Segmente für den Player: Vorbereitung, Runden, Pausen.
export function shadowPlan({ rounds = 4, roundSec = 180, restSec = 60, tempo, mode = 'shadow', prep = 10 } = {}) {
  const due = dueReviews();
  const themes = roundThemes(rounds, null, { mode, due });
  const segments = [{ kind: 'prep', seconds: prep, label: 'Gleich geht’s los', sub: 'In Stellung gehen, Hände hoch.' }];
  themes.forEach((theme, i) => {
    segments.push({ kind: 'work', seconds: roundSec, round: i + 1, rounds, theme, label: `Runde ${i + 1}`, sub: THEMES[theme].text, coach: true });
    if (i < rounds - 1) segments.push({ kind: 'rest', seconds: restSec, round: i + 1, rounds, label: 'Pause', sub: `Als Nächstes: ${THEMES[themes[i + 1]].label}` });
  });
  return { segments, themes, tempo };
}

export function examPlan(beltIndex) {
  const techniques = techniquesOfBelt(beltIndex).filter((t) => t.cat !== 'stance').map((t) => t.id);
  const segments = [
    { kind: 'prep', seconds: 12, label: 'Gürtelprüfung', sub: 'Drei Runden. Zeig, was du kannst.' },
    { kind: 'work', seconds: 120, round: 1, rounds: 3, theme: 'examTech', label: 'Runde 1 · Techniken', sub: 'Jede Technik einzeln, sauber und schnell.', coach: true },
    { kind: 'rest', seconds: 45, round: 1, rounds: 3, label: 'Pause', sub: 'Als Nächstes: Kombinationen' },
    { kind: 'work', seconds: 120, round: 2, rounds: 3, theme: 'combos', label: 'Runde 2 · Kombinationen', sub: 'Alle Kombinationen deines Gürtels.', coach: true },
    { kind: 'rest', seconds: 45, round: 2, rounds: 3, label: 'Pause', sub: 'Als Nächstes: Kampfrunde' },
    { kind: 'work', seconds: 120, round: 3, rounds: 3, theme: 'pressure', label: 'Runde 3 · Kampfrunde', sub: 'Hohes Tempo bis zum Gong.', coach: true },
  ];
  return { segments, techniques };
}

export { TECHNIQUES };
