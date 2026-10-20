// Mobility – bewusst klein: eine Kachel auf „Heute“, dahinter die tägliche
// Routine und die zwei tiefen Einheiten für die Beine.
import { esc, registerActions } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { render } from '../ui/router.js';
import { openSheet, closeAllSheets } from '../ui/sheet.js';
import { relativeDay, plural } from '../core/format.js';
import { itemSeconds, OPTIONAL_LABELS } from '../mobility/plans.js';
import {
  dailyRoutine, deepRoutines, planRoutines, kickRoutines, lowerRoutines, routineById, optionalOn, setOptional, routineTotal, lastSession, doneToday, weekCount, mins, prepSeconds,
} from '../mobility/routines.js';
import { thumb, fillThumbs } from '../mobility/figures.js';
import { startRoutine, planExercise } from '../mobility/player.js';
import { iconTile, TINT } from '../ui/components.js';

// Kachel für „Heute“: Antippen öffnet die Auswahl, Play startet die tägliche Routine
export function mobilityTileHtml() {
  const daily = dailyRoutine();
  const last = lastSession();
  const done = doneToday();
  return `
    <div class="tile" data-action="mobility-open" role="button" tabindex="0">
      <div class="tile-head">
        ${iconTile(Icon.stretch, TINT.teal)}
        ${done ? `<span class="tag success">${Icon.check}Heute</span>` : `<button class="play-btn sm" data-action="mobility-daily" aria-label="Tägliche Routine starten">${Icon.play}</button>`}
      </div>
      <div class="tile-foot">
        <div class="tile-title">Mobility</div>
        <div class="tile-sub">${done ? 'Heute erledigt' : 'Tägliche Routine'}<br>${mins(routineTotal(daily))}${last ? ` · ${relativeDay(last.startedAt)}` : ''}</div>
      </div>
    </div>`;
}

function routineRow(r) {
  const last = lastSession(r.id);
  const label = r.kind === 'deep' || r.kind === 'plan' ? r.short : r.name;
  return `
    <div class="row" style="gap:12px">
      <button class="row-main" data-mob-preview="${r.id}" style="text-align:left;flex-direction:row;align-items:center;gap:12px">
        ${thumb(r.items[0]?.id || '')}
        <span style="display:flex;flex-direction:column;min-width:0">
          <span class="row-title strong">${esc(label)}</span>
          <span class="row-sub">${mins(routineTotal(r))} · ${plural(r.items.length, 'Übung', 'Übungen')}${last ? ` · ${relativeDay(last.startedAt)}` : ''}</span>
        </span>
      </button>
      <button class="play-btn sm" data-mob-start="${r.id}" aria-label="${esc(r.name)} starten">${Icon.play}</button>
    </div>`;
}

function openMobility() {
  const daily = dailyRoutine();
  const deep = deepRoutines();
  const week = weekCount();
  const sheet = openSheet({
    title: 'Mobility',
    body: `
      <div class="section-label">Mobility-Plan Unterkörper</div>
      <div class="list">${lowerRoutines().map(routineRow).join('')}</div>
      <p class="section-foot">Jeden Tag derselbe Ablauf: Aufwärmen, aktive Kontrolle, Kraft in Dehnposition, Dehnen. Nerv-Gleiten und Kicks schaltest du in der Vorschau zu.</p>
      <div class="section-label">Tägliche Kick-Routine</div>
      <div class="list">${kickRoutines().map(routineRow).join('')}</div>
      <p class="section-foot">Dein Plan für hohe Kicks: jeden Tag gleich, getrennt vom Gym. „Kurz“ halbiert das Dehnen, „Nach Beintag“ macht den Kraftteil nur einmal.</p>
      <div class="section-label">Kurze Routine</div>
      <div class="list">${routineRow(daily)}</div>
      <p class="section-foot">${esc(daily.description)}</p>
      <div class="section-label">Dein Beinplan</div>
      <div class="list">${planRoutines().map(routineRow).join('')}</div>
      <p class="section-foot">Mit Gewicht an den Tagen mit Kurzhantel oder Kettlebell, an den anderen Tagen ohne – dafür etwas mehr aktive Beweglichkeit.</p>
      <div class="section-label">Tiefe Einheiten für die Beine</div>
      <div class="list">${deep.map(routineRow).join('')}</div>
      <p class="section-foot">Etwa 30 Minuten mit Anspannen-Loslassen und langem Halten – ein- bis zweimal pro Woche statt der täglichen Routine.</p>
      <p class="section-foot" style="margin-top:18px">Diese Woche an ${week} ${week === 1 ? 'Tag' : 'Tagen'}. Dauer der täglichen Routine in den Einstellungen.</p>`,
    onMount: (s) => {
      fillThumbs(s.body);
      s.body.addEventListener('click', (e) => {
        const start = e.target.closest('[data-mob-start]');
        if (start) { s.close(); play(start.dataset.mobStart); return; }
        const prev = e.target.closest('[data-mob-preview]');
        if (prev) openPreview(prev.dataset.mobPreview);
      });
    },
  });
  return sheet;
}

function play(id) {
  const r = routineById(id);
  if (r) startRoutine(r, { onClose: () => render() });
}

function rulesHtml(rules) {
  if (!rules?.length) return '';
  return `<div class="list mob-rules"><div class="row" style="flex-direction:column;align-items:stretch;gap:6px">
    <span class="row-title strong">Regeln</span>
    <ul>${rules.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;
}

function openPreview(id) {
  const r = routineById(id);
  if (!r) return;
  const prep = prepSeconds();
  let section = null;
  const seenGroup = new Set();
  const rows = (r.allItems || r.items).map((item) => {
    const ex = planExercise(item);
    if (!ex) return '';
    const head = item.section && item.section !== section ? `<div class="group-head" style="position:static;padding:12px 4px 6px">${esc(item.section)}</div>` : '';
    if (item.section) section = item.section;
    // Optionale Teile: ein Schalter vor dem ersten Eintrag der Gruppe
    const group = item.optional;
    const on = group ? optionalOn(r.id, group) : true;
    let toggle = '';
    if (group && !seenGroup.has(group)) {
      seenGroup.add(group);
      toggle = `
      <div class="row mob-opt" style="gap:12px">
        <div class="row-main"><span class="row-title strong">Optional: ${esc(OPTIONAL_LABELS[group] || group)}</span>
          <span class="row-sub">In die Einheit aufnehmen</span></div>
        <span class="toggle"><input type="checkbox" switch data-opt-group="${esc(group)}" ${on ? 'checked' : ''} /><span class="toggle-track"></span></span>
      </div>`;
    }
    const secs = Math.max(0, itemSeconds(item, prep) - prep);
    const how = item.mode === 'pnf' ? 'Anspannen-Loslassen'
      : item.mode === 'active' || ex.kind === 'active' ? 'Aktiv'
        : ex.kind === 'breath' ? 'Atmen'
          : ex.kind === 'dynamic' || ex.type !== 'hold' ? 'Bewegen' : 'Halten';
    return `${head}${toggle}
      <div class="row${group && !on ? ' mob-off' : ''}" style="gap:12px"${group ? ` data-opt-row="${esc(group)}"` : ''}>
        ${thumb(ex.id)}
        <div class="row-main"><span class="row-title">${esc(ex.name)}</span>
          <span class="row-sub">${how}${item.sets > 1 ? ` · ${item.sets} Sätze` : ''}${ex.sides ? ' · je Seite' : ''}</span></div>
        <span class="row-value num">${mins(secs)}</span>
      </div>`;
  }).join('');
  const goLabel = () => `${Icon.play} Starten · ${mins(routineTotal(routineById(id)))}`;
  openSheet({
    title: r.kind === 'deep' ? r.short : r.name,
    full: true,
    left: { label: 'Zurück' },
    right: null,
    body: `${r.description ? `<p class="muted" style="margin:0 4px 14px;font-size:15px">${esc(r.description)}</p>` : ''}${rulesHtml(r.rules)}<div class="list">${rows}</div>`,
    footer: `<button class="btn btn-primary btn-block" data-mob-go>${goLabel()}</button>`,
    onMount: (s) => {
      fillThumbs(s.body);
      const go = s.el.querySelector('[data-mob-go]');
      go.addEventListener('click', () => {
        closeAllSheets();
        play(id);
      });
      s.body.addEventListener('change', (e) => {
        const input = e.target.closest('[data-opt-group]');
        if (!input) return;
        const group = input.dataset.optGroup;
        setOptional(id, group, input.checked);
        s.body.querySelectorAll(`[data-opt-row="${group}"]`).forEach((row) => row.classList.toggle('mob-off', !input.checked));
        go.innerHTML = goLabel();
      });
    },
  });
}

registerActions({
  'mobility-open': () => openMobility(),
  'mobility-daily': () => play('daily'),
});
