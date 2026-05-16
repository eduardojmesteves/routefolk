// ============================================================
// routefolk — screens/v2/v2-archive-map.js
// Leaflet-compatible archive geography with OpenStreetMap tiles.
// Uses completed/cancelled trip GPX geometry already loaded into STATE.
// ============================================================

import { STATE } from '../../state/app-state.js';

const LEAFLET_CSS = './vendor/leaflet/leaflet.css?v=1.9.4-routefolk-01';
const LEAFLET_JS = './vendor/leaflet/leaflet.js?v=1.9.4-routefolk-01';
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

let leafletPromise = null;
let map = null;
let layerGroup = null;
let lastSignature = '';
let hydrationStarted = false;

function api() {
  return window.routefolkData || {};
}

function isArchiveView() {
  return STATE.user && STATE.tab === 'archive';
}

function tracksForArchivedTrips() {
  const archivedIds = new Set(
    STATE.trips
      .filter((trip) => trip.status === 'completed' || trip.status === 'cancelled')
      .map((trip) => trip.id),
  );

  return Object.entries(STATE.gpxByTrip)
    .filter(([tripId, tracks]) => archivedIds.has(tripId) && Array.isArray(tracks))
    .flatMap(([tripId, tracks]) => tracks.map((track) => ({ ...track, trip_id: track.trip_id || tripId })));
}

function geometryForTrack(track) {
  const geometry = STATE.gpxGeometryByTrack[track.id];
  if (!geometry || geometry === 'loading') return null;
  const points = Array.isArray(geometry.points) ? geometry.points : [];
  const latLngs = points
    .map((point) => [Number(point.lat), Number(point.lng)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  return latLngs.length >= 2 ? latLngs : null;
}

function mapSignature() {
  const tracks = tracksForArchivedTrips();
  return JSON.stringify({
    tab: STATE.tab,
    loading: STATE.archiveDataLoading || STATE.archiveGpxLoading,
    tracks: tracks.map((track) => ({ id: track.id, geom: !!geometryForTrack(track), pts: geometryForTrack(track)?.length || 0 })),
  });
}

function ensureLeafletCss() {
  if (document.querySelector('link[data-rf-leaflet]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = LEAFLET_CSS;
  link.dataset.rfLeaflet = 'true';
  document.head.appendChild(link);
}

function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  ensureLeafletCss();
  leafletPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-rf-leaflet]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L));
      existing.addEventListener('error', () => reject(new Error('Local Leaflet runtime failed to load.')));
      return;
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.dataset.rfLeaflet = 'true';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Local Leaflet runtime failed to load.'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function archiveMapCard() {
  return document.querySelector('.rf-d2-map-card, .rf-m2-map-card');
}

function replaceMapCardShell(card) {
  if (!card || card.querySelector('.rf-v2-archive-map')) return;
  card.innerHTML = `
    <div class="rf-v2-archive-map" id="rf-v2-archive-map" role="img" aria-label="Archive trip map"></div>
    <div class="rf-v2-archive-map-status" id="rf-v2-archive-map-status">Loading archive geography…</div>
  `;
}

function status(text) {
  const node = document.getElementById('rf-v2-archive-map-status');
  if (node) node.textContent = text;
}

function destroyMap() {
  if (map) {
    map.remove();
    map = null;
    layerGroup = null;
  }
  lastSignature = '';
}

function buildMap(L) {
  const el = document.getElementById('rf-v2-archive-map');
  if (!el) return null;
  if (map) return map;

  map = L.map(el, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,
  }).setView([40.2, -3.7], 5);

  L.tileLayer(TILE_URL, {
    maxZoom: 18,
    attribution: TILE_ATTRIBUTION,
  }).addTo(map);

  layerGroup = L.layerGroup().addTo(map);
  return map;
}

function renderTracks(L) {
  if (!map || !layerGroup) return;
  layerGroup.clearLayers();

  const tracks = tracksForArchivedTrips();
  const geometries = tracks
    .map((track) => ({ track, latLngs: geometryForTrack(track) }))
    .filter((item) => item.latLngs);

  if (!tracks.length) {
    status('No GPX tracks found in archived trips yet. Upload GPX tracks to stages first.');
    map.setView([40.2, -3.7], 5);
    return;
  }

  if (!geometries.length) {
    status(STATE.archiveGpxLoading ? 'Loading GPX geometry…' : 'Archived GPX tracks exist, but no usable geometry is available yet.');
    map.setView([40.2, -3.7], 5);
    return;
  }

  const allBounds = [];
  geometries.forEach(({ track, latLngs }) => {
    const polyline = L.polyline(latLngs, {
      weight: 3,
      opacity: 0.86,
      color: '#26345e',
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layerGroup);
    polyline.bindTooltip(track.file_path ? track.file_path.split('/').pop() : 'GPX track');
    allBounds.push(...latLngs);

    const start = latLngs[0];
    const end = latLngs[latLngs.length - 1];
    if (start) L.circleMarker(start, { radius: 4, color: '#26345e', fillColor: '#e7e4d8', fillOpacity: 1, weight: 2 }).addTo(layerGroup);
    if (end) L.circleMarker(end, { radius: 4, color: '#b85a2e', fillColor: '#edcdb8', fillOpacity: 1, weight: 2 }).addTo(layerGroup);
  });

  const bounds = L.latLngBounds(allBounds);
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
  status(`${geometries.length} GPX route${geometries.length === 1 ? '' : 's'} shown from archived trips.`);
  setTimeout(() => map?.invalidateSize(), 50);
}

async function hydrateArchiveGpx() {
  if (!isArchiveView() || hydrationStarted) return;
  hydrationStarted = true;
  try {
    await api().ensureArchiveData?.();
    await api().ensureArchiveGpxGeometries?.();
  } finally {
    hydrationStarted = false;
  }
}

async function renderArchiveMap() {
  if (!isArchiveView()) {
    destroyMap();
    return;
  }

  const card = archiveMapCard();
  if (!card) return;
  replaceMapCardShell(card);

  const signature = mapSignature();
  if (signature === lastSignature && map) return;
  lastSignature = signature;

  if (STATE.archiveDataLoading || STATE.archiveGpxLoading) {
    status('Loading archive geography…');
  }

  hydrateArchiveGpx();

  try {
    const L = await ensureLeaflet();
    buildMap(L);
    renderTracks(L);
  } catch (error) {
    status(error?.message || 'Map failed to load. Check your connection.');
  }
}

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(renderArchiveMap));
window.addEventListener('resize', () => {
  requestAnimationFrame(() => {
    map?.invalidateSize();
    renderArchiveMap();
  });
});
requestAnimationFrame(renderArchiveMap);
