// Haptisches Feedback. Web-Apps haben auf dem iPhone keine Vibrations-
// Schnittstelle – Safari gibt aber beim Umschalten eines Schalters
// (<input type="checkbox" switch>) ein kurzes Klopfen. Seit iOS 26.5 zählt
// dafür nur ein echter Tipp: per Skript ausgelöste Klicks bleiben stumm.
// Deshalb liegt in Knöpfen, die klopfen sollen, ein unsichtbarer Schalter
// (HAP) über der ganzen Fläche. Der Tipp trifft den Schalter, der Klick
// läuft trotzdem zum Knopf weiter.
//
// Auf Geräten mit navigator.vibrate (Android) übernimmt haptic() die Rolle.
export const HAP = '<input type="checkbox" switch class="hap" tabindex="-1" aria-hidden="true">';

let enabled = true;

export function setHapticsEnabled(on) {
  enabled = !!on;
  document.documentElement.classList.toggle('no-haptics', !enabled);
}

const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
document.documentElement.classList.toggle('ios', ios);

// Nur für Geräte mit Vibration – auf dem iPhone erledigt das der Schalter
export function haptic(times = 1) {
  if (!enabled || ios || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(times > 1 ? [12, 60, 12] : 12);
}
