import {
  Store, MUSCLE_GROUPS, ACCENT_COLORS, REST_OPTIONS, WEEKLY_GOALS, uid, validateBackup,
} from './storage.js';
import { Icon } from './icons.js';
import { buildPlanPrompt, parsePlanText, normalizeExerciseName } from './plan-import.js';
import { buildMotivation } from './motivation.js';
import { Sound, setSoundEnabled, setSoundVolume, setSoundStyle, SOUND_STYLES } from './sound.js';
import { fatigueOf, muscleGroupLookup } from './fatigue.js';
import {
  initChallenges, renderChallenges, bindChallenges, checkChallenges, celebrate, challengeHintForSet, challengeBadge,
  athleteLevel, weeklyStatus, activeChallenges, openChallengeDetail, openChallengeCatalog,
} from './challenges.js';
import {
  initMobility, renderMobilityCard, bindMobilityCard, startMobilityRoutine, mobilityDoneToday,
  renderMobilityToday, bindMobilityToday, afterWorkoutRoutine, routineMinutes, mountEmbedded, unmountEmbedded,
  openMobilitySettings, openCheck as openMobilityCheck, AREA_TABS, todayPlan as mobilityTodayPlan, weekStats as mobilityWeekStats,
} from './mobility.js';
import {
  muscleMap, weeklySets, setShade, planGroups, MAP_GROUPS, SET_TARGET_MIN, SET_TARGET_MAX,
} from './gym/muscles.js';
import {
  SLOTS, SUPPLEMENT_PRESETS, REMINDER_TIMES, dayKey, shiftDay, dateOfKey, currentSlot,
  activeOn, dayStatus, streak, adherence, reminderFile,
} from './supplements.js';
import {
  formatDate, formatDateTime, formatDuration, elapsedLabel,
  estimate1RM, bestSet, setScore, escapeHtml, unitLabel, drawLineChart,
  formatNumber, parseNumber, formatWeight, formatSet, formatSetList, plural, relativeDay,
} from './utils.js';

const root = document.getElementById('app-root');
const sheetRoot = document.getElementById('sheet-root');
const toastRoot = document.getElementById('toast-root');

const state = {
  tab: 'today',
  trainingSub: 'overview',
  mobilitySub: 'today',
  profilePage: null,
  workoutOpen: false,
  workoutAddExerciseQuery: '',
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  // Zugeklappte Übungen im laufenden Training, nach Übungs-ID
  collapsedExercises: new Set(),
};

let tickInterval = null;

function qs(sel, parent = document) { return parent.querySelector(sel); }
function qsa(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }

// Im Fight-Modus gilt immer das Signalrot des Modus, im Gym die gewählte Farbe.
const FIGHT_ACCENT = '#ff2e3e';
function applyAccent() {
  const settings = Store.getSettings();
  document.documentElement.style.setProperty('--accent', settings.mode === 'fight' ? FIGHT_ACCENT : settings.accent);
}

function isFightMode() { return Store.getSettings().mode === 'fight'; }

// Farbe der Statusleiste: im Fight-Modus immer dunkel.
const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => ({ m, value: m.content }));
function applyMode() {
  const fight = isFightMode();
  if (fight) document.documentElement.dataset.mode = 'fight';
  else delete document.documentElement.dataset.mode;
  themeMetas.forEach(({ m, value }) => { m.content = fight ? '#09090b' : value; });
  applyAccent();
}

// iOS meldet in der installierten Web-App eine Safe Area unten (34px), auch
// wenn die Seite dort gar nicht hinreicht, weil das System die Ansicht schon
// verkürzt hat. Rechnet man den Wert dann trotzdem ein, steht die Leiste
// doppelt zu hoch. Deshalb: Ist der Bildschirm messbar höher als die Seite,
// hat das System den Platz bereits abgezogen – dann keinen eigenen Abstand
// mehr addieren.
function calibrateSafeArea() {
  const reserved = Math.round(window.screen.height - window.innerHeight);
  const portrait = window.innerWidth < window.innerHeight;
  // Nur in der installierten App: im normalen Safari fehlt unten Platz wegen
  // der Browserleiste, die Seite reicht dort aber sehr wohl bis zum
  // Home-Indikator – da muss der Abstand erhalten bleiben.
  const systemReservedBottom = navigator.standalone === true
    && portrait && reserved > 8 && reserved < 140;
  document.documentElement.style.setProperty(
    '--safe-bottom',
    systemReservedBottom ? '0px' : 'env(safe-area-inset-bottom, 0px)',
  );
  return { reserved, systemReservedBottom };
}

// Progressive Overload (opt-in in den Einstellungen): klassische
// "Doppelprogression" – wer eine Übung in den letzten 2 abgeschlossenen
// Einheiten jeweils bei GLEICHEM Gewicht und durchweg ≥10 Wiederholungen
// geschafft hat, ist bereit für mehr Gewicht. Größere Grundübungen
// (Beine/Rücken/Brust) bekommen einen größeren Sprung als Isolationsübungen,
// und der Schritt richtet sich nach der eingestellten Einheit.
const OVERLOAD_REP_THRESHOLD = 10;
const OVERLOAD_BIG_LIFT_GROUPS = ['Beine', 'Rücken', 'Brust'];

function overloadStep(muscleGroup, unit) {
  const big = OVERLOAD_BIG_LIFT_GROUPS.includes(muscleGroup);
  if (unit === 'lb') return big ? 10 : 5;
  return big ? 5 : 2.5;
}

// Letzte abgeschlossene Einheit, in der diese Übung wirklich trainiert wurde –
// inklusive Trainingskontext, um die Vorbelastung bestimmen zu können.
function lastSessionFor(exerciseId, excludeWorkoutId) {
  for (const w of Store.getWorkouts()) {
    if (!w.finishedAt || w.id === excludeWorkoutId) continue;
    const entryIndex = w.entries.findIndex(
      (e) => e.exerciseId === exerciseId && e.sets.some((s) => s.done),
    );
    if (entryIndex >= 0) return { workout: w, entryIndex, entry: w.entries[entryIndex] };
  }
  return null;
}

function getOverloadSuggestion(exercise, excludeWorkoutId) {
  if (!exercise) return null;
  const groupOf = muscleGroupLookup(Store.getExercises());
  const candidates = Store.getWorkouts()
    .filter((w) => w.finishedAt && w.id !== excludeWorkoutId)
    .map((w) => {
      const entryIndex = w.entries.findIndex(
        (e) => e.exerciseId === exercise.id && e.sets.some((s) => s.done),
      );
      return entryIndex < 0 ? null : { entry: w.entries[entryIndex], bucket: fatigueOf(w, entryIndex, groupOf).bucket };
    })
    .filter(Boolean);
  if (candidates.length < 2) return null;

  // Nur Einheiten mit vergleichbarer Vorbelastung heranziehen: zwei gleich
  // schwere Einheiten aus völlig verschiedenen Positionen im Training sagen
  // nichts darüber aus, ob mehr Gewicht fällig ist.
  const sameBucket = candidates.filter((c) => c.bucket === candidates[0].bucket);
  const sessions = (sameBucket.length >= 2 ? sameBucket : candidates).slice(0, 2).map((c) => c.entry);
  if (sessions.length < 2) return null;

  const analyzed = sessions.map((entry) => {
    const done = entry.sets.filter((s) => s.done && s.weight > 0);
    if (!done.length) return null;
    const weight = done[0].weight;
    const sameWeight = done.every((s) => s.weight === weight);
    const hitThreshold = done.every((s) => s.reps >= OVERLOAD_REP_THRESHOLD);
    return sameWeight && hitThreshold ? { weight } : null;
  });
  if (!analyzed[0] || !analyzed[1] || analyzed[0].weight !== analyzed[1].weight) return null;

  const unit = Store.getSettings().unit;
  const step = overloadStep(exercise.muscleGroup, unit);
  return { from: analyzed[0].weight, to: Math.round((analyzed[0].weight + step) * 10) / 10, threshold: OVERLOAD_REP_THRESHOLD };
}

// Neue Übung im Training: Satzzahl und Werte kommen vom letzten Mal – Satz
// für Satz, so wie er damals lief (grau als Vorschlag, bis bestätigt). Gibt
// es kein letztes Mal, starten zwei leere Sätze. Ist Progressive Overload
// aktiv und die Übung bereit für mehr Gewicht, steht direkt das gesteigerte
// Gewicht im Vorschlag.
function defaultSets(exercise, excludeWorkoutId, count) {
  const last = Store.lastEntryForExercise(exercise.id, excludeWorkoutId);
  const lastDone = last ? last.sets.filter((s) => s.done && s.reps > 0) : [];
  const overload = Store.getSettings().progressiveOverload ? getOverloadSuggestion(exercise, excludeWorkoutId) : null;
  const total = Math.max(1, count ?? Math.min(8, lastDone.length || 2));
  return Array.from({ length: total }, (_, i) => {
    const src = lastDone[Math.min(i, lastDone.length - 1)];
    if (!src) return { weight: 0, reps: 0, done: false, suggested: false };
    return { weight: overload ? overload.to : src.weight, reps: src.reps, done: false, suggested: true };
  });
}

// Aktuelle Übungsnamen: im Training und im Verlauf steht der Name, der beim
// Speichern galt. Wurde eine Übung später umbenannt, soll überall der neue
// Name erscheinen.
function exerciseNames() {
  return new Map(Store.getExercises().map((e) => [e.id, e.name]));
}
function entryName(entry, names) {
  return names.get(entry.exerciseId) || entry.exerciseName || 'Unbekannt';
}

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
function prefersReducedMotion() { return reducedMotionQuery.matches; }

// Beim Screenwechsel gleiten die Blöcke leicht versetzt aus der Richtung des
// Wechsels herein. Während einer Ziehgeste bleibt es aus: dort folgt der
// Inhalt schon dem Finger, eine zusätzliche Animation würde nur flackern.
let isSwipeDragging = false;

function animateScreenIn(view) {
  const from = lastScreenPosition;
  const to = screenPosition();
  lastScreenPosition = to;
  // Beim View-Transition-Crossfade (Training verlassen/beenden) würde die
  // Einblendung doppelt laufen.
  if (prefersReducedMotion() || isSwipeDragging || inViewTransition || from === to) return;
  // Beim allerersten Rendern gibt es keine Richtung – dann nur sanft einblenden.
  view.style.setProperty('--enter-x', from === null ? '0px' : (to > from ? '16px' : '-16px'));
  view.classList.remove('screen-in');
  void view.offsetWidth;
  view.classList.add('screen-in');
}

// Ein frisch eingefügtes Element einmalig einblenden lassen.
function dropIn(el) {
  if (!el || prefersReducedMotion()) return;
  el.classList.add('item-in');
  el.addEventListener('animationend', () => el.classList.remove('item-in'), { once: true });
}

// Ein Element erst wegklappen, dann die eigentliche Änderung ausführen –
// sonst würde die Zeile beim Löschen einfach verschwinden.
function collapseAway(el, done) {
  if (!el || prefersReducedMotion()) { done(); return; }
  const height = el.getBoundingClientRect().height;
  const style = getComputedStyle(el);
  el.style.height = `${height}px`;
  el.style.marginTop = style.marginTop;
  el.style.marginBottom = style.marginBottom;
  el.style.overflow = 'hidden';
  void el.offsetHeight;
  el.style.transition = 'height 0.22s ease, opacity 0.16s ease, transform 0.22s ease, margin 0.22s ease, padding 0.22s ease';
  el.style.height = '0px';
  el.style.opacity = '0';
  el.style.transform = 'scale(0.97)';
  el.style.marginTop = '0px';
  el.style.marginBottom = '0px';
  el.style.paddingTop = '0px';
  el.style.paddingBottom = '0px';
  setTimeout(done, 210);
}

// Sheet nach unten wegwischen, wie in iOS: der Griff (und der Kopfbereich)
// folgt 1:1 dem Finger, beim Loslassen entscheidet Strecke ODER Schwung.
function enableSheetDragToClose(sheetEl) {
  if (!sheetEl) return;
  const grabArea = () => [qs('.sheet-handle', sheetEl), qs('.sheet-header', sheetEl)];

  sheetEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, textarea, select')) return;
    if (!grabArea().some((el) => el && el.contains(e.target))) return;

    const startY = e.clientY;
    let dy = 0;
    let lastY = startY;
    let lastT = performance.now();
    let velocity = 0;
    sheetEl.style.transition = 'none';

    const onMove = (ev) => {
      dy = Math.max(0, ev.clientY - startY);
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 4) {
        velocity = velocity * 0.7 + ((ev.clientY - lastY) / dt) * 0.3;
        lastY = ev.clientY;
        lastT = now;
      }
      sheetEl.style.transform = `translateY(${dy}px)`;
      const backdrop = qs('.sheet-backdrop', sheetRoot);
      if (backdrop) backdrop.style.opacity = String(Math.max(0, 1 - dy / 400));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const shouldClose = dy > sheetEl.getBoundingClientRect().height * 0.3 || velocity > 0.7;
      if (shouldClose) { dismissSheet(); return; }
      sheetEl.style.transition = 'transform 0.35s cubic-bezier(0.32, 1.3, 0.4, 1)';
      sheetEl.style.transform = '';
      const backdrop = qs('.sheet-backdrop', sheetRoot);
      if (backdrop) { backdrop.style.transition = 'opacity 0.25s'; backdrop.style.opacity = ''; }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}

// Weicher iOS-artiger Crossfade für bewusste Navigation (Tap auf Tab/Segment).
// Bei Drag-Gesten wird bewusst NICHT transitioniert – da folgt die Ansicht 1:1 dem Finger.
let inViewTransition = false;
function go(fn) {
  if (document.startViewTransition) {
    inViewTransition = true;
    const transition = document.startViewTransition(fn);
    transition.finished.catch(() => {}).finally(() => { inViewTransition = false; });
  } else {
    fn();
  }
}

// Kurze Rückmeldung am unteren Rand. Mit `action` bekommt sie einen Knopf
// (z.B. "Rückgängig") und bleibt etwas länger stehen; es gibt immer nur eine
// solche Aktions-Meldung – eine neue ersetzt die alte.
function toast(msg, { action, onAction } = {}) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.append(document.createTextNode(msg));
  const hide = () => {
    if (!t.isConnected || t.classList.contains('hiding')) return;
    t.classList.add('hiding');
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  };
  if (action) {
    qsa('.toast.has-action', toastRoot).forEach((old) => old.remove());
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action;
    btn.addEventListener('click', () => { hide(); onAction(); });
    t.append(btn);
    t.classList.add('has-action');
  }
  toastRoot.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(hide, action ? 4500 : 2200);
}

// Wird ein Sheet über Backdrop/X geschlossen, darf das etwas anderes bedeuten
// als "weg damit" – z.B. zurück zum Plan-Editor statt Entwurf verwerfen.
let sheetOnDismiss = null;

function closeSheet() {
  sheetOnDismiss = null;
  const sheetEl = qs('.sheet', sheetRoot);
  const backdrop = qs('.sheet-backdrop', sheetRoot);
  if (!sheetEl) {
    sheetRoot.innerHTML = '';
    sheetRoot.classList.remove('open');
    return;
  }
  sheetEl.style.animation = 'slideDown 0.26s cubic-bezier(0.32, 0.72, 0, 1) forwards';
  if (backdrop) backdrop.style.animation = 'fadeOut 0.24s ease forwards';
  setTimeout(() => {
    sheetRoot.innerHTML = '';
    sheetRoot.classList.remove('open');
  }, 240);
}

function dismissSheet() {
  const handler = sheetOnDismiss;
  if (handler) { sheetOnDismiss = null; handler(); return; }
  closeSheet();
}

function openSheet(title, bodyHtml, { footer = '', onMount, onDismiss = null } = {}) {
  sheetOnDismiss = onDismiss;
  const inner = `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <h2>${title}</h2>
      <button class="icon-btn" data-action="close-sheet" aria-label="Schließen">${Icon.close}</button>
    </div>
    <div class="sheet-body">${bodyHtml}</div>
    ${footer ? `<div class="sheet-footer">${footer}</div>` : ''}`;

  const existing = qs('.sheet', sheetRoot);
  if (existing) {
    // Innerhalb eines offenen Sheets nur den Inhalt tauschen (z.B. Plan-Editor
    // -> Übungsauswahl): sonst würde die Einblend-Animation jedes Mal erneut
    // laufen und wie ein Neuladen wirken. Die Höhe wandert dabei weich mit.
    swapSheetContent(existing, inner);
  } else {
    sheetRoot.innerHTML = `
      <div class="sheet-backdrop" data-action="close-sheet"></div>
      <div class="sheet">${inner}</div>`;
    sheetRoot.classList.add('open');
    enableSheetDragToClose(qs('.sheet', sheetRoot));
  }
  if (onMount) onMount(sheetRoot);
}

function swapSheetContent(sheetEl, inner) {
  if (prefersReducedMotion()) { sheetEl.innerHTML = inner; return; }
  const from = sheetEl.getBoundingClientRect().height;
  sheetEl.innerHTML = inner;
  const to = sheetEl.getBoundingClientRect().height;
  if (Math.abs(to - from) > 1) {
    sheetEl.style.height = `${from}px`;
    void sheetEl.offsetHeight;
    sheetEl.style.transition = 'height 0.32s cubic-bezier(0.32, 0.72, 0, 1)';
    sheetEl.style.height = `${to}px`;
    const done = (e) => {
      if (e.target !== sheetEl || e.propertyName !== 'height') return;
      sheetEl.style.transition = '';
      sheetEl.style.height = '';
      sheetEl.removeEventListener('transitionend', done);
    };
    sheetEl.addEventListener('transitionend', done);
  }
  const body = qs('.sheet-body', sheetEl);
  if (body) body.classList.add('sheet-content-in');
}

function stopTicking() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

function startTicking(fn) {
  stopTicking();
  tickInterval = setInterval(fn, 1000);
}

// ---------- Rendering ----------

// Nur beim tatsächlichen Betreten der Trainingsansicht soll sie von unten
// hereingleiten. render() wird aber bei jeder kleinsten Änderung (Satz
// hinzufügen, Übung wählen, Haken setzen ...) erneut aufgerufen und baut die
// ganze .workout-screen neu auf – ohne dieses Flag würde die Eingangs-
// Animation dabei jedes Mal erneut abspielen und wie ein Neuladen wirken.
let workoutEntering = false;

// render() ersetzt bei jeder Änderung das komplette innerHTML, wodurch ein
// brandneues .view-Element entsteht, das immer bei scrollTop 0 startet – ohne
// Gegenmaßnahme würde z.B. ein Satz-Haken mitten in einer langen Übungsliste
// die Seite jedes Mal nach oben springen lassen. Deshalb: Scroll-Position nur
// dann übernehmen, wenn es sich um den GLEICHEN Screen handelt (reine
// Datenänderung), nicht bei echter Navigation zu einer anderen Ansicht.
let lastRenderKey = null;

// ---------- Gerüst: vier Tabs und Start-Knopf in der Mitte ----------
// Gleicher Aufbau wie im Fight-Modus: Heute | Training | ▶ | Mobility | Profil.
// Training und Mobility sind die zwei Säulen und gleich gegliedert
// (Übersicht · Pläne · Übungen · Fortschritt), Profil sammelt alles über dich.
const GYM_TABS = [
  { id: 'today', label: 'Heute', icon: 'home' },
  { id: 'training', label: 'Training', icon: 'dumbbell' },
  { id: 'mobility', label: 'Mobility', icon: 'leaf' },
  { id: 'profile', label: 'Profil', icon: 'user' },
];
const TRAINING_SUBS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'plans', label: 'Pläne' },
  { id: 'exercises', label: 'Übungen' },
  { id: 'progress', label: 'Fortschritt' },
];
const PROFILE_PAGES = { training: 'Training', look: 'Darstellung & Töne', data: 'Daten & Sicherung' };

// Position des aktuellen Screens auf einer gedachten Achse (Tab + Unter-Tab).
// Daraus ergibt sich, ob ein Wechsel nach links oder rechts geht – der Inhalt
// gleitet dann aus der passenden Richtung herein.
function screenPosition() {
  const base = GYM_TABS.findIndex((t) => t.id === state.tab);
  if (state.tab === 'training') return base + TRAINING_SUBS.findIndex((s) => s.id === state.trainingSub) * 0.2;
  if (state.tab === 'mobility') return base + AREA_TABS.findIndex((s) => s.id === state.mobilitySub) * 0.2;
  if (state.tab === 'profile' && state.profilePage) return base + 0.5;
  return base;
}
let lastScreenPosition = null;

let renderedDay = null;

function render() {
  stopTicking();
  renderedDay = dayKey();
  if (isFightMode()) {
    releaseWakeLock();
    unmountEmbedded();
    if (fightModule) fightModule.renderFight(root);
    else {
      root.innerHTML = '<div class="f-boot"></div>';
      loadFight().then(() => { if (isFightMode()) render(); }).catch(() => {
        // Modul nicht ladbar (z.B. offline ohne Cache): zurück ins Gym statt leerer Seite
        Store.saveSettings({ ...Store.getSettings(), mode: 'gym' });
        applyMode();
        render();
      });
    }
    return;
  }
  const key = `${state.tab}:${state.workoutOpen}:${state.trainingSub}:${state.mobilitySub}:${state.profilePage}`;
  const prevView = qs('.view');
  const scrollTop = key === lastRenderKey && prevView ? prevView.scrollTop : 0;
  const screenChanged = key !== lastRenderKey;
  lastRenderKey = key;

  if (state.workoutOpen && Store.getActive()) {
    unmountEmbedded();
    root.innerHTML = renderWorkout();
    workoutEntering = false;
    bindWorkoutEvents();
    const newView = qs('.view');
    if (newView) newView.scrollTop = scrollTop;
    syncRestBar(); // eine laufende Pause überlebt auch ein Neuladen
    requestWakeLock();
    startTicking(() => {
      const el = qs('#workout-timer');
      const active = Store.getActive();
      if (el && active) el.textContent = elapsedLabel(active.startedAt);
      syncRestBar();
    });
    return;
  }
  state.workoutOpen = false;
  releaseWakeLock(); // außerhalb des Trainings darf sich das iPhone wieder sperren

  // Challenges zuerst mit den Trainings abgleichen, damit das Profil den
  // aktuellen Stand zeigt – Neues wird danach gefeiert.
  const challengeNews = state.tab === 'profile' && !state.profilePage && !isSwipeDragging ? checkChallenges() : null;
  if (state.tab !== 'mobility') unmountEmbedded();

  const active = Store.getActive();
  root.innerHTML = `
    <div class="g-app ${active && state.tab !== 'today' ? 'has-live' : ''}" data-tab="${state.tab}">
      ${headerHtml()}
      <main class="view ${state.tab === 'mobility' ? 'mz-host' : ''}">${renderTab()}</main>
      ${active && state.tab !== 'today' ? liveBarHtml(active) : ''}
      ${dockHtml(active)}
    </div>`;
  const newView = qs('.view');
  if (state.tab === 'mobility') mountEmbedded(qs('#mz-embed'), state.mobilitySub);
  if (newView) {
    newView.scrollTop = scrollTop;
    if (screenChanged) animateScreenIn(newView);
    const app = qs('.g-app');
    const edge = () => app.classList.toggle('scrolled', newView.scrollTop > 6);
    edge();
    newView.addEventListener('scroll', edge, { passive: true });
  }

  bindGlobalEvents();
  if (state.tab === 'today') bindTodayEvents();
  if (state.tab === 'training') bindTrainingEvents();
  if (state.tab === 'profile') bindProfileEvents();

  if (challengeNews?.events.length) {
    setTimeout(() => {
      if (state.tab === 'profile') celebrate(challengeNews.events, challengeNews.before, () => render());
    }, 350);
  }

  if (active) {
    startTicking(() => {
      const a = Store.getActive();
      if (!a) return;
      ['#active-elapsed', '#live-elapsed'].forEach((sel) => {
        const el = qs(sel);
        if (el) el.textContent = elapsedLabel(a.startedAt);
      });
    });
  }
}

function segHtml(id, items, active) {
  const i = Math.max(0, items.findIndex((t) => t.id === active));
  return `<div class="g-seg" id="${id}" style="--n:${items.length};--i:${i}">${items.map((t) => `<button data-seg="${t.id}" class="${t.id === active ? 'active' : ''}">${t.label}</button>`).join('')}<span class="g-seg-thumb" aria-hidden="true"></span></div>`;
}

function headerHtml() {
  const t = state.tab;
  const mode = `<button class="mode-btn" data-action="mode-fight" aria-label="Zum Fight-Modus: Kickboxen und Ausdauer">${Icon.glove}<span>Fight</span></button>`;
  if (t === 'profile' && state.profilePage) {
    return `
      <header class="g-top g-top-sub">
        <div class="g-top-row">
          <button class="g-back" data-action="profile-back" aria-label="Zurück zum Profil">${Icon.back}<span>Profil</span></button>
          <h1 class="g-title g-title-sub">${PROFILE_PAGES[state.profilePage]}</h1>
          <span class="g-back-spacer"></span>
        </div>
      </header>`;
  }
  let title = '';
  let actions = '';
  let seg = '';
  if (t === 'today') {
    const lvl = athleteLevel();
    const R = 2 * Math.PI * 15;
    title = '<div class="g-brand"><span class="g-logo">Gym</span><span class="g-tagline">Kraft · Mobility</span></div>';
    actions = `
      <button class="g-level" data-action="goto-profile" aria-label="Level ${lvl.level} – zum Profil">
        <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg" stroke-dasharray="${R}" stroke-dashoffset="${R * (1 - lvl.into / lvl.need)}"/></svg>
        <span>${lvl.level}</span>
      </button>`;
  } else if (t === 'training') {
    title = '<h1 class="g-title">Training</h1>';
    if (state.trainingSub === 'plans') actions = `<button class="g-icon-btn" data-action="add-routine" aria-label="Neuer Plan">${Icon.plus}</button>`;
    if (state.trainingSub === 'exercises') actions = `<button class="g-icon-btn" data-action="add-exercise" aria-label="Neue Übung">${Icon.plus}</button>`;
    seg = segHtml('g-seg-training', TRAINING_SUBS, state.trainingSub);
  } else if (t === 'mobility') {
    title = `<h1 class="g-title"><span class="g-title-leaf">${Icon.leaf}</span>Mobility</h1>`;
    actions = `<button class="g-icon-btn" data-action="mobility-settings" aria-label="Mobility-Einstellungen">${Icon.sliders}</button>`;
    seg = segHtml('g-seg-mobility', AREA_TABS, state.mobilitySub);
  } else {
    title = '<h1 class="g-title">Profil</h1>';
  }
  return `
    <header class="g-top">
      <div class="g-top-row">${title}<div class="g-top-actions">${actions}${mode}</div></div>
      ${seg ? `<div class="g-top-seg">${seg}</div>` : ''}
    </header>`;
}

function dockHtml(active) {
  const badge = state.tab !== 'profile' && challengeBadge();
  const tab = (t) => `
    <button class="g-tab ${state.tab === t.id ? 'active' : ''} ${t.id === 'profile' && badge ? 'has-news' : ''}" data-gtab="${t.id}" aria-label="${t.label}">
      <span class="g-tab-icon">${Icon[t.icon]}</span><span>${t.label}</span>
    </button>`;
  return `
    <div class="g-dock-wrap">
      <nav class="g-dock" aria-label="Navigation">
        ${tab(GYM_TABS[0])}${tab(GYM_TABS[1])}
        <div class="g-start-slot">
          <button class="g-start ${active ? 'live' : ''}" data-action="open-start" data-nosound aria-label="${active ? 'Zum laufenden Training' : 'Einheit starten'}">${active ? Icon.dumbbell : Icon.play}</button>
        </div>
        ${tab(GYM_TABS[2])}${tab(GYM_TABS[3])}
      </nav>
    </div>`;
}

// Laufendes Training: schmale Leiste über der Navigation, auf jedem Tab
function liveBarHtml(active) {
  const p = workoutProgress(active);
  return `
    <button class="g-live" data-action="live-resume" data-nosound>
      <span class="g-live-dot" aria-hidden="true"></span>
      <span class="g-live-text"><strong>${escapeHtml(active.routineName || 'Freies Training')}</strong>
        <span><span id="live-elapsed">${elapsedLabel(active.startedAt)}</span> · ${p.done}/${plural(p.total, 'Satz', 'Sätzen')}</span></span>
      <span class="g-live-go">Weiter${Icon.chevron}</span>
      <span class="g-live-bar" aria-hidden="true"><i style="transform:scaleX(${p.ratio})"></i></span>
    </button>`;
}

function renderTab() {
  if (state.tab === 'training') return renderTraining();
  if (state.tab === 'mobility') return '<div class="mz-embed" id="mz-embed"></div>';
  if (state.tab === 'profile') return renderProfile();
  return renderToday();
}

function goTab(id) {
  if (state.tab === id) {
    if (id === 'profile' && state.profilePage) { state.profilePage = null; render(); return; }
    qs('.view')?.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  // Unterseiten des Profils schließen sich beim Verlassen des Tabs
  if (state.tab === 'profile') state.profilePage = null;
  state.tab = id;
  render();
}

// ---- Training starten, fortsetzen, verwerfen ----
function startRoutineWorkout(id) {
  if (Store.getActive()) { resumeWorkout(); return; }
  const routine = Store.getRoutine(id);
  if (!routine) return;
  const entries = routine.exerciseIds.map((eid) => {
    const ex = Store.getExercise(eid);
    const count = routine.setCounts?.[eid];
    return { exerciseId: eid, exerciseName: ex ? ex.name : 'Unbekannt', sets: ex ? defaultSets(ex, undefined, count ?? 2) : [] };
  });
  Store.setActive({ id: uid(), routineId: routine.id, routineName: routine.name, startedAt: new Date().toISOString(), finishedAt: null, entries });
  closeSheet();
  Sound.start();
  state.workoutOpen = true;
  workoutEntering = true;
  render();
}

function startBlankWorkout() {
  if (Store.getActive()) { resumeWorkout(); return; }
  Store.setActive({ id: uid(), routineId: null, routineName: null, startedAt: new Date().toISOString(), finishedAt: null, entries: [] });
  closeSheet();
  Sound.start();
  state.workoutOpen = true;
  workoutEntering = true;
  render();
}

function resumeWorkout() {
  closeSheet();
  Sound.start();
  state.workoutOpen = true;
  workoutEntering = true;
  render();
}

function bindStarters(scope) {
  qsa('[data-action="start-blank"]', scope).forEach((b) => b.addEventListener('click', startBlankWorkout));
  qsa('[data-action="start-routine"]', scope).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    startRoutineWorkout(b.dataset.id);
  }));
  qsa('[data-action="resume-workout"]', scope).forEach((b) => b.addEventListener('click', resumeWorkout));
  qsa('[data-action="discard-workout"]', scope).forEach((b) => b.addEventListener('click', () => {
    if (confirm('Aktuelles Training wirklich verwerfen? Alle Sätze gehen verloren.')) {
      Store.clearActive();
      state.collapsedExercises.clear();
      render();
    }
  }));
}

// Welcher Plan ist als Nächstes dran? Betrachtet werden nur Pläne, die in den
// letzten 30 Tagen trainiert wurden (die aktuelle Rotation) – ein seit Monaten
// ruhender Plan soll sich nicht ewig vordrängeln. Dran ist der, dessen letzte
// Einheit am längsten her ist.
function planRotation(routines, workouts) {
  const lastDone = new Map();
  workouts.forEach((w) => {
    if (w.finishedAt && w.routineId && !lastDone.has(w.routineId)) lastDone.set(w.routineId, w.startedAt);
  });
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const rotation = routines.filter((r) => lastDone.has(r.id) && lastDone.get(r.id) >= cutoff);
  const next = rotation.length >= 2
    ? rotation.reduce((a, b) => (lastDone.get(b.id) < lastDone.get(a.id) ? b : a)).id
    : null;
  return { lastDone, next };
}

// Immer genau ein Vorschlag: aus der Rotation, sonst der am längsten nicht
// (oder noch nie) trainierte Plan.
function nextPlanOf(routines, workouts = Store.getWorkouts()) {
  if (!routines.length) return null;
  const { lastDone, next } = planRotation(routines, workouts);
  if (next) return routines.find((r) => r.id === next) || routines[0];
  return [...routines].sort((a, b) => (lastDone.get(a.id) || '').localeCompare(lastDone.get(b.id) || ''))[0];
}

function lastDoneLabel(lastDone, r) {
  return lastDone.has(r.id) ? `zuletzt ${relativeDay(lastDone.get(r.id))}` : 'noch nie trainiert';
}

// Dauer eines Plans: wie lange er zuletzt gedauert hat
function planMinutes(routine) {
  const w = Store.getWorkouts().find((x) => x.finishedAt && x.routineId === routine.id);
  return w ? Math.round((new Date(w.finishedAt) - new Date(w.startedAt)) / 60000) : null;
}

function isSameDay(iso, ref = new Date()) {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

// ---------- Start-Übersicht (Knopf in der Mitte) ----------
function openStartSheet() {
  if (Store.getActive()) { resumeWorkout(); return; }
  const routines = Store.getRoutines();
  const next = nextPlanOf(routines);
  const { lastDone } = planRotation(routines, Store.getWorkouts());
  const names = exerciseNames();
  const item = ({ cls = '', icon, title, sub, attrs }) => `
    <button class="g-start-item ${cls}" ${attrs}>
      <span class="g-start-icon">${icon}</span>
      <span class="g-start-text"><strong>${title}</strong><span>${sub}</span></span>
      ${Icon.chevron}
    </button>`;
  const planItem = (r, hot) => item({
    cls: hot ? 'hot' : '',
    icon: hot ? Icon.play : Icon.dumbbell,
    title: `${hot ? 'Als Nächstes: ' : ''}${escapeHtml(r.name)}`,
    sub: escapeHtml(`${plural(r.exerciseIds.length, 'Übung', 'Übungen')} · ${lastDoneLabel(lastDone, r)}${hot ? ` · ${r.exerciseIds.map((id) => names.get(id)).filter(Boolean).slice(0, 3).join(', ')}` : ''}`),
    attrs: `data-action="start-routine" data-id="${r.id}" data-nosound`,
  });

  const mob = Store.getSettings().mobility ? mobilityTodayPlan() : null;
  const trainedToday = Store.getWorkouts().some((w) => w.finishedAt && isSameDay(w.startedAt));
  const after = trainedToday ? afterWorkoutRoutine() : null;
  const active = activeChallenges();

  openSheet('Einheit starten', `
    <div class="g-start-sec">Krafttraining</div>
    <div class="g-start-list">
      ${next ? planItem(next, true) : ''}
      ${routines.filter((r) => r !== next).map((r) => planItem(r, false)).join('')}
      ${item({ icon: Icon.plus, title: 'Leeres Training', sub: 'Übungen spontan zusammenstellen', attrs: 'data-action="start-blank" data-nosound' })}
    </div>
    ${mob ? `
      <div class="g-start-sec">Mobility</div>
      <div class="g-start-list">
        ${after ? item({ cls: 'mob', icon: Icon.leaf, title: escapeHtml(after.name), sub: `Passend zum heutigen Training · ${routineMinutes(after)}`, attrs: 'data-start-mob="after"' }) : ''}
        ${item({ cls: 'mob', icon: Icon.leaf, title: mob.main.kind === 'deep' ? `Tiefe Einheit ${mob.main.letter}` : 'Tägliche Routine', sub: `${mob.done ? 'Heute schon erledigt · ' : ''}${routineMinutes(mob.main)} · ${plural(mob.main.items.length, 'Übung', 'Übungen')}`, attrs: 'data-start-mob="today"' })}
      </div>` : ''}
    <div class="g-start-sec">Challenge</div>
    <div class="g-start-list">
      ${active.length ? active.slice(0, 3).map((a) => item({ cls: 'gold', icon: `<span class="g-start-emoji">${a.ch.icon}</span>`, title: escapeHtml(a.ch.name), sub: escapeHtml(a.label), attrs: `data-start-ch="${a.ch.id}"` })).join('')
    : item({ cls: 'gold', icon: Icon.trophy, title: 'Challenge wählen', sub: 'Stufen erklimmen, XP sammeln', attrs: 'data-start-ch=""' })}
    </div>`, {
    onMount: (sheet) => {
      bindStarters(sheet);
      qsa('[data-start-mob]', sheet).forEach((b) => b.addEventListener('click', () => {
        closeSheet();
        startMobilityRoutine(b.dataset.startMob === 'after' ? 'after-workout' : 'today');
      }));
      qsa('[data-start-ch]', sheet).forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.startCh) openChallengeDetail(b.dataset.startCh);
        else openChallengeCatalog();
      }));
    },
  });
}

// ---------- Heute ----------
// Nur was heute zählt, nach Wichtigkeit: das Training (oder sein Ergebnis),
// die Mobility des Tages, die Supplements – danach die Woche im Überblick.
function renderToday() {
  const hero = renderTodayHero();
  return `
    ${hero}
    ${renderMobilityToday()}
    ${renderSupplementCard()}
    ${renderWeekOverview()}`;
}

function renderTodayHero() {
  const active = Store.getActive();
  const unit = unitLabel(Store.getSettings().unit);
  if (active) {
    const progress = workoutProgress(active);
    return `
    <section class="g-hero live">
      <div class="g-hero-top"><span class="g-pill live"><i></i>Läuft</span><span id="active-elapsed" class="g-hero-time">${elapsedLabel(active.startedAt)}</span></div>
      <h2>${escapeHtml(active.routineName || 'Freies Training')}</h2>
      <p class="g-hero-meta">${plural(active.entries.length, 'Übung', 'Übungen')} · ${progress.done} von ${plural(progress.total, 'Satz', 'Sätzen')} erledigt</p>
      <div class="g-hero-progress"><span style="transform:scaleX(${progress.ratio})"></span></div>
      <div class="g-hero-actions">
        <button class="btn btn-primary" data-action="resume-workout">Weiter ${Icon.chevron}</button>
        <button class="btn btn-ghost danger" data-action="discard-workout">Verwerfen</button>
      </div>
    </section>`;
  }

  const routines = Store.getRoutines();
  const workouts = Store.getWorkouts();
  const doneToday = workouts.find((w) => w.finishedAt && isSameDay(w.startedAt));
  if (doneToday) {
    const minutes = Math.round((new Date(doneToday.finishedAt) - new Date(doneToday.startedAt)) / 60000);
    const sets = workoutDoneSets(doneToday);
    const prs = doneToday.entries.reduce((n, e) => n + e.sets.filter((s) => s.done && s.pr).length, 0);
    const after = Store.getSettings().mobility && !mobilityDoneToday() ? afterWorkoutRoutine() : null;
    return `
    <section class="g-hero done">
      <div class="g-hero-top"><span class="g-pill done">${Icon.check}Heute trainiert</span><span class="g-hero-when">${formatDateTime(doneToday.finishedAt).split(',').pop().trim()}</span></div>
      <h2>${escapeHtml(doneToday.routineName || 'Freies Training')}</h2>
      <div class="g-hero-stats">
        <div><b>${minutes}</b><span>Minuten</span></div>
        <div><b>${sets}</b><span>Sätze</span></div>
        <div><b>${formatVolume(workoutVolume(doneToday))}</b><span>Volumen (${unit})</span></div>
        <div><b>${prs}</b><span>${prs === 1 ? 'Rekord' : 'Rekorde'}</span></div>
      </div>
      ${after ? `
        <button class="g-hero-mob" data-action="mob-after" data-nosound>
          <span class="g-hero-mob-icon">${Icon.leaf}</span>
          <span><em>Passend dazu</em><strong>${escapeHtml(after.name)} · ${routineMinutes(after)}</strong></span>
          <span class="g-hero-mob-play">${Icon.play}</span>
        </button>` : ''}
      <div class="g-hero-actions">
        <button class="btn btn-secondary" data-action="open-workout" data-id="${doneToday.id}">Details ansehen</button>
      </div>
    </section>`;
  }

  if (!routines.length) {
    return `
    <section class="g-hero empty">
      <span class="g-pill">Los geht’s</span>
      <h2>Leg deinen ersten Plan an</h2>
      <p class="g-hero-meta">Selbst zusammenstellen – oder per KI aus einer Sprachnachricht erstellen lassen.</p>
      <div class="g-hero-actions">
        <button class="btn btn-primary" data-action="goto-plans">${Icon.plus} Plan anlegen</button>
        <button class="btn btn-ghost" data-action="start-blank">Leeres Training</button>
      </div>
    </section>`;
  }

  const plan = nextPlanOf(routines, workouts);
  const { lastDone } = planRotation(routines, workouts);
  const exercises = Store.getExercises();
  const groups = planGroups(plan.exerciseIds, exercises);
  const minutes = planMinutes(plan);
  const targets = beatTargets(plan);
  return `
    <section class="g-hero">
      <div class="g-hero-top"><span class="g-pill">Als Nächstes</span><span class="g-hero-when">${lastDoneLabel(lastDone, plan)}</span></div>
      <div class="g-hero-main">
        <div class="g-hero-copy">
          <h2>${escapeHtml(plan.name)}</h2>
          <p class="g-hero-meta">${plural(plan.exerciseIds.length, 'Übung', 'Übungen')}${minutes ? ` · ca. ${minutes} Min` : ''}</p>
          <div class="g-hero-groups">${Object.keys(groups).map((g) => `<span>${g}</span>`).join('')}</div>
        </div>
        <div class="g-hero-map">${muscleMap(groups, { labels: false })}</div>
      </div>
      ${targets.length ? `
        <div class="g-beat">
          <div class="g-beat-head">Heute schlagen</div>
          ${targets.map((t) => `
            <div class="g-beat-row">
              <span class="g-beat-name">${escapeHtml(t.name)}</span>
              <span class="g-beat-last">${escapeHtml(t.last)}</span>
              <span class="g-beat-arrow">→</span>
              <span class="g-beat-target ${t.up ? 'up' : ''}">${escapeHtml(t.target)}</span>
            </div>`).join('')}
        </div>` : ''}
      <button class="btn btn-primary full" data-action="start-routine" data-id="${plan.id}" data-nosound>${Icon.play} Training starten</button>
    </section>`;
}

// Was beim nächsten Training zu schlagen ist: bester Satz vom letzten Mal und
// das Ziel für heute – mit Gewichts-Empfehlung, sobald sie fällig ist.
function beatTargets(routine, limit = 3) {
  const settings = Store.getSettings();
  const unit = unitLabel(settings.unit);
  const out = [];
  for (const eid of routine.exerciseIds) {
    const ex = Store.getExercise(eid);
    if (!ex) continue;
    const last = lastSessionFor(eid);
    const best = last ? bestSet(last.entry.sets) : null;
    if (!best) continue;
    const overload = settings.progressiveOverload ? getOverloadSuggestion(ex) : null;
    const target = overload
      ? `${formatWeight(overload.to, unit)} × ${overload.threshold}`
      : best.weight > 0 ? `${formatWeight(best.weight, unit)} × ${best.reps + 1}` : `${best.reps + 1} Wdh`;
    out.push({ name: ex.name, last: formatSet(best, unit), target, up: !!overload });
    if (out.length >= limit) break;
  }
  return out;
}

// Deine Woche: Training und Mobility auf einem Streifen, dazu die Serie,
// ein Satz zur Lage und die Wochen-Challenges.
function renderWeekOverview() {
  const settings = Store.getSettings();
  const workouts = Store.getWorkouts();
  if (!workouts.some((w) => w.finishedAt) && !settings.mobility) return '';
  const m = buildMotivation({
    workouts,
    exercises: Store.getExercises(),
    goal: settings.weeklyGoal,
    unit: unitLabel(settings.unit),
    stepFor: (ex) => overloadStep(ex.muscleGroup, settings.unit),
  });
  const mob = settings.mobility ? mobilityWeekStats() : null;
  const ch = weeklyStatus();
  const days = WEEKDAY_LETTERS.map((label, i) => `
    <span class="g-week-day ${i === m.week.todayIndex ? 'today' : ''} ${i > m.week.todayIndex ? 'future' : ''}">
      <span class="g-week-dots"><i class="gym ${m.week.days[i] ? 'on' : ''}"></i>${mob ? `<i class="mob ${mob.days[i] ? 'on' : ''}"></i>` : ''}</span>
      <span class="g-week-letter">${label}</span>
    </span>`).join('');
  return `
    <section class="card g-week">
      <div class="g-week-head">
        <strong>Deine Woche</strong>
        ${m.streak ? `<span class="streak-badge">🔥 ${plural(m.streak, 'Woche', 'Wochen')}</span>` : ''}
      </div>
      <div class="g-week-strip">${days}</div>
      <div class="g-week-legend">
        <span><i class="gym"></i>Training <b>${m.week.count}/${m.week.goal}</b></span>
        ${mob ? `<span><i class="mob"></i>Mobility <b>${mob.count}/${mob.goal}</b></span>` : ''}
      </div>
      ${workouts.some((w) => w.finishedAt) ? `<p class="g-week-coach">${escapeHtml(m.coachLine)}</p>` : ''}
      <button class="g-week-ch" data-action="goto-profile">
        <span class="g-week-ch-icon">${ch.sweep ? '🔥' : '🏆'}</span>
        <span class="g-week-ch-text"><strong>Wochen-Challenges ${ch.done}/${ch.total}</strong>
          <span class="g-week-ch-bar"><i style="transform:scaleX(${ch.sweep ? 1 : ch.ratio})"></i></span></span>
        <span class="muted small">${ch.sweep ? 'komplett' : `noch ${plural(ch.daysLeft, 'Tag', 'Tage')}`}</span>
        ${Icon.chevron}
      </button>
    </section>`;
}

function bindTodayEvents() {
  const view = qs('.view');
  bindStarters(view);
  bindSupplementCard();
  bindMobilityToday(view);
  qs('[data-action="mob-after"]', view)?.addEventListener('click', () => startMobilityRoutine('after-workout'));
  qs('[data-action="open-workout"]', view)?.addEventListener('click', (e) => openWorkoutDetailSheet(e.currentTarget.dataset.id));
  qsa('[data-action="goto-profile"]', view).forEach((b) => b.addEventListener('click', () => goTab('profile')));
  qs('[data-action="goto-plans"]', view)?.addEventListener('click', () => { state.tab = 'training'; state.trainingSub = 'plans'; render(); });
  qs('.view [data-action="open-start"]')?.addEventListener('click', openStartSheet);
}

const WEEKDAY_LETTERS = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];

function weekStripHtml(days, todayIndex) {
  return `<div class="week-strip">${WEEKDAY_LETTERS.map((label, i) => `
    <span class="week-day ${days[i] ? 'on' : ''} ${i === todayIndex ? 'today' : ''}">
      <span class="week-dot"></span>${label}
    </span>`).join('')}</div>`;
}

// Standortbestimmung: ein Urteil, die Belege dazu und ein konkreter nächster
// Schritt. Ersetzt die reine Wochenübersicht, wenn eingeschaltet.
function renderMotivationCard({ compact = false } = {}) {
  const settings = Store.getSettings();
  const m = buildMotivation({
    workouts: Store.getWorkouts(),
    exercises: Store.getExercises(),
    goal: settings.weeklyGoal,
    unit: unitLabel(settings.unit),
    stepFor: (ex) => overloadStep(ex.muscleGroup, settings.unit),
  });

  const trendRow = m.trend.comparable ? `
    <div class="trend-row">
      <span class="trend up">${m.trend.up}<small>↑</small></span>
      <span class="trend flat">${m.trend.flat}<small>→</small></span>
      <span class="trend down">${m.trend.down}<small>↓</small></span>
      <span class="muted small">Übungen, 4 Wochen</span>
    </div>` : '';

  return `
    <section class="card motivation tone-${m.verdict.tone}">
      <div class="verdict-row">
        <span class="verdict">${m.verdict.label}</span>
        ${m.streak ? `<span class="streak-badge">🔥 ${m.streak} ${m.streak === 1 ? 'Woche' : 'Wochen'}</span>` : ''}
      </div>
      ${compact ? '' : `
      <div class="goal-row">
        <span class="goal-count">${m.week.count}<span class="muted">/${m.week.goal}</span></span>
        <span class="muted small">Einheiten diese Woche</span>
      </div>
      ${weekStripHtml(m.week.days, m.week.todayIndex)}`}
      ${trendRow}
      <p class="coach-line">${escapeHtml(m.coachLine)}</p>
    </section>`;
}

function workoutVolume(workout) {
  return workout.entries.reduce((sum, e) =>
    sum + e.sets.filter((s) => s.done).reduce((n, s) => n + (s.weight || 0) * (s.reps || 0), 0), 0);
}

function formatVolume(value) {
  return Math.round(value).toLocaleString('de-DE');
}

// ---- Supplements: tägliches Abhaken auf der Startseite ----
// Die Karte steht ganz oben, solange heute noch etwas offen ist – das ist der
// Moment, in dem sie gebraucht wird. Ist alles genommen, schrumpft sie auf
// eine Zeile, damit sie nicht im Weg steht.
function renderSupplementCard() {
  if (!Store.getSettings().supplements) return '';
  const active = Store.getActiveSupplements();

  if (!active.length) {
    return `
      <section class="card supp-card supp-invite" data-variant="invite">
        <button class="supp-row-btn" data-action="open-supplements">
          <span class="supp-emoji">💊</span>
          <span class="supp-row-text"><strong>Supplements tracken</strong>
            <span class="muted small">Täglich abhaken – mit Erinnerung, damit nichts mehr vergessen wird</span></span>
          ${Icon.chevron}
        </button>
      </section>`;
  }

  const supplements = Store.getSupplements();
  const log = Store.getSupplementLog();
  const today = dayKey();
  const taken = log[today] || {};
  const status = dayStatus(supplements, log, today);
  const series = streak(supplements, log, today);

  if (status.complete) {
    return `
      <section class="card supp-card supp-complete" data-variant="complete">
        <button class="supp-row-btn" data-action="open-supplements">
          <span class="supp-emoji done">${Icon.check}</span>
          <span class="supp-row-text"><strong>Supplements genommen</strong>
            <span class="muted small">${status.expected} von ${status.expected} für heute</span></span>
          ${series ? `<span class="streak-badge">🔥 ${series}</span>` : ''}
          ${Icon.chevron}
        </button>
      </section>`;
  }

  const nowIndex = SLOTS.findIndex((s) => s.id === currentSlot());
  const slots = SLOTS.map((slot, index) => {
    const items = active.filter((s) => s.slot === slot.id);
    if (!items.length) return '';
    const open = items.filter((s) => !taken[s.id]);
    const later = index > nowIndex;

    // Eine erledigte Tageszeit auf eine Zeile eindampfen – der Blick soll auf
    // dem liegen, was noch offen ist. Antippen klappt sie wieder auf.
    // Jede Tageszeit ist genau EIN Element mit data-state: so lässt sich beim
    // Wechsel gezielt nur dieser Abschnitt überblenden.
    if (!open.length) {
      return `
        <div class="supp-slot slot-done" data-slot="${slot.id}" data-state="done">
          <button class="supp-slot-done" data-action="supp-expand-slot">
            ${slot.icon} ${slot.label} <span class="supp-ok">${Icon.check} ${items.length}/${items.length}</span>
          </button>
          <div class="supp-slot-items" hidden>${suppItemsHtml(items, taken, today)}</div>
        </div>`;
    }
    return `
      <div class="supp-slot ${later ? 'later' : ''}" data-slot="${slot.id}" data-state="open">
        <div class="supp-slot-head">
          <span>${slot.icon} ${slot.label}${later ? ' · später' : ''}</span>
          ${items.length > 1 ? `<button class="supp-all" data-action="supp-slot-all" data-slot="${slot.id}" data-day="${today}" ${open.length > 1 ? '' : 'hidden'}>Alle ${Icon.check}</button>` : ''}
        </div>
        <div class="supp-slot-items">${suppItemsHtml(items, taken, today)}</div>
      </div>`;
  }).join('');

  const yesterday = shiftDay(today, -1);
  const yStatus = dayStatus(supplements, log, yesterday);
  const backfill = yStatus.expected && !yStatus.complete
    ? `<button class="supp-backfill" data-action="open-supplements" data-day="${yesterday}">
        Gestern ${yStatus.done} von ${yStatus.expected} – vergessen einzutragen?</button>`
    : '';

  return `
    <section class="card supp-card" data-variant="list">
      <div class="supp-head">
        <strong>💊 Supplements</strong>
        <span class="supp-progress">${status.done}/${status.expected}</span>
        ${series ? `<span class="streak-badge" title="Tage in Folge">🔥 ${series}</span>` : ''}
        <button class="icon-btn small" data-action="open-supplements" aria-label="Supplements verwalten">${Icon.chevron}</button>
      </div>
      ${slots}
      ${backfill}
    </section>`;
}

function elementFrom(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html.trim();
  return holder.firstElementChild;
}

// Ein Element weich in ein anderes übergehen lassen: erst blendet der alte
// Inhalt aus, dann wird getauscht und die Höhe (samt Hinter-/Rahmenfarbe)
// gleitet auf die neue Form, während der neue Inhalt einblendet. Ohne das
// springt die Höhe beim Tausch schlagartig – genau das wirkte wie "verschwindet
// auf einmal".
function morphReplace(oldEl, newEl) {
  if (prefersReducedMotion() || !oldEl.isConnected) {
    oldEl.replaceWith(newEl);
    return Promise.resolve();
  }
  const easing = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const fadeOut = [...oldEl.children].map((child) => child.animate(
    [{ opacity: 1 }, { opacity: 0 }], { duration: 130, easing: 'ease-in', fill: 'forwards' },
  ).finished.catch(() => {}));

  return Promise.all(fadeOut).then(() => {
    if (!oldEl.isConnected) return undefined;
    const from = oldEl.getBoundingClientRect().height;
    const oldStyle = getComputedStyle(oldEl);
    const fromColors = { backgroundColor: oldStyle.backgroundColor, borderColor: oldStyle.borderColor };
    oldEl.replaceWith(newEl);
    const to = newEl.getBoundingClientRect().height;
    const newStyle = getComputedStyle(newEl);

    newEl.style.overflow = 'hidden';
    const grow = newEl.animate([
      { height: `${from}px`, ...fromColors },
      { height: `${to}px`, backgroundColor: newStyle.backgroundColor, borderColor: newStyle.borderColor },
    ], { duration: 360, easing });
    [...newEl.children].forEach((child, i) => child.animate(
      [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }],
      { duration: 280, delay: 90 + i * 30, easing: 'ease-out', fill: 'backwards' },
    ));
    return grow.finished.catch(() => {}).then(() => { newEl.style.overflow = ''; });
  });
}

function suppItemsHtml(items, taken, day) {
  return items.map((s) => `
    <button class="supp-item ${taken[s.id] ? 'on' : ''}" data-action="supp-toggle" data-id="${s.id}" data-day="${day}">
      <span class="supp-check">${Icon.check}</span>
      <span class="supp-name">${escapeHtml(s.name)}${s.dose ? `<span class="supp-dose"> · ${escapeHtml(s.dose)}</span>` : ''}</span>
    </button>`).join('');
}

// Abhaken: der Haken reagiert sofort (Klasse + Ton), ohne dass irgendetwas
// neu gebaut wird – ein Neuaufbau ersetzt den gerade federnden Haken durch
// ein frisches, statisches Element, und genau das hat geruckelt. Erst kurz
// danach wird abgeglichen, ob sich die Struktur geändert hat.
function toggleSupplements(ids, day, container, afterToggle) {
  const log = Store.getSupplementLog();
  const taken = log[day] || {};
  const willTake = ids.some((id) => !taken[id]);
  const before = dayStatus(Store.getSupplements(), log, day).complete;

  Store.setSupplementsTaken(day, ids, willTake);
  ids.forEach((id) => qsa(`[data-action="supp-toggle"][data-id="${id}"][data-day="${day}"]`, container)
    .forEach((el) => el.classList.toggle('on', willTake)));

  const after = dayStatus(Store.getSupplements(), Store.getSupplementLog(), day).complete;
  if (after && !before) Sound.record();
  else if (willTake) Sound.setDone();
  else Sound.setUndone();

  afterToggle?.();
  // Wird der Tag damit komplett, etwas länger warten: der letzte Haken soll
  // sichtbar sitzen, bevor die Karte in ihre Kurzform übergeht.
  scheduleSupplementRefresh(after && !before ? 480 : 300);
}

// Mehrere schnelle Haken hintereinander ergeben nur EINEN Abgleich, und
// solange ein Übergang läuft, wartet der nächste – sonst würden zwei
// Überblendungen am selben Element zerren.
let suppRefreshTimer = null;
let suppMorphing = null;
function scheduleSupplementRefresh(delay) {
  clearTimeout(suppRefreshTimer);
  suppRefreshTimer = setTimeout(async () => {
    if (suppMorphing) await suppMorphing;
    suppMorphing = refreshSupplementCard().finally(() => { suppMorphing = null; });
  }, delay);
}

// Karte mit dem aktuellen Stand abgleichen – so wenig wie möglich anfassen:
// Zahlen und Haken direkt nachziehen, nur geänderte Abschnitte überblenden.
function refreshSupplementCard() {
  const card = qs('.supp-card');
  if (!card) return Promise.resolve();
  const next = elementFrom(renderSupplementCard());
  if (!next) {
    return new Promise((resolve) => collapseAway(card, () => {
      const group = card.closest('.start-group');
      card.remove();
      // Abschnitt "Heute" ohne Inhalt nicht als leere Überschrift stehen lassen
      if (group && !group.querySelector('.card')) group.remove();
      resolve();
    }));
  }

  // Anderer Grundzustand (z.B. Liste -> "alles genommen"): ganze Karte überblenden.
  if (card.dataset.variant !== next.dataset.variant) {
    const done = morphReplace(card, next);
    bindSupplementCard();
    return done;
  }
  if (next.dataset.variant !== 'list') {
    card.replaceWith(next);
    bindSupplementCard();
    return Promise.resolve();
  }

  const oldSlots = qsa('.supp-slot', card).map((s) => s.dataset.slot).join();
  const newSlots = qsa('.supp-slot', next).map((s) => s.dataset.slot).join();
  if (oldSlots !== newSlots) {
    const done = morphReplace(card, next);
    bindSupplementCard();
    return done;
  }

  const morphs = qsa('.supp-slot', next).map((newSlot) => {
    const oldSlot = qs(`.supp-slot[data-slot="${newSlot.dataset.slot}"]`, card);
    if (oldSlot.dataset.state !== newSlot.dataset.state) return morphReplace(oldSlot, newSlot);
    // gleicher Zustand: nur Haken und "Alle"-Knopf nachziehen
    qsa('[data-action="supp-toggle"]', newSlot).forEach((item) => {
      qs(`[data-action="supp-toggle"][data-id="${item.dataset.id}"]`, oldSlot)
        ?.classList.toggle('on', item.classList.contains('on'));
    });
    const allNew = qs('[data-action="supp-slot-all"]', newSlot);
    const allOld = qs('[data-action="supp-slot-all"]', oldSlot);
    if (allNew && allOld) allOld.hidden = allNew.hidden;
    return Promise.resolve();
  });

  // Kopfzeile und Nachtrage-Hinweis
  qs('.supp-progress', card).textContent = qs('.supp-progress', next).textContent;
  const newBadge = qs('.supp-head .streak-badge', next);
  const oldBadge = qs('.supp-head .streak-badge', card);
  if (newBadge && oldBadge) oldBadge.textContent = newBadge.textContent;
  else if (newBadge) { qs('.supp-progress', card).after(newBadge); dropIn(newBadge); }
  else oldBadge?.remove();
  const newFill = qs('.supp-backfill', next);
  const oldFill = qs('.supp-backfill', card);
  if (!newFill && oldFill) collapseAway(oldFill, () => oldFill.remove());
  else if (newFill && oldFill) oldFill.innerHTML = newFill.innerHTML;

  return Promise.all(morphs);
}

// Klicks per Delegation an der Karte: Teile der Karte werden beim Abgleich
// ausgetauscht, einzelne Listener an Kindern gingen dabei verloren oder
// kämen doppelt.
function bindSupplementCard() {
  const card = qs('.supp-card');
  if (!card || card.dataset.bound) return;
  card.dataset.bound = '1';
  card.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !card.contains(el)) return;
    const action = el.dataset.action;
    if (action === 'open-supplements') openSupplementSheet(el.dataset.day);
    else if (action === 'supp-toggle') toggleSupplements([el.dataset.id], el.dataset.day, card);
    else if (action === 'supp-slot-all') {
      const ids = Store.getActiveSupplements().filter((s) => s.slot === el.dataset.slot).map((s) => s.id);
      const taken = Store.getSupplementLog()[el.dataset.day] || {};
      const open = ids.filter((id) => !taken[id]);
      toggleSupplements(open.length ? open : ids, el.dataset.day, card);
    } else if (action === 'supp-expand-slot') {
      const items = el.nextElementSibling;
      animateHeight(items.parentElement, true, () => { el.remove(); items.hidden = false; });
    }
  });
}

// ---- Supplements: Übersicht, Nachtragen, Verwaltung, Erinnerung ----
function dayLabel(key) {
  const today = dayKey();
  if (key === today) return 'Heute';
  if (key === shiftDay(today, -1)) return 'Gestern';
  return dateOfKey(key).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function openSupplementSheet(focusDay) {
  const today = dayKey();
  let selected = focusDay && focusDay <= today ? focusDay : today;
  let view = dateOfKey(selected);
  view = { year: view.getFullYear(), month: view.getMonth() };

  function dayClass(st, key) {
    if (key > today) return 'future';
    if (st.complete) return 'full';
    if (st.expected && st.done) return 'partial';
    if (st.expected && key < today) return 'missed';
    return 'none';
  }

  function calendarHtml(supplements, log) {
    const first = new Date(view.year, view.month, 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(view.year, view.month + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < offset; i += 1) cells += '<span class="cal-cell empty"></span>';
    for (let d = 1; d <= days; d += 1) {
      const key = `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const st = dayStatus(supplements, log, key);
      const cls = dayClass(st, key);
      const pickable = key <= today && st.expected;
      cells += `<button class="cal-cell supp-day ${cls} ${key === selected ? 'selected' : ''} ${key === today ? 'today' : ''}"
        ${pickable ? `data-action="supp-pick-day" data-day="${key}"` : 'disabled'}>${d}</button>`;
    }
    const label = first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const canForward = new Date(view.year, view.month + 1, 1) <= dateOfKey(today);
    return `
      <div class="card calendar">
        <div class="calendar-header">
          <button class="icon-btn small" data-action="supp-cal" data-delta="-1" aria-label="Vorheriger Monat">${Icon.chevron}</button>
          <strong>${label}</strong>
          <button class="icon-btn small" data-action="supp-cal" data-delta="1" aria-label="Nächster Monat" ${canForward ? '' : 'disabled'}>${Icon.chevron}</button>
        </div>
        <div class="calendar-weekdays">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<span>${w}</span>`).join('')}</div>
        <div class="calendar-grid">${cells}</div>
        <div class="supp-legend">
          <span><i class="lg full"></i>alles</span><span><i class="lg partial"></i>teilweise</span><span><i class="lg missed"></i>vergessen</span>
        </div>
      </div>`;
  }

  function checklistHtml(supplements, log) {
    const items = activeOn(supplements, selected);
    const taken = log[selected] || {};
    const st = dayStatus(supplements, log, selected);
    if (!items.length) return '';
    const groups = SLOTS.map((slot) => {
      const inSlot = items.filter((s) => s.slot === slot.id);
      if (!inSlot.length) return '';
      return `<div class="supp-slot"><div class="supp-slot-head"><span>${slot.icon} ${slot.label}</span></div>
        ${suppItemsHtml(inSlot, taken, selected)}</div>`;
    }).join('');
    return `
      <div class="card supp-day-card">
        <div class="supp-head">
          <strong>${dayLabel(selected)}</strong>
          <span class="supp-progress">${st.done}/${st.expected}</span>
          <button class="supp-all" data-action="supp-day-all" ${st.complete ? 'hidden' : ''}>Alle ${Icon.check}</button>
        </div>
        ${groups}
      </div>`;
  }

  function reminderHtml(active) {
    const settings = Store.getSettings();
    const slots = SLOTS.filter((slot) => active.some((s) => s.slot === slot.id));
    if (!slots.length) return '';
    return `
      <div class="section-title" style="margin-top:6px">Tägliche Erinnerung</div>
      <div class="card">
        <p class="muted small" style="margin:0 0 10px">Web-Apps dürfen auf dem iPhone keine eigenen Erinnerungen planen – der Kalender schon.
          Einmal hinzufügen, dann meldet sich dein iPhone jeden Tag zur gewählten Zeit.</p>
        ${slots.map((slot) => {
          const time = settings.supplementReminders?.[slot.id] || slot.reminder;
          return `
            <div class="supp-reminder">
              <span class="supp-reminder-label">${slot.icon} ${slot.label}</span>
              <select class="text-input supp-time" data-slot="${slot.id}">
                ${REMINDER_TIMES.map((t) => `<option value="${t}" ${t === time ? 'selected' : ''}>${t.slice(0, 2)}:${t.slice(2)}</option>`).join('')}
              </select>
              <a class="btn btn-secondary small" data-reminder-link="${slot.id}" href="${reminderFile(time)}" target="_blank" rel="noopener">${Icon.calendar} Hinzufügen</a>
            </div>`;
        }).join('')}
        <p class="muted small supp-tip">Tipp: Stell die Dosen dorthin, wo du jeden Tag ohnehin vorbeikommst – neben die Kaffeemaschine oder die Zahnbürste. Das hilft mehr als jede Erinnerung.</p>
      </div>`;
  }

  function body() {
    const supplements = Store.getSupplements();
    const active = Store.getActiveSupplements();
    const log = Store.getSupplementLog();
    const series = streak(supplements, log, today);
    const quote = adherence(supplements, log, today, 30);

    const list = active.length
      ? `<div class="card list">${SLOTS.flatMap((slot) => active.filter((s) => s.slot === slot.id).map((s) => `
          <button class="list-item selectable" data-action="supp-edit" data-id="${s.id}">
            <div class="list-item-main"><strong>${escapeHtml(s.name)}</strong>
              <span class="muted">${slot.icon} ${slot.label}${s.dose ? ` · ${escapeHtml(s.dose)}` : ''}</span></div>
            ${Icon.chevron}
          </button>`)).join('')}</div>`
      : '<p class="empty small">Noch keine Supplements. Leg los – die gängigsten sind mit einem Tipp drin.</p>';

    return `
      ${active.length ? `
        <div class="card stat-row detail-stats">
          <div><span class="stat-value">${series}</span><span class="muted small">Tage in Folge</span></div>
          <div><span class="stat-value">${quote ? `${quote.percent}%` : '–'}</span><span class="muted small">${quote ? `letzte ${quote.days} Tage` : 'noch keine Daten'}</span></div>
          <div><span class="stat-value">${active.length}</span><span class="muted small">Präparate</span></div>
        </div>
        ${calendarHtml(supplements, log)}
        ${checklistHtml(supplements, log)}` : ''}
      <div class="section-title" style="margin-top:6px">Meine Supplements</div>
      ${list}
      <button class="btn btn-secondary full supp-add" data-action="supp-add">${Icon.plus} Supplement hinzufügen</button>
      ${reminderHtml(active)}`;
  }

  // Innerhalb des Sheets nur den Inhalt neu malen – ein Tausch über
  // openSheet würde jedes Abhaken mit einer Einblend-Animation quittieren.
  function paint() {
    const el = qs('.sheet-body', sheetRoot);
    if (!el) return;
    const scroll = el.scrollTop;
    el.innerHTML = body();
    el.scrollTop = scroll;
    bind();
  }

  // Nach einem Haken im Sheet nur nachziehen, was sich geändert hat – ein
  // Neuaufbau würde den federnden Haken ersetzen und ruckeln.
  function patch() {
    const root = qs('.sheet-body', sheetRoot);
    if (!root) return;
    const supplements = Store.getSupplements();
    const log = Store.getSupplementLog();
    const st = dayStatus(supplements, log, selected);
    const progress = qs('.supp-day-card .supp-progress', root);
    if (progress) progress.textContent = `${st.done}/${st.expected}`;
    const all = qs('[data-action="supp-day-all"]', root);
    if (all) all.hidden = st.complete;
    const cell = qs(`.supp-day[data-day="${selected}"]`, root);
    if (cell) {
      cell.classList.remove('full', 'partial', 'missed', 'none');
      cell.classList.add(dayClass(st, selected));
    }
    const values = qsa('.detail-stats .stat-value', root);
    if (values.length >= 2) {
      values[0].textContent = streak(supplements, log, today);
      const quote = adherence(supplements, log, today, 30);
      values[1].textContent = quote ? `${quote.percent}%` : '–';
    }
  }

  function bind() {
    const root = qs('.sheet-body', sheetRoot);
    qsa('[data-action="supp-toggle"]', root).forEach((btn) => btn.addEventListener('click', () =>
      toggleSupplements([btn.dataset.id], btn.dataset.day, root, patch)));
    qs('[data-action="supp-day-all"]', root)?.addEventListener('click', () => {
      const taken = Store.getSupplementLog()[selected] || {};
      const open = activeOn(Store.getSupplements(), selected).filter((s) => !taken[s.id]).map((s) => s.id);
      if (open.length) toggleSupplements(open, selected, root, patch);
    });
    qsa('[data-action="supp-pick-day"]', root).forEach((btn) => btn.addEventListener('click', () => {
      selected = btn.dataset.day;
      paint();
      dropIn(qs('.supp-day-card', root));
    }));
    qsa('[data-action="supp-cal"]', root).forEach((btn) => btn.addEventListener('click', () => {
      const d = new Date(view.year, view.month + +btn.dataset.delta, 1);
      view = { year: d.getFullYear(), month: d.getMonth() };
      paint();
      const grid = qs('.calendar-grid', root);
      if (grid && !prefersReducedMotion()) {
        grid.style.setProperty('--enter-x', +btn.dataset.delta > 0 ? '20px' : '-20px');
        dropIn(grid);
      }
    }));
    qsa('[data-action="supp-edit"]', root).forEach((btn) => btn.addEventListener('click', () =>
      openSupplementEditor(btn.dataset.id, () => openSupplementSheet(selected))));
    qs('[data-action="supp-add"]', root)?.addEventListener('click', () =>
      openSupplementEditor(null, () => openSupplementSheet(selected)));
    qsa('.supp-time', root).forEach((select) => select.addEventListener('change', () => {
      const settings = Store.getSettings();
      Store.saveSettings({
        ...settings,
        supplementReminders: { ...(settings.supplementReminders || {}), [select.dataset.slot]: select.value },
      });
      qs(`[data-reminder-link="${select.dataset.slot}"]`, root).href = reminderFile(select.value);
    }));
  }

  openSheet('Supplements', body(), { onMount: bind });
}

// Anlegen per Vorschlag (ein Tipp) oder frei; Bearbeiten mit Tageszeit,
// Dosierung und Entfernen. `back` führt zurück zur Übersicht.
function openSupplementEditor(id, back) {
  const existing = id ? Store.getSupplements().find((s) => s.id === id) : null;
  const draft = existing ? { ...existing } : { id: uid(), name: '', dose: '', slot: 'morning', since: dayKey() };

  const slotChips = () => SLOTS.map((slot) => `
    <button class="chip ${draft.slot === slot.id ? 'active' : ''}" data-action="supp-slot" data-slot="${slot.id}">
      ${slot.icon}<span class="chip-sub">${slot.label.replace('Vor dem Schlafen', 'Nachts')}</span></button>`).join('');

  const taken = new Set(Store.getActiveSupplements().map((s) => s.name.toLowerCase()));
  const presets = existing ? '' : `
    <div class="section-title">Schnell hinzufügen</div>
    <div class="preset-row">
      ${SUPPLEMENT_PRESETS.map((p) => taken.has(p.name.toLowerCase())
        ? `<span class="chip preset done">${Icon.check} ${escapeHtml(p.name)}</span>`
        : `<button class="chip preset" data-action="supp-preset" data-name="${escapeHtml(p.name)}" data-slot="${p.slot}">${Icon.plus} ${escapeHtml(p.name)}</button>`).join('')}
    </div>
    <div class="section-title" style="margin-top:16px">Oder eigenes</div>`;

  openSheet(existing ? 'Supplement bearbeiten' : 'Supplement hinzufügen', `
    ${presets}
    <label class="field-label">Name</label>
    <input type="text" id="supp-name" class="text-input" value="${escapeHtml(draft.name)}" placeholder="z.B. Kreatin" />
    <label class="field-label">Dosis (optional)</label>
    <input type="text" id="supp-dose" class="text-input" value="${escapeHtml(draft.dose || '')}" placeholder="z.B. 5 g oder 2 Kapseln" />
    <label class="field-label">Wann</label>
    <div class="chip-row supp-slots">${slotChips()}</div>
  `, {
    footer: `
      <button class="btn btn-primary full" data-action="supp-save">Speichern</button>
      ${existing ? `<button class="btn btn-ghost danger full" data-action="supp-remove">${Icon.trash} Entfernen</button>` : ''}`,
    onDismiss: back,
    onMount: () => {
      qsa('[data-action="supp-slot"]').forEach((btn) => btn.addEventListener('click', () => {
        draft.slot = btn.dataset.slot;
        qsa('[data-action="supp-slot"]').forEach((b) => b.classList.toggle('active', b === btn));
      }));
      qsa('[data-action="supp-preset"]').forEach((btn) => btn.addEventListener('click', () => {
        Store.saveSupplement({ id: uid(), name: btn.dataset.name, dose: '', slot: btn.dataset.slot, since: dayKey() });
        Sound.setDone();
        btn.outerHTML = `<span class="chip preset done item-in">${Icon.check} ${escapeHtml(btn.dataset.name)}</span>`;
        scheduleSupplementRefresh(0);
      }));
      qs('[data-action="supp-save"]').addEventListener('click', () => {
        const name = qs('#supp-name').value.trim();
        if (!name) {
          // Nur Vorschläge angetippt, kein eigener Name: einfach zurück.
          if (!existing) { back(); return; }
          qs('#supp-name').focus();
          return;
        }
        Store.saveSupplement({ ...draft, name, dose: qs('#supp-dose').value.trim() });
        scheduleSupplementRefresh(0);
        back();
      });
      qs('[data-action="supp-remove"]')?.addEventListener('click', () => {
        if (!confirm(`„${draft.name}" entfernen? Bisherige Einnahmen bleiben im Verlauf.`)) return;
        Sound.remove();
        Store.removeSupplement(draft.id, dayKey());
        scheduleSupplementRefresh(0);
        back();
      });
    },
  });
}

// ---- Workout-Ansicht (Vollbild) ----
// Wenn eine Übung heute unter deutlich anderer Vorbelastung läuft als beim
// letzten Mal, ist der Vergleich mit "letztes Mal" irreführend – dann sagen,
// warum, und in welche Richtung.
function fatigueNoteHtml(lastSession, workout, ei, groupOf) {
  if (!lastSession) return '';
  const then = fatigueOf(lastSession.workout, lastSession.entryIndex, groupOf);
  const now = fatigueOf(workout, ei, groupOf, { planned: true });
  if (then.bucket === now.bucket) return '';
  const group = ['Ganzkörper', 'Cardio', 'Sonstiges'].includes(now.group) ? 'ähnliche' : now.group;
  const count = (n) => (n === 0 ? `keine Sätze ${group}` : `${plural(n, 'Satz', 'Sätze')} ${group}`);
  const tail = now.priorSets > then.priorSets
    ? 'etwas weniger als damals ist hier normal.'
    : 'du gehst frischer rein als damals.';
  return `<p class="fatigue-note">Diesmal ${count(now.priorSets)} davor, letztes Mal ${then.priorSets || 'keine'} – ${tail}</p>`;
}

function exerciseSummaryText(entry, unit) {
  const top = bestSet(entry.sets);
  return `${entry.sets.filter((s) => s.done).length}/${entry.sets.length} Sätze${top ? ` · ${formatSet(top, unit)}` : ''}`;
}

function isEntryComplete(entry) {
  return entry.sets.length > 0 && entry.sets.every((s) => s.done);
}

function workoutProgress(workout) {
  const total = workout.entries.reduce((n, e) => n + e.sets.length, 0);
  const done = workout.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return { done, total, ratio: total ? done / total : 0 };
}

function setRowHtml(s, ei, si) {
  const weight = s.weight > 0 ? formatNumber(s.weight) : '';
  const reps = s.reps > 0 ? String(s.reps) : '';
  return `
      <div class="set-row ${s.done ? 'done' : ''}" data-ei="${ei}" data-si="${si}">
        <span class="set-index">${si + 1}</span>
        <input type="text" inputmode="decimal" autocomplete="off" class="set-input ${s.suggested ? 'suggested' : ''}" placeholder="—"
          value="${weight}" data-field="weight" data-ei="${ei}" data-si="${si}" aria-label="Gewicht Satz ${si + 1}" />
        <span class="set-x">×</span>
        <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" class="set-input small ${s.suggested ? 'suggested' : ''}" placeholder="—"
          value="${reps}" data-field="reps" data-ei="${ei}" data-si="${si}" aria-label="Wiederholungen Satz ${si + 1}" />
        <button class="check-btn ${s.done ? 'on' : ''}" data-action="toggle-set" data-ei="${ei}" data-si="${si}" aria-label="Satz ${si + 1} abhaken">${Icon.check}</button>
        <button class="set-remove" data-action="remove-set" data-ei="${ei}" data-si="${si}" aria-label="Satz ${si + 1} entfernen">${Icon.minus}</button>
        ${s.pr ? '<span class="pr-badge">PR</span>' : ''}
      </div>`;
}

function renderWorkout() {
  const w = Store.getActive();
  const unit = unitLabel(Store.getSettings().unit);
  const overloadOn = Store.getSettings().progressiveOverload;
  const exercises = Store.getExercises();
  const groupOf = muscleGroupLookup(exercises);
  const names = exerciseNames();
  const notes = new Map(exercises.map((e) => [e.id, e.notes]));

  const entries = w.entries.map((entry, ei) => {
    const lastSession = lastSessionFor(entry.exerciseId, w.id);
    const overload = overloadOn ? getOverloadSuggestion(Store.getExercise(entry.exerciseId), w.id) : null;
    const note = notes.get(entry.exerciseId);
    const sets = entry.sets.map((s, si) => setRowHtml(s, ei, si)).join('');

    // Zugeklappt bleibt nur die Kopfzeile stehen – mit einer Kurzfassung,
    // damit das Zuklappen nicht bedeutet, den Überblick zu verlieren.
    const collapsed = state.collapsedExercises.has(entry.exerciseId);
    const complete = isEntryComplete(entry);

    return `
      <section class="card exercise-block ${collapsed ? 'collapsed' : ''} ${complete ? 'complete' : ''}" data-ei="${ei}">
        <div class="exercise-block-header">
          <button class="ex-toggle" data-action="toggle-exercise" data-id="${entry.exerciseId}" aria-expanded="${!collapsed}">
            <span class="ex-title">
              <strong><span class="ex-done-mark" aria-hidden="true">${Icon.check}</span>${escapeHtml(entryName(entry, names))}</strong>
              <span class="muted small ex-summary">${exerciseSummaryText(entry, unit)}</span>
            </span>
            <span class="ex-chevron">${Icon.chevron}</span>
          </button>
          <button class="icon-btn small danger" data-action="remove-exercise" data-ei="${ei}" aria-label="Übung entfernen">${Icon.trash}</button>
        </div>
        <div class="exercise-body"><div>
          ${note ? `<p class="ex-note">${escapeHtml(note)}</p>` : ''}
          ${lastSession ? `<p class="muted small last-time">Letztes Mal · ${relativeDay(lastSession.workout.startedAt)}: ${formatSetList(lastSession.entry.sets, unit) || '—'}</p>` : ''}
          ${fatigueNoteHtml(lastSession, w, ei, groupOf)}
          ${overload ? `<p class="overload-tip">💪 ${overload.threshold}+ Wdh bei ${formatWeight(overload.from, unit)} in Folge – neues Ziel ${formatWeight(overload.to, unit)}</p>` : ''}
          <div class="set-header-row">
            <span class="set-index">Satz</span><span>${unit}</span><span></span><span>Wdh</span><span></span><span></span>
          </div>
          ${sets || '<p class="empty small">Noch keine Sätze.</p>'}
          <button class="btn btn-ghost small" data-action="add-set" data-ei="${ei}">${Icon.plus} Satz</button>
        </div></div>
      </section>`;
  }).join('');

  const progress = workoutProgress(w);
  return `
    <div class="workout-screen ${workoutEntering ? 'entering' : ''}">
      <header class="topbar workout-topbar">
        <button class="icon-btn minimize-btn" data-action="minimize-workout" aria-label="Training minimieren">${Icon.chevron}</button>
        <div class="workout-title">
          <strong>${escapeHtml(w.routineName || 'Freies Training')}</strong>
          <span class="muted small"><span id="workout-timer">${elapsedLabel(w.startedAt)}</span>
            · <span id="workout-sets">${progress.done}/${progress.total}</span> Sätze</span>
        </div>
        <button class="icon-btn danger" data-action="discard-workout" aria-label="Training verwerfen">${Icon.trash}</button>
        <span class="workout-progress" aria-hidden="true"><span id="workout-progress-fill" style="transform:scaleX(${progress.ratio})"></span></span>
      </header>
      <main class="view">
        ${entries || '<p class="empty">Füge eine Übung hinzu, um loszulegen.</p>'}
        <div class="row gap workout-actions">
          <button class="btn btn-secondary" data-action="add-exercise-to-workout">${Icon.plus} Übung</button>
          ${w.entries.length > 1 ? `<button class="btn btn-secondary" data-action="reorder-workout">${Icon.grip} Reihenfolge</button>` : ''}
        </div>
        <button class="btn btn-primary full" data-action="finish-workout">Training beenden</button>
      </main>
      <div id="rest-slot"></div>
    </div>`;
}

// Kopfzeile des Trainings (Satzzähler + Fortschrittsbalken) und den
// Erledigt-Zustand der Übung nachziehen, ohne neu zu rendern.
function updateWorkoutProgress(workout, ei) {
  const progress = workoutProgress(workout);
  const count = qs('#workout-sets');
  if (count) count.textContent = `${progress.done}/${progress.total}`;
  const fill = qs('#workout-progress-fill');
  if (fill) fill.style.transform = `scaleX(${progress.ratio})`;
  if (ei === undefined) return;
  const block = qs(`.exercise-block[data-ei="${ei}"]`);
  if (block) block.classList.toggle('complete', isEntryComplete(workout.entries[ei]));
}

// Rekord-Markierung für eine Übung neu bestimmen: ausgezeichnet wird der
// beste abgeschlossene Satz dieser Einheit – aber nur, wenn er auch alles
// übertrifft, was für die Übung bereits im Verlauf steht. Es wird immer die
// ganze Übung neu bewertet, damit eine Markierung mitwandert (oder verfällt),
// sobald ein stärkerer Satz dazukommt oder der bisher beste entfernt wird.
// Ohne Verlauf gibt es nichts zu schlagen – dann auch keinen Rekord, sonst
// wäre beim allerersten Training jede Übung einer.
// Sätze mit Zusatzgewicht zählen über das geschätzte 1RM, reine
// Körpergewichtssätze über die Wiederholungen (siehe setScore).
function refreshPrFlags(workout, ei) {
  const entry = workout.entries[ei];
  const best = { load: 0, reps: 0 };
  let hasHistory = false;
  Store.getWorkouts()
    .filter((w) => w.finishedAt && w.id !== workout.id)
    .forEach((w) => w.entries.forEach((e) => {
      if (e.exerciseId !== entry.exerciseId) return;
      e.sets.forEach((s) => {
        const score = setScore(s);
        if (!score) return;
        hasHistory = true;
        best[score.kind] = Math.max(best[score.kind], score.value);
      });
    }));

  const winner = { load: -1, reps: -1 };
  entry.sets.forEach((set, i) => {
    set.pr = false;
    const score = hasHistory ? setScore(set) : null;
    if (!score || score.value <= best[score.kind]) return;
    best[score.kind] = score.value;
    winner[score.kind] = i;
  });
  // Pro Übung genau eine Markierung – Zusatzgewicht hat Vorrang.
  const index = winner.load >= 0 ? winner.load : winner.reps;
  if (index >= 0) entry.sets[index].pr = true;
  return index;
}

// Die Kurzfassung in der Kopfzeile mitziehen: das Abhaken rendert bewusst
// nicht neu, sonst stünde dort beim Zuklappen ein veralteter Stand.
function updateExerciseSummary(entry, ei) {
  const el = qs(`.exercise-block[data-ei="${ei}"] .ex-summary`);
  if (el) el.textContent = exerciseSummaryText(entry, unitLabel(Store.getSettings().unit));
}

function updatePrBadges(entry, ei) {
  entry.sets.forEach((set, si) => {
    const row = qs(`.set-row[data-ei="${ei}"][data-si="${si}"]`);
    if (!row) return;
    const existing = qs('.pr-badge', row);
    if (!!set.pr === !!existing) return;
    if (!set.pr) { existing.remove(); return; }
    const badge = document.createElement('span');
    badge.className = 'pr-badge item-in';
    badge.textContent = 'PR';
    row.append(badge); // absolut positioniert – verschiebt das Spaltenraster nicht
  });
}

// ---- Bildschirm anlassen ----
// Während des Trainings bleibt das Display an – sonst sperrt sich das iPhone
// zwischen zwei Sätzen, und jedes Abhaken beginnt mit Face ID. iOS gibt die
// Sperre frei, sobald die App in den Hintergrund geht; beim Zurückkehren
// wird sie neu angefordert (siehe visibilitychange).
let wakeLock = null;
let wakeLockPending = false;

async function requestWakeLock() {
  if (!Store.getSettings().keepAwake || !('wakeLock' in navigator)) return;
  if (document.visibilityState !== 'visible' || wakeLockPending || (wakeLock && !wakeLock.released)) return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    // Training inzwischen verlassen? Dann gleich wieder freigeben.
    if (state.workoutOpen) wakeLock = lock;
    else lock.release().catch(() => {});
  } catch {
    wakeLock = null; // z.B. Energiesparmodus – dann eben ohne
  } finally {
    wakeLockPending = false;
  }
}

function releaseWakeLock() {
  if (wakeLock && !wakeLock.released) wakeLock.release().catch(() => {});
  wakeLock = null;
}

// ---- Satzpause ----
// Nach dem Abhaken eines Satzes läuft (falls eingeschaltet) eine Pause. Die
// Leiste wird direkt ins DOM gehängt statt über render(), damit das Abhaken
// re-render-frei bleibt und die Animationen sauber durchlaufen.
function restBarHtml(remaining, duration) {
  const pct = Math.max(0, Math.min(100, (remaining / duration) * 100));
  return `
    <div class="rest-bar" id="rest-bar">
      <div class="rest-fill" id="rest-fill" style="width:${pct}%"></div>
      <div class="rest-content">
        <span class="rest-label">Pause</span>
        <span class="rest-time" id="rest-time">${formatClock(remaining)}</span>
        <button class="rest-btn" data-action="rest-adjust" data-delta="-15">−15</button>
        <button class="rest-btn" data-action="rest-adjust" data-delta="15">+15</button>
        <button class="rest-btn primary" data-action="rest-skip">Fertig</button>
      </div>
    </div>`;
}

function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function startRest() {
  const seconds = Store.getSettings().restSeconds;
  if (!seconds) return;
  Store.setRest({ endsAt: Date.now() + seconds * 1000, duration: seconds });
  syncRestBar();
}

function adjustRest(delta) {
  const rest = Store.getRest();
  if (!rest) return;
  const endsAt = Math.max(Date.now() + 1000, rest.endsAt + delta * 1000);
  const duration = Math.max(rest.duration + delta, Math.round((endsAt - Date.now()) / 1000));
  Store.setRest({ endsAt, duration });
  syncRestBar();
}

function stopRest() {
  Store.setRest(null);
  const bar = qs('#rest-bar');
  if (!bar) return;
  bar.classList.add('leaving');
  setTimeout(() => bar.remove(), 240);
}

// Baut die Leiste auf, entfernt sie oder aktualisiert nur die Zahl – je
// nachdem, was gerade nötig ist.
function syncRestBar() {
  const slot = qs('#rest-slot');
  if (!slot) return;
  const rest = Store.getRest();
  const bar = qs('#rest-bar');

  if (!rest) {
    if (bar && !bar.classList.contains('leaving')) {
      bar.classList.add('leaving');
      setTimeout(() => bar.remove(), 240);
      Sound.restOver();
      toast('Pause vorbei 🔔');
    }
    return;
  }

  const remaining = (rest.endsAt - Date.now()) / 1000;
  if (!bar) {
    slot.innerHTML = restBarHtml(remaining, rest.duration);
    bindRestEvents();
    return;
  }
  qs('#rest-time').textContent = formatClock(remaining);
  qs('#rest-fill').style.width = `${Math.max(0, Math.min(100, (remaining / rest.duration) * 100))}%`;
}

function bindRestEvents() {
  qsa('[data-action="rest-adjust"]').forEach((btn) =>
    btn.addEventListener('click', () => adjustRest(+btn.dataset.delta)));
  qs('[data-action="rest-skip"]')?.addEventListener('click', stopRest);
}

function bindWorkoutEvents() {
  const getActive = () => Store.getActive();

  qs('[data-action="minimize-workout"]').addEventListener('click', () => {
    releaseWakeLock();
    go(() => { state.workoutOpen = false; render(); });
  });
  qs('[data-action="discard-workout"]').addEventListener('click', () => {
    if (confirm('Training wirklich verwerfen? Alle Sätze gehen verloren.')) {
      stopTicking();
      qs('#rest-bar')?.remove();
      Store.clearActive();
      releaseWakeLock();
      state.collapsedExercises.clear();
      go(() => { state.workoutOpen = false; render(); });
    }
  });
  qs('[data-action="finish-workout"]').addEventListener('click', () => {
    const w = getActive();
    const totalSets = w.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    if (totalSets === 0 && !confirm('Keine Sätze abgeschlossen. Training trotzdem speichern?')) return;
    w.finishedAt = new Date().toISOString();
    // Laufende Pause still beenden – sonst meldet der Takt bis zum
    // Seitenwechsel noch "Pause vorbei".
    stopTicking();
    qs('#rest-bar')?.remove();
    Store.finishActiveWorkout(w);
    releaseWakeLock();
    Sound.finish();
    state.collapsedExercises.clear();
    go(() => {
      state.workoutOpen = false;
      state.tab = 'today';
      render();
    });
    // Erst die Belohnung, dann der Verlauf: die Zusammenfassung legt sich
    // über den frisch aktualisierten Verlauf.
    setTimeout(() => openFinishSummary(w.id), totalSets ? 380 : 0);
    // Frisch geknackte Challenge-Stufen gleich im Anschluss feiern
    setTimeout(() => {
      const news = checkChallenges();
      if (news.events.length) celebrate(news.events, news.before);
    }, totalSets ? 1100 : 300);
  });
  qs('[data-action="add-exercise-to-workout"]').addEventListener('click', openAddExerciseToWorkoutSheet);
  qs('[data-action="reorder-workout"]')?.addEventListener('click', openReorderSheet);

  qsa('[data-action="toggle-exercise"]').forEach((btn) => btn.addEventListener('click', () => {
    const block = btn.closest('.exercise-block');
    const id = btn.dataset.id;
    const willOpen = block.classList.contains('collapsed');
    if (willOpen) { state.collapsedExercises.delete(id); Sound.open(); }
    else { state.collapsedExercises.add(id); Sound.close(); }
    btn.setAttribute('aria-expanded', String(willOpen));
    animateHeight(qs('.exercise-body', block), willOpen,
      () => block.classList.toggle('collapsed', !willOpen));
  }));

  qsa('[data-action="add-set"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei;
    const last = w.entries[ei].sets[w.entries[ei].sets.length - 1];
    w.entries[ei].sets.push({ weight: last ? last.weight : 0, reps: last ? last.reps : 0, done: false });
    const si = w.entries[ei].sets.length - 1;
    Store.setActive(w);
    render(); // sofort – ein einzelner Satz ist zu klein/häufig für einen Seitenübergang
    dropIn(qs(`.set-row[data-ei="${ei}"][data-si="${si}"]`));
  }));

  // Entfernen ohne Rückfrage, dafür mit "Rückgängig": ein versehentlicher
  // Tipp kostet so nichts, ein gewollter aber auch keinen Extra-Dialog.
  qsa('[data-action="remove-set"]').forEach((btn) => btn.addEventListener('click', () => {
    const ei = +btn.dataset.ei, si = +btn.dataset.si;
    Sound.remove();
    collapseAway(btn.closest('.set-row'), () => {
      const w = getActive();
      const entry = w?.entries[ei];
      if (!entry) return;
      const [removed] = entry.sets.splice(si, 1);
      refreshPrFlags(w, ei);
      Store.setActive(w);
      render();
      toast(`Satz ${si + 1} entfernt`, {
        action: 'Rückgängig',
        onAction: () => {
          const current = Store.getActive();
          const index = current?.entries.findIndex((e) => e.exerciseId === entry.exerciseId) ?? -1;
          if (index < 0) return;
          const sets = current.entries[index].sets;
          sets.splice(Math.min(si, sets.length), 0, removed);
          refreshPrFlags(current, index);
          Store.setActive(current);
          render();
          dropIn(qs(`.set-row[data-ei="${index}"][data-si="${Math.min(si, sets.length - 1)}"]`));
        },
      });
    });
  }));

  qsa('[data-action="toggle-set"]').forEach((btn) => btn.addEventListener('click', () => {
    const w = getActive(); const ei = +btn.dataset.ei, si = +btn.dataset.si;
    const set = w.entries[ei].sets[si];
    const row = btn.closest('.set-row');
    // Ohne Wiederholungen gibt es nichts abzuhaken: statt eines leeren
    // Satzes lieber direkt ins Feld springen.
    if (!set.done && !(set.reps > 0)) {
      const repsInput = qs('[data-field="reps"]', row);
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      repsInput?.focus();
      return;
    }
    set.done = !set.done;
    // Abhaken ohne eigene Eingabe übernimmt den grauen Vorschlagswert als echten Wert.
    if (set.done) set.suggested = false;
    const prIndex = refreshPrFlags(w, ei);
    Store.setActive(w);
    // Bewusst KEIN render(): ein Neuaufbau würde den Knopf durch ein frisches,
    // unanimiertes Element ersetzen – die Feder-Animation am Haken liefe nie.
    // Lokal umschalten ist außerdem spürbar direkter.
    btn.classList.toggle('on', set.done);
    row?.classList.toggle('done', set.done);
    qsa(`.set-input[data-ei="${ei}"][data-si="${si}"]`).forEach((el) => el.classList.remove('suggested'));
    updatePrBadges(w.entries[ei], ei);
    updateExerciseSummary(w.entries[ei], ei);
    updateWorkoutProgress(w, ei);
    if (set.done) {
      startRest();
      const hint = challengeHintForSet(w.entries[ei].exerciseId, set.weight, set.reps);
      if (hint) { Sound.unlock(); toast(hint); } else if (prIndex === si) { Sound.record(); toast('Neuer Rekord 🏆'); } else Sound.setDone();
    } else {
      Sound.setUndone();
    }
  }));

  qsa('[data-action="remove-exercise"]').forEach((btn) => btn.addEventListener('click', () => {
    const ei = +btn.dataset.ei;
    Sound.remove();
    collapseAway(btn.closest('.exercise-block'), () => {
      const w = getActive();
      if (!w?.entries[ei]) return;
      const [removed] = w.entries.splice(ei, 1);
      Store.setActive(w);
      render();
      toast(`${entryName(removed, exerciseNames())} entfernt`, {
        action: 'Rückgängig',
        onAction: () => {
          const current = Store.getActive();
          if (!current) return;
          const index = Math.min(ei, current.entries.length);
          current.entries.splice(index, 0, removed);
          Store.setActive(current);
          render();
          dropIn(qs(`.exercise-block[data-ei="${index}"]`));
        },
      });
    });
  }));

  // Tippen ins Feld markiert den Inhalt: der neue Wert ersetzt den alten,
  // statt ihn erst löschen zu müssen.
  qsa('.set-input').forEach((input) => input.addEventListener('focus', () => {
    requestAnimationFrame(() => {
      try { input.setSelectionRange(0, input.value.length); } catch { /* nicht unterstützt */ }
    });
  }));
  qsa('[data-field="weight"], [data-field="reps"]').forEach((input) => input.addEventListener('input', () => {
    const w = getActive();
    const ei = +input.dataset.ei, si = +input.dataset.si;
    const set = w.entries[ei].sets[si];
    const value = parseNumber(input.value);
    set[input.dataset.field] = input.dataset.field === 'reps' ? Math.floor(value) : value;
    if (set.suggested) {
      set.suggested = false;
      // sofort optisch bestätigen (grau -> normal), ohne die ganze Zeile neu zu rendern
      qsa(`.set-input[data-ei="${ei}"][data-si="${si}"]`).forEach((el) => el.classList.remove('suggested'));
    }
    // Ein nachträglich korrigierter Satz kann einen Rekord gewinnen oder verlieren.
    if (set.done) {
      refreshPrFlags(w, ei);
      updatePrBadges(w.entries[ei], ei);
      updateExerciseSummary(w.entries[ei], ei);
    }
    Store.setActive(w);
  }));
}

// Reihenfolge im laufenden Training ändern – z.B. wenn die Maschine für die
// nächste Übung belegt ist. Bewusst in einem eigenen Sheet mit kurzen Zeilen
// statt per Ziehen an den hohen Übungskarten: die enthalten Eingabefelder und
// stehen in einer scrollenden Liste, da wird eine Ziehgeste schnell zur
// Zitterpartie. Zusätzlich hebt ein Tipp auf den Pfeil eine Übung direkt nach
// ganz oben – der häufigste Fall mit einem Griff.
function openReorderSheet() {
  const order = Store.getActive().entries.map((e, i) => i);

  const names = exerciseNames();
  const rowsHtml = () => {
    const entries = Store.getActive().entries;
    // "dran" ist die erste Übung in der neuen Reihenfolge, die noch offen ist.
    const current = order.find((i) => !isEntryComplete(entries[i]));
    return order.map((entryIndex, position) => {
      const entry = entries[entryIndex];
      const doneSets = entry.sets.filter((s) => s.done).length;
      let badge = `<button class="icon-btn small" data-action="to-top" data-pos="${position}" aria-label="Als Nächstes">${Icon.toTop}</button>`;
      if (isEntryComplete(entry)) badge = '<span class="pill pill-done">fertig</span>';
      else if (entryIndex === current) badge = '<span class="pill pill-chosen">dran</span>';
      return `<div class="list-item reorder-item">
        <span class="drag-handle" data-drag-handle aria-hidden="true">${Icon.grip}</span>
        <div class="list-item-main">
          <strong>${escapeHtml(entryName(entry, names))}</strong>
          <span class="muted">${doneSets} von ${plural(entry.sets.length, 'Satz', 'Sätzen')}</span>
        </div>
        ${badge}
      </div>`;
    }).join('');
  };

  function renderSheet() {
    openSheet('Reihenfolge', `<div class="card list" id="reorder-list">${rowsHtml()}</div>
      <p class="muted small" style="margin-top:10px">Zum Verschieben den Griff gedrückt halten und ziehen.</p>`, {
      footer: '<button class="btn btn-primary full" data-action="apply-order">Übernehmen</button>',
      onMount: () => {
        enableDragReorder(qs('#reorder-list'), (from, to) => {
          order.splice(to, 0, ...order.splice(from, 1));
          renderSheet();
        });
        // Nach vorn heißt: als Nächstes – also vor die erste noch offene
        // Übung, nicht vor bereits erledigte.
        qsa('[data-action="to-top"]').forEach((btn) => btn.addEventListener('click', () => {
          const entries = Store.getActive().entries;
          const [moved] = order.splice(+btn.dataset.pos, 1);
          const firstOpen = order.findIndex((i) => !isEntryComplete(entries[i]));
          order.splice(firstOpen < 0 ? order.length : firstOpen, 0, moved);
          renderSheet();
        }));
        qs('[data-action="apply-order"]').addEventListener('click', () => {
          const w = Store.getActive();
          w.entries = order.map((i) => w.entries[i]);
          Store.setActive(w);
          closeSheet();
          render();
        });
      },
    });
  }

  renderSheet();
}

// Auswahl-Sheet für Übungen, geteilt von Training und Plan-Editor: Suche,
// Gliederung nach Muskelgruppe und Mehrfachauswahl, ohne dass sich das Sheet
// nach jeder Übung schließt.
function openExercisePickerSheet({ title, isChosen, chosenLabel, onPick, onDone }) {
  groupState.picker.query = '';

  const rowHtml = (ex) => `
    <button class="list-item selectable" data-action="pick-exercise" data-id="${ex.id}">
      <div class="list-item-main"><strong>${escapeHtml(ex.name)}</strong></div>
      ${isChosen(ex.id) ? `<span class="pill pill-chosen">${chosenLabel}</span>` : Icon.plus}
    </button>`;

  const listHtml = () => groupedExercisesHtml(Store.getExercises(), {
    query: groupState.picker.query,
    open: groupState.picker.open,
    rowHtml,
  });

  openSheet(title, `
    <input type="search" id="ex-search" class="text-input search-input" placeholder="Übung suchen…" />
    <div id="ex-pick-list" class="ex-groups">${listHtml()}</div>
  `, {
    footer: `<button class="btn btn-secondary full" data-action="picker-done">Fertig</button>`,
    onDismiss: onDone,
    onMount: () => {
      qs('[data-action="picker-done"]').addEventListener('click', () => (onDone ? onDone() : closeSheet()));
      const list = qs('#ex-pick-list');
      const refresh = () => { list.innerHTML = listHtml(); bind(); };
      function bind() {
        bindGroupToggles(list, groupState.picker.open);
        qsa('[data-action="pick-exercise"]', list).forEach((btn) => btn.addEventListener('click', () => {
          if (isChosen(btn.dataset.id)) return;
          onPick(btn.dataset.id);
          // Nur die betroffene Zeile umschreiben – so bleibt die Scroll-
          // Position erhalten und die Auswahl fühlt sich direkt an.
          const ex = Store.getExercise(btn.dataset.id);
          if (ex) btn.outerHTML = rowHtml(ex);
          bind();
        }));
      }
      bind();
      qs('#ex-search').addEventListener('input', (e) => { groupState.picker.query = e.target.value; refresh(); });
    },
  });
}

function openAddExerciseToWorkoutSheet() {
  openExercisePickerSheet({
    title: 'Übung hinzufügen',
    chosenLabel: 'dabei',
    isChosen: (id) => (Store.getActive()?.entries || []).some((e) => e.exerciseId === id),
    onPick: (id) => {
      const w = Store.getActive();
      const ex = Store.getExercise(id);
      if (!w || !ex) return;
      w.entries.push({ exerciseId: ex.id, exerciseName: ex.name, sets: defaultSets(ex, w.id) });
      Store.setActive(w);
      // Das Training im Hintergrund aktualisieren – das Sheet lebt in einem
      // eigenen Container und bleibt dabei offen.
      render();
      dropIn(qs(`.exercise-block[data-ei="${w.entries.length - 1}"]`));
    },
  });
}

// ---- Verlauf-Tab ----
// Simpler Monatskalender: markiert Tage, an denen ein Training abgeschlossen wurde.
function renderCalendar() {
  const { calendarYear: year, calendarMonth: month } = state;
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Woche beginnt Montag
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Tag -> jüngstes Training an diesem Tag (die Liste ist neueste zuerst)
  const workoutDays = new Map();
  Store.getWorkouts().filter((w) => w.finishedAt).forEach((w) => {
    const d = new Date(w.startedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!workoutDays.has(key)) workoutDays.set(key, w.id);
  });

  const monthLabel = first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const weekdayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  let cells = '';
  for (let i = 0; i < startWeekday; i++) cells += '<span class="cal-cell empty"></span>';
  for (let d = 1; d <= daysInMonth; d++) {
    const workoutId = workoutDays.get(`${year}-${month}-${d}`);
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    // Tage mit Training lassen sich antippen und öffnen das Training.
    cells += workoutId
      ? `<button class="cal-cell has-workout ${isToday ? 'today' : ''}" data-action="open-workout" data-id="${workoutId}">${d}</button>`
      : `<span class="cal-cell ${isToday ? 'today' : ''}">${d}</span>`;
  }

  return `
    <div class="card calendar">
      <div class="calendar-header">
        <button class="icon-btn small" data-action="cal-prev" aria-label="Vorheriger Monat">${Icon.chevron}</button>
        <strong>${monthLabel}</strong>
        <button class="icon-btn small" data-action="cal-next" aria-label="Nächster Monat">${Icon.chevron}</button>
      </div>
      <div class="calendar-weekdays">${weekdayLabels.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="calendar-grid">${cells}</div>
    </div>`;
}

function bindCalendarEvents() {
  qs('[data-action="cal-prev"]')?.addEventListener('click', () => shiftCalendar(-1));
  qs('[data-action="cal-next"]')?.addEventListener('click', () => shiftCalendar(1));
  qsa('.calendar [data-action="open-workout"]').forEach((btn) =>
    btn.addEventListener('click', () => openWorkoutDetailSheet(btn.dataset.id)));
}

// Nur die Kalenderkarte austauschen statt der ganzen Seite – das hält die
// Scroll-Position und erlaubt, das neue Raster in Blätterrichtung einzublenden.
function shiftCalendar(direction) {
  const month = state.calendarMonth + direction;
  state.calendarYear += Math.floor(month / 12);
  state.calendarMonth = ((month % 12) + 12) % 12;

  const card = qs('.calendar');
  if (!card) { render(); return; }
  card.outerHTML = renderCalendar();
  bindCalendarEvents();
  const grid = qs('.calendar-grid');
  if (grid && !prefersReducedMotion()) {
    grid.style.setProperty('--enter-x', direction > 0 ? '20px' : '-20px');
    grid.classList.add('item-in');
    grid.addEventListener('animationend', () => grid.classList.remove('item-in'), { once: true });
  }
}

// Nach Monaten gegliedert – bei einem Jahr Training sonst eine endlose Liste
// ohne Anhaltspunkt.
function renderHistoryLog() {
  const workouts = Store.getWorkouts().filter((w) => w.finishedAt);
  if (!workouts.length) return '<p class="empty">Noch keine abgeschlossenen Trainings. Nach dem ersten Training steht es hier – samt Rekorden.</p>';
  const months = [];
  workouts.forEach((w) => {
    const d = new Date(w.startedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (months[months.length - 1]?.key !== key) {
      months.push({ key, label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }), items: [] });
    }
    months[months.length - 1].items.push(w);
  });
  return months.map((m) => `
    <section class="history-month">
      <div class="section-title">${m.label} · ${m.items.length}</div>
      <div class="card list">${m.items.map((w) => {
        const sets = workoutDoneSets(w);
        const prs = w.entries.reduce((n, e) => n + e.sets.filter((s) => s.pr).length, 0);
        const dur = formatDuration(new Date(w.finishedAt) - new Date(w.startedAt));
        return `<button class="list-item selectable" data-action="open-workout" data-id="${w.id}">
          <div class="list-item-main">
            <strong>${escapeHtml(w.routineName || 'Freies Training')}</strong>
            <span class="muted">${formatDate(w.startedAt)} · ${dur} · ${plural(sets, 'Satz', 'Sätze')}</span>
          </div>
          ${prs ? `<span class="pr-count">🏆 ${prs}</span>` : ''}
          ${Icon.chevron}
        </button>`;
      }).join('')}</div>
    </section>`).join('');
}

// Verlauf einer Übung für Chart und Kennzahlen. Mit Zusatzgewicht zählt das
// geschätzte 1RM des besten Satzes je Einheit; bei reinen Körpergewichts-
// übungen (nie mit Gewicht trainiert) die meisten Wiederholungen.
function progressSeries(exerciseId) {
  const sessions = Store.getWorkouts()
    .filter((w) => w.finishedAt)
    .slice().reverse()
    .map((w) => {
      const sets = w.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
      const best = bestSet(sets);
      return best ? { workout: w, sets, best } : null;
    })
    .filter(Boolean);
  const loaded = sessions.some((s) => s.best.weight > 0);
  const points = sessions
    .filter((s) => (loaded ? s.best.weight > 0 : true))
    .map((s) => ({
      value: loaded ? estimate1RM(s.best.weight, s.best.reps) : s.best.reps,
      label: formatDate(s.workout.startedAt),
      date: s.workout.startedAt,
      sets: s.sets,
    }));
  return { loaded, points, sessions };
}

function animateChart(canvas, points) {
  if (prefersReducedMotion() || points.length < 2) { drawLineChart(canvas, points); return; }
  const duration = 620;
  const start = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    drawLineChart(canvas, points, { progress: eased });
    if (t < 1 && document.contains(canvas)) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function workoutDoneSets(workout) {
  return workout.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
}

function openWorkoutDetailSheet(id) {
  const w = Store.getWorkouts().find((x) => x.id === id);
  if (!w) return;
  const unit = unitLabel(Store.getSettings().unit);
  const names = exerciseNames();
  const body = w.entries.map((e) => `
    <div class="detail-exercise">
      <strong>${escapeHtml(entryName(e, names))}</strong>
      <div class="detail-sets">
        ${e.sets.filter((s) => s.done).map((s, i) => `<span class="set-chip ${s.pr ? 'pr' : ''}">${i + 1}. ${formatSet(s, unit)}${s.pr ? ' 🏆' : ''}</span>`).join('') || '<span class="muted small">Keine Sätze</span>'}
      </div>
    </div>`).join('');
  openSheet(escapeHtml(w.routineName || 'Freies Training'), `
    <p class="muted">${formatDateTime(w.startedAt)}</p>
    <div class="card stat-row detail-stats">
      <div><span class="stat-value">${formatDuration(new Date(w.finishedAt) - new Date(w.startedAt))}</span><span class="muted small">Dauer</span></div>
      <div><span class="stat-value">${workoutDoneSets(w)}</span><span class="muted small">Sätze</span></div>
      <div><span class="stat-value">${formatVolume(workoutVolume(w))}</span><span class="muted small">Volumen (${unit})</span></div>
    </div>
    ${body}
  `, {
    footer: `<button class="btn btn-ghost danger full" data-action="delete-workout" data-id="${w.id}">${Icon.trash} Training löschen</button>`,
    onMount: () => {
      qs('[data-action="delete-workout"]').addEventListener('click', () => {
        if (confirm('Dieses Training wirklich löschen?')) {
          Store.deleteWorkout(w.id);
          closeSheet();
          render();
        }
      });
    },
  });
}

// Nach dem Beenden: kurz innehalten, was heute geschafft wurde. Rekorde
// stehen vorne, dazu der Vergleich mit dem letzten Mal desselben Plans und
// der Stand beim Wochenziel – das ist der Moment, in dem sich das Training
// lohnen soll.
function openFinishSummary(id) {
  const w = Store.getWorkouts().find((x) => x.id === id);
  if (!w) return;
  const doneSets = workoutDoneSets(w);
  if (!doneSets) { toast('Training gespeichert'); return; }

  const settings = Store.getSettings();
  const unit = unitLabel(settings.unit);
  const names = exerciseNames();
  const volume = workoutVolume(w);
  const planName = w.routineName || 'Freies Training';
  const prs = w.entries.flatMap((e) => e.sets.filter((s) => s.pr).map((s) => ({ name: entryName(e, names), set: s })));

  const lines = [];
  const previous = w.routineId
    ? Store.getWorkouts().find((x) => x.finishedAt && x.id !== w.id && x.routineId === w.routineId && x.startedAt < w.startedAt)
    : null;
  const prevVolume = previous ? workoutVolume(previous) : 0;
  if (prevVolume > 0 && volume > 0) {
    const pct = Math.round((volume / prevVolume - 1) * 100);
    if (pct > 0) lines.push(`📈 ${pct} % mehr Volumen als beim letzten ${escapeHtml(planName)}`);
    else if (pct < 0) lines.push(`📉 ${-pct} % weniger Volumen als beim letzten ${escapeHtml(planName)}`);
    else lines.push(`➡️ Gleiches Volumen wie beim letzten ${escapeHtml(planName)}`);
  }
  if (settings.motivation) {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const week = Store.getWorkouts().filter((x) => x.finishedAt && new Date(x.startedAt) >= monday).length;
    if (week === settings.weeklyGoal) lines.push(`🎯 Wochenziel erreicht: ${week} von ${settings.weeklyGoal}`);
    else if (week < settings.weeklyGoal) lines.push(`🗓️ ${week} von ${settings.weeklyGoal} Einheiten diese Woche`);
    else lines.push(`🎯 ${week} Einheiten diese Woche – mehr als das Ziel`);
  }

  const headline = prs.length
    ? (prs.length === 1 ? 'Neuer Rekord!' : `${prs.length} neue Rekorde!`)
    : 'Stark gemacht!';
  const openSupps = settings.supplements
    && Store.getActiveSupplements().length
    && !dayStatus(Store.getSupplements(), Store.getSupplementLog(), dayKey()).complete;
  // Direkt nach dem Training ist der beste Moment zum Dehnen – die Muskeln
  // sind warm. Nur anbieten, wenn heute noch keine Mobility lief.
  const offerMobility = settings.mobility && !mobilityDoneToday();

  openSheet('Training gespeichert', `
    <div class="finish-hero">
      <div class="finish-badge ${prs.length ? 'gold' : ''}">${prs.length ? '🏆' : '💪'}</div>
      <h3>${headline}</h3>
      <p class="muted">${escapeHtml(planName)} · ${formatDuration(new Date(w.finishedAt) - new Date(w.startedAt))}</p>
    </div>
    <div class="card stat-row detail-stats">
      <div><span class="stat-value">${doneSets}</span><span class="muted small">Sätze</span></div>
      <div><span class="stat-value">${formatVolume(volume)}</span><span class="muted small">Volumen (${unit})</span></div>
      <div><span class="stat-value">${prs.length}</span><span class="muted small">${prs.length === 1 ? 'Rekord' : 'Rekorde'}</span></div>
    </div>
    ${lines.length ? `<div class="card finish-lines">${lines.map((l) => `<p>${l}</p>`).join('')}</div>` : ''}
    ${prs.length ? `
      <div class="section-title" style="margin-top:14px">Neue Rekorde</div>
      <div class="card list">${prs.map((p) => `
        <div class="list-item">
          <div class="list-item-main"><strong>${escapeHtml(p.name)}</strong><span class="muted">${formatSet(p.set, unit)}</span></div>
          <span class="pr-badge static">PR</span>
        </div>`).join('')}</div>` : ''}
    ${openSupps ? `<button class="list-item selectable finish-supps" data-action="finish-open-supps">
        <div class="list-item-main"><strong>💊 Supplements noch offen</strong><span class="muted">Jetzt abhaken, solange du dran denkst</span></div>
        ${Icon.chevron}
      </button>` : ''}
    ${offerMobility ? `<button class="list-item selectable finish-supps finish-mobility" data-action="finish-mobility">
        <div class="list-item-main"><strong>${Icon.mobility} Mobility dranhängen</strong><span class="muted">Passend zum Training – die Muskeln sind warm, der beste Moment zum Dehnen</span></div>
        ${Icon.play}
      </button>` : ''}
  `, {
    footer: '<button class="btn btn-primary full" data-action="close-sheet">Fertig</button>',
    onMount: () => {
      qs('[data-action="finish-open-supps"]')?.addEventListener('click', () => openSupplementSheet());
      qs('[data-action="finish-mobility"]')?.addEventListener('click', () => {
        closeSheet();
        startMobilityRoutine('after-workout');
      });
      if (!prefersReducedMotion()) {
        qs('.finish-badge')?.classList.add('pop');
      }
    },
  });
}

// ---- Übungslisten: Suche + Gliederung nach Muskelgruppe ----
// Bei über 130 Übungen ist eine flache Liste unbrauchbar. Deshalb überall
// dieselbe Darstellung: oben ein Suchfeld, darunter die Muskelgruppen als
// aufklappbare Abschnitte. Eine aktive Suche klappt alle Treffer automatisch
// auf, damit man nicht erst suchen und dann noch aufklappen muss.
const groupState = {
  library: { query: '', open: new Set() },
  picker: { query: '', open: new Set() },
};

function groupOf(exercise) {
  return MUSCLE_GROUPS.includes(exercise.muscleGroup) ? exercise.muscleGroup : 'Sonstiges';
}

function filterExercises(exercises, query) {
  const q = query.trim().toLowerCase();
  if (!q) return exercises;
  return exercises.filter((ex) => `${ex.name} ${ex.muscleGroup}`.toLowerCase().includes(q));
}

function groupedExercisesHtml(exercises, { query, open, rowHtml, emptyText = 'Keine Übung gefunden.' }) {
  const matches = filterExercises(exercises, query);
  if (!matches.length) return `<p class="empty">${emptyText}</p>`;
  const searching = !!query.trim();

  return MUSCLE_GROUPS.map((group) => {
    const rows = matches
      .filter((ex) => groupOf(ex) === group)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!rows.length) return '';
    const isOpen = searching || open.has(group);
    return `
      <section class="ex-group ${isOpen ? 'open' : ''}" data-group="${group}">
        <button class="ex-group-header" data-action="toggle-group" data-group="${group}">
          <strong>${group}</strong>
          <span class="ex-group-count">${rows.length}</span>
          <span class="ex-group-chevron">${Icon.chevron}</span>
        </button>
        <div class="ex-group-body"><div class="card list">${rows.map(rowHtml).join('')}</div></div>
      </section>`;
  }).join('');
}

function bindGroupToggles(container, openSet) {
  qsa('[data-action="toggle-group"]', container).forEach((btn) => btn.addEventListener('click', () => {
    const section = btn.closest('.ex-group');
    const group = btn.dataset.group;
    const willOpen = !section.classList.contains('open');
    if (willOpen) openSet.add(group); else openSet.delete(group);
    if (willOpen) Sound.open(); else Sound.close();
    animateGroup(section, willOpen);
  }));
}

// Auf-/Zuklappen mit echter Höhen-Animation: die Zielhöhe wird gemessen,
// animiert und danach wieder an das CSS zurückgegeben, damit sich der Inhalt
// frei ändern kann (z.B. wenn ein Treffer dazukommt). `applyState` setzt die
// Klasse, die den Endzustand beschreibt.
function animateHeight(body, willOpen, applyState) {
  if (!body) return;
  const inner = body.firstElementChild;
  const from = body.getBoundingClientRect().height;
  applyState();
  const to = willOpen ? inner.getBoundingClientRect().height : 0;

  if (prefersReducedMotion()) { body.style.height = ''; return; }

  body.style.overflow = 'hidden';
  body.style.height = `${from}px`;
  void body.offsetHeight;
  body.style.transition = 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
  body.style.height = `${to}px`;
  const done = (e) => {
    if (e.target !== body || e.propertyName !== 'height') return;
    body.style.transition = '';
    body.style.height = '';
    body.style.overflow = '';
    body.removeEventListener('transitionend', done);
  };
  body.addEventListener('transitionend', done);
}

function animateGroup(section, open) {
  animateHeight(qs('.ex-group-body', section), open, () => section.classList.toggle('open', open));
}

// ---- Bibliothek-Tab ----
// Letzte Leistung je Übung (bester Satz der jüngsten Einheit) – in einem
// Durchgang über den Verlauf, der neueste Treffer gewinnt.
function lastPerformanceMap() {
  const map = new Map();
  Store.getWorkouts().forEach((w) => {
    if (!w.finishedAt) return;
    w.entries.forEach((e) => {
      if (map.has(e.exerciseId)) return;
      const best = bestSet(e.sets);
      if (best) map.set(e.exerciseId, { best, date: w.startedAt });
    });
  });
  return map;
}

function exerciseRowHtml(ex, last, unit) {
  const info = last.get(ex.id);
  return `
  <button class="list-item selectable" data-action="edit-exercise" data-id="${ex.id}">
    <div class="list-item-main"><strong>${escapeHtml(ex.name)}</strong>
      ${info ? `<span class="muted">${formatSet(info.best, unit)} · ${relativeDay(info.date)}</span>` : ''}</div>
    ${Icon.chevron}
  </button>`;
}

function renderExerciseList() {
  if (!Store.getExercises().length) return '<p class="empty">Noch keine Übungen. Tippe oben rechts auf +.</p>';
  return `
    <input type="search" id="exercise-search" class="text-input search-input" placeholder="Übung suchen…"
      value="${escapeHtml(groupState.library.query)}" />
    <div id="exercise-groups" class="ex-groups">${renderExerciseGroups()}</div>`;
}

function renderExerciseGroups() {
  const last = lastPerformanceMap();
  const unit = unitLabel(Store.getSettings().unit);
  return groupedExercisesHtml(Store.getExercises(), {
    query: groupState.library.query,
    open: groupState.library.open,
    rowHtml: (ex) => exerciseRowHtml(ex, last, unit),
  });
}

// Beste je geschaffte Leistung einer Übung und die letzten Einheiten, damit
// man beim Nachschlagen nicht erst in den Verlauf wechseln muss.
function exerciseBestHtml(exerciseId) {
  const unit = unitLabel(Store.getSettings().unit);
  const sessions = [];
  Store.getWorkouts().filter((w) => w.finishedAt).forEach((w) => {
    const sets = w.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
    const top = bestSet(sets);
    if (top) sessions.push({ date: w.startedAt, sets, top });
  });
  if (!sessions.length) return '';
  const loaded = sessions.some((x) => x.top.weight > 0);
  const best = sessions
    .filter((x) => (loaded ? x.top.weight > 0 : true))
    .reduce((a, b) => {
      const va = loaded ? estimate1RM(a.top.weight, a.top.reps) : a.top.reps;
      const vb = loaded ? estimate1RM(b.top.weight, b.top.reps) : b.top.reps;
      return vb > va ? b : a;
    });
  return `
    <div class="card stat-row detail-stats">
      ${loaded ? `
        <div><span class="stat-value">${formatWeight(best.top.weight, unit)}</span><span class="muted small">Bestleistung (× ${best.top.reps})</span></div>
        <div><span class="stat-value">${formatWeight(Math.round(estimate1RM(best.top.weight, best.top.reps)), unit)}</span><span class="muted small">1RM geschätzt</span></div>`
      : `<div><span class="stat-value">${best.top.reps}</span><span class="muted small">meiste Wdh</span></div>`}
      <div><span class="stat-value">${sessions.length}</span><span class="muted small">Einheiten</span></div>
    </div>
    <p class="muted small">Bestleistung am ${formatDate(best.date)} · zuletzt ${relativeDay(sessions[0].date)}</p>
    ${sessions.length >= 2 ? `
      <div class="card ex-chart">
        <div class="section-title">${loaded ? 'Geschätztes 1RM' : 'Beste Wiederholungen'}</div>
        <canvas id="exercise-chart" class="chart"></canvas>
      </div>` : ''}
    <div class="section-title ex-sec">Letzte Einheiten</div>
    <div class="card ex-history">${sessions.slice(0, 6).map((x) => `
      <div class="ex-history-row"><span class="muted">${formatDate(x.date)}</span><span>${formatSetList(x.sets, unit)}${x.sets.some((y) => y.pr) ? ' 🏆' : ''}</span></div>`).join('')}</div>`;
}

function openExerciseSheet(id) {
  const ex = id ? Store.getExercise(id) : { id: uid(), name: '', muscleGroup: MUSCLE_GROUPS[0], notes: '' };
  const detail = id ? exerciseBestHtml(ex.id) : '';
  openSheet(id ? escapeHtml(ex.name) : 'Neue Übung', `
    ${detail}
    ${detail ? '<div class="section-title ex-sec">Bearbeiten</div>' : ''}
    <label class="field-label">Name</label>
    <input type="text" id="f-name" class="text-input" value="${escapeHtml(ex.name)}" placeholder="z.B. Bankdrücken" ${id ? '' : 'autofocus'} />
    <label class="field-label">Muskelgruppe</label>
    <select id="f-group" class="text-input">
      ${MUSCLE_GROUPS.map((g) => `<option value="${g}" ${g === ex.muscleGroup ? 'selected' : ''}>${g}</option>`).join('')}
    </select>
    <label class="field-label">Notizen (optional)</label>
    <textarea id="f-notes" class="text-input" rows="2" placeholder="z.B. Griffbreite, Setup...">${escapeHtml(ex.notes)}</textarea>
  `, {
    footer: `
      <button class="btn btn-primary full" data-action="save-exercise">Speichern</button>
      ${id ? `<button class="btn btn-ghost danger full" data-action="delete-exercise">${Icon.trash} Löschen</button>` : ''}
    `,
    onMount: () => {
      const canvas = qs('#exercise-chart');
      if (canvas) animateChart(canvas, progressSeries(ex.id).points.slice(-16));
      qs('[data-action="save-exercise"]').addEventListener('click', () => {
        const name = qs('#f-name').value.trim();
        if (!name) { qs('#f-name').focus(); return; }
        Store.saveExercise({ id: ex.id, name, muscleGroup: qs('#f-group').value, notes: qs('#f-notes').value.trim() });
        closeSheet();
        render();
      });
      qs('[data-action="delete-exercise"]')?.addEventListener('click', () => {
        if (confirm('Übung wirklich löschen? Sie wird auch aus Plänen entfernt.')) {
          Store.deleteExercise(ex.id);
          closeSheet();
          render();
        }
      });
    },
  });
}

// Lang drücken + ziehen, um eine Zeile innerhalb ihres Containers neu zu
// sortieren (z.B. Übungen in einem Plan). onReorder(fromIndex, toIndex) wird
// einmalig beim Loslassen aufgerufen, sobald sich die Position geändert hat.
function enableDragReorder(container, onReorder) {
  if (!container) return;
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-drag-handle]');
    if (!handle) return;
    const row = handle.closest('.list-item');
    if (!row) return;
    e.preventDefault();
    const rows = qsa('.list-item', container);
    const startIndex = rows.indexOf(row);
    const startY = e.clientY;
    const rowHeight = row.getBoundingClientRect().height;
    let order = rows.map((_, i) => i);
    let active = false;

    const pressTimer = setTimeout(() => {
      active = true;
      row.classList.add('drag-active');
    }, 160);

    function onMove(ev) {
      const dy = ev.clientY - startY;
      if (!active) {
        if (Math.abs(dy) > 8) teardown();
        return;
      }
      row.style.transform = `translateY(${dy}px) scale(1.02)`;
      const rawSlot = startIndex + Math.round(dy / rowHeight);
      const targetSlot = Math.max(0, Math.min(rows.length - 1, rawSlot));
      const currentSlot = order.indexOf(startIndex);
      if (targetSlot !== currentSlot) {
        order.splice(currentSlot, 1);
        order.splice(targetSlot, 0, startIndex);
        rows.forEach((r, i) => {
          if (i === startIndex) return;
          const slot = order.indexOf(i);
          const offset = (slot - i) * rowHeight;
          r.style.transition = 'transform 0.2s ease';
          r.style.transform = offset ? `translateY(${offset}px)` : '';
        });
      }
    }

    function onUp() {
      clearTimeout(pressTimer);
      teardown();
      if (!active) return;
      row.classList.remove('drag-active');
      rows.forEach((r) => { r.style.transform = ''; r.style.transition = ''; });
      const finalIndex = order.indexOf(startIndex);
      if (finalIndex !== startIndex) onReorder(startIndex, finalIndex);
    }

    function teardown() {
      clearTimeout(pressTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function openRoutineSheet(id) {
  const routine = id ? Store.getRoutine(id) : { id: uid(), name: '', exerciseIds: [], setCounts: {} };
  const draft = { ...routine, exerciseIds: [...routine.exerciseIds], setCounts: { ...(routine.setCounts || {}) } };

  const renderChosen = () => draft.exerciseIds.map((eid, i) => {
    const ex = Store.getExercise(eid);
    const sets = draft.setCounts?.[eid] ?? 2;
    return `<div class="list-item reorder-item">
      <span class="drag-handle" data-drag-handle aria-hidden="true">${Icon.grip}</span>
      <div class="list-item-main"><strong>${ex ? escapeHtml(ex.name) : 'Unbekannt'}</strong></div>
      <span class="set-stepper">
        <button class="step-btn" data-action="set-count" data-id="${eid}" data-delta="-1" aria-label="Weniger Sätze">−</button>
        <span class="step-value">${sets}×</span>
        <button class="step-btn" data-action="set-count" data-id="${eid}" data-delta="1" aria-label="Mehr Sätze">+</button>
      </span>
      <button class="icon-btn small danger" data-action="remove-from-routine" data-i="${i}">${Icon.close}</button>
    </div>`;
  }).join('') || '<p class="empty small">Noch keine Übungen gewählt.</p>';

  function renderEditor() {
    openSheet(id ? 'Plan bearbeiten' : 'Neuer Plan', `
      <label class="field-label">Name</label>
      <input type="text" id="f-rname" class="text-input" value="${escapeHtml(draft.name)}" placeholder="z.B. Push Day" />
      <label class="field-label">Übungen</label>
      <div class="card list" id="chosen-list">${renderChosen()}</div>
      <button class="btn btn-secondary small" data-action="add-to-routine">${Icon.plus} Übung wählen</button>
    `, {
      footer: `
        <button class="btn btn-primary full" data-action="save-routine">Speichern</button>
        ${id ? `<button class="btn btn-ghost danger full" data-action="delete-routine">${Icon.trash} Löschen</button>` : ''}
      `,
      onMount: bindEditor,
    });
  }

  function bindEditor() {
    const chosenList = qs('#chosen-list');
    enableDragReorder(chosenList, (from, to) => {
      const [moved] = draft.exerciseIds.splice(from, 1);
      draft.exerciseIds.splice(to, 0, moved);
      draft.name = qs('#f-rname').value;
      renderEditor();
    });
    qsa('[data-action="remove-from-routine"]').forEach((b) => b.addEventListener('click', () => {
      draft.exerciseIds.splice(+b.dataset.i, 1);
      draft.name = qs('#f-rname').value;
      renderEditor();
    }));
    qsa('[data-action="set-count"]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.id;
      draft.setCounts = draft.setCounts || {};
      const next = Math.max(1, Math.min(12, (draft.setCounts[id] ?? 2) + +b.dataset.delta));
      draft.setCounts[id] = next;
      // Nur die Zahl austauschen – ein Neuaufbau des Sheets wäre hier zu viel.
      b.parentElement.querySelector('.step-value').textContent = `${next}×`;
    }));
    qs('[data-action="add-to-routine"]').addEventListener('click', () => {
      draft.name = qs('#f-rname').value;
      openExercisePicker();
    });
    qs('[data-action="save-routine"]').addEventListener('click', () => {
      const name = qs('#f-rname').value.trim();
      if (!name) { qs('#f-rname').focus(); return; }
      Store.saveRoutine({ id: draft.id, name, exerciseIds: draft.exerciseIds, setCounts: draft.setCounts || {} });
      closeSheet();
      render();
    });
    qs('[data-action="delete-routine"]')?.addEventListener('click', () => {
      if (confirm('Plan wirklich löschen?')) {
        Store.deleteRoutine(draft.id);
        closeSheet();
        render();
      }
    });
  }

  function openExercisePicker() {
    openExercisePickerSheet({
      title: 'Übung wählen',
      chosenLabel: 'gewählt',
      isChosen: (id) => draft.exerciseIds.includes(id),
      onPick: (id) => { draft.exerciseIds.push(id); },
      onDone: renderEditor,
    });
  }

  renderEditor();
}

// ---- Einstellungen-Tab ----
// Gegliedert wie die iOS-Einstellungen: Abschnitte mit Überschrift, darin
// zusammengehörige Zeilen in einer Karte.
function toggleRow(id, title, text, checked) {
  return `
    <div class="setting toggle-row">
      <div>
        <strong>${title}</strong>
        <p class="muted small">${text}</p>
      </div>
      <label class="toggle">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
        <span class="toggle-track"></span>
      </label>
    </div>`;
}

// ---------- Training ----------
// Alles rund ums Krafttraining an einem Ort: wie es gerade läuft (Übersicht),
// die Pläne, die Übungen mit ihren Rekorden und der Fortschritt samt Verlauf.
function renderTraining() {
  if (state.trainingSub === 'plans') return renderPlansPage();
  if (state.trainingSub === 'exercises') return renderExerciseList();
  if (state.trainingSub === 'progress') return renderProgressPage();
  return renderTrainingOverview();
}

function renderTrainingOverview() {
  const settings = Store.getSettings();
  const workouts = Store.getWorkouts();
  const exercises = Store.getExercises();
  const unit = unitLabel(settings.unit);
  if (!workouts.some((w) => w.finishedAt)) {
    return `
      <section class="card g-empty">
        <span class="g-empty-icon">${Icon.dumbbell}</span>
        <strong>Noch kein Training</strong>
        <p class="muted">Nach der ersten Einheit siehst du hier deine Woche, die Sätze pro Muskel und deine Rekorde.</p>
        <button class="btn btn-primary" data-action="goto-sub" data-sub="plans">Zu den Plänen</button>
      </section>`;
  }
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const week = workouts.filter((w) => w.finishedAt && new Date(w.startedAt) >= monday);
  const minutes = week.reduce((n, w) => n + (new Date(w.finishedAt) - new Date(w.startedAt)) / 60000, 0);
  const sets = weeklySets(workouts, exercises);
  const trained = MAP_GROUPS.filter((g) => sets[g] > 0).length;
  const inRange = MAP_GROUPS.filter((g) => sets[g] >= SET_TARGET_MIN).length;
  const values = Object.fromEntries(MAP_GROUPS.map((g) => [g, setShade(sets[g])]));
  const rows = [...MAP_GROUPS].sort((a, b) => sets[b] - sets[a]).map((g) => {
    const n = sets[g];
    const status = !n ? '' : n < SET_TARGET_MIN ? 'low' : n > SET_TARGET_MAX ? 'high' : 'ok';
    return `
      <div class="g-sets-row ${status}">
        <span class="g-sets-name">${g}</span>
        <span class="g-sets-bar"><i style="transform:scaleX(${Math.min(1, n / SET_TARGET_MAX)})"></i><em style="left:${(SET_TARGET_MIN / SET_TARGET_MAX) * 100}%"></em></span>
        <span class="g-sets-n">${n}</span>
      </div>`;
  }).join('');
  const records = recentRecords(30, 5);

  return `
    <section class="card g-stats4">
      <div><b>${week.length}<small>/${settings.weeklyGoal}</small></b><span>Trainings</span></div>
      <div><b>${week.reduce((n, w) => n + workoutDoneSets(w), 0)}</b><span>Sätze</span></div>
      <div><b>${formatVolume(week.reduce((n, w) => n + workoutVolume(w), 0))}</b><span>Volumen (${unit})</span></div>
      <div><b>${Math.round(minutes)}</b><span>Minuten</span></div>
    </section>
    <div class="g-sec"><h2>Sätze pro Muskel</h2><span>letzte 7 Tage</span></div>
    <section class="card g-setsmap">
      <div class="g-setsmap-top">
        <div class="g-setsmap-map">${muscleMap(values)}</div>
        <div class="g-setsmap-sum">
          <b>${inRange}<small>/${MAP_GROUPS.length}</small></b>
          <span>Muskeln im Zielbereich</span>
          <p>${trained ? `${trained} von ${MAP_GROUPS.length} trainiert` : 'Diese Woche noch nichts'}</p>
        </div>
      </div>
      <div class="g-sets-list">${rows}</div>
      <p class="muted small g-sets-note">Etwa ${SET_TARGET_MIN}–${SET_TARGET_MAX} harte Sätze pro Muskel und Woche bringen den meisten Muskelaufbau. Gezählt wird die Hauptmuskelgruppe jeder Übung.</p>
    </section>
    <div class="g-sec"><h2>Standortbestimmung</h2></div>
    ${renderMotivationCard({ compact: true })}
    ${records.length ? `
      <div class="g-sec"><h2>Neue Rekorde</h2><span>30 Tage</span></div>
      <section class="card list">${records.map((r) => `
        <button class="list-item selectable" data-action="open-exercise" data-id="${r.id}">
          <span class="g-pr-icon">🏆</span>
          <div class="list-item-main"><strong>${escapeHtml(r.name)}</strong><span class="muted">${escapeHtml(r.set)} · ${relativeDay(r.date)}</span></div>
          ${Icon.chevron}
        </button>`).join('')}</section>` : ''}`;
}

// Rekord-Sätze der letzten Tage, je Übung der jüngste
function recentRecords(days, limit) {
  const unit = unitLabel(Store.getSettings().unit);
  const from = Date.now() - days * 86400000;
  const names = exerciseNames();
  const seen = new Set();
  const out = [];
  for (const w of Store.getWorkouts()) {
    if (!w.finishedAt || new Date(w.startedAt).getTime() < from) continue;
    for (const e of w.entries) {
      if (seen.has(e.exerciseId)) continue;
      const prs = e.sets.filter((s) => s.done && s.pr);
      if (!prs.length) continue;
      seen.add(e.exerciseId);
      out.push({ id: e.exerciseId, name: entryName(e, names), set: formatSet(bestSet(prs) || prs[0], unit), date: w.startedAt });
    }
  }
  return out.slice(0, limit);
}

function renderPlansPage() {
  const routines = Store.getRoutines();
  const workouts = Store.getWorkouts();
  const exercises = Store.getExercises();
  const names = exerciseNames();
  const next = nextPlanOf(routines, workouts);
  const { lastDone } = planRotation(routines, workouts);
  const ordered = next ? [next, ...routines.filter((r) => r !== next)] : routines;
  const cards = ordered.map((r) => {
    const groups = Object.keys(planGroups(r.exerciseIds, exercises));
    const minutes = planMinutes(r);
    const preview = r.exerciseIds.map((id) => names.get(id)).filter(Boolean).join(' · ');
    return `
      <article class="card g-plan ${r === next ? 'next' : ''}">
        <div class="g-plan-head">
          <div class="g-plan-title">
            ${r === next ? '<span class="g-pill small">Als Nächstes</span>' : ''}
            <h3>${escapeHtml(r.name)}</h3>
            <span class="muted small">${plural(r.exerciseIds.length, 'Übung', 'Übungen')}${minutes ? ` · ca. ${minutes} Min` : ''} · ${lastDoneLabel(lastDone, r)}</span>
          </div>
          <div class="g-plan-map">${muscleMap(planGroups(r.exerciseIds, exercises), { labels: false })}</div>
        </div>
        ${groups.length ? `<div class="g-chips">${groups.map((g) => `<span>${g}</span>`).join('')}</div>` : ''}
        ${preview ? `<p class="g-plan-preview">${escapeHtml(preview)}</p>` : ''}
        <div class="g-plan-actions">
          <button class="btn ${r === next ? 'btn-primary' : 'btn-secondary'} btn-small" data-action="start-routine" data-id="${r.id}" data-nosound>${Icon.play} Starten</button>
          <button class="btn btn-ghost btn-small" data-action="edit-routine" data-id="${r.id}">${Icon.edit} Bearbeiten</button>
        </div>
      </article>`;
  }).join('');
  return `
    ${routines.length ? cards : '<p class="empty">Noch keine Pläne. Tippe oben rechts auf + – oder lass sie dir unten per KI erstellen.</p>'}
    <section class="card list">
      <button class="list-item selectable start-blank-row" data-action="start-blank">
        <span class="start-blank-icon">${Icon.plus}</span>
        <div class="list-item-main"><strong>Leeres Training</strong><span class="muted">Übungen spontan zusammenstellen</span></div>
        ${Icon.chevron}
      </button>
    </section>
    <div class="g-sec"><h2>Pläne per KI</h2></div>
    <section class="card">
      <ol class="howto">
        <li>Prompt kopieren und an eine KI schicken.</li>
        <li>Plan beschreiben – per Sprachnachricht geht das am schnellsten.</li>
        <li>Antwort der KI hier einfügen und einlesen.</li>
      </ol>
      <button class="btn btn-secondary full" data-action="copy-plan-prompt">${Icon.copy} Prompt kopieren</button>
      <textarea id="plan-import-text" class="text-input import-area" rows="3"
        placeholder="Antwort der KI hier einfügen…"></textarea>
      <button class="btn btn-primary full" data-action="parse-plan-import">Pläne einlesen</button>
    </section>`;
}

// Die wichtigsten Übungen: am häufigsten trainiert in den letzten Monaten
function keyLifts(limit = 6) {
  const from = Date.now() - 120 * 86400000;
  const count = new Map();
  Store.getWorkouts().forEach((w) => {
    if (!w.finishedAt || new Date(w.startedAt).getTime() < from) return;
    w.entries.forEach((e) => {
      if (e.sets.some((s) => s.done && s.reps > 0)) count.set(e.exerciseId, (count.get(e.exerciseId) || 0) + 1);
    });
  });
  return [...count.entries()]
    .filter(([id, n]) => n >= 2 && Store.getExercise(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => {
      const ex = Store.getExercise(id);
      const { loaded, points } = progressSeries(id);
      const last = points[points.length - 1];
      const since = Date.now() - 56 * 86400000;
      const base = points.find((p) => new Date(p.date).getTime() >= since) || points[0];
      return { ex, loaded, points: points.slice(-12), value: last?.value || 0, delta: last && base ? last.value - base.value : 0, baseDate: base?.date };
    });
}

function sparkline(points) {
  if (points.length < 2) return '<svg class="g-spark" viewBox="0 0 100 34"></svg>';
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const xy = vals.map((v, i) => [(i / (vals.length - 1)) * 96 + 2, 30 - ((v - min) / span) * 26]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = xy[xy.length - 1];
  return `<svg class="g-spark" viewBox="0 0 100 34" preserveAspectRatio="none">
    <polygon points="2,34 ${line} 98,34" class="area"/><polyline points="${line}" class="line"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6" class="dot"/></svg>`;
}

function renderProgressPage() {
  const unit = unitLabel(Store.getSettings().unit);
  const lifts = keyLifts();
  const liftCards = lifts.map((l) => {
    const d = Math.round(l.delta * 10) / 10;
    const deltaTxt = !d ? '±0' : `${d > 0 ? '+' : '−'}${l.loaded ? formatNumber(Math.abs(d)) : Math.abs(d)}`;
    return `
      <button class="card g-lift" data-action="open-exercise" data-id="${l.ex.id}">
        <span class="g-lift-name">${escapeHtml(l.ex.name)}</span>
        <span class="g-lift-value">${l.loaded ? formatNumber(Math.round(l.value)) : l.value}<small>${l.loaded ? unit : 'Wdh'}</small></span>
        <span class="g-lift-delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${deltaTxt} <span>in 8 Wo.</span></span>
        ${sparkline(l.points)}
      </button>`;
  }).join('');
  return `
    ${lifts.length ? `
      <div class="g-sec"><h2>Kraftentwicklung</h2><span>geschätztes 1RM</span></div>
      <div class="g-lifts">${liftCards}</div>` : ''}
    <div class="g-sec"><h2>Verlauf</h2></div>
    ${renderCalendar()}
    ${renderHistoryLog()}`;
}

function bindTrainingEvents() {
  const view = qs('.view');
  qsa('[data-action="goto-sub"]', view).forEach((b) => b.addEventListener('click', () => { state.trainingSub = b.dataset.sub; render(); }));
  qsa('[data-action="open-exercise"]', view).forEach((b) => b.addEventListener('click', () => openExerciseSheet(b.dataset.id)));
  if (state.trainingSub === 'plans') {
    bindStarters(view);
    qsa('[data-action="edit-routine"]', view).forEach((b) => b.addEventListener('click', () => openRoutineSheet(b.dataset.id)));
    bindPlanImportEvents();
  }
  if (state.trainingSub === 'exercises') bindExerciseListEvents();
  if (state.trainingSub === 'progress') {
    qsa('.list-item[data-action="open-workout"]', view).forEach((btn) => btn.addEventListener('click', () => openWorkoutDetailSheet(btn.dataset.id)));
    bindCalendarEvents();
  }
}

function bindExerciseListEvents() {
  const groups = qs('#exercise-groups');
  if (!groups) return;
  const bindRows = () => {
    bindGroupToggles(groups, groupState.library.open);
    qsa('[data-action="edit-exercise"]', groups).forEach((btn) =>
      btn.addEventListener('click', () => openExerciseSheet(btn.dataset.id)));
  };
  bindRows();
  // Nur die Liste neu aufbauen statt render(): sonst verlöre das Suchfeld
  // bei jedem Tastendruck den Fokus.
  qs('#exercise-search')?.addEventListener('input', (e) => {
    groupState.library.query = e.target.value;
    groups.innerHTML = renderExerciseGroups();
    bindRows();
  });
}

// ---------- Profil ----------
// Alles über dich: Level und Serien, Challenges, Supplements, Einstellungen.
function renderProfile() {
  if (state.profilePage) return renderProfilePage(state.profilePage);
  const settings = Store.getSettings();
  const m = buildMotivation({
    workouts: Store.getWorkouts(),
    exercises: Store.getExercises(),
    goal: settings.weeklyGoal,
    unit: unitLabel(settings.unit),
    stepFor: (ex) => overloadStep(ex.muscleGroup, settings.unit),
  });
  const mob = mobilityWeekStats();
  const suppStreak = settings.supplements && Store.getActiveSupplements().length
    ? streak(Store.getSupplements(), Store.getSupplementLog(), dayKey()) : null;
  const series = `
    <section class="g-series">
      <div class="g-serie"><span class="g-serie-icon gym">${Icon.dumbbell}</span><b>${m.streak}</b><span>${m.streak === 1 ? 'Woche' : 'Wochen'} Training</span></div>
      <div class="g-serie"><span class="g-serie-icon mob">${Icon.leaf}</span><b>${mob.streak}</b><span>${mob.streak === 1 ? 'Woche' : 'Wochen'} Mobility</span></div>
      ${suppStreak !== null ? `<div class="g-serie"><span class="g-serie-icon supp">💊</span><b>${suppStreak}</b><span>${suppStreak === 1 ? 'Tag' : 'Tage'} Supplements</span></div>` : ''}
    </section>`;
  const lastBackup = settings.lastBackupAt ? `Zuletzt gesichert ${relativeDay(settings.lastBackupAt)}` : 'Noch nie gesichert';
  const row = (page, icon, title, sub) => `
    <button class="list-item selectable g-set-row" data-action="profile-page" data-page="${page}">
      <span class="g-set-icon">${icon}</span>
      <div class="list-item-main"><strong>${title}</strong><span class="muted">${sub}</span></div>
      ${Icon.chevron}
    </button>`;
  return `
    ${renderChallenges({ afterHero: series })}
    <section>
      <div class="section-title">Supplements</div>
      <div class="card list">
        <div class="list-item">
          <div class="list-item-main"><strong>Auf „Heute“ abhaken</strong><span class="muted">Mit Serie und Kalender-Erinnerung</span></div>
          <label class="toggle"><input type="checkbox" id="toggle-supplements" ${settings.supplements ? 'checked' : ''} /><span class="toggle-track"></span></label>
        </div>
        ${settings.supplements ? `
          <button class="list-item selectable" data-action="open-supplements">
            <div class="list-item-main"><strong>Supplements verwalten</strong><span class="muted">${plural(Store.getActiveSupplements().length, 'aktives Supplement', 'aktive Supplements')} · Verlauf & Erinnerung</span></div>
            ${Icon.chevron}
          </button>` : ''}
      </div>
    </section>
    <section>
      <div class="section-title">Einstellungen</div>
      <div class="card list">
        ${row('training', Icon.dumbbell, 'Training', `${unitLabel(settings.unit)} · Pause ${settings.restSeconds ? `${settings.restSeconds} s` : 'aus'} · Wochenziel ${settings.weeklyGoal}×`)}
        ${row('look', Icon.volumeHigh, 'Darstellung & Töne', `Akzentfarbe · Töne ${settings.sound ? 'an' : 'aus'}`)}
        ${row('data', Icon.share, 'Daten & Sicherung', lastBackup)}
      </div>
    </section>
    <p class="empty small">Alle Daten bleiben ausschließlich lokal auf diesem Gerät gespeichert.</p>`;
}

function renderProfilePage(page) {
  const settings = Store.getSettings();
  if (page === 'training') {
    return `
      <section class="card settings-card">
        <div class="setting">
          <div class="setting-head"><strong>Einheit</strong></div>
          <div class="segmented">
            <button class="${settings.unit === 'kg' ? 'active' : ''}" data-action="set-unit" data-unit="kg">kg</button>
            <button class="${settings.unit === 'lb' ? 'active' : ''}" data-action="set-unit" data-unit="lb">lb</button>
            <span class="segmented-thumb" aria-hidden="true"></span>
          </div>
          <p class="muted small">Ändert nur die Anzeige-Einheit für neue Einträge, bestehende Werte werden nicht umgerechnet.</p>
        </div>
        <div class="setting">
          <div class="setting-head"><strong>Wochenziel</strong></div>
          <div class="chip-row">
            ${WEEKLY_GOALS.map((g) => `<button class="chip ${settings.weeklyGoal === g ? 'active' : ''}" data-action="set-goal" data-goal="${g}">${g}×</button>`).join('')}
          </div>
          <p class="muted small">Trainings pro Woche – für „Deine Woche“, die Serie und die Standortbestimmung.</p>
        </div>
        <div class="setting">
          <div class="setting-head"><strong>Pause zwischen Sätzen</strong></div>
          <div class="chip-row">
            ${REST_OPTIONS.map((sec) => `
              <button class="chip ${settings.restSeconds === sec ? 'active' : ''}" data-action="set-rest" data-seconds="${sec}">
                ${sec === 0 ? 'Aus' : `${sec}s`}
              </button>`).join('')}
          </div>
          <p class="muted small">Startet automatisch, sobald du einen Satz abhakst.</p>
        </div>
        ${toggleRow('toggle-overload', 'Gewichts-Empfehlung', 'Schlägt mehr Gewicht vor, sobald du eine Übung in den letzten 2 Einheiten bei gleichem Gewicht mit durchweg 10+ Wiederholungen geschafft hast.', settings.progressiveOverload)}
        ${toggleRow('toggle-awake', 'Bildschirm anlassen', 'Während des Trainings sperrt sich das iPhone nicht – kein Entsperren zwischen zwei Sätzen.', settings.keepAwake)}
      </section>`;
  }
  if (page === 'look') {
    return `
      <section class="card settings-card">
        <div class="setting">
          <div class="setting-head"><strong>Akzentfarbe</strong></div>
          <div class="swatch-row">
            ${ACCENT_COLORS.map((c) => `
              <button class="swatch ${settings.accent === c.value ? 'active' : ''}" data-action="set-accent" data-color="${c.value}"
                style="background:${c.value}" aria-label="${c.label}">${settings.accent === c.value ? Icon.check : ''}</button>
            `).join('')}
          </div>
          <p class="muted small">Die Farbe für Training. Mobility bleibt grün.</p>
        </div>
        <div class="setting">
          ${toggleRow('toggle-sound', 'Töne', 'Kurze Rückmeldung beim Abhaken, bei Rekorden und am Ende der Pause.', settings.sound).replace('class="setting toggle-row"', 'class="toggle-row"')}
          ${settings.sound ? `
            <div class="volume-row">
              ${Icon.volumeLow}
              <input type="range" id="sound-volume" class="slider" min="0" max="100" step="5"
                value="${Math.round(settings.soundVolume * 100)}" aria-label="Lautstärke" />
              ${Icon.volumeHigh}
            </div>
            <div class="setting-sub">
              <div class="setting-head"><span class="muted small">Klangfarbe</span></div>
              <div class="chip-row">
                ${SOUND_STYLES.map((st) => `
                  <button class="chip ${settings.soundStyle === st.id ? 'active' : ''}" data-action="set-sound-style" data-style="${st.id}">${st.label}</button>
                `).join('')}
              </div>
              <p class="muted small">Zum Anhören antippen. Der Stummschalter des iPhones hat Vorrang.</p>
            </div>` : ''}
        </div>
      </section>`;
  }
  const lastBackup = settings.lastBackupAt ? `Zuletzt gesichert ${relativeDay(settings.lastBackupAt)}` : 'Noch nie gesichert';
  return `
    <section class="card list">
      <button class="list-item selectable" data-action="export-data">
        <div class="list-item-main"><strong>Sicherung erstellen</strong><span class="muted">${lastBackup}</span></div>
        ${Icon.share}
      </button>
      <label class="list-item selectable" for="import-file">
        <div class="list-item-main"><strong>Sicherung wiederherstellen</strong><span class="muted">Überschreibt alle Daten auf diesem Gerät</span></div>
        ${Icon.upload}
      </label>
      <input type="file" id="import-file" accept=".json,application/json" hidden />
    </section>
    <p class="muted small g-note">Die Sicherung enthält alles: Training, Mobility, Fight, Challenges und Supplements.</p>
    <section class="card list">
      <button class="list-item selectable danger" data-action="wipe-data">
        <div class="list-item-main"><strong>Alle Daten löschen</strong><span class="muted">Setzt die App zurück</span></div>
        ${Icon.trash}
      </button>
    </section>
    <p class="empty small">Alle Daten bleiben ausschließlich lokal auf diesem Gerät gespeichert.</p>`;
}

function bindProfileEvents() {
  const view = qs('.view');
  if (!state.profilePage) {
    bindChallenges(view);
    qsa('[data-action="profile-page"]', view).forEach((b) => b.addEventListener('click', () => {
      state.profilePage = b.dataset.page;
      render();
    }));
    qs('[data-action="open-supplements"]', view)?.addEventListener('click', () => openSupplementSheet());
    qs('#toggle-supplements', view)?.addEventListener('change', (e) => {
      Store.saveSettings({ ...Store.getSettings(), supplements: e.target.checked });
      render();
    });
    return;
  }
  bindSettingsEvents();
}

// ---- Pläne per KI importieren ----
// Die KI bekommt die eigene Übungsliste mit, damit sie exakt passende Namen
// verwendet. Beim Einlesen wird jede Zeile gegen die Bibliothek aufgelöst;
// was fehlt, wird als neue Übung angelegt – aber erst nach einer Vorschau,
// damit nichts unbemerkt in der Bibliothek landet.
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
    const existing = Store.getRoutines().find(
      (r) => r.name.trim().toLowerCase() === plan.name.trim().toLowerCase(),
    );
    return { name: plan.name, items, replaces: existing || null };
  });

  return { plans, newExercises: [...created.values()], warnings: parsed.warnings };
}

function applyImportedPlans(resolved) {
  resolved.newExercises.forEach((ex) => Store.saveExercise(ex));
  resolved.plans.forEach((plan) => {
    const setCounts = {};
    plan.items.forEach((item) => { setCounts[item.exercise.id] = item.sets; });
    Store.saveRoutine({
      id: plan.replaces ? plan.replaces.id : uid(),
      name: plan.name,
      exerciseIds: plan.items.map((i) => i.exercise.id),
      setCounts,
    });
  });
}

function openImportPreview(text) {
  const parsed = parsePlanText(text);
  if (!parsed.plans.length) {
    openSheet('Nichts gefunden', `
      <p class="muted">In dem Text steckt kein Plan im erwarteten Format. Erwartet wird:</p>
      <pre class="diag">PLAN: Push
- Bankdrücken (Langhantel) | 3
- Seitheben (Kurzhantel) | 4</pre>
      ${parsed.warnings.map((w) => `<p class="muted small">${escapeHtml(w)}</p>`).join('')}
      <p class="muted small">Tipp: Den Prompt oben kopieren – damit antwortet die KI im richtigen Format.</p>`);
    return;
  }

  const resolved = resolveImportedPlans(parsed);
  const body = resolved.plans.map((plan) => `
    <div class="import-plan">
      <strong>${escapeHtml(plan.name)}</strong>
      ${plan.replaces ? '<span class="pill">ersetzt vorhandenen</span>' : ''}
      <div class="detail-sets">
        ${plan.items.map((i) => `<span class="set-chip ${i.isNew ? 'pr' : ''}">${escapeHtml(i.exercise.name)} · ${i.sets}×${i.isNew ? ' neu' : ''}</span>`).join('')}
      </div>
    </div>`).join('');

  const planCount = resolved.plans.length;
  const newCount = resolved.newExercises.length;
  openSheet('Import prüfen', `
    ${body}
    ${newCount ? `<p class="muted small">${newCount === 1
      ? 'Eine Übung ist noch nicht in der Bibliothek und wird angelegt.'
      : `${newCount} Übungen sind noch nicht in der Bibliothek und werden angelegt.`}</p>` : ''}
    ${resolved.warnings.map((w) => `<p class="muted small">⚠️ ${escapeHtml(w)}</p>`).join('')}
  `, {
    footer: `<button class="btn btn-primary full" data-action="confirm-import">
      ${planCount === 1 ? 'Plan übernehmen' : `${planCount} Pläne übernehmen`}</button>`,
    onMount: () => {
      qs('[data-action="confirm-import"]').addEventListener('click', () => {
        applyImportedPlans(resolved);
        closeSheet();
        const area = qs('#plan-import-text');
        if (area) area.value = '';
        state.tab = 'training';
        state.trainingSub = 'plans';
        go(render);
        toast(planCount === 1 ? 'Plan importiert' : `${planCount} Pläne importiert`);
      });
    },
  });
}

function bindPlanImportEvents() {
  qs('[data-action="copy-plan-prompt"]')?.addEventListener('click', async (e) => {
    const prompt = buildPlanPrompt(Store.getExercises(), MUSCLE_GROUPS);
    try {
      await navigator.clipboard.writeText(prompt);
      toast('Prompt kopiert');
    } catch {
      // Ohne Zwischenablage-Rechte: Text zum manuellen Kopieren anbieten.
      const area = qs('#plan-import-text');
      if (area) { area.value = prompt; area.focus(); area.select(); }
      toast('Bitte von Hand kopieren');
    }
    e.currentTarget.blur();
  });

  qs('[data-action="parse-plan-import"]')?.addEventListener('click', () => {
    const text = qs('#plan-import-text')?.value.trim();
    if (!text) { qs('#plan-import-text')?.focus(); return; }
    openImportPreview(text);
  });

}

// Sicherung über das Teilen-Menü: in der installierten App führt ein
// normaler Download ins Leere (oder öffnet die Datei ohne Weg zurück). Über
// "Teilen" lässt sie sich in Dateien, iCloud Drive oder per AirDrop ablegen.
async function exportBackup() {
  const json = JSON.stringify(Store.exportAll(), null, 2);
  const name = `gym-sicherung-${dayKey()}.json`;
  const markDone = () => {
    Store.saveSettings({ ...Store.getSettings(), lastBackupAt: new Date().toISOString() });
    if (state.tab === 'profile') render();
  };
  const file = typeof File === 'function' ? new File([json], name, { type: 'application/json' }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Gym-Sicherung' });
      markDone();
      toast('Sicherung erstellt');
    } catch (err) {
      if (err?.name !== 'AbortError') toast('Teilen nicht möglich');
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markDone();
}

// Einstellungen, die außerhalb des Renderns wirken (Farbe, Töne), nach einem
// Import oder Zurücksetzen neu anwenden.
function applySettings() {
  const settings = Store.getSettings();
  applyMode();
  setSoundEnabled(settings.sound);
  setSoundVolume(settings.soundVolume);
  setSoundStyle(settings.soundStyle);
}

function bindSettingsEvents() {
  bindPlanImportEvents();
  qsa('[data-action="set-unit"]').forEach((btn) => btn.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), unit: btn.dataset.unit });
    render();
  }));
  qsa('[data-action="set-rest"]').forEach((btn) => btn.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), restSeconds: +btn.dataset.seconds });
    qsa('[data-action="set-rest"]').forEach((b) => b.classList.toggle('active', b === btn));
  }));
  qs('#toggle-sound')?.addEventListener('change', (e) => {
    Store.saveSettings({ ...Store.getSettings(), sound: e.target.checked });
    setSoundEnabled(e.target.checked);
    if (e.target.checked) Sound.setDone(); // einmal vorhören
    render(); // blendet Lautstärke und Klangfarbe ein bzw. aus
  });
  qs('#sound-volume')?.addEventListener('input', (e) => {
    setSoundVolume(+e.target.value / 100);
  });
  qs('#sound-volume')?.addEventListener('change', (e) => {
    const value = +e.target.value / 100;
    Store.saveSettings({ ...Store.getSettings(), soundVolume: value });
    setSoundVolume(value);
    Sound.setDone(); // neue Lautstärke sofort hörbar machen
  });
  qsa('[data-action="set-sound-style"]').forEach((btn) => btn.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), soundStyle: btn.dataset.style });
    setSoundStyle(btn.dataset.style);
    qsa('[data-action="set-sound-style"]').forEach((b) => b.classList.toggle('active', b === btn));
    Sound.setDone();
  }));
  qs('#toggle-supplements')?.addEventListener('change', (e) => {
    Store.saveSettings({ ...Store.getSettings(), supplements: e.target.checked });
  });
  qs('#toggle-mobility')?.addEventListener('change', (e) => {
    Store.saveSettings({ ...Store.getSettings(), mobility: e.target.checked });
  });
  qs('#toggle-motivation')?.addEventListener('change', (e) => {
    Store.saveSettings({ ...Store.getSettings(), motivation: e.target.checked });
    render(); // blendet das Wochenziel direkt ein oder aus
  });
  qsa('[data-action="set-goal"]').forEach((btn) => btn.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), weeklyGoal: +btn.dataset.goal });
    qsa('[data-action="set-goal"]').forEach((b) => b.classList.toggle('active', b === btn));
  }));
  qs('#toggle-overload')?.addEventListener('change', (e) => {
    Store.saveSettings({ ...Store.getSettings(), progressiveOverload: e.target.checked });
  });
  qs('#toggle-awake')?.addEventListener('change', (e) => {
    Store.saveSettings({ ...Store.getSettings(), keepAwake: e.target.checked });
  });
  qsa('[data-action="set-accent"]').forEach((btn) => btn.addEventListener('click', () => {
    Store.saveSettings({ ...Store.getSettings(), accent: btn.dataset.color });
    applyAccent();
    render();
  }));
  qs('[data-action="export-data"]')?.addEventListener('click', exportBackup);
  qs('#import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      alert('Die Datei konnte nicht gelesen werden – ist es eine Gym-Sicherung (.json)?');
      return;
    }
    const problem = validateBackup(data);
    if (problem) { alert(problem); return; }
    const count = Array.isArray(data.workouts) ? data.workouts.length : 0;
    const when = data.exportedAt ? ` vom ${formatDateTime(data.exportedAt)}` : '';
    if (!confirm(`Sicherung${when} mit ${plural(count, 'Training', 'Trainings')} wiederherstellen? Alle aktuellen Daten werden ersetzt.`)) return;
    Store.importAll(data);
    applySettings();
    toast('Sicherung wiederhergestellt');
    go(render);
  });
  qs('[data-action="wipe-data"]')?.addEventListener('click', () => {
    if (confirm('Wirklich ALLE Daten unwiderruflich löschen?')) {
      Store.wipeAll();
      applySettings();
      go(render);
      toast('Zurückgesetzt');
    }
  });
}

// ---- Globale Events ----
function bindGlobalEvents() {
  qsa('[data-gtab]').forEach((btn) => btn.addEventListener('click', () => goTab(btn.dataset.gtab)));
  qs('.g-dock [data-action="open-start"]')?.addEventListener('click', () => { Sound.start(); openStartSheet(); });
  qs('[data-action="live-resume"]')?.addEventListener('click', resumeWorkout);
  qs('.g-top [data-action="add-exercise"]')?.addEventListener('click', () => openExerciseSheet(null));
  qs('.g-top [data-action="add-routine"]')?.addEventListener('click', () => openRoutineSheet(null));
  qs('[data-action="mode-fight"]')?.addEventListener('click', () => switchMode('fight'));
  qs('.g-top [data-action="goto-profile"]')?.addEventListener('click', () => goTab('profile'));
  qs('[data-action="mobility-settings"]')?.addEventListener('click', openMobilitySettings);
  qs('[data-action="profile-back"]')?.addEventListener('click', () => { state.profilePage = null; render(); });
  [[qs('#g-seg-training'), trainingSwipe], [qs('#g-seg-mobility'), mobilitySwipe]].forEach(([seg, swipe]) => {
    if (!seg) return;
    qsa('[data-seg]', seg).forEach((b) => b.addEventListener('click', () => swipe.selectWithSlide(b.dataset.seg)));
    seg.addEventListener('pointerdown', swipe.onPointerDown);
  });
}

// ---- Fight-Modus (Kickboxen & Ausdauer) ----
// Eigener Teil der App mit eigener Startseite, Navigation und Optik. Das
// Modul wird erst beim ersten Wechsel geladen, damit der Gym-Teil so schnell
// startet wie bisher.
let fightModule = null;
let fightLoading = null;
function loadFight() {
  if (!fightLoading) {
    fightLoading = import('./fight/index.js').then((m) => {
      m.initFight({
        openSheet, closeSheet, dismissSheet, toast, render, go, prefersReducedMotion, dropIn, collapseAway,
        enableDragReorder, switchMode, morphReplace, elementFrom,
        renderSupplementCard, bindSupplementCard, renderMobilityCard, bindMobilityCard, startMobilityRoutine,
        planRotation, exerciseNames, openGymWorkout: () => { state.workoutOpen = true; },
      });
      fightModule = m;
      return m;
    }).catch((err) => { fightLoading = null; throw err; });
  }
  return fightLoading;
}

// Wechsel mit Blende: ein schräges Band wischt über den Bildschirm, darunter
// wird umgebaut. Beim Gym-Wechsel klappern Hantelscheiben, beim Fight-Wechsel
// schlägt der Gong.
let modeSwitching = false;
async function switchMode(target) {
  if (modeSwitching || Store.getSettings().mode === target) return;
  modeSwitching = true;
  const toFight = target === 'fight';
  const loading = toFight ? loadFight() : null;
  loading?.catch(() => {});
  if (toFight) Sound.gong(); else Sound.plates();
  const reduced = prefersReducedMotion();
  const wipe = document.createElement('div');
  wipe.className = `mode-wipe ${toFight ? 'to-fight' : 'to-gym'} ${reduced ? 'reduced' : ''}`;
  wipe.innerHTML = `<div class="mode-wipe-band"><span>${toFight ? 'Fight' : 'Gym'}</span></div>`;
  document.body.appendChild(wipe);
  requestAnimationFrame(() => wipe.classList.add('cover'));
  await new Promise((r) => setTimeout(r, reduced ? 120 : 430));
  try {
    if (loading) await loading;
    Store.saveSettings({ ...Store.getSettings(), mode: target });
  } catch {
    toast('Fight-Modus konnte nicht geladen werden');
  }
  applyMode();
  closeSheet();
  if (!toFight) fightModule?.leaveFight?.();
  state.workoutOpen = false;
  lastRenderKey = null;
  lastScreenPosition = null;
  render();
  wipe.classList.add('reveal');
  setTimeout(() => { wipe.remove(); modeSwitching = false; }, reduced ? 200 : 700);
}

// ---- Wischbare Auswahl (Tabbar + Segmented Controls): das Pill-/Thumb-Element
// wird wie ein physisches Objekt gegriffen, folgt 1:1 dem Finger, rastet beim
// Loslassen per Feder-Simulation (inkl. Schwung) ein – UND gleitet bei einem
// simplen Klick genau so weich zur Zielposition, statt instantan zu springen
// (da render() den ganzen Container neu aufbaut und CSS-Transitions dabei
// nicht greifen würden). Eine Fabrik, damit Tabbar und beide Segmented
// Controls exakt dasselbe Verhalten teilen, ohne Code zu duplizieren.
function rubberBand(overshoot, dim = 90) {
  return (overshoot * dim) / (dim + Math.abs(overshoot));
}

function clampWithRubberBand(raw, min, max) {
  if (raw < min) return min - rubberBand(min - raw);
  if (raw > max) return max + rubberBand(raw - max);
  return raw;
}

function createSwipeSelector({
  barSelector, indicatorSelector, handleSelector, ids, getActive, setActive, onChange, onMove, dragClass,
}) {
  let drag = null; // { startX, startLeft, minLeft, maxLeft, slotWidth, barLeft, barWidth, lastX, lastT, velocity, currentLeft }
  let springFrame = null;
  let liveLeft = null; // Ist-Position während Drag/Feder, für nahtloses erneutes Greifen

  function clampIdx(i) { return Math.max(0, Math.min(ids.length - 1, i)); }

  function geometry() {
    const bar = qs(barSelector);
    const indicator = qs(indicatorSelector);
    if (!bar || !indicator) return null;
    const barRect = bar.getBoundingClientRect();
    const indRect = indicator.getBoundingClientRect();
    const minLeft = indRect.width > 0 ? indicator.offsetLeft : 6;
    return {
      bar, indicator,
      slotWidth: indRect.width,
      minLeft,
      maxLeft: bar.clientWidth - minLeft - indRect.width,
      barLeft: barRect.left,
      barWidth: barRect.width,
    };
  }

  function cancelSpring() {
    if (springFrame) { cancelAnimationFrame(springFrame); springFrame = null; }
  }

  // Gedämpfte Federsimulation (Masse-Feder-Dämpfer): weiches, dynamisches
  // Eingleiten statt abruptem Stopp, ähnlich UIKit-Spring-Animationen.
  function springTo(el, from, to, initialVelocityPxPerSec, baseLeft) {
    cancelSpring();
    const stiffness = 340;
    const damping = 30;
    let pos = from;
    let vel = initialVelocityPxPerSec;
    let lastT = performance.now();
    function frame(now) {
      const dt = Math.min((now - lastT) / 1000, 1 / 30);
      lastT = now;
      const displacement = pos - to;
      const accel = (-stiffness * displacement - damping * vel);
      vel += accel * dt;
      pos += vel * dt;
      if (Math.abs(pos - to) < 0.4 && Math.abs(vel) < 15) {
        el.style.transition = '';
        el.style.transform = '';
        springFrame = null;
        liveLeft = null;
        return;
      }
      el.style.transform = `translateX(${pos}px)`;
      liveLeft = baseLeft + pos;
      springFrame = requestAnimationFrame(frame);
    }
    springFrame = requestAnimationFrame(frame);
  }

  function onPointerDown(e) {
    if (!e.target.closest(handleSelector)) return;
    const geo = geometry();
    if (!geo) return;
    cancelSpring();
    const idx = Math.max(0, ids.indexOf(getActive()));
    const currentLeft = liveLeft !== null ? liveLeft : geo.minLeft + idx * geo.slotWidth;
    drag = {
      startX: e.clientX,
      startLeft: currentLeft,
      minLeft: geo.minLeft,
      maxLeft: geo.maxLeft,
      slotWidth: geo.slotWidth,
      barLeft: geo.barLeft,
      barWidth: geo.barWidth,
      lastX: e.clientX,
      lastT: performance.now(),
      velocity: 0,
      currentLeft,
    };
    geo.indicator.style.transition = 'none';
    if (dragClass) geo.bar.classList.add(dragClass);
    isSwipeDragging = true;
    activeSwipeSelector = { onPointerMove, onPointerUp };
    onMove?.((e.clientX - geo.barLeft) / geo.barWidth, 0);
  }

  function onPointerMove(e) {
    if (!drag) return;
    const now = performance.now();
    const dt = now - drag.lastT;
    // dt-Mindestwert verhindert, dass sehr dicht aufeinanderfolgende Events
    // die Geschwindigkeit künstlich in die Höhe treiben.
    if (dt > 4) {
      const instVel = Math.max(-2.5, Math.min(2.5, (e.clientX - drag.lastX) / dt));
      drag.velocity = drag.velocity * 0.72 + instVel * 0.28;
      drag.lastX = e.clientX;
      drag.lastT = now;
    }

    const rawLeft = drag.startLeft + (e.clientX - drag.startX);
    const left = clampWithRubberBand(rawLeft, drag.minLeft, drag.maxLeft);
    drag.currentLeft = left;
    liveLeft = left;

    const indicator = qs(indicatorSelector);
    if (indicator) indicator.style.transform = `translateX(${left - drag.minLeft}px)`;

    const idx = clampIdx(Math.round((left - drag.minLeft) / drag.slotWidth));
    const id = ids[idx];
    if (id !== getActive()) {
      setActive(id);
      onChange();
      const fresh = qs(indicatorSelector);
      if (fresh) {
        fresh.style.transition = 'none';
        fresh.style.transform = `translateX(${left - drag.minLeft}px)`;
      }
      if (dragClass) qs(barSelector)?.classList.add(dragClass);
    }
    onMove?.((e.clientX - drag.barLeft) / drag.barWidth, drag.velocity);
  }

  function onPointerUp() {
    if (!drag) return;
    const { currentLeft, minLeft, slotWidth, velocity } = drag;
    drag = null;
    isSwipeDragging = false;
    activeSwipeSelector = null;

    // Schwung der Geste einbeziehen: nur ein wirklich schneller Flick (oberhalb
    // einer Totzone) darf die nächste Option "mitnehmen", wenn die Loslass-
    // Position sie knapp verfehlt. Eine langsame, kontrollierte Bewegung
    // entscheidet rein über ihre Endposition.
    const velPxPerSec = velocity * 1000;
    const deadZone = 320;
    const fullBiasAt = 1100;
    const excess = Math.max(0, Math.abs(velPxPerSec) - deadZone);
    const bias = Math.sign(velPxPerSec) * Math.min(1, excess / (fullBiasAt - deadZone));
    const idx = clampIdx(Math.round((currentLeft - minLeft) / slotWidth + bias));
    const targetId = ids[idx];
    const targetLeft = minLeft + idx * slotWidth;

    if (targetId !== getActive()) {
      setActive(targetId);
      onChange();
    }
    const indicator = qs(indicatorSelector);
    if (indicator) {
      indicator.style.transition = 'none';
      indicator.style.transform = `translateX(${currentLeft - minLeft}px)`;
      springTo(indicator, currentLeft - minLeft, targetLeft - minLeft, velocity * 1000, minLeft);
    }
    const bar = qs(barSelector);
    if (bar && dragClass) bar.classList.remove(dragClass);
    onMove?.(null);
  }

  // Für Klicks: dieselbe Feder-Physik wie beim Loslassen einer Ziehgeste,
  // nur ohne Anfangsschwung – damit ein Tap genauso "clean rüberswiped"
  // statt instantan zu springen (render() baut den Container ja neu auf).
  function selectWithSlide(id) {
    if (id === getActive()) return;
    const geo = geometry();
    if (!geo) { setActive(id); onChange(); return; }
    cancelSpring();
    const fromIdx = Math.max(0, ids.indexOf(getActive()));
    const fromLeft = liveLeft !== null ? liveLeft : geo.minLeft + fromIdx * geo.slotWidth;
    setActive(id);
    onChange();
    const indicator = qs(indicatorSelector);
    if (!indicator) return;
    const toIdx = Math.max(0, ids.indexOf(id));
    const toLeft = geo.minLeft + toIdx * geo.slotWidth;
    indicator.style.transition = 'none';
    indicator.style.transform = `translateX(${fromLeft - geo.minLeft}px)`;
    void indicator.offsetHeight; // Reflow erzwingen: Startzustand sichtbar malen, bevor die Feder losläuft
    springTo(indicator, fromLeft - geo.minLeft, toLeft - geo.minLeft, 0, geo.minLeft);
  }

  return { onPointerDown, selectWithSlide };
}

// Ein leiser Klick auf jede Schaltfläche, wie bei nativen Apps – zentral
// statt über die ganze Datei verstreut. Aktionen mit eigenem Klang stehen
// hier ausgenommen, sonst lägen zwei Töne übereinander.
const CUSTOM_SOUND_ACTIONS = new Set([
  'toggle-set', 'finish-workout', 'start-blank', 'start-routine', 'resume-workout',
  'remove-set', 'remove-exercise', 'toggle-group', 'toggle-exercise', 'set-sound-style',
  'delete-workout', 'delete-exercise', 'delete-routine', 'discard-workout', 'wipe-data',
  'supp-toggle', 'supp-slot-all', 'supp-day-all', 'supp-preset',
  'ch-attempt', 'ch-accept',
  'mob-quickstart', 'mob-start', 'mob-routine-start', 'mob-single', 'mob-pick', 'opt', 'finish-mobility',
  'mode-fight',
]);

document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('button, label.btn, .chip, .swatch');
  if (!el || el.disabled) return;
  if (CUSTOM_SOUND_ACTIONS.has(el.dataset.action) || 'nosound' in el.dataset) return;
  Sound.tap();
}, true);

let activeSwipeSelector = null;
window.addEventListener('pointermove', (e) => activeSwipeSelector?.onPointerMove(e));
window.addEventListener('pointerup', () => activeSwipeSelector?.onPointerUp());
window.addEventListener('pointercancel', () => activeSwipeSelector?.onPointerUp());

const trainingSwipe = createSwipeSelector({
  barSelector: '#g-seg-training',
  indicatorSelector: '#g-seg-training .g-seg-thumb',
  handleSelector: 'button',
  ids: TRAINING_SUBS.map((t) => t.id),
  getActive: () => state.trainingSub,
  setActive: (id) => { state.trainingSub = id; },
  onChange: render,
});

const mobilitySwipe = createSwipeSelector({
  barSelector: '#g-seg-mobility',
  indicatorSelector: '#g-seg-mobility .g-seg-thumb',
  handleSelector: 'button',
  ids: AREA_TABS.map((t) => t.id),
  getActive: () => state.mobilitySub,
  setActive: (id) => { state.mobilitySub = id; },
  onChange: render,
});

sheetRoot.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="close-sheet"]')) dismissSheet();
});

window.addEventListener('beforeunload', () => stopTicking());

// Die App bleibt auf dem iPhone oft tagelang im Speicher. Kommt sie zurück in
// den Vordergrund, muss zumindest der Tag stimmen – sonst stünden auf der
// Startseite noch die abgehakten Supplements von gestern. Außerdem gibt iOS
// die Bildschirmsperre im Hintergrund frei; im Training wird sie erneuert.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (state.workoutOpen) requestWakeLock();
  if (dayKey() !== renderedDay && !sheetRoot.classList.contains('open')) render();
});

applySettings();
initChallenges({ openSheet, closeSheet, toast, render, prefersReducedMotion });
initMobility({
  openSheet, closeSheet, toast, render, enableDragReorder, dropIn, prefersReducedMotion,
  // Mobility ist im Gym-Modus ein Tab: Wechsel der Ansicht und Sprünge von außen
  setMobilityTab: (id) => { state.mobilitySub = id; render(); },
  openMobilityTab: ({ tab = 'today' } = {}) => {
    closeSheet();
    state.workoutOpen = false;
    state.tab = 'mobility';
    state.mobilitySub = tab;
    render();
  },
});
calibrateSafeArea();
window.addEventListener('resize', calibrateSafeArea);
window.addEventListener('orientationchange', () => setTimeout(calibrateSafeArea, 150));
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
