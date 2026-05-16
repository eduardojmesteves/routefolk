// ============================================================
// routefolk — sw.js (service worker)
// Network-first for app code, cache fallback for installed PWA use.
// Bump CACHE whenever shell assets change.
// ============================================================

const CACHE = 'routefolk-shell-v90-refinements-01';

const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css?v=20260516-redesign-ink-rust-01',
  './style-fidelity.css?v=20260516-fidelity-01',
  './styles/shell.css?v=20260516-production-01',
  './styles/app-ui.css?v=20260516-production-01',
  './styles/cleanup.css?v=20260516-production-01',
  './styles/wizards.css?v=20260516-production-01',
  './styles/refinements.css?v=20260516-refinements-01',
  './app.js?v=20260516-production-01',
  './screens/app-renderer.js?v=20260516-production-01',
  './screens/wizards.js?v=20260516-production-01',
  './screens/extra-writes.js?v=20260516-production-01',
  './screens/gpx-panel.js?v=20260516-production-01',
  './screens/archive-map.js?v=20260516-production-01',
  './screens/production-fixes.js?v=20260516-production-01',
  './screens/app-actions.js?v=20260516-production-01',
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
  './screens/packing-screen.js',
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
  './lib/items.js',
  './lib/gpx.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isAppCodeRequest(request, url) {
  return request.destination === 'script'
    || request.destination === 'style'
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css');
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('./index.html');
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || isAppCodeRequest(request, url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
