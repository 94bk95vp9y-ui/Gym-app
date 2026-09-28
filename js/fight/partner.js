// Virtueller Trainingspartner in Ich-Perspektive.
//
// Pratzen: Der Partner hält die Pratzen genau dorthin, wo der angesagte
// Schlag landen soll – beim Treffermoment knallt es. Zwischendurch schwingt
// er eine Pratze zurück: abtauchen oder ausweichen.
// Gegner: Der Partner greift an (Jab, Cross, Haken, Lowkick, Teep, Middle).
// Man liest die Bewegung, verteidigt und kontert. Echte Bewegungen zu lesen
// überträgt sich besser als nur auf Zahlen oder Farben zu reagieren.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { fx, qs, qsa, escapeHtml, getProfile } from './core.js';
import { TECH, clipOf } from './data-tech.js';
import { STANCE, yaw, comboTimeline, singleTimeline, sampleTimeline, clipDuration, mixPose, mirrorPose, shiftUpper } from './anim.js';
import { startSession } from './player.js';
import { tokensOf } from './coach.js';

const sec = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} Min`);

export function openPartnerSetup() {
  const st = { mode: 'pads', rounds: 3, roundSec: 120, level: 1, calls: 'voice' };
  const draw = () => `
    <div class="f-partner-modes">
      <button class="f-partner ${st.mode === 'pads' ? 'on' : ''}" data-m="pads"><span>🎯</span><strong>Pratzen</strong><small>Der Trainer hält die Pratzen – du schlägst dahin, wo sie auftauchen.</small></button>
      <button class="f-partner ${st.mode === 'opp' ? 'on' : ''}" data-m="opp"><span>🛡️</span><strong>Gegner</strong><small>Der Gegner greift an – ausweichen, blocken, kontern.</small></button>
    </div>
    <div class="f-opt"><span class="f-opt-label">Runden</span><div class="f-seg" data-opt="rounds">${[2, 3, 4, 5].map((v) => `<button data-v="${v}" class="${v === st.rounds ? 'on' : ''}">${v}</button>`).join('')}</div></div>
    <div class="f-opt"><span class="f-opt-label">Rundenlänge</span><div class="f-seg" data-opt="roundSec">${[60, 120, 180].map((v) => `<button data-v="${v}" class="${v === st.roundSec ? 'on' : ''}">${sec(v)}</button>`).join('')}</div></div>
    ${st.mode === 'opp'
    ? `<div class="f-opt"><span class="f-opt-label">Stufe</span><div class="f-seg" data-opt="level">${[[1, 'Angekündigt'], [2, 'Ohne Ansage'], [3, 'Wettkampf']].map(([v, l]) => `<button data-v="${v}" class="${v === st.level ? 'on' : ''}">${l}</button>`).join('')}</div></div>
       <p class="muted small">Stufe 1: Der Angriff wird angesagt und kommt langsamer. Stufe 3: volles Tempo, mit Finten.</p>`
    : `<div class="f-opt"><span class="f-opt-label">Ansage</span><div class="f-seg" data-opt="calls"><button data-v="voice" class="${st.calls === 'voice' ? 'on' : ''}">Mit Ansage</button><button data-v="silent" class="${st.calls === 'silent' ? 'on' : ''}">Nur Pratzen lesen</button></div></div>
       <p class="muted small">Handy auf Augenhöhe vor dir aufstellen (Regal, Stuhl). Schlage in die Luft vor dem Bildschirm – nicht ans Handy.</p>`}`;
  const mount = () => fx.ctx.openSheet('Pratzen & Gegner', draw(), {
    footer: `<button class="btn btn-primary full f-bigbtn" data-go data-nosound>${Icon.bell} Los geht’s</button>`,
    onMount: (root) => {
      qsa('[data-m]', root).forEach((b) => b.addEventListener('click', () => { st.mode = b.dataset.m; mount(); }));
      qsa('[data-opt]', root).forEach((seg) => qsa('button', seg).forEach((b) => b.addEventListener('click', () => {
        st[seg.dataset.opt] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
        qsa('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      })));
      qs('[data-go]', root).addEventListener('click', () => {
        fx.ctx.closeSheet();
        if (st.mode === 'pads') startPads(st); else startOpponent(st);
      });
    },
  });
  mount();
}

function roundsOf({ rounds, roundSec }, label) {
  const segs = [{ kind: 'prep', seconds: 10, label, sub: 'Handy auf Augenhöhe, einen Schritt zurück, Hände hoch.' }];
  for (let r = 0; r < rounds; r += 1) {
    segs.push({ kind: 'work', seconds: roundSec, round: r + 1, rounds, label: `Runde ${r + 1}`, coach: true, theme: 'combos', sub: '' });
    if (r < rounds - 1) segs.push({ kind: 'rest', seconds: 45, round: r + 1, rounds, label: 'Pause', sub: 'Durchatmen, Schultern lockern.' });
  }
  return segs;
}

// ---------- gemeinsame Szene ----------
async function makeScene(box, { pads, distance }) {
  const [{ FightStage, LOOKS }] = await Promise.all([import('./figure.js')]);
  const stage = new FightStage({ shadows: true });
  const partner = stage.add(LOOKS.partner);
  partner.setTransform([0, 0, distance], 180);
  partner.setPads(pads);
  stage.mount(box);
  stage.povView([0, 1.55, 0], [0, 1.35, distance], { width: 1.15, lift: 0.15 });
  return { stage, partner };
}

// ---------- Pratzen ----------
// Partner-Koordinaten: er schaut nach +z (zu dir), seine linke Seite ist +x
// – also von dir aus gesehen rechts.
const HOLD = {
  ...STANCE,
  pelvis: [0, 0.92, 0],
  pFwd: yaw(0), cFwd: yaw(0), cUp: [0, 1, 0.06], hUp: [0, 1, 0.06], look: [0, 0.05, 1],
  footL: [0.14, 0.085, 0.12], toeL: [0.16, 0.035, 0.28], kneeL: [0.25, 0.5, 0.6],
  footR: [-0.14, 0.085, -0.12], toeR: [-0.18, 0.035, 0.03], kneeR: [-0.25, 0.5, 0.4],
  handL: [0.21, 1.31, 0.22], elbowL: [0.42, 1.0, 0.0], padDirL: [-0.22, 0.04, 1],
  handR: [-0.21, 1.31, 0.22], elbowR: [-0.42, 1.0, 0.0], padDirR: [0.22, 0.04, 1],
};
// Wohin die Pratze für welchen Schlag kommt (du in Linksauslage)
const PAD_TARGETS = {
  jab: [{ hand: 'R', pos: [-0.05, 1.47, 0.4], dir: [0, 0, 1] }],
  'step-jab': [{ hand: 'R', pos: [-0.05, 1.47, 0.34], dir: [0, 0, 1] }],
  cross: [{ hand: 'L', pos: [0.05, 1.47, 0.4], dir: [0, 0, 1] }],
  'hook-lead': [{ hand: 'R', pos: [-0.24, 1.48, 0.3], dir: [-0.75, 0, 0.66] }],
  'hook-rear': [{ hand: 'L', pos: [0.24, 1.48, 0.3], dir: [0.75, 0, 0.66] }],
  'upper-lead': [{ hand: 'R', pos: [-0.06, 1.28, 0.36], dir: [0, -0.75, 0.66] }],
  'upper-rear': [{ hand: 'L', pos: [0.06, 1.28, 0.36], dir: [0, -0.75, 0.66] }],
  'jab-body': [{ hand: 'R', pos: [-0.05, 1.04, 0.34], dir: [0, 0, 1] }],
  'cross-body': [{ hand: 'L', pos: [0.05, 1.04, 0.34], dir: [0, 0, 1] }],
  'hook-body': [{ hand: 'R', pos: [-0.22, 1.05, 0.24], dir: [-0.75, 0, 0.66] }],
  bodykick: [{ hand: 'L', pos: [0.26, 1.14, 0.14], dir: [0.9, 0, 0.44] }, { hand: 'R', pos: [0.2, 0.92, 0.18], dir: [0.9, 0, 0.44] }],
  teep: [{ hand: 'L', pos: [0.07, 1.04, 0.3], dir: [0, 0, 1] }, { hand: 'R', pos: [-0.07, 1.04, 0.3], dir: [0, 0, 1] }],
  knee: [{ hand: 'L', pos: [0.08, 0.98, 0.32], dir: [0, -0.5, 0.86] }, { hand: 'R', pos: [-0.08, 0.98, 0.32], dir: [0, -0.5, 0.86] }],
};
// Partner schwingt zurück: Pfad der Pratze (Start, Ziel) – Ziel nah an deinem Kopf
const PAD_ATTACKS = {
  slip: { hand: 'L', from: [0.1, 1.46, 0.26], to: [0.03, 1.56, 0.78] },
  parry: { hand: 'L', from: [0.1, 1.46, 0.26], to: [0.03, 1.56, 0.78] },
  pullback: { hand: 'L', from: [0.1, 1.46, 0.26], to: [0.0, 1.58, 0.72] },
  roll: { hand: 'R', from: [-0.42, 1.5, 0.3], to: [0.2, 1.56, 0.68], arc: true },
  block: { hand: 'R', from: [-0.42, 1.5, 0.3], to: [0.05, 1.58, 0.7], arc: true },
};

const smooth = (u) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function padsDirector({ distance = 1.75, silent = false } = {}) {
  let scene = null;
  let schedule = [];
  let hitIndex = 0;
  const director = {
    async mount(box) {
      scene = await makeScene(box, { pads: true, distance });
      scene.partner.apply(HOLD);
      return director;
    },
    onCall(call) {
      if (!call.seq) return;
      // Treffermomente wie in der eigenen Kombination – etwas mehr Zeit zum Lesen
      const tl = comboTimeline(call.seq.map((id) => clipOf(id)), { lead: 0.45, tail: 0 });
      const now = performance.now() / 1000;
      tl.items.forEach((it, i) => {
        const id = call.seq[i];
        const clip = it.clip;
        const impact = now + (it.start + (clip.impact ?? clipDuration(clip) * 0.45)) * 1.18;
        if (PAD_TARGETS[id]) schedule.push({ id, impact, kind: 'pad' });
        else if (PAD_ATTACKS[id]) schedule.push({ id, impact: impact + 0.15, kind: 'attack' });
      });
    },
    update(nowMs, paused) {
      if (!scene) return;
      const now = nowMs / 1000;
      const pose = { ...HOLD };
      let flash = null;
      let flashAge = -1;
      let lunge = 0;
      schedule = schedule.filter((s) => now < s.impact + 0.6);
      schedule.forEach((s) => {
        const dt = now - s.impact;
        if (s.kind === 'pad') {
          const w = dt < 0 ? smooth(1 + dt / 0.34) : smooth(1 - (dt - 0.1) / 0.32);
          PAD_TARGETS[s.id].forEach((t) => {
            const recoil = dt > 0 && dt < 0.14 ? Math.sin((dt / 0.14) * Math.PI) * 0.05 : 0;
            const pos = [t.pos[0], t.pos[1], t.pos[2] - recoil];
            pose[`hand${t.hand}`] = lerp3(pose[`hand${t.hand}`], pos, w);
            pose[`padDir${t.hand}`] = lerp3(pose[`padDir${t.hand}`], t.dir, w);
            pose[`elbow${t.hand}`] = lerp3(pose[`elbow${t.hand}`], [t.hand === 'L' ? 0.45 : -0.45, 1.1, 0.0], w);
          });
          if (!s.hit && dt >= 0 && !paused) { s.hit = true; Sound.hit(); }
          if (dt >= 0 && dt < 0.3) {
            const j = scene.partner.j;
            const t0 = PAD_TARGETS[s.id][0];
            if (j?.[`pad${t0.hand}`]) { flash = scene.partner.world(j[`pad${t0.hand}`]); flashAge = dt; }
          }
        } else {
          const a = PAD_ATTACKS[s.id];
          let pos;
          if (dt < -0.35) pos = HOLD[`hand${a.hand}`];
          else if (dt < 0) {
            const u = smooth((dt + 0.35) / 0.35);
            pos = a.arc ? arc(a.from, a.to, u) : lerp3(a.from, a.to, u * u);
          } else pos = lerp3(a.to, HOLD[`hand${a.hand}`], smooth(dt / 0.45));
          if (dt > -0.6 && dt < -0.35) pos = lerp3(HOLD[`hand${a.hand}`], a.from, smooth((dt + 0.6) / 0.25));
          pose[`hand${a.hand}`] = pos;
          pose[`padDir${a.hand}`] = [0, 0, 1];
          pose.cFwd = yaw(a.hand === 'R' ? 22 * smooth(1 - Math.abs(dt) / 0.4) : -10 * smooth(1 - Math.abs(dt) / 0.4));
          // Beim Zurückschlagen lehnt er sich zu dir herein
          lunge = Math.max(lunge, dt < 0 ? smooth((dt + 0.6) / 0.6) : smooth(1 - dt / 0.45));
          if (!s.whoosh && dt >= -0.12 && !paused) { s.whoosh = true; Sound.whoosh(); }
        }
      });
      if (lunge > 0) Object.assign(pose, shiftUpper(pose, [0, -0.03 * lunge, 0.2 * lunge]));
      // Partner wippt leicht
      const b = Math.sin(now * 2 * Math.PI * 1.2) * 0.008;
      pose.pelvis = [pose.pelvis[0], pose.pelvis[1] + b, pose.pelvis[2]];
      scene.partner.apply(pose);
      scene.stage.showFlash(flash, flashAge);
      scene.stage.render();
    },
    dispose() { scene?.stage.dispose(); scene = null; },
  };
  return director;
}

function arc(from, to, u) {
  const mid = [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 0.04, Math.max(from[2], to[2]) + 0.12];
  const a = lerp3(from, mid, u);
  const b = lerp3(mid, to, u);
  return lerp3(a, b, u);
}

function startPads(st) {
  const director = padsDirector({ silent: st.calls === 'silent' });
  const silent = st.calls === 'silent';
  startSession({
    type: 'pads',
    title: 'Pratzen',
    segments: roundsOf(st, 'Pratzen'),
    coach: { mode: 'pads', tempo: 2 },
    figure: 'pov',
    pov: director,
    nextCall: silent ? (t, seg, p) => { const c = p.coach.next(t); if (c) c.speech = c.kind === 'combo' ? '' : c.speech; return c; } : null,
  });
}

// ---------- Gegner ----------
const ATTACKS = [
  { tech: 'jab', level: 1, defense: 'Slip', say: 'Jab', counter: ['cross'] },
  { tech: 'cross', level: 1, defense: 'Slip', say: 'Cross', counter: ['hook-lead', 'cross'] },
  { tech: 'hook-lead', level: 1, defense: 'Abtauchen', say: 'Haken', counter: ['hook-lead', 'cross'] },
  { tech: 'hook-rear', level: 2, defense: 'Block', say: 'Rechter Haken', counter: ['jab', 'cross'] },
  { tech: 'teep', level: 1, defense: 'Zurück', say: 'Teep', counter: ['jab', 'cross'] },
  { tech: 'lowkick', level: 2, defense: 'Check', say: 'Lowkick', counter: ['cross', 'hook-lead'] },
  { tech: 'bodykick', level: 2, defense: 'Block', say: 'Middle', counter: ['cross', 'lowkick'] },
  { tech: 'jab-body', level: 3, defense: 'Ellbogen runter', say: 'Körper', counter: ['hook-lead'] },
];

function opponentDirector(level) {
  let scene = null;
  let perf = null;
  let current = null; // { start, tl, attack }
  const speed = [0, 0.62, 0.82, 1.0][level];
  const director = {
    async mount(box) {
      scene = await makeScene(box, { pads: false, distance: 1.6 });
      const { Performer } = await import('./performer.js');
      perf = new Performer(scene.stage, scene.partner, { chain: false, trail: true, flash: false, trailColor: 0x4d8dff });
      perf.setTimeline(singleTimeline(clipOf('stance'), { lead: 0, tail: 0 }));
      return director;
    },
    onCall(call) {
      if (!call.attack || !perf) return;
      const tl = singleTimeline(clipOf(call.attack.tech), { lead: level === 1 ? 0.55 : 0.2, tail: 0.5 });
      perf.setTimeline(tl);
      current = { start: performance.now() / 1000, tl, attack: call.attack, whoosh: false };
    },
    update(nowMs) {
      if (!perf) return;
      const now = nowMs / 1000;
      let t = 0;
      if (current) {
        t = (now - current.start) * speed;
        const clip = clipOf(current.attack.tech);
        if (!current.whoosh && t >= current.tl.marks[0].t + (clip.impact ?? 0.2) - 0.06) { current.whoosh = true; Sound.whoosh(); }
        if (t > current.tl.dur) { current = null; perf.setTimeline(singleTimeline(clipOf('stance'), { lead: 0, tail: 0 })); t = 0; }
      } else t = now;
      perf.update(current ? t : now);
      scene.stage.render();
    },
    dispose() { scene?.stage.dispose(); scene = null; perf = null; },
  };
  return director;
}

function startOpponent(st) {
  const level = st.level;
  const director = opponentDirector(level);
  const pool = ATTACKS.filter((a) => a.level <= Math.max(level, 1) + (level >= 2 ? 1 : 0));
  let nextAt = 2.5;
  let counterAt = null;
  let counterFor = null;
  let feints = 0;
  let attacks = 0;
  const counts = {};
  const DEF = { Slip: 'slip', Abtauchen: 'roll', Block: 'block', Check: 'check', Zurück: 'pullback', 'Ellbogen runter': 'block' };
  const speed = [0, 0.62, 0.82, 1.0][level];
  startSession({
    type: 'opponent',
    title: 'Gegner',
    segments: roundsOf(st, 'Gegner'),
    figure: 'pov',
    pov: director,
    calledExtra: () => attacks,
    // Verteidigungen und Konter zählen als Übung der jeweiligen Technik
    extraCounts: () => counts,
    nextCall: (t, seg) => {
      if (seg.seconds - t < 3) return null;
      if (counterAt !== null && t >= counterAt) {
        const c = counterFor;
        counterAt = null;
        c.counter.forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
        return { kind: 'combo', seq: c.counter, tokens: tokensOf(c.counter), text: `Konter nach ${c.defense}`, speech: level <= 2 ? 'Konter!' : '' };
      }
      if (t < nextAt) return null;
      const atk = pool[Math.floor(Math.random() * pool.length)];
      // Stufe 3: manchmal nur eine Finte
      if (level === 3 && Math.random() < 0.18) {
        feints += 1;
        nextAt = t + 1.4;
        return { kind: 'attack', attack: { tech: 'feint', defense: '', counter: [] }, tokens: [], text: 'Finte – nicht reinfallen', speech: '' };
      }
      attacks += 1;
      const def = DEF[atk.defense];
      if (def) counts[def] = (counts[def] || 0) + 1;
      const clip = clipOf(atk.tech);
      const lead = level === 1 ? 0.55 : 0.2;
      const hitIn = (lead + (clip.impact ?? 0.2)) / speed;
      counterAt = t + hitIn + 0.35;
      counterFor = atk;
      nextAt = t + hitIn + (level === 1 ? 3.2 : level === 2 ? 2.4 : 1.7) + Math.random() * 1.2;
      return {
        kind: 'attack',
        attack: atk,
        tokens: [],
        text: level === 1 ? `${atk.say} kommt – ${atk.defense}!` : '',
        speech: level === 1 ? `${atk.say}. ${atk.defense}` : '',
        defenseHint: atk.defense,
      };
    },
    logExtra: () => ({ level, attacks, feints }),
  });
}

export { escapeHtml, getProfile, TECH, mixPose, mirrorPose, sampleTimeline };
