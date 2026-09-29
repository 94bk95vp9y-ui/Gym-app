const CACHE = 'gym-cache-v8';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './css/fight.css',
  './css/mobility.css',
  './fonts/barlow-condensed-600.woff2',
  './fonts/barlow-condensed-700.woff2',
  './fonts/barlow-condensed-800.woff2',
  './js/app.js',
  './js/storage.js',
  './js/utils.js',
  './js/icons.js',
  './js/exercise-catalog.js',
  './js/plan-import.js',
  './js/motivation.js',
  './js/fatigue.js',
  './js/sound.js',
  './js/supplements.js',
  './js/challenges.js',
  './js/challenges-data.js',
  './js/mobility.js',
  './js/mobility-data.js',
  './js/mobility-figure.js',
  './js/mobility/library.js',
  './js/mobility/plans.js',
  './js/mobility/state.js',
  './js/mobility/figures.js',
  './js/mobility/area.js',
  './js/mobility/player.js',
  // 3D für Mobility – vorab gespeichert, damit es auch ohne Netz im Gym läuft
  './js/vendor/three.module.min.js',
  // Fight-Modus (Kickboxen & Ausdauer) – die Kamera-Erkennung (18 MB) wird
  // erst beim ersten Öffnen des Kamera-Coachs geladen und dann gespeichert
  './js/fight/anim.js',
  './js/fight/camera-coach.js',
  './js/fight/coach.js',
  './js/fight/conditioning.js',
  './js/fight/core.js',
  './js/fight/data-tech.js',
  './js/fight/endu-calc.js',
  './js/fight/endu-data.js',
  './js/fight/endurance.js',
  './js/fight/exam.js',
  './js/fight/figure.js',
  './js/fight/home.js',
  './js/fight/index.js',
  './js/fight/lesson.js',
  './js/fight/me.js',
  './js/fight/onboarding.js',
  './js/fight/partner.js',
  './js/fight/performer.js',
  './js/fight/plan.js',
  './js/fight/player.js',
  './js/fight/progress.js',
  './js/fight/reaction.js',
  './js/fight/rewards.js',
  './js/fight/rope-counter.js',
  './js/fight/start.js',
  './js/fight/tech.js',
  './js/fight/video.js',
  './js/fight/viewer.js',
  './js/fight/voice.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// Code und Seite: Netzwerk zuerst, Cache nur als Offline-Reserve. Vorher war
// es umgekehrt – dann bekam die installierte App eine neue Version immer erst
// beim übernächsten Start zu sehen. Bilder ändern sich praktisch nie und
// dürfen deshalb direkt aus dem Cache kommen.
const CACHE_FIRST = /\.(png|jpg|jpeg|svg|ico|webmanifest)$/i;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (CACHE_FIRST.test(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html'))),
  );
});
