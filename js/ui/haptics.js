// Haptisches Feedback. Web-Apps haben auf dem iPhone keine Vibrations-
// Schnittstelle – Safari gibt aber beim Umschalten eines Schalters
// (<input type="checkbox" switch>) ein kurzes Klopfen. Seit iOS 26.5 zählt
// dafür nur ein echter Tipp: per Skript ausgelöste Klicks bleiben stumm.
//
// Deshalb liegt in Knöpfen, die klopfen sollen, ein unsichtbares <label>
// (HAP), das auf einen versteckten Schalter zeigt. Der Tipp trifft das Label,
// das schaltet den Schalter um, der Klick läuft trotzdem zum Knopf weiter.
// Wichtig: unter dem Finger liegt nur das Label, nie der Schalter selbst –
// sonst blockiert er das Scrollen und ein Wisch zählt als Tipp.
//
// Auf Geräten mit navigator.vibrate (Android) übernimmt haptic() die Rolle.
export const HAP = '<label class="hap" for="hap-switch" aria-hidden="true"></label>';

let enabled = true;

export function setHapticsEnabled(on) {
  enabled = !!on;
  document.documentElement.classList.toggle('no-haptics', !enabled);
}

const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
document.documentElement.classList.toggle('ios', ios);

if (!document.getElementById('hap-switch')) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'hap-switch';
  input.setAttribute('switch', '');
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  input.className = 'hap-switch';
  document.body.appendChild(input);
}

// Nur für Geräte mit Vibration – auf dem iPhone erledigt das der Schalter
export function haptic(times = 1) {
  if (!enabled || ios || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(times > 1 ? [12, 60, 12] : 12);
}
