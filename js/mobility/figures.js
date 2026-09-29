// 3D-Figuren des Mobility-Bereichs: eine Bühne für die Startkarte, eine für
// Sheets und den Player, eine für Standbilder. three.js wird erst geladen,
// wenn der Bereich geöffnet wird.

import { exercise } from './library.js';

let mod = null;
const load = () => { if (!mod) mod = import('../mobility-figure.js'); return mod; };

export function mzTheme() {
  const dark = document.documentElement.dataset.mode === 'fight' || window.matchMedia('(prefers-color-scheme: dark)').matches;
  return { dark, accent: dark ? '#4cc3a3' : '#2f9e85' };
}

const stages = {};
export async function stageFor(name) {
  const m = await load();
  if (!stages[name]) stages[name] = new m.FigureStage();
  stages[name].applyTheme(mzTheme());
  return stages[name];
}

// Figur in einen Container setzen und laufen lassen
export async function mountFigure(name, container, ex, side = 'L', { time } = {}) {
  if (!container || !ex) return null;
  container.classList.add('loading');
  const s = await stageFor(name);
  if (!container.isConnected) return null;
  s.stop();
  s.mount(container);
  s.setExercise(ex, side);
  s.onInteract = () => container.classList.add('touched');
  s.start(time);
  container.classList.remove('loading');
  return s;
}
export function stopFigure(name) { stages[name]?.stop(); }

let thumbStage = null;
const cache = new Map();
export const thumb = (id, cls = '') => `<img class="mz-thumb ${cls}" data-thumb="${id}" alt="" />`;
export async function fillThumbs(root) {
  const imgs = [...root.querySelectorAll('img[data-thumb]')];
  if (!imgs.length) return;
  const m = await load();
  if (!thumbStage) thumbStage = new m.FigureStage({ thumb: true });
  const theme = mzTheme();
  thumbStage.applyTheme(theme);
  for (const img of imgs) {
    const ex = exercise(img.dataset.thumb);
    if (!ex) continue;
    const key = `${ex.id}:${theme.dark}`;
    if (!cache.has(key)) {
      // Ein Bild pro Frame – sonst stockt das Öffnen
      await new Promise((r) => requestAnimationFrame(r));
      cache.set(key, thumbStage.snapshot(ex, 'L', 240));
    }
    if (!img.isConnected) continue;
    img.src = cache.get(key);
    img.classList.add('loaded');
  }
}
