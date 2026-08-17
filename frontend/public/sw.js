// INDUSTRIAL OS — minimal offline-first service worker (PHASE 53).
// Strategy: cache-first for static assets (JS/CSS/fonts — they're
// content-hashed by Next.js, so caching them forever is safe), and
// network-first-with-cache-fallback for pages, so the app shell still
// loads when there is no connectivity at all.

const CACHE_NAME = 'industrial-os-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache/intercept mutations — those go through the offline outbox instead
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // don't touch API calls to the backend origin

  const isStaticAsset = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/');

  if (isStaticAsset) {
    // cache-first: these are content-hashed, safe to keep forever
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // pages / app shell: network-first, fall back to cache when offline
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
  );
});
