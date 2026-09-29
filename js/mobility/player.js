// Mobility-Player 2.0: geführter Ablauf mit 3D-Figur, Atemring,
// Anspannen-Loslassen mit Ansage, Wiederholungen bei aktiven Übungen,
// „Zwickt heute“ und Übung tauschen. Am Ende eine kurze Bewertung, aus der
// die App schwerere oder leichtere Varianten vorschlägt.

import { Store, uid } from '../storage.js';
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { escapeHtml, plural } from '../utils.js';
import { exercise, REGION, alternativesFor } from './library.js';
import { PNF, PNF_SECONDS, SWITCH_SECONDS } from './plans.js';
import {
  prepSeconds, weekStats, recordRatings, setLevel, skipRegionToday, regionsOfItems, COUNT_MIN_SECONDS,
} from './state.js';
import { stageFor, thumb, fillThumbs } from './figures.js';

let ctx = null;
export function initPlayer(context) { ctx = context; }

const qs = (sel, parent = document) => parent.querySelector(sel);
const qsa = (sel, parent = document) => [...parent.querySelectorAll(sel)];
const RING = 2 * Math.PI * 52;
const mins = (sec) => `${Math.max(1, Math.round(sec / 60))} Min`;

// ---------- Ansage ----------
let germanVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  germanVoice = voices.find((v) => v.lang === 'de-DE' && /Anna|Helena|Petra|Markus|Google/i.test(v.name))
    || voices.find((v) => v.lang?.startsWith('de')) || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}
function say(text, { rate = 1.0 } = {}) {
  if (!Store.getSettings().mobilityVoice || !('speechSynthesis' in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = rate;
    if (germanVoice) u.voice = germanVoice;
    speechSynthesis.speak(u);
  } catch { /* ohne Ansage weiter */ }
}

// ---------- Bildschirm anlassen ----------
let lock = null;
async function holdScreen() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { lock = await navigator.wakeLock.request('screen'); } catch { lock = null; }
}
function releaseScreen() {
  if (lock && !lock.released) lock.release().catch(() => {});
  lock = null;
}

// ---------- Ablauf ----------
function modeOf(item, ex) {
  if (item.mode) return item.mode;
  if (ex.kind === 'breath') return 'breath';
  if (ex.kind === 'active') return 'active';
  return ex.type === 'hold' ? 'hold' : 'flow';
}

function buildSteps(items, prep) {
  const steps = [];
  items.forEach((item, index) => {
    const ex = exercise(item.id);
    if (!ex) return;
    const mode = modeOf(item, ex);
    const duration = mode === 'pnf' ? PNF_SECONDS : item.seconds;
    steps.push({ kind: 'prep', ex, item, index, side: 'L', mode, duration: prep });
    (ex.sides ? ['L', 'R'] : ['L']).forEach((side, si) => {
      if (si > 0) steps.push({ kind: 'switch', ex, item, index, side, mode, duration: SWITCH_SECONDS });
      steps.push({ kind: 'work', ex, item, index, side, mode, duration });
    });
  });
  return steps;
}

// Unterphase beim Anspannen-Loslassen
function pnfPhase(t) {
  const cycle = PNF.stretch + PNF.contract + PNF.relax;
  const c = Math.floor(t / cycle);
  if (c >= PNF.cycles) return { k: 'final', c: PNF.cycles, left: PNF_SECONDS - t };
  const u = t - c * cycle;
  if (u < PNF.stretch) return { k: 'stretch', c, left: PNF.stretch - u };
  if (u < PNF.stretch + PNF.contract) return { k: 'contract', c, left: PNF.stretch + PNF.contract - u };
  return { k: 'relax', c, left: cycle - u };
}

let P = null;

export function startRoutine(routine) {
  if (!routine || P) return;
  const items = routine.items.filter((x) => exercise(x.id));
  if (!items.length) return;
  const settings = Store.getSettings();
  if (routine.id) Store.saveSettings({ ...settings, mobilityLastRoutine: routine.id });
  const steps = buildSteps(items, prepSeconds());

  const el = document.createElement('div');
  el.className = 'mzp';
  el.innerHTML = `
    <header class="mzp-top">
      <button class="mz-round" data-p="close" aria-label="Beenden">${Icon.close}</button>
      <div class="mzp-title"><strong>${escapeHtml(routine.name)}</strong><span id="mzp-left"></span></div>
      <button class="mz-round" data-p="voice" aria-label="Sprachansage">${settings.mobilityVoice ? Icon.voiceOn : Icon.voiceOff}</button>
    </header>
    <div class="mzp-segs"></div>
    <div class="mzp-stage">
      <span class="mzp-section" id="mzp-section"></span>
      <span class="mzp-side" id="mzp-side"></span>
      <button class="mzp-chip left" data-p="pinch">${Icon.info} Zwickt heute</button>
      <button class="mzp-chip right" data-p="swap">${Icon.swap} Tauschen</button>
    </div>
    <div class="mzp-info">
      <div class="mzp-phase" id="mzp-phase"></div>
      <h2 class="mzp-name" id="mzp-name"></h2>
      <p class="mzp-cue" id="mzp-cue"></p>
      <div class="mzp-sub" id="mzp-sub"></div>
    </div>
    <div class="mzp-controls">
      <button class="mzp-ctrl" data-p="prev" aria-label="Zurück">${Icon.skipBack}</button>
      <button class="mzp-ring" data-p="toggle" aria-label="Pause">
        <span class="mzp-breath" id="mzp-breath"></span>
        <svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" id="mzp-ring" cx="60" cy="60" r="52" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
        <span class="mzp-time" id="mzp-time"></span>
        <span class="mzp-state" id="mzp-state"></span>
      </button>
      <button class="mzp-ctrl" data-p="next" aria-label="Weiter">${Icon.skipForward}</button>
    </div>
    <div class="mzp-next" id="mzp-next"></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));

  P = {
    el, routine: { ...routine, items }, steps, i: 0,
    stepStart: performance.now(), figureStart: performance.now(), paused: false, pausedElapsed: 0,
    done: {}, startedAt: new Date().toISOString(), lastWhole: null, cueIndex: -1, sub: null, stage: null, shown: null,
    dom: {
      time: qs('#mzp-time', el), ring: qs('#mzp-ring', el), state: qs('#mzp-state', el), breath: qs('#mzp-breath', el),
      sub: qs('#mzp-sub', el), left: qs('#mzp-left', el), phase: qs('#mzp-phase', el),
    },
  };
  buildSegments();
  Sound.start();
  holdScreen();
  enterStep(true);
  bind();
  stageFor('player').then((s) => {
    if (!P || P.el !== el) return;
    s.stop();
    s.mount(qs('.mzp-stage', el));
    s.onInteract = () => qs('.mzp-stage', el)?.classList.add('touched');
    P.stage = s;
    P.shown = null;
    showFigure();
  });
  loop();
}

function buildSegments() {
  const p = P;
  const n = p.routine.items.length;
  const totals = Array.from({ length: n }, (_, i) => p.steps.filter((s) => s.index === i).reduce((a, s) => a + s.duration, 0));
  p.totals = totals;
  qs('.mzp-segs', p.el).innerHTML = totals.map((t, i) => `<span style="flex:${t}" data-i="${i}"><i></i></span>`).join('');
  p.dom.segs = qsa('.mzp-segs i', p.el);
}

function elapsed() {
  return P.paused ? P.pausedElapsed : (performance.now() - P.stepStart) / 1000;
}

function showFigure() {
  const p = P;
  if (!p?.stage) return;
  const step = p.steps[p.i];
  const key = `${step.ex.id}:${step.side}`;
  if (p.shown === key) return;
  const first = p.shown === null;
  p.shown = key;
  const box = qs('.mzp-stage', p.el);
  if (first || ctx.prefersReducedMotion()) { p.stage.setExercise(step.ex, step.side); return; }
  box.classList.add('swap');
  setTimeout(() => {
    if (!P || P !== p) return;
    p.stage.setExercise(step.ex, step.side);
    box.classList.remove('swap');
  }, 200);
}

function enterStep(first = false) {
  const p = P;
  const step = p.steps[p.i];
  const prev = p.steps[p.i - 1];
  p.stepStart = performance.now();
  p.pausedElapsed = 0;
  p.lastWhole = null;
  p.cueIndex = -1;
  p.sub = null;
  p.lastRep = null;
  if (step.kind !== 'work' || !prev || prev.side !== step.side || prev.index !== step.index) p.figureStart = performance.now();
  showFigure();
  const ex = step.ex;
  const total = p.routine.items.length;
  qs('#mzp-name', p.el).textContent = ex.name;
  const side = qs('#mzp-side', p.el);
  side.textContent = ex.sides ? (step.side === 'L' ? 'Linke Seite' : 'Rechte Seite') : '';
  side.hidden = !ex.sides;
  const section = qs('#mzp-section', p.el);
  section.textContent = step.item.section || '';
  section.hidden = !step.item.section;
  const modeText = { hold: 'Halten', flow: 'Bewegen', pnf: 'Anspannen-Loslassen', active: 'Aktiv', breath: 'Atmen' }[step.mode];
  p.dom.phase.textContent = {
    prep: `Gleich · ${step.index + 1} von ${total}`,
    switch: 'Seite wechseln',
    work: `${step.index + 1} von ${total} · ${modeText}`,
  }[step.kind];
  p.el.dataset.kind = step.kind;
  p.el.dataset.mode = step.mode;
  p.el.classList.toggle('paused', p.paused);
  // Vorschau auf die nächste Übung
  const nextItem = p.routine.items[step.index + 1];
  qs('#mzp-next', p.el).innerHTML = nextItem ? `<span>Danach</span>${thumb(nextItem.id, 'tiny')}<strong>${escapeHtml(exercise(nextItem.id).name)}</strong>` : '<span>Letzte Übung</span>';
  fillThumbs(qs('#mzp-next', p.el));
  updateCue(true);

  if (step.kind === 'prep') {
    Sound.bell();
    const how = step.mode === 'pnf' ? ' Mit Anspannen und Loslassen.' : step.mode === 'active' ? ' Aktiv, mit Kraft.' : '';
    say(`${first ? 'Los geht’s. ' : 'Als Nächstes: '}${ex.name}${ex.sides ? ', linke Seite' : ''}.${how}`);
  } else if (step.kind === 'switch') {
    Sound.bell();
    say('Seite wechseln.');
  } else {
    Sound.go();
  }
}

function updateCue(force) {
  const p = P;
  const step = p.steps[p.i];
  const cues = step.ex.cues;
  let index;
  if (step.kind === 'prep') index = 0;
  else if (step.kind === 'switch') index = -2;
  else index = Math.min(cues.length - 1, Math.floor(elapsed() / Math.max(8, step.duration / cues.length)));
  if (!force && index === p.cueIndex) return;
  p.cueIndex = index;
  const el = qs('#mzp-cue', p.el);
  const text = index === -2 ? 'Kurz lockern und auf die andere Seite wechseln.' : cues[index];
  if (el.textContent === text) return;
  if (ctx.prefersReducedMotion()) { el.textContent = text; return; }
  el.classList.add('fade');
  setTimeout(() => { el.textContent = text; el.classList.remove('fade'); }, 160);
}

// Anzeige unter dem Namen: Atem, Anspannen-Loslassen oder Wiederholungen
function updateSub(step, t, figT) {
  const p = P;
  const d = p.dom;
  let key = '';
  let html = '';
  let scale = 1;
  if (step.kind !== 'work') {
    key = 'none';
  } else if (step.mode === 'pnf') {
    const ph = pnfPhase(t);
    key = `${ph.k}:${ph.c}`;
    const label = { stretch: ph.c === 0 ? 'Dehnen' : 'Tiefer halten', contract: 'Anspannen', relax: 'Loslassen', final: 'Letztes Mal tiefer' }[ph.k];
    html = `<b class="pnf-${ph.k}">${label}</b><span>${Math.ceil(ph.left)} s · Durchgang ${Math.min(ph.c + 1, PNF.cycles)}/${PNF.cycles}</span>`;
    scale = ph.k === 'contract' ? 0.9 : ph.k === 'relax' ? 1.08 : 1;
    if (key !== p.sub && !p.paused) {
      if (ph.k === 'contract') { Sound.tick(); say(ph.c === 0 ? `Anspannen. ${step.ex.pnf || 'Sanft gegen den Widerstand drücken, etwa 30 Prozent.'}` : 'Anspannen.', { rate: 1.05 }); }
      else if (ph.k === 'relax') say('Loslassen.', { rate: 1.05 });
      else if (ph.k === 'stretch' && ph.c > 0) say('Tiefer sinken. Halten.', { rate: 1.05 });
      else if (ph.k === 'final') say('Letztes Mal tiefer. Ruhig halten.', { rate: 1.05 });
    }
  } else if (step.mode === 'active') {
    const loop = step.ex.loop || 5;
    const reps = Math.max(1, Math.round(step.duration / loop));
    const rep = Math.min(reps, Math.floor(figT / loop) + 1);
    key = `rep:${rep}`;
    html = `<b>Wiederholung ${rep}</b><span>von ${reps} · ${escapeHtml(step.ex.tempo || 'kontrolliert')}</span>`;
    if (key !== p.sub && !p.paused && rep > 1) say(String(rep), { rate: 1.1 });
  } else if (step.mode === 'breath') {
    const ph = figT % 10;
    const inhale = ph < 4;
    key = inhale ? 'in' : 'out';
    html = `<b>${inhale ? 'Einatmen' : 'Ausatmen'}</b><span>${inhale ? '4 Sekunden durch die Nase' : '6 Sekunden, ganz langsam'}</span>`;
    scale = inhale ? 1 + 0.18 * (ph / 4) : 1.18 - 0.18 * ((ph - 4) / 6);
  } else if (step.ex.breath) {
    const ph = figT % 5;
    const exhale = ph < 3;
    key = exhale ? 'out' : 'in';
    html = `<b>${exhale ? 'Ausatmen' : 'Einatmen'}</b><span>${exhale ? 'und tiefer sinken' : 'ruhig halten'}</span>`;
    scale = exhale ? 1.14 - 0.14 * (ph / 3) : 1 + 0.14 * ((ph - 3) / 2);
  } else {
    key = 'tempo';
    html = `<b>Bewegen</b><span>${escapeHtml(step.ex.tempo || 'Ruhig und kontrolliert')}</span>`;
  }
  d.breath.style.transform = `scale(${scale})`;
  if (key === p.sub) return;
  p.sub = key;
  d.sub.innerHTML = html;
  d.sub.classList.toggle('on', !!html);
}

function loop() {
  const p = P;
  if (!p) return;
  const step = p.steps[p.i];
  const t = elapsed();
  const remaining = Math.max(0, step.duration - t);
  const d = p.dom;
  d.time.textContent = fmt(Math.ceil(remaining - 0.001));
  d.ring.style.strokeDashoffset = String(RING * (1 - Math.min(1, t / step.duration)));
  if (d.stateIcon !== p.paused) { d.stateIcon = p.paused; d.state.innerHTML = p.paused ? Icon.play : Icon.pause; }
  const whole = Math.ceil(remaining);
  if (!p.paused && whole !== p.lastWhole) {
    if (p.lastWhole !== null && whole <= 3 && whole >= 1 && step.kind !== 'switch' && step.mode !== 'pnf') Sound.tick();
    p.lastWhole = whole;
  }
  const figT = p.paused ? (p.figurePausedAt ?? 0) : (performance.now() - p.figureStart) / 1000;
  updateSub(step, t, figT);
  updateCue(false);
  const left = p.steps.slice(p.i + 1).reduce((n, s) => n + s.duration, 0) + remaining;
  d.left.textContent = `noch ${fmt(Math.ceil(left))}`;
  d.segs.forEach((bar, i) => {
    let fill = 0;
    if (i < step.index) fill = 1;
    else if (i === step.index) {
      const done = p.steps.filter((s, k) => s.index === i && k < p.i).reduce((n, s) => n + s.duration, 0) + t;
      fill = Math.min(1, done / p.totals[i]);
    }
    bar.style.transform = `scaleX(${fill})`;
  });
  if (p.stage) p.stage.update(step.kind === 'work' && step.mode === 'pnf' && pnfPhase(t).k === 'contract' ? 0 : figT);
  if (!p.paused && t >= step.duration) {
    advance();
    if (!P || P.finished) return;
  }
  p.raf = requestAnimationFrame(loop);
}

const fmt = (s) => { const v = Math.max(0, s); return v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v}`; };

function credit(step, seconds) {
  if (step.kind !== 'work') return;
  const k = step.index;
  P.done[k] = (P.done[k] || 0) + Math.min(step.duration, seconds);
}

function advance() {
  const p = P;
  const step = p.steps[p.i];
  credit(step, elapsed());
  if (p.i >= p.steps.length - 1) { finish(true); return; }
  p.i += 1;
  p.paused = false;
  enterStep();
}

function goBack() {
  const p = P;
  const step = p.steps[p.i];
  const prepIndex = p.steps.findIndex((s) => s.index === step.index && s.kind === 'prep');
  if (p.i > prepIndex && elapsed() > 2) {
    p.stepStart = performance.now();
    p.pausedElapsed = 0;
    p.lastWhole = null;
    return;
  }
  p.i = p.i > prepIndex ? prepIndex : Math.max(0, p.steps.findIndex((s) => s.index === step.index - 1 && s.kind === 'prep'));
  p.paused = false;
  enterStep();
}

function togglePause() {
  const p = P;
  if (p.paused) {
    p.stepStart = performance.now() - p.pausedElapsed * 1000;
    p.figureStart = performance.now() - (p.figurePausedAt || 0) * 1000;
    p.paused = false;
  } else {
    p.pausedElapsed = elapsed();
    p.figurePausedAt = (performance.now() - p.figureStart) / 1000;
    p.paused = true;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  p.el.classList.toggle('paused', p.paused);
}

// Ab der aktuellen Übung neu aufbauen (Tauschen, Region auslassen)
function rebuildFrom(items) {
  const p = P;
  const step = p.steps[p.i];
  credit(step, elapsed());
  const doneItems = p.routine.items.slice(0, step.index);
  p.routine.items = [...doneItems, ...items];
  const before = p.steps.filter((s) => s.index < step.index);
  const after = buildSteps(items, prepSeconds()).map((s) => ({ ...s, index: s.index + step.index }));
  p.steps = [...before, ...after];
  if (!after.length) { finish(true); return; }
  p.i = before.length;
  p.shown = null;
  buildSegments();
  enterStep();
  showFigure();
}

function swapCurrent() {
  const p = P;
  const step = p.steps[p.i];
  const used = p.routine.items.map((x) => x.id);
  const alts = alternativesFor(step.ex.id, used);
  if (!alts.length) { ctx.toast('Keine passende Alternative für diese Übung'); return; }
  const alt = alts[Math.floor(Math.random() * alts.length)];
  const cur = p.routine.items[step.index];
  const rest = p.routine.items.slice(step.index + 1);
  rebuildFrom([{ ...cur, id: alt.id, seconds: cur.mode === 'pnf' ? cur.seconds : Math.min(90, cur.seconds), from: undefined }, ...rest]);
  ctx.toast(`Getauscht: ${alt.name}`);
}

function pinchCurrent() {
  const p = P;
  const step = p.steps[p.i];
  const region = step.ex.regions[0];
  if (!region) { advance(); return; }
  if (!confirm(`Zwickt es? Dann lassen wir „${REGION[region].name}“ heute weg – ab morgen ist die Region wieder dabei. Bei stechendem Schmerz: aufhören.`)) return;
  skipRegionToday(region);
  const rest = p.routine.items.slice(step.index).filter((x) => exercise(x.id)?.regions?.[0] !== region);
  rebuildFrom(rest);
  ctx.toast(`${REGION[region].short} heute ausgelassen`);
}

function bind() {
  const el = P.el;
  qs('[data-p="toggle"]', el).addEventListener('click', togglePause);
  qs('[data-p="next"]', el).addEventListener('click', advance);
  qs('[data-p="prev"]', el).addEventListener('click', goBack);
  qs('[data-p="swap"]', el).addEventListener('click', swapCurrent);
  qs('[data-p="pinch"]', el).addEventListener('click', pinchCurrent);
  qs('[data-p="voice"]', el).addEventListener('click', (e) => {
    const on = !Store.getSettings().mobilityVoice;
    Store.saveSettings({ ...Store.getSettings(), mobilityVoice: on });
    e.currentTarget.innerHTML = on ? Icon.voiceOn : Icon.voiceOff;
    if (on) say('Sprachansage an.'); else if ('speechSynthesis' in window) speechSynthesis.cancel();
  });
  qs('[data-p="close"]', el).addEventListener('click', () => {
    const p = P;
    if (p.finished) { close(); return; }
    const step = p.steps[p.i];
    const sofar = Object.values(p.done).reduce((a, b) => a + b, 0) + (step.kind === 'work' ? elapsed() : 0);
    if (sofar >= 10 && !confirm(`Beenden? Bisher ${mins(sofar)} – ${sofar >= COUNT_MIN_SECONDS ? 'zählt für heute.' : 'unter 3 Minuten zählt noch nicht.'}`)) return;
    credit(step, elapsed());
    finish(false);
  });
}

document.addEventListener('visibilitychange', () => {
  if (!P) return;
  if (document.visibilityState === 'hidden') { if (!P.paused && !P.finished) togglePause(); } else holdScreen();
});

// ---------- Abschluss ----------
function finish(reachedEnd) {
  const p = P;
  cancelAnimationFrame(p.raf);
  p.finished = true;
  if ('speechSynthesis' in window && !reachedEnd) speechSynthesis.cancel();
  const worked = p.routine.items.map((x, i) => ({ id: x.id, seconds: Math.round(p.done[i] || 0) })).filter((x) => x.seconds > 0);
  // Pro Seite zählt die Zeit einer Seite – so wie die Wochenziele gemeint sind
  const perSide = worked.map((x) => ({ id: x.id, seconds: Math.round(x.seconds / (exercise(x.id).sides ? 2 : 1)) }));
  const seconds = worked.reduce((a, x) => a + x.seconds, 0);
  const planned = p.steps.filter((s) => s.kind === 'work').reduce((a, s) => a + s.duration, 0);
  const completed = reachedEnd && seconds >= planned * 0.6;
  if (completed || seconds >= 10) {
    Store.addMobilitySession({
      id: uid(),
      routineId: p.routine.id || null,
      kind: p.routine.kind || 'custom',
      name: p.routine.name,
      startedAt: p.startedAt,
      finishedAt: new Date().toISOString(),
      seconds,
      completed,
      items: perSide,
      regions: regionsOfItems(perSide),
    });
  }
  if (!reachedEnd) { close(); return; }

  const stats = weekStats();
  const counts = completed || seconds >= COUNT_MIN_SECONDS;
  Sound.finish();
  say(counts ? 'Geschafft. Stark gemacht.' : 'Fertig.');
  const regs = Object.entries(regionsOfItems(perSide)).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rateable = [...new Map(worked.map((x) => [x.id, x])).values()].filter((x) => x.seconds >= 10);
  p.el.dataset.kind = 'done';
  qsa('.mzp-stage, .mzp-info, .mzp-controls, .mzp-segs, .mzp-next', p.el).forEach((x) => x.remove());
  p.dom.left.textContent = '';
  const content = document.createElement('div');
  content.className = 'mzp-done';
  content.innerHTML = `
    <div class="mzp-badge ${counts ? '' : 'muted'}">${Icon.check}</div>
    <h2>${counts ? 'Beweglichkeit getankt' : 'Einheit beendet'}</h2>
    <p class="mzp-meta">${escapeHtml(p.routine.name)} · ${mins(seconds)} Dehnzeit</p>
    ${regs.length ? `<div class="mzp-regs">${regs.map(([r, s]) => `<span>+${Math.max(1, Math.round(s / 60))} Min ${REGION[r].short}</span>`).join('')}</div>` : ''}
    <div class="mzp-week">
      <div class="mz-row-head"><strong>Diese Woche</strong><span class="mz-count">${stats.count}<small>/${stats.goal} Tage</small></span>${stats.streak ? `<span class="mz-streak">🔥 ${plural(stats.streak, 'Woche', 'Wochen')}</span>` : ''}</div>
      <div class="mzp-dots">${stats.days.map((on, i) => `<i class="${on ? 'on' : ''} ${i === stats.todayIndex ? 'today' : ''}"></i>`).join('')}</div>
    </div>
    ${rateable.length ? `
      <div class="mzp-rate">
        <div class="mzp-rate-head"><strong>Wie war’s?</strong><span>Die App passt die Stufe an</span></div>
        ${rateable.map((x) => `
          <div class="mzp-rate-row" data-rate="${x.id}">
            <span>${escapeHtml(exercise(x.id).name)}</span>
            <div class="mzp-rate-seg"><button data-r="1">leicht</button><button data-r="0" class="on">passt</button><button data-r="-1">schwer</button></div>
          </div>`).join('')}
      </div>` : ''}
    <div id="mzp-suggest"></div>
    <button class="mz-btn primary full" data-p="done">Fertig</button>`;
  p.el.appendChild(content);
  const ratings = Object.fromEntries(rateable.map((x) => [x.id, 0]));
  qsa('[data-rate]', content).forEach((row) => qsa('[data-r]', row).forEach((b) => b.addEventListener('click', () => {
    ratings[row.dataset.rate] = +b.dataset.r;
    qsa('[data-r]', row).forEach((x) => x.classList.toggle('on', x === b));
  })));
  let saved = false;
  qs('[data-p="done"]', content).addEventListener('click', () => {
    if (!saved) {
      saved = true;
      const sug = recordRatings(Object.entries(ratings).map(([id, r]) => ({ id, r })));
      if (sug.length) { showSuggestions(content, sug); return; }
    }
    close();
  });
  releaseScreen();
}

function showSuggestions(content, list) {
  const box = qs('#mzp-suggest', content);
  qs('.mzp-rate', content)?.remove();
  box.innerHTML = list.map((s, i) => `
    <div class="mzp-sug" data-i="${i}">
      <span class="mzp-sug-icon">${s.dir === 'up' ? '⬆️' : '⬇️'}</span>
      <div><strong>${escapeHtml(exercise(s.from).name)} war ${s.dir === 'up' ? 'mehrmals zu leicht' : 'zweimal zu schwer'}</strong>
        <span>${s.dir === 'up' ? 'Nächste Stufe' : 'Leichtere Variante'}: <b>${escapeHtml(exercise(s.to).name)}</b></span>
        <div class="mzp-sug-actions"><button class="mz-btn soft small" data-yes>Ab jetzt</button><button class="mz-link" data-no>Nein danke</button></div></div>
    </div>`).join('');
  qsa('.mzp-sug', box).forEach((row) => {
    const s = list[+row.dataset.i];
    qs('[data-yes]', row).addEventListener('click', () => {
      setLevel(s.base, s.to);
      Sound.record();
      row.innerHTML = `<span class="mzp-sug-icon">✓</span><div><strong>${escapeHtml(exercise(s.to).name)} ist jetzt in deinen Routinen.</strong></div>`;
    });
    qs('[data-no]', row).addEventListener('click', () => row.remove());
  });
}

function close() {
  const p = P;
  if (!p) return;
  cancelAnimationFrame(p.raf);
  p.stage?.stop();
  releaseScreen();
  if ('speechSynthesis' in window && !p.finished) speechSynthesis.cancel();
  P = null;
  p.el.classList.remove('open');
  p.el.classList.add('closing');
  setTimeout(() => p.el.remove(), 320);
  ctx.onPlayerClosed?.();
}

export function isPlaying() { return !!P; }
