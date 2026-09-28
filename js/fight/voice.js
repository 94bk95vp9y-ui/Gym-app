// Sprachansagen im Fight-Modus (Web Speech, offline mit iOS-Stimmen).
import { Store } from '../storage.js';

let voice = null;
function pick() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  voice = voices.find((v) => v.lang === 'de-DE' && /Anna|Helena|Petra|Markus|Yannick|Google/i.test(v.name))
    || voices.find((v) => v.lang?.startsWith('de')) || null;
}
if ('speechSynthesis' in window) {
  pick();
  speechSynthesis.addEventListener?.('voiceschanged', pick);
}

export const voiceEnabled = () => Store.getSettings().fightVoice !== false;

export function setVoiceEnabled(on) {
  Store.saveSettings({ ...Store.getSettings(), fightVoice: !!on });
  if (!on) stopVoice();
}

// rate: Tempo der Ansage; interrupt: laufende Ansage abbrechen
export function speak(text, { rate = 1.08, interrupt = true, pitch = 1 } = {}) {
  if (!text || !voiceEnabled() || !('speechSynthesis' in window)) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = rate;
    u.pitch = pitch;
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch { /* ohne Ansage weiter */ }
}

export function stopVoice() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// iOS gibt Sprache erst nach einer Berührung frei – beim Start einer Einheit
// einmal leise anstoßen.
export function primeVoice() {
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch { /* egal */ }
}

// Bildschirm während einer Einheit anlassen
let lock = null;
export async function holdScreen() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { lock = await navigator.wakeLock.request('screen'); } catch { lock = null; }
}
export function releaseScreen() {
  if (lock && !lock.released) lock.release().catch(() => {});
  lock = null;
}
