// Hell/Dunkel, Akzentfarbe und Töne aus den Einstellungen anwenden.
import { Store, ACCENTS } from '../core/store.js';
import { setSoundEnabled, setSoundVolume } from '../core/sound.js';
import { setHapticsEnabled } from './haptics.js';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function applyTheme() {
  const s = Store.getSettings();
  const dark = s.theme === 'dark' || (s.theme === 'system' && darkQuery.matches);
  const docEl = document.documentElement;
  docEl.dataset.theme = dark ? 'dark' : 'light';
  docEl.classList.toggle('solid-bars', !!s.solidBars);
  const accent = ACCENTS.find((a) => a.id === s.accent) || ACCENTS[0];
  const color = dark ? accent.dark : accent.light;
  const [r, g, b] = hexToRgb(color);
  docEl.style.setProperty('--accent', color);
  docEl.style.setProperty('--accent-tint', `rgba(${r}, ${g}, ${b}, ${dark ? 0.2 : 0.1})`);
  // Helle Akzentfarbe (Graphit im Dunkelmodus) braucht dunkle Schrift
  const light = (r * 299 + g * 587 + b * 114) / 1000 > 160;
  docEl.style.setProperty('--on-accent', light ? '#000000' : '#ffffff');
  // Statusleiste in der Farbe des Hintergrunds
  const bg = getComputedStyle(docEl).getPropertyValue('--bg').trim() || (dark ? '#000000' : '#f2f2f7');
  document.querySelectorAll('meta[name="theme-color"]').forEach((m, i) => {
    if (i === 0) { m.removeAttribute('media'); m.content = bg; } else m.remove();
  });
  if (dimmed) dimStatusBar(true);
}

// Statusleiste mit abdunkeln, solange ein Sheet oder Menü den Hintergrund
// abdunkelt – sonst bliebe oben ein heller Streifen stehen.
let dimmed = false;
export function dimStatusBar(on) {
  dimmed = !!on;
  const docEl = document.documentElement;
  const css = getComputedStyle(docEl);
  const bg = css.getPropertyValue('--bg').trim();
  let color = bg;
  if (dimmed && /^#[0-9a-f]{6}$/i.test(bg)) {
    const alpha = docEl.dataset.theme === 'dark' ? 0.55 : 0.28;
    const [r, g, b] = hexToRgb(bg).map((v) => Math.round(v * (1 - alpha)));
    color = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && color) meta.content = color;
}

export function applySettings() {
  const s = Store.getSettings();
  applyTheme();
  setSoundEnabled(s.sound);
  setSoundVolume(s.soundVolume);
  setHapticsEnabled(s.haptics);
}

darkQuery.addEventListener?.('change', () => {
  if (Store.getSettings().theme === 'system') applyTheme();
});

