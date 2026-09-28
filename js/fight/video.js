// Video-Vergleich: eigenes Video (aufnehmen oder aus Fotos) oben, die
// 3D-Figur mit derselben Technik unten – beide in derselben Zeitlupe.
// Das Video bleibt im Speicher des Browsers und wird nirgends gespeichert.
import { Icon } from '../icons.js';
import { fx, qs, qsa, escapeHtml, southpaw } from './core.js';
import { TECH, clipOf, BELTS } from './data-tech.js';
import { singleTimeline } from './anim.js';
import { coachPool, getProgress, recordCheck } from './progress.js';

export function openVideoCompare(techId = null) {
  const pool = coachPool(getProgress(), {});
  const list = pool.length ? pool : [TECH.jab, TECH.cross];
  let chosen = techId || (list.find((t) => t.cat === 'punch') || list[0]).id;
  fx.ctx.openSheet('Video-Vergleich', `
    <p class="muted small f-setup-intro">So geht’s: Handy seitlich oder vor dir aufstellen, Technik 3–5 Mal filmen. Danach siehst du dein Video neben der Figur – beide gleich langsam.</p>
    <div class="f-sec">Technik</div>
    <div class="f-chips" id="vc-techs">${list.map((t) => `<button class="f-chip ${t.id === chosen ? 'on' : ''}" data-t="${t.id}"><b>${escapeHtml(t.code)}</b> ${escapeHtml(t.name)}</button>`).join('')}</div>
    <label class="btn btn-primary full f-bigbtn" style="margin-top:16px">${Icon.video} Video aufnehmen oder wählen
      <input type="file" accept="video/*" id="vc-file" hidden />
    </label>
    <p class="muted small">Das Video bleibt auf deinem Handy und wird nicht gespeichert.</p>`, {
    onMount: (root) => {
      qsa('[data-t]', root).forEach((b) => b.addEventListener('click', () => {
        chosen = b.dataset.t;
        qsa('[data-t]', root).forEach((x) => x.classList.toggle('on', x === b));
      }));
      qs('#vc-file', root).addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        fx.ctx.closeSheet();
        openCompare(file, chosen);
      });
    },
  });
}

async function openCompare(file, techId) {
  const tech = TECH[techId];
  const url = URL.createObjectURL(file);
  const el = document.createElement('div');
  el.className = 'vc';
  el.innerHTML = `
    <header class="fp-top">
      <button class="fp-icon" data-v="close" aria-label="Schließen">${Icon.close}</button>
      <div class="fp-title"><strong>${escapeHtml(tech.name)}</strong><span>Du oben · Vorlage unten</span></div>
      <button class="fp-icon" data-v="mirror" aria-label="Video spiegeln">${Icon.mirror}</button>
    </header>
    <div class="vc-video"><video src="${url}" playsinline muted loop></video></div>
    <div class="vc-stage"></div>
    <div class="vc-controls">
      <button class="tv-play" data-v="play">${Icon.play}</button>
      <input type="range" class="tv-scrub" id="vc-scrub" min="0" max="1000" value="0" />
      <div class="tv-speeds">${[1, 0.5, 0.25].map((s, i) => `<button data-speed="${s}" class="${i === 1 ? 'on' : ''}">${s === 1 ? '1×' : s === 0.5 ? '½' : '¼'}</button>`).join('')}</div>
    </div>
    <div class="vc-check">
      <div class="f-sec">Vergleich – stimmt das bei dir?</div>
      ${tech.cues.map((c, i) => `<button class="fp-check-item" data-ci="${i}"><span class="fp-check-box">${Icon.check}</span><span>${escapeHtml(c)}</span></button>`).join('')}
      <button class="btn btn-primary full" data-v="save">Selbst-Check speichern</button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  const video = qs('video', el);
  let speed = 0.5;
  let playing = false;
  let t = 0;
  const checks = new Set();

  const [{ FightStage, LOOKS }, { Performer }] = await Promise.all([import('./figure.js'), import('./performer.js')]);
  const stage = new FightStage({});
  const fig = stage.add(LOOKS.fighter);
  fig.setBelt(BELTS[getProgress().belt].color);
  const perf = new Performer(stage, fig, { mirror: southpaw() });
  const tl = singleTimeline(clipOf(techId), { lead: 0.4, tail: 0.7 });
  perf.setTimeline(tl);
  const fr = perf.frame(0.08, 12);
  stage.view({ az: tech.cam?.az ?? 30, el: tech.cam?.el ?? 8, target: fr.center, radius: fr.radius, sway: false });
  stage.mount(qs('.vc-stage', el));
  stage.enableDrag();
  let last = performance.now();
  stage.start(() => {
    const now = performance.now();
    if (playing) t = (t + ((now - last) / 1000) * speed) % tl.dur;
    last = now;
    perf.update(t);
    if (!video.paused && video.duration) qs('#vc-scrub', el).value = String(Math.round((video.currentTime / video.duration) * 1000));
  });

  const setPlaying = (on) => {
    playing = on;
    video.playbackRate = speed;
    if (on) video.play().catch(() => {}); else video.pause();
    qs('[data-v="play"]', el).innerHTML = on ? Icon.pause : Icon.play;
  };
  qs('[data-v="play"]', el).addEventListener('click', () => setPlaying(!playing));
  qsa('[data-speed]', el).forEach((b) => b.addEventListener('click', () => {
    speed = +b.dataset.speed;
    video.playbackRate = speed;
    qsa('[data-speed]', el).forEach((x) => x.classList.toggle('on', x === b));
  }));
  qs('#vc-scrub', el).addEventListener('input', (e) => {
    if (video.duration) video.currentTime = (+e.target.value / 1000) * video.duration;
    t = (+e.target.value / 1000) * tl.dur;
  });
  qs('[data-v="mirror"]', el).addEventListener('click', () => video.classList.toggle('mirrored'));
  qsa('[data-ci]', el).forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.ci;
    if (checks.has(i)) checks.delete(i); else checks.add(i);
    b.classList.toggle('on', checks.has(i));
  }));
  const close = () => {
    stage.dispose();
    video.pause();
    URL.revokeObjectURL(url);
    el.classList.remove('open');
    el.classList.add('closing');
    setTimeout(() => el.remove(), 300);
    fx.ctx.render();
  };
  qs('[data-v="close"]', el).addEventListener('click', close);
  qs('[data-v="save"]', el).addEventListener('click', () => {
    const ok = checks.size === tech.cues.length;
    recordCheck(techId, ok);
    fx.ctx.toast(ok ? `✓ ${tech.name}: Selbst-Check bestanden` : `${tech.name}: ${checks.size}/${tech.cues.length} Punkte – weiter üben`);
    close();
  });
  setPlaying(true);
}
