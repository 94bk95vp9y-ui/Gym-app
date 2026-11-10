// Konfetti für besondere Momente (Rekord, Wochenziel): ein kurzer Stoß von
// oben, auf einer eigenen Zeichenfläche über allem – ohne Layout, ohne
// Bibliothek. Bei „Bewegung reduzieren“ passiert nichts.
import { prefersReducedMotion } from './dom.js';

const COLORS = ['#ffb800', '#ff8d28', '#34c759', '#0a84ff', '#af52de', '#ff2d55'];

export function confetti({ count = 90, duration = 2200 } = {}) {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const parts = Array.from({ length: count }, () => ({
    x: W / 2 + rnd(-40, 40),
    y: H * 0.22,
    vx: rnd(-7, 7),
    vy: rnd(-13, -4),
    w: rnd(6, 11),
    h: rnd(4, 8),
    rot: rnd(0, Math.PI * 2),
    vr: rnd(-0.3, 0.3),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    round: Math.random() < 0.3,
  }));
  const start = performance.now();
  let last = start;
  const frame = (now) => {
    const t = now - start;
    const dt = Math.min(2.5, (now - last) / 16.7);
    last = now;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = Math.max(0, Math.min(1, (duration - t) / 500));
    parts.forEach((p) => {
      p.vy += 0.34 * dt;
      p.vx *= 0.985 ** dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.h / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (t < duration) requestAnimationFrame(frame); else canvas.remove();
  };
  requestAnimationFrame(frame);
}
