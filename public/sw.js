const CACHE_NAME = 'labcei-v3';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: cache core files immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

// Activate: remove old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Clean up old cache versions
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
          })
        )
      ),
      // Take control of all clients immediately
      self.clients.claim(),
    ])
  );
});

// Fetch: cache-first for assets, network-first for API/supabase
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept Supabase or external API calls
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('supabase.co') ||
    url.hostname !== self.location.hostname
  ) {
    return; // Let browser handle it natively
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((networkRes) => {
            // Cache same-origin GET responses
            const toCache = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, toCache);
            });
            return networkRes;
          })
          .catch(() => {
            // SPA fallback for navigation
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          })
      );
    })
  );
});
