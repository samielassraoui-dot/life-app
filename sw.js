// Service Worker: macht die App offline nutzbar.
// Strategie: erst Netz (damit Updates sofort ankommen), nach 3 s oder offline aus dem Zwischenspeicher.
// Wichtig: immer beim Server nachfragen (cache: 'no-cache'), nie alte Dateien aus dem Browser-Cache nehmen.
const CACHE = 'life4-v12';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/store.js',
  'js/sync.js',
  'js/ui.js',
  'js/areas.js',
  'js/body.js',
  'js/chart.js',
  'js/week.js',
  'js/mind.js',
  'js/people.js',
  'js/version.js',
  'js/views/dashboard.js',
  'js/views/area.js',
  'js/views/settings.js',
  'js/views/koerper.js',
  'js/views/goals.js',
  'js/views/review.js',
  'js/views/woche.js',
  'js/views/sinn.js',
  'js/views/contact.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

const fresh = (url) => fetch(new Request(url, { cache: 'no-cache', credentials: 'same-origin' }));

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(FILES.map((f) => fresh(f).then((res) => {
        if (!res.ok) throw new Error(`${f}: ${res.status}`);
        return c.put(f, res);
      }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((cache) => {
      const fromNet = fresh(e.request.url).then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      });
      const timeout = new Promise((res) => setTimeout(res, 3000));
      return Promise.race([fromNet, timeout.then(() => cache.match(e.request, { ignoreSearch: true }))])
        .then((res) => res || fromNet)
        .catch(() => cache.match(e.request, { ignoreSearch: true }).then((res) => res || cache.match('index.html')));
    }),
  );
});
