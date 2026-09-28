// Reaktion: Tests in Millisekunden (einfach, Wahlreaktion, Go/No-Go) und
// Reflex-Drills für den ganzen Körper.
// Hinweis: Handys haben eine Touch-Verzögerung – die Werte liegen höher als
// im Labor. Entscheidend ist der Vergleich mit dir selbst.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { Store } from '../storage.js';
import { fx, qs, qsa, escapeHtml, fmtDay, uidShort } from './core.js';
import { startSession } from './player.js';
import { speak } from './voice.js';
import { checkChallenges, celebrate, grantXp } from '../challenges.js';

const MODES = {
  simple: { name: 'Reaktionstest', trials: 5, text: 'Sobald der Bildschirm grün wird: tippen. So schnell du kannst.' },
  choice: { name: 'Wahlreaktion', trials: 10, text: 'Pfeil nach links: linke Hälfte tippen. Pfeil nach rechts: rechte Hälfte.' },
  gonogo: { name: 'Go / No-Go', trials: 12, text: 'Grün: tippen. Rot: nicht tippen – einfach warten.' },
};

export function reactionStats() {
  const list = Store.getReactionLog().filter((r) => r.mode === 'simple').sort((a, b) => a.at.localeCompare(b.at));
  const best = list.reduce((b, r) => (!b || r.median < b.median ? r : b), null);
  return { list, best, last: list[list.length - 1] || null };
}

export function openReaction() {
  const st = reactionStats();
  const log = Store.getReactionLog();
  const lastOf = (m) => log.filter((r) => r.mode === m).slice(-1)[0];
  const row = (mode, icon) => {
    const last = lastOf(mode);
    return `<button class="f-start-item" data-rx="${mode}"><span class="f-start-icon">${icon}</span>
      <span class="f-start-text"><strong>${MODES[mode].name}</strong><span>${last ? `Zuletzt ${last.median} ms${last.errors ? ` · ${last.errors} Fehler` : ''}` : escapeHtml(MODES[mode].text)}</span></span>${Icon.chevron}</button>`;
  };
  fx.ctx.openSheet('Reaktion', `
    ${st.best ? `<div class="f-rx-best"><div><span class="f-cap muted small">Bestwert</span><b class="f-num">${st.best.median}<small> ms</small></b></div>${st.list.length > 1 ? `<svg class="f-spark" viewBox="0 0 200 44" preserveAspectRatio="none"><polyline points="${st.list.slice(-12).map((r, i, a) => `${(i / Math.max(1, a.length - 1)) * 200},${44 - ((360 - Math.min(360, r.median)) / 160) * 44}`).join(' ')}"/></svg>` : ''}</div>` : ''}
    <div class="f-start-grid">
      ${row('simple', '⚡')}
      ${row('choice', '↔️')}
      ${row('gonogo', '🚦')}
      <button class="f-start-item hot" data-rx="drill"><span class="f-start-icon">🥊</span><span class="f-start-text"><strong>Reflex-Drill</strong><span>3 × 1 Min: Pfeile und Farben – ausweichen, abtauchen, kontern</span></span>${Icon.chevron}</button>
    </div>
    <p class="muted small" style="margin-top:10px">Handys reagieren mit etwas Verzögerung auf Berührungen – vergleiche deine Werte mit dir selbst, nicht mit Laborwerten.</p>`, {
    onMount: (root) => qsa('[data-rx]', root).forEach((b) => b.addEventListener('click', () => {
      fx.ctx.closeSheet();
      if (b.dataset.rx === 'drill') startReflexDrill();
      else runTest(b.dataset.rx);
    })),
  });
}

// ---------- Test ----------
function runTest(mode) {
  const M = MODES[mode];
  const el = document.createElement('div');
  el.className = 'rx';
  el.innerHTML = `
    <header class="fp-top"><button class="fp-icon" data-x aria-label="Abbrechen">${Icon.close}</button>
      <div class="fp-title"><strong>${M.name}</strong><span id="rx-count">0/${M.trials}</span></div><span style="width:40px"></span></header>
    <div class="rx-pad" id="rx-pad"><div class="rx-sign" id="rx-sign"></div><div class="rx-msg" id="rx-msg">${escapeHtml(M.text)}<br><br><b>Tippen zum Start</b></div></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  const pad = qs('#rx-pad', el);
  const sign = qs('#rx-sign', el);
  const msg = qs('#rx-msg', el);
  const times = [];
  let errors = 0;
  let trial = 0;
  let state = 'idle'; // idle | wait | go | nogo | done
  let shownAt = 0;
  let timer = null;
  let expect = null;

  const next = () => {
    if (trial >= M.trials) { done(); return; }
    state = 'wait';
    pad.className = 'rx-pad wait';
    sign.textContent = '';
    msg.innerHTML = 'Warten …';
    const delay = 1200 + Math.random() * 2600;
    timer = setTimeout(show, delay);
  };
  const show = () => {
    msg.innerHTML = '';
    if (mode === 'gonogo' && Math.random() < 0.33) {
      state = 'nogo';
      pad.className = 'rx-pad nogo';
      sign.textContent = '✋';
      requestAnimationFrame(() => { shownAt = performance.now(); });
      timer = setTimeout(() => { trial += 1; qs('#rx-count', el).textContent = `${trial}/${M.trials}`; Sound.setDone(); next(); }, 1100);
      return;
    }
    state = 'go';
    if (mode === 'choice') {
      expect = Math.random() < 0.5 ? 'L' : 'R';
      pad.className = `rx-pad go choice ${expect}`;
      sign.textContent = expect === 'L' ? '⬅' : '➡';
    } else {
      pad.className = 'rx-pad go';
      sign.textContent = '';
    }
    requestAnimationFrame(() => { shownAt = performance.now(); });
  };
  const done = () => {
    state = 'done';
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null;
    const best = sorted.length ? Math.round(sorted[0]) : null;
    const prev = reactionStats().best;
    pad.className = 'rx-pad done';
    sign.textContent = '';
    msg.innerHTML = median ? `<span class="f-num rx-result">${median}<small> ms</small></span><br>Median · Bester Versuch ${best} ms${errors ? ` · ${errors} Fehler` : ''}<br><br><b>Tippen zum Beenden</b>` : 'Keine gültigen Versuche.<br><br><b>Tippen zum Schließen</b>';
    Sound.finish();
    if (median) Store.addReaction({ id: uidShort(), at: new Date().toISOString(), mode, median, best, errors, trials: times.map(Math.round) });
    el.dataset.median = median || '';
    el.dataset.pb = mode === 'simple' && median && (!prev || median < prev.median) ? '1' : '';
  };

  pad.addEventListener('pointerdown', (e) => {
    const now = performance.now();
    if (state === 'idle') { Sound.tap(); next(); return; }
    if (state === 'done') { close(); return; }
    if (state === 'wait') {
      clearTimeout(timer);
      errors += 1;
      Sound.remove();
      pad.className = 'rx-pad early';
      msg.innerHTML = 'Zu früh!';
      timer = setTimeout(next, 900);
      state = 'pause';
      return;
    }
    if (state === 'nogo') {
      clearTimeout(timer);
      errors += 1;
      trial += 1;
      qs('#rx-count', el).textContent = `${trial}/${M.trials}`;
      Sound.remove();
      pad.className = 'rx-pad early';
      msg.innerHTML = 'Rot – nicht tippen!';
      state = 'pause';
      timer = setTimeout(next, 900);
      return;
    }
    if (state === 'go') {
      const rt = now - shownAt;
      if (mode === 'choice') {
        const side = e.clientX < window.innerWidth / 2 ? 'L' : 'R';
        if (side !== expect) { errors += 1; Sound.remove(); } else times.push(rt);
      } else times.push(rt);
      trial += 1;
      qs('#rx-count', el).textContent = `${trial}/${M.trials}`;
      Sound.rep();
      pad.className = 'rx-pad hit';
      sign.textContent = '';
      msg.innerHTML = `<span class="f-num rx-ms">${Math.round(rt)}<small> ms</small></span>`;
      state = 'pause';
      timer = setTimeout(next, 800);
    }
  });

  const close = () => {
    clearTimeout(timer);
    el.classList.remove('open');
    el.classList.add('closing');
    setTimeout(() => el.remove(), 300);
    fx.ctx.render();
    if (state === 'done' && el.dataset.pb) {
      const r = grantXp({ kind: 'reaction', xp: 20, icon: '⚡', kicker: 'Neuer Bestwert', title: `Reaktion ${el.dataset.median} ms`, sub: 'Schneller als je zuvor.', big: false });
      const ch = checkChallenges();
      celebrate([...r.events, ...ch.events], r.before, () => fx.ctx.render());
    } else if (state === 'done') {
      const ch = checkChallenges();
      if (ch.events.length) celebrate(ch.events, ch.before, () => fx.ctx.render());
    }
  };
  qs('[data-x]', el).addEventListener('click', () => { state = state === 'done' ? 'done' : 'aborted'; close(); });
}

// ---------- Reflex-Drill (ganzer Körper) ----------
const CUES = [
  { sign: '⬅', color: '#4d8dff', text: 'Slip links', say: 'Links' },
  { sign: '➡', color: '#4d8dff', text: 'Slip rechts', say: 'Rechts' },
  { sign: '⬇', color: '#ffb020', text: 'Abtauchen', say: 'Runter' },
  { sign: '■', color: '#ffffff', text: 'Block', say: 'Block' },
  { sign: '●', color: '#ff2e3e', text: 'Konter: 1 – 2', say: 'Konter' },
  { sign: '▲', color: '#30d158', text: 'Check', say: 'Check' },
];

export function startReflexDrill({ rounds = 3, seconds = 60, voice = false } = {}) {
  const segments = [{ kind: 'prep', seconds: 8, label: 'Reflex-Drill', sub: 'In Stellung. Reagiere auf Pfeile und Farben – so schnell wie möglich.' }];
  for (let r = 0; r < rounds; r += 1) {
    segments.push({
      kind: 'work', seconds, round: r + 1, rounds, label: `Runde ${r + 1}`, sub: r === 0 ? 'Mit Ansage' : r === 1 ? 'Nur Zeichen – keine Ansage' : 'Schneller!',
      onTick: (t, p) => {
        const gap = r === 2 ? 1.1 : 1.6;
        if (p.reflexNext === undefined || p.reflexRound !== r) { p.reflexNext = 1.5; p.reflexRound = r; }
        if (t < p.reflexNext) return;
        const cue = CUES[Math.floor(Math.random() * (r === 0 ? 4 : CUES.length))];
        p.reflexNext = t + gap + Math.random() * gap;
        p.dom.callout.innerHTML = `<div class="rx-cue" style="--c:${cue.color}"><span>${cue.sign}</span><small>${cue.text}</small></div>`;
        p.dom.callout.classList.remove('pop');
        void p.dom.callout.offsetWidth;
        p.dom.callout.classList.add('pop');
        Sound.beep(true);
        if (r === 0 || voice) speak(cue.say, { rate: 1.25 });
        p.reflexCount = (p.reflexCount || 0) + 1;
      },
    });
    if (r < rounds - 1) segments.push({ kind: 'rest', seconds: 30, round: r + 1, rounds, label: 'Pause' });
  }
  startSession({ type: 'reflex', title: 'Reflex-Drill', segments, figure: null, logExtra: (p) => ({ cues: p.reflexCount || 0 }) });
}
