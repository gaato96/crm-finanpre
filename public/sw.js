const CACHE_NAME = 'finanpre-v1';
const urlsToCache = [
  '/',
  '/login',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and non-http/https schemes to avoid chrome-extension/etc issues
  if (event.request.method !== 'GET') return;

  try {
    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http')) return;
  } catch (e) {
    return;
  }

  // Network first, fallback to cache. Ensure we always return a Response.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response before caching
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => cached || new Response('', { status: 504, statusText: 'Gateway Timeout' }));
      })
  );
});
