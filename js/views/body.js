// Körpergewicht: ein Wert je Tag, als Kachel auf „Heute“ und mit Verlauf in
// einem Blatt. Bewusst schlicht – eintragen dauert zwei Sekunden, der Trend
// (Mittel der letzten sieben Einträge) glättet die täglichen Schwankungen.
import { Store } from '../core/store.js';
import { dayKey, dateOfKey } from '../core/supplements.js';
import {
  formatNumber, parseNumber, unitLabel, relativeDay, formatDate,
} from '../core/format.js';
import { esc, registerActions } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { render } from '../ui/router.js';
import { openSheet, promptDialog, confirmAction } from '../ui/sheet.js';
import { lineChart, sparkline } from '../ui/chart.js';
import { toast } from '../ui/toast.js';

const unit = () => unitLabel(Store.getSettings().unit);
const iso = (day) => dateOfKey(day).toISOString();

// Trend: Mittel der letzten sieben Einträge gegen die sieben davor
export function bodyTrend(log = Store.getBodyLog()) {
  if (!log.length) return null;
  const avg = (list) => list.reduce((n, x) => n + x.weight, 0) / list.length;
  const recent = log.slice(-7);
  const before = log.slice(-14, -7);
  const last = log[log.length - 1];
  // Veränderung über etwa vier Wochen: letzter Wert gegen den Eintrag, der
  // am nächsten an „vor 28 Tagen“ liegt (mindestens eine Woche alt)
  const lastTime = dateOfKey(last.day).getTime();
  const older = log.filter((x) => lastTime - dateOfKey(x.day).getTime() >= 7 * 86400000);
  const ref = older.length
    ? older.reduce((a, b) => (Math.abs(lastTime - dateOfKey(b.day).getTime() - 28 * 86400000) < Math.abs(lastTime - dateOfKey(a.day).getTime() - 28 * 86400000) ? b : a))
    : null;
  return {
    last,
    average: avg(recent),
    weekDelta: before.length >= 3 ? avg(recent) - avg(before) : null,
    ref,
    delta: ref ? last.weight - ref.weight : null,
  };
}

function deltaText(delta, u) {
  const d = Math.round(delta * 10) / 10;
  if (!d) return `± 0 ${u}`;
  return `${d > 0 ? '+' : '−'}${formatNumber(Math.abs(d))} ${u}`;
}

// Kachel für „Heute“
export function bodyTileHtml() {
  const log = Store.getBodyLog();
  const u = unit();
  const t = bodyTrend(log);
  if (!t) {
    return `
      <button class="tile" data-action="body-open">
        <span class="tile-label">Körpergewicht</span>
        <div class="bw-value faint">—<small>${u}</small></div>
        <div class="tile-sub">Eintragen und den Trend sehen</div>
        <div class="tile-foot tile-delta">${Icon.plus}Ersten Wert eintragen</div>
      </button>`;
  }
  const points = log.slice(-14).map((x) => ({ value: x.weight, date: iso(x.day) }));
  return `
    <button class="tile" data-action="body-open">
      <span class="tile-label">Körpergewicht</span>
      <div class="bw-value">${formatNumber(t.last.weight)}<small>${u}</small></div>
      <div class="tile-sub">${t.last.day === dayKey() ? 'heute' : relativeDay(iso(t.last.day))}${t.delta !== null ? ` · ${deltaText(t.delta, u)}` : ''}</div>
      ${points.length > 1 ? sparkline(points) : '<div class="tile-foot tile-delta">Ab zwei Werten mit Verlauf</div>'}
    </button>`;
}

async function enterWeight(day = dayKey()) {
  const log = Store.getBodyLog();
  const existing = log.find((x) => x.day === day);
  const last = log[log.length - 1];
  const text = await promptDialog({
    title: day === dayKey() ? 'Gewicht heute' : `Gewicht am ${formatDate(iso(day))}`,
    message: `In ${unit()} – am besten morgens, immer unter denselben Bedingungen.`,
    value: existing ? formatNumber(existing.weight) : '',
    placeholder: last ? formatNumber(last.weight) : 'z. B. 78,5',
    confirmLabel: 'Sichern',
    inputmode: 'decimal',
  });
  if (text === null || text === undefined || text === false) return false;
  const value = parseNumber(text);
  if (!(value > 0) || value > 700) { toast('Bitte ein gültiges Gewicht eingeben'); return false; }
  Store.setBodyWeight(day, value);
  return true;
}

function sheetBody() {
  const log = Store.getBodyLog();
  const u = unit();
  const t = bodyTrend(log);
  if (!t) {
    return `
      <div class="empty-state">
        <span class="empty-icon">${Icon.trendUp}</span>
        <strong>Noch kein Wert</strong>
        <p>Trag dein Gewicht regelmäßig ein – die App zeigt dir den Verlauf und glättet die täglichen Schwankungen.</p>
        <button class="btn btn-primary" data-body="add">${Icon.plus} Gewicht eintragen</button>
      </div>`;
  }
  const points = log.map((x) => ({ value: x.weight, date: iso(x.day) }));
  const rows = [...log].reverse().slice(0, 60).map((x, i, list) => {
    const prev = list[i + 1];
    const d = prev ? Math.round((x.weight - prev.weight) * 10) / 10 : 0;
    return `
      <div class="row">
        <div class="row-main"><span class="row-title">${esc(formatDate(iso(x.day)))}</span>
          ${prev && d ? `<span class="row-sub">${d > 0 ? '+' : '−'}${formatNumber(Math.abs(d))} ${u} zum Eintrag davor</span>` : ''}</div>
        <span class="row-value" style="color:var(--text)">${formatNumber(x.weight)} ${u}</span>
        <button class="icon-btn" data-body="edit" data-day="${x.day}" aria-label="Ändern">${Icon.pencil}</button>
        <button class="icon-btn" data-body="remove" data-day="${x.day}" aria-label="Löschen" style="margin-right:-8px">${Icon.trash}</button>
      </div>`;
  }).join('');
  return `
    <div class="card">
      ${points.length > 1 ? lineChart(points, { unit: u, height: 150 }) : `
        <div class="ch-head"><b class="ch-value num">${formatNumber(t.last.weight)}<small> ${u}</small></b><span class="ch-sub">Ab zwei Werten erscheint hier der Verlauf.</span></div>`}
    </div>
    <div class="section">
      <div class="tiles">
        <div class="tile"><span class="tile-label">7er-Schnitt</span><div class="tile-value">${formatNumber(Math.round(t.average * 10) / 10)}<small>${u}</small></div>
          ${t.weekDelta !== null ? `<span class="tile-delta">${deltaText(t.weekDelta, u)} zu den 7 davor</span>` : '<span class="tile-delta">glättet Schwankungen</span>'}</div>
        <div class="tile"><span class="tile-label">Veränderung</span><div class="tile-value">${t.delta !== null ? deltaText(t.delta, '').trim() : '—'}<small>${u}</small></div>
          <span class="tile-delta">${t.ref ? `seit ${esc(formatDate(iso(t.ref.day)))}` : 'ab einer Woche Daten'}</span></div>
      </div>
    </div>
    <div class="section"><button class="btn btn-primary btn-block" data-body="add">${Icon.plus} ${log.some((x) => x.day === dayKey()) ? 'Heutigen Wert ändern' : 'Gewicht eintragen'}</button></div>
    <div class="section">
      <div class="section-head"><h2>Einträge</h2><span class="meta">${log.length}</span></div>
      <div class="list">${rows}</div>
      <p class="section-foot">Die Werte bleiben auf diesem Gerät und sind Teil der Sicherung. Tägliche Schwankungen von ein bis zwei Kilo sind normal – aussagekräftig ist der Schnitt.</p>
    </div>`;
}

export function openBody() {
  const sheet = openSheet({
    title: 'Körpergewicht',
    full: Store.getBodyLog().length > 2,
    body: sheetBody(),
    onClose: () => render(),
  });
  sheet.body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-body]');
    if (!b) return;
    const kind = b.dataset.body;
    if (kind === 'add' || kind === 'edit') {
      if (await enterWeight(b.dataset.day || dayKey())) sheet.setBody(sheetBody());
    } else if (kind === 'remove') {
      const ok = await confirmAction({ title: 'Eintrag löschen?', message: formatDate(iso(b.dataset.day)), confirmLabel: 'Löschen' });
      if (!ok) return;
      Store.setBodyWeight(b.dataset.day, 0);
      sheet.setBody(sheetBody());
    }
  });
  return sheet;
}

// Abschnitt für die Statistik
export function bodyStatsHtml() {
  const log = Store.getBodyLog();
  if (log.length < 2) return '';
  const u = unit();
  const points = log.map((x) => ({ value: x.weight, date: iso(x.day) }));
  return `
    <div class="section">
      <div class="section-head"><h2>Körpergewicht</h2><button class="link" data-action="body-open">Einträge</button></div>
      <div class="card">${lineChart(points, { unit: u, height: 140 })}</div>
    </div>`;
}

registerActions({
  // Ohne Werte gleich zur Eingabe – noch in der Tipp-Geste, damit das iPhone
  // die Tastatur öffnet
  'body-open': async () => {
    if (Store.getBodyLog().length) { openBody(); return; }
    if (await enterWeight()) { render(); openBody(); }
  },
});
