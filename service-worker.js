const CACHE = 'gym-cache-v29';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/core/catalog.js',
  './js/core/fatigue.js',
  './js/core/format.js',
  './js/core/plan-import.js',
  './js/core/progression.js',
  './js/core/sound.js',
  './js/core/store.js',
  './js/core/supplements.js',
  './js/core/training.js',
  './js/main.js',
  './js/mobility/data.js',
  './js/mobility/figure.js',
  './js/mobility/figures.js',
  './js/mobility/library.js',
  './js/mobility/plans.js',
  './js/mobility/player.js',
  './js/mobility/routines.js',
  './js/mobility/skin.js',
  './models/figure.glb',
  './js/ui/chart.js',
  './js/ui/components.js',
  './js/ui/dom.js',
  './js/ui/haptics.js',
  './js/ui/icons.js',
  './js/ui/keypad.js',
  './js/ui/motion.js',
  './js/ui/reorder.js',
  './js/ui/router.js',
  './js/ui/sheet.js',
  './js/ui/swipe.js',
  './js/ui/theme.js',
  './js/ui/toast.js',
  './js/vendor/three.module.min.js',
  './js/vendor/GLTFLoader.js',
  './js/vendor/BufferGeometryUtils.js',
  './js/views/goal.js',
  './js/views/history.js',
  './js/views/mobility.js',
  './js/views/picker.js',
  './js/views/settings.js',
  './js/views/supplements.js',
  './js/views/today.js',
  './js/views/training.js',
  './js/views/workout.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon-512-maskable.png',
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

  // Netz zuerst – aber höchstens 2,5 s warten, wenn eine Kopie im Cache
  // liegt: im Gym ist das Netz oft schlecht, und die App soll trotzdem sofort
  // starten. Die Antwort aus dem Netz aktualisiert den Cache trotzdem.
  // cache: 'no-cache' umgeht den HTTP-Cache (GitHub Pages: 10 Minuten), damit
  // eine neue Version nicht stückweise mit alten Dateien gemischt ankommt.
  const network = fetch(request, { cache: 'no-cache' }).then((response) => {
    if (response && response.ok) {
      const clone = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, clone));
    }
    return response;
  });
  event.respondWith(
    caches.match(request).then((cached) => {
      if (!cached) return network.catch(() => caches.match('./index.html'));
      const timeout = new Promise((resolve) => { setTimeout(() => resolve(cached), 2500); });
      return Promise.race([network.catch(() => cached), timeout]);
    }),
  );
});
