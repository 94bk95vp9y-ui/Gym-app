// Wiederkehrende Bausteine – damit jede Ansicht dieselbe Sprache spricht.
import { esc } from './dom.js';
import { Icon } from './icons.js';

// Farben der Icon-Quadrate (wie in den iOS-Einstellungen)
export const TINT = {
  blue: '#0A84FF',
  indigo: '#5E5CE6',
  purple: '#AF52DE',
  pink: '#FF2D55',
  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFB800',
  green: '#30C95A',
  teal: '#22B8CF',
  gray: '#8E8E93',
};

export const chev = `<span class="row-chev">${Icon.chevronRight}</span>`;

export function iconTile(icon, color = TINT.blue, cls = '') {
  return `<span class="icon-tile ${cls}" style="--c:${color}">${icon}</span>`;
}

// Fortschrittsring; Beschriftung in der Mitte als HTML
export function ring(value, max, { size = 44, stroke = 5, label = '', cls = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return `
    <span class="ring ${cls}" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
        <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"
          stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - ratio)).toFixed(2)}"/>
      </svg>
      ${label ? `<span class="ring-label">${label}</span>` : ''}
    </span>`;
}

export function chips(items, cls = '') {
  if (!items.length) return '';
  return `<div class="chips ${cls}">${items.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>`;
}

export function sectionHead(title, right = '') {
  return `<div class="section-head"><h2>${esc(title)}</h2>${right}</div>`;
}

export function emptyState({ icon = Icon.info, title, text = '', action = '' }) {
  return `
    <div class="empty-state">
      <span class="empty-icon">${icon}</span>
      <strong>${esc(title)}</strong>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${action}
    </div>`;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export function dateBadge(iso) {
  const d = new Date(iso);
  return `<span class="date-badge"><span>${WEEKDAYS[d.getDay()]}</span><b>${d.getDate()}</b></span>`;
}

// Zeile mit Icon-Quadrat, Titel, Untertitel und Wert/Pfeil
export function navRow({ icon = '', color = TINT.blue, title, sub = '', value = '', action = '', attrs = '', cls = '', arrow = true }) {
  const tag = action ? 'button' : 'div';
  return `
    <${tag} class="row ${cls}" ${action ? `data-action="${action}"` : ''} ${attrs}>
      ${icon ? iconTile(icon, color) : ''}
      <div class="row-main"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ''}</div>
      ${value ? `<span class="row-value">${value}</span>` : ''}
      ${arrow && action ? chev : ''}
    </${tag}>`;
}
