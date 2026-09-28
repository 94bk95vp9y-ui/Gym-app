// 3D-Technik-Viewer: Echtzeit, Zeitlupe, Bild für Bild per Schieberegler,
// Blickwinkel (Trainer, Spiegel, Hinter dir, frei drehen), Links-/Rechts-
// auslage, Leuchtspur und Kraftkette. Darunter alles zum Verstehen und Üben.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { fx, qs, qsa, escapeHtml, getProfile, saveProfile, plural } from './core.js';
import { TECH, clipOf, BELTS, CATEGORY_LABEL, comboLabel } from './data-tech.js';
import { singleTimeline, comboTimeline } from './anim.js';
import { getProgress, techEntry, stateOf, freshness, markSeen, STATE_LABEL, STATE_HINT } from './progress.js';
import { tokenHtml } from './player.js';
import { tokensOf } from './coach.js';

let V = null;

const VIEWS = [
  { id: 'trainer', label: 'Trainer' },
  { id: 'mirror', label: 'Spiegel' },
  { id: 'behind', label: 'Hinter dir' },
];
const SPEEDS = [1, 0.5, 0.25];

export function openViewer(target, { onLesson, back } = {}) {
  if (V) closeViewer(false);
  const combo = Array.isArray(target) ? target : null;
  const tech = combo ? null : TECH[target];
  if (!combo && !tech) return;
  const profile = getProfile();
  const el = document.createElement('div');
  el.className = 'tv';
  const title = combo ? comboLabel(combo) : tech.name;
  const sub = combo ? combo.map((id) => TECH[id].name).join(' · ') : `${tech.alias} · ${CATEGORY_LABEL[tech.cat]}`;
  el.innerHTML = `
    <header class="tv-top">
      <button class="fp-icon" data-tv="close" aria-label="Schließen">${Icon.close}</button>
      <div class="tv-title"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(sub)}</span></div>
      <button class="tv-stance" data-tv="stance" aria-label="Auslage wechseln">${profile.stance === 'southpaw' ? 'R' : 'L'}</button>
    </header>
    <div class="tv-stage">
      <div class="tv-phase" id="tv-phase"></div>
      ${combo ? `<div class="tv-combo">${tokensOf(combo).map((tk, i) => tokenHtml(tk, i)).join('')}</div>` : ''}
      <span class="tv-speed" id="tv-speed">1×</span>
      <span class="tv-hint">${Icon.rotate} Drehen</span>
    </div>
    <div class="tv-controls">
      <button class="tv-play" data-tv="play" aria-label="Abspielen/Anhalten">${Icon.pause}</button>
      <input type="range" class="tv-scrub" min="0" max="1000" value="0" aria-label="Zeit" />
      <div class="tv-speeds">${SPEEDS.map((s, i) => `<button data-speed="${s}" class="${i === 0 ? 'on' : ''}">${s === 1 ? '1×' : s === 0.5 ? '½' : '¼'}</button>`).join('')}</div>
    </div>
    <div class="tv-row">
      <div class="tv-seg">${VIEWS.map((v, i) => `<button data-view="${v.id}" class="${i === 0 ? 'on' : ''}">${v.label}</button>`).join('')}</div>
      <button class="tv-toggle on" data-fx="trail" aria-label="Leuchtspur">Spur</button>
      <button class="tv-toggle on" data-fx="chain" aria-label="Kraftkette">Kraft</button>
    </div>
    <div class="tv-info">${combo ? comboInfoHtml(combo) : infoHtml(tech)}</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));

  V = { el, tech, combo, speed: 1, playing: true, t: 0, view: 'trainer', seenTime: 0, onLesson, back, southpaw: profile.stance === 'southpaw' };
  bindViewer();
  mount();
}

function infoHtml(tech) {
  const p = getProgress();
  const e = techEntry(tech.id, p);
  const state = stateOf(e);
  const f = freshness(e);
  const locked = tech.belt > p.belt;
  const belt = BELTS[tech.belt];
  return `
    <section class="tv-state ${locked ? 'locked' : ''}">
      <div class="tv-state-ring s${state}">${stateRing(state)}<b>${escapeHtml(tech.code)}</b></div>
      <div class="tv-state-text">
        <strong>${locked ? `${belt.name}` : STATE_LABEL[state]}${f.due ? ' <span class="f-pill gold">Wiederholen</span>' : ''}</strong>
        <span class="muted small">${locked ? `Kommt mit dem ${belt.name} – du kannst sie dir schon ansehen.` : STATE_HINT[state]}</span>
        ${e.reps ? `<span class="muted small">${e.reps.toLocaleString('de-DE')} Wiederholungen · an ${plural(e.days.length, 'Tag', 'Tagen')} geübt</span>` : ''}
      </div>
    </section>
    <button class="btn btn-primary full f-bigbtn tv-lesson" data-tv="lesson">${Icon.play} Lektion starten · ca. 5 Min</button>
    <section class="tv-block"><p class="tv-what">${escapeHtml(tech.what)}</p><p class="muted small tv-when"><strong>Wann:</strong> ${escapeHtml(tech.when)}</p></section>
    <section class="tv-block">
      <div class="f-sec">Merkpunkte</div>
      <ol class="tv-cues">${tech.cues.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ol>
    </section>
    <section class="tv-block">
      <div class="f-sec">Typische Fehler</div>
      <ul class="tv-mistakes">${tech.mistakes.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
    </section>
    ${tech.safety ? `<section class="tv-block tv-safety">${Icon.shield}<p>${escapeHtml(tech.safety)}</p></section>` : ''}
    <section class="tv-block">
      <div class="f-sec">So übst du allein</div>
      <p>${escapeHtml(tech.drill)}</p>
      <div class="tv-tags">
        ${tech.quiet !== false ? '<span class="f-pill">leise möglich</span>' : '<span class="f-pill red">nicht leise</span>'}
        ${tech.bag ? '<span class="f-pill">am Sack</span>' : ''}
        ${tech.space === 'medium' ? '<span class="f-pill">braucht etwas Platz</span>' : '<span class="f-pill">kleines Zimmer ok</span>'}
      </div>
    </section>
    <p class="muted small tv-foot">Die Figur zeigt Ablauf und Form. Tipp: Stell das Handy neben den Spiegel und vergleiche dich mit der Ansicht „Spiegel“.</p>`;
}

function comboInfoHtml(seq) {
  return `
    <section class="tv-block">
      <div class="f-sec">Ablauf</div>
      <ol class="tv-cues">${seq.map((id) => `<li><strong>${escapeHtml(TECH[id].name)}</strong> – ${escapeHtml(TECH[id].cues[0])}</li>`).join('')}</ol>
    </section>
    <section class="tv-block">
      <p class="muted small">Jede Technik startet, während die vorige zurückkommt – so entsteht der Fluss. Erst in Zeitlupe mitmachen, dann im Coach.</p>
    </section>`;
}

export function stateRing(state) {
  const R = 22;
  const C = 2 * Math.PI * R;
  const seg = C / 4;
  return `<svg viewBox="0 0 52 52">${[0, 1, 2, 3].map((i) => `<circle cx="26" cy="26" r="${R}" class="${i < state ? 'on' : ''}" stroke-dasharray="${seg - 3} ${C - seg + 3}" stroke-dashoffset="${-i * seg}"/>`).join('')}</svg>`;
}

async function mount() {
  const v = V;
  const [{ FightStage, LOOKS }, { Performer }] = await Promise.all([import('./figure.js'), import('./performer.js')]);
  if (V !== v) return;
  const box = qs('.tv-stage', v.el);
  const stage = new FightStage({});
  const fig = stage.add(LOOKS.fighter);
  fig.setBelt(BELTS[getProgress().belt].color);
  const perf = new Performer(stage, fig, { mirror: v.southpaw });
  v.stage = stage;
  v.perf = perf;
  v.timeline = v.combo
    ? comboTimeline(v.combo.map((id) => clipOf(id)), { lead: 0.5, tail: 0.9 })
    : singleTimeline(clipOf(v.tech.id), { lead: 0.5, tail: 0.8 });
  perf.setTimeline(v.timeline);
  stage.mount(box);
  stage.enableDrag((kind) => { if (kind === 'down') box.classList.add('touched'); });
  applyView();
  let last = performance.now();
  stage.start(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (v.playing) {
      v.t = (v.t + dt * v.speed) % v.timeline.dur;
      v.seenTime += dt * v.speed;
      if (!v.seenMarked && v.tech && v.seenTime >= v.timeline.dur * 1.05) {
        v.seenMarked = true;
        if (markSeen(v.tech.id)) {
          fx.ctx.toast(`👀 ${v.tech.name} angeschaut – jetzt in der Lektion üben`);
          const info = qs('.tv-info', v.el);
          if (info) info.innerHTML = infoHtml(v.tech);
          bindInfo();
        }
      }
      const scrub = qs('.tv-scrub', v.el);
      if (scrub && !v.scrubbing) scrub.value = String(Math.round((v.t / v.timeline.dur) * 1000));
    }
    perf.update(v.t);
    updatePhase();
  });
}

function applyView() {
  const v = V;
  if (!v?.perf) return;
  const fr = v.perf.frame(0.08, 16);
  const cam = v.tech?.cam || { az: 30, el: 8 };
  const flip = v.southpaw ? -1 : 1;
  const opts = { target: fr.center, radius: fr.radius, sway: false };
  if (v.view === 'mirror') { v.stage.setMirror(true); v.stage.view({ ...opts, az: 0, el: 6 }); }
  else if (v.view === 'behind') { v.stage.setMirror(false); v.stage.view({ ...opts, az: 180, el: 12 }); }
  else { v.stage.setMirror(false); v.stage.view({ ...opts, az: cam.az * flip, el: cam.el ?? 8, sway: true }); }
}

function updatePhase() {
  const v = V;
  const el = qs('#tv-phase', v.el);
  if (!el) return;
  let text = '';
  if (v.combo) {
    const marks = v.timeline.marks;
    let idx = -1;
    marks.forEach((m, i) => { if (v.t >= m.t - 0.05) idx = i; });
    qsa('.tv-combo .fp-tok', v.el).forEach((tk, i) => tk.classList.toggle('active', i === idx));
    text = idx >= 0 ? TECH[v.combo[idx]].name : 'Ausgangsstellung';
  } else {
    const local = v.t - (v.timeline.marks[0]?.t || 0);
    const phases = v.tech.phases || [];
    if (local < 0) text = phases[0]?.text || '';
    else {
      phases.forEach((ph) => { if (local >= ph.t) text = ph.text; });
      if (local > (clipOf(v.tech.id).next || 0.5) + 0.35) text = 'Zurück in die Deckung.';
    }
  }
  if (el.textContent !== text) el.textContent = text;
}

function bindViewer() {
  const v = V;
  const el = v.el;
  qs('[data-tv="close"]', el).addEventListener('click', () => closeViewer());
  qs('[data-tv="play"]', el).addEventListener('click', (e) => {
    v.playing = !v.playing;
    e.currentTarget.innerHTML = v.playing ? Icon.pause : Icon.play;
  });
  const scrub = qs('.tv-scrub', el);
  scrub.addEventListener('pointerdown', () => { v.scrubbing = true; v.playing = false; qs('[data-tv="play"]', el).innerHTML = Icon.play; });
  scrub.addEventListener('input', () => { v.t = (+scrub.value / 1000) * (v.timeline?.dur || 1); });
  scrub.addEventListener('pointerup', () => { v.scrubbing = false; });
  scrub.addEventListener('change', () => { v.scrubbing = false; });
  qsa('[data-speed]', el).forEach((b) => b.addEventListener('click', () => {
    v.speed = +b.dataset.speed;
    qsa('[data-speed]', el).forEach((x) => x.classList.toggle('on', x === b));
    qs('#tv-speed', el).textContent = b.textContent;
    qs('#tv-speed', el).classList.toggle('slow', v.speed < 1);
    if (!v.playing) { v.playing = true; qs('[data-tv="play"]', el).innerHTML = Icon.pause; }
  }));
  qsa('[data-view]', el).forEach((b) => b.addEventListener('click', () => {
    v.view = b.dataset.view;
    qsa('[data-view]', el).forEach((x) => x.classList.toggle('on', x === b));
    applyView();
  }));
  qsa('[data-fx]', el).forEach((b) => b.addEventListener('click', () => {
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    if (!v.perf) return;
    if (b.dataset.fx === 'trail') { v.perf.showTrail = on; if (!on) v.perf.trails.forEach((t) => t.hide()); }
    else { v.perf.showChain = on; if (!on) v.perf.figure.setGlow({}); }
  }));
  qs('[data-tv="stance"]', el).addEventListener('click', (e) => {
    v.southpaw = !v.southpaw;
    saveProfile({ stance: v.southpaw ? 'southpaw' : 'orthodox' });
    e.currentTarget.textContent = v.southpaw ? 'R' : 'L';
    fx.ctx.toast(v.southpaw ? 'Rechtsauslage (Linkshänder): rechter Fuß vorn' : 'Linksauslage (Rechtshänder): linker Fuß vorn');
    if (v.perf) { v.perf.mirror = v.southpaw; applyView(); }
  });
  bindInfo();
}

function bindInfo() {
  const v = V;
  qs('[data-tv="lesson"]', v.el)?.addEventListener('click', () => {
    const id = v.tech.id;
    closeViewer(false);
    import('./lesson.js').then((m) => m.startLesson(id));
  });
}

export function closeViewer(render = true) {
  const v = V;
  if (!v) return;
  v.stage?.dispose();
  V = null;
  v.el.classList.remove('open');
  v.el.classList.add('closing');
  setTimeout(() => v.el.remove(), 300);
  if (render) fx.ctx.render();
}

export { Sound };
