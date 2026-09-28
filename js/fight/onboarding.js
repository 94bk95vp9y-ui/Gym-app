// Einrichtung beim ersten Öffnen des Fight-Modus (etwa eine Minute).
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { fx, qs, qsa, escapeHtml, getProfile, saveProfile } from './core.js';

let step = 0;
let draft = null;

const EST = [
  { v: null, l: 'Weiß ich nicht' },
  { v: 1260, l: 'unter 22 Min' },
  { v: 1410, l: '22–25 Min' },
  { v: 1590, l: '25–28 Min' },
  { v: 1800, l: '28–32 Min' },
  { v: 2040, l: 'über 32 Min' },
];

function seg(key, options, value) {
  return `<div class="f-seg onb-seg" data-k="${key}">${options.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

const STEPS = [
  {
    id: 'welcome',
    html: () => `
      <div class="onb-stage" id="onb-stage"></div>
      <div class="onb-copy">
        <div class="f-logo onb-logo">Fight</div>
        <h1>Kickboxen & Ausdauer</h1>
        <p>Von der ersten Kampfstellung bis zum Schwarzgurt – mit 3D-Techniken, einem Coach, der Runden ansagt, einem virtuellen Trainingspartner und Laufen mit GPS.</p>
        <p class="muted small">Eine Minute Einrichtung, damit alles zu dir und deinem Zimmer passt.</p>
      </div>`,
  },
  {
    id: 'stance',
    title: 'Deine Auslage',
    html: (d) => `
      <p class="onb-lead">Welcher Fuß steht vorn?</p>
      <div class="onb-cards">
        <button class="onb-card ${d.stance === 'orthodox' ? 'on' : ''}" data-set="stance" data-v="orthodox"><span class="onb-big">L</span><strong>Linksauslage</strong><small>Linker Fuß vorn. Für Rechtshänder – die schlagende rechte Hand steht hinten.</small></button>
        <button class="onb-card ${d.stance === 'southpaw' ? 'on' : ''}" data-set="stance" data-v="southpaw"><span class="onb-big">R</span><strong>Rechtsauslage</strong><small>Rechter Fuß vorn. Meist für Linkshänder.</small></button>
      </div>
      <p class="muted small">Alle Animationen werden passend gespiegelt. Später jederzeit änderbar.</p>
      <p class="onb-lead" style="margin-top:18px">Erfahrung im Kickboxen</p>
      ${seg('experience', [['none', 'Keine'], ['some', 'Etwas'], ['good', 'Einige Jahre']], d.experience)}`,
  },
  {
    id: 'room',
    title: 'Dein Zimmer',
    html: (d) => `
      <p class="onb-lead">Wie viel Platz hast du?</p>
      ${seg('space', [['small', 'Klein'], ['medium', '2–3 Schritte'], ['large', 'Viel']], d.space)}
      <p class="onb-lead">Musst du leise sein?</p>
      ${seg('quiet', [['never', 'Nein'], ['evening', 'Abends'], ['always', 'Immer']], d.quiet)}
      <p class="muted small">In der Leise-Zeit lässt die App Sprünge und den Sack weg.</p>
      <p class="onb-lead">Was hast du da?</p>
      <div class="onb-equip">${[['rope', '🪢', 'Springseil'], ['bag', '🎒', 'Wandsack'], ['dumbbells', '🏋️', 'Kurzhanteln'], ['mirror', '🪞', 'Spiegel'], ['gloves', '🥊', 'Handschuhe / Bandagen']].map(([k, e, l]) => `
        <button class="onb-eq ${d.equipment[k] ? 'on' : ''}" data-eq="${k}"><span>${e}</span>${l}<i>${Icon.check}</i></button>`).join('')}</div>`,
  },
  {
    id: 'endurance',
    title: 'Ausdauer',
    html: (d) => `
      <p class="onb-lead">Alter <span class="muted small">(für deine Pulszonen)</span></p>
      <div class="onb-age"><button data-age="-1">${Icon.minus}</button><b class="f-num" id="onb-age">${d.age}</b><button data-age="1">${Icon.plus}</button></div>
      <p class="onb-lead">Läufst du mit Pulsuhr?</p>
      ${seg('watch', [[true, 'Ja'], [false, 'Nein']], d.watch)}
      <p class="onb-lead">5 km schaffst du etwa in …</p>
      ${seg('runEstimate', EST.map((e) => [e.v, e.l]), d.runEstimate)}
      <p class="onb-lead">Was willst du mit Laufen erreichen?</p>
      ${seg('runGoal', [['fight', 'Kondition fürs Kämpfen'], ['5k', '5 km schneller'], ['base', 'Grundlage aufbauen']], d.runGoal)}`,
  },
  {
    id: 'week',
    title: 'Deine Woche',
    html: (d) => `
      <p class="muted small">Neben dem Gym. Lieber realistisch – Regelmäßigkeit schlägt Umfang.</p>
      <p class="onb-lead">Kampfsport pro Woche</p>
      ${seg('fightPerWeek', [[2, '2×'], [3, '3×'], [4, '4×'], [5, '5×']], d.fightPerWeek)}
      <p class="onb-lead">Ausdauer pro Woche</p>
      ${seg('runPerWeek', [[1, '1×'], [2, '2×'], [3, '3×']], d.runPerWeek)}
      <p class="onb-lead">Zeit pro Einheit</p>
      ${seg('sessionMinutes', [[20, '20 Min'], [30, '30 Min'], [45, '45 Min'], [60, '60 Min']], d.sessionMinutes)}`,
  },
  {
    id: 'done',
    html: (d) => `
      <div class="onb-done">
        <span class="f-belt xl" style="--belt:#f1f1f1;--ink:#111"><i></i><b></b></span>
        <h1>Weißgurt</h1>
        <p>Dein Start: Stellung, Beinarbeit, Jab und Cross. Der Coach sagt nur an, was du schon kennst – und jede Woche kommt mehr dazu.</p>
        <div class="onb-summary">
          <div><b class="f-num">${d.fightPerWeek}×</b><span>Kampfsport</span></div>
          <div><b class="f-num">${d.runPerWeek}×</b><span>Ausdauer</span></div>
          <div><b class="f-num">${d.sessionMinutes}</b><span>Min / Einheit</span></div>
        </div>
        <p class="muted small">Tipp: Fang mit der Lektion „Kampfstellung & Deckung“ an – am besten vor dem Spiegel.</p>
      </div>`,
  },
];

export function renderOnboarding() {
  if (!draft) draft = { ...getProfile() };
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return `
    <div class="onb" data-step="${s.id}">
      <header class="onb-top">
        ${step > 0 ? `<button class="fp-icon onb-back" data-onb="back" aria-label="Zurück">${Icon.chevron}</button>` : '<button class="f-mode onb-gym" data-onb="gym">' + Icon.dumbbell + '<span>Gym</span></button>'}
        <div class="onb-dots">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('')}</div>
        <span style="width:40px"></span>
      </header>
      <div class="onb-body">
        ${s.title ? `<h2 class="onb-title">${s.title}</h2>` : ''}
        ${s.html(draft)}
      </div>
      <footer class="onb-foot">
        <button class="btn btn-primary full f-bigbtn" data-onb="next" data-nosound>${step === 0 ? 'Los geht’s' : last ? `${Icon.bell} Fight-Modus starten` : 'Weiter'}</button>
      </footer>
    </div>`;
}

export function bindOnboarding(root) {
  const s = STEPS[step];
  qs('[data-onb="next"]', root).addEventListener('click', () => {
    if (step === STEPS.length - 1) {
      saveProfile({ ...draft, coach: { ...draft.coach, tempo: draft.experience === 'good' ? 3 : draft.experience === 'some' ? 2 : 1 }, setupDone: true });
      draft = null;
      step = 0;
      disposeStage();
      Sound.boxBell(2);
      fx.ctx.render();
      return;
    }
    step += 1;
    Sound.tap();
    disposeStage();
    fx.ctx.render();
  });
  qs('[data-onb="back"]', root)?.addEventListener('click', () => { step = Math.max(0, step - 1); disposeStage(); fx.ctx.render(); });
  qs('[data-onb="gym"]', root)?.addEventListener('click', () => { disposeStage(); fx.ctx.switchMode('gym'); });
  qsa('[data-set]', root).forEach((b) => b.addEventListener('click', () => {
    draft[b.dataset.set] = b.dataset.v;
    qsa(`[data-set="${b.dataset.set}"]`, root).forEach((x) => x.classList.toggle('on', x === b));
  }));
  qsa('.onb-seg', root).forEach((sg) => qsa('button', sg).forEach((b) => b.addEventListener('click', () => {
    const raw = b.dataset.v;
    draft[sg.dataset.k] = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : isNaN(+raw) ? raw : +raw;
    qsa('button', sg).forEach((x) => x.classList.toggle('on', x === b));
  })));
  qsa('[data-eq]', root).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.eq;
    draft.equipment = { ...draft.equipment, [k]: !draft.equipment[k] };
    b.classList.toggle('on', draft.equipment[k]);
  }));
  qsa('[data-age]', root).forEach((b) => b.addEventListener('click', () => {
    draft.age = Math.max(12, Math.min(80, (draft.age || 19) + +b.dataset.age));
    qs('#onb-age', root).textContent = draft.age;
  }));
  if (s.id === 'welcome') mountStage(root);
}

let stageRef = null;
function disposeStage() { stageRef?.dispose(); stageRef = null; }

async function mountStage(root) {
  const box = qs('#onb-stage', root);
  if (!box) return;
  const [{ FightStage, LOOKS }, { Performer }, { comboTimeline }, { clipOf, BELTS }] = await Promise.all([
    import('./figure.js'), import('./performer.js'), import('./anim.js'), import('./data-tech.js'),
  ]);
  if (!box.isConnected) return;
  const stage = new FightStage({ spot: true, ring: true });
  const fig = stage.add(LOOKS.fighter);
  fig.setBelt(BELTS[0].color);
  const perf = new Performer(stage, fig, { chain: false });
  const tl = comboTimeline(['jab', 'cross', 'hook-lead', 'lowkick'].map((id) => clipOf(id)), { lead: 0.8, tail: 1.2 });
  perf.setTimeline(tl);
  stage.view({ az: 24, el: 8, target: [0, 1.0, 0.15], radius: 1.1, sway: true });
  stage.mount(box);
  stageRef = stage;
  let t = 0;
  stage.start((dt) => { t += dt; perf.update(t % tl.dur); });
}

export { escapeHtml };
