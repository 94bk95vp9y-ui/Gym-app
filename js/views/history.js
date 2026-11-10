// Tab „Verlauf“: Trainings (Kalender + Liste) und die Statistik – Woche,
// Wochenverlauf, Aktivität, Kraft, Muskeln, Rekorde, Gesamtzahlen.
import { Store } from '../core/store.js';
import {
  workoutDoneSets, workoutVolume, workoutDuration, workoutPrs, exerciseNames, entryName, weekInfo, weekStreak,
  keyLifts, recentRecords, routineFromWorkout, compareToPrevious,
  SET_TARGET_MIN, SET_TARGET_MAX,
} from '../core/training.js';
import {
  weeklySeries, activityGrid, lifetime, bestWeekStreak, weekCompare,
} from '../core/insights.js';
import { muscleSets, workoutMuscles } from '../core/muscles.js';
import { bodyMap } from '../ui/bodymap.js';
import {
  formatDuration, formatVolume, formatNumber, formatSet, formatTime, formatDate, formatDayMonth, relativeDay, plural, unitLabel,
} from '../core/format.js';
import { esc, qs, registerActions } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { haptic, HAP } from '../ui/haptics.js';
import { registerPage, push, pop, render } from '../ui/router.js';
import { confirmAction, promptDialog, registerContextMenu } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { sparkline } from '../ui/chart.js';
import {
  chev, chips, dateBadge, emptyState, deltaPill,
} from '../ui/components.js';

const MONTH = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });

const ui = { seg: 'workouts', month: null, allMonths: false, metric: 'count', pick: null };
// Von „Heute“ aus direkt in die Statistik springen
export function showStats() { ui.seg = 'stats'; ui.pick = null; }
// Viele Jahre Training ergeben Hunderte Zeilen – die Liste zeigt erst nur die
// letzten Monate, ältere auf Wunsch.
const RECENT_MONTHS = 6;
// Neuer Tag (App über Nacht offen): Kalender springt auf den aktuellen Monat
window.addEventListener('daychange', () => { ui.month = null; });
const unit = () => unitLabel(Store.getSettings().unit);

function volumeText(volume, u) {
  if (u === 'kg' && volume >= 1000) return `${formatNumber(Math.round(volume / 100) / 10)} t`;
  return `${formatVolume(volume)} ${u}`;
}

// Volumen kompakt: ab einer Tonne in t mit einer Nachkommastelle
function volumeShort(volume, u) {
  if (u === 'kg' && volume >= 1000) return `${formatNumber(Math.round(volume / 100) / 10)}<small>t</small>`;
  return `${formatVolume(volume)}<small>${u}</small>`;
}

function segHtml() {
  const items = [{ id: 'workouts', label: 'Trainings' }, { id: 'stats', label: 'Statistik' }];
  const i = items.findIndex((x) => x.id === ui.seg);
  return `
    <div class="seg-wrap">
      <div class="seg" id="history-seg" style="--n:2;--i:${i}">
        ${items.map((x) => `<button class="${x.id === ui.seg ? 'active' : ''}" data-action="history-seg" data-seg="${x.id}">${HAP}${x.label}</button>`).join('')}
        <span class="seg-thumb"></span>
      </div>
    </div>`;
}

// ---------- Trainings ----------
function calendarHtml() {
  const now = new Date();
  const ref = ui.month || { y: now.getFullYear(), m: now.getMonth() };
  ui.month = ref;
  const first = new Date(ref.y, ref.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(ref.y, ref.m + 1, 0).getDate();
  const byDay = new Map();
  Store.getWorkouts().forEach((w) => {
    const d = new Date(w.startedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDay.has(key)) byDay.set(key, w.id);
  });
  let cells = '';
  for (let i = 0; i < offset; i += 1) cells += '<span class="cal-day blank"></span>';
  for (let d = 1; d <= days; d += 1) {
    const id = byDay.get(`${ref.y}-${ref.m}-${d}`);
    const isToday = now.getFullYear() === ref.y && now.getMonth() === ref.m && now.getDate() === d;
    const future = new Date(ref.y, ref.m, d) > now;
    cells += id
      ? `<button class="cal-day hit ${isToday ? 'today' : ''}" data-action="open-workout" data-id="${id}"><span>${d}</span></button>`
      : `<span class="cal-day ${isToday ? 'today' : ''} ${future ? 'future' : ''}"><span>${d}</span></span>`;
  }
  const canForward = new Date(ref.y, ref.m + 1, 1) <= now;
  const count = Store.getWorkouts().filter((w) => {
    const d = new Date(w.startedAt);
    return d.getFullYear() === ref.y && d.getMonth() === ref.m;
  }).length;
  return `
    <div class="card" id="history-cal">
      <div class="cal-head">
        <div><strong>${MONTH.format(first)}</strong>
          <div class="muted small">${plural(count, 'Training', 'Trainings')}</div></div>
        <div class="cal-nav">
          <button data-action="history-month" data-delta="-1" aria-label="Vorheriger Monat">${Icon.chevronLeft}</button>
          <button data-action="history-month" data-delta="1" aria-label="Nächster Monat" ${canForward ? '' : 'disabled'}>${Icon.chevronRight}</button>
        </div>
      </div>
      <div class="cal-week">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </div>`;
}

function workoutsHtml() {
  const workouts = Store.getWorkouts();
  if (!workouts.length) {
    return emptyState({ icon: Icon.calendar, title: 'Noch keine Trainings', text: 'Nach deinem ersten Training steht es hier – mit allen Sätzen und Rekorden.' });
  }
  const months = [];
  workouts.forEach((w) => {
    const d = new Date(w.startedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (months[months.length - 1]?.key !== key) {
      months.push({ key, label: MONTH.format(d), items: [] });
    }
    months[months.length - 1].items.push(w);
  });
  const shown = ui.allMonths ? months : months.slice(0, RECENT_MONTHS);
  const hidden = months.slice(shown.length).reduce((n, m) => n + m.items.length, 0);
  return `
    <div class="section">${calendarHtml()}</div>
    ${shown.map((m) => `
      <div class="section hist-month">
        <div class="section-head"><h2>${esc(m.label)}</h2><span class="meta">${plural(m.items.length, 'Training', 'Trainings')}</span></div>
        <div class="list">${m.items.map((w) => {
    const prs = workoutPrs(w);
    return `
          <button class="row hist-row" data-action="open-workout" data-menu="workout" data-id="${w.id}">
            ${dateBadge(w.startedAt)}
            <div class="row-main">
              <span class="row-title strong">${esc(w.routineName || 'Freies Training')}${prs ? `<span class="pr-mark">${prs > 1 ? `${prs} PR` : 'PR'}</span>` : ''}</span>
              <span class="row-sub">${formatDuration(workoutDuration(w))} · ${plural(workoutDoneSets(w), 'Satz', 'Sätze')} · ${volumeText(workoutVolume(w), unit())}</span>
            </div>${chev}
          </button>`;
  }).join('')}</div>
      </div>`).join('')}
    ${hidden ? `<div class="section"><button class="btn btn-plain btn-block" data-action="history-more">${HAP}Ältere anzeigen (${plural(hidden, 'Training', 'Trainings')})</button></div>` : ''}`;
}

// ---------- Statistik ----------
const half = (n) => formatNumber(Math.round(n * 2) / 2);

function minutesHtml(min) {
  return min >= 60 ? `${Math.floor(min / 60)}<small>h</small> ${min % 60}<small>min</small>` : `${min}<small>min</small>`;
}
function minutesText(min) {
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

// Die vier Lesarten des Wochen-Diagramms
const METRICS = {
  count: { label: 'Trainings', value: (w) => w.count, text: (v) => plural(Math.round(v * 10) / 10, 'Training', 'Trainings').replace('.', ',') },
  volume: { label: 'Volumen', value: (w) => w.volume, text: (v, u) => volumeText(v, u) },
  sets: { label: 'Sätze', value: (w) => w.sets, text: (v) => plural(Math.round(v), 'Satz', 'Sätze') },
  minutes: { label: 'Zeit', value: (w) => w.minutes, text: (v) => minutesText(Math.round(v)) },
};
const WEEKS = 12;

function weekLabel(from, last) {
  if (last) return 'Diese Woche';
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
  return `${formatDayMonth(from)} – ${formatDayMonth(to)}`;
}

// Säulen je Woche. Bei „Trainings“ mit gestrichelter Ziellinie und farbig
// nur die Wochen im Ziel; sonst mit dem Durchschnitt als Linie. Die laufende
// Woche ist heller, weil sie noch nicht vorbei ist. Antippen einer Säule
// zeigt ihren Wert oben.
function weeksChartHtml() {
  const settings = Store.getSettings();
  const u = unit();
  const weeks = weeklySeries(WEEKS);
  const m = METRICS[ui.metric] || METRICS.count;
  const vals = weeks.map(m.value);
  const goal = ui.metric === 'count' ? settings.weeklyGoal : null;
  const past = vals.slice(0, -1).filter((v) => v > 0);
  const avg = past.length ? past.reduce((a, c) => a + c, 0) / past.length : 0;
  const line = goal ?? avg;
  const max = Math.max(...vals, line * 1.15, goal ? goal + 1 : 0, 1);
  const pick = ui.pick !== null && ui.pick < weeks.length ? ui.pick : weeks.length - 1;
  return `
    <div class="card wchart" id="stats-weeks" style="--line-f:${(line / max).toFixed(3)}">
      <div class="seg seg-sm" style="--n:4;--i:${Object.keys(METRICS).indexOf(ui.metric)}">
        ${Object.entries(METRICS).map(([id, x]) => `<button class="${id === ui.metric ? 'active' : ''}" data-action="stats-metric" data-metric="${id}">${HAP}${x.label}</button>`).join('')}
        <span class="seg-thumb"></span>
      </div>
      <div class="ch-head">
        <b class="ch-value num">${esc(m.text(vals[pick], u))}</b>
        <span class="ch-sub">${esc(weekLabel(weeks[pick].from, pick === weeks.length - 1))}${avg ? ` · Ø ${esc(m.text(avg, u))}` : ''}</span>
      </div>
      <div class="wchart-plot">
        ${line > 0 ? `<span class="wchart-goal"><span>${goal ? `Ziel ${goal}` : 'Ø'}</span></span>` : ''}
        ${weeks.map((w, i) => {
    const v = vals[i];
    const now = i === weeks.length - 1;
    const hit = goal ? v >= goal : true;
    return `
          <button class="wchart-col ${hit ? 'hit' : ''} ${now ? 'now' : ''} ${i === pick ? 'picked' : ''}" data-action="stats-pick" data-i="${i}" aria-label="${esc(weekLabel(w.from, now))}: ${esc(m.text(v, u))}">
            <i style="height:${v ? Math.max(4, (v / max) * 100) : 0}%"></i>
          </button>`;
  }).join('')}
      </div>
      <div class="wchart-axis">${weeks.map((w, i) => `<span class="${i === pick ? 'picked' : ''}">${i === weeks.length - 1 ? 'jetzt' : (i === pick || (i % 3 === (weeks.length - 1) % 3 && Math.abs(i - pick) > 1) ? `${w.from.getDate()}.${w.from.getMonth() + 1}.` : '')}</span>`).join('')}</div>
    </div>`;
}

// Aktivität der letzten Monate: ein Kästchen je Tag, dunkler = mehr Sätze
const GRID_WEEKS = 20;
function activityHtml() {
  const { cols, max } = activityGrid(GRID_WEEKS);
  const level = (sets) => (!sets ? 0 : Math.max(1, Math.min(4, Math.ceil((sets / Math.max(1, max)) * 4))));
  const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  // Monatsname über der ersten Woche eines Monats; ganz links nur, wenn
  // danach genug Platz bis zum nächsten bleibt
  const monthOf = (i) => cols[i][0].date.getMonth();
  const months = cols.map((col, i) => {
    const show = i === 0 ? monthOf(Math.min(2, cols.length - 1)) === monthOf(0) : monthOf(i) !== monthOf(i - 1);
    return `<span>${show ? MONTHS[monthOf(i)] : ''}</span>`;
  }).join('');
  const cells = cols.map((col) => col.map((c) => {
    if (c.future) return '<i class="ag-cell future"></i>';
    const label = `${formatDate(c.date.toISOString())}: ${c.sets ? plural(c.sets, 'Satz', 'Sätze') : 'kein Training'}`;
    return c.id
      ? `<button class="ag-cell lv${level(c.sets)} ${c.today ? 'today' : ''}" data-action="open-workout" data-id="${c.id}" aria-label="${esc(label)}"></button>`
      : `<i class="ag-cell ${c.today ? 'today' : ''}" aria-label="${esc(label)}"></i>`;
  }).join('')).join('');
  const total = cols.flat().filter((c) => c.count).length;
  return `
    <div class="section">
      <div class="section-head"><h2>Aktivität</h2><span class="meta">${GRID_WEEKS} Wochen</span></div>
      <div class="card">
        <div class="ag" style="--cols:${cols.length}">
          <div class="ag-months">${months}</div>
          <div class="ag-days"><span>Mo</span><span></span><span>Mi</span><span></span><span>Fr</span><span></span><span>So</span></div>
          <div class="ag-grid">${cells}</div>
        </div>
        <div class="ag-legend"><b>${plural(total, 'Trainingstag', 'Trainingstage')}</b><span>weniger</span><i class="ag-cell"></i><i class="ag-cell lv1"></i><i class="ag-cell lv2"></i><i class="ag-cell lv3"></i><i class="ag-cell lv4"></i><span>mehr Sätze</span></div>
      </div>
    </div>`;
}

// Stufe der Körperkarte nach Sätzen pro Woche
function setLevel(n) {
  if (n <= 0) return 'lv0';
  if (n < SET_TARGET_MIN / 2) return 'lv1';
  if (n < SET_TARGET_MIN) return 'lv2';
  if (n <= SET_TARGET_MAX) return 'lv3';
  return 'lv4';
}

function musclesHtml() {
  const sets = muscleSets(7);
  const groups = Object.entries(sets).filter(([, m]) => m.sets > 0).sort((a, b) => b[1].sets - a[1].sets);
  const scale = SET_TARGET_MAX * 1.25;
  return `
    <div class="section">
      <div class="section-head"><h2>Sätze pro Muskel</h2><span class="meta">7 Tage</span></div>
      <div class="card">
        ${groups.length ? `
        ${bodyMap((g) => setLevel(sets[g]?.sets || 0))}
        <div class="map-legend"><span><i class="lv1"></i>wenig</span><span><i class="lv2"></i>unter ${SET_TARGET_MIN}</span><span><i class="lv3"></i>${SET_TARGET_MIN}–${SET_TARGET_MAX}</span><span><i class="lv4"></i>über ${SET_TARGET_MAX}</span></div>
        <div class="bars">${groups.map(([g, m]) => {
    return `
          <div class="bar-row ${setLevel(m.sets)}">
            <span>${esc(g)}</span>
            <span class="bar-track"><span class="bar-zone" style="left:${(SET_TARGET_MIN / scale) * 100}%;width:${((SET_TARGET_MAX - SET_TARGET_MIN) / scale) * 100}%"></span><i style="width:${Math.min(100, (m.sets / scale) * 100)}%"></i></span>
            <b>${half(m.sets)}</b>
          </div>`;
  }).join('')}</div>` : '<p class="muted small">In den letzten 7 Tagen kein Training.</p>'}
        <p class="field-hint" style="margin:14px 0 0">Gestrichelt: ${SET_TARGET_MIN}–${SET_TARGET_MAX} harte Sätze pro Woche bringen den meisten Muskelaufbau. Mitarbeitende Muskeln zählen halb – etwa der Trizeps beim Bankdrücken.</p>
      </div>
    </div>`;
}

// Vergleich mit der Vorwoche bis zum selben Wochentag
function deltaLine(cur, prev, { pct = false, unitText = '' } = {}) {
  if (!(prev > 0)) return '';
  const d = cur - prev;
  if (!d) return '<span class="tile-delta">wie Vorwoche</span>';
  const abs = pct ? `${Math.abs(Math.round((d / prev) * 100))} %` : `${formatNumber(Math.abs(Math.round(d)))}${unitText}`;
  return `<span class="tile-delta ${d > 0 ? 'up' : ''}">${d > 0 ? Icon.arrowUp : Icon.arrowDown}${abs} zur Vorwoche</span>`;
}

function lifetimeHtml(u) {
  const all = lifetime();
  if (!all || all.count < 3) return '';
  const best = bestWeekStreak();
  const hours = Math.round(all.minutes / 60);
  return `
    <div class="section">
      <div class="section-head"><h2>Insgesamt</h2><span class="meta">seit ${esc(new Date(all.since).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }))}</span></div>
      <div class="card">
        <div class="totals">
          <div class="stat"><b class="num">${all.count}</b><span>Trainings</span></div>
          <div class="stat"><b class="num">${hours >= 1 ? `${hours}<small>h</small>` : `${all.minutes}<small>min</small>`}</b><span>Trainingszeit</span></div>
          <div class="stat"><b class="num">${volumeShort(all.volume, u)}</b><span>bewegt</span></div>
          <div class="stat"><b class="num">${formatVolume(all.sets)}</b><span>Sätze</span></div>
        </div>
        <div class="totals-foot">
          <span>${Icon.calendar}Ø ${formatNumber(Math.round(all.perWeek * 10) / 10)} pro Woche</span>
          <span>${Icon.timer}Ø ${all.avgMinutes} Min</span>
          ${best >= 2 ? `<span>${Icon.flame}Beste Serie: ${best} Wochen</span>` : ''}
        </div>
      </div>
    </div>`;
}

function statsHtml() {
  const workouts = Store.getWorkouts();
  if (!workouts.length) {
    return emptyState({ icon: Icon.chart, title: 'Noch keine Daten', text: 'Nach ein paar Trainings siehst du hier deine Woche, deine Kraftentwicklung und deine Rekorde.' });
  }
  const settings = Store.getSettings();
  const u = unit();
  const info = weekInfo();
  const streak = weekStreak(settings.weeklyGoal);
  const { cur, prev } = weekCompare();
  const lifts = keyLifts(6);
  const records = recentRecords(30, 6);
  return `
    <div class="section">
      <div class="section-head"><h2>Diese Woche</h2>${streak > 1 ? `<span class="meta streak-meta">${Icon.flame}${streak} Wochen im Ziel</span>` : ''}</div>
      <div class="tiles">
        <div class="tile"><span class="tile-label">Trainings</span><div class="tile-value">${info.count}<small>/${settings.weeklyGoal}</small></div>${deltaLine(cur.count, prev.count)}</div>
        <div class="tile"><span class="tile-label">Sätze</span><div class="tile-value">${info.sets}</div>${deltaLine(cur.sets, prev.sets)}</div>
        <div class="tile"><span class="tile-label">Volumen</span><div class="tile-value">${volumeShort(info.volume, u)}</div>${deltaLine(cur.volume, prev.volume, { pct: true })}</div>
        <div class="tile"><span class="tile-label">Trainingszeit</span><div class="tile-value">${minutesHtml(info.minutes)}</div>${deltaLine(cur.minutes, prev.minutes, { unitText: ' Min' })}</div>
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h2>Wochenverlauf</h2><span class="meta">${WEEKS} Wochen</span></div>
      ${weeksChartHtml()}
    </div>
    ${activityHtml()}
    ${lifts.length ? `
      <div class="section">
        <div class="section-head"><h2>Kraftentwicklung</h2><span class="meta">8 Wochen</span></div>
        <div class="lifts">${lifts.map((l) => {
    const d = Math.round(l.delta * 10) / 10;
    const deltaText = !d ? '± 0' : `${d > 0 ? '+' : '−'} ${l.loaded ? formatNumber(Math.abs(d)) : Math.abs(d)}`;
    return `
          <button class="lift" data-action="open-exercise-stat" data-id="${l.ex.id}">
            <span class="lift-name">${esc(l.ex.name)}</span>
            <span class="lift-value">${l.loaded ? formatNumber(Math.round(l.value)) : l.value}<small>${l.loaded ? u : 'Wdh'}</small></span>
            <span class="lift-delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${deltaText}</span>
            ${sparkline(l.points)}
          </button>`;
  }).join('')}</div>
        <p class="section-foot">Geschätztes 1RM aus deinem besten Satz je Training.</p>
      </div>` : ''}
    ${musclesHtml()}
    ${records.length ? `
      <div class="section">
        <div class="section-head"><h2>Rekorde</h2><span class="meta">30 Tage</span></div>
        <div class="list pr-list">${records.map((r) => `
          <button class="row" data-action="open-exercise-stat" data-id="${r.id}">
            ${Icon.medal}<div class="row-main"><span class="row-title">${esc(r.name)}</span><span class="row-sub">${relativeDay(r.date)}</span></div>
            <span class="row-value num">${esc(formatSet(r.set, u))}</span>${chev}
          </button>`).join('')}</div>
      </div>` : ''}
    ${lifetimeHtml(u)}`;
}

registerPage('history', {
  title: 'Verlauf',
  render: () => `${segHtml()}<div id="history-body">${ui.seg === 'workouts' ? workoutsHtml() : statsHtml()}</div>`,
});

// ---------- Ein Training ----------
registerPage('workout', {
  title: ({ id }) => Store.getWorkout(id)?.routineName || 'Freies Training',
  render: ({ id }) => {
    const w = Store.getWorkout(id);
    if (!w) return '<p class="empty">Dieses Training existiert nicht mehr.</p>';
    const u = unit();
    const names = exerciseNames();
    const prs = workoutPrs(w);
    return `
      <div class="detail-head">
        <h1 class="detail-title">${esc(w.routineName || 'Freies Training')}</h1>
        <p class="detail-meta">${new Date(w.startedAt).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${formatTime(w.startedAt)} Uhr</p>
        ${chips(Object.entries(workoutMuscles(w)).filter(([, m]) => m.direct > 0).sort((a, b) => b[1].direct - a[1].direct).slice(0, 5).map(([g]) => g))}
      </div>
      <div class="card"><div class="stats divided" style="--cols:3">
        <div class="stat"><b class="num">${Math.max(1, Math.round(workoutDuration(w) / 60000))}<small>Min</small></b><span>Dauer</span></div>
        <div class="stat"><b class="num">${workoutDoneSets(w)}</b><span>Sätze</span></div>
        <div class="stat"><b class="num">${volumeShort(workoutVolume(w), u)}</b><span>Volumen${prs ? ` · ${prs} PR` : ''}</span></div>
      </div></div>
      ${w.entries.filter((e) => e.sets.some((s) => s.done)).map((e) => {
    const done = e.sets.filter((s) => s.done);
    return `
        <div class="section">
          <div class="list">
            <button class="row" data-action="open-exercise-stat" data-id="${e.exerciseId}">
              <div class="row-main"><span class="row-title strong">${esc(entryName(e, names))}</span></div>
              ${done.length ? deltaPill(compareToPrevious(e, w), u) : ''}${chev}
            </button>
            ${done.map((s, i) => `
              <div class="set-line"><span>${i + 1}</span><span>${esc(formatSet(s, u))}</span>${s.pr ? '<span class="pr-mark">PR</span>' : '<span></span>'}</div>`).join('')}
          </div>
        </div>`;
  }).join('')}
      ${(() => {
    const skipped = w.entries.filter((e) => !e.sets.some((s) => s.done)).map((e) => entryName(e, names));
    return skipped.length ? `<p class="section-foot skipped">Ausgelassen: ${esc(skipped.join(', '))}</p>` : '';
  })()}
      <div class="section">
        <div class="list">
          ${!w.routineId && w.entries.length ? `<button class="row accent center" data-action="workout-save-plan" data-id="${w.id}"><div class="row-main"><span class="row-title">Als Plan speichern</span></div></button>` : ''}
          <button class="row destructive center" data-action="workout-delete" data-id="${w.id}"><div class="row-main"><span class="row-title">Training löschen</span></div></button>
        </div>
      </div>`;
  },
});

registerContextMenu('workout', (el) => {
  const w = Store.getWorkout(el.dataset.id);
  if (!w) return null;
  return [
    { label: 'Öffnen', icon: Icon.doc, handler: () => push('workout', { id: w.id }) },
    ...(!w.routineId && w.entries.length ? [{ label: 'Als Plan speichern', icon: Icon.plus, handler: () => saveAsPlan(w) }] : []),
    '-',
    { label: 'Training löschen', icon: Icon.trash, destructive: true, handler: () => deleteWorkout(w.id, false) },
  ];
});

async function deleteWorkout(id, back) {
  if (!(await confirmAction({ title: 'Training löschen?', message: 'Das lässt sich nicht rückgängig machen.', confirmLabel: 'Training löschen' }))) return;
  Store.deleteWorkout(id);
  if (back) pop(); else render();
  toast('Training gelöscht');
}

async function saveAsPlan(w) {
  const name = await promptDialog({ title: 'Plan speichern', message: 'Wie soll der Plan heißen?', placeholder: 'z. B. Oberkörper' });
  if (!name) return;
  Store.saveRoutine(routineFromWorkout({ ...w, routineName: name }));
  toast(`Plan „${name}“ gespeichert`);
  render();
}

registerActions({
  'history-seg': (el) => {
    if (ui.seg === el.dataset.seg) return;
    ui.seg = el.dataset.seg;
    haptic();
    const seg = qs('#history-seg');
    seg.style.setProperty('--i', ui.seg === 'workouts' ? 0 : 1);
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === el));
    qs('#history-body').innerHTML = ui.seg === 'workouts' ? workoutsHtml() : statsHtml();
  },
  'stats-metric': (el) => {
    if (ui.metric === el.dataset.metric) return;
    ui.metric = el.dataset.metric;
    ui.pick = null;
    haptic();
    const card = qs('#stats-weeks');
    if (card) card.outerHTML = weeksChartHtml();
  },
  'stats-pick': (el) => {
    ui.pick = +el.dataset.i;
    haptic();
    const card = qs('#stats-weeks');
    if (card) card.outerHTML = weeksChartHtml();
  },
  'history-more': () => {
    ui.allMonths = true;
    qs('#history-body').innerHTML = workoutsHtml();
  },
  'history-month': (el) => {
    const d = new Date(ui.month.y, ui.month.m + +el.dataset.delta, 1);
    ui.month = { y: d.getFullYear(), m: d.getMonth() };
    const card = qs('#history-cal');
    if (card) card.outerHTML = calendarHtml();
  },
  'open-workout': (el) => push('workout', { id: el.dataset.id }),
  'open-exercise-stat': (el) => push('exercise', { id: el.dataset.id }),
  'workout-delete': (el) => deleteWorkout(el.dataset.id, true),
  'workout-save-plan': (el) => {
    const w = Store.getWorkout(el.dataset.id);
    if (w) saveAsPlan(w);
  },
});
