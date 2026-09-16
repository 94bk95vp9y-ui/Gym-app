export function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(ms) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} Std ${m} Min`;
  return `${m} Min`;
}

export function elapsedLabel(startedAt) {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// geschätztes 1RM nach Epley-Formel
export function estimate1RM(weight, reps) {
  if (!weight || !reps) return 0;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function bestSet(sets) {
  const done = (sets || []).filter((s) => s.done && s.weight > 0);
  if (!done.length) return null;
  return done.reduce((best, s) => (estimate1RM(s.weight, s.reps) > estimate1RM(best.weight, best.reps) ? s : best));
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function unitLabel(unit) {
  return unit === 'lb' ? 'lb' : 'kg';
}

// Zeichnet einen einfachen Linienchart in ein <canvas> (keine Abhängigkeiten).
export function drawLineChart(canvas, points, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 160;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!points.length) return;

  const pad = { top: 16, right: 12, bottom: 22, left: 34 };
  const w = cssW - pad.left - pad.right;
  const h = cssH - pad.top - pad.bottom;
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const yPad = (max - min) * 0.15;
  min -= yPad; max += yPad;

  const x = (i) => pad.left + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v) => pad.top + h - ((v - min) / (max - min)) * h;

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#ff5a36';
  const grid = styles.getPropertyValue('--border').trim() || 'rgba(128,128,128,.2)';
  const textColor = styles.getPropertyValue('--text-secondary').trim() || '#888';

  // Gitterlinien
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.font = '11px -apple-system, system-ui, sans-serif';
  ctx.fillStyle = textColor;
  [min + (max - min) * 0.2, min + (max - min) * 0.8].forEach((v) => {
    const yy = y(v);
    ctx.beginPath();
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(cssW - pad.right, yy);
    ctx.stroke();
    ctx.fillText(Math.round(v).toString(), 4, yy + 3);
  });

  // Linie
  ctx.beginPath();
  points.forEach((p, i) => {
    const xx = x(i); const yy = y(p.value);
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Fläche unter der Linie
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + h);
  grad.addColorStop(0, accent + '33');
  grad.addColorStop(1, accent + '00');
  ctx.lineTo(x(points.length - 1), pad.top + h);
  ctx.lineTo(x(0), pad.top + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Punkte
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(p.value), 3, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  });

  // x-Achsen Labels (erstes, letztes)
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.fillText(points[0].label, pad.left, cssH - 6);
  ctx.textAlign = 'right';
  ctx.fillText(points[points.length - 1].label, cssW - pad.right, cssH - 6);
  ctx.textAlign = 'left';
}
