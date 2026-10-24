// Steigerung: für jede Übung ein konkretes Ziel fürs nächste Training.
//
// Grundlage ist die Doppelprogression. Bei gleichem Gewicht steigen erst die
// Wiederholungen, bis jeder Arbeitssatz das obere Ende des Wiederholungs-
// bereichs erreicht. Dann kommt mehr Gewicht, die Wiederholungen fallen etwas,
// und es geht von vorn los. Das deckt sich mit der ACSM-Empfehlung, die Last
// um 2–10 % zu erhöhen, sobald das Ziel um 1–2 Wdh übertroffen wird.
//
// Dazu kommen die Fälle, an denen Training im Alltag hängen bleibt:
// - Großer Gewichtssprung (8 → 10 kg Kurzhantel sind +25 %): erst ein paar
//   Wdh über dem Bereich, sonst bricht die Leistung nach dem Sprung ein.
// - Plateau: drei Einheiten ohne Fortschritt oder zweimal in Folge
//   schwächer – Vorschlag, mit etwa 10 % weniger neu aufzubauen.
// - Pause: Kraft hält sich etwa drei Wochen. Wer länger weg war, steigt
//   leichter ein.
//
// Die Rechnung kommt ohne DOM und (bis auf die Hüllen am Ende) ohne Speicher
// aus, damit sie sich mit erfundenen Verläufen prüfen lässt.
import { Store } from './store.js';

const DAY = 86400000;

export const REP_PRESETS = [[3, 5], [4, 6], [5, 8], [6, 10], [8, 12], [10, 15], [12, 20], [15, 25]];
export const STEP_OPTIONS = { kg: [1, 1.25, 2, 2.5, 4, 5, 7.5, 10], lb: [2.5, 5, 10, 20] };

// Arbeitssätze: alles ab 90 % des schwersten Satzes. Leichtere Sätze davor
// sind Aufwärmen und zählen nicht – sonst wäre nie „alle Sätze geschafft“.
const WORK_SHARE = 0.9;
// Bei Klimmzügen oder Dips mit Gürtel bewegt man Körper plus Zusatz:
// 5 → 7,5 kg sind dann kein Sprung um 50 %, sondern um rund 3 %. Das echte
// Körpergewicht kennt die App nicht; für die Rechnung genügt ein Richtwert.
const BODY_LOAD = { kg: 75, lb: 165 };
const COMEBACK_DAYS = 21;
const LONG_BREAK_DAYS = 60;

const round2 = (n) => Math.round(n * 100) / 100;

// ---------- Übungsart ----------
// Aus dem Namen abgeleitet: Gerät (bestimmt den Gewichtssprung) und ein
// passender Wiederholungsbereich. Zeit- und Ausdauerübungen bekommen keine
// Vorschläge – „1 Wdh mehr“ ergibt bei Planks oder Sprints keinen Sinn.
const NO_PROGRESSION = /unterarmstütz|plank|\bhold\b|farmer|mountain|battle|burpee|box jump|slam|seilspring|get-up|sprint|assist/;

const EQUIPMENT = [
  ['machine', /maschine|hackenschmidt|smith|multipresse|machine/],
  ['cable', /kabel|seilzug|face pull|cable/],
  ['kettlebell', /kettlebell/],
  ['dumbbell', /kurzhantel|\bkh\b|hammercurl|konzentration|arnold|goblet|spider|kickback|schrägbank-curl|pullover|bulgarian|ausfallschritt|lunge|step-up|seitheben|dumbbell/],
  ['bodyweight', /klimmz|pull-up|\bchin|dips|liegestütz|push-up|crunch|sit-up|beinheben|toes to bar|russian|dead bug|käfer|nordic|sissy|hyperextension|rückenstrecker|bauchroller|ab wheel|glute bridge/],
  ['barbell', /langhantel|sz-|kniebeuge|kreuzheben|rack pull|militärpresse|good morning|t-bar|stirndrücken|french press|bankdrücken|hip thrust|landmine|umsetzen|reißen|thruster|box squat|nackenheben|shrugs|aufrechtes rudern|scott|barbell|squat|deadlift|bench/],
  ['machine', /presse|latzug|strecker|beuger|butterfly|adduktor|abduktor|rudern|wadenheben|press/],
];

const LOWER_BODY = /kniebeuge|kreuzheben|rack pull|hip thrust|box squat|good morning|squat|deadlift/;

// Gewichtssprung je Gerät [kg, lb]. Langhantel: kleinste Scheiben 1,25 kg je
// Seite; Beine und Hüfte vertragen größere Sprünge.
const DEFAULT_STEP = {
  barbell: [2.5, 5],
  barbellLower: [5, 10],
  dumbbell: [2.5, 5],
  kettlebell: [4, 10],
  machine: [5, 10],
  cable: [2.5, 5],
  bodyweight: [2.5, 5],
  other: [2.5, 5],
};

const RANGE_RULES = [
  [/nordic/, [3, 8]],
  [/australian/, [8, 15]],
  // \b: sonst passt „chin“ auch auf „Maschine“
  [/klimmz|\bchin|pull-up/, [5, 12]],
  [/liegestütz|push-up/, [10, 25]],
  [/dips/, [6, 12]],
  [/seitheben|face pull|reverse butterfly|vorgebeugt|kickback|adduktor|abduktor|frontheben|swing/, [12, 20]],
  [/curl|strecker|beuger|fliegende|butterfly|trizepsdrücken|stirndrücken|french|überkopf|überzüge|pullover|shrugs|nackenheben|bizeps|trizeps|sissy|hyperextension|glute bridge/, [10, 15]],
];
const BIG_BARBELL = /kniebeuge|kreuzheben|bankdrücken|militärpresse|schulterdrücken|rack pull|umsetzen|reißen|thruster|box squat|squat|deadlift|bench/;

// ---------- Wie das Gewicht eingetragen wird ----------
// total: Gesamtgewicht (Langhantel samt Stange, Maschine laut Steckplatz)
// side:  nur die Scheiben auf einer Seite (Smith-Maschine, Beinpresse …) –
//        die echte Last ist doppelt so hoch plus Stange bzw. Schlitten
// each:  eine Kurzhantel (bei zwei Hanteln das Gewicht einer davon)
// Der Gewichtssprung gilt immer in derselben Einheit wie der Eintrag: bei
// „je Seite“ also pro Seite (+1,25 kg je Seite = +2,5 kg insgesamt).
export const LOAD_MODES = ['total', 'side', 'each'];
// Vorgabe „je Seite“ nur, wo es praktisch jeder so einträgt; alles andere
// stellt man bei der Übung um.
const PER_SIDE = /smith|multipresse|pro seite|je seite/;

export function defaultLoad(exercise, profile = profileOf(exercise)) {
  if (!profile || profile.equipment === 'bodyweight') return 'total';
  const n = String(exercise?.name || '').toLowerCase();
  if (PER_SIDE.test(n)) return 'side';
  if (profile.equipment === 'dumbbell') return 'each';
  return 'total';
}

export function loadOf(exercise, profile = profileOf(exercise)) {
  return LOAD_MODES.includes(exercise?.load) ? exercise.load : defaultLoad(exercise, profile);
}

// Gewichtssprung je Seite [kg, lb]: die kleinsten Scheiben paarweise; Beine
// und Hüfte vertragen das Doppelte
const SIDE_STEP = { upper: [1.25, 2.5], lower: [2.5, 5] };
// Was bei „je Seite“ ohne Scheiben schon bewegt wird, umgerechnet auf eine
// Seite: halbe Langhantel (20 kg), bei Smith-Maschine und Beinpresse ein
// grober Richtwert – die App kennt das Gerät nicht. Nur für Verhältnisse
// (Sprunggröße, 10 % leichter), nicht für angezeigte Werte.
const SIDE_BASE = { barbell: [10, 22.5], other: [5, 10] };

function isLowerBody(exercise, n = String(exercise?.name || '').toLowerCase()) {
  const group = exercise?.muscleGroup || '';
  return LOWER_BODY.test(n) || /presse.*bein|beinpresse|hackenschmidt|lunge|ausfallschritt|split/.test(n) || group === 'Beine' || group === 'Po';
}

export function profileOf(exercise) {
  if (!exercise) return null;
  const n = String(exercise.name || '').toLowerCase();
  const group = exercise.muscleGroup || '';
  if (group === 'Cardio' || NO_PROGRESSION.test(n)) return null;
  const equipment = (EQUIPMENT.find(([, re]) => re.test(n)) || ['other'])[0];
  const lower = equipment === 'barbell' && (LOWER_BODY.test(n) || group === 'Beine' || group === 'Po');
  const step = DEFAULT_STEP[lower ? 'barbellLower' : equipment];
  let range = (RANGE_RULES.find(([re]) => re.test(n)) || [])[1];
  if (!range && ['Bauch', 'Waden', 'Unterarme'].includes(group)) range = [12, 20];
  if (!range && equipment === 'barbell' && BIG_BARBELL.test(n)) range = [6, 10];
  return { equipment, step, range: range || [8, 12] };
}

// ---------- Einheiten auswerten ----------
export function analyze(entry, workout = null) {
  const done = (entry?.sets || []).filter((s) => s && s.done && s.reps > 0);
  if (!done.length) return null;
  const top = Math.max(0, ...done.map((s) => s.weight || 0));
  const loaded = top > 0;
  const work = loaded ? done.filter((s) => (s.weight || 0) >= top * WORK_SHARE - 1e-9) : done;
  const topSets = done.filter((s) => (s.weight || 0) === top);
  const avg = topSets.reduce((n, s) => n + s.reps, 0) / topSets.length;
  return {
    workout,
    entry,
    date: workout?.startedAt || null,
    done,
    top,
    loaded,
    work,
    topSets,
    // Leistung bei diesem Gewicht – unabhängig davon, wie viele Sätze es waren
    score: loaded ? top * (1 + avg / 30) : avg,
  };
}

function isWorkSet(session, set) {
  return session.loaded ? (set.weight || 0) >= session.top * WORK_SHARE - 1e-9 : true;
}

// Die letzten Einheiten einer Übung, neueste zuerst
export function sessionsFor(exerciseId, workouts, { excludeId = null, limit = 10 } = {}) {
  const out = [];
  for (const w of workouts) {
    if (w.id === excludeId) continue;
    const entry = w.entries.find((e) => e.exerciseId === exerciseId && e.sets.some((s) => s.done && s.reps > 0));
    const session = entry ? analyze(entry, w) : null;
    if (session) out.push(session);
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- Wiederholungsbereich und Gewichtssprung ----------
function validRange(r) {
  if (!Array.isArray(r) || r.length !== 2) return null;
  const [lo, hi] = r.map(Number);
  return Number.isInteger(lo) && Number.isInteger(hi) && lo > 0 && hi > lo ? [lo, hi] : null;
}

export function sameRange(a, b) {
  return (!a && !b) || (!!a && !!b && a[0] === b[0] && a[1] === b[1]);
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function quantile(values, q) {
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
}

// Passt der Bereich zu dem, wie tatsächlich trainiert wird? Maßgeblich ist,
// bis wohin die Arbeitssätze üblicherweise gehen (75-%-Wert der letzten zehn
// Einheiten): Wer bei Bankdrücken stets 5 Wdh macht, trainiert 3–5 und nicht
// 6–10. Ein gelernter Bereich (stored) wechselt nur bei sehr deutlicher
// Abweichung – nach einer Steigerung fallen die Wdh ja gewollt ab.
// Körpergewicht ohne Zusatz bleibt beim Bereich der Übungsart: dort heißt das
// obere Ende „Zusatzgewicht“, und das soll nicht schon bei 4 Klimmzügen kommen.
// markOf(range): ab wie vielen Wdh es bei diesem Bereich mehr Gewicht gäbe.
// Liegt die Marke wegen eines großen Sprungs über dem Bereich, sind Wdh bis
// dorthin gewollt – und kein Zeichen für einen höheren Bereich.
export function fitRange(base, sessions, { stored = false, markOf = (r) => r[1] } = {}) {
  if (sessions.length < (stored ? 4 : 2) || !sessions[0].loaded) return base;
  const reps = sessions.slice(0, 10).flatMap((s) => s.work.map((x) => x.reps));
  const usualTop = quantile(reps, 0.75);
  const [lo, hi] = base;
  const mark = Math.max(hi, markOf(base));
  const fits = stored ? usualTop >= lo - 3 && usualTop <= mark + 4 : usualTop >= lo * 0.9 && usualTop <= mark + 2;
  if (fits) return base;
  const usualLow = quantile(reps, 0.25);
  return REP_PRESETS.reduce((best, r) => {
    const d = Math.abs(r[1] - usualTop);
    const db = Math.abs(best[1] - usualTop);
    if (d < db) return r;
    // Gleichstand: lieber der Bereich, der auch die schwächeren Sätze einschließt
    if (d === db && r[0] <= usualLow && best[0] > usualLow) return r;
    return best;
  });
}

// markOf: siehe fitRange
export function rangeOf(exercise, profile, sessions, markOf = undefined) {
  const manual = validRange(exercise.repRange);
  if (manual) return { range: manual, auto: false };
  const stored = validRange(exercise.autoRange);
  return {
    range: stored ? fitRange(stored, sessions, { stored: true, markOf }) : fitRange(profile.range, sessions, { markOf }),
    auto: true,
  };
}

// Mitbewegte Last, die im Eintrag fehlt: Körpergewicht bei Klimmzügen und
// Co., Stange bzw. Schlitten bei „je Seite“
export function baseLoad(exercise, profile, unit = 'kg') {
  const u = unit === 'lb' ? 1 : 0;
  if (profile.equipment === 'bodyweight') return BODY_LOAD[u ? 'lb' : 'kg'];
  if (loadOf(exercise, profile) === 'side') return SIDE_BASE[profile.equipment === 'barbell' ? 'barbell' : 'other'][u];
  return 0;
}

// Bereich und Gewichtssprung zusammen – die Steigerungsmarke hängt vom
// Sprung ab, die Anpassung des Bereichs von der Marke
export function levelsOf(exercise, profile, sessions, unit = 'kg') {
  const { step, auto: stepAuto } = stepOf(exercise, profile, sessions, unit);
  const offset = baseLoad(exercise, profile, unit);
  const last = sessions[0];
  const markOf = (r) => (last?.loaded ? topFor(r, last.top, step, offset) : r[1]);
  const { range, auto: rangeAuto } = rangeOf(exercise, profile, sessions, markOf);
  return {
    range, rangeAuto, step, stepAuto, offset,
  };
}

// Der automatische Bereich, der nach einem Training festgehalten wird (null:
// der Standard der Übungsart passt)
export function learnedRange(exercise, profile, sessions, unit = 'kg') {
  const { range } = levelsOf({ ...exercise, repRange: null }, profile, sessions, unit);
  return sameRange(range, profile.range) ? null : range;
}

// Gewichtssprung: eigener Wert, sonst der kleinste Sprung aus dem Verlauf
// (Kurzhanteln und Maschinen sind je nach Studio anders gestuft), sonst der
// übliche Wert fürs Gerät. Bei der Langhantel gehen kleine Scheiben überall.
export function stepOf(exercise, profile, sessions, unit) {
  const options = STEP_OPTIONS[unit === 'lb' ? 'lb' : 'kg'];
  const own = Number(exercise.increment);
  if (Number.isFinite(own) && own > 0) return { step: own, auto: false };
  const u = unit === 'lb' ? 1 : 0;
  const load = loadOf(exercise, profile);
  // Je Seite: kleine Scheiben gibt es überall – kein Raster aus dem Verlauf
  if (load === 'side') return { step: SIDE_STEP[isLowerBody(exercise) ? 'lower' : 'upper'][u], auto: true };
  const fallback = profile.step[u];
  if (profile.equipment === 'barbell') return { step: fallback, auto: true };
  const tops = [...new Set(sessions.filter((s) => s.loaded).map((s) => s.top))].sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < tops.length; i += 1) min = Math.min(min, round2(tops[i] - tops[i - 1]));
  if (options.includes(min)) return { step: min, auto: true };
  // Nur ein Gewicht bekannt: passt es nicht ins übliche Raster (24 kg bei
  // 2,5er-Schritten), ist das Studio wohl anders gestuft – 24 → 26 statt 26,5
  const last = sessions.find((s) => s.loaded)?.top;
  const onGrid = (w, st) => Math.abs(w / st - Math.round(w / st)) < 1e-6;
  if (last && !onGrid(last, fallback)) {
    const fit = options.filter((o) => o <= fallback && o >= fallback / 2.5 && onGrid(last, o)).pop();
    if (fit) return { step: fit, auto: true };
  }
  return { step: fallback, auto: true };
}

// ---------- Rechenhilfen ----------
// Wiederholungen bei einem anderen Gewicht, gemittelt aus den Formeln von
// Epley und Brzycki und eher vorsichtig gerundet. Über 10 Wdh sind beide
// Formeln ungenau – das Ziel ist deshalb ein „ca.“ und korrigiert sich mit
// dem nächsten Training von selbst.
export function repsAt(weight, reps, target) {
  if (!(weight > 0) || !(target > 0) || !(reps > 0)) return reps || 0;
  const ratio = weight / target;
  const epley = (30 + reps) * ratio - 30;
  const brzycki = 37 - (37 - Math.min(reps, 36)) / ratio;
  return Math.max(1, Math.floor((epley + brzycki) / 2 + 0.2));
}

// Ab wie vielen Wdh je Satz es mehr Gewicht gibt. Normal am oberen Ende des
// Bereichs; ist der Sprung groß, so weit darüber, dass nach dem Sprung noch
// knapp das untere Ende drin ist (höchstens 3 Wdh mehr).
// offset: mitbewegtes Körpergewicht (siehe BODY_LOAD)
export function topFor(range, weight, step, offset = 0) {
  const [lo, hi] = range;
  if (!(weight > 0) || !(step > 0)) return hi;
  for (let r = hi; r < hi + 3; r += 1) {
    if (repsAt(weight + offset, r, weight + step + offset) >= lo - 1) return r;
  }
  return hi + 3;
}

function roundStep(value, step) {
  return round2(Math.round(value / step) * step);
}

// Etwa factor × Gewicht, auf den Gewichtssprung gerundet und mindestens eine
// Stufe leichter. Wird der Abschlag dadurch deutlich größer als gewollt
// (leichte Kurzhanteln: eine Stufe sind schnell 25 %), gibt es kein
// leichteres Gewicht – dann lieber weniger Wdh.
// offset: mitbewegte Last (Stange, Körper) – 10 % weniger beziehen sich auf
// die ganze Last, nicht nur auf die eingetragenen Scheiben
export function lighter(weight, factor, step, offset = 0) {
  let w = roundStep((weight + offset) * factor - offset, step);
  if (w >= weight) w = round2(weight - step);
  const maxCut = Math.max(0.2, 1 - factor + 0.1);
  if (w <= 0 || (weight - w) / (weight + offset) > maxCut) return null;
  return w;
}

// Stillstand, robust gegen Tagesform: bei gleichem Gewicht sind die letzten
// drei Einheiten im Schnitt und in der Spitze nicht besser als die drei davor.
// Oder die Leistung sinkt dreimal in Folge, zusammen um mindestens 5 %.
// Wer kurz vor der nächsten Stufe steht (im Schnitt höchstens 1 Wdh pro Satz
// fehlt), steckt nicht fest – da kommt der Hinweis nicht.
export function plateauOf(sessions, top = Infinity) {
  const s0 = sessions[0];
  if (!s0?.loaded) return null;
  const missing = s0.work.reduce((n, s) => n + Math.max(0, top - s.reps), 0);
  if (missing <= s0.work.length) return null;
  const run = [];
  for (const s of sessions) {
    if (!s.loaded || s.top !== s0.top) break;
    run.push(s);
  }
  const within = (b, days) => !s0.date || !b.date || new Date(s0.date) - new Date(b.date) <= days * DAY;
  if (run.length >= 4 && run[0].score < run[1].score && run[1].score < run[2].score && run[2].score < run[3].score
    && run[0].score <= run[3].score * 0.95 && within(run[3], 60)) {
    return { falling: true };
  }
  if (run.length >= 6 && within(run[5], 100)) {
    const recent = run.slice(0, 3).map((s) => s.score);
    const before = run.slice(3, 6).map((s) => s.score);
    const avg = (a) => a.reduce((n, x) => n + x, 0) / a.length;
    if (avg(recent) <= avg(before) && Math.max(...recent) <= Math.max(...before)) return { falling: false };
  }
  return null;
}

// ---------- Das Ziel ----------
// kind:
//   first     – noch nie trainiert: nur der Wiederholungsbereich
//   build     – gleiches Gewicht, 1 Wdh mehr
//   increase  – alle Sätze oben angekommen: mehr Gewicht
//   addLoad   – Körpergewicht oben angekommen: Zusatzgewicht
//   plateau   – Stillstand, Neuaufbau wird angeboten
//   comeback  – nach längerer Pause leichter einsteigen
// Dazu durch eigene Wahl im Training: reset (neu aufbauen), hold (halten).
export function suggest(exercise, sessions, { unit = 'kg', now = Date.now() } = {}) {
  const profile = profileOf(exercise);
  if (!profile) return null;
  const {
    range, rangeAuto, step, stepAuto, offset,
  } = levelsOf(exercise, profile, sessions, unit);
  const base = {
    range, rangeAuto, step, stepAuto, offset, equipment: profile.equipment, load: loadOf(exercise, profile),
  };
  const last = sessions[0];
  if (!last) return { ...base, kind: 'first', weight: 0, from: 0, loaded: profile.equipment !== 'bodyweight', top: range[1] };

  const days = last.date ? Math.max(0, Math.floor((now - new Date(last.date).getTime()) / DAY)) : 0;
  const t = { ...base, from: last.top, weight: last.top, loaded: last.loaded, days };

  if (days >= COMEBACK_DAYS) {
    const factor = days >= LONG_BREAK_DAYS ? 0.8 : 0.9;
    const weight = last.loaded ? lighter(last.top, factor, step, sideBase(base)) : null;
    return {
      ...t, kind: 'comeback', factor, lighter: weight !== null, weight: weight ?? last.top, top: topFor(range, weight ?? last.top, step, offset),
    };
  }

  // „Alle Sätze geschafft“ zählt nur bei vollständiger Einheit: wer sonst drei
  // Sätze macht und aus Zeitnot nur einen schafft, ist noch nicht weiter.
  const usual = Math.floor(median(sessions.slice(0, 5).map((x) => x.work.length)));
  const complete = last.work.length >= usual;

  // Tempo: wer zuletzt 2+ Wdh zugelegt hat (also mehr als vorgeschlagen),
  // bekommt 2 Wdh als Ziel, sonst 1
  const prev = sessions[1];
  const gain = prev && prev.loaded === last.loaded && prev.top === last.top ? progressDelta(last, prev) : null;
  const pace = gain?.kind === 'reps' && gain.delta >= 2 ? 2 : 1;

  if (!last.loaded) {
    const done = complete && last.work.every((s) => s.reps >= range[1]);
    return { ...t, kind: done ? 'addLoad' : 'build', top: range[1], pace, focus: focusOf(sessions, range[1]) };
  }

  const top = topFor(range, last.top, step, offset);
  if (complete && last.work.every((s) => s.reps >= top)) {
    const weight = round2(last.top + step);
    return { ...t, kind: 'increase', weight, reached: top, top: topFor(range, weight, step, offset) };
  }

  const stall = plateauOf(sessions, top);
  const focus = focusOf(sessions, top);
  if (stall) return { ...t, kind: 'plateau', top, focus, falling: stall.falling, reset: lighter(last.top, 0.9, step, sideBase(base)) };

  return { ...t, kind: 'build', top, pace, focus };
}

// Für „leichter“ zählt nur die Stange bei „je Seite“ – das Körpergewicht
// bleibt außen vor, sonst gäbe es bei Klimmzügen mit Gürtel kaum Abschlag
function sideBase(t) {
  return t.load === 'side' ? t.offset || 0 : 0;
}

// In welchem Arbeitssatz das „+1“ steht: im ersten, der noch nicht oben ist –
// außer im Satz, der letztes Mal das Ziel war, ging es nicht voran. Dann ist
// der nächste offene Satz dran, statt immer am selben zu hängen.
function focusOf(sessions, top, depth = 0) {
  const [last, prev] = sessions;
  const open = last.work.map((x, i) => (x.reps < top ? i : -1)).filter((i) => i >= 0);
  if (!open.length) return 0;
  const comparable = prev && prev.loaded === last.loaded && prev.top === last.top && prev.work.length === last.work.length;
  if (comparable && depth < 3) {
    const tried = focusOf(sessions.slice(1), top, depth + 1);
    if (last.work[tried].reps <= prev.work[tried].reps) {
      const next = open.find((i) => i > tried) ?? open.find((i) => i !== tried);
      if (next !== undefined) return next;
    }
  }
  return open[0];
}

// Eigene Wahl im Training: neu aufbauen statt Plateau, beim alten Gewicht
// bleiben statt steigern, nach der Pause normal weitermachen.
export const CHOICES = { reset: 'plateau', stay: 'increase', normal: 'comeback' };

export function withChoice(target, choice) {
  if (!target || !choice || CHOICES[choice] !== target.kind) return target;
  const off = target.offset || 0;
  if (choice === 'reset') {
    if (!target.reset) return target;
    return { ...target, kind: 'reset', weight: target.reset, top: topFor(target.range, target.reset, target.step, off) };
  }
  return { ...target, kind: 'hold', weight: target.from, top: topFor(target.range, target.from, target.step, off) };
}

// Vorschlagswerte für die Sätze: die Sätze vom letzten Mal, angepasst ans
// Ziel. Aufwärmsätze bleiben, wie sie waren.
// slots: nur diese Plätze berechnen (nach dem Löschen eines Satzes) – das
// „+1“ landet dann auf einem Satz, den es noch gibt.
export function targetSets(target, last, count, slots = null) {
  const src = last ? last.done : [];
  const total = Math.max(1, count ?? Math.min(8, src.length || 3));
  const plan = slots || Array.from({ length: total }, (_, i) => i);
  const sets = plan.map((i) => {
    const at = Math.min(i, src.length - 1);
    const s = src[at];
    if (!s) return { weight: 0, reps: 0, done: false, suggested: false };
    // slot: Platz beim Vorbefüllen – so lassen sich Vorschläge auch nach dem
    // Löschen eines Satzes richtig nachziehen
    return { weight: s.weight || 0, reps: s.reps, done: false, suggested: true, slot: i, at, work: isWorkSet(last, s) };
  });
  const work = sets.filter((s) => s.work);
  const atOf = new Map(sets.map((s) => [s, s.at]));
  sets.forEach((s) => { delete s.work; delete s.at; });
  if (!target || !work.length) return sets;

  const b = sideBase(target);
  const scaled = (w) => (w === target.from ? target.weight : roundStep((w + b) * ((target.weight + b) / (target.from + b)) - b, target.step));
  const off = target.offset || 0;
  const repsFor = (s, w2) => Math.min(target.range[1], repsAt(s.weight + off, s.reps, w2 + off));
  switch (target.kind) {
    case 'increase':
      // Mehr Gewicht; Wdh so viele, wie bei gleicher Leistung zu erwarten sind
      work.forEach((s) => {
        const w2 = round2(s.weight + target.step);
        s.reps = repsFor(s, w2);
        s.weight = w2;
      });
      break;
    case 'reset':
      work.forEach((s) => {
        const w2 = scaled(s.weight);
        s.reps = repsFor(s, w2);
        s.weight = w2;
      });
      lightenWarmups(sets, work, target);
      break;
    case 'comeback':
      work.forEach((s) => {
        if (target.lighter && s.weight > 0) s.weight = scaled(s.weight);
        else s.reps = Math.max(1, Math.floor(s.reps * 0.85));
      });
      if (target.lighter) lightenWarmups(sets, work, target);
      break;
    case 'build':
    case 'plateau': {
      // Eine (bzw. zwei) Wdh mehr – ab dem Fokus-Satz in den Sätzen, die
      // noch nicht oben sind
      const focusAt = src.indexOf(last.work[Math.min(target.focus || 0, last.work.length - 1)]);
      const start = Math.max(0, work.findIndex((s) => atOf.get(s) >= focusAt));
      let left = target.pace || 1;
      [...work.slice(start), ...work.slice(0, start)].forEach((s) => {
        if (left > 0 && s.reps < target.top) {
          s.reps += 1;
          left -= 1;
        }
      });
      break;
    }
    default:
      break;
  }
  return sets;
}

// Aufwärmsätze nicht schwerer als die neuen Arbeitssätze: im gleichen
// Verhältnis leichter (85 / 100 / 100 → 70 / 80 / 80 statt 85 / 80 / 80)
function lightenWarmups(sets, work, target) {
  sets.forEach((s) => {
    if (work.includes(s) || !(s.weight > 0) || s.weight < target.weight) return;
    const b = sideBase(target);
    s.weight = Math.max(target.step, roundStep((s.weight + b) * ((target.weight + b) / (target.from + b)) - b, target.step));
  });
}

// ---------- Fortschritt bis zum nächsten Gewicht ----------
// Jeder Arbeitssatz ist eine Leiter vom unteren Ende des Bereichs bis zur
// Steigerungsmarke. need: wie viele Wdh insgesamt noch fehlen.
export function ladder(target, sets) {
  const floor = target.range[0] - 1;
  const span = Math.max(1, target.top - floor);
  const ref = target.weight || 0;
  const work = sets.filter((s) => s && (ref > 0 ? (s.weight || 0) >= ref * WORK_SHARE - 1e-9 : true));
  return {
    segs: work.map((s) => ({ fill: Math.max(0, Math.min(1, (s.reps - floor) / span)), done: !!s.done, reps: s.reps })),
    need: work.reduce((n, s) => n + Math.max(0, target.top - s.reps), 0),
    progress: work.length ? work.reduce((n, s) => n + Math.max(0, Math.min(1, (s.reps - floor) / span)), 0) / work.length : 0,
  };
}

// Fortschritt gegenüber der Einheit davor: zuerst das Gewicht, bei gleichem
// Gewicht die Wdh Satz für Satz (bei gleicher Satzzahl verglichen).
export function progressDelta(today, last) {
  if (!today) return null;
  if (!last) return { kind: 'new', delta: 0 };
  if (today.top !== last.top) return { kind: 'weight', delta: round2(today.top - last.top) };
  const k = Math.min(today.topSets.length, last.topSets.length);
  let delta = 0;
  for (let i = 0; i < k; i += 1) delta += today.topSets[i].reps - last.topSets[i].reps;
  return delta ? { kind: 'reps', delta } : { kind: 'same', delta: 0 };
}

// ---------- Hüllen mit Speicher ----------
export function progressionEnabled() {
  return Store.getSettings().progressiveOverload !== false;
}

// before: nur Einheiten vor diesem Zeitpunkt (für den Rückblick auf ein
// gespeichertes Training)
export function historyFor(exerciseId, { excludeId = null, before = null } = {}) {
  const all = Store.getWorkouts();
  return sessionsFor(exerciseId, before ? all.filter((w) => w.startedAt < before) : all, { excludeId });
}

export function progressionOf(exercise, { excludeId = null, before = null, now = Date.now() } = {}) {
  const sessions = exercise ? historyFor(exercise.id, { excludeId, before }) : [];
  const target = exercise && progressionEnabled()
    ? suggest(exercise, sessions, { unit: Store.getSettings().unit, now })
    : null;
  return { target, sessions, last: sessions[0] || null };
}

// Wie lief diese Übung heute – und was ist als Nächstes dran?
export function outcomeOf(exercise, entry, workout, sessions) {
  const today = analyze(entry, workout);
  if (!today || !exercise || !progressionEnabled()) return null;
  const now = workout?.startedAt ? new Date(workout.startedAt).getTime() : Date.now();
  const next = suggest(exercise, [{ ...today, date: workout?.startedAt || null }, ...sessions], { unit: Store.getSettings().unit, now });
  if (!next) return null;
  return { today, next, delta: progressDelta(today, sessions[0] || null) };
}

// Nach dem Training: den automatischen Wiederholungsbereich festhalten, damit
// er nicht bei jedem Training neu geschätzt wird und hin und her springt.
export function learnRanges(workout) {
  const seen = new Set();
  workout.entries.forEach((e) => {
    if (seen.has(e.exerciseId)) return;
    seen.add(e.exerciseId);
    const ex = Store.getExercise(e.exerciseId);
    const profile = profileOf(ex);
    if (!profile || validRange(ex.repRange)) return;
    const next = learnedRange(ex, profile, sessionsFor(ex.id, Store.getWorkouts()), Store.getSettings().unit);
    if (!sameRange(next, validRange(ex.autoRange))) Store.updateExercise(ex.id, { autoRange: next });
  });
}
