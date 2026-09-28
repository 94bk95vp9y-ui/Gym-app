// Gürtelprüfung: drei Runden (Techniken einzeln, Kombinationen, Kampfrunde),
// danach ein ehrlicher Selbst-Check – zu jeder Technik der wichtigste
// Merkpunkt. Bestanden mit allen Runden und mindestens 80 % der Punkte.
// Danach die Zeremonie: die Figur bekommt den neuen Gürtel.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { fx, qs, escapeHtml } from './core.js';
import { BELTS, techniquesOfBelt } from './data-tech.js';
import { beltStatus, passExam, failExam, getProgress } from './progress.js';
import { examPlan } from './coach.js';
import { startSession } from './player.js';
import { speak } from './voice.js';
import { grantXp, celebrate, checkChallenges } from '../challenges.js';
import { promotionEvents } from './rewards.js';

export function openExamIntro() {
  const st = beltStatus();
  if (!st.ready || !st.next) { fx.ctx.toast(st.missing.join(' · ') || 'Noch nicht bereit'); return; }
  const techs = techniquesOfBelt(st.index).filter((t) => t.cat !== 'stance');
  fx.ctx.openSheet(`Prüfung · ${st.next.name}`, `
    <div class="f-exam-intro" style="--belt:${st.next.color}">
      <div class="f-exam-belts"><span class="f-belt xl" style="--belt:${st.belt.color}"><i></i><b></b></span>${Icon.chevron}<span class="f-belt xl" style="--belt:${st.next.color}"><i></i><b></b></span></div>
      <p>Drei Runden à 2 Minuten, dann ein ehrlicher Selbst-Check. Am besten vor dem Spiegel.</p>
      <ol class="tv-cues">
        <li><strong>Techniken</strong> – jede einzeln, sauber und schnell.</li>
        <li><strong>Kombinationen</strong> – alle Kombis deines Gürtels.</li>
        <li><strong>Kampfrunde</strong> – hohes Tempo bis zum Gong.</li>
      </ol>
      <p class="muted small">Geprüft werden: ${techs.map((t) => escapeHtml(t.name)).join(', ')}.</p>
      <p class="muted small">Bestanden mit allen drei Runden und mindestens 80 % der Punkte im Selbst-Check.</p>
    </div>`, {
    footer: `<button class="btn btn-primary full f-bigbtn" data-go data-nosound>${Icon.belt} Prüfung starten</button>`,
    onMount: (root) => qs('[data-go]', root).addEventListener('click', () => { fx.ctx.closeSheet(); runExam(); }),
  });
}

function runExam() {
  const p = getProgress();
  const plan = examPlan(p.belt);
  const next = BELTS[p.belt + 1];
  const techs = techniquesOfBelt(p.belt).filter((t) => t.cat !== 'stance');
  Sound.boxBell(2);
  startSession({
    type: 'exam',
    title: `Prüfung · ${next.name}`,
    segments: plan.segments,
    coach: { mode: 'exam', tempo: 3, exam: { techniques: plan.techniques } },
    figure: null,
    selfCheck: { title: 'Sitzt es?', items: techs.map((t) => `${t.name}: ${t.cues[0]}`) },
    doneTitle: 'Prüfung beendet',
    logExtra: () => ({ belt: p.belt }),
    onDone: ({ promoted, checkResult, completed }) => {
      const ratio = checkResult ? checkResult.count / Math.max(1, checkResult.total) : 0;
      if (completed && ratio >= 0.8) {
        const r = passExam({ score: Math.round(ratio * 100) });
        ceremony(r, promoted);
      } else {
        failExam({ score: Math.round(ratio * 100), completed });
        fx.ctx.render();
        fx.ctx.openSheet('Noch nicht bestanden', `
          <p>${completed ? `Im Selbst-Check saßen ${Math.round(ratio * 100)} % – für den ${next.name} braucht es 80 %.` : 'Die Prüfung wurde vor dem Ende abgebrochen.'}</p>
          <p class="muted small">Kein Problem: Übe die Punkte, die noch wackeln, in ein, zwei Lektionen und versuch es morgen wieder. Gürtel sollen etwas bedeuten.</p>`, {
          footer: '<button class="btn btn-primary full" data-action="close-sheet">Verstanden</button>',
        });
      }
    },
  });
}

// ---------- Zeremonie ----------
async function ceremony({ from, to, xp }, promoted = []) {
  const belt = BELTS[to];
  const el = document.createElement('div');
  el.className = 'bc';
  el.style.setProperty('--belt', belt.color);
  el.innerHTML = `
    <div class="bc-rays"></div>
    <div class="bc-stage"></div>
    <div class="bc-text">
      <div class="bc-kicker">Prüfung bestanden</div>
      <h2 class="bc-title">${belt.name}</h2>
      <p class="bc-sub">${escapeHtml(BELTS[to].focus)}</p>
      <button class="btn btn-primary full f-bigbtn" data-bc="next">Weiter</button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  Sound.boxBell(3);
  setTimeout(() => Sound.unlock(), 600);
  speak(`Glückwunsch. ${belt.name}.`);

  let stage = null;
  try {
    const [{ FightStage, LOOKS }, { Performer }, { comboTimeline, singleTimeline }, { clipOf }, { southpaw }] = await Promise.all([
      import('./figure.js'), import('./performer.js'), import('./anim.js'), import('./data-tech.js'), import('./core.js'),
    ]);
    stage = new FightStage({ spot: true });
    const fig = stage.add(LOOKS.fighter);
    fig.setBelt(BELTS[from].color);
    const perf = new Performer(stage, fig, { mirror: southpaw(), chain: false });
    const combo = comboTimeline(['jab', 'cross', 'hook-lead'].map((id) => clipOf(id)), { lead: 1.2, tail: 1.4 });
    perf.setTimeline(combo);
    stage.view({ az: 20, el: 6, target: [0, 1.0, 0.1], radius: 1.1, sway: true });
    stage.mount(qs('.bc-stage', el));
    let t = 0;
    let swapped = false;
    stage.start((dt) => {
      t += dt;
      if (!swapped && t > 0.9) { swapped = true; fig.setBelt(belt.color); el.classList.add('lit'); }
      perf.update(t % combo.dur);
    });
  } catch { /* ohne 3D */ }

  qs('[data-bc="next"]', el).addEventListener('click', () => {
    stage?.dispose();
    el.classList.remove('open');
    el.classList.add('closing');
    setTimeout(() => el.remove(), 350);
    const award = grantXp({ kind: 'belt', xp, icon: '🥋', color: belt.color, kicker: 'Neuer Grad', title: belt.name, sub: `${BELTS[to].focus} – die neuen Techniken sind freigeschaltet.` });
    const promo = promotionEvents(promoted);
    const ch = checkChallenges();
    fx.ctx.render();
    celebrate([...award.events, ...promo.events, ...ch.events], award.before, () => fx.ctx.render());
  });
}
