// Technik-Tab: Gürtel mit Weg zur Prüfung, Lehrplan als Pfad mit dem Stand
// jeder Technik, fällige Wiederholungen, Kombinationen und eigener Baukasten.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { Store } from '../storage.js';
import { fx, qs, qsa, escapeHtml, plural, uidShort, remountSheet } from './core.js';
import { TECH, TECHNIQUES, BELTS, COMBOS, techniquesOfBelt, comboLabel, CATEGORY_LABEL } from './data-tech.js';
import { getProgress, techStates, beltStatus, dueReviews, comboPool, coachPool, STATE_LABEL } from './progress.js';
import { openViewer, stateRing } from './viewer.js';
import { tokensOf } from './coach.js';
import { tokenHtml } from './player.js';

export function beltHtml(belt, size = '') {
  return `<span class="f-belt ${size}" style="--belt:${belt.color};--ink:${belt.ink}"><i></i><b></b></span>`;
}

export function renderTech() {
  const p = getProgress();
  const st = beltStatus(p);
  const states = techStates(p);
  const due = dueReviews(p);
  const R = 2 * Math.PI * 30;

  const hero = `
    <section class="card f-belt-hero" style="--belt:${st.belt.color}">
      <div class="f-belt-hero-top">
        ${beltHtml(st.belt, 'xl')}
        <div class="f-belt-hero-text">
          <span class="f-cap muted small">Dein Grad</span>
          <strong class="f-belt-name">${st.belt.name}</strong>
          <span class="muted small">${escapeHtml(st.belt.focus)}</span>
        </div>
      </div>
      ${st.next ? `
        <div class="f-exam">
          <div class="f-exam-ring">
            <svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" class="bg"/><circle cx="36" cy="36" r="30" class="fg" stroke-dasharray="${R}" stroke-dashoffset="${R * (1 - st.progress)}" style="stroke:${st.next.color}"/></svg>
            <b class="f-num">${Math.round(st.progress * 100)}<small>%</small></b>
          </div>
          <div class="f-exam-text">
            <strong>Prüfung zum ${st.next.name}</strong>
            <span class="muted small">${st.practiced}/${st.list.length} Techniken geübt · ${Math.min(st.sessions, st.needSessions)}/${st.needSessions} Einheiten · ${Math.min(st.daysSince, st.belt.minDays)}/${st.belt.minDays} Tage</span>
            ${st.ready ? '' : `<span class="small f-exam-missing">${escapeHtml(st.missing.join(' · '))}</span>`}
          </div>
        </div>
        <button class="btn ${st.ready ? 'btn-primary' : 'f-btn-dark'} full f-bigbtn" data-t="exam" ${st.ready ? '' : 'disabled'}>${Icon.belt} ${st.ready ? 'Gürtelprüfung starten' : 'Prüfung noch gesperrt'}</button>`
        : '<p class="muted small">Alle Gürtel geschafft. Jetzt geht es um Feinschliff – der Coach hält alles frisch.</p>'}
    </section>`;

  const review = due.length ? `
    <section class="card f-review">
      <div class="f-review-head"><span class="f-review-icon">${Icon.repeat}</span>
        <div><strong>Wiederholung fällig</strong><span class="muted small">${plural(due.length, 'Technik war', 'Techniken waren')} länger nicht dran – sonst verblassen sie.</span></div></div>
      <div class="f-chips">${due.slice(0, 8).map((t) => `<button class="f-chip" data-open="${t.id}">${escapeHtml(t.name)}</button>`).join('')}</div>
      <button class="btn btn-primary full" data-t="review">${Icon.play} Wiederholen · 3 × 2 Min</button>
    </section>` : '';

  const path = BELTS.map((belt, bi) => {
    const list = techniquesOfBelt(bi);
    if (!list.length && bi !== BELTS.length - 1) return '';
    const status = bi < p.belt ? 'done' : bi === p.belt ? 'current' : 'locked';
    const nodes = list.map((t) => {
      const s = states[t.id];
      const due = s.fresh.due;
      return `
        <button class="f-node s${s.state} ${due ? 'due' : ''} ${status}" data-open="${t.id}" style="--fade:${s.fresh.fade}">
          <span class="f-node-ring">${stateRing(s.state)}<b>${escapeHtml(t.code)}</b></span>
          <span class="f-node-text"><strong>${escapeHtml(t.name)}</strong><span>${status === 'locked' ? escapeHtml(CATEGORY_LABEL[t.cat]) : due ? 'Wiederholen' : STATE_LABEL[s.state]}</span></span>
          ${status === 'locked' ? Icon.lock : Icon.chevron}
        </button>`;
    }).join('');
    return `
      <div class="f-path-belt ${status}" style="--belt:${belt.color}">
        <div class="f-path-head">${beltHtml(belt)}<strong>${belt.name}</strong>
          <span class="muted small">${status === 'done' ? 'bestanden' : status === 'current' ? 'aktuell' : bi === p.belt + 1 ? 'als Nächstes' : ''}</span></div>
        ${nodes ? `<div class="f-path-nodes">${nodes}</div>` : '<p class="muted small f-path-empty">Keine neuen Techniken – alles muss sitzen.</p>'}
      </div>`;
  }).join('');

  const pool = comboPool(p);
  const custom = Store.getFightCombos();
  const combos = pool.slice(0, 40).map((c) => `
    <button class="list-item selectable f-combo-row" data-combo="${c.seq.join(',')}">
      <span class="f-combo-tokens">${tokensOf(c.seq).map((tk, i) => tokenHtml(tk, i)).join('')}</span>
      ${c.custom ? '<span class="f-pill">eigene</span>' : c.tag === 'counter' ? '<span class="f-pill teal">Konter</span>' : ''}
    </button>`).join('');

  return `
    ${hero}
    ${review}
    <section>
      <div class="f-sec-row"><div class="f-sec">Lehrplan</div><span class="muted small">${TECHNIQUES.length} Techniken · 7 Grade</span></div>
      <div class="f-path">${path}</div>
    </section>
    <section>
      <div class="f-sec-row"><div class="f-sec">Kombinationen</div><button class="f-link" data-t="builder">${Icon.plus} Eigene</button></div>
      ${combos ? `<div class="card list f-combos">${combos}</div>` : '<div class="card f-empty"><strong>Noch keine Kombinationen</strong>Schau dir Jab und Cross an – dann geht es los.</div>'}
      ${custom.length ? `<p class="muted small" style="margin:8px 4px 0">${plural(custom.length, 'eigene Kombination', 'eigene Kombinationen')} – der Coach sagt sie mit an.</p>` : ''}
    </section>`;
}

export function bindTech(root) {
  qsa('[data-open]', root).forEach((b) => b.addEventListener('click', () => openViewer(b.dataset.open)));
  qsa('[data-combo]', root).forEach((b) => b.addEventListener('click', () => openViewer(b.dataset.combo.split(','))));
  qs('[data-t="builder"]', root)?.addEventListener('click', () => openBuilder());
  qs('[data-t="exam"]', root)?.addEventListener('click', () => import('./exam.js').then((m) => m.openExamIntro()));
  qs('[data-t="review"]', root)?.addEventListener('click', () => {
    import('./start.js').then((m) => m.startShadow({ rounds: 3, roundSec: 120, restSec: 45, themes: ['review', 'review', 'combos'], title: 'Wiederholung' }));
  });
}

// ---------- Eigene Kombination ----------
function openBuilder(seq = []) {
  const pool = coachPool(getProgress());
  const draw = () => {
    const tokens = seq.length ? tokensOf(seq).map((tk, i) => tokenHtml(tk, i)).join('') : '<span class="muted small">Tippe unten Techniken in der richtigen Reihenfolge an (2–6).</span>';
    return `
      <div class="f-build-seq">${tokens}</div>
      <div class="f-build-actions">
        <button class="btn btn-small f-btn-dark" data-b="undo" ${seq.length ? '' : 'disabled'}>Letzte entfernen</button>
        <button class="btn btn-small f-btn-dark" data-b="preview" ${seq.length >= 2 ? '' : 'disabled'}>${Icon.eye} In 3D ansehen</button>
      </div>
      ${['punch', 'kick', 'knee', 'defense', 'footwork'].map((cat) => {
        const list = pool.filter((t) => t.cat === cat);
        if (!list.length) return '';
        return `<div class="f-sec" style="margin-top:12px">${CATEGORY_LABEL[cat]}</div>
          <div class="f-chips">${list.map((t) => `<button class="f-chip" data-add="${t.id}"><b>${escapeHtml(t.code)}</b> ${escapeHtml(t.name)}</button>`).join('')}</div>`;
      }).join('')}
      ${pool.length < 3 ? '<p class="muted small">Mehr Techniken werden frei, sobald du sie im Lehrplan angeschaut hast.</p>' : ''}`;
  };
  const mount = () => remountSheet(() => {
    fx.ctx.openSheet('Eigene Kombination', draw(), {
      footer: `<button class="btn btn-primary full" data-b="save" ${seq.length >= 2 ? '' : 'disabled'}>Speichern</button>`,
      onMount: (root) => {
        qsa('[data-add]', root).forEach((b) => b.addEventListener('click', () => {
          if (seq.length >= 6) { fx.ctx.toast('Höchstens 6 Techniken'); return; }
          seq.push(b.dataset.add);
          Sound.setDone();
          mount();
        }));
        qs('[data-b="undo"]', root)?.addEventListener('click', () => { seq.pop(); mount(); });
        qs('[data-b="preview"]', root)?.addEventListener('click', () => { fx.ctx.closeSheet(); openViewer([...seq]); });
        qs('[data-b="save"]', root)?.addEventListener('click', () => {
          const list = Store.getFightCombos();
          if ([...COMBOS, ...list].some((c) => c.seq.join() === seq.join())) { fx.ctx.toast('Diese Kombination gibt es schon'); return; }
          list.push({ id: `u${uidShort()}`, seq: [...seq], belt: Math.max(...seq.map((id) => TECH[id].belt)), custom: true });
          Store.saveFightCombos(list);
          fx.ctx.closeSheet();
          fx.ctx.toast(`Gespeichert: ${comboLabel(seq)} – kommt jetzt im Coach`);
          fx.ctx.render();
        });
      },
    });
  });
  mount();
}
