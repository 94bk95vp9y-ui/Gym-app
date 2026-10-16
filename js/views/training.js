// Tab „Training“: Pläne und Übungen, Detailseiten, Plan-Editor, KI-Import.
import { Store, MUSCLE_GROUPS, REST_OPTIONS, DEFAULT_PLAN_SETS, uid } from '../core/store.js';
import {
  nextPlan, lastDoneMap, planMinutes, plannedSets, lastPerformanceMap, exerciseHistory,
} from '../core/training.js';
import {
  formatSet, formatSetList, formatNumber, formatRest, formatDate, relativeDay, plural, unitLabel,
} from '../core/format.js';
import { buildPlanPrompt, parsePlanText, normalizeExerciseName } from '../core/plan-import.js';
import { esc, qs, registerActions, registerInputs } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { registerPage, render, push, pop } from '../ui/router.js';
import { openSheet, actionSheet, confirmAction, alertDialog } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { lineChart } from '../ui/chart.js';
import { enableReorder } from '../ui/reorder.js';
import { openExercisePicker, openExerciseEditor, filterExercises, groupedHtml } from './picker.js';
import { startRoutine, startBlank } from './workout.js';

const ui = { seg: 'plans', query: '' };
const chev = `<span class="row-chev">${Icon.chevronRight}</span>`;

function unit() { return unitLabel(Store.getSettings().unit); }

// ---------- Wurzelseite ----------
function segHtml() {
  const items = [{ id: 'plans', label: 'Pläne' }, { id: 'exercises', label: 'Übungen' }];
  const i = items.findIndex((x) => x.id === ui.seg);
  return `
    <div class="seg-wrap">
      <div class="seg" id="training-seg" style="--n:2;--i:${i}">
        ${items.map((x) => `<button class="${x.id === ui.seg ? 'active' : ''}" data-action="training-seg" data-seg="${x.id}">${x.label}</button>`).join('')}
        <span class="seg-thumb"></span>
      </div>
    </div>`;
}

function lastLabel(lastDone, r) {
  return lastDone.has(r.id) ? `zuletzt ${relativeDay(lastDone.get(r.id))}` : 'noch nicht trainiert';
}

function plansHtml() {
  const routines = Store.getRoutines();
  const extra = `
    <div class="section">
      <div class="list inset-icons">
        <button class="row" data-action="start-blank">
          <span class="row-icon accent">${Icon.plus}</span>
          <div class="row-main"><span class="row-title">Leeres Training</span><span class="row-sub">Übungen spontan auswählen</span></div>${chev}
        </button>
        <button class="row" data-action="plan-import">
          <span class="row-icon accent">${Icon.doc}</span>
          <div class="row-main"><span class="row-title">Pläne mit KI erstellen</span><span class="row-sub">Prompt kopieren, Antwort einfügen</span></div>${chev}
        </button>
      </div>
    </div>`;
  if (!routines.length) {
    return `
      <div class="section">
        <div class="card empty">
          <strong>Noch keine Pläne</strong>
          Lege deinen ersten Trainingsplan an – selbst oder mit einer KI aus einer Sprachnachricht.
          <button class="btn btn-primary btn-block" data-action="plan-new">Plan erstellen</button>
        </div>
      </div>${extra}`;
  }
  const next = nextPlan(routines);
  const lastDone = lastDoneMap();
  return `
    <div class="section">
      <div class="list">
        ${routines.map((r) => `
          <button class="row plan-row" data-action="open-plan" data-id="${r.id}">
            <div class="row-main">
              <span class="row-title">${esc(r.name)}${r === next && routines.length > 1 ? '<span class="tag">Als Nächstes</span>' : ''}</span>
              <span class="row-sub">${plural(r.exerciseIds.length, 'Übung', 'Übungen')} · ${lastLabel(lastDone, r)}</span>
            </div>${chev}
          </button>`).join('')}
      </div>
    </div>${extra}`;
}

function exerciseRow(last) {
  return (ex) => {
    const info = last.get(ex.id);
    return `
      <button class="row" data-action="open-exercise" data-id="${ex.id}">
        <div class="row-main">
          <span class="row-title">${esc(ex.name)}</span>
          ${info ? `<span class="row-sub">${esc(formatSet(info.best, unit()))} · ${relativeDay(info.date)}</span>` : ''}
        </div>${chev}
      </button>`;
  };
}

function exerciseListHtml() {
  return groupedHtml(filterExercises(Store.getExercises(), ui.query), exerciseRow(lastPerformanceMap()));
}

function exercisesHtml() {
  return `
    <label class="search">${Icon.search}<input class="input" type="search" placeholder="Übung suchen" value="${esc(ui.query)}" data-input="ex-search" autocomplete="off" /></label>
    <div id="ex-list">${exerciseListHtml()}</div>`;
}

registerPage('training', {
  title: 'Training',
  right: () => `<button class="nav-btn icon-only" data-action="training-add" aria-label="Hinzufügen">${Icon.plus}</button>`,
  render: () => `${segHtml()}<div id="training-body">${ui.seg === 'plans' ? plansHtml() : exercisesHtml()}</div>`,
});

// ---------- Plan ----------
registerPage('plan', {
  title: ({ id }) => Store.getRoutine(id)?.name || 'Plan',
  right: ({ id }) => `<button class="nav-btn" data-action="plan-edit" data-id="${id}">Bearbeiten</button>`,
  render: ({ id }) => {
    const r = Store.getRoutine(id);
    if (!r) return '<p class="empty">Dieser Plan existiert nicht mehr.</p>';
    const minutes = planMinutes(r);
    const lastDone = lastDoneMap();
    const last = lastPerformanceMap();
    const rows = r.exerciseIds.map((eid) => {
      const ex = Store.getExercise(eid);
      if (!ex) return '';
      const info = last.get(eid);
      return `
        <button class="row plan-ex" data-action="open-exercise" data-id="${eid}">
          <div class="row-main">
            <span class="row-title">${esc(ex.name)}</span>
            <span class="row-sub">${info ? `Zuletzt ${esc(formatSet(info.best, unit()))}` : esc(ex.muscleGroup)}</span>
          </div>
          <span class="row-value">${plural(plannedSets(r, eid), 'Satz', 'Sätze')}</span>${chev}
        </button>`;
    }).join('');
    return `
      <div class="detail-head">
        <h1 class="detail-title">${esc(r.name)}</h1>
        <p class="detail-meta">${plural(r.exerciseIds.length, 'Übung', 'Übungen')}${minutes ? ` · ca. ${minutes} Min` : ''} · ${lastLabel(lastDone, r)}</p>
      </div>
      <button class="btn btn-primary btn-block" data-action="start-routine" data-id="${r.id}" ${r.exerciseIds.length ? '' : 'disabled'}>${Icon.play} Training starten</button>
      <div class="section">
        <div class="section-head"><h2>Übungen</h2></div>
        ${rows ? `<div class="list">${rows}</div>` : '<div class="card empty">Noch keine Übungen. Tippe auf „Bearbeiten“.</div>'}
      </div>`;
  },
});

// ---------- Übung ----------
function exerciseStatsHtml(ex) {
  const h = exerciseHistory(ex.id);
  if (!h.sessions.length) {
    return '<div class="card muted small">Noch nicht trainiert. Nach dem ersten Training siehst du hier Bestleistung und Verlauf.</div>';
  }
  const u = unit();
  const best = h.best;
  const stats = h.loaded ? `
      <div class="stat"><b class="num">${formatNumber(best.top.weight)}<small>${u}</small></b><span>Bestleistung · ${best.top.reps} Wdh</span></div>
      <div class="stat"><b class="num">${formatNumber(Math.round(h.bestValue))}<small>${u}</small></b><span>1RM geschätzt</span></div>
      <div class="stat"><b class="num">${h.sessions.length}</b><span>Einheiten</span></div>`
    : `
      <div class="stat"><b class="num">${best.top.reps}</b><span>Meiste Wdh</span></div>
      <div class="stat"><b class="num">${h.sessions.length}</b><span>Einheiten</span></div>
      <div class="stat"><b>${esc(relativeDay(h.sessions[0].date))}</b><span>Zuletzt</span></div>`;
  const chart = h.points.length >= 2 ? `
    <div class="section">
      <div class="section-head"><h2>${h.loaded ? 'Geschätztes 1RM' : 'Wiederholungen'}</h2></div>
      <div class="card">${lineChart(h.points.slice(-20), { unit: h.loaded ? u : '' })}</div>
    </div>` : '';
  const history = `
    <div class="section">
      <div class="section-head"><h2>Verlauf</h2></div>
      <div class="card tight">${h.sessions.slice(0, 10).map((s) => `
        <div class="history-row"><span>${esc(formatDate(s.date))}</span><span>${esc(formatSetList(s.sets, u))}${s.sets.some((x) => x.pr) ? '<span class="pr-mark">PR</span>' : ''}</span></div>`).join('')}
      </div>
    </div>`;
  return `<div class="card"><div class="stats ex-stats divided">${stats}</div></div>${chart}${history}`;
}

registerPage('exercise', {
  title: ({ id }) => Store.getExercise(id)?.name || 'Übung',
  right: ({ id }) => `<button class="nav-btn" data-action="exercise-edit" data-id="${id}">Bearbeiten</button>`,
  render: ({ id }) => {
    const ex = Store.getExercise(id);
    if (!ex) return '<p class="empty">Diese Übung existiert nicht mehr.</p>';
    const s = Store.getSettings();
    const rest = ex.restSeconds ?? null;
    return `
      <div class="detail-head">
        <h1 class="detail-title">${esc(ex.name)}</h1>
        <p class="detail-meta">${esc(ex.muscleGroup)}</p>
      </div>
      ${exerciseStatsHtml(ex)}
      <div class="section">
        <div class="section-head"><h2>Notiz</h2></div>
        <textarea class="input" rows="3" data-input="ex-note" data-id="${ex.id}" placeholder="z. B. Ellbogen nah am Körper, Rücken gerade">${esc(ex.notes || '')}</textarea>
        <p class="field-hint">Erscheint im Training klein unter der Übung.</p>
      </div>
      <div class="section">
        <div class="list">
          <button class="row" data-action="ex-rest" data-id="${ex.id}">
            <div class="row-main"><span class="row-title">Satzpause</span></div>
            <span class="row-value">${rest === null ? `Standard (${formatRest(s.restSeconds)})` : formatRest(rest)}</span>${chev}
          </button>
        </div>
        <p class="section-foot">Zum Beispiel länger bei Kniebeugen, kürzer bei Curls.</p>
      </div>
      <div class="section">
        <div class="list"><button class="row destructive" data-action="exercise-delete" data-id="${ex.id}"><div class="row-main"><span class="row-title">Übung löschen</span></div></button></div>
      </div>`;
  },
});

// ---------- Plan-Editor ----------
export function openPlanEditor(id = null, { onSaved = null } = {}) {
  const existing = id ? Store.getRoutine(id) : null;
  const draft = existing
    ? { ...existing, exerciseIds: [...existing.exerciseIds], setCounts: { ...(existing.setCounts || {}) } }
    : { id: uid(), name: '', exerciseIds: [], setCounts: {} };
  // Ältere Pläne kennen nicht für jede Übung eine Satzzahl: jetzt festschreiben
  draft.exerciseIds.forEach((eid) => { draft.setCounts[eid] = plannedSets(existing, eid); });
  let dirty = false;

  const rowsHtml = () => (draft.exerciseIds.length ? draft.exerciseIds.map((eid, i) => {
    const ex = Store.getExercise(eid);
    return `
      <div class="row edit-row" data-index="${i}">
        <span class="drag-handle" data-drag-handle aria-label="Verschieben">${Icon.reorder}</span>
        <div class="row-main"><span class="row-title">${esc(ex ? ex.name : 'Unbekannt')}</span></div>
        <span class="stepper">
          <button data-step="-1" data-i="${i}" aria-label="Weniger Sätze">${Icon.minus}</button>
          <span class="num">${draft.setCounts[eid]}</span>
          <button data-step="1" data-i="${i}" aria-label="Mehr Sätze">${Icon.plus}</button>
        </span>
        <button class="icon-btn remove-btn" data-remove="${i}" aria-label="Entfernen">${Icon.close}</button>
      </div>`;
  }).join('') : '<div class="row"><div class="row-main"><span class="row-sub">Noch keine Übungen</span></div></div>');

  const body = () => `
    <div class="field">
      <label class="field-label">Name</label>
      <input class="input" data-f="name" value="${esc(draft.name)}" placeholder="z. B. Push, Oberkörper A" autocomplete="off" />
    </div>
    <label class="field-label">Übungen und Sätze</label>
    <div class="list" data-rows>${rowsHtml()}</div>
    <button class="row accent" data-add style="border-radius:var(--r-card);margin-top:10px">
      <span class="row-icon accent">${Icon.plus}</span><div class="row-main"><span class="row-title">Übungen hinzufügen</span></div>
    </button>
    ${existing ? `<div class="section"><div class="list"><button class="row destructive" data-delete><div class="row-main"><span class="row-title">Plan löschen</span></div></button></div></div>` : ''}`;

  const save = (s) => {
    const nameEl = qs('[data-f="name"]', s.body);
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); toast('Bitte einen Namen eingeben'); return; }
    const setCounts = {};
    draft.exerciseIds.forEach((eid) => { setCounts[eid] = draft.setCounts[eid]; });
    Store.saveRoutine({ ...draft, name, setCounts });
    s.close();
    render();
    onSaved?.(draft.id);
  };

  const sheet = openSheet({
    title: existing ? 'Plan bearbeiten' : 'Neuer Plan',
    full: true,
    left: {
      label: 'Abbrechen',
      action: async (s) => {
        if (dirty && !(await confirmAction({ title: 'Änderungen verwerfen?', confirmLabel: 'Verwerfen' }))) return;
        s.close();
      },
    },
    right: { label: 'Sichern', style: 'primary', action: save },
    body: body(),
  });

  const rows = () => qs('[data-rows]', sheet.body);
  const repaint = () => {
    rows().innerHTML = rowsHtml();
  };
  qs('[data-f="name"]', sheet.body).addEventListener('input', (e) => { draft.name = e.target.value; dirty = true; });
  enableReorder(rows(), {
    row: '.edit-row',
    onReorder: (from, to) => {
      const [moved] = draft.exerciseIds.splice(from, 1);
      draft.exerciseIds.splice(to, 0, moved);
      dirty = true;
      repaint();
    },
  });
  sheet.body.addEventListener('click', async (e) => {
    const step = e.target.closest('[data-step]');
    if (step) {
      const eid = draft.exerciseIds[+step.dataset.i];
      draft.setCounts[eid] = Math.max(1, Math.min(12, draft.setCounts[eid] + +step.dataset.step));
      step.parentElement.querySelector('span').textContent = draft.setCounts[eid];
      dirty = true;
      return;
    }
    const rem = e.target.closest('[data-remove]');
    if (rem) {
      const [gone] = draft.exerciseIds.splice(+rem.dataset.remove, 1);
      delete draft.setCounts[gone];
      dirty = true;
      repaint();
      return;
    }
    if (e.target.closest('[data-add]')) {
      openExercisePicker({
        fixed: draft.exerciseIds,
        fixedLabel: 'im Plan',
        onDone: (ids) => {
          ids.forEach((eid) => {
            draft.exerciseIds.push(eid);
            draft.setCounts[eid] = DEFAULT_PLAN_SETS;
          });
          dirty = true;
          repaint();
        },
      });
      return;
    }
    if (e.target.closest('[data-delete]')) {
      if (!(await confirmAction({ title: `„${existing.name}“ löschen?`, message: 'Bisherige Trainings bleiben im Verlauf.', confirmLabel: 'Plan löschen' }))) return;
      Store.deleteRoutine(existing.id);
      sheet.close();
      pop();
      toast('Plan gelöscht');
    }
  });
  return sheet;
}

// ---------- KI-Import ----------
function resolveImportedPlans(parsed) {
  const exercises = Store.getExercises();
  const byName = new Map(exercises.map((e) => [normalizeExerciseName(e.name), e]));
  const findExercise = (name) => {
    const norm = normalizeExerciseName(name);
    if (byName.has(norm)) return byName.get(norm);
    const base = normalizeExerciseName(name.replace(/\([^)]*\)/g, ''));
    if (base.length >= 4 && byName.has(base)) return byName.get(base);
    if (base.length < 4) return null;
    return exercises
      .filter((e) => {
        const n = normalizeExerciseName(e.name);
        return n.includes(base) || base.includes(n);
      })
      .sort((a, b) => a.name.length - b.name.length)[0] || null;
  };
  const created = new Map();
  const plans = parsed.plans.map((plan) => {
    const items = plan.items.map((item) => {
      const match = findExercise(item.name);
      if (match) return { exercise: match, sets: item.sets, isNew: false };
      const key = normalizeExerciseName(item.name);
      if (!created.has(key)) {
        created.set(key, {
          id: uid(),
          name: item.name,
          muscleGroup: MUSCLE_GROUPS.includes(item.muscleGroup) ? item.muscleGroup : 'Sonstiges',
          notes: '',
        });
      }
      return { exercise: created.get(key), sets: item.sets, isNew: true };
    });
    const replaces = Store.getRoutines().find((r) => r.name.trim().toLowerCase() === plan.name.trim().toLowerCase()) || null;
    return { name: plan.name, items, replaces };
  });
  return { plans, newExercises: [...created.values()], warnings: parsed.warnings };
}

function applyImportedPlans(resolved) {
  resolved.newExercises.forEach((ex) => Store.saveExercise(ex));
  resolved.plans.forEach((plan) => {
    const ids = [];
    const setCounts = {};
    plan.items.forEach((item) => {
      if (ids.includes(item.exercise.id)) return;
      ids.push(item.exercise.id);
      setCounts[item.exercise.id] = item.sets;
    });
    Store.saveRoutine({ id: plan.replaces ? plan.replaces.id : uid(), name: plan.name, exerciseIds: ids, setCounts });
  });
}

function openImportSheet() {
  const sheet = openSheet({
    title: 'Pläne mit KI erstellen',
    full: true,
    left: { label: 'Abbrechen' },
    right: null,
    body: `
      <div class="list inset-icons">
        <div class="row"><span class="row-icon">1</span><div class="row-main"><span class="row-title">Prompt kopieren</span><span class="row-sub">Er enthält deine Übungsliste, damit die KI die richtigen Namen nutzt.</span></div></div>
        <div class="row"><span class="row-icon">2</span><div class="row-main"><span class="row-title">In ChatGPT o. ä. einfügen</span><span class="row-sub">Dann deinen Plan beschreiben – per Sprachnachricht geht es am schnellsten.</span></div></div>
        <div class="row"><span class="row-icon">3</span><div class="row-main"><span class="row-title">Antwort hier einfügen</span><span class="row-sub">Und auf „Einlesen“ tippen.</span></div></div>
      </div>
      <button class="btn btn-tinted btn-block" data-copy style="margin-top:14px">${Icon.copy} Prompt kopieren</button>
      <div class="field" style="margin-top:18px">
        <label class="field-label">Antwort der KI</label>
        <textarea class="input" rows="7" data-import-text placeholder="PLAN: Push&#10;- Bankdrücken (Langhantel) | 3&#10;- …"></textarea>
      </div>
      <button class="btn btn-primary btn-block" data-parse>Einlesen</button>`,
  });
  sheet.body.addEventListener('click', async (e) => {
    if (e.target.closest('[data-copy]')) {
      const prompt = buildPlanPrompt(Store.getExercises(), MUSCLE_GROUPS);
      try {
        await navigator.clipboard.writeText(prompt);
        toast('Prompt kopiert');
      } catch {
        const area = qs('[data-import-text]', sheet.body);
        area.value = prompt;
        area.focus();
        area.select();
        toast('Bitte von Hand kopieren');
      }
      return;
    }
    if (e.target.closest('[data-parse]')) {
      const text = qs('[data-import-text]', sheet.body).value.trim();
      if (!text) { qs('[data-import-text]', sheet.body).focus(); return; }
      openImportPreview(text, sheet);
    }
  });
}

function openImportPreview(text, importSheet) {
  const parsed = parsePlanText(text);
  if (!parsed.plans.length) {
    alertDialog({
      title: 'Kein Plan gefunden',
      message: 'Erwartet wird z. B. „PLAN: Push“ und darunter Zeilen wie „- Bankdrücken (Langhantel) | 3“. Am besten den Prompt oben verwenden.',
    });
    return;
  }
  const resolved = resolveImportedPlans(parsed);
  const count = resolved.plans.length;
  openSheet({
    title: 'Import prüfen',
    full: true,
    left: { label: 'Zurück' },
    right: {
      label: 'Übernehmen',
      style: 'primary',
      action: (s) => {
        applyImportedPlans(resolved);
        s.close();
        importSheet.close();
        ui.seg = 'plans';
        render();
        toast(count === 1 ? 'Plan übernommen' : `${count} Pläne übernommen`);
      },
    },
    body: `
      ${resolved.plans.map((p) => `
        <div class="section">
          <div class="section-head"><h2>${esc(p.name)}</h2>${p.replaces ? '<span class="tag warn">ersetzt vorhandenen</span>' : ''}</div>
          <div class="list">${p.items.map((i) => `
            <div class="row"><div class="row-main"><span class="row-title">${esc(i.exercise.name)}</span>${i.isNew ? '<span class="row-sub">wird neu angelegt</span>' : ''}</div>
            <span class="row-value">${plural(i.sets, 'Satz', 'Sätze')}</span></div>`).join('')}
          </div>
        </div>`).join('')}
      ${resolved.warnings.map((w) => `<p class="section-foot">${esc(w)}</p>`).join('')}`,
  });
}

// ---------- Aktionen ----------
registerActions({
  'training-seg': (el) => {
    if (ui.seg === el.dataset.seg) return;
    ui.seg = el.dataset.seg;
    const seg = qs('#training-seg');
    seg.style.setProperty('--i', ui.seg === 'plans' ? 0 : 1);
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === el));
    qs('#training-body').innerHTML = ui.seg === 'plans' ? plansHtml() : exercisesHtml();
  },
  'training-add': () => {
    if (ui.seg === 'plans') openPlanEditor(null, { onSaved: (id) => push('plan', { id }) });
    else openExerciseEditor(null, { onSave: (ex) => { render(); push('exercise', { id: ex.id }); } });
  },
  'plan-new': () => openPlanEditor(null, { onSaved: (id) => push('plan', { id }) }),
  'plan-edit': (el) => openPlanEditor(el.dataset.id),
  'open-plan': (el) => push('plan', { id: el.dataset.id }),
  'open-exercise': (el) => push('exercise', { id: el.dataset.id }),
  'exercise-edit': (el) => openExerciseEditor(el.dataset.id, { onSave: () => render() }),
  'start-routine': (el) => startRoutine(el.dataset.id),
  'start-blank': () => startBlank(),
  'plan-import': () => openImportSheet(),
  'ex-rest': (el) => {
    const ex = Store.getExercise(el.dataset.id);
    const def = Store.getSettings().restSeconds;
    const options = [{ value: null, label: `Standard (${formatRest(def)})` }, ...REST_OPTIONS.map((v) => ({ value: v, label: formatRest(v) }))];
    actionSheet({
      title: `Pause bei ${ex.name}`,
      actions: options.map((o) => ({
        label: o.label,
        handler: () => {
          Store.updateExercise(ex.id, { restSeconds: o.value });
          render();
        },
      })),
    });
  },
  'exercise-delete': async (el) => {
    const ex = Store.getExercise(el.dataset.id);
    if (!ex) return;
    if (!(await confirmAction({ title: `„${ex.name}“ löschen?`, message: 'Sie wird auch aus allen Plänen entfernt. Der Verlauf bleibt erhalten.', confirmLabel: 'Übung löschen' }))) return;
    Store.deleteExercise(ex.id);
    pop();
    toast('Übung gelöscht');
  },
});

let noteTimer = null;
registerInputs({
  'ex-search': (el) => {
    ui.query = el.value;
    qs('#ex-list').innerHTML = exerciseListHtml();
  },
  'ex-note': (el) => {
    clearTimeout(noteTimer);
    const { id } = el.dataset;
    const value = el.value;
    noteTimer = setTimeout(() => Store.updateExercise(id, { notes: value.trim() }), 300);
  },
});

