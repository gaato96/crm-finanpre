// RENDIMAX PWA service worker
// Regla principal: NUNCA se cachean respuestas con datos de clientes.
// La versión anterior guardaba toda respuesta 200 (incluidas las de Supabase),
// lo que dejaba saldos y perfiles en el disco del dispositivo.
const CACHE_NAME = 'rendimax-v2';
const OFFLINE_URL = '/login';

// Solo el shell mínimo para poder abrir la app sin conexión
const PRECACHE_URLS = ['/login', '/manifest.json', '/icons/icon-192x192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        // Borra los caches viejos, incluido el 'finanpre-v1' que podía contener datos sensibles
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  );
});

/**
 * En desarrollo los chunks de Next no llevan hash en el nombre, así que
 * cachearlos serviría código viejo. En localhost el SW no guarda nada.
 */
const IS_DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

/** Recursos estáticos versionados: seguros de cachear. */
function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (!url.protocol.startsWith('http')) return;

  // En desarrollo nunca se intercepta: se evita servir código obsoleto
  if (IS_DEV) return;

  // Otro origen (Supabase, dolarapi, ipify, etc.): siempre a la red, sin cache
  if (url.origin !== self.location.origin) return;

  // Rutas de datos o autenticación: nunca se cachean
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Estáticos versionados: cache-first (son inmutables por hash)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        });
      })
    );
    return;
  }

  // Navegación (documentos HTML): red primero; sin conexión, pantalla de acceso
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (cached) =>
            cached ||
            new Response('<h1>Sin conexión</h1><p>Reintentá cuando tengas señal.</p>', {
              status: 503,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            })
        )
      )
    );
    return;
  }

  // Cualquier otra cosa pasa directo a la red sin almacenarse
});
