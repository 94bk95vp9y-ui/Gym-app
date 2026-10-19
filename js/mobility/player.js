// Geführter Mobility-Ablauf: 3D-Figur, Countdown-Ring, Atemführung,
// Anspannen-Loslassen und Sprachansage.
import { Store, uid } from '../core/store.js';
import { Sound } from '../core/sound.js';
import { esc, qs, qsa, prefersReducedMotion } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { confirmAction } from '../ui/sheet.js';
import { exercise } from './library.js';
import { PNF, PNF_SECONDS, SWITCH_SECONDS, SET_REST } from './plans.js';
import { prepSeconds, mins, COUNT_MIN_SECONDS, weekCount } from './routines.js';
import { stageFor } from './figures.js';

const RING = 2 * Math.PI * 46;
let onClosed = null;

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

// Ein Plan kann Texte einer Übung anpassen (item.ex) und mehrere Sätze
// vorsehen (item.sets) – dazwischen eine kurze Pause.
export function planExercise(item) {
  const base = exercise(item.id);
  return base && item.ex ? { ...base, ...item.ex } : base;
}

function buildSteps(items, prep) {
  const steps = [];
  items.forEach((item, index) => {
    const ex = planExercise(item);
    if (!ex) return;
    const mode = modeOf(item, ex);
    const duration = mode === 'pnf' ? PNF_SECONDS : item.seconds;
    const sets = item.sets || 1;
    steps.push({ kind: 'prep', ex, item, index, side: 'L', mode, duration: prep, set: 1, sets });
    for (let set = 1; set <= sets; set += 1) {
      if (set > 1) steps.push({ kind: 'rest', ex, item, index, side: 'L', mode, duration: SET_REST, set, sets });
      (ex.sides ? ['L', 'R'] : ['L']).forEach((side, si) => {
        if (si > 0) steps.push({ kind: 'switch', ex, item, index, side, mode, duration: SWITCH_SECONDS, set, sets });
        steps.push({ kind: 'work', ex, item, index, side, mode, duration, set, sets });
      });
    }
  });
  return steps;
}

function pnfPhase(t) {
  const cycle = PNF.stretch + PNF.contract + PNF.relax;
  const c = Math.floor(t / cycle);
  if (c >= PNF.cycles) return { k: 'final', c: PNF.cycles, left: PNF_SECONDS - t };
  const u = t - c * cycle;
  if (u < PNF.stretch) return { k: 'stretch', c, left: PNF.stretch - u };
  if (u < PNF.stretch + PNF.contract) return { k: 'contract', c, left: PNF.stretch + PNF.contract - u };
  return { k: 'relax', c, left: cycle - u };
}

const fmt = (s) => { const v = Math.max(0, s); return v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v}`; };

let P = null;

export function isPlaying() { return !!P; }

export function startRoutine(routine, { onClose = null } = {}) {
  if (!routine || P) return;
  const items = routine.items.filter((x) => exercise(x.id));
  if (!items.length) return;
  onClosed = onClose;
  const steps = buildSteps(items, prepSeconds());
  const voice = Store.getSettings().mobilityVoice;

  const el = document.createElement('div');
  el.className = 'player';
  el.innerHTML = `
    <header class="p-top">
      <button class="icon-btn" data-p="close" aria-label="Beenden">${Icon.close}</button>
      <div class="p-title"><strong>${esc(routine.name)}</strong><span id="p-left"></span></div>
      <button class="icon-btn" data-p="voice" aria-label="Sprachansage">${voice ? Icon.voiceOn : Icon.voiceOff}</button>
    </header>
    <div class="p-segs"></div>
    <div class="p-stage">
      <span class="tag neutral p-section" id="p-section" hidden></span>
      <span class="tag p-side" id="p-side" hidden></span>
    </div>
    <div class="p-info">
      <div class="p-phase" id="p-phase"></div>
      <h2 class="p-name" id="p-name"></h2>
      <p class="p-cue" id="p-cue"></p>
      <div class="p-sub" id="p-sub"></div>
    </div>
    <div class="p-controls">
      <button class="p-ctrl" data-p="prev" aria-label="Zurück">${Icon.skipBack}</button>
      <button class="p-ring" data-p="toggle" aria-label="Pause">
        <svg class="ring" viewBox="0 0 104 104"><circle class="bg" cx="52" cy="52" r="46"/><circle class="fg" id="p-ring" cx="52" cy="52" r="46" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
        <span class="p-time" id="p-time"></span>
        <span class="p-state" id="p-state"></span>
      </button>
      <button class="p-ctrl" data-p="next" aria-label="Weiter">${Icon.skipForward}</button>
    </div>
    <div class="p-next" id="p-next"></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));

  P = {
    el, routine: { ...routine, items }, steps, i: 0,
    stepStart: performance.now(), figureStart: performance.now(), paused: false, pausedElapsed: 0,
    done: {}, startedAt: new Date().toISOString(), lastWhole: null, cueIndex: -1, sub: null, stage: null, shown: null,
    dom: {
      time: qs('#p-time', el), ring: qs('#p-ring', el), state: qs('#p-state', el),
      sub: qs('#p-sub', el), left: qs('#p-left', el), phase: qs('#p-phase', el),
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
    s.mount(qs('.p-stage', el));
    P.stage = s;
    P.shown = null;
    showFigure();
  }).catch(() => { /* ohne Figur weiter */ });
  loop();
}

function buildSegments() {
  const p = P;
  const n = p.routine.items.length;
  p.totals = Array.from({ length: n }, (_, i) => p.steps.filter((s) => s.index === i).reduce((a, s) => a + s.duration, 0));
  qs('.p-segs', p.el).innerHTML = p.totals.map((t) => `<span style="flex:${t}"><i></i></span>`).join('');
  p.dom.segs = qsa('.p-segs i', p.el);
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
  p.shown = key;
  p.stage.setExercise(step.ex, step.side);
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
  // Neu starten, sobald gearbeitet wird – sonst zählte die Vorbereitung bei
  // den Wiederholungen mit
  if (step.kind !== 'work' || !prev || prev.kind !== 'work' || prev.side !== step.side || prev.index !== step.index) p.figureStart = performance.now();
  showFigure();
  const { ex } = step;
  const total = p.routine.items.length;
  qs('#p-name', p.el).textContent = ex.name;
  const side = qs('#p-side', p.el);
  side.textContent = step.side === 'L' ? 'Linke Seite' : 'Rechte Seite';
  side.hidden = !ex.sides;
  const section = qs('#p-section', p.el);
  section.textContent = step.item.section || '';
  section.hidden = !step.item.section;
  const modeText = { hold: 'Halten', flow: 'Bewegen', pnf: 'Anspannen-Loslassen', active: 'Aktiv', breath: 'Atmen' }[step.mode];
  const setText = step.sets > 1 ? ` · Satz ${step.set}/${step.sets}` : '';
  p.dom.phase.textContent = {
    prep: `Gleich · ${step.index + 1} von ${total}`,
    switch: `Seite wechseln${setText}`,
    rest: `Kurze Pause · gleich Satz ${step.set}/${step.sets}`,
    work: `${step.index + 1} von ${total} · ${modeText}${setText}`,
  }[step.kind];
  p.el.classList.toggle('paused', p.paused);
  const nextItem = p.routine.items[step.index + 1];
  qs('#p-next', p.el).innerHTML = nextItem ? `<span>Danach</span><strong>${esc(planExercise(nextItem).name)}</strong>` : '<span>Letzte Übung</span>';
  updateCue(true);
  if (step.kind === 'prep') {
    Sound.bell();
    const how = step.mode === 'pnf' ? ' Mit Anspannen und Loslassen.' : step.mode === 'active' ? ' Aktiv, mit Kraft.' : '';
    say(`${first ? 'Los geht’s. ' : 'Als Nächstes: '}${ex.name}${ex.sides ? ', linke Seite' : ''}.${how}`);
  } else if (step.kind === 'switch') {
    Sound.bell();
    say('Seite wechseln.');
  } else if (step.kind === 'rest') {
    Sound.bell();
    say(`Kurze Pause. Gleich Satz ${step.set}.`);
  } else {
    Sound.go();
  }
}

function updateCue(force) {
  const p = P;
  const step = p.steps[p.i];
  const cues = step.ex.cues || [];
  let index;
  if (step.kind === 'prep') index = 0;
  else if (step.kind === 'switch') index = -2;
  else if (step.kind === 'rest') index = -3;
  else index = Math.min(cues.length - 1, Math.floor(elapsed() / Math.max(8, step.duration / Math.max(1, cues.length))));
  if (!force && index === p.cueIndex) return;
  p.cueIndex = index;
  const el = qs('#p-cue', p.el);
  const text = index === -2 ? 'Kurz lockern und auf die andere Seite wechseln.'
    : index === -3 ? 'Kurz lockern – gleich geht es mit dem nächsten Satz weiter.' : (cues[index] || '');
  if (el.textContent === text) return;
  if (prefersReducedMotion()) { el.textContent = text; return; }
  el.classList.add('fade');
  setTimeout(() => { el.textContent = text; el.classList.remove('fade'); }, 160);
}

function updateSub(step, t, figT) {
  const p = P;
  let key = '';
  let html = '';
  if (step.kind !== 'work') {
    key = 'none';
  } else if (step.mode === 'pnf') {
    const ph = pnfPhase(t);
    key = `${ph.k}:${ph.c}`;
    const label = { stretch: ph.c === 0 ? 'Dehnen' : 'Tiefer halten', contract: 'Anspannen', relax: 'Loslassen', final: 'Letztes Mal tiefer' }[ph.k];
    html = `<b>${label}</b><span>${Math.ceil(ph.left)} s · Durchgang ${Math.min(ph.c + 1, PNF.cycles)}/${PNF.cycles}</span>`;
    if (key !== p.sub && !p.paused) {
      if (ph.k === 'contract') { Sound.tick(); say(ph.c === 0 ? `Anspannen. ${step.ex.pnf || 'Sanft gegen den Widerstand drücken, etwa 30 Prozent.'}` : 'Anspannen.', { rate: 1.05 }); } else if (ph.k === 'relax') say('Loslassen.', { rate: 1.05 });
      else if (ph.k === 'stretch' && ph.c > 0) say('Tiefer sinken. Halten.', { rate: 1.05 });
      else if (ph.k === 'final') say('Letztes Mal tiefer. Ruhig halten.', { rate: 1.05 });
    }
  } else if (step.mode === 'active') {
    const loopLen = step.ex.loop || 5;
    const reps = Math.max(1, Math.round(step.duration / loopLen));
    const rep = Math.min(reps, Math.floor(figT / loopLen) + 1);
    key = `rep:${rep}`;
    html = `<b>Wiederholung ${rep}</b><span>von ${reps}</span>`;
    if (key !== p.sub && !p.paused && rep > 1) say(String(rep), { rate: 1.1 });
  } else if (step.mode === 'breath') {
    const ph = figT % 10;
    key = ph < 4 ? 'in' : 'out';
    html = ph < 4 ? '<b>Einatmen</b><span>4 Sekunden durch die Nase</span>' : '<b>Ausatmen</b><span>6 Sekunden, ganz langsam</span>';
  } else if (step.ex.breath) {
    const ph = figT % 5;
    key = ph < 3 ? 'out' : 'in';
    html = ph < 3 ? '<b>Ausatmen</b><span>und tiefer sinken</span>' : '<b>Einatmen</b><span>ruhig halten</span>';
  } else {
    key = 'tempo';
    html = `<b>Bewegen</b><span>${esc(step.ex.tempo || 'ruhig und kontrolliert')}</span>`;
  }
  if (key === p.sub) return;
  p.sub = key;
  p.dom.sub.innerHTML = html;
}

function loop() {
  const p = P;
  if (!p) return;
  const step = p.steps[p.i];
  const t = elapsed();
  const remaining = Math.max(0, step.duration - t);
  const d = p.dom;
  d.time.textContent = fmt(Math.ceil(remaining - 0.001));
  d.ring.style.strokeDashoffset = String(RING * Math.min(1, t / step.duration));
  if (d.stateIcon !== p.paused) { d.stateIcon = p.paused; d.state.innerHTML = p.paused ? Icon.play : ''; }
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
      const doneSoFar = p.steps.filter((s, k) => s.index === i && k < p.i).reduce((n, s) => n + s.duration, 0) + t;
      fill = Math.min(1, doneSoFar / p.totals[i]);
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

function credit(step, seconds) {
  if (step.kind !== 'work') return;
  P.done[step.index] = (P.done[step.index] || 0) + Math.min(step.duration, seconds);
}

function advance() {
  const p = P;
  credit(p.steps[p.i], elapsed());
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

function bind() {
  const { el } = P;
  qs('[data-p="toggle"]', el).addEventListener('click', togglePause);
  qs('[data-p="next"]', el).addEventListener('click', advance);
  qs('[data-p="prev"]', el).addEventListener('click', goBack);
  qs('[data-p="voice"]', el).addEventListener('click', (e) => {
    const on = !Store.getSettings().mobilityVoice;
    Store.updateSettings({ mobilityVoice: on });
    e.currentTarget.innerHTML = on ? Icon.voiceOn : Icon.voiceOff;
    if (on) say('Sprachansage an.'); else if ('speechSynthesis' in window) speechSynthesis.cancel();
  });
  qs('[data-p="close"]', el).addEventListener('click', async () => {
    const p = P;
    if (!p) return;
    if (p.finished) { close(); return; }
    const step = p.steps[p.i];
    const sofar = Object.values(p.done).reduce((a, b) => a + b, 0) + (step.kind === 'work' ? elapsed() : 0);
    if (sofar >= 10) {
      const wasPaused = p.paused;
      if (!wasPaused) togglePause();
      const ok = await confirmAction({
        title: 'Einheit beenden?',
        message: `Bisher ${mins(sofar)} – ${sofar >= COUNT_MIN_SECONDS ? 'zählt für heute.' : 'unter 3 Minuten zählt noch nicht.'}`,
        confirmLabel: 'Beenden',
      });
      if (!ok) { if (!wasPaused && P) togglePause(); return; }
    }
    credit(P.steps[P.i], elapsed());
    finish(false);
  });
}

document.addEventListener('visibilitychange', () => {
  if (!P) return;
  if (document.visibilityState === 'hidden') { if (!P.paused && !P.finished) togglePause(); } else holdScreen();
});

function finish(reachedEnd) {
  const p = P;
  cancelAnimationFrame(p.raf);
  p.finished = true;
  if ('speechSynthesis' in window && !reachedEnd) speechSynthesis.cancel();
  const worked = p.routine.items.map((x, i) => ({ id: x.id, seconds: Math.round(p.done[i] || 0) })).filter((x) => x.seconds > 0);
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
      items: worked.map((x) => ({ id: x.id, seconds: Math.round(x.seconds / (exercise(x.id)?.sides ? 2 : 1)) })),
    });
  }
  releaseScreen();
  if (!reachedEnd) { close(); return; }
  const counts = completed || seconds >= COUNT_MIN_SECONDS;
  Sound.finish();
  say(counts ? 'Geschafft. Stark gemacht.' : 'Fertig.');
  qsa('.p-stage, .p-info, .p-controls, .p-segs, .p-next', p.el).forEach((x) => x.remove());
  p.dom.left.textContent = '';
  const week = weekCount();
  const content = document.createElement('div');
  content.className = 'p-done';
  content.innerHTML = `
    <div class="finish-icon pop">${Icon.check}</div>
    <h3 style="font-size:26px;font-weight:700;letter-spacing:-0.02em">${counts ? 'Geschafft' : 'Einheit beendet'}</h3>
    <p class="muted">${esc(p.routine.name)} · ${mins(seconds)} Dehnzeit</p>
    <p class="muted small">Diese Woche an ${week} ${week === 1 ? 'Tag' : 'Tagen'}</p>
    <button class="btn btn-primary" data-p="done">Fertig</button>`;
  p.el.appendChild(content);
  qs('[data-p="done"]', content).addEventListener('click', close);
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
  setTimeout(() => p.el.remove(), 420);
  onClosed?.();
}
