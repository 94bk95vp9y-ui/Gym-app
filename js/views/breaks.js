// Pausen (krank, Urlaub …): Liste im Verlauf und der Editor als Sheet. Die
// Logik (was eine Pause für Serien und Ziele bedeutet) steht in core/breaks.js.
import { Store, uid } from '../core/store.js';
import { BREAK_KINDS, kindOf, breakDays } from '../core/breaks.js';
import { dayKey, shiftDay, dateOfKey } from '../core/days.js';
import { plural } from '../core/format.js';
import { esc, qs, qsa, registerActions } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { render } from '../ui/router.js';
import { openSheet, confirmAction } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { haptic, HAP } from '../ui/haptics.js';
import { chev, iconTile, TINT } from '../ui/components.js';

const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
const WEEKDAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
const TINTS = { sick: TINT.indigo, vacation: TINT.green, other: TINT.blue };

const parts = (key) => { const d = dateOfKey(key); return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }; };

// „12. Nov.“, mit Jahr, wenn es nicht das laufende ist
export function shortDate(key, withYear = false) {
  const p = parts(key);
  const year = withYear || p.y !== new Date().getFullYear() ? ` ${p.y}` : '';
  return `${p.d}. ${MONTHS[p.m]}${year}`;
}

// „Mi., 12. Nov.“
export function longDate(key) {
  return `${WEEKDAYS[dateOfKey(key).getDay()]}, ${shortDate(key)}`;
}

// „3.–9. Nov.“ / „28. Okt. – 3. Nov.“ / „seit 12. Nov.“
export function rangeLabel(b) {
  if (!b.to) return `seit ${shortDate(b.from)}`;
  if (b.to === b.from) return shortDate(b.from);
  const f = parts(b.from);
  const t = parts(b.to);
  if (f.y === t.y && f.m === t.m) return `${f.d}.–${shortDate(b.to)}`;
  return `${shortDate(b.from)} – ${shortDate(b.to)}`;
}

// ---------- Liste (Verlauf → Trainings) ----------
export function breaksSectionHtml() {
  const list = [...Store.getBreaks()].sort((a, b) => b.from.localeCompare(a.from));
  const rows = list.map((b) => {
    const k = kindOf(b.kind);
    const sub = [plural(breakDays(b), 'Tag', 'Tage'), b.supplements ? 'Supplements pausiert' : ''].filter(Boolean).join(' · ');
    return `
      <button class="row" data-action="break-edit" data-id="${b.id}">
        ${iconTile(Icon[k.icon], TINTS[k.id])}
        <div class="row-main"><span class="row-title">${esc(k.label)} · ${esc(rangeLabel(b))}</span><span class="row-sub">${esc(sub)}</span></div>${chev}
      </button>`;
  }).join('');
  return `
    <div class="section breaks-section">
      <div class="section-head"><h2>Pausen</h2></div>
      <div class="list icons">
        ${rows}
        <button class="row" data-action="break-add">${iconTile(Icon.plus, TINT.gray)}
          <div class="row-main"><span class="row-title">Pause eintragen</span><span class="row-sub">Krank oder Urlaub – Serien bleiben erhalten</span></div>${chev}</button>
      </div>
    </div>`;
}

// ---------- Editor ----------
function overlaps(draft, id) {
  const end = (b) => b.to ?? '9999-12-31';
  return Store.getBreaks().some((b) => b.id !== id && b.from <= end(draft) && draft.from <= end(b));
}

function toggleRow(field, title, sub, checked) {
  return `
    <label class="row">
      <div class="row-main"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ''}</div>
      <span class="toggle"><input type="checkbox" switch data-f="${field}" ${checked ? 'checked' : ''} /><span class="toggle-track"></span></span>
    </label>`;
}

export function openBreakEditor(id = null, preset = {}) {
  const existing = id ? Store.getBreaks().find((b) => b.id === id) : null;
  const today = dayKey();
  const draft = existing ? { ...existing } : {
    id: uid(), kind: 'sick', from: today, to: today, supplements: true, note: '', ...preset,
  };
  const sheet = openSheet({
    title: existing ? `${kindOf(existing.kind).label} · ${rangeLabel(existing)}` : 'Pause eintragen',
    full: !existing,
    left: { label: 'Abbrechen' },
    right: {
      label: 'Sichern',
      style: 'primary',
      action: (s) => {
        const from = qs('[data-f="from"]', s.body).value;
        const ongoing = qs('[data-f="ongoing"]', s.body).checked;
        const to = ongoing ? null : qs('[data-f="to"]', s.body).value;
        if (!from || (!ongoing && !to)) { toast('Bitte Von und Bis angeben'); return; }
        if (from > dayKey()) { toast('Der Beginn darf nicht in der Zukunft liegen'); return; }
        if (to && from > to) { toast('„Von“ muss vor „Bis“ liegen'); return; }
        const entry = {
          id: draft.id,
          kind: draft.kind,
          from,
          to,
          supplements: qs('[data-f="supplements"]', s.body).checked,
          ...(qs('[data-f="note"]', s.body).value.trim() ? { note: qs('[data-f="note"]', s.body).value.trim() } : {}),
        };
        if (overlaps(entry, draft.id)) { toast('Überschneidet sich mit einer anderen Pause'); return; }
        Store.saveBreak(entry);
        s.close();
        render();
      },
    },
    body: `
      <div class="field"><label class="field-label">Art</label>
        <div class="choices" data-kinds>${BREAK_KINDS.map((k) => `<button type="button" class="choice ${k.id === draft.kind ? 'active' : ''}" data-kind="${k.id}">${HAP}${k.id === 'other' ? 'Sonstiges' : k.label}</button>`).join('')}</div></div>
      <div class="field" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="field-label">Von</label>
          <input class="input" type="date" data-f="from" value="${draft.from}" max="${today}" /></div>
        <div><label class="field-label">Bis</label>
          <input class="input" type="date" data-f="to" value="${draft.to || today}" ${draft.to ? '' : 'disabled'} /></div>
      </div>
      <div class="section" style="margin:0 0 20px"><div class="list">
        ${toggleRow('ongoing', 'Noch nicht vorbei', '', !draft.to)}
        ${toggleRow('supplements', 'Supplements pausieren', 'Tage zählen nicht als vergessen', draft.supplements)}
      </div></div>
      <div class="field"><label class="field-label">Notiz</label>
        <textarea class="input" data-f="note" rows="2" placeholder="optional" maxlength="300">${esc(draft.note || '')}</textarea></div>
      ${existing ? `<div class="section"><div class="list"><button class="row destructive center" data-remove><div class="row-main"><span class="row-title">Pause löschen</span></div></button></div>
        <p class="section-foot">Die Tage zählen danach wieder normal.</p></div>` : ''}`,
  });
  sheet.body.addEventListener('click', async (e) => {
    const kind = e.target.closest('[data-kind]');
    if (kind) {
      draft.kind = kind.dataset.kind;
      qsa('[data-kind]', sheet.body).forEach((b) => b.classList.toggle('active', b === kind));
      // Bei neuen Pausen passt der Standard zur Art: krank pausiert Supplements, Urlaub nicht
      if (!existing) qs('[data-f="supplements"]', sheet.body).checked = draft.kind === 'sick';
      return;
    }
    if (e.target.closest('[data-remove]')) {
      if (!(await confirmAction({ title: 'Pause löschen?', message: 'Die Tage zählen danach wieder normal.', confirmLabel: 'Pause löschen' }))) return;
      Store.deleteBreak(draft.id);
      sheet.close();
      render();
    }
  });
  sheet.body.addEventListener('change', (e) => {
    if (e.target.matches('[data-f="ongoing"]')) qs('[data-f="to"]', sheet.body).disabled = e.target.checked;
  });
  return sheet;
}

// „Wieder fit“: die Pause endet gestern – heute zählt wieder normal. Hat sie
// erst heute begonnen, gibt es nichts zu pausieren, und sie entfällt.
export function endBreakNow(b) {
  const today = dayKey();
  if (b.from < today) Store.saveBreak({ ...b, to: shiftDay(today, -1) });
  else Store.deleteBreak(b.id);
  haptic();
  render();
}

registerActions({
  'break-add': () => openBreakEditor(null),
  'break-edit': (el) => openBreakEditor(el.dataset.id),
});
