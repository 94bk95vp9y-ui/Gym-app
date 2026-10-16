// Diagramme als SVG – gestochen scharf und mit den Farben des Themas.
import { formatNumber, formatDayMonth } from '../core/format.js';

// Linienverlauf mit Fläche, Punkten und Achsenbeschriftung.
export function lineChart(points, { height = 160, unit = '' } = {}) {
  if (points.length < 2) return '';
  const W = 320;
  const H = height;
  const pad = { t: 12, r: 8, b: 8, l: 8 };
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.12;
  max += span * 0.12;
  const x = (i) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${H} ${line} ${x(points.length - 1).toFixed(1)},${H}`;
  const grid = [0.25, 0.5, 0.75].map((f) => {
    const yy = (pad.t + f * (H - pad.t - pad.b)).toFixed(1);
    return `<line x1="0" x2="${W}" y1="${yy}" y2="${yy}" class="ch-grid"/>`;
  }).join('');
  const last = points[points.length - 1];
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  return `
    <div class="chart">
      <div class="chart-scale"><span>${formatNumber(Math.round(hi))}${unit ? ` ${unit}` : ''}</span><span>${formatNumber(Math.round(lo))}${unit ? ` ${unit}` : ''}</span></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-svg" style="height:${H}px">
        ${grid}
        <polygon points="${area}" class="ch-area"/>
        <polyline points="${line}" class="ch-line" vector-effect="non-scaling-stroke"/>
      </svg>
      <span class="ch-dot" style="left:${((x(points.length - 1) / W) * 100).toFixed(2)}%;top:${((y(last.value) / H) * H).toFixed(1)}px"></span>
      <div class="chart-axis"><span>${formatDayMonth(points[0].date)}</span><span>${formatDayMonth(last.date)}</span></div>
    </div>`;
}

// Mini-Verlauf für Kacheln
export function sparkline(points) {
  if (points.length < 2) return '<svg class="spark" viewBox="0 0 100 32"></svg>';
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const xy = vals.map((v, i) => [(i / (vals.length - 1)) * 96 + 2, 29 - ((v - min) / span) * 25]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${line}" vector-effect="non-scaling-stroke"/></svg>`;
}
