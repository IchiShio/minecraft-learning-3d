const CACHE_NAME = 'mclearn3d-v25';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './quiz-data.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // questions.csv: 常に最新を取得（network first, cache fallback）
  if (url.pathname.endsWith('/questions.csv')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        fetch(event.request, { cache: 'no-cache' })
          .then(res => { cache.put(event.request, res.clone()); return res; })
          .catch(() => cache.match(event.request))
      )
    );
    return;
  }
  // CDN (Three.js etc): network first, cache fallback
  if (url.hostname !== self.location.hostname) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        fetch(event.request)
          .then(res => { cache.put(event.request, res.clone()); return res; })
          .catch(() => cache.match(event.request))
      )
    );
    return;
  }
  // Local: cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, res.clone()));
        return res;
      });
    })
  );
});
