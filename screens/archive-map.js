// ============================================================
// routefolk — screens/archive-map.js
// Archive geography renderer using real Leaflet + OpenStreetMap tiles.
// Includes an SVG fallback so GPX geography never becomes a blank card.
// ============================================================

import { STATE } from '../state/app-state.js';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

let leafletPromise = null;
let map = null;
let layerGroup = null;
let lastSignature = '';
let hydrationStarted = false;

function api() { return window.routefolkData || {}; }
function isArchiveView() { return STATE.user && STATE.tab === 'archive'; }
function archiveMapCard() { return document.querySelector('.rf-d2-map-card, .rf-m2-map-card'); }

function replaceMapCardShell(card) {
  if (!card || card.querySelector('.rf-v2-archive-map')) return;
  card.innerHTML = `<div class="rf-v2-archive-map" id="rf-v2-archive-map" role="img" aria-label="Archive map with GPX routes"></div><div class="rf-v2-archive-map-status" id="rf-v2-archive-map-status">Loading archive geography…</div>`;
}

function status(text) {
  const node = document.getElementById('rf-v2-archive-map-status');
  if (node) node.textContent = text;
}

function ensureLeafletCss() {
  if (document.querySelector('link[data-rf-leaflet="real"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = LEAFLET_CSS;
  link.dataset.rfLeaflet = 'real';
  document.head.appendChild(link);
}

function ensureLeaflet() {
  if (window.L?.map && window.L?.tileLayer && window.L?.polyline) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  ensureLeafletCss();
  leafletPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.dataset.rfLeaflet = 'real';
    script.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet loaded but L is unavailable.'));
    script.onerror = () => reject(new Error('Leaflet failed to load. Showing GPX sketch instead.'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function archivedTripIds() {
  return new Set(STATE.trips.filter((trip) => trip.status === 'completed' || trip.status === 'cancelled').map((trip) => trip.id));
}
function tracksForArchivedTrips() {
  const ids = archivedTripIds();
  return Object.entries(STATE.gpxByTrip)
    .filter(([tripId, tracks]) => ids.has(tripId) && Array.isArray(tracks))
    .flatMap(([tripId, tracks]) => tracks.map((track) => ({ ...track, trip_id: track.trip_id || tripId })));
}
function latLngFromPoint(point) {
  if (Array.isArray(point)) {
    const a = Number(point[0]);
    const b = Number(point[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.abs(a) <= 90 ? [a, b] : [b, a];
  }
  if (!point || typeof point !== 'object') return null;
  const lat = Number(point.lat ?? point.latitude ?? point.y);
  const lng = Number(point.lng ?? point.lon ?? point.longitude ?? point.x);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}
function pointsFromGeometry(geometry) {
  if (!geometry || geometry === 'loading') return [];
  if (Array.isArray(geometry)) return geometry.map(latLngFromPoint).filter(Boolean);
  if (Array.isArray(geometry.points)) return geometry.points.map(latLngFromPoint).filter(Boolean);
  if (Array.isArray(geometry.coordinates)) return geometry.coordinates.map(latLngFromPoint).filter(Boolean);
  if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) return geometry.coordinates.map(latLngFromPoint).filter(Boolean);
  if (geometry.type === 'Feature' && geometry.geometry) return pointsFromGeometry(geometry.geometry);
  return [];
}
function geometryForTrack(track) {
  const points = pointsFromGeometry(STATE.gpxGeometryByTrack[track.id]);
  return points.length >= 2 ? points : null;
}
function geometriesForArchive() {
  return tracksForArchivedTrips().map((track) => ({ track, points: geometryForTrack(track) })).filter((item) => item.points);
}
function mapSignature() {
  const tracks = tracksForArchivedTrips();
  return JSON.stringify({ tab: STATE.tab, loading: STATE.archiveDataLoading || STATE.archiveGpxLoading, tracks: tracks.map((track) => ({ id: track.id, points: geometryForTrack(track)?.length || 0 })) });
}
function trackName(track) {
  return track.file_path ? track.file_path.split('/').pop() : 'GPX route';
}

function destroyMap() {
  if (map) map.remove();
  map = null;
  layerGroup = null;
  lastSignature = '';
}

function boundsForGeometries(geometries) {
  const all = geometries.flatMap((item) => item.points);
  if (!all.length) return null;
  const lats = all.map((p) => p[0]);
  const lngs = all.map((p) => p[1]);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
}
function project(point, bounds, width, height, pad) {
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
  const x = pad + ((point[1] - bounds.minLng) / lngSpan) * (width - pad * 2);
  const y = height - pad - ((point[0] - bounds.minLat) / latSpan) * (height - pad * 2);
  return [x, y];
}
function drawSvgFallback(message = '') {
  const el = document.getElementById('rf-v2-archive-map');
  if (!el) return;
  const geometries = geometriesForArchive();
  if (!geometries.length) {
    el.innerHTML = `<div class="rf-v2-map-fallback"><div><strong>No archive route yet</strong><span>${STATE.archiveGpxLoading ? 'Loading GPX geometry…' : 'Upload GPX tracks to archived trips'}</span></div></div>`;
    status(message || (tracksForArchivedTrips().length ? 'Archived GPX tracks exist, but geometry is unavailable.' : 'No GPX tracks found in archived trips yet.'));
    return;
  }
  const width = 900;
  const height = 360;
  const pad = 44;
  const bounds = boundsForGeometries(geometries);
  const paths = geometries.map(({ track, points }) => {
    const d = points.map((point, index) => {
      const [x, y] = project(point, bounds, width, height, pad);
      return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    const start = project(points[0], bounds, width, height, pad);
    const end = project(points[points.length - 1], bounds, width, height, pad);
    return `<g><path class="rf-v2-map-route" d="${d}"><title>${trackName(track)}</title></path><circle class="rf-v2-map-start" cx="${start[0].toFixed(1)}" cy="${start[1].toFixed(1)}" r="5"/><circle class="rf-v2-map-end" cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="5"/></g>`;
  }).join('');
  el.innerHTML = `<svg class="rf-v2-map-svg" viewBox="0 0 ${width} ${height}" aria-label="Archive GPX route sketch"><defs><pattern id="rf-map-grid" width="90" height="90" patternUnits="userSpaceOnUse"><path d="M 90 0 L 0 0 0 90" fill="none" stroke="rgba(38,52,94,.09)" stroke-width="1"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#rf-map-grid)"/>${paths}</svg>`;
  status(message || `${geometries.length} GPX route${geometries.length === 1 ? '' : 's'} shown as GPX sketch.`);
}

function buildMap(L) {
  const el = document.getElementById('rf-v2-archive-map');
  if (!el) return null;
  if (map) return map;
  el.innerHTML = '';
  map = L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView([40.2, -3.7], 5);
  L.tileLayer(TILE_URL, { maxZoom: 18, attribution: TILE_ATTRIBUTION }).addTo(map);
  layerGroup = L.layerGroup().addTo(map);
  setTimeout(() => map?.invalidateSize(), 80);
  return map;
}

function renderTracks(L) {
  if (!map || !layerGroup) return;
  layerGroup.clearLayers();
  const tracks = tracksForArchivedTrips();
  const geometries = geometriesForArchive();
  if (!tracks.length) {
    status('No GPX tracks found in archived trips yet.');
    map.setView([40.2, -3.7], 5);
    return;
  }
  if (!geometries.length) {
    status(STATE.archiveGpxLoading ? 'Loading GPX geometry…' : 'Archived GPX tracks exist, but geometry is unavailable.');
    map.setView([40.2, -3.7], 5);
    return;
  }
  const bounds = [];
  geometries.forEach(({ track, points }) => {
    const polyline = L.polyline(points, { color: '#26345e', weight: 4, opacity: 0.88, lineCap: 'round', lineJoin: 'round' }).addTo(layerGroup);
    polyline.bindTooltip(trackName(track));
    bounds.push(...points);
    L.circleMarker(points[0], { radius: 5, color: '#26345e', fillColor: '#f3f0e4', fillOpacity: 1, weight: 2 }).addTo(layerGroup);
    L.circleMarker(points[points.length - 1], { radius: 5, color: '#b85a2e', fillColor: '#edcdb8', fillOpacity: 1, weight: 2 }).addTo(layerGroup);
  });
  const latLngBounds = L.latLngBounds(bounds);
  if (latLngBounds.isValid()) map.fitBounds(latLngBounds, { padding: [30, 30], maxZoom: 12 });
  status(`${geometries.length} GPX route${geometries.length === 1 ? '' : 's'} shown on OpenStreetMap.`);
  setTimeout(() => map?.invalidateSize(), 80);
}

async function hydrateArchiveGpx() {
  if (!isArchiveView() || hydrationStarted) return;
  hydrationStarted = true;
  try {
    await api().ensureArchiveData?.();
    await api().ensureArchiveGpxGeometries?.();
  } finally {
    hydrationStarted = false;
    lastSignature = '';
    requestAnimationFrame(renderArchiveMap);
  }
}

async function renderArchiveMap() {
  if (!isArchiveView()) { destroyMap(); return; }
  const card = archiveMapCard();
  if (!card) return;
  replaceMapCardShell(card);
  hydrateArchiveGpx();
  const signature = mapSignature();
  if (signature === lastSignature && map) return;
  lastSignature = signature;
  if (STATE.archiveDataLoading || STATE.archiveGpxLoading) status('Loading archive geography…');
  drawSvgFallback('Loading OpenStreetMap tiles…');
  try {
    const L = await ensureLeaflet();
    buildMap(L);
    renderTracks(L);
  } catch (error) {
    destroyMap();
    drawSvgFallback(error?.message || 'OpenStreetMap failed to load. Showing GPX sketch instead.');
  }
}

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(renderArchiveMap));
document.addEventListener('routefolk:render', () => requestAnimationFrame(renderArchiveMap));
document.addEventListener('routefolk:archive-map-refresh', () => requestAnimationFrame(renderArchiveMap));
window.addEventListener('resize', () => requestAnimationFrame(() => { map?.invalidateSize(); renderArchiveMap(); }));
requestAnimationFrame(renderArchiveMap);
