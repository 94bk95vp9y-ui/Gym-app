// Kondition fürs Zimmer: kampfsporttypische Zirkel mit Platz- und
// Lautstärke-Angabe je Übung. In der Leise-Zeit ersetzt die App laute
// Übungen automatisch durch leise Varianten; fehlt Ausrüstung, ebenso.
import { Icon } from '../icons.js';
import { Sound } from '../sound.js';
import { Store } from '../storage.js';
import { fx, qs, qsa, escapeHtml, getProfile, quietNow, plural, uidShort, remountSheet } from './core.js';
import { startSession } from './player.js';

export const EXERCISES = [
  { id: 'flurry', name: 'Schlag-Flurry', emoji: '🥊', quiet: true, cue: 'Geraden so schnell wie möglich – Hände sofort zurück in die Deckung.' },
  { id: 'shadow', name: 'Schattenboxen', emoji: '🥊', quiet: true, cue: 'Locker bewegen, Kombinationen, Kopf bewegen.' },
  { id: 'burpee', name: 'Burpees', emoji: '🔥', quiet: false, alt: 'burpee-q', cue: 'Brust zum Boden, explosiv hoch, kleiner Sprung.' },
  { id: 'burpee-q', name: 'Stille Burpees', emoji: '🔥', quiet: true, cue: 'Ohne Sprung, Füße nacheinander zurück – leise, aber hart.' },
  { id: 'sprawl', name: 'Sprawls', emoji: '🤼', quiet: false, alt: 'sprawl-q', cue: 'Hüfte schnell zum Boden, Beine nach hinten, sofort zurück in Stellung.' },
  { id: 'sprawl-q', name: 'Kontrollierte Sprawls', emoji: '🤼', quiet: true, cue: 'Ohne Aufprall ablegen, schnell wieder hoch.' },
  { id: 'mountain', name: 'Mountain Climbers', emoji: '⛰️', quiet: true, cue: 'Hüfte tief, Knie abwechselnd zügig zur Brust.' },
  { id: 'bear', name: 'Bear Crawl auf der Stelle', emoji: '🐻', quiet: true, cue: 'Knie knapp über dem Boden, zwei Schritte vor, zwei zurück.' },
  { id: 'hollow', name: 'Hollow Hold', emoji: '🍌', quiet: true, cue: 'Unterer Rücken bleibt am Boden, Arme und Beine lang.' },
  { id: 'vup', name: 'V-Ups', emoji: '✌️', quiet: true, cue: 'Hände und Füße treffen sich über der Hüfte.' },
  { id: 'twist', name: 'Russian Twists', emoji: '🌀', quiet: true, cue: 'Oberkörper dreht, der Blick folgt den Händen.' },
  { id: 'taps', name: 'Plank mit Schultertippen', emoji: '🧱', quiet: true, cue: 'Hüfte bleibt ruhig, abwechselnd die Schulter tippen.' },
  { id: 'deadbug', name: 'Dead Bug', emoji: '🪲', quiet: true, cue: 'Rücken am Boden, Gegenarm und -bein langsam strecken.' },
  { id: 'sideplank', name: 'Seitstütz', emoji: '📐', quiet: true, cue: 'Hüfte hoch – zur Halbzeit Seite wechseln.' },
  { id: 'pushup', name: 'Liegestütze', emoji: '💪', quiet: true, cue: 'Körper wie ein Brett, Brust bis knapp über den Boden.' },
  { id: 'pushup-x', name: 'Explosive Liegestütze', emoji: '💥', quiet: false, alt: 'pushup', cue: 'Hände lösen sich kurz vom Boden.' },
  { id: 'squatjump', name: 'Squat Jumps', emoji: '🦘', quiet: false, alt: 'squat', cue: 'Tief runter, explosiv hoch, weich landen.' },
  { id: 'squat', name: 'Schnelle Kniebeugen', emoji: '🦵', quiet: true, cue: 'Volle Tiefe, zügiges Tempo.' },
  { id: 'lunge', name: 'Ausfallschritte rückwärts', emoji: '🦵', quiet: true, cue: 'Hinteres Knie knapp über dem Boden, im Wechsel.' },
  { id: 'skater', name: 'Skater-Sprünge', emoji: '⛸️', quiet: false, alt: 'lunge', space: 'medium', cue: 'Seitlich springen, auf einem Bein landen.' },
  { id: 'highknees', name: 'High Knees', emoji: '🏃', quiet: false, alt: 'mountain', cue: 'Knie hoch, Arme aktiv mitnehmen.' },
  { id: 'jacks', name: 'Hampelmänner', emoji: '⭐', quiet: false, alt: 'shadow', cue: 'Locker und schnell.' },
  { id: 'wallsit', name: 'Wandsitz', emoji: '🧱', quiet: true, cue: 'Oberschenkel waagerecht, Rücken an der Wand.' },
  { id: 'guard', name: 'Deckung halten mit Kurzhanteln', emoji: '🏋️', quiet: true, equip: 'dumbbells', alt: 'flurry', cue: 'Leichte Hanteln (1–2 kg) in Deckungshöhe, Ellbogen eng, Schultern tief.' },
  { id: 'raise', name: 'Frontheben leicht', emoji: '🏋️', quiet: true, equip: 'dumbbells', alt: 'taps', cue: 'Leichte Hanteln bis Schulterhöhe, langsam ablassen.' },
  { id: 'knees', name: 'Knie-Serie', emoji: '🦵', quiet: true, cue: 'Hüfte schiebt, Knie im Wechsel nach vorn-oben.' },
  { id: 'teeps', name: 'Teep-Serie', emoji: '🦶', quiet: true, cue: 'Knie hoch, stoßen, zurück – im Wechsel.' },
  { id: 'rope', name: 'Seilspringen', emoji: '🪢', quiet: false, equip: 'rope', alt: 'shadow', space: 'medium', cue: 'Locker auf den Ballen.' },
  { id: 'bag', name: 'Sack-Flurry', emoji: '🎒', quiet: false, equip: 'bag', alt: 'flurry', cue: 'Schnelle Geraden am Sack, Handgelenk gerade.' },
  { id: 'neck', name: 'Nacken isometrisch', emoji: '🧠', quiet: true, cue: 'Hand an Stirn, Hinterkopf, Seiten – jeweils sanft gegenhalten.' },
  { id: 'sitout', name: 'Sit-Outs', emoji: '🔄', quiet: true, cue: 'Aus dem Vierfüßler ein Bein unter dem Körper durchschieben, Seite wechseln.' },
];
const EX = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

const items = (ids, work) => ids.map((id) => ({ id, sec: work }));
export const CIRCUITS = [
  {
    id: 'quiet', name: 'Fight-Zirkel leise', icon: '🤫', desc: 'Voller Kampfsport-Zirkel ohne Sprünge – für abends.',
    rounds: 4, work: 40, rest: 15, roundRest: 60, list: items(['shadow', 'burpee-q', 'mountain', 'hollow', 'guard'], 40),
  },
  {
    id: 'fight', name: 'Kampfrunden-Simulation', icon: '🥊', desc: 'Wie ein Kampf: 5 Runden à 3 Minuten mit Tempowechseln.',
    rounds: 5, work: 30, rest: 0, roundRest: 60, list: [{ id: 'flurry', sec: 30 }, { id: 'sprawl', sec: 30 }, { id: 'shadow', sec: 60 }, { id: 'mountain', sec: 30 }, { id: 'flurry', sec: 30 }],
  },
  {
    id: 'tabata', name: 'Tabata explosiv', icon: '⚡', desc: '4 Blöcke je 8 × 20 s Vollgas / 10 s Pause.',
    rounds: 1, work: 20, rest: 10, roundRest: 0, tabata: ['burpee', 'sprawl', 'squatjump', 'highknees'],
  },
  {
    id: 'core', name: 'Core für Kämpfer', icon: '🧱', desc: 'Rumpf, der Schläge verträgt und Kraft überträgt.',
    rounds: 2, work: 40, rest: 20, roundRest: 45, list: items(['hollow', 'vup', 'twist', 'taps', 'deadbug', 'sideplank'], 40),
  },
  {
    id: 'shoulder', name: 'Schulter-Ausdauer', icon: '🏋️', desc: 'Damit die Hände in Runde 3 noch oben sind.',
    rounds: 3, work: 45, rest: 15, roundRest: 45, list: [{ id: 'guard', sec: 60 }, { id: 'raise', sec: 45 }, { id: 'flurry', sec: 30 }, { id: 'pushup', sec: 30 }],
  },
  {
    id: 'legs', name: 'Beine & Explosivität', icon: '🦘', desc: 'Sprungkraft und Beinausdauer für Tritte und Beinarbeit.',
    rounds: 3, work: 35, rest: 15, roundRest: 60, list: items(['squatjump', 'lunge', 'skater', 'wallsit', 'knees'], 35),
  },
  {
    id: 'emom', name: 'EMOM 12', icon: '⏱️', desc: 'Jede Minute eine Aufgabe, der Rest der Minute ist Pause.',
    emom: [
      { id: 'burpee', reps: 10 }, { id: 'mountain', reps: 30 }, { id: 'pushup', reps: 15 }, { id: 'flurry', reps: 40 },
    ], minutes: 12,
  },
];

// Übung an Zimmer, Uhrzeit und Ausrüstung anpassen
function adapt(id, { quiet, equipment }) {
  let e = EX[id];
  let guard = 0;
  while (e && guard < 4 && ((quiet && e.quiet === false) || (e.equip && !equipment[e.equip]))) {
    e = EX[e.alt] || EX.shadow;
    guard += 1;
  }
  return e || EX.shadow;
}

export function circuitSegments(c, { quiet, equipment }) {
  const segs = [{ kind: 'prep', seconds: 10, label: c.name, sub: 'Gleich geht’s los.' }];
  if (c.emom) {
    for (let m = 0; m < c.minutes; m += 1) {
      const task = c.emom[m % c.emom.length];
      const ex = adapt(task.id, { quiet, equipment });
      segs.push({ kind: 'work', seconds: 60, round: m + 1, rounds: c.minutes, label: `${task.reps} × ${ex.name}`, sub: `${ex.cue} Wenn fertig: Pause bis zur nächsten Minute.`, phase: `Minute ${m + 1}`, exercise: ex.id, announce: `${task.reps} ${ex.name}` });
    }
    return segs;
  }
  if (c.tabata) {
    c.tabata.forEach((id, bi) => {
      const ex = adapt(id, { quiet, equipment });
      for (let i = 0; i < 8; i += 1) {
        segs.push({ kind: 'work', seconds: 20, round: bi + 1, rounds: c.tabata.length, label: ex.name, sub: ex.cue, phase: `${ex.emoji} ${i + 1}/8`, exercise: ex.id, announce: i === 0 ? ex.name : '' });
        if (i < 7) segs.push({ kind: 'rest', seconds: 10, label: 'Pause', announce: '' });
      }
      if (bi < c.tabata.length - 1) segs.push({ kind: 'rest', seconds: 60, label: 'Blockpause', sub: `Als Nächstes: ${adapt(c.tabata[bi + 1], { quiet, equipment }).name}` });
    });
    return segs;
  }
  for (let r = 0; r < c.rounds; r += 1) {
    c.list.forEach((it, i) => {
      const ex = adapt(it.id, { quiet, equipment });
      const next = c.list[i + 1] ? adapt(c.list[i + 1].id, { quiet, equipment }) : null;
      segs.push({ kind: 'work', seconds: it.sec || c.work, round: r + 1, rounds: c.rounds, label: ex.name, sub: ex.cue, phase: `${ex.emoji} ${ex.name}`, exercise: ex.id, announce: `${ex.name}. ${it.sec || c.work} Sekunden.` });
      if (next && c.rest) segs.push({ kind: 'rest', seconds: c.rest, label: 'Kurz durchatmen', sub: `Als Nächstes: ${next.name}`, announce: `Als Nächstes: ${next.name}` });
    });
    if (r < c.rounds - 1 && c.roundRest) segs.push({ kind: 'rest', seconds: c.roundRest, label: `Runde ${r + 1} geschafft`, sub: 'Locker gehen, tief atmen.' });
  }
  return segs;
}

function totalMinutes(c) {
  if (c.emom) return c.minutes;
  if (c.tabata) return Math.round((c.tabata.length * 240 + (c.tabata.length - 1) * 60) / 60);
  const per = c.list.reduce((n, it) => n + (it.sec || c.work), 0) + c.rest * (c.list.length - 1);
  return Math.round((per * c.rounds + c.roundRest * (c.rounds - 1)) / 60);
}

export function openConditioning() {
  const profile = getProfile();
  const quiet = quietNow(profile);
  const custom = Store.getFightCircuits();
  const all = [...CIRCUITS, ...custom];
  const card = (c) => {
    const loud = !c.emom && (c.tabata || c.list.map((i) => i.id)).some((id) => EX[id]?.quiet === false);
    return `
      <button class="f-circ" data-c="${c.id}">
        <span class="f-circ-icon">${c.icon || '🔥'}</span>
        <span class="f-circ-text"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.desc || '')}</span>
          <span class="f-circ-meta">${totalMinutes(c)} Min${loud ? (quiet ? ' · leise angepasst' : ' · mit Sprüngen') : ' · leise'}${c.custom ? ' · eigener' : ''}</span></span>
        ${Icon.chevron}
      </button>`;
  };
  fx.ctx.openSheet('Kondition', `
    ${quiet ? `<p class="f-quiet-note">${Icon.voiceOff} Leise-Zeit: Sprünge werden durch leise Varianten ersetzt.</p>` : ''}
    <div class="f-circ-list">${all.map(card).join('')}</div>
    <button class="btn f-btn-dark full" style="margin-top:12px" data-c-new>${Icon.plus} Eigenen Zirkel bauen</button>`, {
    onMount: (root) => {
      qsa('[data-c]', root).forEach((b) => b.addEventListener('click', () => {
        const c = all.find((x) => x.id === b.dataset.c);
        openCircuit(c);
      }));
      qs('[data-c-new]', root).addEventListener('click', () => openEditor());
    },
  });
}

function openCircuit(c) {
  const profile = getProfile();
  const ctx = { quiet: quietNow(profile), equipment: profile.equipment };
  const segs = circuitSegments(c, ctx);
  const list = c.emom ? c.emom.map((t) => `${t.reps} × ${adapt(t.id, ctx).name}`) : c.tabata ? c.tabata.map((id) => `8 × 20 s ${adapt(id, ctx).name}`) : c.list.map((it) => `${it.sec || c.work} s ${adapt(it.id, ctx).name}`);
  fx.ctx.openSheet(c.name, `
    <p class="muted small f-setup-intro">${escapeHtml(c.desc || '')}</p>
    <div class="card list f-circ-steps">${list.map((t, i) => `<div class="list-item"><span class="f-num f-circ-n">${i + 1}</span><div class="list-item-main"><strong>${escapeHtml(t)}</strong></div></div>`).join('')}</div>
    <p class="muted small">${c.emom ? `${c.minutes} Minuten` : c.tabata ? `${c.tabata.length} Blöcke` : `${plural(c.rounds, 'Runde', 'Runden')} · ${c.rest ? `${c.rest} s Pause zwischen Übungen · ` : ''}${c.roundRest ? `${c.roundRest} s zwischen Runden` : ''}`} · ca. ${totalMinutes(c)} Min</p>`, {
    footer: `<button class="btn btn-primary full f-bigbtn" data-go data-nosound>${Icon.play} Starten</button>${c.custom ? `<button class="btn btn-ghost full" data-edit>Bearbeiten</button>` : ''}`,
    onMount: (root) => {
      qs('[data-go]', root).addEventListener('click', () => {
        fx.ctx.closeSheet();
        Sound.start();
        startSession({
          type: 'conditioning', title: c.name, segments: segs, bells: 'beep', figure: null,
          logExtra: () => ({ circuit: c.id, circuitName: c.name }),
        });
      });
      qs('[data-edit]', root)?.addEventListener('click', () => openEditor(c));
    },
  });
}

function openEditor(existing = null) {
  const d = existing ? JSON.parse(JSON.stringify(existing)) : { id: `u${uidShort()}`, name: '', icon: '🔥', rounds: 3, work: 40, rest: 15, roundRest: 60, list: [], custom: true, desc: 'Eigener Zirkel' };
  const draw = () => `
    <label class="f-field"><span>Name</span><input class="text-input" id="ce-name" value="${escapeHtml(d.name)}" placeholder="z. B. Abend-Zirkel" /></label>
    <div class="f-opt"><span class="f-opt-label">Runden</span><div class="f-seg" data-o="rounds">${[1, 2, 3, 4, 5, 6].map((v) => `<button data-v="${v}" class="${v === d.rounds ? 'on' : ''}">${v}</button>`).join('')}</div></div>
    <div class="f-opt"><span class="f-opt-label">Arbeit je Übung</span><div class="f-seg" data-o="work">${[20, 30, 40, 45, 60].map((v) => `<button data-v="${v}" class="${v === d.work ? 'on' : ''}">${v} s</button>`).join('')}</div></div>
    <div class="f-opt"><span class="f-opt-label">Pause dazwischen</span><div class="f-seg" data-o="rest">${[0, 10, 15, 20, 30].map((v) => `<button data-v="${v}" class="${v === d.rest ? 'on' : ''}">${v} s</button>`).join('')}</div></div>
    <div class="f-sec" style="margin-top:6px">Übungen (${d.list.length})</div>
    <div class="card list">${d.list.length ? d.list.map((it, i) => `<div class="list-item"><span>${EX[it.id].emoji}</span><div class="list-item-main"><strong>${escapeHtml(EX[it.id].name)}</strong><span class="muted small">${EX[it.id].quiet === false ? 'laut' : 'leise'}</span></div>
      <button class="icon-btn small" data-up="${i}" aria-label="Nach oben">${Icon.toTop}</button><button class="icon-btn small" data-rm="${i}" aria-label="Entfernen">${Icon.minus}</button></div>`).join('') : '<p class="empty small">Unten Übungen antippen.</p>'}</div>
    <div class="f-sec" style="margin-top:12px">Hinzufügen</div>
    <div class="f-chips">${EXERCISES.map((e) => `<button class="f-chip" data-add="${e.id}">${e.emoji} ${escapeHtml(e.name)}</button>`).join('')}</div>`;
  const mount = () => remountSheet(() => fx.ctx.openSheet(existing ? 'Zirkel bearbeiten' : 'Eigener Zirkel', draw(), {
    footer: `<button class="btn btn-primary full" data-save ${d.list.length ? '' : 'disabled'}>Speichern</button>${existing ? `<button class="btn btn-ghost danger full" data-del>${Icon.trash} Löschen</button>` : ''}`,
    onMount: (root) => {
      qs('#ce-name', root).addEventListener('input', (e) => { d.name = e.target.value; });
      qsa('[data-o]', root).forEach((seg) => qsa('button', seg).forEach((b) => b.addEventListener('click', () => {
        d[seg.dataset.o] = +b.dataset.v;
        qsa('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      })));
      qsa('[data-add]', root).forEach((b) => b.addEventListener('click', () => { d.list.push({ id: b.dataset.add, sec: 0 }); Sound.setDone(); mount(); }));
      qsa('[data-rm]', root).forEach((b) => b.addEventListener('click', () => { d.list.splice(+b.dataset.rm, 1); mount(); }));
      qsa('[data-up]', root).forEach((b) => b.addEventListener('click', () => {
        const i = +b.dataset.up;
        if (i > 0) { [d.list[i - 1], d.list[i]] = [d.list[i], d.list[i - 1]]; mount(); }
      }));
      qs('[data-save]', root)?.addEventListener('click', () => {
        d.name = d.name.trim() || 'Eigener Zirkel';
        d.list = d.list.map((it) => ({ id: it.id, sec: 0 }));
        const list = Store.getFightCircuits().filter((c) => c.id !== d.id);
        Store.saveFightCircuits([...list, d]);
        fx.ctx.closeSheet();
        fx.ctx.toast('Zirkel gespeichert');
      });
      qs('[data-del]', root)?.addEventListener('click', () => {
        if (!confirm('Zirkel löschen?')) return;
        Store.saveFightCircuits(Store.getFightCircuits().filter((c) => c.id !== d.id));
        fx.ctx.closeSheet();
      });
    },
  }));
  mount();
}

export { EX };
