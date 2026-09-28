// Technik-Lektion (~5 Minuten), aufgebaut wie beim Lernen mit Trainer:
// 1. zuschauen (Echtzeit, dann Zeitlupe), 2. langsam mitmachen – die Figur
// zählt mit, 3. im Tempo auf Ansage, 4. allein ohne Vorlage, 5. in
// Kombinationen einbauen, 6. ehrlicher Selbst-Check.
// Erst geblockt, dann gemischt: so bleibt eine neue Bewegung am besten hängen.
import { TECH, COMBOS } from './data-tech.js';
import { comboPool, markSeen } from './progress.js';
import { startSession } from './player.js';
import { speak } from './voice.js';

export function startLesson(id) {
  const tech = TECH[id];
  if (!tech) return;
  markSeen(id);
  const cues = tech.cues;
  const rotate = (every) => (t, p) => {
    const i = Math.floor(t / every) % cues.length;
    if (p.cueIdx === i) return;
    p.cueIdx = i;
    p.dom.text.textContent = cues[i];
    if (t > 1) speak(cues[i], { rate: 1.04, interrupt: false });
  };
  // Kombinationen, in denen die Technik vorkommt (aus dem freigeschalteten Pool
  // plus die Technik selbst – für die Lektion reicht, dass man sie gesehen hat)
  const known = comboPool(undefined, {}).filter((c) => c.seq.includes(id));
  const extra = COMBOS.filter((c) => c.seq.includes(id) && c.seq.every((x) => x === id || known.some((k) => k.seq.includes(x)) || TECH[x].belt < tech.belt));
  const canMix = tech.cat !== 'stance' && tech.cat !== 'footwork' && (known.length || extra.length);

  const segments = [
    { kind: 'prep', seconds: 8, label: `Lektion: ${tech.name}`, sub: 'Schau zuerst genau hin.', announce: `Lektion ${tech.name}. Schau zuerst genau hin.` },
    { kind: 'work', seconds: 18, phase: 'Zuschauen', label: 'Zuschauen', sub: tech.what, fig: { mode: 'loop', tech: id, speed: 1, lead: 0.6, tail: 0.9 }, announce: 'Erst in Echtzeit.' },
    { kind: 'work', seconds: 24, phase: 'Zeitlupe', label: 'Zeitlupe', fig: { mode: 'loop', tech: id, speed: 0.3, lead: 0.3, tail: 0.5 }, onTick: rotate(8), announce: 'Jetzt in Zeitlupe. Achte auf die Merkpunkte.' },
    { kind: 'work', seconds: 60, phase: 'Langsam mitmachen', label: 'Langsam mitmachen', sub: 'Mach jede Bewegung mit der Figur mit. Sauber vor schnell.', fig: { mode: 'count', tech: id, speed: 0.45, lead: 0.5, tail: 0.6, say: 'count', view: 'mirror' }, announce: 'Mach langsam mit. Ich zähle.' },
    { kind: 'rest', seconds: 15, label: 'Kurz lockern', sub: 'Gleich: im Tempo auf Ansage.' },
    { kind: 'work', seconds: 45, phase: 'Im Tempo', label: 'Im Tempo', sub: 'Auf jede Ansage eine saubere Technik, dann zurück in die Deckung.', fig: { mode: 'count', tech: id, speed: 1, lead: 1.0, tail: 0.9, say: tech.say, view: 'mirror' }, announce: 'Jetzt im Tempo, auf meine Ansage.' },
    { kind: 'rest', seconds: 15, label: 'Kurz lockern', sub: 'Gleich: ohne Vorlage.' },
    { kind: 'work', seconds: 45, phase: 'Allein', label: 'Allein', sub: cues[0], fig: { mode: 'idle' }, onTick: rotate(12), announce: 'Jetzt allein, in deinem Rhythmus. Qualität vor Tempo.' },
  ];
  if (canMix) {
    segments.push({ kind: 'rest', seconds: 15, label: 'Kurz lockern', sub: 'Gleich: in Kombinationen einbauen.' });
    segments.push({ kind: 'work', seconds: 60, phase: 'Einbauen', label: 'Einbauen', theme: 'combos', coach: true, sub: 'Kombinationen mit der neuen Technik.', announce: 'Jetzt in Kombinationen.' });
  }

  startSession({
    type: 'lesson',
    title: `Lektion · ${tech.name}`,
    segments,
    bells: 'beep',
    figure: 'big',
    lesson: id,
    coach: canMix ? { mode: 'lesson', onlyTech: id, tempo: 1 } : null,
    selfCheck: { techId: id, title: tech.name, items: [...cues, 'Die Deckung blieb die ganze Zeit oben.'] },
    doneTitle: 'Lektion geschafft',
    logExtra: () => ({ technique: id }),
  });
}
