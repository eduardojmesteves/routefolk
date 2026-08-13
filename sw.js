// ============================================================
// routefolk — sw.js (service worker)
// Network-first for app code, cache fallback for installed PWA use.
// Bump CACHE whenever shell assets change.
// ============================================================

const CACHE = 'routefolk-shell-v138-screen-vh-fix';

const SHELL_ASSETS = [
  './',
  './index.html',
  // CSS entry point (loaded by index.html)
  './styles/index.css?v=20260811-route-atlas-21',
  // Individual CSS files (fetched separately by browser via @import — must be cached for offline)
  // @import never carries a query string, so these must match the unversioned URL actually requested.
  './style.css',
  './styles/shell.css',
  './styles/app-ui.css',
  './styles/wizards.css',
  './styles/interface-polish.css',
  './styles/renderer-integration.css',
  './styles/packing-list.css',
  './styles/weather-nav.css',
  './styles/production-overrides.css',
  './styles/action-affordances.css',
  './vendor/leaflet/leaflet.css?v=routefolk-local-01',
  './vendor/leaflet/leaflet.js?v=routefolk-local-01',
  './actions/action-router.js',
  './actions/navigation-actions.js',
  './actions/trip-actions.js',
  './actions/stage-actions.js',
  './actions/journal-actions.js',
  './actions/expense-actions.js',
  './actions/item-actions.js',
  './actions/gpx-actions.js',
  './actions/road-actions.js',
  './app.js?v=20260811-route-atlas-narrative-17',
  './screens/app-renderer.js?v=20260811-route-atlas-narrative-17',
  // Loaded by <script src> above with this exact query — keep the version.
  './screens/wizards.js?v=20260811-route-atlas-narrative-17',
  // Loaded via ESM import (no query string) — must match the unversioned URL.
  './screens/wizards/index.js',
  './screens/wizards/wizard-shared.js',
  './screens/wizards/wizard-host.js',
  './screens/wizards/trip-wizard.js',
  './screens/wizards/stage-wizard.js',
  './screens/wizards/journal-wizard.js',
  './screens/wizards/expense-wizard.js',
  './screens/wizards/item-wizard.js',
  './screens/wizards/gpx-wizard.js',
  './screens/wizards/road-wizard.js',
  './screens/extra-writes.js?v=20260811-route-atlas-narrative-17',
  // Loaded by <script src> above with this exact query — keep the version.
  './screens/render/archive/archive-map-controller.js?v=20260811-route-atlas-narrative-17',
  './screens/render/archive/archive-map-leaflet.js',
  './screens/render/archive/archive-map-fallback.js',
  './screens/render/archive/archive-map-geometry.js',
  './screens/render/shared.js',
  './screens/render/mobile.js',
  './screens/render/desktop.js',
  './screens/render/trip-detail/gpx-panel.js',
  './screens/render/trip-detail/costs-desktop.js',
  './screens/render/trip-detail/costs-mobile.js',
  './screens/render/trip-detail/packing-desktop.js',
  './screens/render/trip-detail/packing-mobile.js',
  './screens/render/trip-detail/stages-desktop.js',
  './screens/render/trip-detail/stages-mobile.js',
  './screens/render/trip-detail/summary-desktop.js',
  './screens/render/trip-detail/summary-mobile.js',
  './screens/render/account/account-desktop.js',
  './screens/render/account/account-mobile.js',
  './screens/render/archive/archive-list-desktop.js',
  './screens/render/archive/archive-list-mobile.js',
  './screens/render/trips/trips-desktop.js',
  './screens/render/trips/trips-mobile.js',
  './screens/app-actions.js?v=20260811-route-atlas-narrative-17',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './constants/app-constants.js',
  './state/app-state.js',
  './state/ui-state.js',
  './state/session-reset.js',
  './state/session-controller.js',
  './state/data-loaders.js',
  './utils/dom.js',
  './utils/url.js',
  './utils/datetime.js',
  './utils/format.js',
  './utils/user.js',
  './utils/trip-detail.js',
  './utils/navigation-url.js',
  './components/toast.js',
  './components/atoms/wx-icon.js',
  './components/atoms/wx-cell.js',
  './components/atoms/weather-panel.js',
  './components/atoms/navigate-button.js',
  './components/atoms/navigate-sheet.js',
  './components/atoms/costs-breakdown.js',
  './lib/config.js',
  './lib/palette-init.js',
  './lib/supabase.js',
  './lib/auth.js',
  './lib/meta.js',
  './lib/access.js',
  './lib/trips.js',
  './lib/stages.js',
  './lib/trip-members.js',
  './lib/geocoding.js',
  './lib/weather.js',
  './lib/weather-rules.js',
  './lib/weather-headline.js',
  './lib/journal.js',
  './lib/profiles.js',
  './lib/expenses.js',
  './lib/items.js',
  './lib/gpx.js',
  './lib/roads.js',
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
