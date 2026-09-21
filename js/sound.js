// Kurze, synthetisierte Töne statt Audiodateien: nichts nachzuladen, keine
// Verzögerung beim ersten Abspielen und volle Kontrolle über Klangfarbe und
// Lautstärke.
//
// Was einen Klick befriedigend macht, ist weniger der Ton als der Anschlag:
// ein sehr kurzer, gefilterter Rauschimpuls liefert das "Klack", darunter
// liegt ein kurzer gestimmter Körper, der schnell ausklingt. Ein reiner
// Sinus allein klingt nach Piepser, nicht nach Schalter.

let ctx = null;
let master = null;
let enabled = true;
let volume = 0.7;
let style = 'click';

export const SOUND_STYLES = [
  { id: 'click', label: 'Klick' },
  { id: 'pop', label: 'Pop' },
  { id: 'marimba', label: 'Marimba' },
];

export function setSoundEnabled(on) { enabled = !!on; }

export function setSoundVolume(value) {
  volume = Math.max(0, Math.min(1, value));
  if (master) master.gain.value = volume * 1.4;
}

export function setSoundStyle(id) {
  style = SOUND_STYLES.some((s) => s.id === id) ? id : 'click';
}

// iOS erlaubt Audio nur aus einer Nutzergeste heraus, deshalb wird der
// Kontext erst beim ersten Ton angelegt und danach bei Bedarf fortgesetzt.
function audio() {
  if (!enabled || volume <= 0) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) {
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = volume * 1.4;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Gefilterter Rauschimpuls – der eigentliche "Klack".
function noise(ac, at, { dur = 0.028, peak = 0.3, freq = 2600, q = 0.8 } = {}) {
  const t0 = ac.currentTime + at;
  const frames = Math.max(1, Math.ceil(ac.sampleRate * dur));
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // schon in den Daten ausklingen lassen: ergibt einen knackigen Transienten
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq;
  band.Q.value = q;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(peak, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(band).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.01);
}

// Gestimmter Körper, optional mit Tonhöhenrutsch.
function pluck(ac, at, { from, to = null, dur = 0.12, peak = 0.3, type = 'sine' } = {}) {
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + Math.min(dur * 0.6, 0.05));
  // Über Null starten und enden, sonst knackt es an den Rändern.
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Die drei Klangfarben unterscheiden sich vor allem im Anteil des
// Rauschimpulses und in der Länge des Nachklangs.
const STYLES = {
  click: {
    done: (ac) => {
      noise(ac, 0, { dur: 0.026, peak: 0.42, freq: 3000, q: 0.7 });
      pluck(ac, 0.004, { from: 660, to: 1320, dur: 0.1, peak: 0.34, type: 'triangle' });
      pluck(ac, 0.01, { from: 330, dur: 0.07, peak: 0.12 });
    },
    tap: (ac) => noise(ac, 0, { dur: 0.016, peak: 0.16, freq: 3400, q: 1.1 }),
  },
  pop: {
    done: (ac) => {
      noise(ac, 0, { dur: 0.014, peak: 0.2, freq: 1800, q: 1.4 });
      pluck(ac, 0, { from: 420, to: 1150, dur: 0.14, peak: 0.42, type: 'sine' });
    },
    tap: (ac) => pluck(ac, 0, { from: 700, to: 1000, dur: 0.035, peak: 0.14 }),
  },
  marimba: {
    done: (ac) => {
      pluck(ac, 0, { from: 784, dur: 0.16, peak: 0.36, type: 'sine' });
      pluck(ac, 0, { from: 1568, dur: 0.09, peak: 0.1, type: 'sine' });
      pluck(ac, 0.055, { from: 1175, dur: 0.24, peak: 0.28, type: 'sine' });
    },
    tap: (ac) => pluck(ac, 0, { from: 1400, dur: 0.045, peak: 0.12, type: 'sine' }),
  },
};

function withAudio(fn) {
  const ac = audio();
  if (ac) fn(ac);
}

export const Sound = {
  // Allgemeiner Tastendruck – bewusst leise, soll nur Textur sein.
  tap() { withAudio((ac) => STYLES[style].tap(ac)); },

  // Satz abgehakt: der Hauptklang der App.
  setDone() { withAudio((ac) => STYLES[style].done(ac)); },

  // Haken zurückgenommen: tiefer, kürzer, eindeutig das Gegenteil.
  setUndone() {
    withAudio((ac) => {
      noise(ac, 0, { dur: 0.018, peak: 0.12, freq: 1200, q: 1 });
      pluck(ac, 0, { from: 520, to: 300, dur: 0.1, peak: 0.16 });
    });
  },

  // Aufklappen / Zuklappen
  open() { withAudio((ac) => pluck(ac, 0, { from: 620, to: 900, dur: 0.06, peak: 0.14 })); },
  close() { withAudio((ac) => pluck(ac, 0, { from: 760, to: 520, dur: 0.06, peak: 0.12 })); },

  // Training startet: kurzer Anlauf nach oben.
  start() {
    withAudio((ac) => {
      pluck(ac, 0, { from: 392, dur: 0.1, peak: 0.24 });
      pluck(ac, 0.06, { from: 587, dur: 0.14, peak: 0.26 });
    });
  },

  // Etwas entfernt: kurz und tief.
  remove() {
    withAudio((ac) => {
      noise(ac, 0, { dur: 0.02, peak: 0.14, freq: 900, q: 1.2 });
      pluck(ac, 0, { from: 300, to: 190, dur: 0.11, peak: 0.16 });
    });
  },

  // Neuer Rekord: aufsteigender Dreiklang mit Nachklang.
  record() {
    withAudio((ac) => {
      noise(ac, 0, { dur: 0.02, peak: 0.28, freq: 3200 });
      [523, 659, 880].forEach((f, i) => pluck(ac, i * 0.07, { from: f, dur: 0.2, peak: 0.3 }));
      pluck(ac, 0.21, { from: 1319, dur: 0.55, peak: 0.24 });
    });
  },

  // Pause vorbei: zwei ruhige Schläge, nicht alarmierend.
  restOver() {
    withAudio((ac) => {
      pluck(ac, 0, { from: 880, dur: 0.24, peak: 0.3 });
      pluck(ac, 0.2, { from: 880, dur: 0.34, peak: 0.24 });
    });
  },

  // Training beendet: auflösender Dur-Dreiklang.
  finish() {
    withAudio((ac) => {
      [523, 659, 784].forEach((f, i) => pluck(ac, i * 0.08, { from: f, dur: 0.28, peak: 0.28 }));
      pluck(ac, 0.24, { from: 1047, dur: 0.75, peak: 0.26 });
    });
  },
};
