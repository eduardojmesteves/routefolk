// ============================================================
// routefolk — sw.js (service worker)
// Network-first for app code, cache fallback for installed PWA use.
// Bump CACHE and RELEASE whenever shell assets change.
// ============================================================

const RELEASE = '20260514-redesign-phase8-archive';
const CACHE = 'routefolk-shell-v54-ink-rust-phase8';

const SHELL_ASSETS = [
  './',
  './index.html',
  `./style.css?v=${RELEASE}`,
  `./style-redesign.css?v=${RELEASE}`,
  `./app.js?v=${RELEASE}`,
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './constants/app-constants.js',
  './state/app-state.js',
  './state/session-reset.js',
  './state/session-controller.js',
  './state/data-loaders.js',
  './handlers/write-handlers.js',
  './utils/dom.js',
  './utils/url.js',
  './utils/datetime.js',
  './utils/format.js',
  './utils/user.js',
  './utils/trip-detail.js',
  './utils/trip-stats.js',
  './utils/state-selectors.js',
  './utils/write-guards.js',
  './components/toast.js',
  './components/modal.js',
  './components/stage-form.js',
  './components/journal-form.js',
  './components/expense-form.js',
  './components/gpx-form.js',
  './components/trip-form.js',
  './components/feedback.js',
  './components/access-schema-cards.js',
  './components/trip-not-found.js',
  './components/app-shell.js',
  './components/audit.js',
  './components/trip-card.js',
  './components/stats.js',
  './components/forms.js',
  './components/action-modals.js',
  './components/content-events.js',
  './screens/trips-screen.js',
  './screens/account-screen.js',
  './screens/archive-screen.js',
  './screens/summary-screen.js',
  './screens/trip-detail-screen.js',
  './screens/trip-detail-stages.js',
  './screens/trip-detail-expenses.js',
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
