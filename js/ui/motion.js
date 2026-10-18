// Bewegungskurven nach iOS-Vorbild. Federn als CSS linear() – wo das fehlt
// (vor Safari 17.2), eine passende Bézierkurve.
const hasLinear = window.CSS?.supports?.('transition-timing-function', 'linear(0, 1)') ?? false;

const SPRING = {
  // ohne Überschwingen, wie SwiftUI .smooth (Seitenwechsel)
  nav: 'linear(0, 0.058, 0.1815, 0.3227, 0.4574, 0.5754, 0.6735, 0.7523, 0.8141, 0.8618, 0.898, 0.9252, 0.9454, 0.9604, 0.9713, 0.9794, 0.9852, 0.9894, 0.9924, 0.9946, 0.9962, 0.9973, 0.9981, 0.9986, 1)',
  // leicht federnd (Haken, kleine Bestätigungen)
  pop: 'linear(0, 0.0765, 0.2513, 0.4593, 0.6574, 0.822, 0.9437, 1.0231, 1.0665, 1.0826, 1.0805, 1.0679, 1.051, 1.0339, 1.0191, 1.0077, 0.9999, 0.9954, 0.9933, 0.9931, 0.9939, 0.9953, 0.9967, 0.998, 1)',
};

export const EASE = {
  nav: hasLinear ? SPRING.nav : 'cubic-bezier(0.32, 0.72, 0, 1)',
  pop: hasLinear ? SPRING.pop : 'cubic-bezier(0.34, 1.4, 0.64, 1)',
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
};
