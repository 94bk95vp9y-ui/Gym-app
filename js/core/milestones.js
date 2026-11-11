// Meilensteine: runde Marken über alle Trainings – wie viele geschafft sind
// und wie weit es bis zur nächsten ist. Ohne DOM.
import { Store } from './store.js';
import { lifetime, bestWeekStreak } from './insights.js';

// Je Reihe die Marken in aufsteigender Folge. value(l) liest den Stand aus
// den Gesamtzahlen.
const TRACKS = [
  { id: 'count', label: 'Trainings', unit: '', marks: [1, 10, 25, 50, 100, 150, 200, 300, 400, 500, 750, 1000], value: (l) => l.count },
  { id: 'volume', label: 'bewegt', unit: 't', marks: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000], value: (l, unit) => (unit === 'lb' ? l.volume / 2204.6 : l.volume / 1000) },
  { id: 'streak', label: 'Wochen im Ziel', unit: 'Wo.', marks: [2, 4, 8, 12, 26, 52, 104], value: (l, unit, streak) => streak },
  { id: 'prs', label: 'Rekorde', unit: '', marks: [1, 10, 25, 50, 100, 250, 500], value: (l) => l.prs },
  { id: 'hours', label: 'Trainingszeit', unit: 'h', marks: [10, 25, 50, 100, 250, 500, 1000], value: (l) => l.minutes / 60 },
];

// [{ id, label, unit, value, reached (letzte geschaffte Marke oder null),
//    next (nächste Marke oder null), progress (0–1 auf dem Weg zur nächsten) }]
export function milestones() {
  const all = lifetime();
  if (!all) return [];
  const unit = Store.getSettings().unit;
  const streak = bestWeekStreak();
  return TRACKS.map((t) => {
    const value = t.value(all, unit, streak);
    const reached = [...t.marks].reverse().find((m) => value >= m) ?? null;
    const next = t.marks.find((m) => value < m) ?? null;
    const from = reached || 0;
    const progress = next ? Math.max(0, Math.min(1, (value - from) / (next - from))) : 1;
    return { id: t.id, label: t.label, unit: t.unit, value, reached, next, progress };
  });
}
