// Einstiegspunkt: Thema anwenden, Ansichten laden, globale Ereignisse.
import { applySettings } from './ui/theme.js';
import { dayKey } from './core/supplements.js';
import { registerActions, runAction, runInput } from './ui/dom.js';
import { render, pop, switchTab } from './ui/router.js';
import { topSheet } from './ui/sheet.js';
import { enableChartScrub } from './ui/chart.js';
import { toast } from './ui/toast.js';
import './views/today.js';
import './views/training.js';
import './views/supplements.js';
import './views/history.js';
import './views/settings.js';
import { restoreWorkout, onVisible as workoutVisible } from './views/workout.js';

// ---------- Safe Area ----------
// iOS meldet in der installierten Web-App unten eine Safe Area (34 px), auch
// wenn das System die Ansicht dort schon verkürzt hat. Rechnet man sie dann
// trotzdem ein, steht die Tableiste doppelt zu hoch. Ist der Bildschirm
// messbar höher als die Seite, hat das System den Platz bereits abgezogen.
function calibrateSafeArea() {
  const reserved = Math.round(window.screen.height - window.innerHeight);
  const portrait = window.innerWidth < window.innerHeight;
  const systemReservedBottom = navigator.standalone === true && portrait && reserved > 8 && reserved < 140;
  document.documentElement.style.setProperty('--safe-bottom', systemReservedBottom ? '0px' : 'env(safe-area-inset-bottom, 0px)');
}

// ---------- Globale Ereignisse ----------
registerActions({
  tab: (el) => switchTab(el.dataset.tab),
  'nav-back': () => pop(),
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  runAction(el.dataset.action, el, e);
});
// Karten mit role="button" (sie enthalten selbst Knöpfe) per Tastatur bedienbar
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target;
  if (!(el instanceof HTMLElement) || el.getAttribute('role') !== 'button' || !el.dataset.action) return;
  e.preventDefault();
  el.click();
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el) runInput(el.dataset.input, el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) runInput(`change:${el.dataset.change}`, el, e);
});

// Die App bleibt auf dem iPhone oft tagelang im Speicher. Kommt sie zurück,
// muss zumindest der Tag stimmen – sonst stünden noch die abgehakten
// Supplements von gestern da. Auch wer über Mitternacht offen bleibt, sieht
// den neuen Tag spätestens nach einer Minute. Offene Blätter werden nicht
// weggerissen; der Wechsel folgt, sobald sie zu sind.
let renderedDay = dayKey();
function checkDay() {
  if (dayKey() === renderedDay || topSheet()) return;
  renderedDay = dayKey();
  window.dispatchEvent(new CustomEvent('daychange'));
  render();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  workoutVisible();
  checkDay();
});
window.addEventListener('sheets-closed', checkDay);
setInterval(() => { if (document.visibilityState === 'visible') checkDay(); }, 60000);

// Voller Speicher: Safari wirft beim Schreiben. Die Änderung ist dann nicht
// gespeichert – lieber laut sagen als still verlieren.
let storageWarned = 0;
window.addEventListener('storage-failed', () => {
  if (Date.now() - storageWarned < 10000) return;
  storageWarned = Date.now();
  toast('Speichern fehlgeschlagen – Speicher voll? Bitte Sicherung erstellen.', { duration: 6000 });
  // Anzeige auf den tatsächlich gespeicherten Stand zurückholen
  if (!topSheet()) setTimeout(render, 0);
});

applySettings();
enableChartScrub();
calibrateSafeArea();
window.addEventListener('resize', calibrateSafeArea);
window.addEventListener('orientationchange', () => setTimeout(calibrateSafeArea, 150));
render();
restoreWorkout();

// Den Browser bitten, die Daten nicht von selbst zu löschen, wenn der
// Speicher knapp wird. Ob und wann Safari das gewährt, entscheidet der
// Browser selbst – es gibt keine Rückfrage und keinen Nachteil.
const storage = navigator.storage;
if (storage?.persist) {
  Promise.resolve(storage.persisted ? storage.persisted() : false)
    .then((done) => done || storage.persist())
    .catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
