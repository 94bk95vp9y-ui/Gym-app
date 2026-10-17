// Einstellungen (über das Zahnrad auf „Heute“) und Datensicherung.
import { Store, ACCENTS, REST_OPTIONS, validateBackup } from '../core/store.js';
import { dayKey } from '../core/supplements.js';
import { formatRest, formatDateTime, relativeDay, plural } from '../core/format.js';
import { Sound, setSoundVolume } from '../core/sound.js';
import { registerActions, registerInputs } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { registerPage, render } from '../ui/router.js';
import { actionSheet, confirmAction, alertDialog } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { applySettings } from '../ui/theme.js';
import { chev, iconTile, TINT } from '../ui/components.js';

const BACKUP_INTERVAL_DAYS = 14;
const APP_VERSION = '2.1';

// Sicherung fällig? Nur wenn es überhaupt etwas zu sichern gibt.
export function backupDue() {
  const s = Store.getSettings();
  if (!s.backupReminder) return false;
  const hasData = Store.getRoutines().length || Store.getWorkouts().length || Store.getSupplements().length;
  if (!hasData) return false;
  if (s.backupSnoozedUntil && new Date(s.backupSnoozedUntil) > new Date()) return false;
  if (!s.lastBackupAt) return true;
  return Date.now() - new Date(s.lastBackupAt).getTime() > BACKUP_INTERVAL_DAYS * 86400000;
}

// Über das Teilen-Menü: in der installierten App führt ein normaler Download
// ins Leere. So lässt sich die Datei in „Dateien“, iCloud Drive oder per
// AirDrop ablegen.
export async function exportBackup() {
  const json = JSON.stringify(Store.exportAll(), null, 2);
  const name = `gym-sicherung-${dayKey()}.json`;
  const done = () => Store.updateSettings({ lastBackupAt: new Date().toISOString(), backupSnoozedUntil: null });
  const file = typeof File === 'function' ? new File([json], name, { type: 'application/json' }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Gym-Sicherung' });
      done();
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
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  done();
  toast('Sicherung heruntergeladen');
}

function seg(key, options, value, { wide = false } = {}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return `
    <div class="seg" style="--n:${options.length};--i:${i};${wide ? '' : `min-width:${options.length * 56}px`}">
      ${options.map((o) => `<button class="${o.value === value ? 'active' : ''}" data-action="set-seg" data-key="${key}" data-value="${o.value}">${o.label}</button>`).join('')}
      <span class="seg-thumb"></span>
    </div>`;
}

function toggleRow(key, title, sub, checked, icon, color) {
  return `
    <label class="row">
      ${iconTile(icon, color)}
      <div class="row-main"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ''}</div>
      <span class="toggle"><input type="checkbox" data-change="set-toggle" data-key="${key}" ${checked ? 'checked' : ''} /><span class="toggle-track"></span></span>
    </label>`;
}

function stackedRow(icon, color, title, control) {
  return `
    <div class="row stacked">
      <div class="stacked-head">${iconTile(icon, color)}<span class="row-title">${title}</span></div>
      ${control}
    </div>`;
}

registerPage('settings', {
  title: 'Einstellungen',
  render: () => {
    const s = Store.getSettings();
    const dark = document.documentElement.dataset.theme === 'dark';
    return `
      <div class="detail-head"><h1 class="detail-title">Einstellungen</h1></div>

      <div class="section-label">Training</div>
      <div class="list icons">
        <div class="row"><span class="icon-tile text" style="--c:${TINT.blue}">kg</span><div class="row-main"><span class="row-title">Einheit</span></div>
          ${seg('unit', [{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }], s.unit)}</div>
        <div class="row">${iconTile(Icon.target, TINT.red)}<div class="row-main"><span class="row-title">Wochenziel</span><span class="row-sub">Trainings pro Woche</span></div>
          <span class="stepper"><button data-action="set-goal" data-delta="-1" aria-label="Weniger">${Icon.minus}</button><span>${s.weeklyGoal}</span><button data-action="set-goal" data-delta="1" aria-label="Mehr">${Icon.plus}</button></span></div>
        <button class="row" data-action="set-rest">${iconTile(Icon.timer, TINT.orange)}<div class="row-main"><span class="row-title">Satzpause</span><span class="row-sub">Standard – pro Übung änderbar</span></div>
          <span class="row-value">${formatRest(s.restSeconds)}</span>${chev}</button>
        ${toggleRow('progressiveOverload', 'Gewichts-Empfehlung', 'Mehr Gewicht, sobald du zweimal alle Sätze mit 10+ Wdh geschafft hast', s.progressiveOverload, Icon.trendUp, TINT.green)}
        ${toggleRow('keepAwake', 'Bildschirm anlassen', 'Während des Trainings sperrt sich das iPhone nicht', s.keepAwake, Icon.phone, TINT.gray)}
      </div>

      <div class="section-label">Darstellung</div>
      <div class="list icons">
        ${stackedRow(Icon.moon, TINT.indigo, 'Erscheinungsbild', seg('theme', [{ value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }, { value: 'system', label: 'Wie iPhone' }], s.theme, { wide: true }))}
        ${stackedRow(Icon.palette, TINT.pink, 'Akzentfarbe', `<div class="swatches">${ACCENTS.map((a) => `
            <button class="swatch ${s.accent === a.id ? 'active' : ''}" data-action="set-accent" data-id="${a.id}" aria-label="${a.label}"
              style="background:${dark ? a.dark : a.light};color:${dark ? a.dark : a.light}"><span style="color:${dark && a.id === 'graphite' ? '#000' : '#fff'}">${s.accent === a.id ? Icon.check : ''}</span></button>`).join('')}</div>`)}
        ${toggleRow('sound', 'Töne', 'Beim Abhaken, bei Rekorden und am Ende der Pause', s.sound, Icon.voiceOn, TINT.red)}
        ${s.sound ? `<div class="row"><span class="icon-tile" style="background:transparent"></span><div class="row-main">
          <input type="range" class="slider" min="0" max="100" step="5" value="${Math.round(s.soundVolume * 100)}" data-input="set-volume" data-change="set-volume" aria-label="Lautstärke" /></div></div>` : ''}
      </div>

      <div class="section-label">Mobility</div>
      <div class="list icons">
        ${stackedRow(Icon.stretch, TINT.teal, 'Dauer der täglichen Routine', seg('mobilityBudget', [5, 10, 15, 20].map((v) => ({ value: v, label: `${v} Min` })), s.mobilityBudget, { wide: true }))}
        ${toggleRow('mobilityVoice', 'Sprachansage', 'Übung, Seitenwechsel und Atmung', s.mobilityVoice, Icon.voiceOn, TINT.teal)}
      </div>

      <div class="section-label">Daten</div>
      <div class="list icons">
        <button class="row" data-action="backup-export">${iconTile(Icon.archive, TINT.blue)}<div class="row-main"><span class="row-title">Sicherung erstellen</span>
          <span class="row-sub">${s.lastBackupAt ? `Zuletzt ${relativeDay(s.lastBackupAt)}` : 'Noch nie gesichert'}</span></div>${chev}</button>
        <label class="row">${iconTile(Icon.restore, TINT.gray)}<div class="row-main"><span class="row-title">Sicherung wiederherstellen</span><span class="row-sub">Ersetzt alle Daten auf diesem Gerät</span></div>${chev}
          <input type="file" accept=".json,application/json" data-change="backup-import" hidden /></label>
        ${toggleRow('backupReminder', 'An Sicherung erinnern', `Wenn die letzte über ${BACKUP_INTERVAL_DAYS} Tage her ist`, s.backupReminder, Icon.bell, TINT.orange)}
      </div>
      <div class="section"><div class="list">
        <button class="row destructive center" data-action="wipe-data"><div class="row-main"><span class="row-title">Alle Daten löschen</span></div></button>
      </div>
      <p class="section-foot" style="text-align:center">Alle Daten bleiben ausschließlich auf diesem Gerät.<br>Gym ${APP_VERSION}</p></div>`;
  },
});

registerActions({
  'set-seg': (el) => {
    const { key } = el.dataset;
    const raw = el.dataset.value;
    const value = ['mobilityBudget'].includes(key) ? +raw : raw;
    Store.updateSettings({ [key]: value });
    applySettings();
    render();
  },
  'set-goal': (el) => {
    const s = Store.getSettings();
    Store.updateSettings({ weeklyGoal: Math.max(1, Math.min(7, s.weeklyGoal + +el.dataset.delta)) });
    render();
  },
  'set-rest': () => {
    actionSheet({
      title: 'Pause zwischen Sätzen',
      message: 'Startet automatisch nach jedem abgehakten Satz.',
      actions: REST_OPTIONS.map((v) => ({ label: formatRest(v), handler: () => { Store.updateSettings({ restSeconds: v }); render(); } })),
    });
  },
  'set-accent': (el) => {
    Store.updateSettings({ accent: el.dataset.id });
    applySettings();
    render();
  },
  'backup-export': () => exportBackup().then(() => render()),
  'wipe-data': async () => {
    if (!(await confirmAction({ title: 'Alle Daten löschen?', message: 'Pläne, Trainings, Supplements und Einstellungen werden unwiderruflich gelöscht.', confirmLabel: 'Alles löschen' }))) return;
    Store.wipeAll();
    applySettings();
    render();
    toast('Alle Daten gelöscht');
  },
});

registerInputs({
  'change:set-toggle': (el) => {
    Store.updateSettings({ [el.dataset.key]: el.checked });
    applySettings();
    if (el.dataset.key === 'sound') {
      if (el.checked) Sound.setDone();
      render();
    }
  },
  'set-volume': (el) => setSoundVolume(+el.value / 100),
  'change:set-volume': (el) => {
    Store.updateSettings({ soundVolume: +el.value / 100 });
    applySettings();
    Sound.setDone();
  },
  'change:backup-import': async (el) => {
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      alertDialog({ title: 'Datei nicht lesbar', message: 'Ist es eine Gym-Sicherung (.json)?' });
      return;
    }
    const problem = validateBackup(data);
    if (problem) { alertDialog({ title: 'Sicherung ungültig', message: problem }); return; }
    const count = Array.isArray(data.workouts) ? data.workouts.length : 0;
    const plans = Array.isArray(data.routines) ? data.routines.length : 0;
    const when = data.exportedAt ? ` vom ${formatDateTime(data.exportedAt)}` : '';
    if (!(await confirmAction({
      title: `Sicherung${when} wiederherstellen?`,
      message: `${plural(plans, 'Plan', 'Pläne')}, ${plural(count, 'Training', 'Trainings')}. Alle aktuellen Daten werden ersetzt.`,
      confirmLabel: 'Wiederherstellen',
    }))) return;
    Store.importAll(data);
    applySettings();
    render();
    toast('Sicherung wiederhergestellt');
  },
});

