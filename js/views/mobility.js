// Mobility – bewusst klein: eine Kachel auf „Heute“, dahinter die tägliche
// Routine und die zwei tiefen Einheiten für die Beine.
import { esc, registerActions } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { render } from '../ui/router.js';
import { openSheet, closeAllSheets } from '../ui/sheet.js';
import { relativeDay, plural } from '../core/format.js';
import { itemSeconds } from '../mobility/plans.js';
import {
  dailyRoutine, deepRoutines, planRoutines, routineById, routineTotal, lastSession, doneToday, weekCount, mins, prepSeconds,
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

function openPreview(id) {
  const r = routineById(id);
  if (!r) return;
  const prep = prepSeconds();
  let section = null;
  const rows = r.items.map((item) => {
    const ex = planExercise(item);
    if (!ex) return '';
    const head = item.section && item.section !== section ? `<div class="group-head" style="position:static;padding:12px 4px 6px">${esc(item.section)}</div>` : '';
    if (item.section) section = item.section;
    const secs = Math.max(0, itemSeconds(item, prep) - prep);
    const how = item.mode === 'pnf' ? 'Anspannen-Loslassen'
      : item.mode === 'active' || ex.kind === 'active' ? 'Aktiv'
        : ex.kind === 'breath' ? 'Atmen'
          : ex.kind === 'dynamic' || ex.type !== 'hold' ? 'Bewegen' : 'Halten';
    return `${head}
      <div class="row" style="gap:12px">
        ${thumb(ex.id)}
        <div class="row-main"><span class="row-title">${esc(ex.name)}</span>
          <span class="row-sub">${how}${item.sets > 1 ? ` · ${item.sets} Sätze` : ''}${ex.sides ? ' · je Seite' : ''}</span></div>
        <span class="row-value num">${mins(secs)}</span>
      </div>`;
  }).join('');
  openSheet({
    title: r.kind === 'deep' ? r.short : r.name,
    full: true,
    left: { label: 'Zurück' },
    right: null,
    body: `${r.description ? `<p class="muted" style="margin:0 4px 14px;font-size:15px">${esc(r.description)}</p>` : ''}<div class="list">${rows}</div>`,
    footer: `<button class="btn btn-primary btn-block" data-mob-go>${Icon.play} Starten · ${mins(routineTotal(r))}</button>`,
    onMount: (s) => {
      fillThumbs(s.body);
      s.el.querySelector('[data-mob-go]').addEventListener('click', () => {
        closeAllSheets();
        play(id);
      });
    },
  });
}

registerActions({
  'mobility-open': () => openMobility(),
  'mobility-daily': () => play('daily'),
});
