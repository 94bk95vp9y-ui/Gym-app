// Kurze, synthetisierte Töne statt Audiodateien: nichts nachzuladen, keine
// Verzögerung beim ersten Abspielen und volle Kontrolle über Klangfarbe und
// Lautstärke. Alles bleibt bewusst kurz (unter ~250 ms) und weich – ein
// Sinus mit sanftem Anschlag und exponentiellem Ausklang klingt nach
// Holzstab, nicht nach Systempiepser.

let ctx = null;
let master = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = !!on;
}

// iOS erlaubt Audio nur aus einer Nutzergeste heraus, deshalb wird der
// Kontext erst beim ersten Ton angelegt und danach bei Bedarf fortgesetzt.
function audio() {
  if (!enabled) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) {
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0.5;
    // Nimmt den Höhen die Schärfe, ohne dumpf zu klingen.
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 5200;
    master.connect(soften).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function note(ac, freq, at, { dur = 0.18, peak = 0.22, type = 'sine' } = {}) {
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  // Über Null starten und enden, sonst knackt es an den Rändern.
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function play(sequence) {
  const ac = audio();
  if (!ac) return;
  sequence.forEach(([freq, at, opts]) => note(ac, freq, at, opts));
}

export const Sound = {
  // Satz abgehakt: kleine Quinte nach oben – klingt nach "erledigt".
  setDone() {
    play([[784, 0, { dur: 0.13, peak: 0.2 }], [1175, 0.055, { dur: 0.2, peak: 0.16 }]]);
  },
  // Haken zurückgenommen: tiefer, leiser, eindeutig das Gegenteil.
  setUndone() {
    play([[392, 0, { dur: 0.12, peak: 0.1 }]]);
  },
  // Neuer Rekord: aufsteigender Dreiklang mit Nachklang.
  record() {
    play([
      [523, 0, { dur: 0.16 }],
      [659, 0.07, { dur: 0.18 }],
      [880, 0.14, { dur: 0.22 }],
      [1319, 0.21, { dur: 0.5, peak: 0.16 }],
    ]);
  },
  // Pause vorbei: zwei ruhige Schläge, nicht alarmierend.
  restOver() {
    play([[880, 0, { dur: 0.22, peak: 0.18 }], [880, 0.2, { dur: 0.3, peak: 0.14 }]]);
  },
  // Training beendet: auflösender Dur-Dreiklang.
  finish() {
    play([
      [523, 0, { dur: 0.2 }],
      [659, 0.08, { dur: 0.24 }],
      [784, 0.16, { dur: 0.3 }],
      [1047, 0.24, { dur: 0.7, peak: 0.18 }],
    ]);
  },
};
