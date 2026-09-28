// Ausdauer-Rechnungen (rein, ohne Oberfläche).
//
// Leistungsniveau nach Jack Daniels (VDOT): aus einer Bestzeit wird die
// Sauerstoffaufnahme bei diesem Tempo und der Anteil an der maximalen
// Aufnahme berechnet, den man so lange halten kann. Daraus folgen die
// persönlichen Trainingstempos (locker, Schwelle, Intervall, Sprint) und
// Zeitvorhersagen. Pulszonen nach Tanaka (HFmax ≈ 208 − 0,7 × Alter), mit
// Ruhepuls nach Karvonen.

// Sauerstoffkosten bei v Metern pro Minute
export const vo2AtSpeed = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v;
// haltbarer Anteil der VO2max über t Minuten
export const fractionFor = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);

export function vdotFromRace(meters, seconds) {
  if (!(meters > 0) || !(seconds > 0)) return null;
  const t = seconds / 60;
  const v = meters / t;
  const vdot = vo2AtSpeed(v) / fractionFor(t);
  return Number.isFinite(vdot) && vdot > 15 && vdot < 90 ? vdot : null;
}

// Geschwindigkeit (m/min), bei der die Sauerstoffaufnahme vo2 beträgt
function speedForVO2(vo2) {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}
export const paceFor = (vdot, share) => 60000 / speedForVO2(vdot * share); // Sekunden pro km

export function trainingPaces(vdot) {
  if (!vdot) return null;
  return {
    easy: [paceFor(vdot, 0.62), paceFor(vdot, 0.74)], // langsam … zügig-locker
    marathon: paceFor(vdot, 0.8),
    threshold: paceFor(vdot, 0.88),
    interval: paceFor(vdot, 0.975),
    rep: paceFor(vdot, 1.06),
  };
}

// Zeitvorhersage für eine Strecke bei gegebenem VDOT (Bisektion)
export function predictSeconds(vdot, meters) {
  if (!vdot) return null;
  let lo = meters / 7; // unrealistisch schnell
  let hi = meters / 1.2; // gehen
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const v = vdotFromRace(meters, mid) ?? 0;
    if (v > vdot) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

// Cooper-Test: 12 Minuten, gelaufene Meter → VO2max
export const vo2FromCooper = (meters) => (meters - 504.9) / 44.73;

export function hrMaxOf(profile) {
  if (profile.hrMax) return profile.hrMax;
  const age = profile.age || 25;
  return Math.round(208 - 0.7 * age);
}

// Fünf Zonen; mit Ruhepuls nach Karvonen (Herzfrequenzreserve)
export const ZONES = [
  { id: 1, name: 'Z1 · Erholung', from: 0.5, to: 0.6, color: '#7c8ba1', text: 'Sehr locker, Aufwärmen und Auslaufen.' },
  { id: 2, name: 'Z2 · Grundlage', from: 0.6, to: 0.7, color: '#22d3c5', text: 'Du kannst ganze Sätze sprechen. Hier entsteht die Ausdauer.' },
  { id: 3, name: 'Z3 · Zügig', from: 0.7, to: 0.8, color: '#30d158', text: 'Sprechen geht nur noch in kurzen Sätzen.' },
  { id: 4, name: 'Z4 · Schwelle', from: 0.8, to: 0.9, color: '#ffb020', text: 'Hart, aber kontrolliert – Tempo- und Kampfintervalle.' },
  { id: 5, name: 'Z5 · Maximal', from: 0.9, to: 1.0, color: '#ff2e3e', text: 'Nur kurz haltbar – Intervalle und Sprints.' },
];

export function hrZones(profile) {
  const max = hrMaxOf(profile);
  const rest = profile.hrRest;
  return ZONES.map((z) => {
    const f = (share) => Math.round(rest ? rest + (max - rest) * share : max * share);
    return { ...z, lo: f(z.from), hi: f(z.to) };
  });
}

// Entfernung zweier GPS-Punkte in Metern (Haversine)
export function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Strecke vereinfachen (Douglas-Peucker in lokalen Metern) – für Speicher und Karte
export function simplifyTrack(points, tolerance = 4) {
  if (points.length <= 2) return points;
  const lat0 = points[0][0];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const xy = points.map((p) => [p[1] * kx, p[0] * ky]);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0;
    let idx = -1;
    const [x1, y1] = xy[s];
    const [x2, y2] = xy[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-9;
    for (let i = s + 1; i < e; i += 1) {
      const t = Math.max(0, Math.min(1, ((xy[i][0] - x1) * dx + (xy[i][1] - y1) * dy) / len2));
      const d = Math.hypot(xy[i][0] - (x1 + t * dx), xy[i][1] - (y1 + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// SVG-Pfad einer Strecke, eingepasst in w × h
export function trackPath(points, w, h, pad = 8) {
  if (!points || points.length < 2) return '';
  const lat0 = points[0][0];
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p[1] * kx);
  const ys = points.map((p) => -p[0]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const s = Math.min((w - 2 * pad) / ((maxX - minX) || 1e-9), (h - 2 * pad) / ((maxY - minY) || 1e-9));
  const ox = (w - (maxX - minX) * s) / 2;
  const oy = (h - (maxY - minY) * s) / 2;
  return points.map((p, i) => `${i ? 'L' : 'M'}${(ox + (xs[i] - minX) * s).toFixed(1)} ${(oy + (ys[i] - minY) * s).toFixed(1)}`).join(' ');
}
