// ============================================================
// routefolk — sw.js (service worker)
// Caches the app shell so the app opens instantly and works
// offline for static assets. Network-first for HTML, cache-first
// for static assets.
//
// IMPORTANT: bump CACHE version when you change shell assets,
// otherwise old devices keep serving stale files from cache.
// ============================================================

const CACHE = 'routefolk-shell-v2';

const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './lib/config.js',
  './lib/supabase.js',
  './lib/auth.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL_ASSETS.map((a) => cache.add(a)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache requests to Supabase or other third-party APIs.
  if (url.origin !== self.location.origin) return;

  // For navigation (HTML), try network first, fall back to cache.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // Same-origin static assets: cache first, fall back to network.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch {
      return Response.error();
    }
  })());
});
