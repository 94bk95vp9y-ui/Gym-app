// Startseite „Heute“ im Fight-Modus.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { Store } from '../storage.js';
import { fx, qs, qsa, escapeHtml, plural, getProfile, weekSummary, fmtClock, fmtKm, fmtDay, FIGHT_TYPES, southpaw } from './core.js';
import { TECH, BELTS, clipOf } from './data-tech.js';
import { getProgress, beltStatus, nextToLearn, dueReviews, comboPool, techEntry, stateOf, STATE_LABEL } from './progress.js';
import { todayPlan, runPlan } from './plan.js';
import { athleteLevel } from '../challenges.js';
import { openViewer } from './viewer.js';
import { beltHtml } from './tech.js';
import { RUN_TYPES } from './endu-data.js';

let hero = null; // laufende 3D-Szene

export function leaveHome() {
  if (hero) { hero.stage.dispose(); hero = null; }
}

const LETTERS = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];

export function renderHome() {
  const profile = getProfile();
  const p = getProgress();
  const st = beltStatus(p);
  const lvl = athleteLevel();
  const plan = todayPlan();
  const week = weekSummary();
  const active = Store.getActive();
  const due = dueReviews(p);
  const next = nextToLearn(p);
  const tod = due[0] || next || TECH.jab;
  const todEntry = techEntry(tod.id, p);
  const recent = [
    ...Store.getFightLog().filter((f) => f.type !== 'reaction').map((f) => ({ ...f, area: 'fight' })),
    ...Store.getRuns().map((r) => ({ ...r, area: 'run' })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);

  const today = `${fx.ctx.renderSupplementCard()}${fx.ctx.renderMobilityCard()}`;

  return `
    ${active ? `<button class="f-gym-live" data-h="gym">${Icon.dumbbell}<span><strong>Gym-Training läuft</strong><span>${escapeHtml(active.routineName || 'Freies Training')} – zurück zum Gym</span></span>${Icon.chevron}</button>` : ''}
    <section class="f-hero">
      <div class="f-hero-stage" id="f-hero-stage"></div>
      <div class="f-hero-top">
        <button class="f-hero-belt" data-h="belt">${beltHtml(st.belt)}<span>${st.belt.name}</span></button>
        <span class="f-hero-level"><b class="f-num">${lvl.level}</b><span>${lvl.title}</span></span>
      </div>
      <div class="f-hero-tap">Figur antippen – sie zeigt eine Kombination</div>
      <div class="f-today ${plan.tone || ''}">
        <span class="f-cap f-today-kicker">Heute dran</span>
        <div class="f-today-row">
          <span class="f-today-icon">${plan.icon}</span>
          <div class="f-today-text"><strong>${escapeHtml(plan.title)}</strong><span>${escapeHtml(plan.sub)}</span></div>
        </div>
        <p class="f-today-why">${escapeHtml(plan.why)}</p>
        <div class="f-today-actions">
          <button class="btn ${plan.tone === 'teal' ? 'f-btn-teal' : 'btn-primary'} f-bigbtn" data-h="go" data-nosound>${Icon.play} ${escapeHtml(plan.actionLabel || 'Los')}</button>
          <button class="btn f-btn-dark" data-h="other">Andere Einheit</button>
        </div>
      </div>
    </section>

    <section class="card f-week">
      <div class="f-sec-row"><div class="f-sec">Deine Woche</div><span class="muted small">${week.minutes} Min · Gym, Kampfsport & Ausdauer</span></div>
      <div class="f-week-days">${week.days.map((d, i) => `
        <div class="f-wd ${i === week.today ? 'today' : ''} ${i > week.today ? 'future' : ''}">
          <span class="f-wd-l">${LETTERS[i]}</span>
          <span class="f-wd-dots">${d.gym ? '<i class="gym"></i>' : ''}${d.fight ? '<i class="fight"></i>' : ''}${d.run ? '<i class="run"></i>' : ''}${!d.gym && !d.fight && !d.run ? '<i class="none"></i>' : ''}</span>
        </div>`).join('')}</div>
      <div class="f-week-goals">
        ${goalHtml('Kampfsport', week.fight.length, profile.fightPerWeek, 'fight')}
        ${goalHtml('Ausdauer', week.run.length, profile.runPerWeek, 'run')}
        <div class="f-week-stat"><b class="f-num">${week.rounds}</b><span>Runden</span></div>
        <div class="f-week-stat"><b class="f-num">${week.km.toLocaleString('de-DE', { maximumFractionDigits: 1 })}</b><span>km</span></div>
      </div>
      <div class="f-legend"><span><i class="gym"></i>Gym</span><span><i class="fight"></i>Kampfsport</span><span><i class="run"></i>Ausdauer</span></div>
    </section>

    <section class="f-quick">
      <button data-q="shadow"><span>🥊</span>Shadow&shy;boxing</button>
      <button data-q="timer"><span>⏱️</span>Runden&shy;timer</button>
      <button data-q="run"><span>🏃</span>Laufen</button>
      <button data-q="reaction"><span>⚡</span>Reaktion</button>
    </section>

    <section class="card f-tod" data-h="tod">
      <div class="f-tod-head">
        <span class="f-cap muted small">${due[0] ? 'Wiederholung fällig' : next ? 'Als Nächstes lernen' : 'Technik des Tages'}</span>
        <span class="f-pill ${due[0] ? 'gold' : 'red'}">${STATE_LABEL[stateOf(todEntry)]}</span>
      </div>
      <div class="f-tod-row">
        <span class="f-tod-code f-num">${escapeHtml(tod.code)}</span>
        <div><strong>${escapeHtml(tod.name)}</strong><p class="muted small">${escapeHtml(tod.cues[0])}</p></div>
      </div>
      <span class="f-link-row">${Icon.eye} In 3D ansehen ${Icon.chevron}</span>
    </section>

    ${today.trim() ? `<section class="f-daily"><div class="f-sec">Heute noch</div>${today}</section>` : ''}

    ${recent.length ? `
    <section>
      <div class="f-sec">Zuletzt</div>
      <div class="card list">${recent.map((e) => recentRow(e)).join('')}</div>
    </section>` : ''}`;
}

function goalHtml(label, done, goal, cls) {
  const ratio = Math.min(1, done / Math.max(1, goal));
  const R = 2 * Math.PI * 17;
  return `<div class="f-goal ${cls} ${done >= goal ? 'met' : ''}">
    <span class="f-goal-ring"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="bg"/><circle cx="20" cy="20" r="17" class="fg" stroke-dasharray="${R}" stroke-dashoffset="${R * (1 - ratio)}"/></svg><b class="f-num">${done}</b></span>
    <span><strong>${label}</strong><span>${done}/${goal}</span></span></div>`;
}

function recentRow(e) {
  if (e.area === 'run') {
    const t = RUN_TYPES.find((x) => x.id === e.type) || RUN_TYPES[0];
    return `<div class="list-item"><span class="f-run-icon">${t.icon}</span><div class="list-item-main"><strong>${e.distance ? fmtKm(e.distance) : fmtClock(e.seconds)}</strong><span class="muted small">${fmtDay(e.at)} · ${fmtClock(e.seconds)}</span></div></div>`;
  }
  const t = FIGHT_TYPES[e.type] || { label: e.type, icon: '🥊' };
  return `<div class="list-item"><span class="f-run-icon fight">${t.icon}</span><div class="list-item-main"><strong>${escapeHtml(e.title || t.label)}</strong><span class="muted small">${fmtDay(e.at)} · ${Math.max(1, Math.round(e.seconds / 60))} Min${e.rounds ? ` · ${plural(e.rounds, 'Runde', 'Runden')}` : ''}${e.rpe ? ` · Anstrengung ${e.rpe}` : ''}</span></div></div>`;
}

export function bindHome(root) {
  const plan = todayPlan();
  qs('[data-h="go"]', root)?.addEventListener('click', () => { Sound.boxBell(1); runPlan(plan.action); });
  qs('[data-h="other"]', root)?.addEventListener('click', () => import('./start.js').then((m) => m.openStartSheet()));
  qs('[data-h="belt"]', root)?.addEventListener('click', () => import('./index.js').then((m) => m.goTab('tech')));
  qs('[data-h="gym"]', root)?.addEventListener('click', () => { fx.ctx.openGymWorkout(); fx.ctx.switchMode('gym'); });
  qs('[data-h="tod"]', root)?.addEventListener('click', () => {
    const p = getProgress();
    const tod = dueReviews(p)[0] || nextToLearn(p) || TECH.jab;
    openViewer(tod.id);
  });
  qsa('[data-q]', root).forEach((b) => b.addEventListener('click', async () => {
    const q = b.dataset.q;
    if (q === 'shadow') (await import('./start.js')).openShadowSetup();
    else if (q === 'timer') (await import('./start.js')).openTimerSetup();
    else if (q === 'run') (await import('./endurance.js')).openRunStart();
    else if (q === 'reaction') (await import('./reaction.js')).openReaction();
  }));
  fx.ctx.bindSupplementCard?.();
  fx.ctx.bindMobilityCard?.(root);
  mountHero(root);
}

async function mountHero(root) {
  const box = qs('#f-hero-stage', root);
  if (!box) return;
  if (hero) {
    // Szene weiterverwenden: nur neu einhängen (und nach einem Tabwechsel
    // die angehaltene Schleife wieder starten)
    hero.stage.mount(box);
    hero.fig.setBelt(BELTS[getProgress().belt].color);
    hero.stage.start(hero.stage.frameFn);
    return;
  }
  const [{ FightStage, LOOKS }, { Performer }, { singleTimeline, comboTimeline }] = await Promise.all([
    import('./figure.js'), import('./performer.js'), import('./anim.js'),
  ]);
  if (!box.isConnected) return;
  const stage = new FightStage({ ring: true, spot: true });
  const fig = stage.add(LOOKS.fighter);
  fig.setBelt(BELTS[getProgress().belt].color);
  const perf = new Performer(stage, fig, { mirror: southpaw(), chain: false });
  const idle = singleTimeline(clipOf('stance'), { lead: 0, tail: 0 });
  perf.setTimeline(idle);
  stage.view({ az: 8, el: 8, target: [0, 0.9, 0.05], radius: 1.08, sway: true });
  stage.mount(box);
  hero = { stage, fig, perf, t: 0, comboStart: null, frame: 0 };
  const h = hero;
  stage.enableDrag((kind) => {
    if (kind !== 'tap') return;
    // Antippen: eine Kombination aus dem eigenen Können
    const pool = comboPool();
    const combo = pool.length ? pool[Math.floor(Math.random() * pool.length)] : { seq: ['jab', 'cross'] };
    h.perf.setTimeline(comboTimeline(combo.seq.map((id) => clipOf(id)), { lead: 0.1, tail: 0.5 }));
    h.comboStart = h.t;
    h.whooshes = comboTimeline(combo.seq.map((id) => clipOf(id)), { lead: 0.1, tail: 0.5 }).items.map((it) => it.start + (it.clip.impact ?? 0.2));
    qs('.f-hero-tap', box.parentElement)?.classList.add('gone');
  });
  stage.start((dt) => {
    h.t += dt;
    if (h.comboStart !== null) {
      const local = h.t - h.comboStart;
      if (h.whooshes?.length && local >= h.whooshes[0]) { h.whooshes.shift(); Sound.whoosh(); }
      if (local > h.perf.timeline.dur) { h.comboStart = null; h.perf.setTimeline(idle); }
      h.perf.update(h.comboStart !== null ? local : h.t);
    } else h.perf.update(h.t);
  });
}

document.addEventListener('visibilitychange', () => {
  if (!hero) return;
  if (document.visibilityState === 'hidden') hero.stage.stop();
  else if (hero.stage.canvas.isConnected) hero.stage.start(hero.stage.frameFn);
});
