// ============================================================
// routefolk — sw.js (service worker)
// Network-first for app code, cache fallback for installed PWA use.
// Bump CACHE whenever shell assets change.
// ============================================================

const CACHE = 'routefolk-shell-v131-renderer-stage-polish';

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles/index.css?v=20260523-renderer-stage-polish-01',
  './style.css?v=20260516-redesign-ink-rust-01',
  './style-fidelity.css?v=20260516-fidelity-01',
  './styles/shell.css?v=20260516-production-01',
  './styles/app-ui.css?v=20260518-geo-map-01',
  './styles/wizards.css?v=20260520-stable-wizard-05',
  './styles/interface-polish.css?v=20260518-production-01',
  './styles/renderer-integration.css?v=20260523-renderer-stage-polish-01',
  './styles/packing-list.css?v=20260518-production-01',
  './styles/weather-nav.css',
  './styles/production-overrides.css?v=20260520-mobile-fields-02',
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
  './app.js?v=20260520-desktop-weather-02',
  './screens/app-renderer.js?v=20260520-desktop-weather-02',
  './screens/wizards.js?v=20260522-wizard-split-01',
  './screens/wizards/index.js?v=20260522-wizard-split-01',
  './screens/wizards/wizard-shared.js?v=20260522-wizard-split-01',
  './screens/wizards/wizard-host.js?v=20260522-wizard-split-01',
  './screens/wizards/trip-wizard.js?v=20260522-wizard-split-01',
  './screens/wizards/stage-wizard.js?v=20260522-wizard-split-01',
  './screens/wizards/journal-wizard.js?v=20260522-wizard-split-01',
  './screens/wizards/expense-wizard.js?v=20260522-wizard-split-01',
  './screens/wizards/item-wizard.js?v=20260522-wizard-split-01',
  './screens/wizards/gpx-wizard.js?v=20260522-wizard-split-01',
  './screens/extra-writes.js?v=20260520-mobile-fields-02',
  './screens/archive-geo-map.js?v=20260519-local-map-01',
  './screens/render/archive/archive-map-controller.js?v=20260523-archive-split-01',
  './screens/render/archive/archive-map-leaflet.js?v=20260523-archive-split-01',
  './screens/render/archive/archive-map-fallback.js?v=20260523-archive-split-01',
  './screens/render/archive/archive-map-geometry.js?v=20260523-archive-split-01',
  './screens/render/shared.js',
  './screens/render/mobile.js',
  './screens/render/desktop.js',
  './screens/render/trip-detail/gpx-panel.js',
  './screens/render/trip-detail/costs-desktop.js?v=20260523-renderer-split-01',
  './screens/render/trip-detail/costs-mobile.js?v=20260523-renderer-split-01',
  './screens/render/trip-detail/packing-desktop.js?v=20260523-renderer-split-01',
  './screens/render/trip-detail/packing-mobile.js?v=20260523-renderer-split-01',
  './screens/render/trip-detail/stages-desktop.js?v=20260523-renderer-split-01',
  './screens/render/trip-detail/stages-mobile.js?v=20260523-renderer-split-01',
  './screens/render/trip-detail/summary-desktop.js?v=20260523-renderer-split-01',
  './screens/render/trip-detail/summary-mobile.js?v=20260523-renderer-split-01',
  './screens/render/account/account-desktop.js?v=20260523-renderer-split-01',
  './screens/render/account/account-mobile.js?v=20260523-renderer-split-01',
  './screens/render/archive/archive-list-desktop.js?v=20260523-renderer-split-01',
  './screens/render/archive/archive-list-mobile.js?v=20260523-renderer-split-01',
  './screens/render/trips/trips-desktop.js?v=20260523-renderer-split-01',
  './screens/render/trips/trips-mobile.js?v=20260523-renderer-split-01',
  './screens/app-actions.js?v=20260520-wizard-loop-04',
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
  './utils/trip-stats.js',
  './utils/state-selectors.js',
  './utils/write-guards.js',
  './utils/navigation-url.js',
  './components/toast.js',
  './components/stats.js',
  './components/atoms/wx-icon.js',
  './components/atoms/wx-cell.js',
  './components/atoms/weather-panel.js',
  './components/atoms/navigate-button.js',
  './components/atoms/navigate-sheet.js',
  './lib/config.js',
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
