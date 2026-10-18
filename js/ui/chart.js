// Diagramme als SVG – gestochen scharf und mit den Farben des Themas.
// Linienverläufe lassen sich mit dem Finger abfahren: eine Markierung zeigt
// Wert und Datum des nächstgelegenen Punkts (wie in den Diagrammen von iOS).
import { formatNumber, formatDayMonth, escapeHtml as esc } from '../core/format.js';

let uid = 0;

function valueHtml(value, unit) {
  return `${formatNumber(Math.round(value * 10) / 10)}${unit ? `<small> ${esc(unit)}</small>` : ''}`;
}

// Linienverlauf mit Fläche, Punkten und Achsenbeschriftung. Oben steht der
// letzte Wert mit der Entwicklung seit dem ersten Punkt; beim Abfahren mit
// dem Finger zeigt dieselbe Zeile den berührten Punkt.
export function lineChart(points, { height = 160, unit = '' } = {}) {
  if (points.length < 2) return '';
  const W = 320;
  const H = height;
  const pad = { t: 14, r: 10, b: 10, l: 10 };
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.15;
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
  const id = `chg${uid += 1}`;
  const data = points.map((p, i) => [+((x(i) / W) * 100).toFixed(2), +y(p.value).toFixed(1), p.value, p.date]);
  const delta = Math.round((last.value - points[0].value) * 10) / 10;
  const sub = `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${formatNumber(Math.abs(delta))}${unit ? ` ${unit}` : ''} seit ${formatDayMonth(points[0].date)}`;
  return `
    <div class="chart" data-scrub="${esc(JSON.stringify(data))}" data-unit="${esc(unit)}" style="--h:${H}px">
      <div class="ch-head">
        <b class="ch-value num" data-rest="${esc(valueHtml(last.value, unit))}">${valueHtml(last.value, unit)}</b>
        <span class="ch-sub ${delta > 0 ? 'up' : ''}" data-rest="${esc(sub)}">${esc(sub)}</span>
      </div>
      <div class="ch-plot">
      <div class="chart-scale"><span>${formatNumber(Math.round(hi))}${unit ? ` ${unit}` : ''}</span><span>${formatNumber(Math.round(lo))}${unit ? ` ${unit}` : ''}</span></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-svg" style="height:${H}px" aria-hidden="true">
        <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" class="ch-stop-a"/><stop offset="1" class="ch-stop-b"/>
        </linearGradient></defs>
        ${grid}
        <polygon points="${area}" class="ch-area" fill="url(#${id})"/>
        <polyline points="${line}" class="ch-line" vector-effect="non-scaling-stroke"/>
      </svg>
      <span class="ch-dot" style="left:${((x(points.length - 1) / W) * 100).toFixed(2)}%;top:${y(last.value).toFixed(1)}px"></span>
      <span class="ch-cursor" hidden></span>
      </div>
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
  const [lx, ly] = xy[xy.length - 1];
  return `<svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${line}" vector-effect="non-scaling-stroke"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6" class="spark-end"/></svg>`;
}

// ---------- Abfahren mit dem Finger ----------
function showPoint(chart, data, i) {
  const [px, py, value, date] = data[i];
  const cursor = chart.querySelector('.ch-cursor');
  const dot = chart.querySelector('.ch-dot');
  cursor.hidden = false;
  cursor.style.left = `${px}%`;
  dot.style.left = `${px}%`;
  dot.style.top = `${py}px`;
  chart.querySelector('.ch-value').innerHTML = valueHtml(value, chart.dataset.unit);
  const sub = chart.querySelector('.ch-sub');
  sub.textContent = new Date(date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  sub.classList.add('picked');
  chart.classList.add('scrubbing');
}

function reset(chart) {
  const data = JSON.parse(chart.dataset.scrub);
  const [px, py] = data[data.length - 1];
  const dot = chart.querySelector('.ch-dot');
  dot.style.left = `${px}%`;
  dot.style.top = `${py}px`;
  chart.querySelector('.ch-cursor').hidden = true;
  const value = chart.querySelector('.ch-value');
  value.innerHTML = value.dataset.rest;
  const sub = chart.querySelector('.ch-sub');
  sub.textContent = sub.dataset.rest;
  sub.classList.remove('picked');
  chart.classList.remove('scrubbing');
}

let bound = false;
export function enableChartScrub() {
  if (bound) return;
  bound = true;
  document.addEventListener('pointerdown', (e) => {
    const chart = e.target.closest('.chart[data-scrub]');
    if (!chart) return;
    const data = JSON.parse(chart.dataset.scrub);
    clearTimeout(chart.resetTimer);
    let last = -1;
    const at = (ev) => {
      const r = chart.querySelector('.ch-plot').getBoundingClientRect();
      const p = ((ev.clientX - r.left) / r.width) * 100;
      let best = 0;
      data.forEach((d, i) => { if (Math.abs(d[0] - p) < Math.abs(data[best][0] - p)) best = i; });
      if (best !== last) { last = best; showPoint(chart, data, best); }
    };
    at(e);
    const move = (ev) => at(ev);
    const up = () => {
      chart.removeEventListener('pointermove', move);
      chart.removeEventListener('pointerup', up);
      chart.removeEventListener('pointercancel', up);
      chart.resetTimer = setTimeout(() => reset(chart), 900);
    };
    try { chart.setPointerCapture(e.pointerId); } catch { /* egal */ }
    chart.addEventListener('pointermove', move);
    chart.addEventListener('pointerup', up);
    chart.addEventListener('pointercancel', up);
  });
}
