// Steigerung im Bild: Ziel-Karte im Training, Ergebnis nach der Übung, Detail
// mit einer Leiter je Satz und den Einstellungen der Übung. Gerechnet wird in
// core/progression.js – hier geht es nur um Darstellung und Bedienung.
import { Store } from '../core/store.js';
import { formatNumber, formatWeight, unitLabel, loadUnit } from '../core/format.js';
import {
  REP_PRESETS, STEP_OPTIONS, ladder, repsAt, profileOf, progressionOf, levelsOf, loadOf, defaultLoad,
} from '../core/progression.js';
import { esc, registerActions } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { HAP } from '../ui/haptics.js';
import { openMenu } from '../ui/sheet.js';
import { render } from '../ui/router.js';
import { iconTile, chev, TINT } from '../ui/components.js';

const NB = ' ';
const strong = (text) => `<b>${esc(text)}</b>`;
const round2 = (n) => Math.round(n * 100) / 100;

function pauseText(days) {
  return days >= 60 ? `${Math.round(days / 30)} Monate` : `${Math.round(days / 7)} Wochen`;
}

export function rangeText(range) {
  return `${range[0]}–${range[1]}`;
}

export function nextWeightText(t, unit) {
  return t.loaded && t.weight > 0 ? formatWeight(round2(t.weight + t.step), unit) : 'Zusatzgewicht';
}

// Stand für die Leiter: erledigte Sätze zählen mit dem heutigen Wert, offene
// mit dem vom letzten Mal (dieselbe Zuordnung wie beim Vorbefüllen)
export function liveSets(sets, prev) {
  return sets.map((s, i) => {
    if (s.done) return s;
    const p = prev.length ? prev[Math.min(i, prev.length - 1)] : null;
    return p ? { weight: p.weight || 0, reps: p.reps, done: false } : null;
  }).filter(Boolean);
}

// Bei diesen Zielen bleibt das Gewicht – die Leiter zeigt den Weg nach oben
const SAME_WEIGHT = new Set(['build', 'hold', 'plateau', 'addLoad']);

// ---------- Ziel vor bzw. während der Übung ----------
// Eine Zeile, zwei Fragen: Was mache ich heute? (fett) und wofür? (grau,
// „Nächste Stufe: 3 × 12 → 65 kg“). Die Punkte rechts sind die Arbeitssätze –
// voll, sobald ein Satz die Stufe schafft. Wo genau das Plus hingehört, steht
// als „+1“ direkt am Satz.

// Punkte aus der Leiter: on = Stufe geschafft, done = erledigt, darunter
function dotsOf(segs, all = false) {
  return (segs || []).slice(0, 8).map((s) => (all || s.fill >= 1 ? 'on' : s.done ? 'done' : ''));
}

function stageText(t, n, top, unit) {
  return `Nächste Stufe: ${n}${NB}×${NB}${top} → ${nextWeightText(t, unit)}`;
}

export function targetView(t, baseUnit, { sets = [], prev = [] } = {}) {
  if (!t) return null;
  const unit = loadUnit(baseUnit, t.load);
  const [lo, hi] = t.range;
  const kg = (v) => formatWeight(v, unit);
  const side = t.load === 'side' ? t.offset || 0 : 0;
  const pct = (w, from) => Math.round((1 - (w + side) / (from + side)) * 100);
  switch (t.kind) {
    case 'first':
      return {
        tone: 'muted',
        icon: Icon.target,
        title: 'Erstes Mal',
        sub: t.loaded ? `Gewicht für ${lo}–${hi} saubere Wdh wählen` : `${lo}–${hi} saubere Wdh`,
      };
    case 'increase':
      return {
        tone: 'up',
        icon: Icon.trendUp,
        title: `Mehr Gewicht: ${strong(kg(t.weight))}`,
        sub: `+${formatNumber(t.step)}${NB}${unit} · letztes Mal alle Sätze geschafft`,
      };
    case 'addLoad':
      return {
        tone: 'up',
        icon: Icon.trendUp,
        title: `Bereit für ${strong('Zusatzgewicht')}`,
        sub: `Alle Sätze mit ${hi}+ Wdh – z. B. mit ${kg(t.step)} anfangen`,
        dots: dotsOf(ladder(t, liveSets(sets, prev)).segs),
      };
    case 'comeback':
      return {
        tone: 'calm',
        icon: Icon.restore,
        title: t.lighter ? `Wiedereinstieg mit ${strong(kg(t.weight))}` : `Wiedereinstieg: ${strong('etwas weniger Wdh')}`,
        sub: `${pauseText(t.days)} Pause${t.lighter ? ` · −${pct(t.weight, t.from)}${NB}%` : ''} · locker reinkommen`,
      };
    case 'reset':
      return {
        tone: 'calm',
        icon: Icon.restore,
        title: `Neu aufbauen mit ${strong(kg(t.weight))}`,
        sub: `−${pct(t.weight, t.from)}${NB}% · die Wdh steigen jetzt schnell`,
        actions: [{ label: 'Rückgängig', choice: '', plain: true }],
      };
    default:
      break;
  }
  const L = ladder(t, liveSets(sets, prev));
  const n = L.segs.length || sets.length || 3;
  const stage = stageText(t, n, t.top, unit);
  if (t.kind === 'plateau') {
    return {
      tone: 'warn',
      icon: Icon.plateau,
      title: t.falling ? 'Leistung sinkt' : 'Plateau',
      sub: t.reset ? `Seit ${t.falling ? 3 : 6} Einheiten kein Plus` : `Seit ${t.falling ? 3 : 6} Einheiten kein Plus – leichtere Woche oder andere Variante`,
      actions: t.reset ? [{ label: 'Neu aufbauen', choice: 'reset' }] : [],
    };
  }
  if (t.kind === 'hold') {
    return {
      tone: 'accent', icon: Icon.flag, title: `Heute ${t.weight > 0 ? strong(kg(t.weight)) : 'das Niveau'} halten`, sub: stage, dots: dotsOf(L.segs),
    };
  }
  return {
    tone: 'accent',
    icon: Icon.arrowUp,
    title: `Heute ${strong(`${t.pace === 2 ? 2 : 1} Wdh mehr`)}`,
    sub: stage,
    dots: dotsOf(L.segs),
  };
}

// ---------- Nach der Übung ----------
// Leiter für das Ergebnis: Bezug ist das heutige Gewicht. Bei einer
// geschafften Stufe zeigt „next“ schon das neue Gewicht – bei großen Sprüngen
// zählten die heutigen Sätze dann nicht mehr als Arbeitssätze.
function outcomeLadder(o) {
  const ref = o.next.kind === 'increase' ? { ...o.next, weight: o.today.top, top: o.next.reached } : o.next;
  return { ref, L: ladder(ref, o.today.done) };
}

export function outcomeView(o, baseUnit) {
  if (!o) return null;
  const { next, today, delta } = o;
  const unit = loadUnit(baseUnit, next.load);
  const kg = (v) => formatWeight(v, unit);
  const { L } = outcomeLadder(o);
  if (next.kind === 'increase' || next.kind === 'addLoad') {
    return {
      tone: 'up',
      icon: Icon.trophy,
      title: `${strong('Stufe geschafft!')}`,
      sub: next.kind === 'increase' ? `Nächstes Mal ${kg(next.weight)}` : 'Nächstes Mal mit Zusatzgewicht',
      dots: dotsOf(L.segs, true),
      levelUp: true,
    };
  }
  const n = L.segs.length || today.work.length;
  let v = { tone: 'muted', icon: Icon.check, title: 'Wie letztes Mal' };
  if (delta?.kind === 'new') v = { tone: 'muted', icon: Icon.target, title: 'Erste Einheit geschafft' };
  else if (delta?.kind === 'weight' && delta.delta > 0) v = { tone: 'up', icon: Icon.trendUp, title: `Neues Gewicht: ${strong(kg(today.top))}` };
  else if (delta?.kind === 'reps' && delta.delta > 0) v = { tone: 'accent', icon: Icon.flame, title: `${strong(`+${delta.delta} Wdh`)} mehr als letztes Mal` };
  else if (delta?.kind === 'weight' && delta.delta < 0) v = { tone: 'muted', icon: Icon.restore, title: 'Leichter gestartet' };
  else if (delta?.kind === 'reps' && delta.delta < 0) v = { tone: 'muted', icon: Icon.arrowUp, title: 'Heute etwas weniger – kommt vor' };
  if (next.kind === 'plateau') v = { tone: 'warn', icon: Icon.plateau, title: 'Seit mehreren Einheiten kein Plus' };
  return { ...v, sub: stageText(next, n, next.top, unit), dots: dotsOf(L.segs) };
}

// Kleines Etikett für die zugeklappte Übung
export function outcomePill(o, baseUnit) {
  if (!o) return '';
  const unit = loadUnit(baseUnit, o.next.load, true);
  if (o.next.kind === 'increase') return `<span class="goal-pill up">${Icon.arrowUp}${esc(formatWeight(o.next.weight, unit))}</span>`;
  if (o.next.kind === 'addLoad') return `<span class="goal-pill up">${Icon.arrowUp}Gewicht</span>`;
  if (o.delta?.kind === 'weight' && o.delta.delta > 0) return `<span class="goal-pill up">+${esc(formatNumber(o.delta.delta))}${NB}${esc(unit)}</span>`;
  if (o.delta?.kind === 'reps' && o.delta.delta > 0) return `<span class="goal-pill">+${o.delta.delta}${NB}Wdh</span>`;
  return '';
}

// Eine Zeile für die Zusammenfassung: geschaffte Stufe oder die nächste Stufe
export function goalLineHtml(o, unit) {
  const v = outcomeView(o, unit);
  if (!v) return '';
  const text = v.levelUp ? strong(v.sub) : esc(v.sub);
  return `<span class="goal-line tone-${v.tone}">${v.levelUp ? Icon.arrowUp : dotsHtml(v.dots, 'goal-mini')}<span>${text}</span></span>`;
}

// Etikett in Listen (Plan): was beim nächsten Training ansteht
export function goalTagHtml(t, unit) {
  if (!t) return '';
  if (t.kind === 'increase') return `<span class="goal-tag up">${Icon.arrowUp}${esc(formatWeight(t.weight, loadUnit(unit, t.load, true)))}</span>`;
  if (t.kind === 'addLoad') return `<span class="goal-tag up">${Icon.arrowUp}Zusatzgewicht</span>`;
  if (t.kind === 'plateau') return `<span class="goal-tag warn">${Icon.plateau}Plateau</span>`;
  if (t.kind === 'comeback') return `<span class="goal-tag calm">${Icon.restore}Wiedereinstieg</span>`;
  return '';
}

// ---------- Bausteine ----------
function dotsHtml(dots, cls = 'goal-dots') {
  if (!dots?.length) return '';
  return `<span class="${cls}" aria-hidden="true">${dots.map((d) => `<i class="${d}"></i>`).join('')}</span>`;
}

// attrs: zusätzliche data-Attribute (z. B. data-ei) für Zeile und Knöpfe
export function goalCardHtml(v, { action = '', attrs = '' } = {}) {
  if (!v) return '';
  const actions = (v.actions || []).map((a) => `
    <button class="goal-act ${a.plain ? 'plain' : ''}" data-action="goal-choice" data-choice="${a.choice}" ${attrs}>${HAP}${esc(a.label)}</button>`).join('');
  const open = action ? `data-action="${action}" ${attrs} role="button" tabindex="0" aria-label="Details zur Steigerung"` : '';
  const done = (v.dots || []).filter((d) => d === 'on').length;
  const label = v.dots?.length ? ` aria-label="${done} von ${v.dots.length} Sätzen auf der Stufe"` : '';
  return `
    <div class="goal tone-${v.tone} ${v.levelUp ? 'level-up' : ''}" ${open}>
      <span class="goal-ic" aria-hidden="true">${v.icon}</span>
      <span class="goal-txt">
        <span class="goal-title">${v.title}</span>
        ${v.sub ? `<span class="goal-sub">${esc(v.sub)}</span>` : ''}
      </span>
      ${actions ? `<span class="goal-acts">${actions}</span>` : `<span class="goal-end"${label}>${dotsHtml(v.dots)}${chev}</span>`}
    </div>`;
}

// Erklärung der Regel für genau diese Übung
function ruleText(t, unit) {
  const kg = (v) => formatWeight(v, unit);
  const [, hi] = t.range;
  if (!t.loaded || !(t.weight > 0)) {
    return `Jedes Mal eine Wdh mehr – wer mehr schafft, bekommt größere Ziele. Schaffst du in jedem Satz ${hi} Wdh, ist Zusatzgewicht dran – oder eine schwerere Variante.`;
  }
  const big = t.top > hi
    ? ` ${kg(t.step)} sind bei ${kg(t.weight)} ein großer Sprung (+${Math.round((t.step / (t.weight + (t.offset || 0))) * 100)} %) – deshalb erst bei ${t.top} statt ${hi} Wdh.`
    : '';
  const start = t.kind === 'increase'
    ? `Mit ${kg(t.weight)} sind etwa ${Math.min(hi, repsAt(t.from + (t.offset || 0), t.reached, t.weight + (t.offset || 0)))} Wdh drin. `
    : '';
  return `${start}Bleib bei ${kg(t.weight)}, bis jeder Satz ${t.top} Wdh schafft. Dann gibt es ${kg(t.step)} mehr – die Wdh fallen etwas, und es geht von vorn los.${big}`;
}

// Detail: dieselbe Aussage wie die Zeile, dazu eine Leiste je Satz und die
// Regel. Für das Blatt im Training und die Übungsseite.
export function goalPanelHtml(t, unit, { sets = [], prev = [], outcome = null } = {}) {
  if (!t && !outcome) return '';
  const v = outcome ? outcomeView(outcome, unit) : targetView(t, unit, { sets, prev });
  const target = outcome ? outcome.next : t;
  let L = null;
  let ladderTop = target.top;
  if (outcome) {
    const o = outcomeLadder(outcome);
    L = o.L;
    ladderTop = o.ref.top;
  } else if (SAME_WEIGHT.has(t.kind)) {
    L = ladder(t, liveSets(sets, prev));
  }
  const rows = L && L.segs.length ? `
    <div class="gp-sets">${L.segs.slice(0, 8).map((s, i) => {
    const full = v.levelUp || s.fill >= 1;
    return `
      <div class="gp-set ${full ? 'on' : ''}">
        <span class="gp-set-name">Satz ${i + 1}</span>
        <span class="gp-track"><i style="--f:${(v.levelUp ? 1 : s.fill).toFixed(3)}"></i></span>
        <span class="gp-set-val num">${full ? Icon.check : ''}${s.reps}<small>/${ladderTop}</small></span>
      </div>`;
  }).join('')}
    </div>` : '';
  return `
    <div class="goal-panel tone-${v.tone}">
      <div class="gp-head">
        <span class="gp-badge">${v.icon}</span>
        <div class="gp-text">
          <span class="gp-title">${v.title}</span>
          ${v.sub ? `<span class="gp-sub">${esc(v.sub)}</span>` : ''}
        </div>
      </div>
      ${rows ? `<p class="gp-caption">Wdh je Satz – voll heißt: Stufe geschafft</p>${rows}` : ''}
      ${target.kind !== 'first' ? `<p class="gp-rule">${esc(ruleText(target, loadUnit(unit, target.load)))}</p>` : ''}
    </div>`;
}

// Einstellungen der Übung: Wiederholungsbereich und Gewichtssprung
const LOAD_TEXT = {
  total: { label: 'Gesamt', sub: 'Stange bzw. Maschine samt allen Scheiben', menu: 'Gesamtgewicht' },
  side: { label: 'Je Seite', sub: 'Nur die Scheiben auf einer Seite', menu: 'Je Seite' },
  each: { label: 'Je Hantel', sub: 'Gewicht einer Kurzhantel', menu: 'Je Hantel' },
};

export function goalSettingsHtml(ex) {
  const profile = profileOf(ex);
  if (!profile) return '';
  const unit = unitLabel(Store.getSettings().unit);
  const sessions = progressionOf(ex).sessions;
  const {
    range, rangeAuto, step, stepAuto,
  } = levelsOf(ex, profile, sessions, Store.getSettings().unit);
  const load = loadOf(ex, profile);
  return `
    <div class="list icons">
      <button class="row" data-action="goal-range" data-id="${ex.id}">
        ${iconTile(Icon.stairs, TINT.green)}
        <div class="row-main"><span class="row-title">Wiederholungen</span><span class="row-sub">${rangeAuto ? 'Automatisch' : 'Eigene Wahl'}</span></div>
        <span class="row-value">${rangeText(range)}</span>${chev}
      </button>
      <button class="row" data-action="goal-step" data-id="${ex.id}">
        ${iconTile(Icon.plus, TINT.blue)}
        <div class="row-main"><span class="row-title">Gewichtssprung</span><span class="row-sub">${stepAuto ? 'Automatisch' : 'Eigene Wahl'}${load !== 'total' ? ` · ${LOAD_TEXT[load].label.toLowerCase()}` : ''}</span></div>
        <span class="row-value">${esc(formatWeight(step, unit))}</span>${chev}
      </button>
      ${profile.equipment !== 'bodyweight' ? `
      <button class="row" data-action="goal-load" data-id="${ex.id}">
        ${iconTile(Icon.dumbbell, TINT.orange)}
        <div class="row-main"><span class="row-title">Gewicht eintragen</span><span class="row-sub">${LOAD_TEXT[load].sub}</span></div>
        <span class="row-value">${LOAD_TEXT[load].label}</span>${chev}
      </button>` : ''}
    </div>
    <p class="field-hint">„Automatisch“ richtet sich nach der Übungsart und deinem Verlauf. Der Gewichtssprung gilt so, wie du einträgst – bei „je Seite“ also pro Seite.</p>`;
}

// Ring und Leitern beim Öffnen von null aus füllen
export function animateGoal(scope) {
  if (!scope || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tracks = [...scope.querySelectorAll('.gp-track i')];
  const values = tracks.map((t) => t.style.getPropertyValue('--f'));
  tracks.forEach((t) => { t.style.transition = 'none'; t.style.setProperty('--f', '0'); });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    tracks.forEach((t, i) => { t.style.transition = ''; t.style.setProperty('--f', values[i]); });
  }));
}

function changed(id) {
  window.dispatchEvent(new CustomEvent('progression-changed', { detail: { id } }));
  render();
}

registerActions({
  'goal-range': (el) => {
    const ex = Store.getExercise(el.dataset.id);
    const profile = profileOf(ex);
    if (!profile) return;
    const sessions = progressionOf(ex).sessions;
    const auto = levelsOf({ ...ex, repRange: null }, profile, sessions, Store.getSettings().unit).range;
    const manual = ex.repRange;
    openMenu(el, [
      { label: 'Automatisch', sub: `${rangeText(auto)} Wdh`, checked: !manual, handler: () => { Store.updateExercise(ex.id, { repRange: null }); changed(ex.id); } },
      '-',
      ...REP_PRESETS.map((r) => ({
        label: `${rangeText(r)} Wdh`,
        checked: !!manual && manual[0] === r[0] && manual[1] === r[1],
        handler: () => { Store.updateExercise(ex.id, { repRange: r }); changed(ex.id); },
      })),
    ], { title: 'Wiederholungsbereich' });
  },
  'goal-load': (el) => {
    const ex = Store.getExercise(el.dataset.id);
    const profile = profileOf(ex);
    if (!profile) return;
    const current = loadOf(ex, profile);
    const auto = defaultLoad(ex, profile);
    // Ein eigener Gewichtssprung passt nach dem Umstellen nicht mehr
    const pick = (mode) => {
      if (mode === current) return;
      Store.updateExercise(ex.id, { load: mode === auto ? null : mode, increment: null });
      changed(ex.id);
    };
    openMenu(el, ['total', 'side', 'each'].map((mode) => ({
      label: LOAD_TEXT[mode].menu + (mode === auto ? ' (Vorgabe)' : ''),
      sub: LOAD_TEXT[mode].sub,
      checked: mode === current,
      handler: () => pick(mode),
    })), { title: 'Gewicht eintragen' });
  },
  'goal-step': (el) => {
    const ex = Store.getExercise(el.dataset.id);
    const profile = profileOf(ex);
    if (!profile) return;
    const unitId = Store.getSettings().unit;
    const sessions = progressionOf(ex).sessions;
    const auto = levelsOf({ ...ex, increment: null }, profile, sessions, unitId).step;
    const unit = loadUnit(unitLabel(unitId), loadOf(ex, profile));
    openMenu(el, [
      { label: 'Automatisch', sub: formatWeight(auto, unit), checked: !(ex.increment > 0), handler: () => { Store.updateExercise(ex.id, { increment: null }); changed(ex.id); } },
      '-',
      ...STEP_OPTIONS[unitId === 'lb' ? 'lb' : 'kg'].map((v) => ({
        label: formatWeight(v, unit),
        checked: ex.increment === v,
        handler: () => { Store.updateExercise(ex.id, { increment: v }); changed(ex.id); },
      })),
    ], { title: 'Gewichtssprung' });
  },
});
