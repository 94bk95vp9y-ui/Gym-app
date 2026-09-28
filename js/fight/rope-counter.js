// Seilsprung-Zähler (Beta) über den Bewegungssensor: jede Landung ist eine
// kurze Beschleunigungsspitze. Das Handy muss eng am Körper sitzen
// (Hosentasche), sonst zählt es ungenau.
//
// Wichtig für iOS: Die Erlaubnis muss direkt im Tipp angefragt werden –
// deshalb startet createRopeCounter() die Anfrage sofort, ohne vorher zu warten.
export function createRopeCounter() {
  if (typeof window.DeviceMotionEvent === 'undefined') return Promise.resolve(null);
  const ask = typeof DeviceMotionEvent.requestPermission === 'function'
    ? DeviceMotionEvent.requestPermission().then((r) => r === 'granted').catch(() => false)
    : Promise.resolve(true);
  return ask.then((ok) => {
    if (!ok) return null;
    let count = 0;
    let last = 0;
    let armed = true;
    let baseline = 9.81;
    let samples = 0;
    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      samples += 1;
      const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      baseline = baseline * 0.97 + mag * 0.03;
      const now = performance.now();
      if (armed && mag > baseline + 5.5 && now - last > 200) {
        count += 1;
        last = now;
        armed = false;
      } else if (!armed && mag < baseline + 1.5) {
        armed = true;
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return {
      count: () => count,
      working: () => samples > 5,
      stop: () => window.removeEventListener('devicemotion', onMotion),
    };
  });
}
