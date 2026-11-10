// Scheibenrechner und Aufwärmsätze – reine Rechnung ohne DOM.
//
// Bei Langhantel-Übungen steht im Training das Gesamtgewicht. Aufzulegen ist
// aber „je Seite“: (Gesamt − Stange) / 2, zerlegt in die vorhandenen Scheiben,
// die schwersten zuerst. Bei „je Seite“ eingetragenen Übungen (Smith-Maschine,
// Beinpresse) ist die Zahl schon das, was auf eine Seite kommt.
import { Store } from './store.js';
import { profileOf, loadOf } from './progression.js';

export const DEFAULT_BAR = { kg: 20, lb: 45 };
export const BAR_OPTIONS = { kg: [20, 15, 10, 7.5, 5, 0], lb: [45, 35, 25, 15, 0] };
export const ALL_PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5], lb: [45, 35, 25, 10, 5, 2.5] };
export const DEFAULT_PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] };

const round2 = (n) => Math.round(n * 100) / 100;

// Scheiben für eine Seite: gierig von schwer nach leicht. rest > 0 heißt: mit
// den vorhandenen Scheiben geht es nicht genau auf.
export function platesFor(perSide, plates) {
  const sorted = [...plates].filter((p) => p > 0).sort((a, b) => b - a);
  const out = [];
  let rest = round2(Math.max(0, perSide));
  for (const p of sorted) {
    while (rest >= p - 1e-9 && out.length < 14) {
      out.push(p);
      rest = round2(rest - p);
    }
  }
  return { plates: out, rest };
}

// mode: 'total' (Gewicht samt Stange) oder 'side' (nur eine Seite)
export function loadout(weight, { mode = 'total', bar = 20, plates = DEFAULT_PLATES.kg } = {}) {
  if (!(weight > 0)) return null;
  if (mode === 'side') {
    const r = platesFor(weight, plates);
    return { perSide: round2(weight), plates: r.plates, rest: r.rest, bar: null, below: false };
  }
  if (weight < bar - 1e-9) return { perSide: 0, plates: [], rest: 0, bar, below: true };
  const perSide = round2((weight - bar) / 2);
  const r = platesFor(perSide, plates);
  return { perSide, plates: r.plates, rest: r.rest, bar, below: false };
}

// Gleiche Scheiben zusammenfassen: [20, 20, 5] → [[20, 2], [5, 1]]
export function groupPlates(plates) {
  const out = [];
  plates.forEach((p) => {
    const last = out[out.length - 1];
    if (last && last[0] === p) last[1] += 1; else out.push([p, 1]);
  });
  return out;
}

// ---------- Einstellungen und Übungen ----------
export function plateSettings(settings = Store.getSettings()) {
  const unit = settings.unit === 'lb' ? 'lb' : 'kg';
  const bar = typeof settings.barWeight === 'number' ? settings.barWeight : DEFAULT_BAR[unit];
  const plates = Array.isArray(settings.plates) && settings.plates.length ? settings.plates : DEFAULT_PLATES[unit];
  return { unit, bar, plates };
}

// Wie wird die Übung beladen? null, wenn Scheiben keinen Sinn ergeben
// (Kurzhantel, Kabel, Maschine mit Steckgewicht, Körpergewicht).
// SZ-Stangen sind leichter als eine Langhantel; ihr Gewicht schwankt je nach
// Modell – der Wert lässt sich je Übung festlegen.
export function plateSetup(exercise, settings = Store.getSettings()) {
  if (!exercise) return null;
  const profile = profileOf(exercise);
  if (!profile) return null;
  const load = loadOf(exercise, profile);
  const base = plateSettings(settings);
  if (load === 'side') return { mode: 'side', bar: null, plates: base.plates, unit: base.unit };
  if (load !== 'total' || profile.equipment !== 'barbell') return null;
  const sz = /\bsz\b|sz-/.test(String(exercise.name || '').toLowerCase());
  const fallback = sz ? (base.unit === 'lb' ? 25 : 10) : base.bar;
  const bar = typeof exercise.bar === 'number' ? exercise.bar : fallback;
  return { mode: 'total', bar, plates: base.plates, unit: base.unit, custom: typeof exercise.bar === 'number' };
}

// ---------- Aufwärmsätze ----------
// Übliche Rampe vor dem ersten schweren Satz: wenige, leichter werdende
// Sätze mit sinkenden Wiederholungen – warm werden, ohne zu ermüden. Die
// Werte sind Richtwerte; gerundet wird auf das, was sich auflegen lässt.
const RAMP = [
  { share: 0.4, reps: 8 },
  { share: 0.6, reps: 5 },
  { share: 0.8, reps: 3 },
];

// work: Gewicht des ersten Arbeitssatzes (so, wie es eingetragen wird)
// setup: Ergebnis von plateSetup oder null; step: kleinster sinnvoller Schritt
export function warmupSets(work, { setup = null, step = 2.5 } = {}) {
  if (!(work > 0)) return [];
  // Langhantel: auf volle 5 kg (10 lb) – beim Aufwärmen zählt, dass sich
  // schnell umstecken lässt, nicht die letzte kleine Scheibe
  const grid = setup?.mode === 'total' ? (setup.unit === 'lb' ? 10 : 5) : step;
  const floor = setup?.mode === 'total' ? setup.bar : 0;
  const snap = (v) => {
    const base = floor + Math.round((v - floor) / grid) * grid;
    return round2(Math.max(floor, base));
  };
  const out = [];
  // Leere Stange zuerst, wenn das Arbeitsgewicht klar darüber liegt
  if (setup?.mode === 'total' && setup.bar > 0 && work >= setup.bar * 1.5) out.push({ weight: setup.bar, reps: 10, share: setup.bar / work });
  RAMP.forEach(({ share, reps }) => {
    const weight = snap(work * share);
    const last = out[out.length - 1];
    if (weight <= 0 || weight >= work || (last && weight <= last.weight)) return;
    out.push({ weight, reps, share: weight / work });
  });
  // Bei leichten Gewichten genügen ein, zwei Sätze
  return out;
}
