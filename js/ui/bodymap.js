// Körperkarte: Vorder- und Rückansicht als SVG, die Muskelgruppen einzeln
// einfärbbar. Bewusst schlicht gezeichnet – eine Orientierung, kein Anatomie-
// atlas. Jede Fläche trägt data-m="<Muskelgruppe>" und eine Stufenklasse
// (lv0–lv4 bzw. einen Zustand), die Farben kommen aus dem Stylesheet.
import { escapeHtml as esc } from '../core/format.js';

// Linke Bildhälfte; die rechte entsteht durch Spiegeln an der Mittelachse.
const BASE = `
  <path d="M60 33.5 47 34.5c-8 .6-13.5 4-15 10l-1.5 9-6 24.5c-1.8 8.5-5.5 19-7.5 30.5-.6 3.5.4 6.5 1.5 9 .8 1.8 3.3 1.6 3.8-.3 1.2-4.5 3.5-9 4.7-13.5 2.5-9 5.5-17 7.5-25l3.5-13.5c1.5 10 4.5 20 5.2 31-1.7 9-3.2 17-2.7 26.5.5 18 1 32 3.5 46-.6 9.5-1.5 19.5.2 30.5 1 7.5 2.3 15 2.3 21.5-1 4-4 6.5-5 9.5-.5 1.8.6 2.8 2.5 2.8h11c2 0 2.8-1.4 2.6-3.2-.4-4-1.3-6.8-1-10.8.8-10 3.2-19 3.4-29.5.1-6-1.2-10.5-.9-16 .5-10.5 2.7-20.5 3.5-30.5.3-4 .4-9.5.4-14Z"/>`;

const FRONT = {
  Schultern: ['M46.5 35.2c-7.5.4-12.8 3.3-14.2 9.3-.7 3.2-.9 7-.3 10.7 4.5-1.2 8.3-4.8 10.3-9.5 1.3-3.1 2.8-7.3 4.2-10.5Z'],
  Brust: ['M48.3 37.8c-2.6 2.3-4.6 5.7-5.3 9.4-.5 2.9.3 5.8 2.5 7.5 3.6 2.3 9 2.4 13.3.6V38.8c-3.5-1.1-7.3-1.5-10.5-1Z'],
  Bizeps: ['M30.8 57.3c-3.3 2.3-5.3 6.5-6.3 11.3-.7 3.3-.9 7 .2 10 3.2.3 5.8-1.8 7-5 1.5-4.2 2.5-10 1.6-15.6-.4-.9-1.6-1.2-2.5-.7Z'],
  Unterarme: ['M23.3 82.5c-2.8 3.7-4.7 9.5-5.8 15.3-.6 3.3-1.1 6.7-1.3 10l5 .9c1.5-5 3.7-10.5 5.3-15.7.9-3 1.7-6.3 1.2-9.3-1.2-1.5-3.2-2-4.4-1.2Z'],
  Bauch: [
    'M52.3 59.3h6.5v8.2h-7.3c-.3-2.7 0-5.7.8-8.2Z',
    'M51.3 69.7h7.5v8.3h-7.5c-.2-2.7-.2-5.6 0-8.3Z',
    'M51.4 80.2h7.4v15.5c-2.7.7-5.3-.7-6.3-3.2-.9-3.8-1.1-8-1.1-12.3Z',
    'M45.3 58.2c1.5.9 3.2 1.4 4.9 1.5-1 10-.9 20.5.6 31.5-2.5 2.3-5.5 4.5-8.7 6 .3-9-1.4-17.5-3.1-25.5 1.3-4 3.4-9.3 6.3-13.5Z',
  ],
  Beine: [
    'M42.3 104.5c-1.9 8.5-2.6 19.5-2 30 .5 9.5 1.7 19.5 3.5 27.5 2.7 2.3 6.5 2.5 9.3.5 2.7-9 4.9-20.5 5.8-31.5.3-5.3.2-10.8-.4-15.5-6.5-2.3-12-6.5-16-12Z',
  ],
  Waden: ['M43.3 176.5c-1.8 6.5-1.8 14.5-.8 22 .5 4.5 1.4 9.3 2.8 13.2l3.7.1c1.5-5.5 2.5-12 2.8-18.5.2-5.5-.3-11.5-2-16.5-1.8-1.8-4.8-1.9-6.5-.3Z'],
};

const BACK = {
  Schultern: FRONT.Schultern,
  Rücken: [
    'M59 34.8 51 35.6c-2.5.4-4.8 1.2-6.5 2.5 4.5 4.5 9.3 8.3 14.5 11.2Z',
    'M43.5 41.5c-1.5 2.3-2.5 5-3 7.8-1 7 .4 14.5 2.3 21.5 1 4.5 2.3 9 3.2 13.5 4.2 4.5 8.8 7.3 13 8.5V52.3c-5.7-2.8-11-6.5-15.5-10.8Z',
  ],
  Trizeps: FRONT.Bizeps,
  Unterarme: FRONT.Unterarme,
  Po: ['M41.5 99.5c-2.5 5.5-3.3 12.5-2 19 5.5 4.3 13.3 4.5 19.3.5V101.5c-5.5-3.5-12-4.3-17.3-2Z'],
  Beine: ['M39.5 123c-.5 5-.4 10.5.2 16 .8 8 2 16.5 3.8 23 2.5 2 6 2.2 8.5.5 2.5-8.5 4.5-18.5 5.5-28.5.3-3.5.5-7.5.3-10.5-5.8 3.3-12.5 3.3-18.3-.5Z'],
  Waden: ['M42.5 171.5c-2.3 6-2.8 13.5-1.5 20.5.8 5 2.5 10 4.3 14 1.5 1 3.3 1 4.7 0 1.5-5 2.5-11 2.7-17 .2-6.5-.7-13-3-18-2-1.5-5.2-1.3-7.2.5Z'],
};

function side(shapes, cls) {
  const paths = Object.entries(shapes).map(([group, list]) => list.map((d) => `<path data-m="${esc(group)}" class="bm-m ${cls(group)}" d="${d}"/>`).join('')).join('');
  return `${paths}<g transform="translate(120 0) scale(-1 1)">${paths}</g>`;
}

function figure(shapes, cls, label) {
  return `
    <svg class="bm-fig" viewBox="10 2 100 240" role="img" aria-label="${esc(label)}">
      <g class="bm-base">
        <ellipse cx="60" cy="17.5" rx="9.2" ry="11.3"/>
        <path d="M54.5 26h11l1.2 9h-13.4Z"/>
        ${BASE}<g transform="translate(120 0) scale(-1 1)">${BASE}</g>
      </g>
      ${side(shapes, cls)}
    </svg>`;
}

// classOf(group) → Klassenname(n) für die Fläche, z. B. "lv3" oder "tired"
export function bodyMap(classOf, { caption = true } = {}) {
  const cls = (g) => classOf(g) || 'lv0';
  return `
    <div class="bodymap">
      <figure>${figure(FRONT, cls, 'Körper von vorn')}${caption ? '<figcaption>Vorn</figcaption>' : ''}</figure>
      <figure>${figure(BACK, cls, 'Körper von hinten')}${caption ? '<figcaption>Hinten</figcaption>' : ''}</figure>
    </div>`;
}
