// Übungsauswahl (Mehrfachauswahl mit Suche) und Übungs-Editor – geteilt von
// Plan-Editor und laufendem Training.
import { Store, MUSCLE_GROUPS, uid } from '../core/store.js';
import { esc, qs, replay } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

function normalize(text) {
  return String(text).toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
}

export function filterExercises(list, query) {
  const q = normalize(query.trim());
  if (!q) return list;
  const words = q.split(/\s+/);
  return list.filter((e) => {
    const hay = normalize(`${e.name} ${e.muscleGroup}`);
    return words.every((w) => hay.includes(w));
  });
}

// Übungen nach Muskelgruppe gegliedert, in der Reihenfolge der Gruppen.
export function groupedHtml(list, rowHtml, emptyText = 'Keine Übung gefunden.') {
  if (!list.length) return `<p class="empty">${esc(emptyText)}</p>`;
  const groups = [...MUSCLE_GROUPS, ...new Set(list.map((e) => e.muscleGroup).filter((g) => !MUSCLE_GROUPS.includes(g)))];
  return groups.map((g) => {
    const items = list.filter((e) => e.muscleGroup === g).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!items.length) return '';
    return `<div class="group-head">${esc(g)}</div><div class="list">${items.map(rowHtml).join('')}</div>`;
  }).join('');
}

// fixed: Übungen, die schon dabei sind (werden angezeigt, aber nicht wählbar)
export function openExercisePicker({ title = 'Übungen', fixed = [], fixedLabel = 'dabei', onDone }) {
  const chosen = [];
  let query = '';
  const fixedSet = new Set(fixed);

  const rowHtml = (ex) => {
    const isFixed = fixedSet.has(ex.id);
    const on = isFixed || chosen.includes(ex.id);
    return `
      <button class="row pick-row ${on ? 'taken' : ''}" data-pick="${ex.id}" ${isFixed ? 'disabled' : ''}>
        <div class="row-main"><span class="row-title">${esc(ex.name)}</span></div>
        ${isFixed ? `<span class="tag neutral">${esc(fixedLabel)}</span>` : `<span class="check ${on ? 'on' : ''}">${Icon.check}</span>`}
      </button>`;
  };
  const listHtml = () => groupedHtml(filterExercises(Store.getExercises(), query), rowHtml);
  const rightLabel = () => (chosen.length ? `Hinzufügen (${chosen.length})` : 'Fertig');

  const sheet = openSheet({
    title,
    full: true,
    left: { label: 'Abbrechen' },
    right: { label: rightLabel(), style: 'primary', action: (s) => { s.close(); if (chosen.length) onDone(chosen); } },
    body: `
      <label class="search">${Icon.search}<input class="input" type="search" placeholder="Suchen" autocomplete="off" data-picker-search /></label>
      <button class="btn btn-tinted btn-block btn-sm" data-picker-new style="height:42px;margin-bottom:4px">${Icon.plus} Neue Übung anlegen</button>
      <div data-picker-list>${listHtml()}</div>`,
  });
  const body = sheet.body;
  const list = qs('[data-picker-list]', body);
  const refresh = () => { list.innerHTML = listHtml(); };
  qs('[data-picker-search]', body).addEventListener('input', (e) => { query = e.target.value; refresh(); });
  body.addEventListener('click', (e) => {
    const row = e.target.closest('[data-pick]');
    if (row && !row.disabled) {
      const id = row.dataset.pick;
      const i = chosen.indexOf(id);
      if (i >= 0) chosen.splice(i, 1); else chosen.push(id);
      const on = i < 0;
      row.classList.toggle('taken', on);
      const check = qs('.check', row);
      check.classList.toggle('on', on);
      if (on) replay(check, 'bump');
      sheet.setRight({ label: rightLabel(), style: 'primary', action: (s) => { s.close(); if (chosen.length) onDone(chosen); } });
      return;
    }
    if (e.target.closest('[data-picker-new]')) {
      openExerciseEditor(null, {
        name: query.trim(),
        onSave: (ex) => {
          chosen.push(ex.id);
          query = '';
          qs('[data-picker-search]', body).value = '';
          refresh();
          sheet.setRight({ label: rightLabel(), style: 'primary', action: (s) => { s.close(); if (chosen.length) onDone(chosen); } });
        },
      });
    }
  });
  return sheet;
}

// Übung anlegen oder Name/Muskelgruppe ändern
export function openExerciseEditor(id, { name = '', onSave = null } = {}) {
  const existing = id ? Store.getExercise(id) : null;
  const ex = existing || { id: uid(), name, muscleGroup: MUSCLE_GROUPS[0], notes: '' };
  const sheet = openSheet({
    title: existing ? 'Übung bearbeiten' : 'Neue Übung',
    left: { label: 'Abbrechen' },
    right: {
      label: 'Sichern',
      style: 'primary',
      action: (s) => {
        const nameEl = qs('[data-f="name"]', s.body);
        const value = nameEl.value.trim();
        if (!value) { nameEl.focus(); toast('Bitte einen Namen eingeben'); return; }
        const duplicate = Store.getExercises().find((e) => e.id !== ex.id && e.name.toLowerCase() === value.toLowerCase());
        if (duplicate) { toast('Diese Übung gibt es schon'); return; }
        const saved = { ...ex, name: value, muscleGroup: qs('[data-f="group"]', s.body).value };
        Store.saveExercise(saved);
        s.close();
        onSave?.(saved);
      },
    },
    body: `
      <div class="field">
        <label class="field-label">Name</label>
        <input class="input" data-f="name" value="${esc(ex.name)}" placeholder="z. B. Bankdrücken" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label">Muskelgruppe</label>
        <select class="input" data-f="group">
          ${MUSCLE_GROUPS.map((g) => `<option ${g === ex.muscleGroup ? 'selected' : ''}>${esc(g)}</option>`).join('')}
        </select>
      </div>`,
  });
  return sheet;
}
