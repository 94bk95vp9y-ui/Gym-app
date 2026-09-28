// Bewegungen des Kickboxers – ohne 3D-Abhängigkeit, damit Coach und Listen
// Zeiten berechnen können, ohne three.js zu laden.
//
// Eine Pose beschreibt wie bei Mobility Orte statt Winkel (Becken, Füße,
// Hände, Richtungen von Becken/Brust/Kopf); Knie und Ellbogen löst die IK.
// Koordinaten: Meter, y oben, der Kämpfer schaut nach +z, seine linke Seite
// liegt bei +x. Alles ist für die Linksauslage (Rechtshänder) beschrieben,
// die Rechtsauslage entsteht durch Spiegeln.
//
// Techniken sind kurze Clips aus Schlüsselposen. Für Kombinationen werden
// sie ADDITIV überlagert: jede Technik ist eine Abweichung von der
// Kampfstellung, und während der Jab zurückkommt, startet schon die
// Gerade – genau wie beim echten Schlagen.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rad = (d) => (d * Math.PI) / 180;

// Richtung in der Horizontalen: 0° = nach vorn (+z), positiv = nach links.
export const yaw = (d, y = 0) => [Math.sin(rad(d)), y, Math.cos(rad(d))];

export const POS_KEYS = ['pelvis', 'footL', 'footR', 'kneeL', 'kneeR', 'toeL', 'toeR', 'handL', 'handR', 'elbowL', 'elbowR'];
export const DIR_KEYS = ['pUp', 'pFwd', 'cUp', 'cFwd', 'hUp', 'look'];
export const POSE_KEYS = [...POS_KEYS, ...DIR_KEYS];

// ---------- Kampfstellung (Linksauslage) ----------
// Schulterbreit versetzt, Gewicht mittig, Knie weich, Oberkörper leicht
// eingedreht, Kinn unten, Hände an Wange und Kinn, Ellbogen am Körper.
export const STANCE = {
  pelvis: [-0.02, 0.9, 0.0],
  pUp: [0, 1, 0.03],
  pFwd: yaw(-36),
  cUp: [0, 1, 0.1],
  cFwd: yaw(-28),
  hUp: [0, 1, 0.16],
  look: [0.08, -0.08, 1],
  footL: [0.1, 0.085, 0.24],
  toeL: [0.06, 0.035, 0.4],
  kneeL: [0.2, 0.5, 0.75],
  footR: [-0.17, 0.095, -0.2],
  toeR: [-0.29, 0.04, -0.08],
  kneeR: [-0.28, 0.5, 0.45],
  handL: [0.075, 1.43, 0.27],
  elbowL: [0.3, 0.95, 0.12],
  handR: [-0.1, 1.42, 0.14],
  elbowR: [-0.3, 0.95, -0.02],
};

// Ganze Pose um eine senkrechte Achse drehen (Pivot, Drehschlag).
export function rotatePose(p, degrees, pivot = [0, 0, 0]) {
  if (!degrees) return p;
  const c = Math.cos(rad(degrees));
  const s = Math.sin(rad(degrees));
  const rot = (v) => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  const out = {};
  POS_KEYS.forEach((k) => { if (p[k]) out[k] = add(rot(sub(p[k], pivot)), pivot); });
  DIR_KEYS.forEach((k) => { if (p[k]) out[k] = rot(p[k]); });
  return out;
}

export function shiftPose(p, d, keys = POS_KEYS) {
  const out = { ...p };
  keys.forEach((k) => { if (p[k]) out[k] = add(p[k], d); });
  return out;
}

// Oberkörper samt Deckung verschieben (Ausweichen, Abtauchen) – Füße bleiben.
export const UPPER = ['pelvis', 'handL', 'handR', 'elbowL', 'elbowR'];
export function shiftUpper(p, d) { return shiftPose(p, d, UPPER); }

export function mirrorPose(p) {
  const m = (v) => v && [-v[0], v[1], v[2]];
  const out = {};
  POSE_KEYS.forEach((k) => {
    if (!p[k]) return;
    const swapped = k.endsWith('L') ? `${k.slice(0, -1)}R` : k.endsWith('R') ? `${k.slice(0, -1)}L` : k;
    out[swapped] = m(p[k]);
  });
  return out;
}

export function mixPose(a, b, t) {
  const out = {};
  POSE_KEYS.forEach((k) => {
    if (a[k] && b[k]) out[k] = lerp(a[k], b[k], t);
    else if (a[k] || b[k]) out[k] = a[k] || b[k];
  });
  return out;
}

// ---------- Zeitverläufe ----------
export const EASE = {
  lin: (u) => u,
  inOut: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
  out: (u) => 1 - (1 - u) ** 3,
  snap: (u) => 1 - (1 - u) ** 4,
  in: (u) => u * u * u,
  back: (u) => { const c = 1.4; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; },
};

// Schlüsselposen eines Clips vorbereiten: Posen vollständig machen und die
// globale Drehung/Verschiebung (yaw/shift) pro Schlüssel mitnehmen.
function keysOf(clip) {
  if (!clip._keys) {
    clip._keys = clip.keys.map((k) => ({
      t: k.t,
      p: { ...STANCE, ...(typeof k.p === 'function' ? k.p() : k.p) },
      ease: k.ease || 'inOut',
      yaw: k.yaw || 0,
      shift: k.shift || [0, 0, 0],
      pivot: k.pivot || null,
    }));
  }
  return clip._keys;
}

export function clipDuration(clip) {
  const keys = keysOf(clip);
  return keys[keys.length - 1].t;
}

// Absolute Pose eines Clips zur Zeit t (Sekunden, ohne Schleife).
export function sampleClip(clip, t) {
  const keys = keysOf(clip);
  if (t <= keys[0].t) return place(keys[0], keys[0], 0);
  const last = keys[keys.length - 1];
  if (t >= last.t) return place(last, last, 0);
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const u = Math.max(0, Math.min(1, (t - a.t) / ((b.t - a.t) || 1)));
  return place(a, b, (EASE[b.ease] || EASE.inOut)(u));
}

function place(a, b, u) {
  const pose = mixPose(a.p, b.p, u);
  const yawDeg = a.yaw + (b.yaw - a.yaw) * u;
  const shift = lerp(a.shift, b.shift, u);
  const pivot = b.pivot || a.pivot || [pose.footL[0], 0, pose.footL[2]];
  return shiftPose(rotatePose(pose, yawDeg, pivot), shift);
}

// Abweichung eines Clips von der Kampfstellung zur Zeit t.
function deltaOf(clip, t) {
  const p = sampleClip(clip, t);
  const d = {};
  POSE_KEYS.forEach((k) => { d[k] = sub(p[k], STANCE[k]); });
  return d;
}

// Leichtes Wippen in der Stellung – der Kämpfer steht nie still.
export function idleDelta(t, amount = 1) {
  const w = 2 * Math.PI * 1.55 * t;
  const b = Math.sin(w) * 0.011 * amount;
  const sway = Math.sin(w / 2) * 0.008 * amount;
  const d = {};
  POSE_KEYS.forEach((k) => { d[k] = [0, 0, 0]; });
  d.pelvis = [sway, b, 0];
  d.handL = [sway * 0.8, b * 0.7 + Math.sin(w + 0.9) * 0.006 * amount, Math.sin(w / 2 + 1) * 0.012 * amount];
  d.handR = [sway * 0.8, b * 0.7 + Math.sin(w + 1.6) * 0.005 * amount, 0];
  d.elbowL = [sway, b, 0];
  d.elbowR = [sway, b, 0];
  d.kneeL = [0, b * 2, 0];
  d.kneeR = [0, b * 2, 0];
  d.footR = [0, Math.max(0, Math.sin(w)) * 0.006 * amount, 0];
  return d;
}

// ---------- Zeitleisten (Einzeltechnik oder Kombination) ----------
// items: [{ clip, start }]. Die Pose ist die Kampfstellung plus die Summe
// aller gerade laufenden Techniken plus etwas Wippen.
export function sampleTimeline(timeline, t, { idle = 1, mirror = false } = {}) {
  const sum = {};
  POSE_KEYS.forEach((k) => { sum[k] = [...STANCE[k]]; });
  let active = 0;
  timeline.items.forEach((it) => {
    const local = t - it.start;
    const dur = clipDuration(it.clip);
    if (local < 0 || local > dur) return;
    active = Math.max(active, 1 - Math.abs(local / dur - 0.5) * 2);
    const d = deltaOf(it.clip, local);
    POSE_KEYS.forEach((k) => { sum[k] = add(sum[k], d[k]); });
  });
  if (idle) {
    const d = idleDelta(t, idle * (1 - active * 0.85));
    POSE_KEYS.forEach((k) => { sum[k] = add(sum[k], d[k]); });
  }
  return mirror ? mirrorPose(sum) : sum;
}

// Einzeltechnik als Zeitleiste mit kurzer Ruhe davor und danach – so
// wirkt die Schleife im Viewer nicht gehetzt.
export function singleTimeline(clip, { lead = 0.35, tail = 0.55 } = {}) {
  return {
    items: [{ clip, start: lead }],
    dur: lead + clipDuration(clip) + tail,
    marks: [{ t: lead, clip, index: 0 }],
  };
}

// Kombination: die nächste Technik startet am "next"-Punkt der vorigen
// (wenn deren Rückweg beginnt), bei Tempo < 1 mit etwas Luft dazwischen.
export function comboTimeline(clips, { lead = 0.3, tail = 0.6, gap = 0 } = {}) {
  let t = lead;
  const items = [];
  const marks = [];
  clips.forEach((clip, index) => {
    items.push({ clip, start: t });
    marks.push({ t, clip, index });
    const next = clip.next ?? clipDuration(clip) * 0.72;
    t += next + gap;
  });
  const lastItem = items[items.length - 1];
  const end = lastItem ? lastItem.start + clipDuration(lastItem.clip) : lead;
  return { items, dur: end + tail, marks };
}

// Dauer einer Kombination in Echtzeit (für den Coach).
export function comboSeconds(clips) {
  const tl = comboTimeline(clips, { lead: 0, tail: 0 });
  return tl.dur;
}
