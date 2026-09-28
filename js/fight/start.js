// Startmenü (Glocke in der Mitte) und die Einstellungen vor einer Einheit.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { fx, qs, qsa, escapeHtml, getProfile, saveProfile, quietNow, plural } from './core.js';
import { TECH } from './data-tech.js';
import { getProgress, nextToLearn, dueReviews } from './progress.js';
import { shadowPlan, THEMES, TEMPO_LABEL } from './coach.js';
import { startSession } from './player.js';
import { startLesson } from './lesson.js';
import { createRopeCounter } from './rope-counter.js';

export function openStartSheet() {
  const next = nextToLearn();
  const due = dueReviews();
  const profile = getProfile();
  const quiet = quietNow(profile);
  const item = (id, icon, title, sub, cls = '') => `
    <button class="f-start-item ${cls}" data-s="${id}">
      <span class="f-start-icon">${icon}</span>
      <span class="f-start-text"><strong>${title}</strong><span>${sub}</span></span>
      ${Icon.chevron}
    </button>`;
  fx.ctx.openSheet('Einheit starten', `
    ${quiet ? `<p class="f-quiet-note">${Icon.voiceOff} Leise-Zeit: Sprünge und Sack werden weggelassen.</p>` : ''}
    <div class="f-start-grid">
      ${item('shadow', '🥊', 'Shadowboxing', `Coach sagt Kombinationen an · ${profile.coach.rounds} × ${Math.round(profile.coach.roundSec / 60)} Min`, 'hot')}
      ${next ? item('lesson', '🎯', `Lernen: ${escapeHtml(next.name)}`, 'Neue Technik Schritt für Schritt · 5 Min') : ''}
      ${due.length ? item('review', '🔁', 'Wiederholen', `${plural(due.length, 'Technik', 'Techniken')} fällig · 3 × 2 Min`) : ''}
      ${item('partner', '🧤', 'Pratzen & Gegner', '3D-Partner hält Pratzen oder greift an')}
      ${profile.equipment.bag ? item('bag', '🎒', 'Sack-Runden', 'Kraft, Speed und Kombinationen am Wandsack', quiet ? 'dim' : '') : ''}
      ${item('conditioning', '🔥', 'Kondition', 'Zirkel fürs Zimmer – auch leise')}
      ${profile.equipment.rope ? item('rope', '🪢', 'Seilspringen', 'Runden wie die Boxer, mit Aufgaben', quiet ? 'dim' : '') : ''}
      ${item('run', '🏃', 'Laufen', 'Geführt mit GPS oder eintragen', 'teal')}
      ${item('reaction', '⚡', 'Reaktion', 'Reaktionstest und Reflex-Drills')}
      ${item('timer', '⏱️', 'Rundentimer', 'Boxen, K-1, Muay Thai, eigene')}
    </div>`, {
    onMount: (root) => {
      qsa('[data-s]', root).forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.s;
        if (id === 'shadow') openShadowSetup();
        else if (id === 'lesson') { fx.ctx.closeSheet(); startLesson(next.id); }
        else if (id === 'review') { fx.ctx.closeSheet(); startShadow({ rounds: 3, roundSec: 120, restSec: 45, themes: ['review', 'review', 'combos'], title: 'Wiederholung' }); }
        else if (id === 'bag') openBagSetup();
        else if (id === 'rope') openRopeSetup();
        else if (id === 'timer') openTimerSetup();
        else if (id === 'conditioning') import('./conditioning.js').then((m) => m.openConditioning());
        else if (id === 'run') import('./endurance.js').then((m) => m.openRunStart());
        else if (id === 'reaction') import('./reaction.js').then((m) => m.openReaction());
        else if (id === 'partner') import('./partner.js').then((m) => m.openPartnerSetup());
      }));
    },
  });
}

// ---------- Auswahl-Helfer ----------
function stepper(id, label, value, options, fmt) {
  return `
    <div class="f-opt">
      <span class="f-opt-label">${label}</span>
      <div class="f-seg" data-opt="${id}">${options.map((o) => `<button data-v="${o}" class="${o === value ? 'on' : ''}">${fmt ? fmt(o) : o}</button>`).join('')}</div>
    </div>`;
}
function bindSteppers(root, state, onChange) {
  qsa('[data-opt]', root).forEach((seg) => qsa('button', seg).forEach((b) => b.addEventListener('click', () => {
    const v = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
    state[seg.dataset.opt] = v;
    qsa('button', seg).forEach((x) => x.classList.toggle('on', x === b));
    onChange?.();
  })));
}
const mins = (s) => (s < 60 ? `${s}s` : `${s / 60}${s % 60 ? ':30' : ''} Min`.replace('.5', ''));
const sec = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}${s % 60 ? `:${String(s % 60).padStart(2, '0')}` : ''} Min`);

// ---------- Shadowboxing ----------
export function openShadowSetup() {
  const profile = getProfile();
  const st = { ...profile.coach, figure: profile.showFigure ? 'mini' : 'off' };
  const total = () => Math.round((st.rounds * st.roundSec + (st.rounds - 1) * st.restSec) / 60);
  fx.ctx.openSheet('Shadowboxing', `
    <p class="muted small f-setup-intro">Der Coach sagt nur Techniken an, die du schon kennst – fällige Wiederholungen öfter. Letzte Sekunden jeder Runde: Vollgas.</p>
    ${stepper('rounds', 'Runden', st.rounds, [2, 3, 4, 5, 6, 8])}
    ${stepper('roundSec', 'Rundenlänge', st.roundSec, [60, 120, 180], sec)}
    ${stepper('restSec', 'Pause', st.restSec, [30, 45, 60, 90], sec)}
    ${stepper('tempo', 'Tempo', st.tempo, [1, 2, 3, 4, 5], (v) => TEMPO_LABEL[v])}
    ${stepper('figure', '3D-Figur zeigt mit', st.figure, ['mini', 'off'], (v) => (v === 'mini' ? 'Ja' : 'Nein'))}
    <p class="muted small" id="f-total"></p>`, {
    footer: `<button class="btn btn-primary full f-bigbtn" data-go data-nosound>${Icon.bell} Los geht’s</button>`,
    onMount: (root) => {
      const upd = () => { qs('#f-total', root).textContent = `Gesamt ca. ${total()} Minuten · Tempo ${TEMPO_LABEL[st.tempo]}`; };
      upd();
      bindSteppers(root, st, upd);
      qs('[data-go]', root).addEventListener('click', () => {
        saveProfile({ coach: { rounds: st.rounds, roundSec: st.roundSec, restSec: st.restSec, tempo: st.tempo }, showFigure: st.figure === 'mini' });
        fx.ctx.closeSheet();
        startShadow({ ...st, figure: st.figure === 'mini' ? 'mini' : null });
      });
    },
  });
}

export function startShadow({ rounds, roundSec, restSec, tempo, themes, title = 'Shadowboxing', figure, mode = 'shadow' } = {}) {
  const profile = getProfile();
  const cfg = { rounds: rounds ?? profile.coach.rounds, roundSec: roundSec ?? profile.coach.roundSec, restSec: restSec ?? profile.coach.restSec, tempo: tempo ?? profile.coach.tempo };
  const plan = shadowPlan({ ...cfg, mode });
  if (themes) {
    let r = 0;
    plan.segments.forEach((s) => {
      if (s.kind === 'work') { s.theme = themes[r] || themes[themes.length - 1]; s.sub = THEMES[s.theme].text; r += 1; }
      else if (s.kind === 'rest') s.sub = `Als Nächstes: ${THEMES[themes[r]]?.label || 'weiter'}`;
    });
  }
  Sound.boxBell(1);
  startSession({
    type: mode,
    title,
    segments: plan.segments,
    coach: { mode, tempo: cfg.tempo },
    figure: figure === undefined ? (profile.showFigure ? 'mini' : null) : figure,
    logExtra: () => ({ tempo: cfg.tempo, roundSec: cfg.roundSec }),
  });
}

// ---------- Sack ----------
function openBagSetup() {
  const quiet = quietNow();
  const st = { rounds: 4, roundSec: 120, restSec: 60, tempo: 2 };
  fx.ctx.openSheet('Sack-Runden', `
    ${quiet ? '<p class="f-quiet-note">Leise-Zeit: Der Wandsack ist laut. Vielleicht lieber Shadowboxing?</p>' : ''}
    <div class="f-safety">${Icon.shield}<p>Mit Bandagen oder Handschuhen – nie mit bloßen Fäusten. Handgelenk gerade, mit den ersten zwei Knöcheln treffen. Am kleinen Wandsack nur Schläge, keine Tritte.</p></div>
    ${stepper('rounds', 'Runden', st.rounds, [3, 4, 5, 6])}
    ${stepper('roundSec', 'Rundenlänge', st.roundSec, [60, 90, 120, 180], sec)}
    ${stepper('restSec', 'Pause', st.restSec, [30, 45, 60, 90], sec)}
    ${stepper('tempo', 'Tempo', st.tempo, [1, 2, 3, 4, 5], (v) => TEMPO_LABEL[v])}
    <p class="muted small">Runden: Einstieg · Kraft · Kombinationen · Speed · Vollgas</p>`, {
    footer: `<button class="btn btn-primary full f-bigbtn" data-go data-nosound>${Icon.bell} Los geht’s</button>`,
    onMount: (root) => {
      bindSteppers(root, st);
      qs('[data-go]', root).addEventListener('click', () => {
        fx.ctx.closeSheet();
        startShadow({ ...st, mode: 'bag', title: 'Sack-Runden', figure: null });
      });
    },
  });
}

// ---------- Seilspringen ----------
const ROPE_SKILLS = [
  { name: 'Grundsprung', cue: 'Locker auf den Fußballen, Handgelenke drehen das Seil.' },
  { name: 'Boxer-Skip', cue: 'Gewicht von Fuß zu Fuß – der Boxer-Rhythmus.' },
  { name: 'Laufschritt', cue: 'Knie leicht anheben, wie Laufen auf der Stelle.' },
  { name: 'Seitwärts', cue: 'Kleine Sprünge links-rechts, Oberkörper ruhig.' },
  { name: 'Vor – zurück', cue: 'Kleine Sprünge vor und zurück.' },
  { name: 'Kreuzen', cue: 'Arme vor dem Körper kreuzen – erst langsam.' },
  { name: 'Double-Unders', cue: 'Ein Sprung, zwei Seildurchgänge – kurz und explosiv.' },
  { name: 'Tempo!', cue: 'So schnell wie möglich, sauber bleiben.' },
];
function openRopeSetup() {
  const st = { rounds: 3, roundSec: 180, restSec: 60, counter: 'off' };
  const quiet = quietNow();
  fx.ctx.openSheet('Seilspringen', `
    ${quiet ? '<p class="f-quiet-note">Leise-Zeit: Seilspringen ist laut – draußen oder im Gym ist es besser.</p>' : ''}
    <p class="muted small f-setup-intro">Wie die Boxer: Runden mit wechselnden Aufgaben. Braucht Deckenhöhe – im Zimmer oft zu eng, draußen perfekt.</p>
    ${stepper('rounds', 'Runden', st.rounds, [2, 3, 4, 5, 6])}
    ${stepper('roundSec', 'Rundenlänge', st.roundSec, [60, 120, 180], sec)}
    ${stepper('restSec', 'Pause', st.restSec, [30, 45, 60], sec)}
    ${stepper('counter', 'Sprünge zählen (Beta)', st.counter, ['off', 'on'], (v) => (v === 'on' ? 'Handy in die Tasche' : 'Aus'))}
    <p class="muted small">Der Zähler nutzt den Bewegungssensor – das Handy muss eng am Körper sitzen (Hosentasche).</p>`, {
    footer: `<button class="btn btn-primary full f-bigbtn" data-go data-nosound>${Icon.bell} Los geht’s</button>`,
    onMount: (root) => {
      bindSteppers(root, st);
      qs('[data-go]', root).addEventListener('click', async () => {
        // Sensor-Erlaubnis sofort im Tipp anfragen (iOS)
        const pending = st.counter === 'on' ? createRopeCounter() : null;
        fx.ctx.closeSheet();
        let counter = null;
        if (pending) {
          counter = await pending;
          if (!counter) fx.ctx.toast('Bewegungssensor nicht verfügbar – ohne Zähler');
        }
        startRope(st, counter);
      });
    },
  });
}

function startRope(st, counter) {
  const segments = [{ kind: 'prep', seconds: 10, label: 'Seil bereit', sub: 'Seil hinter die Fersen, Ellbogen am Körper.' }];
  for (let r = 0; r < st.rounds; r += 1) {
    const skills = ROPE_SKILLS.slice(0, 3 + Math.min(5, r * 2));
    segments.push({
      kind: 'work', seconds: st.roundSec, round: r + 1, rounds: st.rounds, label: `Runde ${r + 1}`, sub: skills[0].cue,
      onTick: (t, p) => {
        const i = Math.floor(t / 30) % skills.length;
        if (p.ropeIdx === `${r}:${i}`) return;
        p.ropeIdx = `${r}:${i}`;
        p.dom.callout.innerHTML = `<div class="fp-task">${escapeHtml(skills[i].name)}</div>`;
        p.dom.text.textContent = skills[i].cue;
        if (t > 1) import('./voice.js').then((v) => v.speak(skills[i].name));
      },
    });
    if (r < st.rounds - 1) segments.push({ kind: 'rest', seconds: st.restSec, round: r + 1, rounds: st.rounds, label: 'Pause', sub: 'Lockern, Schultern kreisen.' });
  }
  if (counter) {
    // Sprünge live anzeigen
    segments.forEach((s) => {
      if (s.kind !== 'work') return;
      const base = s.onTick;
      s.onTick = (t, p) => { base(t, p); p.dom.phase.textContent = plural(counter.count(), 'Sprung', 'Sprünge'); };
    });
  }
  startSession({
    type: 'rope',
    title: 'Seilspringen',
    segments,
    figure: null,
    extraStats: () => (counter?.count() ? [{ value: counter.count(), label: 'Sprünge' }] : []),
    logExtra: () => ({ jumps: counter?.count() || null }),
    onClose: () => counter?.stop(),
  });
}

// ---------- Rundentimer ----------
const PRESETS = [
  { id: 'box', name: 'Boxen', rounds: 3, roundSec: 180, restSec: 60 },
  { id: 'k1', name: 'K-1 / Kickboxen', rounds: 3, roundSec: 180, restSec: 60 },
  { id: 'mt', name: 'Muay Thai', rounds: 5, roundSec: 180, restSec: 120 },
  { id: 'mma', name: 'MMA', rounds: 3, roundSec: 300, restSec: 60 },
  { id: 'am', name: 'Amateur', rounds: 3, roundSec: 120, restSec: 60 },
  { id: 'hiit', name: 'Tabata', rounds: 8, roundSec: 20, restSec: 10 },
];
export function openTimerSetup() {
  const st = { rounds: 3, roundSec: 180, restSec: 60 };
  fx.ctx.openSheet('Rundentimer', `
    <div class="f-presets">${PRESETS.map((p) => `<button class="f-preset" data-p="${p.id}"><strong>${p.name}</strong><span>${p.rounds} × ${sec(p.roundSec)} · ${sec(p.restSec)} Pause</span></button>`).join('')}</div>
    <div class="f-sec" style="margin-top:14px">Eigene Runden</div>
    ${stepper('rounds', 'Runden', st.rounds, [1, 2, 3, 4, 5, 6, 8, 10, 12])}
    ${stepper('roundSec', 'Rundenlänge', st.roundSec, [30, 60, 120, 180, 300], sec)}
    ${stepper('restSec', 'Pause', st.restSec, [10, 30, 60, 90, 120], sec)}`, {
    footer: `<button class="btn btn-primary full f-bigbtn" data-go data-nosound>${Icon.bell} Start</button>`,
    onMount: (root) => {
      bindSteppers(root, st);
      const run = (cfg, name) => {
        fx.ctx.closeSheet();
        const segments = [{ kind: 'prep', seconds: 10, label: 'Gleich', sub: name }];
        for (let r = 0; r < cfg.rounds; r += 1) {
          segments.push({ kind: 'work', seconds: cfg.roundSec, round: r + 1, rounds: cfg.rounds, label: `Runde ${r + 1}`, announce: cfg.roundSec >= 60 ? `Runde ${r + 1}` : '' });
          if (r < cfg.rounds - 1) segments.push({ kind: 'rest', seconds: cfg.restSec, round: r + 1, rounds: cfg.rounds, label: 'Pause', announce: cfg.restSec >= 30 ? 'Pause' : '' });
        }
        Sound.boxBell(1);
        startSession({ type: 'timer', title: name, segments, figure: null, bells: cfg.roundSec < 60 ? 'beep' : 'ring' });
      };
      qsa('[data-p]', root).forEach((b) => b.addEventListener('click', () => {
        const p = PRESETS.find((x) => x.id === b.dataset.p);
        run(p, p.name);
      }));
      qs('[data-go]', root).addEventListener('click', () => run(st, 'Rundentimer'));
    },
  });
}

export { TECH, getProgress };
