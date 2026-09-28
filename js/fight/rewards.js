// Nach einer Einheit: Lernfortschritt feiern, XP vergeben, Challenges prüfen.
import { fx } from './core.js';
import { TECH } from './data-tech.js';
import { STATE_LABEL } from './progress.js';
import { grantXp, checkChallenges, celebrate } from '../challenges.js';

// Aufstieg einer Technik auf „Sitzt“ (40 XP) oder „Automatisch“ (80 XP)
export function promotionEvents(promoted) {
  const events = [];
  let before = null;
  promoted.filter((p) => p.to >= 3).forEach((p) => {
    const r = grantXp({
      kind: 'technique',
      xp: p.to === 4 ? 80 : 40,
      icon: '🥊',
      kicker: `Technik: ${STATE_LABEL[p.to]}`,
      title: TECH[p.id]?.name || 'Technik',
      sub: p.to === 4 ? 'Über Wochen gefestigt – die Technik läuft jetzt von allein.' : 'Sauber und an vielen Tagen geübt. Der Coach fragt sie weiter ab.',
      big: p.to === 4,
    });
    if (before === null) before = r.before;
    events.push(...r.events);
  });
  return { events, before };
}

export function afterSession({ promoted = [], extraEvents = [], extraBefore = null } = {}) {
  fx.ctx.render();
  const { events, before } = promotionEvents(promoted);
  let xpBefore = extraBefore ?? before;
  const all = [...extraEvents, ...events];
  const ch = checkChallenges();
  if (xpBefore === null) xpBefore = ch.before;
  all.push(...ch.events);
  promoted.filter((p) => p.to === 2).slice(0, 2).forEach((p, i) => {
    setTimeout(() => fx.ctx.toast(`🎯 ${TECH[p.id]?.name}: jetzt „Geübt“ – ab sofort im Coach`), 400 + i * 2300);
  });
  if (all.length) setTimeout(() => celebrate(all, xpBefore, () => fx.ctx.render()), 380);
}
