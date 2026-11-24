/* Service worker. Network-first for our own files so updates arrive when online,
   cache fallback so the app works fully offline. Adapted from
   pippodima/expense-tracker-web sw.js (MIT, see THIRD_PARTY_NOTICES.md). */
const CACHE = 'ssente-v2';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './css/style.css',
  './js/money.js', './js/store.js', './js/charts.js', './js/app.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  // cache: 'reload' skips the browser HTTP cache (GitHub Pages sends max-age=600).
  e.respondWith(fetch(e.request, { cache: 'reload' })
    .then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
