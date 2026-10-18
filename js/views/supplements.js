// Tab „Supplements“: oben der Stand des Tages, darunter die Abhakliste,
// Kalender zum Nachtragen, die eigenen Präparate mit Vorrat und die
// Kalender-Erinnerungen.
import { Store, uid } from '../core/store.js';
import {
  SLOTS, SUPPLEMENT_PRESETS, REMINDER_TIMES, dayKey, shiftDay, dateOfKey, currentSlot, activeOn, dayStatus,
  streak, adherence, reminderFile, hasStock, lowStock, LOW_STOCK_DAYS,
} from '../core/supplements.js';
import { plural } from '../core/format.js';
import { Sound } from '../core/sound.js';
import { esc, qs, qsa, registerActions, registerInputs } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { registerPage, render, goTo } from '../ui/router.js';
import {
  openSheet, topSheet, confirmAction, registerContextMenu,
} from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { haptic, HAP } from '../ui/haptics.js';
import { chev, iconTile, ring, emptyState, TINT } from '../ui/components.js';

const ui = { month: null };
// Neuer Tag (App über Nacht offen): Kalender springt auf den aktuellen Monat
window.addEventListener('daychange', () => { ui.month = null; });
const slotLabel = (id) => SLOTS.find((s) => s.id === id)?.label || '';

function dayLabel(key) {
  const today = dayKey();
  if (key === today) return 'Heute';
  if (key === shiftDay(today, -1)) return 'Gestern';
  return dateOfKey(key).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

const isLow = (s) => hasStock(s) && s.stock <= LOW_STOCK_DAYS;

function stockText(s) {
  if (!hasStock(s)) return '';
  if (s.stock <= 0) return 'Vorrat leer';
  // Eine Portion pro Tag: der Vorrat reicht so viele Tage
  return isLow(s) ? `reicht noch ${plural(s.stock, 'Tag', 'Tage')}` : `${plural(s.stock, 'Portion', 'Portionen')} übrig`;
}

// Eine Zeile zum Abhaken: Kreis links wie in einer Erinnerungsliste
function checkRow(s, day, taken, { slot = true } = {}) {
  // Vorrat betrifft nur heute – beim Nachtragen vergangener Tage stört er
  const low = isLow(s) && day === dayKey();
  const sub = [s.dose, low ? stockText(s) : ''].filter(Boolean).join(' · ');
  return `
    <button class="row check-row ${taken ? 'taken' : ''}" data-action="supp-toggle" data-id="${s.id}" data-day="${day}" aria-pressed="${taken}">
      ${HAP}<span class="check">${Icon.check}</span>
      <div class="row-main">
        <span class="row-title">${esc(s.name)}</span>
        ${sub ? `<span class="row-sub ${low ? 'warn' : ''}">${esc(sub)}</span>` : ''}
      </div>
      ${slot ? `<span class="slot">${slotLabel(s.slot)}</span>` : ''}
    </button>`;
}

// Kompakt (Heute): eine Liste, nach Tageszeit sortiert, Tageszeit rechts.
// Gegliedert (Tab, Nachtragen): Abschnitte je Tageszeit mit „Alle abhaken“.
function checklistHtml(day, { grouped = false } = {}) {
  const items = activeOn(Store.getSupplements(), day);
  const taken = Store.getSupplementLog()[day] || {};
  const order = (s) => SLOTS.findIndex((x) => x.id === s.slot);
  if (!grouped) {
    return [...items].sort((a, b) => order(a) - order(b)).map((s) => checkRow(s, day, !!taken[s.id])).join('');
  }
  const nowIndex = SLOTS.findIndex((s) => s.id === currentSlot());
  return SLOTS.map((slot, index) => {
    const inSlot = items.filter((s) => s.slot === slot.id);
    if (!inSlot.length) return '';
    const open = inSlot.filter((s) => !taken[s.id]);
    const later = day === dayKey() && index > nowIndex;
    return `
      <div class="supp-slot">
        <div class="supp-slot-head"><span>${slot.label}${later ? ' <i class="slot-later">später</i>' : ''}</span>
          ${open.length > 1 ? `<button data-action="supp-all" data-day="${day}" data-slot="${slot.id}">Alle abhaken</button>` : ''}</div>
        ${inSlot.map((s) => checkRow(s, day, !!taken[s.id], { slot: false })).join('')}
      </div>`;
  }).join('');
}

function progressHead(st) {
  return `<span class="head-ring" data-supp-progress-wrap>${ring(st.done, st.expected, { size: 20, stroke: 3, cls: 'success' })}<span class="meta" data-supp-progress>${st.done} von ${st.expected}</span></span>`;
}

// Abschnitt für „Heute“
export function supplementsTodayHtml() {
  const active = Store.getActiveSupplements();
  if (!active.length) {
    return `
      <div class="section">
        <div class="section-head"><h2>Supplements</h2></div>
        <div class="list icons">
          <button class="row" data-action="supp-start">${iconTile(Icon.pill, TINT.pink)}
            <div class="row-main"><span class="row-title">Supplements hinzufügen</span><span class="row-sub">Täglich abhaken, mit Serie und Erinnerung</span></div>${chev}</button>
        </div>
      </div>`;
  }
  const today = dayKey();
  const supplements = Store.getSupplements();
  const log = Store.getSupplementLog();
  const st = dayStatus(supplements, log, today);
  const low = lowStock(supplements);
  const lowRows = low.map((s) => `
    <button class="row" data-action="supp-edit" data-id="${s.id}">${iconTile(Icon.alert, TINT.orange)}
      <div class="row-main"><span class="row-title">${esc(s.name)} nachkaufen</span><span class="row-sub warn">${esc(stockText(s))}</span></div>${chev}</button>`).join('');
  if (st.complete) {
    const series = streak(supplements, log, today);
    return `
      <div class="section">
        <div class="section-head"><h2>Supplements</h2>${progressHead(st)}</div>
        <div class="list icons">
          <button class="row done-row" data-action="tab" data-tab="supplements">${iconTile(Icon.check, TINT.green)}
            <div class="row-main"><span class="row-title">Alles genommen</span><span class="row-sub">${series > 1 ? `${series} Tage in Folge` : 'Für heute erledigt'}</span></div>${chev}</button>
          ${lowRows}
        </div>
      </div>`;
  }
  const yesterday = shiftDay(today, -1);
  const y = dayStatus(supplements, log, yesterday);
  return `
    <div class="section" data-supp-card>
      <div class="section-head"><h2>Supplements</h2>${progressHead(st)}</div>
      <div class="list">${checklistHtml(today)}</div>
      ${y.expected && !y.complete ? `<p class="section-foot"><button class="text-link" data-action="supp-day" data-day="${yesterday}">Gestern ${y.done} von ${y.expected} – nachtragen</button></p>` : ''}
    </div>`;
}

// ---------- Kalender ----------
function dayClass(st, key, today) {
  if (key > today) return 'future';
  if (st.complete) return 'full';
  if (st.expected && st.done) return 'partial';
  if (st.expected && key < today) return 'missed';
  return '';
}

// Jeder Tag ein kleiner Ring wie bei den Aktivitätsringen: geschlossen =
// alles genommen, teilweise gefüllt = einiges, nur die Spur = vergessen.
function dayRing(st, d, cls) {
  const size = 36;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = st.expected ? Math.min(1, st.done / st.expected) : 0;
  return `
    <svg viewBox="0 0 ${size} ${size}" class="day-ring" aria-hidden="true">
      <circle class="day-ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
      ${ratio > 0 ? `<circle class="day-ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - ratio)).toFixed(2)}"/>` : ''}
    </svg><span>${d}</span>`;
}

function calendarHtml() {
  const today = dayKey();
  const ref = ui.month || (() => { const d = dateOfKey(today); return { y: d.getFullYear(), m: d.getMonth() }; })();
  ui.month = ref;
  const first = new Date(ref.y, ref.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(ref.y, ref.m + 1, 0).getDate();
  const supplements = Store.getSupplements();
  const log = Store.getSupplementLog();
  let cells = '';
  for (let i = 0; i < offset; i += 1) cells += '<span class="cal-day blank"></span>';
  for (let d = 1; d <= days; d += 1) {
    const key = `${ref.y}-${String(ref.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const st = dayStatus(supplements, log, key);
    const cls = dayClass(st, key, today);
    const pickable = key <= today && st.expected;
    const label = `${d}. – ${st.expected ? `${st.done} von ${st.expected}` : 'nichts geplant'}`;
    cells += `<button class="cal-day ring-day ${cls} ${key === today ? 'today' : ''}" ${pickable ? `data-action="supp-day" data-day="${key}"` : 'disabled'} aria-label="${label}">${pickable ? dayRing(st, d, cls) : `<span>${d}</span>`}</button>`;
  }
  const canForward = new Date(ref.y, ref.m + 1, 1) <= dateOfKey(today);
  return `
    <div class="card cal-card" id="supp-cal">
      <div class="cal-head">
        <strong>${first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</strong>
        <div class="cal-nav">
          <button data-action="supp-month" data-delta="-1" aria-label="Vorheriger Monat">${Icon.chevronLeft}</button>
          <button data-action="supp-month" data-delta="1" aria-label="Nächster Monat" ${canForward ? '' : 'disabled'}>${Icon.chevronRight}</button>
        </div>
      </div>
      <div class="cal-week">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend"><span><i class="lg-full"></i>alles</span><span><i class="lg-partial"></i>teilweise</span><span><i class="lg-missed"></i>vergessen</span></div>
    </div>`;
}

function remindersHtml(active) {
  const settings = Store.getSettings();
  const slots = SLOTS.filter((slot) => active.some((s) => s.slot === slot.id));
  if (!slots.length) return '';
  return `
    <div class="section">
      <div class="section-head"><h2>Erinnerungen</h2></div>
      <div class="list icons">
        ${slots.map((slot) => {
    const time = settings.supplementReminders?.[slot.id] || slot.reminder;
    return `
          <div class="row reminder-row">
            ${iconTile(Icon.bell, TINT.red)}
            <div class="row-main"><span class="row-title">${slot.label}</span></div>
            <select class="input time-select" data-change="supp-time" data-slot="${slot.id}" aria-label="Uhrzeit ${slot.label}">
              ${REMINDER_TIMES.map((t) => `<option value="${t}" ${t === time ? 'selected' : ''}>${t.slice(0, 2)}:${t.slice(2)}</option>`).join('')}
            </select>
            <a class="btn btn-tinted btn-sm" href="${reminderFile(time)}" data-reminder="${slot.id}" target="_blank" rel="noopener">Hinzufügen</a>
          </div>`;
  }).join('')}
      </div>
      <p class="section-foot">Web-Apps dürfen auf dem iPhone keine eigenen Erinnerungen planen – der Kalender schon. Einmal hinzufügen, dann meldet sich das iPhone jeden Tag zur gewählten Zeit.</p>
    </div>`;
}

function myListHtml(active) {
  return SLOTS.flatMap((slot) => active.filter((s) => s.slot === slot.id).map((s) => {
    const bar = hasStock(s) && s.packSize
      ? `<span class="stock-bar ${isLow(s) ? 'low' : ''}"><i style="width:${Math.min(100, (s.stock / s.packSize) * 100)}%"></i></span>` : '';
    return `
      <button class="row" data-action="supp-edit" data-menu="supp" data-id="${s.id}">
        <div class="row-main">
          <span class="row-title">${esc(s.name)}</span>
          <span class="row-sub">${esc([slot.label, s.dose].filter(Boolean).join(' · '))}</span>
          ${bar}
        </div>
        ${hasStock(s) ? `<span class="row-value ${isLow(s) ? 'warn-text' : ''}">${s.stock <= 0 ? 'leer' : `${s.stock} übrig`}</span>` : ''}
        ${chev}
      </button>`;
  })).join('');
}

registerPage('supplements', {
  title: 'Supplements',
  right: () => `<button class="nav-btn icon-only" data-action="supp-add" aria-label="Supplement hinzufügen">${Icon.plus}</button>`,
  render: () => {
    const active = Store.getActiveSupplements();
    if (!active.length) {
      return emptyState({
        icon: Icon.pill,
        title: 'Noch keine Supplements',
        text: 'Leg an, was du täglich nimmst. Dann hakst du es auf „Heute“ ab und siehst sofort, ob du etwas vergessen hast.',
        action: '<button class="btn btn-primary" data-action="supp-add">Supplement hinzufügen</button>',
      });
    }
    const supplements = Store.getSupplements();
    const log = Store.getSupplementLog();
    const today = dayKey();
    const st = dayStatus(supplements, log, today);
    const series = streak(supplements, log, today);
    const quote = adherence(supplements, log, today, 30);
    return `
      <div class="card supp-summary" data-supp-card>
        <span data-supp-ring>${ring(st.done, st.expected, { size: 68, stroke: 7, cls: 'success', label: `${st.done}/${st.expected}` })}</span>
        <div class="stats divided" style="--cols:2">
          <div class="stat"><b class="num">${series}</b><span>${series === 1 ? 'Tag' : 'Tage'} in Folge</span></div>
          <div class="stat"><b class="num">${quote ? `${quote.percent}%` : '–'}</b><span>${quote ? `letzte ${quote.days} Tage` : 'noch keine Daten'}</span></div>
        </div>
      </div>
      <div class="section">
        <div class="section-head"><h2>Heute</h2><span class="meta" data-supp-progress>${st.done} von ${st.expected}</span></div>
        <div class="list">${checklistHtml(today, { grouped: true })}</div>
      </div>
      <div class="section">
        <div class="section-head"><h2>Kalender</h2><span class="meta">Tag antippen zum Nachtragen</span></div>
        ${calendarHtml()}
      </div>
      <div class="section">
        <div class="section-head"><h2>Meine Supplements</h2></div>
        <div class="list">${myListHtml(active)}</div>
      </div>
      ${remindersHtml(active)}`;
  },
});

// ---------- Tag nachtragen ----------
function openDaySheet(day) {
  const st = dayStatus(Store.getSupplements(), Store.getSupplementLog(), day);
  openSheet({
    title: dayLabel(day),
    className: 'supp-day-sheet',
    body: `
      <p class="sheet-sub"><span class="supp-progress">${st.done} von ${st.expected}</span> genommen – antippen zum Nachtragen</p>
      <div class="list">${checklistHtml(day, { grouped: true })}</div>`,
    onClose: () => render(),
  });
}

// ---------- Anlegen & Bearbeiten ----------
export function openSupplementEditor(id = null) {
  const existing = id ? Store.getSupplements().find((s) => s.id === id) : null;
  const draft = existing ? { ...existing } : { id: uid(), name: '', dose: '', slot: 'morning', since: dayKey(), stock: null, packSize: null };
  const takenNames = new Set(Store.getActiveSupplements().map((s) => s.name.toLowerCase()));
  const presets = SUPPLEMENT_PRESETS.filter((p) => !takenNames.has(p.name.toLowerCase()));
  const slotSeg = () => `
    <div class="seg" style="--n:4;--i:${SLOTS.findIndex((s) => s.id === draft.slot)}" data-slot-seg>
      ${SLOTS.map((s) => `<button type="button" class="${s.id === draft.slot ? 'active' : ''}" data-slot="${s.id}">${HAP}${s.short}</button>`).join('')}
      <span class="seg-thumb"></span>
    </div>`;
  const sheet = openSheet({
    title: existing ? existing.name : 'Neues Supplement',
    full: !existing,
    left: { label: 'Abbrechen' },
    right: {
      label: 'Sichern',
      style: 'primary',
      action: (s) => {
        const name = qs('[data-f="name"]', s.body).value.trim();
        if (!name) { qs('[data-f="name"]', s.body).focus(); toast('Bitte einen Namen eingeben'); return; }
        const stockRaw = qs('[data-f="stock"]', s.body).value.trim();
        const packRaw = qs('[data-f="pack"]', s.body).value.trim();
        const stock = stockRaw === '' ? null : Math.max(0, parseInt(stockRaw, 10) || 0);
        const packSize = packRaw === '' ? null : Math.max(1, parseInt(packRaw, 10) || 1);
        Store.saveSupplement({ ...draft, name, dose: qs('[data-f="dose"]', s.body).value.trim(), stock, packSize });
        s.close();
        render();
      },
    },
    body: `
      ${presets.length && !existing ? `
        <label class="field-label">Vorschläge</label>
        <div class="choices" style="margin-bottom:22px">${presets.map((p) => `<button class="choice" data-preset="${esc(p.name)}" data-pslot="${p.slot}">${esc(p.name)}</button>`).join('')}</div>` : ''}
      <div class="field"><label class="field-label">Name</label>
        <input class="input" data-f="name" value="${esc(draft.name)}" placeholder="z. B. Kreatin" autocomplete="off" /></div>
      <div class="field"><label class="field-label">Dosis</label>
        <input class="input" data-f="dose" value="${esc(draft.dose || '')}" placeholder="optional, z. B. 5 g oder 2 Kapseln" autocomplete="off" /></div>
      <div class="field"><label class="field-label">Wann</label><div data-slot-wrap>${slotSeg()}</div></div>
      <div class="field" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:0">
        <div><label class="field-label">Vorrat</label>
          <input class="input" data-f="stock" type="text" inputmode="numeric" pattern="[0-9]*" value="${hasStock(draft) ? draft.stock : ''}" placeholder="Portionen" /></div>
        <div><label class="field-label">Pro Packung</label>
          <input class="input" data-f="pack" type="text" inputmode="numeric" pattern="[0-9]*" value="${draft.packSize ?? ''}" placeholder="optional" /></div>
      </div>
      <p class="field-hint">Mit Vorrat zählt die App bei jedem Abhaken eine Portion herunter und erinnert dich, wenn es nur noch für ${LOW_STOCK_DAYS} Tage reicht.</p>
      ${existing && draft.packSize ? `<button class="btn btn-tinted btn-block" data-restock style="margin-top:16px">Neue Packung (+${draft.packSize})</button>` : ''}
      ${existing ? `<div class="section"><div class="list"><button class="row destructive center" data-remove><div class="row-main"><span class="row-title">Supplement entfernen</span></div></button></div>
        <p class="section-foot">Bisherige Einnahmen bleiben im Kalender erhalten.</p></div>` : ''}`,
  });
  sheet.body.addEventListener('click', async (e) => {
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      qs('[data-f="name"]', sheet.body).value = preset.dataset.preset;
      draft.slot = preset.dataset.pslot;
      qs('[data-slot-wrap]', sheet.body).innerHTML = slotSeg();
      qsa('[data-preset]', sheet.body).forEach((b) => b.classList.toggle('active', b === preset));
      return;
    }
    const slotBtn = e.target.closest('[data-slot]');
    if (slotBtn && slotBtn.closest('[data-slot-seg]')) {
      draft.slot = slotBtn.dataset.slot;
      const seg = qs('[data-slot-seg]', sheet.body);
      seg.style.setProperty('--i', SLOTS.findIndex((s) => s.id === draft.slot));
      qsa('button', seg).forEach((b) => b.classList.toggle('active', b === slotBtn));
      return;
    }
    if (e.target.closest('[data-restock]')) {
      const input = qs('[data-f="stock"]', sheet.body);
      input.value = String((parseInt(input.value, 10) || 0) + draft.packSize);
      toast(`+${draft.packSize} Portionen – mit „Sichern“ übernehmen`);
      return;
    }
    if (e.target.closest('[data-remove]')) {
      if (await removeSupplement(existing)) sheet.close();
    }
  });
  return sheet;
}

// ---------- Abhaken ----------
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const sheet = topSheet();
    if (sheet?.el.classList.contains('supp-day-sheet')) {
      const day = qs('[data-action="supp-toggle"]', sheet.body)?.dataset.day;
      if (day) {
        const st = dayStatus(Store.getSupplements(), Store.getSupplementLog(), day);
        const p = qs('.supp-progress', sheet.body);
        if (p) p.textContent = `${st.done} von ${st.expected}`;
      }
      return;
    }
    render();
  }, 700);
}

function setTaken(ids, day, taken) {
  Store.setSupplementsTaken(day, ids, taken);
  ids.forEach((id) => {
    qsa(`[data-action="supp-toggle"][data-id="${id}"][data-day="${day}"]`).forEach((row) => {
      row.classList.toggle('taken', taken);
      row.setAttribute('aria-pressed', String(taken));
      const check = qs('.check', row);
      check.classList.remove('bump');
      void check.offsetWidth;
      check.classList.add('bump');
    });
  });
  const st = dayStatus(Store.getSupplements(), Store.getSupplementLog(), dayKey());
  qsa('[data-supp-progress]').forEach((p) => { p.textContent = `${st.done} von ${st.expected}`; });
  const ringFill = (sel) => qsa(`${sel} .ring-fill`).forEach((c) => {
    const len = parseFloat(c.getAttribute('stroke-dasharray'));
    c.setAttribute('stroke-dashoffset', (len * (1 - (st.expected ? st.done / st.expected : 0))).toFixed(2));
  });
  ringFill('[data-supp-progress-wrap]');
  ringFill('[data-supp-ring]');
  qsa('[data-supp-ring] .ring-label').forEach((l) => { l.textContent = `${st.done}/${st.expected}`; });
  if (taken) Sound.setDone(); else Sound.setUndone();
  haptic();
  scheduleRefresh();
}

registerContextMenu('supp', (el) => {
  const s = Store.getSupplements().find((x) => x.id === el.dataset.id);
  if (!s) return null;
  return [
    { label: 'Bearbeiten', icon: Icon.pencil, handler: () => openSupplementEditor(s.id) },
    ...(s.packSize ? [{ label: `Neue Packung (+${s.packSize})`, icon: Icon.plus, handler: () => restock(s) }] : []),
    '-',
    { label: 'Entfernen', icon: Icon.trash, destructive: true, handler: () => removeSupplement(s) },
  ];
});

function restock(s) {
  Store.saveSupplement({ ...s, stock: (hasStock(s) ? s.stock : 0) + s.packSize });
  haptic();
  render();
  toast(`${s.name}: +${s.packSize} Portionen`);
}

async function removeSupplement(s) {
  if (!(await confirmAction({ title: `„${s.name}“ entfernen?`, message: 'Bisherige Einnahmen bleiben im Kalender.', confirmLabel: 'Entfernen' }))) return false;
  Store.removeSupplement(s.id, dayKey());
  render();
  return true;
}

registerActions({
  'supp-toggle': (el) => {
    const taken = !el.classList.contains('taken');
    setTaken([el.dataset.id], el.dataset.day, taken);
  },
  'supp-all': (el) => {
    const { day, slot } = el.dataset;
    const taken = Store.getSupplementLog()[day] || {};
    const ids = activeOn(Store.getSupplements(), day).filter((s) => s.slot === slot && !taken[s.id]).map((s) => s.id);
    if (ids.length) setTaken(ids, day, true);
    el.hidden = true;
  },
  'supp-day': (el) => openDaySheet(el.dataset.day),
  'supp-month': (el) => {
    const d = new Date(ui.month.y, ui.month.m + +el.dataset.delta, 1);
    ui.month = { y: d.getFullYear(), m: d.getMonth() };
    const card = qs('#supp-cal');
    if (card) card.outerHTML = calendarHtml();
  },
  'supp-add': () => openSupplementEditor(null),
  'supp-edit': (el) => openSupplementEditor(el.dataset.id),
  'supp-start': () => { goTo('supplements'); openSupplementEditor(null); },
});

registerInputs({
  'change:supp-time': (el) => {
    const settings = Store.getSettings();
    Store.updateSettings({ supplementReminders: { ...(settings.supplementReminders || {}), [el.dataset.slot]: el.value } });
    const link = qs(`[data-reminder="${el.dataset.slot}"]`);
    if (link) link.href = reminderFile(el.value);
  },
});
