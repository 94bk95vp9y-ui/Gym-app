// Tab „Supplements“: täglich abhaken, nachtragen, Vorrat, Erinnerungen.
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
import { openSheet, topSheet, confirmAction } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

const chev = `<span class="row-chev">${Icon.chevronRight}</span>`;
const ui = { month: null };

function dayLabel(key) {
  const today = dayKey();
  if (key === today) return 'Heute';
  if (key === shiftDay(today, -1)) return 'Gestern';
  return dateOfKey(key).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function stockText(s) {
  if (!hasStock(s)) return '';
  if (s.stock <= 0) return 'Vorrat leer';
  return s.stock <= LOW_STOCK_DAYS ? `Noch ${plural(s.stock, 'Portion', 'Portionen')} – nachkaufen` : `Vorrat: ${plural(s.stock, 'Portion', 'Portionen')}`;
}

// Abhakliste eines Tages, gegliedert nach Tageszeit
function checklistHtml(day, { allButtons = true } = {}) {
  const items = activeOn(Store.getSupplements(), day);
  const taken = Store.getSupplementLog()[day] || {};
  const today = dayKey();
  const nowIndex = SLOTS.findIndex((s) => s.id === currentSlot());
  return SLOTS.map((slot, index) => {
    const inSlot = items.filter((s) => s.slot === slot.id);
    if (!inSlot.length) return '';
    const open = inSlot.filter((s) => !taken[s.id]);
    const later = day === today && index > nowIndex;
    return `
      <div class="supp-slot">
        <div class="supp-slot-head"><span>${slot.label}${later ? ' · später' : ''}</span>
          ${allButtons && open.length > 1 ? `<button data-action="supp-all" data-day="${day}" data-slot="${slot.id}">Alle abhaken</button>` : ''}</div>
        ${inSlot.map((s) => `
          <button class="row supp-item ${taken[s.id] ? 'taken' : ''}" data-action="supp-toggle" data-id="${s.id}" data-day="${day}" aria-pressed="${!!taken[s.id]}">
            <div class="row-main">
              <span class="row-title">${esc(s.name)}</span>
              ${s.dose || (hasStock(s) && s.stock <= LOW_STOCK_DAYS) ? `<span class="row-sub ${hasStock(s) && s.stock <= LOW_STOCK_DAYS ? 'warn' : ''}">${esc([s.dose, hasStock(s) && s.stock <= LOW_STOCK_DAYS ? stockText(s) : ''].filter(Boolean).join(' · '))}</span>` : ''}
            </div>
            <span class="check">${Icon.check}</span>
          </button>`).join('')}
      </div>`;
  }).join('');
}

// Karte für „Heute“ (auch im Supplements-Tab oben)
export function supplementsTodayHtml({ inTab = false } = {}) {
  const active = Store.getActiveSupplements();
  if (!active.length) {
    if (inTab) return '';
    return `
      <div class="section">
        <div class="section-head"><h2>Supplements</h2></div>
        <div class="list inset-icons">
          <button class="row" data-action="supp-start"><span class="row-icon accent">${Icon.pill}</span>
            <div class="row-main"><span class="row-title">Supplements hinzufügen</span><span class="row-sub">Täglich abhaken, mit Serie und Erinnerung</span></div>${chev}</button>
        </div>
      </div>`;
  }
  const today = dayKey();
  const supplements = Store.getSupplements();
  const log = Store.getSupplementLog();
  const st = dayStatus(supplements, log, today);
  const series = streak(supplements, log, today);
  const low = lowStock(supplements);
  if (st.complete && !inTab) {
    return `
      <div class="section">
        <div class="section-head"><h2>Supplements</h2></div>
        <div class="list inset-icons">
          <button class="row supp-done-row" data-action="tab" data-tab="supplements"><span class="row-icon">${Icon.check}</span>
            <div class="row-main"><span class="row-title">Alles genommen</span><span class="row-sub">${st.expected} von ${st.expected}${series > 1 ? ` · ${series} Tage in Folge` : ''}</span></div>${chev}</button>
          ${low.map((s) => `
            <button class="row" data-action="supp-edit" data-id="${s.id}"><span class="row-icon" style="background:var(--warn-tint);color:var(--warn)">${Icon.alert}</span>
              <div class="row-main"><span class="row-title">${esc(s.name)}</span><span class="row-sub warn">${esc(stockText(s))}</span></div>${chev}</button>`).join('')}
        </div>
      </div>`;
  }
  const yesterday = shiftDay(today, -1);
  const y = dayStatus(supplements, log, yesterday);
  return `
    <div class="section" data-supp-card>
      <div class="section-head"><h2>${inTab ? 'Heute' : 'Supplements'}</h2><span class="supp-progress" data-supp-progress>${st.done} von ${st.expected}</span></div>
      <div class="list">${checklistHtml(today)}</div>
      ${!inTab && y.expected && !y.complete ? `<p class="section-foot"><button class="text-link" data-action="supp-day" data-day="${yesterday}">Gestern ${y.done} von ${y.expected} – nachtragen</button></p>` : ''}
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
    cells += `<button class="cal-day ${cls} ${key === today ? 'today' : ''}" ${pickable ? `data-action="supp-day" data-day="${key}"` : 'disabled'}><span>${d}</span></button>`;
  }
  const canForward = new Date(ref.y, ref.m + 1, 1) <= dateOfKey(today);
  return `
    <div class="card" id="supp-cal">
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
      <div class="list">
        ${slots.map((slot) => {
    const time = settings.supplementReminders?.[slot.id] || slot.reminder;
    return `
          <div class="row">
            <div class="row-main"><span class="row-title">${slot.label}</span></div>
            <select class="input" style="width:auto;height:34px;padding:0 10px;font-size:16px" data-change="supp-time" data-slot="${slot.id}">
              ${REMINDER_TIMES.map((t) => `<option value="${t}" ${t === time ? 'selected' : ''}>${t.slice(0, 2)}:${t.slice(2)}</option>`).join('')}
            </select>
            <a class="btn btn-tinted btn-sm" href="${reminderFile(time)}" data-reminder="${slot.id}" target="_blank" rel="noopener">${Icon.calendar} Kalender</a>
          </div>`;
  }).join('')}
      </div>
      <p class="section-foot">Web-Apps dürfen auf dem iPhone keine eigenen Erinnerungen planen – der Kalender schon. Einmal hinzufügen, dann meldet sich dein iPhone jeden Tag zur gewählten Zeit.</p>
    </div>`;
}

registerPage('supplements', {
  title: 'Supplements',
  right: () => `<button class="nav-btn icon-only" data-action="supp-add" aria-label="Supplement hinzufügen">${Icon.plus}</button>`,
  render: () => {
    const active = Store.getActiveSupplements();
    if (!active.length) {
      return `
        <div class="section">
          <div class="card empty">
            <strong>Noch keine Supplements</strong>
            Leg an, was du täglich nimmst. Dann hakst du es auf „Heute“ ab und siehst, ob du etwas vergessen hast.
            <button class="btn btn-primary btn-block" data-action="supp-add">Supplement hinzufügen</button>
          </div>
        </div>`;
    }
    const supplements = Store.getSupplements();
    const log = Store.getSupplementLog();
    const today = dayKey();
    const series = streak(supplements, log, today);
    const quote = adherence(supplements, log, today, 30);
    return `
      ${supplementsTodayHtml({ inTab: true })}
      <div class="section">
        <div class="card"><div class="stats divided">
          <div class="stat"><b class="num">${series}</b><span>${series === 1 ? 'Tag' : 'Tage'} in Folge</span></div>
          <div class="stat"><b class="num">${quote ? `${quote.percent} %` : '–'}</b><span>${quote ? `letzte ${quote.days} Tage` : 'noch keine Daten'}</span></div>
          <div class="stat"><b class="num">${active.length}</b><span>aktiv</span></div>
        </div></div>
      </div>
      <div class="section">
        <div class="section-head"><h2>Kalender</h2><span class="muted small">Tag antippen zum Nachtragen</span></div>
        ${calendarHtml()}
      </div>
      <div class="section">
        <div class="section-head"><h2>Meine Supplements</h2></div>
        <div class="list">
          ${SLOTS.flatMap((slot) => active.filter((s) => s.slot === slot.id).map((s) => `
            <button class="row" data-action="supp-edit" data-id="${s.id}">
              <div class="row-main">
                <span class="row-title">${esc(s.name)}</span>
                <span class="row-sub ${hasStock(s) && s.stock <= LOW_STOCK_DAYS ? 'warn' : ''}">${esc([slot.label, s.dose, stockText(s)].filter(Boolean).join(' · '))}</span>
              </div>${chev}
            </button>`)).join('')}
        </div>
      </div>
      ${remindersHtml(active)}`;
  },
});

// ---------- Tag nachtragen ----------
function openDaySheet(day) {
  const body = () => {
    const st = dayStatus(Store.getSupplements(), Store.getSupplementLog(), day);
    return `
      <div class="section-head" style="margin-top:4px"><h2>${esc(dayLabel(day))}</h2><span class="supp-progress">${st.done} von ${st.expected}</span></div>
      <div class="list">${checklistHtml(day)}</div>`;
  };
  openSheet({ title: 'Nachtragen', body: body(), onClose: () => render(), className: 'supp-day-sheet' });
}

// ---------- Anlegen & Bearbeiten ----------
export function openSupplementEditor(id = null) {
  const existing = id ? Store.getSupplements().find((s) => s.id === id) : null;
  const draft = existing ? { ...existing } : { id: uid(), name: '', dose: '', slot: 'morning', since: dayKey(), stock: null, packSize: null };
  const takenNames = new Set(Store.getActiveSupplements().map((s) => s.name.toLowerCase()));
  const presets = SUPPLEMENT_PRESETS.filter((p) => !takenNames.has(p.name.toLowerCase()));
  const slotSeg = () => `
    <div class="seg" style="--n:4;--i:${SLOTS.findIndex((s) => s.id === draft.slot)}" data-slot-seg>
      ${SLOTS.map((s) => `<button type="button" class="${s.id === draft.slot ? 'active' : ''}" data-slot="${s.id}">${s.short}</button>`).join('')}
      <span class="seg-thumb"></span>
    </div>`;
  const sheet = openSheet({
    title: existing ? 'Supplement' : 'Neues Supplement',
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
        <div class="choices" style="margin-bottom:18px">${presets.map((p) => `<button class="choice" data-preset="${esc(p.name)}" data-pslot="${p.slot}">${esc(p.name)}</button>`).join('')}</div>` : ''}
      <div class="field"><label class="field-label">Name</label>
        <input class="input" data-f="name" value="${esc(draft.name)}" placeholder="z. B. Kreatin" autocomplete="off" /></div>
      <div class="field"><label class="field-label">Dosis (optional)</label>
        <input class="input" data-f="dose" value="${esc(draft.dose || '')}" placeholder="z. B. 5 g oder 2 Kapseln" autocomplete="off" /></div>
      <div class="field"><label class="field-label">Wann</label><div data-slot-wrap>${slotSeg()}</div></div>
      <div class="field" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="field-label">Vorrat (Portionen)</label>
          <input class="input" data-f="stock" type="text" inputmode="numeric" pattern="[0-9]*" value="${hasStock(draft) ? draft.stock : ''}" placeholder="optional" /></div>
        <div><label class="field-label">Pro Packung</label>
          <input class="input" data-f="pack" type="text" inputmode="numeric" pattern="[0-9]*" value="${draft.packSize ?? ''}" placeholder="optional" /></div>
      </div>
      <p class="field-hint">Mit Vorrat zählt die App bei jedem Abhaken eine Portion herunter und erinnert dich, wenn es nur noch für ${LOW_STOCK_DAYS} Tage reicht.</p>
      ${existing && draft.packSize ? `<button class="btn btn-tinted btn-block" data-restock style="margin-top:14px">Neue Packung (+${draft.packSize})</button>` : ''}
      ${existing ? `<div class="section"><div class="list"><button class="row destructive" data-remove><div class="row-main"><span class="row-title">Supplement entfernen</span></div></button></div>
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
      if (!(await confirmAction({ title: `„${existing.name}“ entfernen?`, message: 'Bisherige Einnahmen bleiben im Kalender.', confirmLabel: 'Entfernen' }))) return;
      Store.removeSupplement(existing.id, dayKey());
      sheet.close();
      render();
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
  }, 650);
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
  const p = qs('[data-supp-progress]');
  if (p) p.textContent = `${st.done} von ${st.expected}`;
  if (taken) Sound.setDone(); else Sound.setUndone();
  scheduleRefresh();
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
