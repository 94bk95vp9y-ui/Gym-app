// Einheiten-Player des Fight-Modus: Runden, Pausen, Zirkel und Lektionen.
// Großer Timer, Ringglocke, Klappern 10 s vor Rundenende, Ansagen, die
// angesagte Kombination groß als farbige Zeichen – und auf Wunsch eine
// kleine 3D-Figur, die sie vormacht.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { Store } from '../storage.js';
import { fx, qs, qsa, escapeHtml, fmtClock, uidShort, plural } from './core.js';
import { speak, stopVoice, primeVoice, holdScreen, releaseScreen, voiceEnabled, setVoiceEnabled } from './voice.js';
import { Coach, THEMES, tokensOf } from './coach.js';
import { recordPractice, recordCombos, recordCheck, STATE_LABEL } from './progress.js';
import { TECH, clipOf } from './data-tech.js';
import { singleTimeline, comboTimeline } from './anim.js';
import { afterSession } from './rewards.js';

const RING = 2 * Math.PI * 54;
let P = null; // laufende Einheit

const PHASE_LABEL = { prep: 'Gleich', work: 'Los', rest: 'Pause', switch: 'Wechsel' };

export function isPlaying() { return !!P; }

// spec: { type, title, segments, coach: {mode, tempo, exam, onlyTech}, figure: 'mini'|'big'|null,
//         lesson: techId, selfCheck: {techId, items}, exam: {...}, onDone(result) }
export function startSession(spec) {
  if (P) return;
  primeVoice();
  const el = document.createElement('div');
  el.className = `fp fp-${spec.type} ${spec.figure === 'pov' ? 'fp-pov' : ''}`;
  const works = spec.segments.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'work');
  el.innerHTML = `
    <div class="fp-glow"></div>
    <header class="fp-top">
      <button class="fp-icon" data-fp="close" aria-label="Beenden">${Icon.close}</button>
      <div class="fp-title"><strong>${escapeHtml(spec.title)}</strong><span id="fp-sub"></span></div>
      <button class="fp-icon" data-fp="voice" aria-label="Sprachansage">${voiceEnabled() ? Icon.voiceOn : Icon.voiceOff}</button>
    </header>
    <div class="fp-segs">${works.map((w) => `<span class="fp-seg" style="flex:${w.s.seconds}" data-i="${w.i}"><i></i></span>`).join('')}</div>
    <div class="fp-stage ${spec.figure === 'big' ? 'big' : spec.figure === 'pov' ? 'pov' : ''}" ${spec.figure ? '' : 'hidden'}></div>
    <div class="fp-main">
      <div class="fp-phase" id="fp-phase"></div>
      <div class="fp-time f-num" id="fp-time">0:00</div>
      <div class="fp-callout" id="fp-callout"></div>
      <div class="fp-text" id="fp-text"></div>
    </div>
    <div class="fp-controls">
      <button class="fp-ctrl" data-fp="prev" aria-label="Zurück">${Icon.skipBack}</button>
      <button class="fp-ring" data-fp="toggle" aria-label="Pause">
        <svg viewBox="0 0 120 120"><circle class="fp-ring-bg" cx="60" cy="60" r="54"/><circle class="fp-ring-fg" id="fp-ring" cx="60" cy="60" r="54" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
        <span id="fp-state">${Icon.pause}</span>
      </button>
      <button class="fp-ctrl" data-fp="next" aria-label="Weiter">${Icon.skipForward}</button>
    </div>
    ${spec.figure === 'mini' ? `<button class="fp-figtoggle" data-fp="fig">${Icon.eye}<span>Figur</span></button>` : ''}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));

  P = {
    spec, el, i: 0,
    segStart: performance.now(), paused: false, pausedAt: 0,
    startedAt: new Date(), workDone: 0, roundsDone: 0,
    coach: spec.coach ? new Coach(spec.coach) : null,
    lastWhole: null, clapped: false,
    figShown: spec.figure !== null && spec.figure !== undefined,
    dom: {
      time: qs('#fp-time', el), phase: qs('#fp-phase', el), sub: qs('#fp-sub', el), callout: qs('#fp-callout', el),
      text: qs('#fp-text', el), ring: qs('#fp-ring', el), state: qs('#fp-state', el), segs: qsa('.fp-seg > i', el),
    },
    calls: 0,
    figT0: performance.now(),
  };
  if (spec.figure) mountFigure();
  bind();
  holdScreen();
  Sound.start();
  enter(true);
  loop();
}

async function mountFigure() {
  const p = P;
  if (p.spec.figure === 'pov') {
    const box = qs('.fp-stage', p.el);
    const director = await p.spec.pov.mount(box);
    if (!P || P !== p) { director?.dispose?.(); return; }
    p.pov = director;
    return;
  }
  const [{ FightStage, LOOKS }, { Performer }, { getProgress }, { BELTS }, { southpaw }] = await Promise.all([
    import('./figure.js'), import('./performer.js'), import('./progress.js'), import('./data-tech.js'), import('./core.js'),
  ]);
  if (!P || P !== p) return;
  const box = qs('.fp-stage', p.el);
  const stage = new FightStage({ shadows: p.spec.figure === 'big' });
  const fig = stage.add(LOOKS.fighter);
  fig.setBelt(BELTS[getProgress().belt].color);
  const perf = new Performer(stage, fig, { mirror: southpaw(), chain: p.spec.figure === 'big' });
  perf.setTimeline(singleTimeline(clipOf('stance')));
  const fr = perf.frame(0.05, 4);
  p.frameBase = { target: [fr.center[0], 0.92, fr.center[2] + 0.12], radius: 1.08 };
  stage.view({ az: p.spec.figure === 'big' ? 35 : 25, el: 8, ...p.frameBase, sway: p.spec.figure === 'big' });
  stage.mount(box);
  stage.enableDrag();
  p.stage = stage;
  p.perf = perf;
  applyFigureMode(true);
}

// Figur passend zum Abschnitt: Lektion (Schleife/Zeitlupe) oder Ansagen
function applyFigureMode(force) {
  const p = P;
  if (!p?.perf) return;
  const seg = p.spec.segments[p.i];
  const fig = seg.fig || (p.spec.figure === 'mini' ? { mode: 'calls' } : { mode: 'idle' });
  const key = JSON.stringify(fig);
  if (!force && key === p.figKey) return;
  p.figKey = key;
  p.figMode = fig;
  p.figT0 = performance.now();
  // Blickwinkel: zum Mitmachen gespiegelt von vorn (wie vor einem Spiegel),
  // zum Zuschauen aus dem Trainer-Winkel der Technik
  if (p.frameBase) {
    const cam = TECH[fig.tech]?.cam || { az: 30, el: 8 };
    const flip = p.perf.mirror ? -1 : 1;
    if (fig.view === 'mirror') { p.stage.setMirror(true); p.stage.view({ ...p.frameBase, az: 0, el: 6, sway: false }); }
    else if (fig.tech) { p.stage.setMirror(false); p.stage.view({ ...p.frameBase, az: cam.az * flip, el: cam.el ?? 8, sway: true }); }
  }
  if (fig.mode === 'loop' || fig.mode === 'count') {
    const clip = clipOf(fig.tech);
    p.perf.setTimeline(fig.combo ? comboTimeline(fig.combo.map((id) => clipOf(id)), { lead: 0.4, tail: 0.8 }) : singleTimeline(clip, { lead: fig.lead ?? 0.45, tail: fig.tail ?? 0.7 }));
    p.lastRep = -1;
  } else {
    p.perf.setTimeline(singleTimeline(clipOf('stance'), { lead: 0, tail: 0 }));
  }
}

function figureTime() {
  const p = P;
  const speed = p.figMode?.speed || 1;
  const t = ((performance.now() - p.figT0) / 1000) * speed;
  if (p.figMode?.mode === 'loop' || p.figMode?.mode === 'count') {
    const dur = p.perf.timeline.dur;
    return t % dur;
  }
  return t;
}

function elapsed() {
  return P.paused ? P.pausedAt : (performance.now() - P.segStart) / 1000;
}

function enter(first = false) {
  const p = P;
  const seg = p.spec.segments[p.i];
  p.segStart = performance.now();
  p.pausedAt = 0;
  p.lastWhole = null;
  p.clapped = false;
  p.el.dataset.kind = seg.kind;
  p.dom.callout.innerHTML = '';
  p.dom.text.textContent = seg.sub || '';
  const roundText = seg.rounds ? `Runde ${seg.round}/${seg.rounds}` : '';
  const theme = seg.theme && THEMES[seg.theme] ? THEMES[seg.theme].label : '';
  p.dom.sub.textContent = [roundText, seg.kind === 'work' ? theme : '', seg.exercise ? '' : ''].filter(Boolean).join(' · ') || seg.label || '';
  p.dom.phase.textContent = seg.phase || (seg.kind === 'work' ? (seg.label || 'Los') : PHASE_LABEL[seg.kind]);

  if (seg.kind === 'work' && p.coach && seg.coach) p.coach.startRound(seg.theme || 'combos', seg.seconds);
  applyFigureMode();

  // Klang und Ansage beim Betreten
  const bells = p.spec.bells !== 'beep';
  if (seg.kind === 'work') {
    if (bells) Sound.boxBell(1); else Sound.go();
    speak(seg.announce ?? (seg.rounds ? `Runde ${seg.round}. ${theme}.` : seg.label), { rate: 1.05 });
  } else if (seg.kind === 'rest') {
    if (!first) { if (bells) Sound.boxBell(3); else Sound.beep(true); }
    speak(seg.announce ?? `Pause. ${seg.sub || ''}`, { rate: 1.05 });
  } else if (seg.kind === 'prep') {
    speak(seg.announce ?? seg.sub ?? 'Gleich geht es los.', { rate: 1.05 });
  }
}

function showCall(call) {
  const p = P;
  p.calls += 1;
  const box = p.dom.callout;
  if (call.kind === 'combo' || call.kind === 'flurry') {
    box.innerHTML = `<div class="fp-tokens ${call.kind}">${call.tokens.map((tk, i) => tokenHtml(tk, i)).join('')}</div>`;
    p.dom.text.textContent = call.kind === 'flurry' ? call.text : call.text || '';
    if (p.perf && call.seq && p.figShown && p.figMode?.mode !== 'loop' && p.figMode?.mode !== 'count') {
      p.perf.setTimeline(comboTimeline(call.seq.map((id) => clipOf(id)), { lead: 0.25, tail: 0.6 }));
      p.figT0 = performance.now();
    }
  } else {
    box.innerHTML = `<div class="fp-task">${escapeHtml(call.text)}</div>`;
    p.dom.text.textContent = '';
  }
  box.classList.remove('pop');
  void box.offsetWidth;
  box.classList.add('pop');
  p.pov?.onCall?.(call);
  if (call.speech) {
    const rate = 1.05 + (p.coach?.tempo || 2) * 0.06;
    speak(call.speech, { rate });
  }
}

export function tokenHtml(tk, i = 0) {
  const numeric = /^\d$/.test(tk.code);
  const body = /b$/.test(tk.code) && tk.cat === 'punch';
  const label = numeric ? tk.code : body ? tk.code.replace('b', '') : '';
  if (numeric || body) {
    return `<span class="fp-tok num ${tk.side}" style="--i:${i}"><b>${label}</b>${body ? '<small>Körper</small>' : ''}</span>`;
  }
  return `<span class="fp-tok word ${tk.side} ${tk.cat}" style="--i:${i}">${escapeHtml(tk.label || tk.code)}</span>`;
}

function loop() {
  const p = P;
  if (!p || p.finished) return;
  const seg = p.spec.segments[p.i];
  const t = elapsed();
  const remaining = Math.max(0, seg.seconds - t);
  const d = p.dom;
  d.time.textContent = fmtClock(Math.ceil(remaining - 0.001));
  d.ring.style.strokeDashoffset = String(RING * (1 - Math.min(1, t / seg.seconds)));
  if (d.stateIcon !== p.paused) { d.stateIcon = p.paused; d.state.innerHTML = p.paused ? Icon.play : Icon.pause; }
  d.segs.forEach((bar) => {
    const i = +bar.parentElement.dataset.i;
    bar.style.transform = `scaleX(${i < p.i ? 1 : i === p.i ? Math.min(1, t / seg.seconds) : 0})`;
  });

  if (!p.paused) {
    // Countdown-Töne, Klappern 10 s vor Rundenende
    const whole = Math.ceil(remaining);
    if (whole !== p.lastWhole) {
      if (p.lastWhole !== null && whole <= 3 && whole >= 1 && seg.kind !== 'work') Sound.tick();
      if (p.lastWhole !== null && whole <= 3 && whole >= 1 && seg.kind === 'work' && p.spec.bells === 'beep') Sound.tick();
      p.lastWhole = whole;
    }
    if (seg.kind === 'work' && !p.clapped && seg.seconds >= 45 && remaining <= 10 && p.spec.bells !== 'beep') {
      p.clapped = true;
      Sound.clapper();
    }
    // Coach
    if (seg.kind === 'work' && seg.coach && (p.spec.nextCall || p.coach)) {
      const call = p.spec.nextCall ? p.spec.nextCall(t, seg, p) : p.coach.next(t);
      if (call) showCall(call);
    }
    // Segment-eigene Ansagen (Lektion: Wiederholungen zählen)
    if (seg.onTick) seg.onTick(t, p);
  }

  if (p.pov) p.pov.update(performance.now(), p.paused);
  // Figur
  if (p.stage && p.figShown) {
    const ft = figureTime();
    p.perf.update(ft);
    p.stage.render();
    if (p.figMode?.mode === 'count' && !p.paused) {
      const clip = clipOf(p.figMode.tech);
      const impactAt = (p.figMode.lead ?? 0.45) + (clip.impact ?? 0.2);
      const rep = Math.floor(((performance.now() - p.figT0) / 1000 * (p.figMode.speed || 1)) / p.perf.timeline.dur);
      if (rep !== p.lastRep && ft >= impactAt) {
        p.lastRep = rep;
        p.reps = (p.reps || 0) + 1;
        if (p.figMode.say) speak(p.figMode.say === 'count' ? String(((p.reps - 1) % 10) + 1) : p.figMode.say, { rate: 1.2 });
        else Sound.tick();
      }
    }
  }

  if (!p.paused && t >= seg.seconds) {
    advance();
    if (!P || P.finished) return;
  }
  p.raf = requestAnimationFrame(loop);
}

function advance() {
  const p = P;
  const seg = p.spec.segments[p.i];
  if (seg.kind === 'work') {
    p.workDone += Math.min(seg.seconds, elapsed());
    if (elapsed() >= seg.seconds * 0.8) p.roundsDone += 1;
  }
  if (p.i >= p.spec.segments.length - 1) {
    if (seg.kind === 'work' && p.spec.bells !== 'beep') Sound.boxBell(3);
    finish(true);
    return;
  }
  p.i += 1;
  p.paused = false;
  p.el.classList.remove('paused');
  enter();
}

function goBack() {
  const p = P;
  if (elapsed() > 3 || p.i === 0) {
    p.segStart = performance.now();
    p.pausedAt = 0;
    p.lastWhole = null;
    if (p.coach && p.spec.segments[p.i].coach) p.coach.startRound(p.spec.segments[p.i].theme || 'combos', p.spec.segments[p.i].seconds);
    return;
  }
  p.i -= 1;
  enter();
}

function togglePause() {
  const p = P;
  if (p.paused) {
    p.segStart = performance.now() - p.pausedAt * 1000;
    p.paused = false;
  } else {
    p.pausedAt = elapsed();
    p.paused = true;
    stopVoice();
  }
  p.el.classList.toggle('paused', p.paused);
}

function bind() {
  const el = P.el;
  qs('[data-fp="toggle"]', el).addEventListener('click', togglePause);
  qs('[data-fp="next"]', el).addEventListener('click', () => { if (!P.finished) advance(); });
  qs('[data-fp="prev"]', el).addEventListener('click', goBack);
  qs('[data-fp="voice"]', el).addEventListener('click', (e) => {
    const on = !voiceEnabled();
    setVoiceEnabled(on);
    e.currentTarget.innerHTML = on ? Icon.voiceOn : Icon.voiceOff;
    if (on) speak('Ansage an.');
  });
  qs('[data-fp="fig"]', el)?.addEventListener('click', (e) => {
    P.figShown = !P.figShown;
    qs('.fp-stage', el).hidden = !P.figShown;
    e.currentTarget.classList.toggle('off', !P.figShown);
  });
  qs('[data-fp="close"]', el).addEventListener('click', () => {
    const p = P;
    if (p.finished) { close(); return; }
    const seg = p.spec.segments[p.i];
    const done = p.workDone + (seg.kind === 'work' ? elapsed() : 0);
    if (done >= 20 && !confirm(`Einheit beenden? ${Math.round(done / 60) || '<1'} Min werden gespeichert.`)) return;
    if (seg.kind === 'work') p.workDone += Math.min(seg.seconds, elapsed());
    finish(false);
  });
}

// Im Hintergrund anhalten – sonst wären beim Zurückkommen Runden vorbei.
document.addEventListener('visibilitychange', () => {
  if (!P || P.finished) return;
  if (document.visibilityState === 'hidden') { if (!P.paused) togglePause(); } else holdScreen();
});

// ---------- Abschluss ----------
function finish(reachedEnd) {
  const p = P;
  cancelAnimationFrame(p.raf);
  p.finished = true;
  releaseScreen();
  const seconds = Math.round(p.workDone);
  if (seconds < 20) {
    close();
    if (p.workDone >= 3) fx.ctx.toast('Unter 20 Sekunden – nicht gespeichert');
    return;
  }

  const counts = { ...(p.coach?.counts || {}) };
  if (p.spec.lesson) counts[p.spec.lesson] = (counts[p.spec.lesson] || 0) + Math.max(p.reps || 0, Math.round(seconds / 3.5));
  (p.spec.extraCounts ? Object.entries(p.spec.extraCounts(p)) : []).forEach(([id, n]) => { counts[id] = (counts[id] || 0) + n; });
  const called = Object.values(p.coach?.counts || {}).reduce((a, b) => a + b, 0) + (p.spec.calledExtra ? p.spec.calledExtra(p) : 0);
  const totalWork = p.spec.segments.filter((s) => s.kind === 'work').reduce((n, s) => n + s.seconds, 0);
  const completed = reachedEnd && seconds >= totalWork * 0.6;
  Sound.finish();
  speak(completed ? 'Stark gemacht. Einheit geschafft.' : 'Einheit beendet.');
  p.el.dataset.kind = 'done';
  qsa('.fp-stage, .fp-main, .fp-controls, .fp-segs, .fp-figtoggle', p.el).forEach((x) => x.remove());
  p.stage?.dispose();
  p.pov?.dispose?.();
  p.pov = null;
  qs('#fp-sub', p.el).textContent = '';

  const check = p.spec.selfCheck;
  const content = document.createElement('div');
  content.className = 'fp-done';
  content.innerHTML = `
    <div class="fp-done-badge ${completed ? '' : 'muted'}">${Icon.check}</div>
    <h2>${completed ? escapeHtml(p.spec.doneTitle || 'Einheit geschafft') : 'Einheit beendet'}</h2>
    <div class="fp-stats">
      ${p.spec.segments.some((s) => s.rounds) ? `<div><b class="f-num">${p.roundsDone}</b><span>${p.roundsDone === 1 ? 'Runde' : 'Runden'}</span></div>` : ''}
      <div><b class="f-num">${Math.max(1, Math.round(seconds / 60))}</b><span>${Math.max(1, Math.round(seconds / 60)) === 1 ? 'Minute' : 'Minuten'}</span></div>
      ${(p.spec.extraStats ? p.spec.extraStats(p) : []).map((x) => `<div><b class="f-num">${x.value}</b><span>${escapeHtml(x.label)}</span></div>`).join('')}
      ${called ? `<div><b class="f-num">${called}</b><span>${called === 1 ? 'Technik' : 'Techniken'} angesagt</span></div>` : p.reps ? `<div><b class="f-num">${p.reps}</b><span>${p.reps === 1 ? 'Wiederholung' : 'Wiederholungen'}</span></div>` : ''}
    </div>
    ${check ? `
      <div class="fp-check">
        <div class="f-sec">Selbst-Check · ${escapeHtml(check.title || 'Hat es geklappt?')}</div>
        ${check.items.map((it, i) => `<button class="fp-check-item" data-ci="${i}"><span class="fp-check-box">${Icon.check}</span><span>${escapeHtml(it)}</span></button>`).join('')}
        <p class="muted small">Ehrlich abhaken – am besten vor dem Spiegel geprüft.</p>
      </div>` : ''}
    <div class="fp-rpe">
      <div class="f-sec">Wie anstrengend war es?</div>
      <div class="fp-rpe-row">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button class="fp-rpe-btn" data-rpe="${n}">${n}</button>`).join('')}</div>
      <p class="muted small" id="fp-rpe-hint">1 = ganz locker · 10 = am Limit</p>
    </div>
    <textarea class="text-input fp-notes" rows="2" placeholder="Notiz (optional): was lief gut, was übst du nächstes Mal?"></textarea>
    <button class="btn btn-primary full f-bigbtn" data-fp="save">Speichern</button>`;
  p.el.appendChild(content);
  let rpe = null;
  const checks = new Set();
  qsa('[data-rpe]', content).forEach((b) => b.addEventListener('click', () => {
    rpe = +b.dataset.rpe;
    qsa('[data-rpe]', content).forEach((x) => x.classList.toggle('on', +x.dataset.rpe <= rpe));
    qs('#fp-rpe-hint', content).textContent = ['', 'Sehr locker', 'Locker', 'Locker', 'Mittel', 'Mittel', 'Fordernd', 'Hart', 'Sehr hart', 'Fast am Limit', 'Am Limit'][rpe];
  }));
  qsa('[data-ci]', content).forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.ci;
    if (checks.has(i)) checks.delete(i); else checks.add(i);
    b.classList.toggle('on', checks.has(i));
    Sound.setDone();
  }));
  qs('[data-fp="save"]', content).addEventListener('click', () => {
    const entry = {
      id: uidShort(),
      type: p.spec.type,
      title: p.spec.title,
      at: p.startedAt.toISOString(),
      seconds,
      rounds: p.roundsDone,
      rpe,
      notes: qs('.fp-notes', content).value.trim() || null,
      techniques: counts,
      called,
      completed,
      ...(p.spec.logExtra ? p.spec.logExtra(p) : {}),
    };
    Store.addFightSession(entry);
    const promoted = recordPractice(counts, { lesson: completed ? (p.spec.lesson || null) : null, at: p.startedAt });
    if (p.coach?.comboIds.length) recordCombos(p.coach.comboIds);
    let checkResult = null;
    if (check) {
      const ok = checks.size === check.items.length;
      checkResult = { ok, count: checks.size, total: check.items.length };
      if (check.techId) {
        const up = recordCheck(check.techId, ok);
        if (up) promoted.push(up);
      }
    }
    close(false);
    const result = { entry, promoted, checkResult, completed };
    if (p.spec.onDone) p.spec.onDone(result);
    else afterSession(result);
  });
}

function close(render = true) {
  const p = P;
  if (!p) return;
  p.spec.onClose?.();
  cancelAnimationFrame(p.raf);
  p.stage?.dispose();
  p.pov?.dispose?.();
  releaseScreen();
  if (!p.finished) stopVoice();
  P = null;
  p.el.classList.remove('open');
  p.el.classList.add('closing');
  setTimeout(() => p.el.remove(), 320);
  if (render) fx.ctx.render();
}

export { STATE_LABEL, plural };
