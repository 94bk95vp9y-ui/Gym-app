// Tab „Verlauf“: Trainings (Kalender + Liste) und eine schlanke Statistik.
import { Store } from '../core/store.js';
import {
  workoutDoneSets, workoutVolume, workoutDuration, workoutPrs, exerciseNames, entryName, weekInfo, weekStreak,
  weeklyCounts, weeklySets, keyLifts, recentRecords, routineFromWorkout,
  SET_TARGET_MIN, SET_TARGET_MAX,
} from '../core/training.js';
import {
  formatDuration, formatVolume, formatNumber, formatSet, formatTime, relativeDay, plural, unitLabel,
} from '../core/format.js';
import { esc, qs, registerActions } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { registerPage, push, pop, render } from '../ui/router.js';
import { confirmAction, promptDialog } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { sparkline } from '../ui/chart.js';
import { chev, dateBadge, emptyState } from '../ui/components.js';

const ui = { seg: 'workouts', month: null };
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
        ${items.map((x) => `<button class="${x.id === ui.seg ? 'active' : ''}" data-action="history-seg" data-seg="${x.id}">${x.label}</button>`).join('')}
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
        <div><strong>${first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</strong>
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
      months.push({ key, label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }), items: [] });
    }
    months[months.length - 1].items.push(w);
  });
  return `
    <div class="section">${calendarHtml()}</div>
    ${months.map((m) => `
      <div class="section">
        <div class="section-head"><h2>${esc(m.label)}</h2><span class="meta">${plural(m.items.length, 'Training', 'Trainings')}</span></div>
        <div class="list">${m.items.map((w) => {
    const prs = workoutPrs(w);
    return `
          <button class="row hist-row" data-action="open-workout" data-id="${w.id}">
            ${dateBadge(w.startedAt)}
            <div class="row-main">
              <span class="row-title strong">${esc(w.routineName || 'Freies Training')}${prs ? `<span class="pr-mark">${prs > 1 ? `${prs} PR` : 'PR'}</span>` : ''}</span>
              <span class="row-sub">${formatDuration(workoutDuration(w))} · ${plural(workoutDoneSets(w), 'Satz', 'Sätze')} · ${volumeText(workoutVolume(w), unit())}</span>
            </div>${chev}
          </button>`;
  }).join('')}</div>
      </div>`).join('')}`;
}

// ---------- Statistik ----------
function statsHtml() {
  const workouts = Store.getWorkouts();
  if (!workouts.length) {
    return emptyState({ icon: Icon.chart, title: 'Noch keine Daten', text: 'Nach ein paar Trainings siehst du hier deine Woche, deine Kraftentwicklung und deine Rekorde.' });
  }
  const settings = Store.getSettings();
  const u = unit();
  const info = weekInfo();
  const streak = weekStreak(settings.weeklyGoal);
  const weeks = weeklyCounts(8);
  const maxWeek = Math.max(settings.weeklyGoal, ...weeks.map((w) => w.count), 1);
  const lifts = keyLifts(6);
  const sets = weeklySets(7);
  const groups = Object.entries(sets).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const records = recentRecords(30, 6);
  return `
    <div class="section">
      <div class="section-head"><h2>Diese Woche</h2>${streak ? `<span class="meta">Ziel ${streak}× in Folge</span>` : ''}</div>
      <div class="tiles">
        <div class="tile"><span class="tile-label">Trainings</span><div class="tile-value">${info.count}<small>/${settings.weeklyGoal}</small></div></div>
        <div class="tile"><span class="tile-label">Sätze</span><div class="tile-value">${info.sets}</div></div>
        <div class="tile"><span class="tile-label">Volumen</span><div class="tile-value">${volumeShort(info.volume, u)}</div></div>
        <div class="tile"><span class="tile-label">Trainingszeit</span><div class="tile-value">${info.minutes >= 60 ? `${Math.floor(info.minutes / 60)}<small>h</small> ${info.minutes % 60}<small>min</small>` : `${info.minutes}<small>min</small>`}</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h2>Trainings pro Woche</h2><span class="meta">8 Wochen</span></div>
      <div class="card">
        <div class="weeks">${weeks.map((w, i) => `
          <div class="weeks-col ${w.count >= settings.weeklyGoal ? 'hit' : ''} ${i === weeks.length - 1 ? 'now' : ''}">
            <i style="height:${Math.max(4, (w.count / maxWeek) * 76)}px"></i>
            <span>${w.count}</span>
          </div>`).join('')}</div>
        <div class="weeks-foot"><span>vor 8 Wochen</span><span>Ziel: ${settings.weeklyGoal}× pro Woche</span><span>jetzt</span></div>
      </div>
    </div>
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
    <div class="section">
      <div class="section-head"><h2>Sätze pro Muskel</h2><span class="meta">7 Tage</span></div>
      <div class="card">
        ${groups.length ? `<div class="bars">${groups.map(([g, n]) => {
    const status = n < SET_TARGET_MIN ? 'low' : n > SET_TARGET_MAX ? 'high' : 'ok';
    const scale = SET_TARGET_MAX * 1.25;
    return `
          <div class="bar-row ${status}">
            <span>${esc(g)}</span>
            <span class="bar-track"><span class="bar-zone" style="left:${(SET_TARGET_MIN / scale) * 100}%;width:${((SET_TARGET_MAX - SET_TARGET_MIN) / scale) * 100}%"></span><i style="width:${Math.min(100, (n / scale) * 100)}%"></i></span>
            <b>${n}</b>
          </div>`;
  }).join('')}</div>` : '<p class="muted small">In den letzten 7 Tagen kein Training.</p>'}
        <p class="field-hint" style="margin:12px 0 0">Gestrichelt: ${SET_TARGET_MIN}–${SET_TARGET_MAX} harte Sätze pro Woche bringen den meisten Muskelaufbau.</p>
      </div>
    </div>
    ${records.length ? `
      <div class="section">
        <div class="section-head"><h2>Rekorde</h2><span class="meta">30 Tage</span></div>
        <div class="list">${records.map((r) => `
          <button class="row" data-action="open-exercise-stat" data-id="${r.id}">
            <div class="row-main"><span class="row-title">${esc(r.name)}</span><span class="row-sub">${relativeDay(r.date)}</span></div>
            <span class="row-value num">${esc(formatSet(r.set, u))}</span>${chev}
          </button>`).join('')}</div>
      </div>` : ''}`;
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
      </div>
      <div class="card"><div class="stats divided" style="--cols:3">
        <div class="stat"><b class="num">${Math.round(workoutDuration(w) / 60000)}<small>min</small></b><span>Dauer</span></div>
        <div class="stat"><b class="num">${workoutDoneSets(w)}</b><span>Sätze</span></div>
        <div class="stat"><b class="num">${volumeShort(workoutVolume(w), u)}</b><span>Volumen${prs ? ` · ${prs} PR` : ''}</span></div>
      </div></div>
      ${w.entries.map((e) => {
    const done = e.sets.filter((s) => s.done);
    return `
        <div class="section">
          <div class="list">
            <button class="row" data-action="open-exercise-stat" data-id="${e.exerciseId}">
              <div class="row-main"><span class="row-title strong">${esc(entryName(e, names))}</span></div>${chev}
            </button>
            ${done.length ? done.map((s, i) => `
              <div class="set-line"><span>${i + 1}</span><span>${esc(formatSet(s, u))}</span>${s.pr ? '<span class="pr-mark">PR</span>' : '<span></span>'}</div>`).join('') : '<div class="set-line"><span></span><span class="muted">Keine Sätze abgehakt</span><span></span></div>'}
          </div>
        </div>`;
  }).join('')}
      <div class="section">
        <div class="list">
          ${!w.routineId && w.entries.length ? `<button class="row accent center" data-action="workout-save-plan" data-id="${w.id}"><div class="row-main"><span class="row-title">Als Plan speichern</span></div></button>` : ''}
          <button class="row destructive center" data-action="workout-delete" data-id="${w.id}"><div class="row-main"><span class="row-title">Training löschen</span></div></button>
        </div>
      </div>`;
  },
});

registerActions({
  'history-seg': (el) => {
    if (ui.seg === el.dataset.seg) return;
    ui.seg = el.dataset.seg;
    const seg = qs('#history-seg');
    seg.style.setProperty('--i', ui.seg === 'workouts' ? 0 : 1);
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === el));
    qs('#history-body').innerHTML = ui.seg === 'workouts' ? workoutsHtml() : statsHtml();
  },
  'history-month': (el) => {
    const d = new Date(ui.month.y, ui.month.m + +el.dataset.delta, 1);
    ui.month = { y: d.getFullYear(), m: d.getMonth() };
    const card = qs('#history-cal');
    if (card) card.outerHTML = calendarHtml();
  },
  'open-workout': (el) => push('workout', { id: el.dataset.id }),
  'open-exercise-stat': (el) => push('exercise', { id: el.dataset.id }),
  'workout-delete': async (el) => {
    if (!(await confirmAction({ title: 'Training löschen?', message: 'Das lässt sich nicht rückgängig machen.', confirmLabel: 'Training löschen' }))) return;
    Store.deleteWorkout(el.dataset.id);
    pop();
    toast('Training gelöscht');
  },
  'workout-save-plan': async (el) => {
    const w = Store.getWorkout(el.dataset.id);
    const name = await promptDialog({ title: 'Plan speichern', message: 'Wie soll der Plan heißen?', placeholder: 'z. B. Oberkörper' });
    if (!name || !w) return;
    Store.saveRoutine(routineFromWorkout({ ...w, routineName: name }));
    toast(`Plan „${name}“ gespeichert`);
    render();
  },
});
