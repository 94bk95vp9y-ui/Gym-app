// Ausdauer: Läufe (GPS oder eingetragen), geführte Einheiten, persönliche
// Tempo- und Pulszonen, Ruhepuls, Tests und Rekorde.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { Store } from '../storage.js';
import {
  fx, qs, qsa, escapeHtml, plural, getProfile, saveProfile, fmtClock, fmtKm, fmtPace, fmtDay, parseClock,
  mondayOf, uidShort, DAY, weekSummary,
} from './core.js';
import {
  vdotFromRace, trainingPaces, predictSeconds, vo2FromCooper, hrZones, hrMaxOf, haversine, simplifyTrack, trackPath,
} from './endu-calc.js';
import { RUN_TEMPLATES, RUN_TYPES, RUN_KINDS, ZONE_TEXT } from './endu-data.js';
import { speak, stopVoice, primeVoice, holdScreen, releaseScreen, voiceEnabled, setVoiceEnabled } from './voice.js';
import { grantXp, checkChallenges, celebrate } from '../challenges.js';

// ---------- Auswertung ----------
function sortedRuns() { return [...Store.getRuns()].sort((a, b) => b.at.localeCompare(a.at)); }

// Leistungsniveau aus den besten Läufen/Tests der letzten 90 Tage
export function currentVdot() {
  const since = Date.now() - 90 * DAY;
  let best = null;
  Store.getRuns().forEach((r) => {
    if (new Date(r.at).getTime() < since) return;
    let v = null;
    if (r.cooper) v = vo2FromCooper(r.cooper);
    else if (r.test5k) v = vdotFromRace(5000, r.test5k);
    else if (r.type === 'run' && r.distance >= 1500 && r.seconds > 0 && (r.kind === 'test' || r.kind === 'tempo' || (r.rpe || 0) >= 8)) v = vdotFromRace(r.distance, r.seconds);
    if (v && (!best || v > best.v)) best = { v, run: r };
  });
  if (best) return { vdot: best.v, source: best.run };
  const est = getProfile().runEstimate;
  return est ? { vdot: vdotFromRace(5000, est), source: null, estimate: true } : null;
}

function bestTimeFor(meters) {
  let best = null;
  Store.getRuns().forEach((r) => {
    if (r.type !== 'run' && r.type !== 'treadmill') return;
    let t = null;
    if (meters === 5000 && r.test5k) t = r.test5k;
    else if (r.distance >= meters && r.distance <= meters * 1.1 && r.seconds > 0) t = (r.seconds * meters) / r.distance;
    if (t && (!best || t < best.t)) best = { t, run: r };
  });
  return best;
}

export function records() {
  const runs = Store.getRuns().filter((r) => r.type === 'run' || r.type === 'treadmill');
  const longest = runs.reduce((b, r) => (r.distance > (b?.distance || 0) ? r : b), null);
  let fastestKm = null;
  runs.forEach((r) => (r.splits || []).forEach((s) => { if (s > 150 && (!fastestKm || s < fastestKm.s)) fastestKm = { s, run: r }; }));
  const cooper = runs.reduce((b, r) => (r.cooper > (b?.cooper || 0) ? r : b), null);
  return { longest, fastestKm, five: bestTimeFor(5000), ten: bestTimeFor(10000), cooper };
}

function weeklyKm(weeks = 8) {
  const start = mondayOf();
  return Array.from({ length: weeks }, (_, i) => {
    const from = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7 * (weeks - 1 - i));
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    const km = Store.getRuns().filter((r) => { const d = new Date(r.at); return d >= from && d < to; }).reduce((n, r) => n + (r.distance || 0), 0) / 1000;
    return { from, km };
  });
}

export function restingPulse() {
  const list = Store.getPulseLog().filter((p) => p.kind === 'rest').sort((a, b) => a.at.localeCompare(b.at));
  return { last: list[list.length - 1] || null, list };
}

// ---------- Tab ----------
export function enduHeaderAction() {
  return `<button class="f-icon-btn" data-e="log" aria-label="Lauf eintragen">${Icon.plus}</button>`;
}

export function renderEndurance() {
  const profile = getProfile();
  const week = weekSummary();
  const bars = weeklyKm(8);
  const maxKm = Math.max(5, ...bars.map((b) => b.km));
  const lv = currentVdot();
  const paces = lv ? trainingPaces(lv.vdot) : null;
  const zones = hrZones({ ...profile, hrRest: profile.hrRest || restingPulse().last?.bpm || null });
  const rec = records();
  const pulse = restingPulse();
  const runs = sortedRuns().slice(0, 12);

  const hero = `
    <section class="card f-endu-hero">
      <div class="f-endu-top">
        <div><span class="f-cap muted small">Diese Woche</span>
          <div class="f-endu-km"><b class="f-num">${week.km.toLocaleString('de-DE', { maximumFractionDigits: 1 })}</b><span>km</span></div>
          <span class="muted small">${week.run.length}/${profile.runPerWeek} Läufe · ${Math.round(week.run.reduce((n, r) => n + r.seconds, 0) / 60)} Min</span></div>
        <div class="f-endu-bars">${bars.map((b, i) => `<span class="${i === bars.length - 1 ? 'now' : ''}" style="--h:${Math.max(4, (b.km / maxKm) * 100)}%"><i></i></span>`).join('')}</div>
      </div>
      <div class="f-endu-actions">
        <button class="btn f-btn-teal f-bigbtn" data-e="free">${Icon.play} Lauf starten</button>
        <button class="btn f-btn-dark" data-e="log">${Icon.plus} Eintragen</button>
      </div>
    </section>`;

  const level = `
    <section class="card f-level">
      ${lv ? `
        <div class="f-level-row">
          <div class="f-vo2"><b class="f-num">${Math.round(lv.vdot)}</b><span>VO₂max<br>(geschätzt)</span></div>
          <div class="f-predict">
            <div><span>5 km</span><b class="f-num">${fmtClock(predictSeconds(lv.vdot, 5000))}</b></div>
            <div><span>10 km</span><b class="f-num">${fmtClock(predictSeconds(lv.vdot, 10000))}</b></div>
          </div>
        </div>
        <p class="muted small">${lv.estimate ? 'Aus deiner Schätzung – ein 5-km- oder Cooper-Test macht es genau.' : `Aus deinem besten Lauf der letzten 90 Tage (${fmtDay(lv.source.at)}).`}</p>
        <div class="f-sec" style="margin-top:12px">Deine Tempos</div>
        <div class="f-paces">
          <div class="z2"><span>Locker</span><b class="f-num">${fmtPace(paces.easy[1])}–${fmtPace(paces.easy[0])}</b></div>
          <div class="z4"><span>Schwelle</span><b class="f-num">${fmtPace(paces.threshold)}</b></div>
          <div class="z5"><span>Intervall</span><b class="f-num">${fmtPace(paces.interval)}</b></div>
          <div class="z6"><span>Sprint</span><b class="f-num">${fmtPace(paces.rep)}</b></div>
        </div>
        <p class="muted small">Minuten pro Kilometer. Die meisten Läufe gehören in „Locker“.</p>`
      : `<div class="f-level-empty"><strong>Deine Tempo-Zonen</strong><p class="muted small">Mach einen 5-km- oder Cooper-Test – dann rechnet die App deine persönlichen Tempos aus (locker, Schwelle, Intervall).</p>
        <button class="btn f-btn-dark btn-small" data-tpl="5k">5-km-Test</button> <button class="btn f-btn-dark btn-small" data-tpl="cooper">Cooper-Test</button></div>`}
    </section>`;

  const guided = `
    <section>
      <div class="f-sec">Geführte Läufe</div>
      <div class="f-tpl-grid">${RUN_TEMPLATES.map((t) => `
        <button class="f-tpl ${t.kind}" data-tpl="${t.id}">
          <span class="f-tpl-icon">${t.icon}</span>
          <strong>${escapeHtml(t.name)}</strong>
          <span>${escapeHtml(tplDuration(t))}</span>
        </button>`).join('')}</div>
    </section>`;

  const zoneList = `
    <section class="card f-zones">
      <div class="f-sec-row"><div class="f-sec">Pulszonen</div><span class="muted small">HFmax ${hrMaxOf(profile)}${profile.hrMax ? '' : ' (geschätzt)'}</span></div>
      ${zones.map((z) => `<div class="f-zone"><span class="f-zone-bar" style="--c:${z.color};--w:${z.to * 100}%"></span><span class="f-zone-name">${z.name}</span><b class="f-num">${z.lo}–${z.hi}</b></div>`).join('')}
      <p class="muted small">${profile.watch ? 'Mit Uhr: Puls im Blick behalten.' : 'Ohne Uhr: Sprechtest – in Z2 kannst du ganze Sätze sagen.'}</p>
    </section>`;

  const pulseCard = `
    <section class="card f-pulse">
      <div class="f-pulse-row">
        <span class="f-pulse-heart">${Icon.heart}</span>
        <div class="f-pulse-text"><strong>Ruhepuls</strong><span class="muted small">${pulse.last ? `${fmtDay(pulse.last.at)} gemessen` : 'Morgens im Liegen messen – zeigt, wie erholt du bist.'}</span></div>
        ${pulse.last ? `<b class="f-num f-pulse-val">${pulse.last.bpm}</b>` : ''}
      </div>
      ${pulse.list.length > 1 ? sparkline(pulse.list.slice(-14).map((p) => p.bpm)) : ''}
      <button class="btn f-btn-dark full" data-e="pulse">${Icon.pulse} Puls messen</button>
    </section>`;

  const recCard = `
    <section class="card f-records">
      <div class="f-sec">Rekorde</div>
      <div class="f-rec-grid">
        <div><span>5 km</span><b class="f-num">${rec.five ? fmtClock(rec.five.t) : '–'}</b></div>
        <div><span>10 km</span><b class="f-num">${rec.ten ? fmtClock(rec.ten.t) : '–'}</b></div>
        <div><span>Längster Lauf</span><b class="f-num">${rec.longest ? fmtKm(rec.longest.distance, 1) : '–'}</b></div>
        <div><span>Schnellster km</span><b class="f-num">${rec.fastestKm ? fmtPace(rec.fastestKm.s) : '–'}</b></div>
        <div><span>Cooper</span><b class="f-num">${rec.cooper ? `${rec.cooper.cooper.toLocaleString('de-DE')} m` : '–'}</b></div>
      </div>
    </section>`;

  const history = `
    <section>
      <div class="f-sec">Verlauf</div>
      ${runs.length ? `<div class="card list">${runs.map((r) => runRowHtml(r)).join('')}</div>`
        : '<div class="card f-empty"><strong>Noch keine Läufe</strong>Starte einen geführten Lauf oder trag einen ein.</div>'}
    </section>`;

  return `${hero}${level}${guided}${zoneList}${pulseCard}${recCard}${history}`;
}

function tplDuration(t) {
  if (t.minutes) return `${t.defMin} Min`;
  // Strecken-Abschnitte zählen nicht als Zeit – dazu kommt nur Ein- und Auslaufen
  const total = t.blocks().reduce((n, b) => n + (b.distance ? 0 : b.sec), 0);
  return t.distance ? `${t.distance / 1000} km + ${Math.round(total / 60)} Min` : `${Math.round(total / 60)} Min`;
}

function sparkline(values) {
  const w = 280;
  const h = 44;
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`);
  return `<svg class="f-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" /></svg>`;
}

function runRowHtml(r) {
  const type = RUN_TYPES.find((t) => t.id === r.type) || RUN_TYPES[0];
  const kind = RUN_KINDS.find((k) => k.id === r.kind);
  const pace = r.distance ? fmtPace(r.seconds / (r.distance / 1000)) : null;
  return `
    <button class="list-item selectable f-run-row" data-run="${r.id}">
      <span class="f-run-icon">${type.icon}</span>
      <div class="list-item-main"><strong>${r.distance ? fmtKm(r.distance) : fmtClock(r.seconds)}${r.template ? ` · ${escapeHtml(RUN_TEMPLATES.find((t) => t.id === r.template)?.name || '')}` : ''}</strong>
        <span class="muted small">${fmtDay(r.at)} · ${fmtClock(r.seconds)}${pace ? ` · ${pace} /km` : ''}${kind ? ` · ${kind.label}` : ''}</span></div>
      ${r.track?.length > 2 ? `<svg class="f-run-mini" viewBox="0 0 44 44"><path d="${trackPath(r.track, 44, 44, 4)}"/></svg>` : Icon.chevron}
    </button>`;
}

export function bindEndurance(root) {
  qsa('[data-e="log"]', document).forEach((b) => b.addEventListener('click', () => openRunLog()));
  qs('[data-e="free"]', root)?.addEventListener('click', () => openRunStart());
  qs('[data-e="pulse"]', root)?.addEventListener('click', () => openPulse());
  qsa('[data-tpl]', root).forEach((b) => b.addEventListener('click', () => openTemplate(b.dataset.tpl)));
  qsa('[data-run]', root).forEach((b) => b.addEventListener('click', () => openRunDetail(b.dataset.run)));
}

// ---------- Start ----------
export function openRunStart() {
  fx.ctx.openSheet('Laufen', `
    <button class="f-start-item teal" data-rs="free"><span class="f-start-icon">🏃</span><span class="f-start-text"><strong>Freier Lauf</strong><span>Mit GPS aufzeichnen, Kilometer-Ansagen</span></span>${Icon.chevron}</button>
    <div class="f-sec" style="margin-top:14px">Geführt</div>
    <div class="f-tpl-grid">${RUN_TEMPLATES.map((t) => `<button class="f-tpl ${t.kind}" data-tpl="${t.id}"><span class="f-tpl-icon">${t.icon}</span><strong>${escapeHtml(t.name)}</strong><span>${escapeHtml(tplDuration(t))}</span></button>`).join('')}</div>
    <button class="btn f-btn-dark full" style="margin-top:12px" data-rs="log">${Icon.plus} Lauf nachtragen</button>`, {
    onMount: (root) => {
      qs('[data-rs="free"]', root).addEventListener('click', () => openTemplate(null));
      qs('[data-rs="log"]', root).addEventListener('click', () => openRunLog());
      qsa('[data-tpl]', root).forEach((b) => b.addEventListener('click', () => openTemplate(b.dataset.tpl)));
    },
  });
}

function openTemplate(id) {
  const t = RUN_TEMPLATES.find((x) => x.id === id) || null;
  const profile = getProfile();
  const st = { minutes: t?.defMin || null, gps: profile.gps !== false ? 'on' : 'off' };
  const lv = currentVdot();
  const paces = lv ? trainingPaces(lv.vdot) : null;
  const preview = () => {
    if (!t) return '<p class="muted small">Ohne Vorgabe – du läufst, die App zählt Kilometer und sagt jeden Kilometer an.</p>';
    const blocks = t.blocks(st.minutes || undefined);
    return `<div class="f-blocks">${blocks.map((b) => `<span class="f-block z-${b.zone}" style="flex:${b.distance ? 1500 : b.sec}" title="${escapeHtml(b.label)}"></span>`).join('')}</div>
      <p class="muted small">${escapeHtml(t.desc)}</p>
      ${paces ? `<p class="small f-target">Deine Ziele: locker ${fmtPace(paces.easy[1])}–${fmtPace(paces.easy[0])} · Schwelle ${fmtPace(paces.threshold)} · Intervall ${fmtPace(paces.interval)} /km</p>` : ''}`;
  };
  fx.ctx.openSheet(t ? t.name : 'Freier Lauf', `
    <div id="f-prev">${preview()}</div>
    ${t?.minutes ? `<div class="f-opt"><span class="f-opt-label">Dauer</span><div class="f-seg" data-opt="minutes">${t.minutes.map((m) => `<button data-v="${m}" class="${m === st.minutes ? 'on' : ''}">${m} Min</button>`).join('')}</div></div>` : ''}
    <div class="f-opt"><span class="f-opt-label">Aufzeichnung</span><div class="f-seg" data-opt="gps">
      <button data-v="on" class="${st.gps === 'on' ? 'on' : ''}">GPS draußen</button><button data-v="off" class="${st.gps === 'off' ? 'on' : ''}">Nur Zeit (Laufband)</button></div></div>
    <p class="muted small">Der Bildschirm bleibt an, solange du läufst – mit der Taschensperre kommst du nicht aus Versehen dran. Ansagen laufen über Lautsprecher oder Kopfhörer.</p>`, {
    footer: `<button class="btn f-btn-teal full f-bigbtn" data-go data-nosound>${Icon.play} Los</button>`,
    onMount: (root) => {
      qsa('[data-opt]', root).forEach((seg) => qsa('button', seg).forEach((b) => b.addEventListener('click', () => {
        st[seg.dataset.opt] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
        qsa('button', seg).forEach((x) => x.classList.toggle('on', x === b));
        qs('#f-prev', root).innerHTML = preview();
      })));
      qs('[data-go]', root).addEventListener('click', () => {
        saveProfile({ gps: st.gps === 'on' });
        fx.ctx.closeSheet();
        startRun({ template: t, minutes: st.minutes, gps: st.gps === 'on' });
      });
    },
  });
}

// ---------- Lauf-Player ----------
let R = null;

function zoneTarget(zone) {
  const profile = getProfile();
  const lv = currentVdot();
  const p = lv ? trainingPaces(lv.vdot) : null;
  const zones = hrZones({ ...profile, hrRest: profile.hrRest || restingPulse().last?.bpm || null });
  const z = (i) => zones[i - 1];
  const map = {
    easy: { pace: p ? `${fmtPace(p.easy[1])}–${fmtPace(p.easy[0])}` : null, hr: `${z(2).lo}–${z(2).hi}` },
    recovery: { pace: p ? `ab ${fmtPace(p.easy[0])}` : null, hr: `unter ${z(2).hi}` },
    walk: { pace: null, hr: null },
    threshold: { pace: p ? `~${fmtPace(p.threshold)}` : null, hr: `${z(4).lo}–${z(4).hi}` },
    interval: { pace: p ? `~${fmtPace(p.interval)}` : null, hr: `${z(5).lo}–${z(5).hi}` },
    rep: { pace: p ? `~${fmtPace(p.rep)}` : null, hr: null },
    sprint: { pace: null, hr: null },
    max: { pace: null, hr: null },
  };
  return { ...(map[zone] || {}), text: ZONE_TEXT[zone] || '' };
}

export function startRun({ template = null, minutes = null, gps = true } = {}) {
  if (R) return;
  primeVoice();
  const blocks = template ? template.blocks(minutes || undefined) : [{ label: 'Freier Lauf', sec: Infinity, zone: 'easy', free: true }];
  const el = document.createElement('div');
  el.className = 'rp';
  el.innerHTML = `
    <div class="fp-glow"></div>
    <header class="fp-top">
      <button class="fp-icon" data-r="close" aria-label="Beenden">${Icon.close}</button>
      <div class="fp-title"><strong>${escapeHtml(template?.name || 'Freier Lauf')}</strong><span id="rp-gps">${gps ? 'GPS wird gesucht …' : 'Nur Zeit'}</span></div>
      <button class="fp-icon" data-r="voice" aria-label="Sprachansage">${voiceEnabled() ? Icon.voiceOn : Icon.voiceOff}</button>
    </header>
    ${template ? `<div class="fp-segs">${blocks.map((b, i) => `<span class="fp-seg z-${b.zone}" style="flex:${b.distance ? 1500 : b.sec}" data-i="${i}"><i></i></span>`).join('')}</div>` : ''}
    <div class="rp-block" id="rp-block"></div>
    <div class="rp-main">
      <div class="rp-time f-num" id="rp-time">0:00</div>
      <div class="rp-grid">
        <div><b class="f-num" id="rp-dist">0,00</b><span>km</span></div>
        <div><b class="f-num" id="rp-pace">–:–</b><span>Tempo /km</span></div>
        <div><b class="f-num" id="rp-avg">–:–</b><span>Ø /km</span></div>
      </div>
      <svg class="rp-route" id="rp-route" viewBox="0 0 300 120"><path d=""/></svg>
    </div>
    <div class="rp-controls">
      <button class="fp-ctrl" data-r="lock" aria-label="Sperren">${Icon.lock}</button>
      <button class="rp-pause" data-r="pause" aria-label="Pause">${Icon.pause}</button>
      <button class="fp-ctrl" data-r="next" aria-label="Nächster Abschnitt" ${template ? '' : 'hidden'}>${Icon.skipForward}</button>
      <button class="rp-finish" data-r="finish">Beenden</button>
    </div>
    <div class="rp-lock" hidden>
      <div class="rp-lock-inner">
        <div class="rp-lock-time f-num" id="rp-lock-time">0:00</div>
        <div class="rp-lock-dist f-num" id="rp-lock-dist">0,00 km</div>
        <button class="rp-unlock" data-r="unlock"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="36"/></svg>${Icon.lock}<span>Halten zum Entsperren</span></button>
      </div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));

  R = {
    el, template, blocks, gps,
    startWall: Date.now(), pausedMs: 0, pausedAt: null,
    bi: 0, blockStart: 0, blockStartDist: 0,
    dist: 0, points: [], track: [], last: null, splits: [], nextKm: 1000, lastSplitT: 0,
    blockDist: [], acc: null, watch: null,
    testMeters: null, testSeconds: null,
    lastWhole: null,
  };
  if (gps && 'geolocation' in navigator) {
    R.watch = navigator.geolocation.watchPosition(onPos, onGpsError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  } else if (gps) {
    qs('#rp-gps', el).textContent = 'GPS nicht verfügbar – nur Zeit';
  }
  holdScreen();
  bindRun();
  Sound.go();
  enterBlock(true);
  R.timer = setInterval(tick, 250);
  tick();
}

function runTime() {
  const r = R;
  const now = r.pausedAt ?? Date.now();
  return (now - r.startWall - r.pausedMs) / 1000;
}

function onPos(pos) {
  const r = R;
  if (!r) return;
  const { latitude, longitude, accuracy } = pos.coords;
  r.acc = accuracy;
  const label = accuracy <= 15 ? 'GPS gut' : accuracy <= 35 ? 'GPS mittel' : 'GPS schwach';
  qs('#rp-gps', r.el).textContent = `${label} · ±${Math.round(accuracy)} m`;
  if (accuracy > 40) return;
  const p = [latitude, longitude];
  const t = runTime();
  if (r.pausedAt) { r.last = { p, t }; return; }
  if (r.last) {
    const d = haversine(r.last.p, p);
    const dt = Math.max(0.5, t - r.last.t);
    if (d / dt > 9) { r.last = { p, t }; return; } // Sprung: GPS-Ausreißer
    if (d < 2.5) return;
    r.dist += d;
    r.points.push({ t, d: r.dist });
    if (r.points.length > 120) r.points.shift();
    // Kilometer-Zwischenzeiten (interpoliert)
    while (r.dist >= r.nextKm) {
      const over = r.dist - r.nextKm;
      const tKm = t - (over / d) * dt;
      const split = tKm - r.lastSplitT;
      const s = Math.round(split);
      r.splits.push(s);
      r.lastSplitT = tKm;
      const km = r.nextKm / 1000;
      r.nextKm += 1000;
      Sound.beep(true);
      speak(`Kilometer ${km}. Tempo ${Math.floor(s / 60)} ${Math.floor(s / 60) === 1 ? 'Minute' : 'Minuten'} ${s % 60}.`);
    }
  }
  r.last = { p, t };
  r.track.push(p);
  drawRoute();
}

function onGpsError(err) {
  if (!R) return;
  qs('#rp-gps', R.el).textContent = err.code === 1 ? 'Kein GPS-Zugriff – nur Zeit' : 'GPS sucht …';
}

function drawRoute() {
  const r = R;
  if (r.track.length < 2) return;
  const path = qs('#rp-route path', r.el);
  if (path) path.setAttribute('d', trackPath(r.track.length > 400 ? simplifyTrack(r.track, 3) : r.track, 300, 120, 8));
}

function currentPace() {
  const r = R;
  const pts = r.points;
  if (pts.length < 2) return null;
  const tNow = pts[pts.length - 1].t;
  const from = pts.find((p) => p.t >= tNow - 25) || pts[0];
  const d = pts[pts.length - 1].d - from.d;
  const dt = tNow - from.t;
  if (d < 15 || dt < 5) return null;
  return dt / (d / 1000);
}

function enterBlock(first = false) {
  const r = R;
  const b = r.blocks[r.bi];
  r.blockStart = runTime();
  r.blockStartDist = r.dist;
  r.lastWhole = null;
  r.warned = false;
  const target = zoneTarget(b.zone);
  const zoneText = [target.pace ? `${target.pace} /km` : null, target.hr ? `Puls ${target.hr}` : null].filter(Boolean).join(' · ');
  qs('#rp-block', r.el).innerHTML = b.free ? '' : `
    <div class="rp-block-label z-${b.zone}">${escapeHtml(b.label)}</div>
    <div class="rp-block-left f-num" id="rp-left"></div>
    <div class="rp-block-target">${escapeHtml(target.text)}${zoneText ? ` · <b>${zoneText}</b>` : ''}</div>
    <div class="rp-block-note">${escapeHtml(b.note || '')}</div>`;
  r.el.dataset.zone = b.zone;
  if (!b.free) {
    if (!first) Sound.go();
    const min = Math.round(b.sec / 60);
    const len = b.distance ? `${String(b.distance / 1000).replace('.', ',')} Kilometer`
      : b.sec >= 60 && (b.sec % 60 === 0 || b.sec >= 180) ? `${min} ${min === 1 ? 'Minute' : 'Minuten'}` : `${b.sec} Sekunden`;
    speak(`${b.label.replace(/\d+\/\d+/, '').trim()}. ${len}. ${target.text}.`);
  } else if (first) speak('Los gehts. Viel Spaß beim Laufen.');
}

function tick() {
  const r = R;
  if (!r) return;
  const t = runTime();
  const b = r.blocks[r.bi];
  qs('#rp-time', r.el).textContent = fmtClock(t);
  qs('#rp-lock-time', r.el).textContent = fmtClock(t);
  const km = (r.dist / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  qs('#rp-dist', r.el).textContent = km;
  qs('#rp-lock-dist', r.el).textContent = `${km} km`;
  const cp = currentPace();
  qs('#rp-pace', r.el).textContent = cp ? fmtPace(cp) : '–:–';
  qs('#rp-avg', r.el).textContent = r.dist > 50 ? fmtPace(t / (r.dist / 1000)) : '–:–';

  if (!b.free && !r.pausedAt) {
    const inBlock = t - r.blockStart;
    const bd = r.dist - r.blockStartDist;
    let left;
    let done = false;
    if (b.distance && r.gps && r.watch !== null) {
      left = null;
      const rem = Math.max(0, b.distance - bd);
      qs('#rp-left', r.el).textContent = `${(rem / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
      if (bd >= b.distance) done = true;
    } else if (b.distance) {
      qs('#rp-left', r.el).textContent = `${fmtClock(inBlock)} · „Weiter“ im Ziel`;
    } else {
      left = Math.max(0, b.sec - inBlock);
      qs('#rp-left', r.el).textContent = fmtClock(Math.ceil(left));
      const whole = Math.ceil(left);
      if (whole !== r.lastWhole) {
        if (r.lastWhole !== null && whole <= 3 && whole >= 1) Sound.tick();
        r.lastWhole = whole;
      }
      if (!r.warned && b.sec >= 90 && left <= 30 && ['interval', 'threshold', 'max'].includes(b.zone)) { r.warned = true; speak('Noch 30 Sekunden.'); }
      if (left <= 0) done = true;
    }
    qsa('.fp-seg', r.el).forEach((seg) => {
      const i = +seg.dataset.i;
      const fill = i < r.bi ? 1 : i === r.bi ? (b.distance ? Math.min(1, bd / b.distance) : Math.min(1, inBlock / b.sec)) : 0;
      seg.firstElementChild.style.transform = `scaleX(${fill})`;
    });
    if (done) nextBlock();
  }
}

function nextBlock() {
  const r = R;
  const b = r.blocks[r.bi];
  const t = runTime();
  if (b.test) {
    r.testSeconds = Math.round(t - r.blockStart);
    r.testMeters = Math.round(r.dist - r.blockStartDist);
  }
  if (r.bi >= r.blocks.length - 1) { finishRun(); return; }
  r.bi += 1;
  enterBlock();
}

function togglePause() {
  const r = R;
  if (r.pausedAt) {
    r.pausedMs += Date.now() - r.pausedAt;
    r.pausedAt = null;
    r.last = null;
    speak('Weiter.');
  } else {
    r.pausedAt = Date.now();
    speak('Pause.');
  }
  r.el.classList.toggle('paused', !!r.pausedAt);
  qs('[data-r="pause"]', r.el).innerHTML = r.pausedAt ? Icon.play : Icon.pause;
}

function bindRun() {
  const el = R.el;
  qs('[data-r="pause"]', el).addEventListener('click', togglePause);
  qs('[data-r="next"]', el).addEventListener('click', () => nextBlock());
  qs('[data-r="finish"]', el).addEventListener('click', () => {
    if (runTime() > 20 && !confirm('Lauf beenden und speichern?')) return;
    finishRun();
  });
  qs('[data-r="close"]', el).addEventListener('click', () => {
    if (runTime() > 20 && !confirm('Lauf verwerfen? Er wird nicht gespeichert.')) return;
    closeRun();
  });
  qs('[data-r="voice"]', el).addEventListener('click', (e) => {
    const on = !voiceEnabled();
    setVoiceEnabled(on);
    e.currentTarget.innerHTML = on ? Icon.voiceOn : Icon.voiceOff;
  });
  const lock = qs('.rp-lock', el);
  qs('[data-r="lock"]', el).addEventListener('click', () => { lock.hidden = false; Sound.close(); });
  // Entsperren: 1,2 Sekunden gedrückt halten
  const btn = qs('[data-r="unlock"]', el);
  let holdTimer = null;
  const start = (e) => { e.preventDefault(); btn.classList.add('holding'); holdTimer = setTimeout(() => { lock.hidden = true; btn.classList.remove('holding'); Sound.open(); }, 1200); };
  const cancel = () => { clearTimeout(holdTimer); btn.classList.remove('holding'); };
  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
}

document.addEventListener('visibilitychange', () => {
  if (R && document.visibilityState === 'visible') holdScreen();
});

function stopRunHardware() {
  const r = R;
  clearInterval(r.timer);
  if (r.watch !== null && 'geolocation' in navigator) navigator.geolocation.clearWatch(r.watch);
  r.watch = null;
  releaseScreen();
}

function finishRun() {
  const r = R;
  if (r.finished) return;
  r.finished = true;
  if (r.pausedAt) { r.pausedMs += Date.now() - r.pausedAt; r.pausedAt = null; }
  const seconds = Math.round(runTime());
  // offener Test-Abschnitt (z. B. 5 km ohne GPS) wird beim Beenden gewertet
  const b = r.blocks[r.bi];
  if (b?.test && r.testSeconds === null) { r.testSeconds = Math.round(runTime() - r.blockStart); r.testMeters = Math.round(r.dist - r.blockStartDist); }
  stopRunHardware();
  Sound.finish();
  speak(`Geschafft. ${r.dist > 100 ? `${(r.dist / 1000).toFixed(1).replace('.', ',')} Kilometer.` : ''}`);
  const hasDist = r.dist > 100;
  const t = r.template;
  const el = r.el;
  qsa('.rp-main, .rp-controls, .rp-block, .fp-segs', el).forEach((x) => x.remove());
  qs('#rp-gps', el).textContent = '';
  const avg = hasDist ? seconds / (r.dist / 1000) : null;
  const content = document.createElement('div');
  content.className = 'fp-done rp-done';
  content.innerHTML = `
    <div class="fp-done-badge">${Icon.check}</div>
    <h2>Lauf geschafft</h2>
    <div class="fp-stats">
      <div><b class="f-num">${hasDist ? (r.dist / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 }) : '–'}</b><span>km</span></div>
      <div><b class="f-num">${fmtClock(seconds)}</b><span>Zeit</span></div>
      <div><b class="f-num">${avg ? fmtPace(avg) : '–'}</b><span>Ø /km</span></div>
    </div>
    ${r.track.length > 2 ? `<svg class="rp-route done" viewBox="0 0 300 140"><path d="${trackPath(simplifyTrack(r.track, 3), 300, 140, 10)}"/></svg>` : ''}
    ${r.splits.length ? `<div class="rp-splits">${r.splits.map((s, i) => `<div><span>km ${i + 1}</span><i style="--w:${Math.min(100, (Math.min(...r.splits) / s) * 100)}%"></i><b class="f-num">${fmtPace(s)}</b></div>`).join('')}</div>` : ''}
    ${!hasDist ? `<div class="f-opt" style="width:100%;text-align:left"><span class="f-opt-label">Strecke (optional, z. B. vom Laufband)</span><input class="text-input" id="rp-km" inputmode="decimal" placeholder="km, z. B. 5,2" /></div>` : ''}
    ${t?.test === 'cooper' && !hasDist ? '<p class="muted small">Cooper-Test ohne GPS: trag die Strecke der 12 Minuten ein.</p>' : ''}
    ${t?.test === 'cooper' && r.testMeters ? `<p class="f-target">Cooper: <b>${r.testMeters.toLocaleString('de-DE')} m</b> → VO₂max ca. <b>${Math.round(vo2FromCooper(r.testMeters))}</b></p>` : ''}
    <div class="fp-rpe">
      <div class="f-sec">Wie anstrengend war es?</div>
      <div class="fp-rpe-row">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button class="fp-rpe-btn" data-rpe="${n}">${n}</button>`).join('')}</div>
    </div>
    <textarea class="text-input fp-notes" rows="2" placeholder="Notiz (optional)"></textarea>
    <button class="btn f-btn-teal full f-bigbtn" data-r="save">Speichern</button>`;
  el.appendChild(content);
  let rpe = null;
  qsa('[data-rpe]', content).forEach((bn) => bn.addEventListener('click', () => {
    rpe = +bn.dataset.rpe;
    qsa('[data-rpe]', content).forEach((x) => x.classList.toggle('on', +x.dataset.rpe <= rpe));
  }));
  qs('[data-r="save"]', content).addEventListener('click', () => {
    let distance = hasDist ? Math.round(r.dist) : null;
    const manualKm = qs('#rp-km', content)?.value;
    if (!distance && manualKm) { const v = parseFloat(manualKm.replace(',', '.')); if (v > 0) distance = Math.round(v * 1000); }
    const run = {
      id: uidShort(),
      at: new Date(r.startWall).toISOString(),
      type: r.gps ? 'run' : 'treadmill',
      kind: t?.kind || 'easy',
      template: t?.id || null,
      seconds,
      distance,
      rpe,
      notes: qs('.fp-notes', content).value.trim() || null,
      source: r.gps ? 'gps' : 'manual',
      splits: r.splits.length ? r.splits : null,
      track: r.track.length > 2 ? simplifyTrack(r.track, 4).map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]) : null,
    };
    if (t?.test === 'cooper') run.cooper = r.testMeters || (distance && !hasDist ? distance : null);
    if (t?.test === '5k' && (r.testMeters >= 4950 || (!hasDist && distance === 5000))) run.test5k = r.testSeconds;
    saveRun(run);
    closeRun();
  });
}

function closeRun() {
  const r = R;
  if (!r) return;
  if (!r.finished) { stopRunHardware(); stopVoice(); }
  R = null;
  r.el.classList.remove('open');
  r.el.classList.add('closing');
  setTimeout(() => r.el.remove(), 320);
  fx.ctx.render();
}

// Speichern + Rekorde feiern
function saveRun(run) {
  const before = records();
  Store.addRun(run);
  const after = records();
  const events = [];
  let xpBefore = null;
  const award = (title, sub) => {
    const r = grantXp({ kind: 'run-pr', xp: 50, icon: '🏃', kicker: 'Neuer Rekord', title, sub, big: false });
    if (xpBefore === null) xpBefore = r.before;
    events.push(...r.events);
  };
  if (after.five && (!before.five || after.five.t < before.five.t - 1) && after.five.run.id === run.id) award(`5 km in ${fmtClock(after.five.t)}`, before.five ? `Vorher ${fmtClock(before.five.t)}.` : 'Deine erste 5-km-Zeit.');
  if (after.ten && (!before.ten || after.ten.t < before.ten.t - 1) && after.ten.run.id === run.id) award(`10 km in ${fmtClock(after.ten.t)}`, before.ten ? `Vorher ${fmtClock(before.ten.t)}.` : 'Deine erste 10-km-Zeit.');
  if (after.longest && before.longest && after.longest.id === run.id && run.distance > before.longest.distance) award(`Längster Lauf: ${fmtKm(run.distance, 1)}`, `Vorher ${fmtKm(before.longest.distance, 1)}.`);
  if (after.cooper && after.cooper.id === run.id && (!before.cooper || run.cooper > before.cooper.cooper)) award(`Cooper: ${run.cooper.toLocaleString('de-DE')} m`, `VO₂max ca. ${Math.round(vo2FromCooper(run.cooper))}.`);
  const ch = checkChallenges();
  if (xpBefore === null) xpBefore = ch.before;
  events.push(...ch.events);
  fx.ctx.render();
  if (events.length) setTimeout(() => celebrate(events, xpBefore, () => fx.ctx.render()), 400);
  else fx.ctx.toast('Lauf gespeichert');
}

// ---------- Nachtragen ----------
export function openRunLog(existing = null) {
  const st = existing ? { ...existing } : { type: 'run', kind: 'easy', rpe: null };
  const today = new Date();
  const dateVal = (existing ? new Date(existing.at) : today).toISOString().slice(0, 10);
  fx.ctx.openSheet(existing ? 'Lauf bearbeiten' : 'Ausdauer eintragen', `
    <div class="f-opt"><span class="f-opt-label">Art</span><div class="f-seg wrap" data-opt="type">${RUN_TYPES.map((t) => `<button data-v="${t.id}" class="${t.id === st.type ? 'on' : ''}">${t.icon} ${t.label}</button>`).join('')}</div></div>
    <div class="f-opt"><span class="f-opt-label">Einheit</span><div class="f-seg" data-opt="kind">${RUN_KINDS.map((k) => `<button data-v="${k.id}" class="${k.id === st.kind ? 'on' : ''}">${k.label}</button>`).join('')}</div></div>
    <div class="f-form-row">
      <label class="f-field"><span>Datum</span><input type="date" class="text-input" id="rl-date" value="${dateVal}" /></label>
      <label class="f-field"><span>Dauer</span><input class="text-input" id="rl-time" inputmode="decimal" placeholder="mm:ss oder h:mm:ss" value="${existing ? fmtClock(existing.seconds) : ''}" /></label>
    </div>
    <div class="f-form-row">
      <label class="f-field"><span>Strecke (km)</span><input class="text-input" id="rl-km" inputmode="decimal" placeholder="z. B. 5,0" value="${existing?.distance ? String(existing.distance / 1000).replace('.', ',') : ''}" /></label>
      <label class="f-field"><span>Ø Puls</span><input class="text-input" id="rl-hr" inputmode="numeric" placeholder="optional" value="${existing?.hrAvg || ''}" /></label>
    </div>
    <label class="f-check"><input type="checkbox" id="rl-5k" ${existing?.test5k ? 'checked' : ''}/> War ein 5-km-Test (volle Belastung)</label>
    <div class="fp-rpe" style="margin-top:10px">
      <div class="f-opt-label">Anstrengung</div>
      <div class="fp-rpe-row">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button class="fp-rpe-btn ${st.rpe && n <= st.rpe ? 'on' : ''}" data-rpe="${n}">${n}</button>`).join('')}</div>
    </div>
    <p class="muted small" id="rl-pace"></p>`, {
    footer: `<button class="btn f-btn-teal full" data-save>Speichern</button>${existing ? `<button class="btn btn-ghost danger full" data-del>${Icon.trash} Löschen</button>` : ''}`,
    onMount: (root) => {
      qsa('[data-opt]', root).forEach((seg) => qsa('button', seg).forEach((b) => b.addEventListener('click', () => {
        st[seg.dataset.opt] = b.dataset.v;
        qsa('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      })));
      qsa('[data-rpe]', root).forEach((b) => b.addEventListener('click', () => {
        st.rpe = +b.dataset.rpe;
        qsa('[data-rpe]', root).forEach((x) => x.classList.toggle('on', +x.dataset.rpe <= st.rpe));
      }));
      const upd = () => {
        const s = parseClock(qs('#rl-time', root).value);
        const km = parseFloat(qs('#rl-km', root).value.replace(',', '.'));
        qs('#rl-pace', root).textContent = s && km > 0 ? `Tempo: ${fmtPace(s / km)} /km` : '';
      };
      qs('#rl-time', root).addEventListener('input', upd);
      qs('#rl-km', root).addEventListener('input', upd);
      upd();
      qs('[data-save]', root).addEventListener('click', () => {
        const seconds = parseClock(qs('#rl-time', root).value);
        if (!seconds) { fx.ctx.toast('Bitte eine Dauer angeben, z. B. 32:15'); return; }
        const km = parseFloat(qs('#rl-km', root).value.replace(',', '.'));
        const hr = parseInt(qs('#rl-hr', root).value, 10);
        const date = qs('#rl-date', root).value;
        const at = existing && existing.at.slice(0, 10) === date ? existing.at : new Date(`${date}T${new Date().toTimeString().slice(0, 8)}`).toISOString();
        const run = {
          ...(existing || {}),
          id: existing?.id || uidShort(),
          at,
          type: st.type,
          kind: qs('#rl-5k', root).checked ? 'test' : st.kind,
          seconds,
          distance: km > 0 ? Math.round(km * 1000) : null,
          hrAvg: hr > 0 ? hr : null,
          rpe: st.rpe,
          source: existing?.source || 'manual',
        };
        if (qs('#rl-5k', root).checked && km >= 4.95 && km <= 5.3) run.test5k = Math.round((seconds * 5000) / (km * 1000)); else delete run.test5k;
        fx.ctx.closeSheet();
        if (existing) { Store.saveRuns(Store.getRuns().map((r) => (r.id === run.id ? run : r))); fx.ctx.render(); fx.ctx.toast('Gespeichert'); }
        else saveRun(run);
      });
      qs('[data-del]', root)?.addEventListener('click', () => {
        if (!confirm('Diesen Eintrag löschen?')) return;
        Store.saveRuns(Store.getRuns().filter((r) => r.id !== existing.id));
        fx.ctx.closeSheet();
        fx.ctx.render();
      });
    },
  });
}

function openRunDetail(id) {
  const r = Store.getRuns().find((x) => x.id === id);
  if (!r) return;
  const type = RUN_TYPES.find((t) => t.id === r.type) || RUN_TYPES[0];
  const pace = r.distance ? r.seconds / (r.distance / 1000) : null;
  fx.ctx.openSheet(`${type.icon} ${fmtDay(r.at)}`, `
    <div class="fp-stats">
      <div><b class="f-num">${r.distance ? (r.distance / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 }) : '–'}</b><span>km</span></div>
      <div><b class="f-num">${fmtClock(r.seconds)}</b><span>Zeit</span></div>
      <div><b class="f-num">${pace ? fmtPace(pace) : '–'}</b><span>Ø /km</span></div>
    </div>
    ${r.track?.length > 2 ? `<svg class="rp-route done" viewBox="0 0 300 160"><path d="${trackPath(r.track, 300, 160, 10)}"/></svg>` : ''}
    ${r.splits?.length ? `<div class="rp-splits">${r.splits.map((s, i) => `<div><span>km ${i + 1}</span><i style="--w:${Math.min(100, (Math.min(...r.splits) / s) * 100)}%"></i><b class="f-num">${fmtPace(s)}</b></div>`).join('')}</div>` : ''}
    <p class="muted small">${[r.template ? RUN_TEMPLATES.find((t) => t.id === r.template)?.name : null, r.rpe ? `Anstrengung ${r.rpe}/10` : null, r.hrAvg ? `Ø Puls ${r.hrAvg}` : null, r.cooper ? `Cooper ${r.cooper} m` : null].filter(Boolean).join(' · ')}</p>
    ${r.notes ? `<p>${escapeHtml(r.notes)}</p>` : ''}`, {
    footer: '<button class="btn f-btn-dark full" data-edit>Bearbeiten</button>',
    onMount: (root) => qs('[data-edit]', root).addEventListener('click', () => openRunLog(r)),
  });
}

// ---------- Ruhepuls per Mittippen ----------
export function openPulse() {
  const taps = [];
  fx.ctx.openSheet('Puls messen', `
    <p class="muted small">Zwei Finger an den Hals oder das Handgelenk, Puls suchen – dann bei jedem Schlag auf das Herz tippen. Ab 10 Schlägen steht der Wert.</p>
    <button class="f-heart-btn" data-nosound id="f-heart">${Icon.heart}<span class="f-num" id="f-bpm">–</span><small id="f-taps">Tippen</small></button>
    <div class="f-opt"><span class="f-opt-label">Messung</span><div class="f-seg" data-opt="kind"><button data-v="rest" class="on">Ruhepuls (morgens)</button><button data-v="after">Nach Belastung</button></div></div>`, {
    footer: '<button class="btn f-btn-teal full" data-save disabled>Speichern</button>',
    onMount: (root) => {
      let kind = 'rest';
      qsa('[data-opt] button', root).forEach((b) => b.addEventListener('click', () => {
        kind = b.dataset.v;
        qsa('[data-opt] button', root).forEach((x) => x.classList.toggle('on', x === b));
      }));
      const heart = qs('#f-heart', root);
      const calc = () => {
        const ints = taps.slice(1).map((t, i) => t - taps[i]).filter((d) => d > 250 && d < 2000).slice(-15);
        if (ints.length < 4) return null;
        const sorted = [...ints].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)];
        return Math.round(60000 / med);
      };
      heart.addEventListener('pointerdown', () => {
        const now = performance.now();
        if (taps.length && now - taps[taps.length - 1] > 2500) taps.length = 0;
        taps.push(now);
        heart.classList.remove('beat');
        void heart.offsetWidth;
        heart.classList.add('beat');
        Sound.tick();
        const bpm = calc();
        qs('#f-bpm', root).textContent = bpm || '…';
        qs('#f-taps', root).textContent = `${taps.length} Schläge`;
        qs('[data-save]', root).disabled = !(bpm && taps.length >= 10);
      });
      qs('[data-save]', root).addEventListener('click', () => {
        const bpm = calc();
        if (!bpm) return;
        Store.addPulse({ id: uidShort(), at: new Date().toISOString(), bpm, kind });
        if (kind === 'rest') saveProfile({ hrRest: bpm });
        fx.ctx.closeSheet();
        fx.ctx.toast(`Puls ${bpm} gespeichert`);
        fx.ctx.render();
      });
    },
  });
}

export { plural, RUN_TEMPLATES };
