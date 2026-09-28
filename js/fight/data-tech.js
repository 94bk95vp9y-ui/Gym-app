// Kickboxen: Techniken, Kombinationen und Lehrplan (Gürtel).
//
// Aufbau des Lehrplans nach dem, was Einsteiger zuerst brauchen: Stellung,
// Deckung und Beinarbeit vor jedem Schlag; gerade Schläge vor Haken; erst
// Hände, dann Tritte; jede Angriffsstufe bringt die passende Abwehr mit.
//
// Merkpunkte sind bewusst auf das Ziel formuliert („durch das Ziel“, „Kinn
// hinter die Schulter“) statt auf Muskeln – mit äußerem Fokus lernt man
// Bewegungen nachweislich schneller. Sicherheitshinweise stehen direkt bei
// der Technik (z. B. beim Schattenboxen den Ellbogen nie durchschnappen).
//
// Posen: siehe anim.js – alles für die Linksauslage beschrieben.

import { STANCE as G, yaw, add } from './anim.js';

const P = (patch) => ({ ...G, ...patch });

// Häufige Bausteine
const leadHandHome = [0.12, 1.45, 0.22]; // Führhand schützt beim Schlag der hinteren Hand
const rearHeelUp = { footR: [-0.15, 0.125, -0.19], toeR: [-0.12, 0.04, -0.05], kneeR: [-0.05, 0.5, 0.55] };

// ---------- Clips ----------
const CLIPS = {
  stance: {
    keys: [{ t: 0, p: {} }, { t: 1.6, p: {} }],
    next: 1.6,
  },

  stepFB: {
    keys: [
      { t: 0, p: {} },
      { t: 0.13, ease: 'out', shift: [0, 0, 0.09], p: { footL: add(G.footL, [0, 0.035, 0.09]), toeL: add(G.toeL, [0, 0.035, 0.09]), footR: add(G.footR, [0, 0, -0.09]), toeR: add(G.toeR, [0, 0, -0.09]) } },
      { t: 0.24, ease: 'out', shift: [0, 0, 0.18], p: {} },
      { t: 0.62, ease: 'lin', shift: [0, 0, 0.18], p: {} },
      { t: 0.75, ease: 'out', shift: [0, 0, 0.09], p: { footR: add(G.footR, [0, 0.03, -0.09]), toeR: add(G.toeR, [0, 0.03, -0.09]), footL: add(G.footL, [0, 0, 0.09]), toeL: add(G.toeL, [0, 0, 0.09]) } },
      { t: 0.86, ease: 'out', shift: [0, 0, 0], p: {} },
      { t: 1.2, p: {} },
    ],
    next: 1.2,
  },

  stepLR: {
    keys: [
      { t: 0, p: {} },
      { t: 0.13, ease: 'out', shift: [0.08, 0, 0], p: { footL: add(G.footL, [0.08, 0.035, 0]), toeL: add(G.toeL, [0.08, 0.035, 0]), footR: add(G.footR, [-0.08, 0, 0]), toeR: add(G.toeR, [-0.08, 0, 0]) } },
      { t: 0.24, ease: 'out', shift: [0.16, 0, 0], p: {} },
      { t: 0.6, ease: 'lin', shift: [0.16, 0, 0], p: {} },
      { t: 0.73, ease: 'out', shift: [0.08, 0, 0], p: { footR: add(G.footR, [-0.08, 0.03, 0]), toeR: add(G.toeR, [-0.08, 0.03, 0]), footL: add(G.footL, [0.08, 0, 0]), toeL: add(G.toeL, [0.08, 0, 0]) } },
      { t: 0.84, ease: 'out', shift: [0, 0, 0], p: {} },
      { t: 1.2, p: {} },
    ],
    next: 1.2,
  },

  pivot: {
    keys: [
      { t: 0, p: {} },
      { t: 0.3, ease: 'inOut', yaw: 55, p: { footR: add(G.footR, [0, 0.03, 0]) } },
      { t: 0.9, ease: 'lin', yaw: 55, p: {} },
      { t: 1.2, ease: 'inOut', yaw: 0, p: { footR: add(G.footR, [0, 0.03, 0]) } },
      { t: 1.45, p: {} },
    ],
    next: 1.3,
  },

  jab: {
    keys: [
      { t: 0, p: {} },
      { t: 0.13, ease: 'snap', p: { handL: [0.035, 1.49, 0.64], elbowL: [0.32, 1.28, 0.34], cFwd: yaw(-12), pFwd: yaw(-30), pelvis: [-0.01, 0.9, 0.035], hUp: [-0.05, 1, 0.16], footR: [-0.17, 0.11, -0.2] } },
      { t: 0.19, ease: 'lin', p: { handL: [0.04, 1.48, 0.6], elbowL: [0.32, 1.26, 0.32], cFwd: yaw(-14), pFwd: yaw(-31), pelvis: [-0.01, 0.9, 0.03], hUp: [-0.05, 1, 0.16] } },
      { t: 0.36, ease: 'inOut', p: {} },
    ],
    next: 0.2,
    impact: 0.13,
    trail: 'L',
    chain: { from: 0, to: 0.13, parts: ['footR', 'shinR', 'thighR', 'pelvis', 'abdomen', 'chest', 'shoulderL', 'upperArmL', 'foreArmL', 'handL'] },
  },

  cross: {
    keys: [
      { t: 0, p: {} },
      { t: 0.15, ease: 'snap', p: { handR: [0.005, 1.49, 0.64], elbowR: [-0.32, 1.28, 0.4], handL: leadHandHome, elbowL: [0.35, 1.0, 0.2], cFwd: yaw(22), pFwd: yaw(6), pelvis: [0.02, 0.89, 0.06], ...rearHeelUp, hUp: [0.07, 1, 0.16], look: [0, -0.08, 1] } },
      { t: 0.21, ease: 'lin', p: { handR: [0.01, 1.48, 0.6], elbowR: [-0.32, 1.26, 0.38], handL: leadHandHome, elbowL: [0.35, 1.0, 0.2], cFwd: yaw(18), pFwd: yaw(3), pelvis: [0.02, 0.89, 0.055], ...rearHeelUp, hUp: [0.07, 1, 0.16] } },
      { t: 0.42, ease: 'inOut', p: {} },
    ],
    next: 0.22,
    impact: 0.15,
    trail: 'R',
    chain: { from: 0, to: 0.15, parts: ['footR', 'shinR', 'thighR', 'pelvis', 'abdomen', 'chest', 'shoulderR', 'upperArmR', 'foreArmR', 'handR'] },
  },

  hookL: {
    keys: [
      { t: 0, p: {} },
      { t: 0.08, ease: 'out', p: { handL: [0.28, 1.44, 0.3], elbowL: [0.6, 1.3, 0.1], cFwd: yaw(-18), pFwd: yaw(-28) } },
      { t: 0.18, ease: 'snap', p: { handL: [-0.09, 1.46, 0.52], elbowL: [0.5, 1.5, 0.36], cFwd: yaw(-66), pFwd: yaw(-62), pelvis: [-0.03, 0.89, 0.02], footL: [0.1, 0.11, 0.24], toeL: [-0.05, 0.045, 0.36], kneeL: [0.02, 0.5, 0.8], hUp: [0.05, 1, 0.16], look: [0.3, -0.08, 1] } },
      { t: 0.24, ease: 'lin', p: { handL: [-0.06, 1.46, 0.5], elbowL: [0.5, 1.48, 0.34], cFwd: yaw(-62), pFwd: yaw(-58), pelvis: [-0.03, 0.89, 0.02], footL: [0.1, 0.11, 0.24], toeL: [-0.04, 0.045, 0.36], kneeL: [0.03, 0.5, 0.8] } },
      { t: 0.44, ease: 'inOut', p: {} },
    ],
    next: 0.26,
    impact: 0.18,
    trail: 'L',
    chain: { from: 0.04, to: 0.18, parts: ['footL', 'shinL', 'thighL', 'pelvis', 'abdomen', 'chest', 'shoulderL', 'upperArmL', 'foreArmL', 'handL'] },
  },

  hookR: {
    keys: [
      { t: 0, p: {} },
      { t: 0.08, ease: 'out', p: { handR: [-0.32, 1.42, 0.18], elbowR: [-0.62, 1.28, 0.0], cFwd: yaw(-12) } },
      { t: 0.19, ease: 'snap', p: { handR: [0.11, 1.46, 0.52], elbowR: [-0.5, 1.52, 0.42], handL: leadHandHome, elbowL: [0.35, 1.0, 0.2], cFwd: yaw(42), pFwd: yaw(16), pelvis: [0.02, 0.89, 0.05], ...rearHeelUp, hUp: [0.05, 1, 0.16], look: [-0.2, -0.08, 1] } },
      { t: 0.25, ease: 'lin', p: { handR: [0.08, 1.46, 0.5], elbowR: [-0.5, 1.5, 0.4], handL: leadHandHome, elbowL: [0.35, 1.0, 0.2], cFwd: yaw(38), pFwd: yaw(13), pelvis: [0.02, 0.89, 0.05], ...rearHeelUp } },
      { t: 0.46, ease: 'inOut', p: {} },
    ],
    next: 0.27,
    impact: 0.19,
    trail: 'R',
    chain: { from: 0.04, to: 0.19, parts: ['footR', 'shinR', 'thighR', 'pelvis', 'abdomen', 'chest', 'shoulderR', 'upperArmR', 'foreArmR', 'handR'] },
  },

  upperL: {
    keys: [
      { t: 0, p: {} },
      { t: 0.1, ease: 'out', p: { pelvis: [0.0, 0.85, 0.0], cUp: [0.14, 1, 0.16], cFwd: yaw(-40), handL: [0.15, 1.14, 0.3], elbowL: [0.28, 0.85, 0.28], handR: [-0.08, 1.38, 0.14], kneeL: [0.25, 0.45, 0.8] } },
      { t: 0.2, ease: 'snap', p: { pelvis: [-0.02, 0.91, 0.03], cUp: [-0.04, 1, 0.1], cFwd: yaw(-8), handL: [0.01, 1.38, 0.44], elbowL: [0.12, 0.9, 0.7], hUp: [0, 1, 0.14] } },
      { t: 0.26, ease: 'lin', p: { pelvis: [-0.02, 0.91, 0.03], cFwd: yaw(-10), handL: [0.02, 1.37, 0.42], elbowL: [0.12, 0.9, 0.68] } },
      { t: 0.46, ease: 'inOut', p: {} },
    ],
    next: 0.28,
    impact: 0.2,
    trail: 'L',
    chain: { from: 0.08, to: 0.2, parts: ['footL', 'shinL', 'thighL', 'pelvis', 'abdomen', 'chest', 'shoulderL', 'upperArmL', 'foreArmL', 'handL'] },
  },

  upperR: {
    keys: [
      { t: 0, p: {} },
      { t: 0.1, ease: 'out', p: { pelvis: [-0.05, 0.85, -0.02], cUp: [-0.14, 1, 0.16], cFwd: yaw(-36), handR: [-0.14, 1.1, 0.22], elbowR: [-0.26, 0.82, 0.18], kneeR: [-0.33, 0.45, 0.5] } },
      { t: 0.21, ease: 'snap', p: { pelvis: [0.01, 0.9, 0.05], cUp: [0.03, 1, 0.1], cFwd: yaw(18), pFwd: yaw(0), handR: [0.0, 1.38, 0.44], elbowR: [-0.1, 0.9, 0.7], handL: leadHandHome, elbowL: [0.35, 1.0, 0.2], ...rearHeelUp } },
      { t: 0.27, ease: 'lin', p: { pelvis: [0.01, 0.9, 0.05], cFwd: yaw(15), handR: [0.0, 1.37, 0.42], elbowR: [-0.1, 0.9, 0.68], handL: leadHandHome, ...rearHeelUp } },
      { t: 0.48, ease: 'inOut', p: {} },
    ],
    next: 0.29,
    impact: 0.21,
    trail: 'R',
    chain: { from: 0.08, to: 0.21, parts: ['footR', 'shinR', 'thighR', 'pelvis', 'abdomen', 'chest', 'shoulderR', 'upperArmR', 'foreArmR', 'handR'] },
  },

  jabBody: {
    keys: [
      { t: 0, p: {} },
      { t: 0.12, ease: 'out', p: { pelvis: [0.0, 0.77, 0.03], cUp: [0, 1, 0.45], hUp: [0, 1, 0.3], kneeL: [0.25, 0.45, 0.95], kneeR: [-0.32, 0.45, 0.6], handL: [0.09, 1.25, 0.43], elbowL: [0.3, 0.75, 0.3], handR: [-0.08, 1.24, 0.34], elbowR: [-0.3, 0.75, 0.15] } },
      { t: 0.21, ease: 'snap', p: { pelvis: [0.0, 0.77, 0.05], cUp: [0, 1, 0.45], cFwd: yaw(-14), hUp: [0, 1, 0.3], kneeL: [0.25, 0.45, 0.95], kneeR: [-0.32, 0.45, 0.6], handL: [0.03, 1.05, 0.72], elbowL: [0.32, 0.95, 0.5], handR: [-0.08, 1.24, 0.36], elbowR: [-0.3, 0.75, 0.15] } },
      { t: 0.5, ease: 'inOut', p: {} },
    ],
    next: 0.3,
    impact: 0.21,
    trail: 'L',
  },

  crossBody: {
    keys: [
      { t: 0, p: {} },
      { t: 0.12, ease: 'out', p: { pelvis: [0.0, 0.77, 0.03], cUp: [0, 1, 0.45], hUp: [0, 1, 0.3], kneeL: [0.25, 0.45, 0.95], kneeR: [-0.32, 0.45, 0.6], handL: [0.1, 1.25, 0.42], elbowL: [0.3, 0.75, 0.3], handR: [-0.08, 1.24, 0.34], elbowR: [-0.3, 0.75, 0.15] } },
      { t: 0.23, ease: 'snap', p: { pelvis: [0.03, 0.77, 0.07], cUp: [0, 1, 0.45], cFwd: yaw(22), pFwd: yaw(4), hUp: [0, 1, 0.3], kneeL: [0.25, 0.45, 0.95], ...rearHeelUp, handR: [0.01, 1.05, 0.72], elbowR: [-0.32, 0.95, 0.55], handL: [0.14, 1.28, 0.3], elbowL: [0.35, 0.8, 0.2] } },
      { t: 0.52, ease: 'inOut', p: {} },
    ],
    next: 0.32,
    impact: 0.23,
    trail: 'R',
  },

  hookBody: {
    keys: [
      { t: 0, p: {} },
      { t: 0.1, ease: 'out', p: { pelvis: [0.02, 0.8, 0.02], cUp: [0.25, 1, 0.3], cFwd: yaw(-22), hUp: [0.1, 1, 0.25], kneeL: [0.28, 0.45, 0.9], handL: [0.3, 1.12, 0.28], elbowL: [0.5, 1.0, 0.05], handR: [-0.06, 1.3, 0.2] } },
      { t: 0.21, ease: 'snap', p: { pelvis: [0.0, 0.79, 0.03], cUp: [0.2, 1, 0.3], cFwd: yaw(-62), pFwd: yaw(-60), hUp: [0.1, 1, 0.25], kneeL: [0.1, 0.45, 0.95], footL: [0.1, 0.11, 0.24], toeL: [-0.04, 0.045, 0.36], handL: [-0.07, 1.02, 0.5], elbowL: [0.45, 1.02, 0.3], handR: [-0.06, 1.3, 0.2] } },
      { t: 0.5, ease: 'inOut', p: {} },
    ],
    next: 0.3,
    impact: 0.21,
    trail: 'L',
    chain: { from: 0.05, to: 0.21, parts: ['footL', 'shinL', 'thighL', 'pelvis', 'abdomen', 'chest', 'shoulderL', 'upperArmL', 'foreArmL', 'handL'] },
  },

  block: {
    keys: [
      { t: 0, p: {} },
      { t: 0.1, ease: 'out', p: { pelvis: [-0.02, 0.87, 0.0], cUp: [0, 1, 0.2], hUp: [0, 1, 0.32], handL: [0.07, 1.6, 0.22], elbowL: [0.12, 1.1, 0.45], handR: [-0.07, 1.6, 0.19], elbowR: [-0.13, 1.1, 0.42] } },
      { t: 0.55, ease: 'lin', p: { pelvis: [-0.02, 0.87, 0.0], cUp: [0, 1, 0.2], hUp: [0, 1, 0.32], handL: [0.07, 1.6, 0.21], elbowL: [0.12, 1.1, 0.45], handR: [-0.07, 1.6, 0.18], elbowR: [-0.13, 1.1, 0.42] } },
      { t: 0.8, ease: 'inOut', p: {} },
    ],
    next: 0.6,
  },

  slip: {
    keys: [
      { t: 0, p: {} },
      { t: 0.15, ease: 'out', p: { pelvis: [-0.07, 0.86, 0.03], cUp: [-0.38, 1, 0.2], cFwd: yaw(-44), hUp: [-0.25, 1, 0.2], look: [0.15, -0.08, 1], handL: [-0.05, 1.38, 0.3], elbowL: [0.18, 0.92, 0.18], handR: [-0.23, 1.36, 0.16], elbowR: [-0.4, 0.92, 0.0], kneeR: [-0.3, 0.45, 0.5] } },
      { t: 0.36, ease: 'lin', p: { pelvis: [-0.07, 0.86, 0.03], cUp: [-0.36, 1, 0.2], cFwd: yaw(-42), hUp: [-0.24, 1, 0.2], look: [0.15, -0.08, 1], handL: [-0.05, 1.38, 0.3], elbowL: [0.18, 0.92, 0.18], handR: [-0.23, 1.36, 0.16], elbowR: [-0.4, 0.92, 0.0] } },
      { t: 0.6, ease: 'inOut', p: {} },
    ],
    next: 0.36,
  },

  roll: {
    keys: [
      { t: 0, p: {} },
      { t: 0.16, ease: 'inOut', p: { pelvis: [-0.07, 0.75, 0.03], cUp: [-0.22, 1, 0.5], cFwd: yaw(-40), hUp: [-0.15, 1, 0.35], kneeL: [0.25, 0.42, 0.95], kneeR: [-0.35, 0.42, 0.6], handL: [-0.02, 1.18, 0.44], elbowL: [0.22, 0.7, 0.3], handR: [-0.2, 1.16, 0.3], elbowR: [-0.4, 0.7, 0.1] } },
      { t: 0.34, ease: 'inOut', p: { pelvis: [0.06, 0.74, 0.03], cUp: [0.22, 1, 0.5], cFwd: yaw(-18), hUp: [0.15, 1, 0.35], kneeL: [0.28, 0.42, 0.95], kneeR: [-0.3, 0.42, 0.6], handL: [0.2, 1.18, 0.42], elbowL: [0.42, 0.7, 0.2], handR: [0.02, 1.17, 0.36], elbowR: [-0.2, 0.7, 0.2] } },
      { t: 0.52, ease: 'inOut', p: { pelvis: [0.03, 0.86, 0.02], cUp: [0.12, 1, 0.16], cFwd: yaw(-24), handL: [0.14, 1.4, 0.3], handR: [-0.04, 1.39, 0.16] } },
      { t: 0.72, ease: 'inOut', p: {} },
    ],
    next: 0.5,
  },

  parry: {
    keys: [
      { t: 0, p: {} },
      { t: 0.1, ease: 'snap', p: { handR: [0.06, 1.46, 0.33], elbowR: [-0.22, 1.0, 0.2], cFwd: yaw(-20), hUp: [-0.04, 1, 0.16] } },
      { t: 0.3, ease: 'inOut', p: {} },
    ],
    next: 0.2,
    trail: 'R',
  },

  pullback: {
    keys: [
      { t: 0, p: {} },
      { t: 0.15, ease: 'out', p: { pelvis: [-0.04, 0.9, -0.09], pUp: [0, 1, -0.05], cUp: [0, 1, -0.28], hUp: [0, 1, 0.05], handL: [0.08, 1.4, 0.13], elbowL: [0.3, 0.95, 0.0], handR: [-0.1, 1.39, 0.01], elbowR: [-0.3, 0.95, -0.15], kneeR: [-0.3, 0.5, 0.35] } },
      { t: 0.38, ease: 'lin', p: { pelvis: [-0.04, 0.9, -0.09], pUp: [0, 1, -0.05], cUp: [0, 1, -0.27], hUp: [0, 1, 0.05], handL: [0.08, 1.4, 0.13], elbowL: [0.3, 0.95, 0.0], handR: [-0.1, 1.39, 0.01], elbowR: [-0.3, 0.95, -0.15] } },
      { t: 0.62, ease: 'inOut', p: {} },
    ],
    next: 0.4,
  },

  check: {
    keys: [
      { t: 0, p: {} },
      { t: 0.14, ease: 'out', p: { pelvis: [-0.07, 0.91, -0.03], pFwd: yaw(-24), footL: [0.22, 0.46, 0.18], toeL: [0.34, 0.44, 0.27], kneeL: [0.45, 1.0, 0.55], handL: [0.12, 1.43, 0.27], elbowL: [0.3, 1.0, 0.2], kneeR: [-0.3, 0.5, 0.35] } },
      { t: 0.46, ease: 'lin', p: { pelvis: [-0.07, 0.91, -0.03], pFwd: yaw(-24), footL: [0.22, 0.45, 0.18], toeL: [0.34, 0.43, 0.27], kneeL: [0.45, 1.0, 0.55], handL: [0.12, 1.43, 0.27], elbowL: [0.3, 1.0, 0.2] } },
      { t: 0.7, ease: 'inOut', p: {} },
    ],
    next: 0.55,
    trail: 'footL',
  },

  teep: {
    keys: [
      { t: 0, p: {} },
      { t: 0.14, ease: 'out', p: { pelvis: [-0.05, 0.91, -0.03], footL: [0.1, 0.52, 0.3], toeL: [0.1, 0.5, 0.47], kneeL: [0.12, 1.2, 1.0], cUp: [0, 1, -0.02] } },
      { t: 0.27, ease: 'snap', p: { pelvis: [-0.03, 0.93, 0.03], pUp: [0, 1, -0.2], cUp: [0, 1, -0.24], hUp: [0, 1, 0.08], footL: [0.06, 0.92, 0.78], toeL: [0.06, 1.08, 0.86], kneeL: [0.12, 1.3, 1.0], footR: [-0.17, 0.085, -0.2] } },
      { t: 0.42, ease: 'inOut', p: { pelvis: [-0.05, 0.91, -0.03], footL: [0.1, 0.52, 0.3], toeL: [0.1, 0.5, 0.47], kneeL: [0.12, 1.2, 1.0] } },
      { t: 0.62, ease: 'inOut', p: {} },
    ],
    next: 0.52,
    impact: 0.27,
    trail: 'footL',
    chain: { from: 0.1, to: 0.27, parts: ['footR', 'shinR', 'thighR', 'pelvis', 'thighL', 'shinL', 'footL'] },
  },

  teepR: {
    keys: [
      { t: 0, p: {} },
      { t: 0.16, ease: 'out', p: { pelvis: [0.0, 0.91, 0.02], pFwd: yaw(-10), cFwd: yaw(-10), footR: [-0.08, 0.52, 0.18], toeR: [-0.08, 0.5, 0.35], kneeR: [-0.1, 1.2, 1.0], footL: [0.1, 0.085, 0.24] } },
      { t: 0.3, ease: 'snap', p: { pelvis: [0.02, 0.93, 0.08], pFwd: yaw(0), pUp: [0, 1, -0.2], cUp: [0, 1, -0.25], cFwd: yaw(0), hUp: [0, 1, 0.08], footR: [-0.02, 0.92, 0.76], toeR: [-0.02, 1.08, 0.84], kneeR: [-0.05, 1.3, 1.0], handL: [0.12, 1.43, 0.3], handR: [-0.12, 1.43, 0.18] } },
      { t: 0.46, ease: 'inOut', p: { pelvis: [0.0, 0.91, 0.02], pFwd: yaw(-10), footR: [-0.08, 0.52, 0.18], toeR: [-0.08, 0.5, 0.35], kneeR: [-0.1, 1.2, 1.0] } },
      { t: 0.7, ease: 'inOut', p: {} },
    ],
    next: 0.6,
    impact: 0.3,
    trail: 'footR',
  },

  lowkick: {
    keys: [
      { t: 0, p: {} },
      { t: 0.1, ease: 'out', p: { pelvis: [0.0, 0.9, 0.04], pFwd: yaw(-8), cFwd: yaw(-16), footL: [0.13, 0.09, 0.27], toeL: [0.26, 0.04, 0.37], footR: [-0.15, 0.16, -0.16], toeR: [-0.16, 0.1, -0.02], kneeR: [-0.2, 0.6, 0.6] } },
      { t: 0.22, ease: 'in', p: { pelvis: [0.01, 0.91, 0.05], pFwd: yaw(42), cFwd: yaw(18), cUp: [-0.12, 1, 0.02], footL: [0.13, 0.09, 0.27], toeL: [0.29, 0.04, 0.33], footR: [-0.34, 0.42, 0.1], toeR: [-0.24, 0.44, 0.24], kneeR: [-0.2, 0.95, 0.7], handR: [-0.26, 1.2, 0.05], elbowR: [-0.45, 1.0, -0.1] } },
      { t: 0.32, ease: 'out', p: { pelvis: [0.02, 0.92, 0.06], pFwd: yaw(78), pUp: [0.08, 1, 0], cFwd: yaw(44), cUp: [-0.3, 1, -0.04], footL: [0.13, 0.1, 0.27], toeL: [0.31, 0.045, 0.3], footR: [0.24, 0.5, 0.62], toeR: [0.37, 0.52, 0.66], kneeR: [0.0, 0.9, 1.0], handR: [-0.36, 1.05, -0.12], elbowR: [-0.52, 1.0, -0.2], handL: [0.12, 1.46, 0.3], hUp: [-0.06, 1, 0.1], look: [0.1, -0.1, 1] } },
      { t: 0.45, ease: 'inOut', p: { pelvis: [0.01, 0.91, 0.05], pFwd: yaw(40), cFwd: yaw(16), footL: [0.13, 0.09, 0.27], toeL: [0.28, 0.04, 0.34], footR: [-0.3, 0.38, 0.06], toeR: [-0.22, 0.4, 0.2], kneeR: [-0.2, 0.95, 0.7] } },
      { t: 0.68, ease: 'inOut', p: {} },
    ],
    next: 0.56,
    impact: 0.32,
    trail: 'footR',
    chain: { from: 0.06, to: 0.32, parts: ['footL', 'shinL', 'thighL', 'pelvis', 'abdomen', 'thighR', 'shinR', 'footR'] },
  },

  bodykick: {
    keys: [
      { t: 0, p: {} },
      { t: 0.1, ease: 'out', p: { pelvis: [0.0, 0.9, 0.04], pFwd: yaw(-6), cFwd: yaw(-14), footL: [0.13, 0.09, 0.27], toeL: [0.28, 0.04, 0.35], footR: [-0.15, 0.17, -0.16], toeR: [-0.16, 0.11, -0.02], kneeR: [-0.2, 0.7, 0.6] } },
      { t: 0.23, ease: 'in', p: { pelvis: [0.02, 0.93, 0.05], pFwd: yaw(50), cFwd: yaw(22), cUp: [-0.2, 1, 0], footL: [0.13, 0.1, 0.27], toeL: [0.32, 0.045, 0.28], footR: [-0.36, 0.72, 0.12], toeR: [-0.26, 0.76, 0.24], kneeR: [-0.15, 1.2, 0.7], handR: [-0.3, 1.2, 0.0], elbowR: [-0.5, 1.0, -0.1] } },
      { t: 0.34, ease: 'out', p: { pelvis: [0.03, 0.95, 0.06], pFwd: yaw(90), pUp: [0.18, 1, 0], cFwd: yaw(52), cUp: [-0.46, 1, -0.08], footL: [0.13, 0.12, 0.27], toeL: [0.32, 0.05, 0.22], footR: [0.28, 1.0, 0.56], toeR: [0.42, 1.02, 0.56], kneeR: [0.0, 1.4, 1.0], handR: [-0.4, 1.02, -0.18], elbowR: [-0.55, 1.0, -0.25], handL: [0.14, 1.46, 0.3], hUp: [-0.1, 1, 0.08], look: [0.15, -0.1, 1] } },
      { t: 0.47, ease: 'inOut', p: { pelvis: [0.02, 0.93, 0.05], pFwd: yaw(48), cFwd: yaw(20), footL: [0.13, 0.1, 0.27], toeL: [0.3, 0.045, 0.3], footR: [-0.34, 0.66, 0.08], toeR: [-0.26, 0.7, 0.2], kneeR: [-0.15, 1.2, 0.7] } },
      { t: 0.72, ease: 'inOut', p: {} },
    ],
    next: 0.6,
    impact: 0.34,
    trail: 'footR',
    chain: { from: 0.06, to: 0.34, parts: ['footL', 'shinL', 'thighL', 'pelvis', 'abdomen', 'thighR', 'shinR', 'footR'] },
  },

  highkick: {
    keys: [
      { t: 0, p: {} },
      { t: 0.11, ease: 'out', p: { pelvis: [0.0, 0.91, 0.04], pFwd: yaw(-4), cFwd: yaw(-12), footL: [0.13, 0.1, 0.27], toeL: [0.3, 0.045, 0.33], footR: [-0.15, 0.18, -0.16], toeR: [-0.16, 0.12, -0.02], kneeR: [-0.2, 0.8, 0.6] } },
      { t: 0.25, ease: 'in', p: { pelvis: [0.02, 0.96, 0.05], pFwd: yaw(58), cFwd: yaw(26), cUp: [-0.35, 1, -0.02], footL: [0.13, 0.12, 0.27], toeL: [0.33, 0.05, 0.24], footR: [-0.36, 1.05, 0.16], toeR: [-0.26, 1.1, 0.28], kneeR: [-0.1, 1.5, 0.7], handR: [-0.32, 1.2, -0.02], elbowR: [-0.5, 1.0, -0.12] } },
      { t: 0.37, ease: 'out', p: { pelvis: [0.04, 0.98, 0.06], pFwd: yaw(98), pUp: [0.3, 1, 0], cFwd: yaw(58), cUp: [-0.72, 1, -0.1], footL: [0.13, 0.14, 0.27], toeL: [0.33, 0.06, 0.16], footR: [0.2, 1.46, 0.5], toeR: [0.33, 1.52, 0.5], kneeR: [0.0, 1.8, 1.0], handR: [-0.46, 1.0, -0.2], elbowR: [-0.6, 1.0, -0.25], handL: [0.16, 1.44, 0.28], hUp: [-0.2, 1, 0.05], look: [0.2, -0.05, 1] } },
      { t: 0.51, ease: 'inOut', p: { pelvis: [0.02, 0.95, 0.05], pFwd: yaw(55), cFwd: yaw(24), cUp: [-0.3, 1, 0], footL: [0.13, 0.12, 0.27], toeL: [0.32, 0.05, 0.25], footR: [-0.34, 0.95, 0.1], toeR: [-0.26, 1.0, 0.22], kneeR: [-0.1, 1.5, 0.7] } },
      { t: 0.78, ease: 'inOut', p: {} },
    ],
    next: 0.66,
    impact: 0.37,
    trail: 'footR',
    chain: { from: 0.07, to: 0.37, parts: ['footL', 'shinL', 'thighL', 'pelvis', 'abdomen', 'thighR', 'shinR', 'footR'] },
  },

  switchkick: {
    keys: [
      { t: 0, p: {} },
      { t: 0.14, ease: 'inOut', p: { pelvis: [-0.04, 0.92, 0.0], pFwd: yaw(10), cFwd: yaw(-10), footL: [-0.08, 0.1, -0.12], toeL: [0.02, 0.045, 0.02], kneeL: [0.15, 0.5, 0.5], footR: [-0.02, 0.1, 0.12], toeR: [-0.12, 0.045, 0.24], kneeR: [-0.25, 0.5, 0.7] } },
      { t: 0.27, ease: 'in', p: { pelvis: [-0.05, 0.94, 0.03], pFwd: yaw(-50), cFwd: yaw(-30), cUp: [0.2, 1, 0], footR: [-0.03, 0.1, 0.12], toeR: [-0.2, 0.045, 0.2], kneeR: [-0.3, 0.5, 0.7], footL: [0.36, 0.72, 0.1], toeL: [0.26, 0.76, 0.22], kneeL: [0.15, 1.2, 0.7], handL: [0.3, 1.2, 0.0], elbowL: [0.5, 1.0, -0.1] } },
      { t: 0.38, ease: 'out', p: { pelvis: [-0.06, 0.96, 0.05], pFwd: yaw(-90), pUp: [-0.18, 1, 0], cFwd: yaw(-60), cUp: [0.46, 1, -0.08], footR: [-0.03, 0.12, 0.12], toeR: [-0.22, 0.05, 0.1], kneeR: [-0.3, 0.5, 0.7], footL: [-0.28, 1.0, 0.56], toeL: [-0.42, 1.02, 0.56], kneeL: [0.0, 1.4, 1.0], handL: [0.4, 1.02, -0.18], elbowL: [0.55, 1.0, -0.25], handR: [-0.14, 1.46, 0.3], hUp: [0.1, 1, 0.08], look: [-0.15, -0.1, 1] } },
      { t: 0.52, ease: 'inOut', p: { pelvis: [-0.05, 0.93, 0.03], pFwd: yaw(-45), cFwd: yaw(-28), footR: [-0.03, 0.1, 0.12], toeR: [-0.2, 0.045, 0.2], footL: [0.34, 0.66, 0.06], toeL: [0.26, 0.7, 0.18], kneeL: [0.15, 1.2, 0.7] } },
      { t: 0.82, ease: 'inOut', p: {} },
    ],
    next: 0.68,
    impact: 0.38,
    trail: 'footL',
    chain: { from: 0.18, to: 0.38, parts: ['footR', 'shinR', 'thighR', 'pelvis', 'abdomen', 'thighL', 'shinL', 'footL'] },
  },

  knee: {
    keys: [
      { t: 0, p: {} },
      { t: 0.12, ease: 'out', p: { pelvis: [0.0, 0.91, 0.05], handL: [0.12, 1.38, 0.5], elbowL: [0.32, 1.0, 0.3], handR: [-0.1, 1.38, 0.46], elbowR: [-0.32, 1.0, 0.28], cUp: [0, 1, 0.12], footR: [-0.16, 0.13, -0.18], toeR: [-0.18, 0.08, -0.04] } },
      { t: 0.26, ease: 'snap', p: { pelvis: [0.0, 0.95, 0.1], pUp: [0, 1, -0.22], pFwd: yaw(-8), cUp: [0, 1, -0.14], cFwd: yaw(-14), footL: [0.1, 0.13, 0.24], toeL: [0.12, 0.05, 0.4], footR: [-0.04, 0.7, 0.2], toeR: [-0.04, 0.58, 0.15], kneeR: [0.0, 1.5, 1.4], handL: [0.1, 1.24, 0.42], elbowL: [0.3, 0.95, 0.3], handR: [-0.08, 1.24, 0.4], elbowR: [-0.3, 0.95, 0.28], hUp: [0, 1, 0.2] } },
      { t: 0.52, ease: 'inOut', p: {} },
    ],
    next: 0.44,
    impact: 0.26,
    trail: 'kneeR',
    chain: { from: 0.1, to: 0.26, parts: ['footL', 'shinL', 'thighL', 'pelvis', 'abdomen', 'thighR', 'kneeR'] },
  },

  feint: {
    keys: [
      { t: 0, p: {} },
      { t: 0.09, ease: 'snap', p: { handL: [0.07, 1.47, 0.42], elbowL: [0.32, 1.1, 0.25], cFwd: yaw(-20), pelvis: [-0.01, 0.89, 0.03], hUp: [-0.03, 1, 0.16] } },
      { t: 0.26, ease: 'inOut', p: {} },
    ],
    next: 0.14,
  },

  stepJab: {
    keys: [
      { t: 0, p: {} },
      { t: 0.14, ease: 'snap', shift: [0, 0, 0.12], p: { footL: add(G.footL, [0, 0.03, 0.08]), toeL: add(G.toeL, [0, 0.03, 0.08]), footR: add(G.footR, [0, 0.03, -0.12]), toeR: add(G.toeR, [0, 0.03, -0.12]), handL: [0.035, 1.49, 0.64], elbowL: [0.32, 1.28, 0.34], cFwd: yaw(-12), pFwd: yaw(-30), hUp: [-0.05, 1, 0.16] } },
      { t: 0.26, ease: 'out', shift: [0, 0, 0.18], p: {} },
      { t: 0.5, ease: 'lin', shift: [0, 0, 0.18], p: {} },
      { t: 0.72, ease: 'inOut', shift: [0, 0, 0], p: {} },
    ],
    next: 0.26,
    impact: 0.14,
    trail: 'L',
  },

  backfist: {
    keys: [
      { t: 0, p: {} },
      { t: 0.14, ease: 'inOut', yaw: -110, pivot: [0.1, 0, 0.24], p: { hUp: [0, 1, 0.1], look: yaw(95, -0.05), handR: [-0.14, 1.42, 0.1] } },
      { t: 0.32, ease: 'lin', yaw: -250, pivot: [0.1, 0, 0.24], p: { handR: [-0.35, 1.44, 0.1], elbowR: [-0.5, 1.3, -0.1], look: yaw(200, -0.05) } },
      { t: 0.4, ease: 'out', yaw: -300, pivot: [0.1, 0, 0.24], p: { handR: [-0.62, 1.48, 0.22], elbowR: [-0.5, 1.5, -0.1], cFwd: yaw(-10), look: yaw(240, -0.05) } },
      { t: 0.62, ease: 'inOut', yaw: -360, pivot: [0.1, 0, 0.24], p: {} },
      { t: 0.8, ease: 'inOut', yaw: -360, pivot: [0.1, 0, 0.24], p: {} },
    ],
    next: 0.66,
    impact: 0.4,
    trail: 'R',
  },
};

// ---------- Techniken ----------
// code: Kürzel in Kombinationen · say: Ansage im Namen-Modus
// cat: stance | footwork | punch | defense | kick | knee
// quiet: auch leise machbar · bag: am (Wand-)Sack sinnvoll
export const TECHNIQUES = [
  {
    id: 'stance', clip: 'stance', code: 'ST', belt: 0, cat: 'stance',
    name: 'Kampfstellung & Deckung', alias: 'Stance & Guard', say: 'Stellung',
    what: 'Die Grundhaltung, aus der jede Technik startet und in die jede zurückkehrt.',
    when: 'Immer. Wer die Deckung fallen lässt, wird getroffen.',
    cues: ['Füße schulterbreit, vorderer Fuß zeigt leicht nach innen, hinterer Fuß schräg.', 'Knie weich, Gewicht auf beiden Fußballen – federnd wie auf Zehenspitzen.', 'Hände an Wange und Kinn, Ellbogen am Körper, Kinn hinter die Schulter.'],
    mistakes: ['Füße auf einer Linie – man verliert sofort das Gleichgewicht.', 'Kinn hoch und Blick über die Handschuhe.'],
    drill: 'Vor dem Spiegel 3 × 1 Minute: in Stellung federn, Deckung halten, regelmäßig kontrollieren.',
    quiet: true, bag: false, cam: { az: 28, el: 8 },
    phases: [{ t: 0, text: 'Seitlich zum Gegner, Kinn unten, Hände hoch.' }],
  },
  {
    id: 'step-fb', clip: 'stepFB', code: 'VZ', belt: 0, cat: 'footwork',
    name: 'Beinarbeit vor & zurück', alias: 'Step & Slide', say: 'Schritt',
    what: 'Vorwärts bewegt sich zuerst der vordere Fuß, rückwärts zuerst der hintere – die Stellung bleibt immer gleich.',
    when: 'Um Distanz zu schaffen oder zu schließen, ohne die Balance zu verlieren.',
    cues: ['Der Fuß in Bewegungsrichtung geht zuerst, der andere zieht gleich weit nach.', 'Kleine Schritte, flach über den Boden gleiten.', 'Kopfhöhe bleibt gleich – nicht hüpfen.'],
    mistakes: ['Füße kreuzen oder zusammenziehen.', 'Große Schritte, bei denen die Stellung verloren geht.'],
    drill: '3 × 1 Minute: vor, vor, zurück, zurück – im kleinen Zimmer reichen zwei Schritte.',
    quiet: true, bag: false, space: 'small', cam: { az: 70, el: 10 },
    phases: [{ t: 0, text: 'Vorderer Fuß geht vor …' }, { t: 0.14, text: '… hinterer zieht nach.' }, { t: 0.62, text: 'Zurück: hinterer Fuß zuerst.' }],
  },
  {
    id: 'jab', clip: 'jab', code: '1', belt: 0, cat: 'punch',
    name: 'Jab', alias: 'Führhand-Gerade', say: 'Jab',
    what: 'Schneller gerader Schlag mit der vorderen Hand – die wichtigste Technik überhaupt.',
    when: 'Zum Abstand messen, Gegner stören und jede Kombination einleiten.',
    cues: ['Faust schießt gerade nach vorn und dreht kurz vor dem Ziel, Daumen nach unten.', 'Schulter steigt zum Kinn, der Kopf geht leicht aus der Mittellinie.', 'Genauso schnell zurück an die Wange, wie sie rausging.'],
    mistakes: ['Ausholen oder die Hand vorher fallen lassen.', 'Arm schlaff zurückfallen lassen statt aktiv zurückziehen.'],
    safety: 'Beim Schattenboxen den Ellbogen nie ganz durchschnappen – das reizt das Gelenk.',
    drill: '3 × 45 Sekunden je Tempo: 10 langsam, dann schnell, dann Doppel-Jab.',
    quiet: true, bag: true, cam: { az: 42, el: 6 },
    phases: [{ t: 0, text: 'Aus der Deckung, ohne Ausholen.' }, { t: 0.06, text: 'Leichter Druck vom hinteren Fuß, Schulter dreht ein.' }, { t: 0.13, text: 'Treffer: Faust gedreht, Arm fast gestreckt.' }, { t: 0.2, text: 'Direkt zurück an die Wange.' }],
  },
  {
    id: 'cross', clip: 'cross', code: '2', belt: 0, cat: 'punch',
    name: 'Cross', alias: 'Schlaghand-Gerade', say: 'Cross',
    what: 'Gerader Schlag mit der hinteren Hand – der Kraftschlag, getragen von Bein und Hüfte.',
    when: 'Direkt nach dem Jab (1-2) oder als Konter in die Lücke.',
    cues: ['Hintere Ferse dreht nach außen, als würdest du eine Zigarette austreten.', 'Hüfte und Schulter drehen voll ein – die Faust wird nur mitgenommen.', 'Führhand bleibt an der Wange.'],
    mistakes: ['Nur aus dem Arm schlagen, ohne Hüftdrehung.', 'Vordere Hand fällt beim Schlag herunter.'],
    safety: 'Ellbogen nicht überstrecken; lieber etwas kürzer schlagen.',
    drill: '3 × 45 Sekunden: 1-2 langsam, auf die Drehung der Ferse achten.',
    quiet: true, bag: true, cam: { az: -35, el: 6 },
    phases: [{ t: 0, text: 'Ferse, Hüfte, Schulter – in dieser Reihenfolge.' }, { t: 0.08, text: 'Die Drehung zieht die Faust nach vorn.' }, { t: 0.15, text: 'Treffer: Hüfte zeigt nach vorn.' }, { t: 0.22, text: 'Auf gleichem Weg zurück.' }],
  },
  {
    id: 'block', clip: 'block', code: 'BL', belt: 0, cat: 'defense',
    name: 'Doppeldeckung', alias: 'Block / Cover', say: 'Block',
    what: 'Beide Fäuste an die Stirn, Ellbogen eng – fängt Schläge auf Kopf und Körper.',
    when: 'Wenn eine Schlagserie kommt und Ausweichen nicht mehr geht.',
    cues: ['Handschuhe an die Stirn, als würdest du dir die Haare aus dem Gesicht streichen.', 'Ellbogen schließen die Lücke zum Bauch.', 'Kinn runter und durch die Lücke schauen.'],
    mistakes: ['Augen zu machen.', 'Hände vor das Gesicht halten, statt sie anzulegen.'],
    drill: '3 × 30 Sekunden: auf Ansage „Block“ reinziehen, danach sofort 1-2 kontern.',
    quiet: true, bag: false, cam: { az: 10, el: 6 },
    phases: [{ t: 0, text: 'Hände an die Stirn, Ellbogen zusammen.' }],
  },
  {
    id: 'pullback', clip: 'pullback', code: 'PB', belt: 0, cat: 'defense',
    name: 'Zurücklehnen', alias: 'Pull Back', say: 'Zurück',
    what: 'Oberkörper kurz auf das hintere Bein verlagern – der Schlag verfehlt knapp.',
    when: 'Gegen Jab und Cross; danach direkt mit der Schlaghand kontern.',
    cues: ['Gewicht aufs hintere Bein, die Hüfte schiebt zurück.', 'Kopf nur so weit zurück, dass der Schlag knapp vorbeigeht.', 'Aus der Rückbewegung sofort zurückschlagen.'],
    mistakes: ['Kinn nach oben und Blick weg.', 'Zu weit zurück, dann fehlt der Konter.'],
    drill: '3 × 30 Sekunden: Zurück – Cross, im eigenen Rhythmus.',
    quiet: true, bag: false, cam: { az: 80, el: 6 },
    phases: [{ t: 0, text: 'Gewicht nach hinten, Deckung bleibt.' }],
  },
  {
    id: 'hook-lead', clip: 'hookL', code: '3', belt: 1, cat: 'punch',
    name: 'Führhand-Haken', alias: 'Lead Hook', say: 'Haken',
    what: 'Kurzer, waagerechter Schlag mit der vorderen Hand, angetrieben aus der Drehung.',
    when: 'Auf kurzer Distanz, klassisch nach 1-2.',
    cues: ['Ellbogen auf Schulterhöhe, Unterarm waagerecht wie ein Balken.', 'Vorderer Fuß und Hüfte drehen ein – der Arm bleibt fest.', 'Die Faust endet vor deiner eigenen Nase.'],
    mistakes: ['Weit ausholen – das sieht jeder kommen.', 'Den Arm strecken statt den Winkel zu halten.'],
    drill: '3 × 45 Sekunden: langsam drehen, dann 1-2-3.',
    quiet: true, bag: true, cam: { az: 20, el: 14 },
    phases: [{ t: 0, text: 'Aus der Deckung, kein Ausholen.' }, { t: 0.08, text: 'Vorderer Fuß und Hüfte drehen ein.' }, { t: 0.18, text: 'Treffer: Arm im 90-Grad-Winkel.' }, { t: 0.26, text: 'Zurück an die Schläfe.' }],
  },
  {
    id: 'hook-rear', clip: 'hookR', code: '4', belt: 1, cat: 'punch',
    name: 'Schlaghand-Haken', alias: 'Rear Hook', say: 'Rechter Haken',
    what: 'Waagerechter Haken mit der hinteren Hand – schwer und nah.',
    when: 'Nach einem Führhand-Haken oder als Konter auf einen Jab.',
    cues: ['Hintere Ferse dreht wie beim Cross, der Ellbogen hebt sich auf Schulterhöhe.', 'Hüfte zieht den Arm durch, die Faust bleibt locker bis zum Treffer.', 'Führhand schützt die Wange.'],
    mistakes: ['Zu weit ausholen.', 'Führhand fällt.'],
    drill: '3 × 45 Sekunden: 3-4 im Wechsel, ruhig und kontrolliert.',
    quiet: true, bag: true, cam: { az: -20, el: 14 },
    phases: [{ t: 0, text: 'Ferse und Hüfte starten.' }, { t: 0.19, text: 'Treffer: Unterarm waagerecht.' }],
  },
  {
    id: 'step-lr', clip: 'stepLR', code: 'SE', belt: 1, cat: 'footwork',
    name: 'Beinarbeit seitlich', alias: 'Lateral Step', say: 'Seitlich',
    what: 'Seitwärts geht der Fuß in Bewegungsrichtung zuerst, der andere folgt.',
    when: 'Um aus der Angriffslinie zu gehen, ohne zurückzuweichen.',
    cues: ['Nach links: vorderer Fuß zuerst. Nach rechts: hinterer Fuß zuerst.', 'Nie die Füße kreuzen.', 'Nach jedem Schritt sofort wieder in Stellung.'],
    mistakes: ['Überkreuzen der Füße.'],
    drill: '3 × 1 Minute: links, links, rechts, rechts – dazwischen ein Jab.',
    quiet: true, bag: false, space: 'small', cam: { az: 0, el: 16 },
    phases: [{ t: 0, text: 'Fuß in Bewegungsrichtung zuerst.' }],
  },
  {
    id: 'slip', clip: 'slip', code: 'SL', belt: 1, cat: 'defense',
    name: 'Slip', alias: 'Abducken seitlich', say: 'Slip',
    what: 'Kopf durch eine kleine Drehung und Beugung aus der Schlaglinie nehmen.',
    when: 'Gegen gerade Schläge; öffnet sofort einen Konter.',
    cues: ['Der Kopf wandert nur eine Kopfbreite zur Seite.', 'Die Bewegung kommt aus Knie und Hüfte, nicht aus dem Nacken.', 'Augen bleiben beim Gegner.'],
    mistakes: ['Zu weit zur Seite kippen.', 'Deckung fallen lassen.'],
    drill: '3 × 30 Sekunden: Slip – Cross. Vor dem Spiegel kontrollieren.',
    quiet: true, bag: false, cam: { az: 0, el: 10 },
    phases: [{ t: 0, text: 'Knie beugen, Schulter dreht ein.' }, { t: 0.15, text: 'Kopf ist aus der Linie.' }],
  },
  {
    id: 'teep', clip: 'teep', code: 'TP', belt: 1, cat: 'kick',
    name: 'Teep', alias: 'Frontkick Führbein', say: 'Teep',
    what: 'Gerader Stoßtritt mit dem vorderen Bein – hält den Gegner auf Abstand.',
    when: 'Wenn der Gegner nach vorn drängt oder um den eigenen Angriff vorzubereiten.',
    cues: ['Knie zuerst hoch zur Brust ziehen.', 'Mit dem Fußballen durch den Bauch des Gegners stoßen.', 'Hüfte schiebt nach vorn, Oberkörper leicht zurück, Hände bleiben oben.'],
    mistakes: ['Tritt nur aus dem Knie ohne Hüfteinsatz.', 'Nach dem Tritt nach vorn fallen.'],
    drill: '3 × 45 Sekunden: langsam in drei Schritten (hoch – stoßen – zurück), dann flüssig.',
    quiet: true, bag: false, cam: { az: 80, el: 6 },
    phases: [{ t: 0, text: 'Knie hoch, Hände bleiben oben.' }, { t: 0.14, text: 'Hüfte schiebt, Fuß stößt gerade.' }, { t: 0.27, text: 'Treffer mit dem Ballen.' }, { t: 0.42, text: 'Knie zurückholen, dann absetzen.' }],
  },
  {
    id: 'jab-body', clip: 'jabBody', code: '1b', belt: 1, cat: 'punch',
    name: 'Jab zum Körper', alias: 'Body Jab', say: 'Jab Körper',
    what: 'Jab auf den Bauch – mit Kniebeuge statt Vorbeugen.',
    when: 'Um die Deckung nach unten zu ziehen; danach oben weitermachen.',
    cues: ['Mit den Beinen runter, nicht mit dem Kopf.', 'Kopf bleibt hinter der Faust, Kinn unten.', 'Nach dem Schlag sofort wieder hoch.'],
    mistakes: ['Nach vorn beugen und den Kopf anbieten.'],
    drill: '3 × 30 Sekunden: Jab oben – Jab unten im Wechsel.',
    quiet: true, bag: true, cam: { az: 60, el: 8 },
    phases: [{ t: 0, text: 'Knie beugen, Ebene wechseln.' }, { t: 0.21, text: 'Treffer auf Bauchhöhe.' }],
  },
  {
    id: 'upper-lead', clip: 'upperL', code: '5', belt: 2, cat: 'punch',
    name: 'Führhand-Uppercut', alias: 'Lead Uppercut', say: 'Fünf',
    what: 'Aufwärtshaken der vorderen Hand – aus einem kurzen Absinken nach oben.',
    when: 'Auf kurzer Distanz, wenn der Gegner sich nach vorn beugt.',
    cues: ['Kurz über das vordere Knie absinken, die Faust nur leicht senken.', 'Aus den Beinen hochdrücken – die Faust fährt senkrecht zum Kinn des Gegners.', 'Handfläche zeigt zu dir.'],
    mistakes: ['Die Hand weit fallen lassen und ausholen.'],
    drill: '3 × 30 Sekunden: 5-2 langsam, dann 1-2-5-2.',
    quiet: true, bag: true, cam: { az: 55, el: 6 },
    phases: [{ t: 0, text: 'Kurz absinken.' }, { t: 0.1, text: 'Aus den Beinen nach oben.' }, { t: 0.2, text: 'Treffer unter dem Kinn.' }],
  },
  {
    id: 'upper-rear', clip: 'upperR', code: '6', belt: 2, cat: 'punch',
    name: 'Schlaghand-Uppercut', alias: 'Rear Uppercut', say: 'Sechs',
    what: 'Aufwärtshaken der hinteren Hand mit voller Hüftdrehung.',
    when: 'In der Nahdistanz, oft nach einem Führhand-Haken.',
    cues: ['Über das hintere Knie absinken.', 'Hintere Ferse und Hüfte drehen – die Faust steigt senkrecht.', 'Führhand bleibt an der Wange.'],
    mistakes: ['Nach vorn fallen, statt aufrecht zu bleiben.'],
    drill: '3 × 30 Sekunden: 6-3-2 langsam, auf die Drehung achten.',
    quiet: true, bag: true, cam: { az: -40, el: 6 },
    phases: [{ t: 0, text: 'Absinken über das hintere Bein.' }, { t: 0.21, text: 'Treffer: Hüfte hat eingedreht.' }],
  },
  {
    id: 'cross-body', clip: 'crossBody', code: '2b', belt: 2, cat: 'punch',
    name: 'Cross zum Körper', alias: 'Body Cross', say: 'Cross Körper',
    what: 'Gerade der hinteren Hand zum Bauch, Ebene aus den Beinen gewechselt.',
    when: 'Um die Deckung zu öffnen – danach Haken zum Kopf.',
    cues: ['Tief in die Knie, Kopf seitlich neben der eigenen Faust.', 'Hüfte und Ferse drehen voll ein.', 'Sofort wieder in die Stellung hoch.'],
    mistakes: ['Kopf vor die Hände schieben.'],
    drill: '3 × 30 Sekunden: 1-2b-3.',
    quiet: true, bag: true, cam: { az: -50, el: 8 },
    phases: [{ t: 0, text: 'Ebene wechseln.' }, { t: 0.23, text: 'Treffer auf Bauchhöhe.' }],
  },
  {
    id: 'roll', clip: 'roll', code: 'RL', belt: 2, cat: 'defense',
    name: 'Abtauchen', alias: 'Roll / Bob & Weave', say: 'Abtauchen',
    what: 'Unter einem Haken in einem U-Bogen durchtauchen.',
    when: 'Gegen Haken; man taucht auf der anderen Seite in Konterposition auf.',
    cues: ['Mit den Knien runter, nicht mit dem Rücken.', 'Kopf beschreibt ein flaches U von einer Seite zur anderen.', 'Die Augen verlieren den Gegner nicht.'],
    mistakes: ['Nach vorn beugen und Blick auf den Boden.'],
    drill: '3 × 30 Sekunden: Abtauchen – Haken – Cross.',
    quiet: true, bag: false, cam: { az: 5, el: 10 },
    phases: [{ t: 0, text: 'Knie beugen, Kopf geht zur Seite runter.' }, { t: 0.16, text: 'Unten durch …' }, { t: 0.34, text: '… auf der anderen Seite auftauchen.' }],
  },
  {
    id: 'parry', clip: 'parry', code: 'PR', belt: 2, cat: 'defense',
    name: 'Parade', alias: 'Parry', say: 'Parieren',
    what: 'Den Jab mit der hinteren Hand kurz zur Seite wischen.',
    when: 'Gegen den Jab – kostet kaum Kraft und öffnet den Cross.',
    cues: ['Nur eine kleine Handbewegung, wie eine Fliege wegwischen.', 'Die Hand kommt sofort an die Wange zurück.', 'Danach direkt mit der Schlaghand kontern.'],
    mistakes: ['Der Schlag wird angeflogen, statt ihn kommen zu lassen.'],
    drill: '3 × 30 Sekunden: Parieren – Cross.',
    quiet: true, bag: false, cam: { az: 20, el: 10 },
    phases: [{ t: 0, text: 'Kurz, klein, schnell.' }],
  },
  {
    id: 'lowkick', clip: 'lowkick', code: 'LK', belt: 2, cat: 'kick',
    name: 'Lowkick', alias: 'Schlagbein auf den Oberschenkel', say: 'Lowkick',
    what: 'Halbkreistritt mit dem hinteren Bein auf den Oberschenkel, getroffen wird mit dem Schienbein.',
    when: 'Nach einer Handkombination, wenn der Gegner die Deckung hochnimmt.',
    cues: ['Vorderer Fuß dreht nach außen, bevor das Bein kommt.', 'Die Hüfte dreht durch – das Schienbein schneidet durch den Oberschenkel.', 'Führhand bleibt oben, die hintere Hand schwingt als Gegengewicht nach hinten.'],
    mistakes: ['Mit dem Fuß statt dem Schienbein treffen.', 'Das Standbein bleibt stehen, die Hüfte kann nicht drehen.'],
    safety: 'Schienbein nicht an harten Gegenständen „abhärten“ – das bringt nur Verletzungen.',
    drill: '3 × 45 Sekunden: langsam je Seite, dann 1-2-Lowkick.',
    quiet: true, bag: false, cam: { az: -60, el: 14 },
    phases: [{ t: 0, text: 'Vorderen Fuß ausdrehen.' }, { t: 0.1, text: 'Hüfte dreht, das Bein folgt.' }, { t: 0.32, text: 'Treffer mit dem Schienbein.' }, { t: 0.45, text: 'Auf gleichem Weg zurück.' }],
  },
  {
    id: 'hook-body', clip: 'hookBody', code: '3b', belt: 3, cat: 'punch',
    name: 'Leberhaken', alias: 'Führhand-Haken zum Körper', say: 'Leber',
    what: 'Führhand-Haken auf die rechte Körperseite des Gegners – eine der wirkungsvollsten Techniken.',
    when: 'Nach einem Schlag zum Kopf, wenn die Ellbogen hochgehen.',
    cues: ['Über das vordere Knie absinken, Ellbogen dicht am Körper.', 'Die Drehung aus dem vorderen Fuß schiebt die Faust unter den Rippenbogen.', 'Direkt danach wieder hoch in die Deckung.'],
    mistakes: ['Nach vorn beugen und den Kopf zeigen.'],
    drill: '3 × 30 Sekunden: 3b-3 (Körper, dann Kopf).',
    quiet: true, bag: true, cam: { az: 25, el: 10 },
    phases: [{ t: 0, text: 'Absinken, Ellbogen eng.' }, { t: 0.21, text: 'Treffer unter die Rippen.' }],
  },
  {
    id: 'bodykick', clip: 'bodykick', code: 'MK', belt: 3, cat: 'kick',
    name: 'Middlekick', alias: 'Körpertritt Schlagbein', say: 'Middle',
    what: 'Halbkreistritt mit dem hinteren Bein auf Rippen und Arme.',
    when: 'Aus der Distanz, nach Handkombinationen oder als Konter.',
    cues: ['Vorderer Fuß dreht weit aus, die Ferse zeigt zum Gegner.', 'Hüfte dreht ganz durch, das Bein schwingt wie ein Baseballschläger.', 'Das Schienbein trifft, die Führhand schützt das Gesicht.'],
    mistakes: ['Oberkörper fällt nach hinten weg.', 'Tritt stoppt vor dem Ziel.'],
    drill: '3 × 45 Sekunden je Seite, zuerst langsam mit Halt am Treffpunkt.',
    quiet: true, bag: false, space: 'medium', cam: { az: -55, el: 12 },
    phases: [{ t: 0, text: 'Vorderen Fuß ausdrehen.' }, { t: 0.23, text: 'Hüfte dreht voll durch.' }, { t: 0.34, text: 'Treffer auf Rippenhöhe.' }],
  },
  {
    id: 'check', clip: 'check', code: 'CK', belt: 3, cat: 'defense',
    name: 'Check', alias: 'Schienbeinblock', say: 'Check',
    what: 'Vorderes Knie heben und das Schienbein dem Lowkick entgegenhalten.',
    when: 'Gegen Low- und Middlekicks auf das vordere Bein.',
    cues: ['Knie hoch und leicht nach außen, Zehen zeigen schräg nach außen.', 'Schienbein schräg nach vorn, Ellbogen und Knie schließen die Lücke.', 'Sofort wieder absetzen und kontern.'],
    mistakes: ['Nur den Fuß heben – das Knie muss hoch.'],
    drill: '3 × 30 Sekunden: Check – Cross – Lowkick.',
    quiet: true, bag: false, cam: { az: 55, el: 8 },
    phases: [{ t: 0, text: 'Knie hoch und leicht nach außen.' }],
  },
  {
    id: 'knee', clip: 'knee', code: 'KN', belt: 3, cat: 'knee',
    name: 'Knie', alias: 'Gerades Knie Schlagbein', say: 'Knie',
    what: 'Das hintere Knie fährt mit Hüfteinsatz gerade nach vorn und oben.',
    when: 'Auf kurzer Distanz, wenn der Gegner nach vorn kommt.',
    cues: ['Hüfte schiebt nach vorn, der Oberkörper bleibt aufrecht.', 'Zehen strecken, das Knie ist die Spitze.', 'Hände ziehen nach unten, als würdest du den Kopf des Gegners führen.'],
    mistakes: ['Nach vorn beugen statt die Hüfte zu schieben.'],
    drill: '3 × 30 Sekunden: Knie im Wechsel, zum Schluss 10 schnelle.',
    quiet: true, bag: true, cam: { az: 70, el: 8 },
    phases: [{ t: 0, text: 'Hände greifen vor.' }, { t: 0.26, text: 'Treffer mit der Kniespitze.' }],
  },
  {
    id: 'pivot', clip: 'pivot', code: 'PV', belt: 3, cat: 'footwork',
    name: 'Pivot', alias: 'Drehschritt', say: 'Drehen',
    what: 'Auf dem vorderen Fußballen drehen – der hintere Fuß schwingt herum, der Winkel ändert sich.',
    when: 'Nach einem Haken oder wenn man in die Ecke gedrängt wird.',
    cues: ['Der vordere Fußballen ist die Achse.', 'Der hintere Fuß schwingt wie ein Zirkel herum.', 'Nach der Drehung sofort wieder in Stellung.'],
    mistakes: ['Auf der Ferse drehen.'],
    drill: '3 × 45 Sekunden: 3 – Pivot – 2.',
    quiet: true, bag: false, space: 'small', cam: { az: 0, el: 55 },
    phases: [{ t: 0, text: 'Drehen auf dem vorderen Ballen.' }],
  },
  {
    id: 'highkick', clip: 'highkick', code: 'HK', belt: 4, cat: 'kick',
    name: 'Highkick', alias: 'Kopftritt Schlagbein', say: 'High',
    what: 'Halbkreistritt zum Kopf – braucht Beweglichkeit und Balance.',
    when: 'Wenn der Gegner die Deckung nach unten nimmt, z. B. nach Körpertreffern.',
    cues: ['Auf dem vorderen Fußballen aufrichten, die Ferse zeigt nach vorn.', 'Hüfte klappt über, das Knie zeigt zuerst nach oben.', 'Blick hinter die Führhand – nicht wegdrehen.'],
    mistakes: ['Kraft vor Beweglichkeit: erst hoch, wenn die Hüfte mitmacht.'],
    safety: 'Nur gut aufgewärmt. Die Mobility-Routinen helfen hier direkt.',
    drill: '3 × 30 Sekunden je Seite: langsam, Bein oben kurz halten.',
    quiet: true, bag: false, space: 'medium', cam: { az: -55, el: 12 },
    phases: [{ t: 0, text: 'Vorderen Fuß weit ausdrehen.' }, { t: 0.25, text: 'Knie hoch, Hüfte klappt über.' }, { t: 0.37, text: 'Treffer auf Kopfhöhe.' }],
  },
  {
    id: 'switchkick', clip: 'switchkick', code: 'SK', belt: 4, cat: 'kick',
    name: 'Switch-Kick', alias: 'Wechseltritt Führbein', say: 'Switch',
    what: 'Füße blitzschnell wechseln und mit dem vorderen Bein als Halbkreistritt zum Körper treten.',
    when: 'Um mit dem schwächeren Bein genauso hart zu treffen – der Gegner erwartet es nicht.',
    cues: ['Der Wechsel ist klein und flach, kein Sprung.', 'Aus dem Wechsel direkt drehen – kein Stopp dazwischen.', 'Treffer mit dem Schienbein, Deckung oben.'],
    mistakes: ['Großer Hüpfer, der alles ankündigt.'],
    drill: '3 × 30 Sekunden: Wechsel ohne Tritt, dann mit.',
    quiet: false, bag: false, space: 'medium', cam: { az: 55, el: 12 },
    phases: [{ t: 0, text: 'Füße wechseln.' }, { t: 0.14, text: 'Sofort drehen.' }, { t: 0.38, text: 'Treffer auf Rippenhöhe.' }],
  },
  {
    id: 'feint', clip: 'feint', code: 'FT', belt: 4, cat: 'punch',
    name: 'Finte', alias: 'Jab-Täuschung', say: 'Finte',
    what: 'Angedeuteter Jab, der eine Reaktion auslöst – die eigentliche Technik folgt.',
    when: 'Um Deckung und Rhythmus des Gegners zu verschieben.',
    cues: ['Schulter und Faust zucken nur kurz nach vorn.', 'Glaubwürdig: dieselbe Bewegung wie beim echten Jab.', 'Direkt die geplante Technik hinterher.'],
    mistakes: ['Zu langsam – dann ist es kein Täuschen, sondern Warten.'],
    drill: '3 × 30 Sekunden: Finte – Cross – Lowkick.',
    quiet: true, bag: false, cam: { az: 40, el: 6 },
    phases: [{ t: 0, text: 'Kurzes Zucken.' }],
  },
  {
    id: 'step-jab', clip: 'stepJab', code: 'SJ', belt: 4, cat: 'punch',
    name: 'Schritt-Jab', alias: 'Step Jab', say: 'Schritt Jab',
    what: 'Der Jab wird mit einem Schritt vorwärts geschlagen – überbrückt Distanz.',
    when: 'Wenn der Gegner knapp außer Reichweite steht.',
    cues: ['Faust und vorderer Fuß starten gleichzeitig.', 'Die Faust trifft, bevor der Fuß aufsetzt.', 'Der hintere Fuß zieht sofort nach.'],
    mistakes: ['Erst Schritt, dann Schlag – das ist zu spät.'],
    drill: '3 × 30 Sekunden: Schritt-Jab – Cross, dann zurück.',
    quiet: true, bag: false, space: 'small', cam: { az: 80, el: 8 },
    phases: [{ t: 0, text: 'Faust und Fuß gleichzeitig.' }, { t: 0.14, text: 'Treffer im Schritt.' }],
  },
  {
    id: 'teep-rear', clip: 'teepR', code: 'TR', belt: 5, cat: 'kick',
    name: 'Teep hinten', alias: 'Frontkick Schlagbein', say: 'Teep hinten',
    what: 'Stoßtritt mit dem hinteren Bein – mehr Wucht, etwas langsamer.',
    when: 'Um einen anstürmenden Gegner zu stoppen.',
    cues: ['Knie zur Brust, Hüfte kommt nach vorn.', 'Durch den Bauch stoßen, nicht treten.', 'Zurück in die Ausgangsstellung, nicht vorn absetzen.'],
    mistakes: ['Nach dem Tritt vorne landen und die Auslage verlieren.'],
    drill: '3 × 30 Sekunden: Teep hinten – Cross.',
    quiet: true, bag: false, cam: { az: -80, el: 6 },
    phases: [{ t: 0, text: 'Knie hoch.' }, { t: 0.3, text: 'Treffer mit dem Ballen.' }],
  },
  {
    id: 'backfist', clip: 'backfist', code: 'BF', belt: 5, cat: 'punch',
    name: 'Drehschlag', alias: 'Spinning Backfist', say: 'Drehschlag',
    what: 'Ganze Drehung nach hinten, der Handrücken der hinteren Hand trifft am Ende.',
    when: 'Selten und überraschend – z. B. nach einem verfehlten Tritt.',
    cues: ['Der Kopf dreht zuerst und sucht das Ziel über die Schulter.', 'Der Arm schwingt erst ganz am Ende aus.', 'Nach der Drehung sofort Deckung.'],
    mistakes: ['Blind drehen, ohne das Ziel zu sehen.'],
    safety: 'Nur mit freiem Platz üben – im kleinen Zimmer langsam.',
    drill: '5 langsame Drehungen je Durchgang, dann erst Tempo.',
    quiet: true, bag: false, space: 'medium', cam: { az: 15, el: 20 },
    phases: [{ t: 0, text: 'Kopf dreht zuerst.' }, { t: 0.32, text: 'Arm schwingt aus.' }, { t: 0.4, text: 'Treffer mit dem Handrücken.' }],
  },
];

export const TECH = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t]));
export const TECH_BY_CODE = Object.fromEntries(TECHNIQUES.map((t) => [t.code, t]));
export function clipOf(id) {
  const tech = TECH[id];
  const clip = CLIPS[tech?.clip || id];
  if (clip && !clip.id) clip.id = tech?.clip || id;
  return clip;
}
export const CATEGORY_LABEL = {
  stance: 'Stellung', footwork: 'Beinarbeit', punch: 'Schläge', defense: 'Abwehr', kick: 'Tritte', knee: 'Knie',
};

// ---------- Kombinationen ----------
// Schreibweise mit Kürzeln: 1 Jab · 2 Cross · 3 Führhand-Haken · 4 Schlaghand-
// Haken · 5/6 Uppercuts · b = zum Körper · Tritte/Abwehr mit Buchstaben.
export const COMBOS = [
  { id: 'c1', belt: 0, seq: ['jab'] },
  { id: 'c11', belt: 0, seq: ['jab', 'jab'] },
  { id: 'c12', belt: 0, seq: ['jab', 'cross'] },
  { id: 'c112', belt: 0, seq: ['jab', 'jab', 'cross'] },
  { id: 'c212', belt: 0, seq: ['cross', 'jab', 'cross'] },
  { id: 'cpb2', belt: 0, seq: ['pullback', 'cross'], tag: 'counter' },
  { id: 'c12bl', belt: 0, seq: ['jab', 'cross', 'block'], tag: 'counter' },
  { id: 'c123', belt: 1, seq: ['jab', 'cross', 'hook-lead'] },
  { id: 'c1232', belt: 1, seq: ['jab', 'cross', 'hook-lead', 'cross'] },
  { id: 'c32', belt: 1, seq: ['hook-lead', 'cross'] },
  { id: 'c13', belt: 1, seq: ['jab', 'hook-lead'] },
  { id: 'c34', belt: 1, seq: ['hook-lead', 'hook-rear'] },
  { id: 'c12tp', belt: 1, seq: ['jab', 'cross', 'teep'] },
  { id: 'csl2', belt: 1, seq: ['slip', 'cross'], tag: 'counter' },
  { id: 'c1b2', belt: 1, seq: ['jab-body', 'cross'] },
  { id: 'c11b', belt: 1, seq: ['jab', 'jab-body'] },
  { id: 'c1252', belt: 2, seq: ['jab', 'cross', 'upper-lead', 'cross'] },
  { id: 'c632', belt: 2, seq: ['upper-rear', 'hook-lead', 'cross'] },
  { id: 'c12lk', belt: 2, seq: ['jab', 'cross', 'lowkick'] },
  { id: 'c23lk', belt: 2, seq: ['cross', 'hook-lead', 'lowkick'] },
  { id: 'crl32', belt: 2, seq: ['roll', 'hook-lead', 'cross'], tag: 'counter' },
  { id: 'cpr2', belt: 2, seq: ['parry', 'cross'], tag: 'counter' },
  { id: 'c12b3', belt: 2, seq: ['jab', 'cross-body', 'hook-lead'] },
  { id: 'c123mk', belt: 3, seq: ['jab', 'cross', 'hook-lead', 'bodykick'] },
  { id: 'c3b3', belt: 3, seq: ['hook-body', 'hook-lead'] },
  { id: 'cck2', belt: 3, seq: ['check', 'cross'], tag: 'counter' },
  { id: 'ctp23', belt: 3, seq: ['teep', 'cross', 'hook-lead'] },
  { id: 'c12kn', belt: 3, seq: ['jab', 'cross', 'knee'] },
  { id: 'c3pv2', belt: 3, seq: ['hook-lead', 'pivot', 'cross'] },
  { id: 'c2mk', belt: 3, seq: ['cross', 'hook-lead', 'bodykick'] },
  { id: 'cft2lk', belt: 4, seq: ['feint', 'cross', 'lowkick'] },
  { id: 'csj2hk', belt: 4, seq: ['step-jab', 'cross', 'highkick'] },
  { id: 'c123sk', belt: 4, seq: ['jab', 'cross', 'hook-lead', 'switchkick'] },
  { id: 'csk23', belt: 4, seq: ['switchkick', 'cross', 'hook-lead'] },
  { id: 'clk2hk', belt: 4, seq: ['lowkick', 'cross', 'highkick'] },
  { id: 'c1b3bhk', belt: 5, seq: ['jab-body', 'hook-body', 'highkick'] },
  { id: 'cmkbf', belt: 5, seq: ['bodykick', 'backfist'] },
  { id: 'ctr23', belt: 5, seq: ['teep-rear', 'hook-lead', 'cross'] },
  { id: 'cck2lk', belt: 5, seq: ['check', 'cross', 'hook-lead', 'lowkick'], tag: 'counter' },
  { id: 'cm1', belt: 6, seq: ['jab', 'cross', 'hook-body', 'hook-lead', 'cross', 'lowkick'] },
  { id: 'cm2', belt: 6, seq: ['feint', 'upper-rear', 'hook-lead', 'switchkick'] },
];

// Anzeige- und Sprechform einer Kombination
export function comboLabel(seq) {
  return seq.map((id) => TECH[id]?.code || '?').join(' – ');
}

export function comboSpeech(seq, style = 'mixed') {
  return seq.map((id) => {
    const t = TECH[id];
    if (!t) return '';
    const numeric = /^\d$/.test(t.code);
    if (style === 'numbers' && numeric) return ['', 'Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs'][+t.code];
    if (style === 'mixed' && numeric) return ['', 'Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs'][+t.code];
    return t.say;
  }).join(', ');
}

// ---------- Gürtel ----------
export const BELTS = [
  { id: 'white', name: 'Weißgurt', short: 'Weiß', color: '#f1f1f1', ink: '#141414', minDays: 7, focus: 'Stellung, Beinarbeit und die geraden Schläge' },
  { id: 'yellow', name: 'Gelbgurt', short: 'Gelb', color: '#ffd21f', ink: '#1a1400', minDays: 14, focus: 'Haken, Ausweichen und der erste Tritt' },
  { id: 'orange', name: 'Orangegurt', short: 'Orange', color: '#ff8a1f', ink: '#1c0d00', minDays: 21, focus: 'Uppercuts, Körpertreffer, Abtauchen und Lowkick' },
  { id: 'green', name: 'Grüngurt', short: 'Grün', color: '#27c24c', ink: '#021507', minDays: 28, focus: 'Leberhaken, Middlekick, Check und Knie' },
  { id: 'blue', name: 'Blaugurt', short: 'Blau', color: '#2d6bff', ink: '#fff', minDays: 35, focus: 'Highkick, Switch-Kick und Täuschungen' },
  { id: 'brown', name: 'Braungurt', short: 'Braun', color: '#8b5a2b', ink: '#fff', minDays: 42, focus: 'Drehschlag, Teep hinten und schwere Konter' },
  { id: 'black', name: 'Schwarzgurt', short: 'Schwarz', color: '#141414', ink: '#fff', minDays: 0, focus: 'Alles sitzt – jetzt wird verfeinert' },
];

export function techniquesOfBelt(i) { return TECHNIQUES.filter((t) => t.belt === i); }
export function combosOfBelt(i) { return COMBOS.filter((c) => c.belt === i); }
