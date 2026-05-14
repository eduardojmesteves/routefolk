// ============================================================
// routefolk — sw.js (service worker)
// Network-first for app code, cache fallback for installed PWA use.
// Bump CACHE and RELEASE whenever shell assets change.
// ============================================================

const RELEASE = '20260514-phase327-action-modals';
const CACHE = 'routefolk-shell-v45';

const SHELL_ASSETS = [
  './',
  './index.html',
  `./style.css?v=${RELEASE}`,
  `./app.js?v=${RELEASE}`,
  './state/app-state.js',
  './constants/app-constants.js',
  './utils/dom.js',
  './utils/url.js',
  './utils/datetime.js',
  './utils/format.js',
  './utils/user.js',
  './utils/trip-detail.js',
  './components/toast.js',
  './components/modal.js',
  './components/stage-form.js',
  './components/journal-form.js',
  './components/expense-form.js',
  './components/gpx-form.js',
  './components/trip-form.js',
  './components/feedback.js',
  './components/trip-not-found.js',
  './components/app-shell.js',
  './components/trip-card.js',
  './components/forms.js',
  './screens/trips-screen.js',
  './screens/account-screen.js',
  './manifest.json',
  './lib/config.js',
  './lib/supabase.js',
  './lib/auth.js',
  './lib/meta.js',
  './lib/access.js',
  './lib/trips.js',
  './lib/stages.js',
  './lib/geocoding.js',
  './lib/weather.js',
  './lib/journal.js',
  './lib/profiles.js',
  './lib/expenses.js',
  './lib/gpx.js',
  './components/stats.js',
  './screens/archive-screen.js',
  './screens/summary-screen.js',
  './screens/trip-detail-screen.js',
  './screens/trip-detail-stages.js',
  './screens/trip-detail-expenses.js',
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

function isAppCodeRequest(req, url) {
  return req.destination === 'script'
    || req.destination === 'style'
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css');
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate') return caches.match('./index.html');
    return Response.error();
  }
}

async function cacheFirst(req) {
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
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || isAppCodeRequest(req, url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(cacheFirst(req));
});
