// Profil: Athleten-Profil über die ganze App, Level, Serie, Challenges,
// Trainingstagebuch, Werkzeuge und Einstellungen des Fight-Modus.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { Store } from '../storage.js';
import { estimate1RM } from '../utils.js';
import {
  fx, qs, qsa, escapeHtml, plural, getProfile, saveProfile, fmtDay, fmtClock, FIGHT_TYPES, mondayOf, DAY, uidShort, sessionMinutes,
} from './core.js';
import { TECHNIQUES, BELTS } from './data-tech.js';
import { getProgress, techStates, beltStatus } from './progress.js';
import { currentVdot } from './endurance.js';
import { reactionStats } from './reaction.js';
import { athleteLevel, activeChallenges, openChallengeCatalog, openChallengeDetail } from '../challenges.js';
import { beltHtml } from './tech.js';
import { voiceEnabled, setVoiceEnabled } from './voice.js';

// ---------- Athleten-Profil ----------
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function strengthScore() {
  const refs = [
    { ids: ['cat-bankdruecken-langhantel'], ref: 120 },
    { ids: ['cat-kniebeuge-langhantel'], ref: 160 },
    { ids: ['cat-kreuzheben', 'cat-sumo-kreuzheben'], ref: 200 },
  ];
  const scores = refs.map(({ ids, ref }) => {
    let best = 0;
    Store.getWorkouts().forEach((w) => w.entries.forEach((e) => {
      if (!ids.includes(e.exerciseId)) return;
      e.sets.forEach((s) => { if (s.done && s.weight > 0 && s.reps > 0) best = Math.max(best, estimate1RM(s.weight, s.reps)); });
    }));
    return best ? clamp01(best / ref) : null;
  }).filter((x) => x !== null);
  return scores.length ? { v: scores.reduce((a, b) => a + b, 0) / scores.length, text: 'Bankdrücken, Kniebeuge, Kreuzheben (geschätztes Maximum) aus dem Gym' } : null;
}

export function athleteProfile() {
  const p = getProgress();
  const states = techStates(p);
  const tech = TECHNIQUES.reduce((n, t) => n + states[t.id].state, 0) / (TECHNIQUES.length * 4);
  const lv = currentVdot();
  const rx = reactionStats().best;
  const since = Date.now() - 28 * DAY;
  const mob = Store.getMobilityLog().filter((m) => new Date(m.startedAt).getTime() >= since && (m.completed || m.seconds >= 180)).length;
  const recentFight = Store.getFightLog().filter((f) => new Date(f.at).getTime() >= since);
  const rounds = recentFight.reduce((n, f) => n + (f.rounds || 0), 0);
  const cond = recentFight.filter((f) => f.type === 'conditioning').length;
  const strength = strengthScore();
  return [
    { id: 'kraft', label: 'Kraft', v: strength?.v ?? null, text: strength?.text || 'Kommt aus deinen Gym-Trainings (Bank, Kniebeuge, Kreuzheben).' },
    { id: 'ausdauer', label: 'Ausdauer', v: lv ? clamp01((lv.vdot - 30) / 30) : null, text: lv ? `VO₂max ca. ${Math.round(lv.vdot)}` : 'Mach einen 5-km- oder Cooper-Test.' },
    { id: 'speed', label: 'Schnelligkeit', v: rx ? clamp01((350 - rx.median) / 130) : null, text: rx ? `Reaktion ${rx.median} ms` : 'Mach einen Reaktionstest.' },
    { id: 'technik', label: 'Technik', v: tech, text: `${Math.round(tech * 100)} % des Lehrplans gefestigt` },
    { id: 'beweglich', label: 'Beweglichkeit', v: clamp01(mob / 16), text: `${plural(mob, 'Mobility-Einheit', 'Mobility-Einheiten')} in 4 Wochen` },
    { id: 'kondition', label: 'Kondition', v: clamp01((rounds + cond * 3) / 60), text: `${plural(rounds, 'Runde', 'Runden')} und ${plural(cond, 'Zirkel', 'Zirkel')} in 4 Wochen` },
  ];
}

function radarSvg(axes) {
  const W = 300;
  const H = 260;
  const cx = W / 2;
  const cy = H / 2 + 6;
  const R = 92;
  const n = axes.length;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const rings = [0.25, 0.5, 0.75, 1].map((k) => `<polygon class="rg" points="${axes.map((_, i) => pt(i, R * k).join(',')).join(' ')}"/>`).join('');
  const spokes = axes.map((_, i) => `<line class="sp" x1="${cx}" y1="${cy}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}"/>`).join('');
  const poly = axes.map((a, i) => pt(i, R * Math.max(0.04, a.v ?? 0)).join(',')).join(' ');
  const labels = axes.map((a, i) => {
    const [x, y] = pt(i, R + 26);
    return `<text x="${x}" y="${y}" class="lb" text-anchor="middle" dominant-baseline="middle">${a.label}</text>
      <text x="${x}" y="${y + 14}" class="vl" text-anchor="middle" dominant-baseline="middle">${a.v === null ? '–' : Math.round(a.v * 100)}</text>`;
  }).join('');
  const dots = axes.map((a, i) => (a.v === null ? '' : `<circle class="dt" cx="${pt(i, R * Math.max(0.04, a.v))[0]}" cy="${pt(i, R * Math.max(0.04, a.v))[1]}" r="3.5"/>`)).join('');
  return `<svg class="f-radar" viewBox="0 0 ${W} ${H + 20}">
    <defs><radialGradient id="rgf" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#ff6b3d" stop-opacity="0.55"/><stop offset="1" stop-color="#ff2e3e" stop-opacity="0.25"/></radialGradient></defs>
    ${rings}${spokes}<polygon class="pl" points="${poly}"/>${dots}${labels}</svg>`;
}

// Wochen in Folge mit erreichtem Ziel (Kampfsport + Ausdauer)
function streakWeeks(profile) {
  const target = profile.fightPerWeek + profile.runPerWeek;
  const all = [...Store.getFightLog().filter((f) => f.type !== 'reaction'), ...Store.getRuns()];
  let weeks = 0;
  let start = mondayOf();
  const count = (from) => {
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    return all.filter((e) => { const d = new Date(e.at); return d >= from && d < to; }).length;
  };
  if (count(start) >= target) weeks += 1;
  for (let i = 0; i < 52; i += 1) {
    start = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
    if (count(start) >= target) weeks += 1; else break;
  }
  return weeks;
}

export function renderMe() {
  const profile = getProfile();
  const lvl = athleteLevel();
  const st = beltStatus();
  const axes = athleteProfile();
  const streak = streakWeeks(profile);
  const log = Store.getFightLog().filter((f) => f.type !== 'reaction');
  const runs = Store.getRuns();
  const totalMin = Math.round([...log, ...runs].reduce((n, e) => n + sessionMinutes(e), 0));
  const totalRounds = log.reduce((n, f) => n + (f.rounds || 0), 0);
  const totalKm = runs.reduce((n, r) => n + (r.distance || 0), 0) / 1000;
  const chs = activeChallenges(['Kampfsport', 'Ausdauer']);
  const R = 2 * Math.PI * 40;
  const entries = [...log].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);

  return `
    <section class="card f-me-hero">
      <div class="f-me-level">
        <svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="40" class="bg"/><circle cx="48" cy="48" r="40" class="fg" stroke-dasharray="${R}" stroke-dashoffset="${R * (1 - lvl.into / lvl.need)}"/></svg>
        <span><small>Level</small><b class="f-num">${lvl.level}</b></span>
      </div>
      <div class="f-me-text">
        <strong class="f-rank">${lvl.title}</strong>
        <span class="muted small">${lvl.into} / ${lvl.need} XP bis Level ${lvl.level + 1} · gleiches Level wie im Gym</span>
        <span class="f-me-belt">${beltHtml(st.belt)} ${st.belt.name}${streak ? ` <span class="f-pill gold" title="Wochen in Folge mit erreichtem Wochenziel">🔥 ${plural(streak, 'Woche', 'Wochen')}</span>` : ''}</span>
      </div>
    </section>

    <section class="card f-me-profile">
      <div class="f-sec-row"><div class="f-sec">Athleten-Profil</div><span class="muted small">die ganze App</span></div>
      ${radarSvg(axes)}
      <div class="f-axes">${axes.map((a) => `<div><strong>${a.label}</strong><span>${escapeHtml(a.text)}</span></div>`).join('')}</div>
    </section>

    <section class="f-me-totals">
      <div><b class="f-num">${log.length + runs.length}</b><span>Einheiten</span></div>
      <div><b class="f-num">${totalRounds}</b><span>Runden</span></div>
      <div><b class="f-num">${totalKm.toLocaleString('de-DE', { maximumFractionDigits: 0 })}</b><span>km</span></div>
      <div><b class="f-num">${Math.round(totalMin / 60)}</b><span>Stunden</span></div>
    </section>

    <section>
      <div class="f-sec-row"><div class="f-sec">Challenges</div><button class="f-link" data-me="catalog">${Icon.plus} Wählen</button></div>
      ${chs.length ? `<div class="card list">${chs.map((c) => `
        <button class="list-item selectable f-me-ch" data-ch="${c.ch.id}">
          <span class="f-me-ch-icon">${c.ch.icon}</span>
          <div class="list-item-main"><strong>${escapeHtml(c.ch.name)}</strong><span class="muted small">${escapeHtml(c.label)}</span>
            <span class="f-me-bar"><i style="transform:scaleX(${c.progress?.ratio ?? 0})"></i></span></div>
          ${Icon.chevron}
        </button>`).join('')}</div>`
      : `<div class="card f-empty"><strong>Noch keine Kampfsport-Challenges</strong>Zum Beispiel: 12 Runden am Stück, Reaktion unter 250 ms, 5 km unter 24 Minuten.<br><br><button class="btn btn-primary" data-me="catalog">Challenge wählen</button></div>`}
    </section>

    <section>
      <div class="f-sec-row"><div class="f-sec">Tagebuch</div><button class="f-link" data-me="diary">${Icon.plus} Eintrag</button></div>
      ${entries.length ? `<div class="card list">${entries.map((e) => {
        const t = FIGHT_TYPES[e.type] || { label: e.type, icon: '🥊' };
        return `<button class="list-item selectable" data-entry="${e.id}"><span class="f-run-icon fight">${t.icon}</span>
          <div class="list-item-main"><strong>${escapeHtml(e.title || t.label)}</strong><span class="muted small">${fmtDay(e.at)} · ${Math.max(1, Math.round(e.seconds / 60))} Min${e.rounds ? ` · ${plural(e.rounds, 'Runde', 'Runden')}` : ''}${e.rpe ? ` · ${e.rpe}/10` : ''}${e.notes ? ' · 📝' : ''}</span></div>${Icon.chevron}</button>`;
      }).join('')}</div>` : '<div class="card f-empty"><strong>Noch leer</strong>Jede Einheit landet hier – auch Vereinstraining oder Sparring zum Nachtragen.</div>'}
    </section>

    <section>
      <div class="f-sec">Werkzeuge</div>
      <div class="card list">
        <button class="list-item selectable" data-me="video"><span class="f-run-icon">${Icon.video}</span><div class="list-item-main"><strong>Video-Vergleich</strong><span class="muted small">Filme dich und vergleiche dich mit der 3D-Figur</span></div>${Icon.chevron}</button>
        <button class="list-item selectable" data-me="camera"><span class="f-run-icon">${Icon.camera}</span><div class="list-item-main"><strong>Kamera-Coach <span class="f-pill">Beta</span></strong><span class="muted small">Warnt, wenn die Deckung fällt, zählt Schläge</span></div>${Icon.chevron}</button>
        <button class="list-item selectable" data-me="pulse"><span class="f-run-icon">${Icon.heart}</span><div class="list-item-main"><strong>Puls messen</strong><span class="muted small">Ruhepuls durch Mittippen</span></div>${Icon.chevron}</button>
      </div>
    </section>

    <section>
      <div class="f-sec">Einstellungen</div>
      <div class="card f-settings">
        ${setRow('Auslage', 'stance', [['orthodox', 'Links'], ['southpaw', 'Rechts']], profile.stance)}
        ${setRow('Platz', 'space', [['small', 'Klein'], ['medium', 'Mittel'], ['large', 'Viel']], profile.space)}
        ${setRow('Leise sein', 'quiet', [['never', 'Nie'], ['evening', 'Abends'], ['always', 'Immer']], profile.quiet)}
        ${setRow('Ansage der Schläge', 'voiceStyle', [['mixed', 'Zahlen (1-2-3)'], ['names', 'Namen']], profile.voiceStyle === 'names' ? 'names' : 'mixed')}
        ${setRow('Kampfsport pro Woche', 'fightPerWeek', [[2, '2'], [3, '3'], [4, '4'], [5, '5']], profile.fightPerWeek)}
        ${setRow('Ausdauer pro Woche', 'runPerWeek', [[1, '1'], [2, '2'], [3, '3']], profile.runPerWeek)}
        ${setRow('Zeit pro Einheit', 'sessionMinutes', [[20, '20'], [30, '30'], [45, '45'], [60, '60']], profile.sessionMinutes)}
        <div class="f-set-row"><span>Ausrüstung</span><div class="f-chips">${[['rope', 'Springseil'], ['bag', 'Wandsack'], ['dumbbells', 'Kurzhanteln'], ['mirror', 'Spiegel'], ['gloves', 'Handschuhe']].map(([k, l]) => `<button class="f-chip ${profile.equipment[k] ? 'on' : ''}" data-eq="${k}">${l}</button>`).join('')}</div></div>
        <div class="f-set-row f-set-inline"><span>Sprachansagen</span><label class="toggle"><input type="checkbox" id="f-voice" ${voiceEnabled() ? 'checked' : ''}/><span class="toggle-track"></span></label></div>
        <div class="f-set-row f-set-inline"><span>3D-Figur in Runden</span><label class="toggle"><input type="checkbox" id="f-fig" ${profile.showFigure ? 'checked' : ''}/><span class="toggle-track"></span></label></div>
        <div class="f-set-row f-set-inline"><span>Pulsuhr beim Laufen</span><label class="toggle"><input type="checkbox" id="f-watch" ${profile.watch ? 'checked' : ''}/><span class="toggle-track"></span></label></div>
        <div class="f-set-row f-set-inline"><span>Alter</span><input class="text-input f-set-num" id="f-age" inputmode="numeric" value="${profile.age || ''}"/></div>
        <div class="f-set-row f-set-inline"><span>Maximalpuls <small class="muted">(leer = geschätzt)</small></span><input class="text-input f-set-num" id="f-hrmax" inputmode="numeric" value="${profile.hrMax || ''}"/></div>
      </div>
      <button class="btn f-btn-dark full" style="margin-top:10px" data-me="setup">Einrichtung wiederholen</button>
      <button class="btn btn-ghost danger full" data-me="reset">${Icon.trash} Fight-Daten zurücksetzen</button>
      <p class="muted small" style="margin:8px 4px 0">Sicherung und Wiederherstellung findest du im Gym-Modus unter Einstellungen – sie enthalten auch alle Fight-Daten.</p>
    </section>`;
}

function setRow(label, key, options, value) {
  return `<div class="f-set-row"><span>${label}</span><div class="f-seg" data-set="${key}">${options.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
}

export function bindMe(root) {
  qsa('[data-me="catalog"]', root).forEach((b) => b.addEventListener('click', () => openChallengeCatalog()));
  qsa('[data-ch]', root).forEach((b) => b.addEventListener('click', () => openChallengeDetail(b.dataset.ch)));
  qs('[data-me="diary"]', root)?.addEventListener('click', () => openDiary());
  qsa('[data-entry]', root).forEach((b) => b.addEventListener('click', () => openEntry(b.dataset.entry)));
  qs('[data-me="video"]', root)?.addEventListener('click', () => import('./video.js').then((m) => m.openVideoCompare()));
  qs('[data-me="camera"]', root)?.addEventListener('click', () => import('./camera-coach.js').then((m) => m.openCameraCoach()));
  qs('[data-me="pulse"]', root)?.addEventListener('click', () => import('./endurance.js').then((m) => m.openPulse()));
  qsa('[data-set]', root).forEach((seg) => qsa('button', seg).forEach((b) => b.addEventListener('click', () => {
    const raw = b.dataset.v;
    const v = isNaN(+raw) ? raw : +raw;
    saveProfile({ [seg.dataset.set]: v });
    qsa('button', seg).forEach((x) => x.classList.toggle('on', x === b));
    if (seg.dataset.set === 'stance') fx.ctx.toast(v === 'southpaw' ? 'Rechtsauslage – alle Animationen gespiegelt' : 'Linksauslage');
  })));
  qsa('[data-eq]', root).forEach((b) => b.addEventListener('click', () => {
    const eq = { ...getProfile().equipment, [b.dataset.eq]: !b.classList.contains('on') };
    saveProfile({ equipment: eq });
    b.classList.toggle('on');
  }));
  qs('#f-voice', root)?.addEventListener('change', (e) => setVoiceEnabled(e.target.checked));
  qs('#f-fig', root)?.addEventListener('change', (e) => saveProfile({ showFigure: e.target.checked }));
  qs('#f-watch', root)?.addEventListener('change', (e) => saveProfile({ watch: e.target.checked }));
  qs('#f-age', root)?.addEventListener('change', (e) => { const v = parseInt(e.target.value, 10); if (v >= 10 && v <= 90) saveProfile({ age: v }); });
  qs('#f-hrmax', root)?.addEventListener('change', (e) => { const v = parseInt(e.target.value, 10); saveProfile({ hrMax: v >= 150 && v <= 230 ? v : null }); });
  qs('[data-me="setup"]', root)?.addEventListener('click', () => { saveProfile({ setupDone: false }); fx.ctx.render(); });
  qs('[data-me="reset"]', root)?.addEventListener('click', () => {
    if (!confirm('Alle Fight-Daten löschen (Gürtel, Einheiten, Läufe, Tests)? Der Gym-Teil bleibt unverändert.')) return;
    Store.wipeFight();
    fx.ctx.toast('Fight-Daten zurückgesetzt');
    fx.ctx.render();
  });
}

// ---------- Tagebuch ----------
function openDiary() {
  const st = { kind: 'club', minutes: 60, rounds: 0, rpe: null };
  const kinds = [['club', '🏟️', 'Vereinstraining'], ['sparring', '🥊', 'Sparring'], ['own', '💪', 'Eigenes Training']];
  fx.ctx.openSheet('Tagebuch-Eintrag', `
    <div class="f-opt"><span class="f-opt-label">Was?</span><div class="f-seg wrap" data-o="kind">${kinds.map(([v, i, l]) => `<button data-v="${v}" class="${v === st.kind ? 'on' : ''}">${i} ${l}</button>`).join('')}</div></div>
    <div class="f-opt"><span class="f-opt-label">Dauer</span><div class="f-seg" data-o="minutes">${[30, 45, 60, 90, 120].map((v) => `<button data-v="${v}" class="${v === st.minutes ? 'on' : ''}">${v} Min</button>`).join('')}</div></div>
    <div class="f-opt"><span class="f-opt-label">Runden (Sparring)</span><div class="f-seg" data-o="rounds">${[0, 2, 3, 4, 5, 6, 8].map((v) => `<button data-v="${v}" class="${v === st.rounds ? 'on' : ''}">${v || '–'}</button>`).join('')}</div></div>
    <div class="fp-rpe"><div class="f-opt-label">Anstrengung</div><div class="fp-rpe-row">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button class="fp-rpe-btn" data-rpe="${n}">${n}</button>`).join('')}</div></div>
    <label class="f-field" style="margin-top:12px"><span>Was lief gut?</span><textarea class="text-input" id="d-good" rows="2"></textarea></label>
    <label class="f-field"><span>Was übst du als Nächstes?</span><textarea class="text-input" id="d-next" rows="2"></textarea></label>`, {
    footer: '<button class="btn btn-primary full" data-save>Speichern</button>',
    onMount: (root) => {
      qsa('[data-o]', root).forEach((seg) => qsa('button', seg).forEach((b) => b.addEventListener('click', () => {
        st[seg.dataset.o] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
        qsa('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      })));
      qsa('[data-rpe]', root).forEach((b) => b.addEventListener('click', () => {
        st.rpe = +b.dataset.rpe;
        qsa('[data-rpe]', root).forEach((x) => x.classList.toggle('on', +x.dataset.rpe <= st.rpe));
      }));
      qs('[data-save]', root).addEventListener('click', () => {
        const good = qs('#d-good', root).value.trim();
        const next = qs('#d-next', root).value.trim();
        Store.addFightSession({
          id: uidShort(), type: 'club', title: kinds.find((k) => k[0] === st.kind)[2],
          at: new Date().toISOString(), seconds: st.minutes * 60, rounds: st.rounds, rpe: st.rpe,
          notes: [good && `Gut: ${good}`, next && `Nächstes Mal: ${next}`].filter(Boolean).join('\n') || null, completed: true,
        });
        fx.ctx.closeSheet();
        fx.ctx.toast('Eintrag gespeichert');
        fx.ctx.render();
      });
    },
  });
}

function openEntry(id) {
  const e = Store.getFightLog().find((x) => x.id === id);
  if (!e) return;
  const t = FIGHT_TYPES[e.type] || { label: e.type, icon: '🥊' };
  const techs = Object.entries(e.techniques || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  fx.ctx.openSheet(`${t.icon} ${escapeHtml(e.title || t.label)}`, `
    <div class="fp-stats">
      <div><b class="f-num">${Math.max(1, Math.round(e.seconds / 60))}</b><span>Minuten</span></div>
      ${e.rounds ? `<div><b class="f-num">${e.rounds}</b><span>Runden</span></div>` : ''}
      ${e.rpe ? `<div><b class="f-num">${e.rpe}</b><span>Anstrengung</span></div>` : ''}
    </div>
    <p class="muted small">${fmtDay(e.at)} · ${new Date(e.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</p>
    ${techs.length ? `<div class="f-sec" style="margin-top:12px">Geübt</div><div class="f-chips">${techs.map(([tid, n]) => `<span class="f-chip">${escapeHtml(TECHNIQUES.find((x) => x.id === tid)?.name || tid)} · ${n}</span>`).join('')}</div>` : ''}
    ${e.notes ? `<div class="f-sec" style="margin-top:12px">Notiz</div><p style="white-space:pre-line">${escapeHtml(e.notes)}</p>` : ''}`, {
    footer: `<button class="btn btn-ghost danger full" data-del>${Icon.trash} Eintrag löschen</button>`,
    onMount: (root) => qs('[data-del]', root).addEventListener('click', () => {
      if (!confirm('Eintrag löschen?')) return;
      Store.saveFightLog(Store.getFightLog().filter((x) => x.id !== id));
      fx.ctx.closeSheet();
      fx.ctx.render();
    }),
  });
}

export { BELTS, Sound, fmtClock };
