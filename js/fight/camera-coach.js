// Kamera-Coach (Beta): Die Frontkamera erkennt die Körperhaltung direkt auf
// dem Handy (MediaPipe Pose, offline). Fallen die Hände unter das Kinn, ruft
// der Coach „Hände hoch!“; gestreckte Arme werden als Schläge gezählt.
// Es wird kein Video gespeichert oder verschickt.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { Store } from '../storage.js';
import { fx, qs, escapeHtml, fmtClock, uidShort } from './core.js';
import { speak, holdScreen, releaseScreen, primeVoice } from './voice.js';
import { recordPractice } from './progress.js';
import { afterSession } from './rewards.js';

const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;
let landmarkerPromise = null;

function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import('../vendor/mediapipe/vision_bundle.mjs');
      const fileset = await vision.FilesetResolver.forVisionTasks(`${BASE}wasm`);
      const create = (delegate) => vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${BASE}pose_landmarker_lite.task`, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try { return await create('GPU'); } catch { return create('CPU'); }
    })().catch((err) => { landmarkerPromise = null; throw err; });
  }
  return landmarkerPromise;
}

export function openCameraCoach() {
  fx.ctx.openSheet('Kamera-Coach', `
    <div class="f-cam-intro">
      <span class="f-cam-icon">${Icon.camera}</span>
      <p>Die Frontkamera erkennt deine Haltung. Fallen die Hände unter das Kinn, sagt der Coach „Hände hoch!“ – und er zählt deine Schläge.</p>
      <ol class="tv-cues">
        <li>Handy auf Brusthöhe aufstellen, 2–3 Meter Abstand.</li>
        <li>Oberkörper und Hände müssen im Bild sein, gutes Licht hilft.</li>
        <li>Shadowboxing wie gewohnt – schlage nicht Richtung Handy.</li>
      </ol>
      <p class="muted small">Beta: Die Erkennung läuft komplett auf dem Handy. Es wird nichts gespeichert oder gesendet. Beim ersten Start werden ca. 18 MB geladen.</p>
    </div>`, {
    footer: `<button class="btn btn-primary full f-bigbtn" data-go data-nosound>${Icon.camera} Kamera starten</button>`,
    onMount: (root) => qs('[data-go]', root).addEventListener('click', () => { fx.ctx.closeSheet(); start(); }),
  });
}

async function start() {
  primeVoice();
  const el = document.createElement('div');
  el.className = 'cc';
  el.innerHTML = `
    <video class="cc-video" playsinline muted></video>
    <canvas class="cc-canvas"></canvas>
    <header class="fp-top cc-top">
      <button class="fp-icon" data-c="close" aria-label="Beenden">${Icon.close}</button>
      <div class="fp-title"><strong>Kamera-Coach</strong><span id="cc-state">Startet …</span></div>
      <span class="cc-time f-num" id="cc-time">0:00</span>
    </header>
    <div class="cc-hud">
      <div class="cc-guard" id="cc-guard"><span>Deckung</span><b>–</b></div>
      <div class="cc-count"><b class="f-num" id="cc-l">0</b><span>Links</span></div>
      <div class="cc-count"><b class="f-num" id="cc-r">0</b><span>Rechts</span></div>
    </div>
    <div class="cc-msg" id="cc-msg"></div>
    <button class="btn btn-primary cc-stop" data-c="stop">Fertig</button>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  const state = qs('#cc-state', el);
  const video = qs('video', el);
  const canvas = qs('canvas', el);
  const g = canvas.getContext('2d');
  const S = {
    stream: null, landmarker: null, raf: null, started: performance.now(), lastSeen: 0,
    guardUp: 0, guardTotal: 0, lowSince: null, lastWarn: 0, warnings: 0,
    punches: { L: 0, R: 0 }, ext: { L: false, R: false }, closed: false,
  };

  const close = (save) => {
    if (S.closed) return;
    S.closed = true;
    cancelAnimationFrame(S.raf);
    S.stream?.getTracks().forEach((t) => t.stop());
    releaseScreen();
    el.classList.remove('open');
    el.classList.add('closing');
    setTimeout(() => el.remove(), 300);
    const seconds = Math.round((performance.now() - S.started) / 1000);
    if (save && seconds >= 30) {
      const total = S.punches.L + S.punches.R;
      const guard = S.guardTotal ? Math.round((S.guardUp / S.guardTotal) * 100) : null;
      Store.addFightSession({
        id: uidShort(), type: 'camera', title: 'Kamera-Coach', at: new Date(Date.now() - seconds * 1000).toISOString(), seconds,
        rounds: 0, rpe: null, completed: true, punches: total, guard, warnings: S.warnings,
        techniques: { jab: S.punches.L, cross: S.punches.R, stance: Math.round(seconds / 10) },
      });
      const promoted = recordPractice({ jab: S.punches.L, cross: S.punches.R });
      fx.ctx.toast(`${total} Schläge · Deckung ${guard ?? '–'} % oben`);
      afterSession({ promoted });
    } else fx.ctx.render();
  };
  qs('[data-c="close"]', el).addEventListener('click', () => close(false));
  qs('[data-c="stop"]', el).addEventListener('click', () => close(true));

  try {
    state.textContent = 'Kamera …';
    S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.srcObject = S.stream;
    await video.play();
    state.textContent = 'Erkennung wird geladen …';
    S.landmarker = await loadLandmarker();
  } catch (err) {
    state.textContent = '';
    qs('#cc-msg', el).innerHTML = `<b>Kamera-Coach nicht verfügbar</b><br>${escapeHtml(err?.name === 'NotAllowedError' ? 'Kein Zugriff auf die Kamera – in den iPhone-Einstellungen erlauben.' : 'Dein Gerät unterstützt die Erkennung nicht oder das Laden ist fehlgeschlagen.')}`;
    qs('#cc-msg', el).classList.add('show');
    return;
  }
  if (S.closed) { S.stream?.getTracks().forEach((t) => t.stop()); return; }
  holdScreen();
  state.textContent = 'Stell dich ins Bild';
  speak('Kamera-Coach bereit. Hände hoch, los geht es.');
  Sound.boxBell(1);
  S.started = performance.now();

  let lastVideoTime = -1;
  const loop = () => {
    if (S.closed) return;
    S.raf = requestAnimationFrame(loop);
    const now = performance.now();
    qs('#cc-time', el).textContent = fmtClock((now - S.started) / 1000);
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    let res;
    try { res = S.landmarker.detectForVideo(video, now); } catch { return; }
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * 2) { canvas.width = w * 2; canvas.height = h * 2; }
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, w, h);
    const lm = res?.landmarks?.[0];
    if (!lm) {
      if (now - S.lastSeen > 1500) state.textContent = 'Niemand im Bild – etwas zurückgehen';
      return;
    }
    S.lastSeen = now;
    state.textContent = 'Erkannt';
    analyse(lm, now);
    draw(g, lm, w, h, video);
  };
  loop();

  // Auswertung: Deckung (Handgelenke über Schulterhöhe nahe am Kinn) und Schläge
  function analyse(lm, now) {
    const P = (i) => lm[i];
    const nose = P(0);
    const sh = { L: P(11), R: P(12) };
    const wr = { L: P(15), R: P(16) };
    const width = Math.hypot(sh.L.x - sh.R.x, sh.L.y - sh.R.y) || 0.2;
    const chinY = nose.y + (Math.min(sh.L.y, sh.R.y) - nose.y) * 0.55;
    const extended = {};
    ['L', 'R'].forEach((s) => {
      const d = Math.hypot(wr[s].x - sh[s].x, wr[s].y - sh[s].y) / width;
      // Hand vor der Schulter (Richtung Kamera) – im Verhältnis zur
      // Schulterbreite, damit der Abstand zum Handy keine Rolle spielt
      const depth = (sh[s].z - wr[s].z) / width;
      const out = d > 1.25 || depth > 1.1;
      extended[s] = out;
      if (out && !S.ext[s] && wr[s].visibility > 0.5) { S.punches[s] += 1; qs(`#cc-${s.toLowerCase()}`, el).textContent = S.punches[s]; }
      S.ext[s] = out;
    });
    const handsUp = ['L', 'R'].every((s) => extended[s] || wr[s].y < chinY + width * 0.25);
    S.guardTotal += 1;
    if (handsUp) { S.guardUp += 1; S.lowSince = null; } else if (!S.lowSince) S.lowSince = now;
    const guardEl = qs('#cc-guard', el);
    guardEl.classList.toggle('down', !handsUp);
    qs('b', guardEl).textContent = handsUp ? 'oben' : 'runter!';
    if (S.lowSince && now - S.lowSince > 900 && now - S.lastWarn > 4000) {
      S.lastWarn = now;
      S.warnings += 1;
      speak('Hände hoch!', { rate: 1.15 });
      Sound.beep(false);
    }
  }
}

const LINKS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28]];
function draw(g, lm, w, h, video) {
  // Video wird gespiegelt angezeigt (wie ein Spiegel) – Punkte ebenso
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.max(w / vw, h / vh);
  const ox = (w - vw * scale) / 2;
  const oy = (h - vh * scale) / 2;
  const X = (p) => w - (ox + p.x * vw * scale);
  const Y = (p) => oy + p.y * vh * scale;
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(34, 211, 197, 0.85)';
  LINKS.forEach(([a, b]) => {
    if (lm[a].visibility < 0.4 || lm[b].visibility < 0.4) return;
    g.beginPath(); g.moveTo(X(lm[a]), Y(lm[a])); g.lineTo(X(lm[b]), Y(lm[b])); g.stroke();
  });
  [15, 16].forEach((i) => {
    if (lm[i].visibility < 0.4) return;
    g.fillStyle = '#ff2e3e';
    g.beginPath(); g.arc(X(lm[i]), Y(lm[i]), 9, 0, Math.PI * 2); g.fill();
  });
}
