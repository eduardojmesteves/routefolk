// ============================================================
// routefolk — screens/archive-geo-map.js
// Interactive cumulative Archive GPX map.
// Falls back to a local SVG route drawing when Leaflet/OpenStreetMap
// cannot load, so archived GPX geography never becomes a dead panel.
// ============================================================

import { STATE } from '../state/app-state.js';

const LEAFLET_SOURCES = [
  {
    css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  },
  {
    css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  },
];
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

let map = null;
let layerGroup = null;
let leafletReady = null;
let lastSlot = null;
let initInFlight = false;
let renderAgain = false;
let lastRouteKey = '';
let scheduled = false;

function api() { return window.routefolkData || {}; }
function slot() { return document.getElementById('rf-v2-archive-map'); }
function statusSlot() { return document.getElementById('rf-v2-archive-map-status'); }
function isArchiveView() { return !!STATE.user && STATE.tab === 'archive' && !STATE.selectedArchiveTripId; }
function setStatus(text) { const el = statusSlot(); if (el) el.textContent = text || ''; }
function isAttached(el) { return !!el && document.documentElement.contains(el); }
function esc(value) { return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])); }

function mapIsAlive() {
  const el = slot();
  if (!map || !el || !isAttached(el)) return false;
  try { return map.getContainer() === el; } catch { return false; }
}

function destroyMap() {
  if (map) {
    try { map.off(); } catch {}
    try { map.remove(); } catch {}
  }
  map = null;
  layerGroup = null;
  lastSlot = null;
  lastRouteKey = '';
}

function removeLeafletTags() {
  document.querySelectorAll('script[data-geo-leaflet],link[data-geo-leaflet-css]').forEach((node) => node.remove());
}

function waitForLeafletFromExistingScript() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (window.L?.map && window.L?.tileLayer && window.L?.polyline) {
        window.clearInterval(timer);
        resolve(window.L);
      } else if (attempts > 120) {
        window.clearInterval(timer);
        reject(new Error('Leaflet script was present but did not initialise.'));
      }
      attempts += 1;
    }, 50);
  });
}

function loadLeafletSource(source) {
  return new Promise((resolve, reject) => {
    removeLeafletTags();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = source.css;
    link.dataset.geoLeafletCss = 'true';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = source.js;
    script.async = true;
    script.dataset.geoLeaflet = 'true';
    script.onload = () => window.L?.map && window.L?.tileLayer && window.L?.polyline ? resolve(window.L) : reject(new Error(`Leaflet loaded from ${source.js} but L.map is unavailable.`));
    script.onerror = () => reject(new Error(`Leaflet failed to load from ${source.js}.`));
    document.head.appendChild(script);
  });
}

async function tryLeafletSources() {
  const errors = [];
  for (const source of LEAFLET_SOURCES) {
    try {
      return await loadLeafletSource(source);
    } catch (error) {
      errors.push(error?.message || String(error));
      window.L = undefined;
    }
  }
  throw new Error(errors.join(' | ') || 'Leaflet failed to load.');
}

function ensureLeaflet() {
  if (window.L?.map && window.L?.tileLayer && window.L?.polyline) return Promise.resolve(window.L);
  if (leafletReady) return leafletReady;

  const oldScript = document.querySelector('script[data-rf-leaflet],script[data-rf-leaflet="real"]');
  if (oldScript) {
    leafletReady = waitForLeafletFromExistingScript().catch((error) => {
      leafletReady = null;
      throw error;
    });
    return leafletReady;
  }

  leafletReady = tryLeafletSources().catch((error) => {
    leafletReady = null;
    throw error;
  });
  return leafletReady;
}

function completedTripIds() {
  return new Set(STATE.trips.filter((trip) => trip.status === 'completed').map((trip) => trip.id));
}

function completedTracks() {
  const completed = completedTripIds();
  return Object.entries(STATE.gpxByTrip || {})
    .filter(([tripId, tracks]) => completed.has(tripId) && Array.isArray(tracks))
    .flatMap(([tripId, tracks]) => tracks.map((track) => ({ ...track, trip_id: track.trip_id || tripId })));
}

function pointToLatLng(point) {
  if (Array.isArray(point)) {
    const a = Number(point[0]);
    const b = Number(point[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.abs(a) <= 90 ? [a, b] : [b, a];
  }
  if (!point || typeof point !== 'object') return null;
  const lat = Number(point.lat ?? point.latitude ?? point.y);
  const lng = Number(point.lng ?? point.lon ?? point.longitude ?? point.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

function pointsForTrack(track) {
  const geo = STATE.gpxGeometryByTrack?.[track.id];
  if (!geo || geo === 'loading') return [];
  const points = Array.isArray(geo) ? geo : geo.points;
  if (!Array.isArray(points)) return [];
  return points.map(pointToLatLng).filter(Boolean);
}

function drawableTracks() {
  return completedTracks()
    .map((track) => ({ track, points: pointsForTrack(track) }))
    .filter((row) => row.points.length >= 2);
}

function routeKey() {
  return completedTracks()
    .map((track) => `${track.id}:${pointsForTrack(track).length}`)
    .sort()
    .join('|');
}

function trackLabel(track) {
  return String(track.file_path || track.filename || 'GPX route').split('/').pop() || 'GPX route';
}

function buildMap(L, el) {
  el.innerHTML = '';
  map = L.map(el, {
    dragging: true,
    scrollWheelZoom: true,
    touchZoom: true,
    doubleClickZoom: true,
    keyboard: true,
    tap: true,
    zoomControl: true,
    attributionControl: true,
    boxZoom: false,
  }).setView([40, 0], 5);

  L.tileLayer(TILE_URL, {
    maxZoom: 18,
    attribution: TILE_ATTRIBUTION,
    crossOrigin: true,
    updateWhenIdle: true,
    keepBuffer: 2,
  }).addTo(map);

  layerGroup = L.layerGroup().addTo(map);
  window.setTimeout(() => { if (mapIsAlive()) map.invalidateSize(); }, 80);
  window.setTimeout(() => { if (mapIsAlive()) map.invalidateSize(); }, 260);
}

function drawRoutes(L) {
  if (!mapIsAlive() || !layerGroup) return;
  const key = routeKey();
  if (key === lastRouteKey) return;
  lastRouteKey = key;

  layerGroup.clearLayers();

  const tracks = completedTracks();
  const drawable = [];
  const allPoints = [];

  tracks.forEach((track) => {
    const points = pointsForTrack(track);
    if (points.length < 2) return;
    drawable.push(track);
    allPoints.push(...points);
    const polyline = L.polyline(points, {
      color: '#26345e',
      weight: 3,
      opacity: 0.85,
      interactive: false,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layerGroup);
    polyline.bindTooltip(trackLabel(track));
    L.circleMarker(points[0], {
      radius: 5,
      color: '#26345e',
      fillColor: '#f3f0e4',
      fillOpacity: 1,
      weight: 2,
      interactive: false,
    }).addTo(layerGroup);
    L.circleMarker(points[points.length - 1], {
      radius: 5,
      color: '#b85a2e',
      fillColor: '#edcdb8',
      fillOpacity: 1,
      weight: 2,
      interactive: false,
    }).addTo(layerGroup);
  });

  if (!tracks.length) {
    setStatus('No completed GPX tracks found yet.');
    map.setView([40, 0], 5);
    return;
  }

  if (!drawable.length) {
    setStatus(STATE.archiveGpxLoading ? 'Loading GPX geometry…' : 'Completed GPX tracks exist, but no drawable geometry is available.');
    map.setView([40, 0], 5);
    return;
  }

  const bounds = L.latLngBounds(allPoints);
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13, animate: false });
  setStatus(`${drawable.length} completed GPX route${drawable.length === 1 ? '' : 's'} shown on OpenStreetMap.`);
}

function projectedPath(points, bounds, width, height, padding) {
  const [minLat, maxLat, minLng, maxLng] = bounds;
  const latSpan = Math.max(0.000001, maxLat - minLat);
  const lngSpan = Math.max(0.000001, maxLng - minLng);
  return points.map(([lat, lng]) => {
    const x = padding + ((lng - minLng) / lngSpan) * (width - padding * 2);
    const y = padding + ((maxLat - lat) / latSpan) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function drawSvgFallback(error) {
  const el = slot();
  if (!el || !isAttached(el)) return;

  const drawable = drawableTracks();
  if (!drawable.length) {
    el.innerHTML = `<div class="rf-v2-map-fallback"><div><strong>Map unavailable</strong><span>${esc(error?.message || 'No drawable GPX geometry yet.')}</span></div></div>`;
    setStatus('Interactive map unavailable. No drawable GPX route geometry found yet.');
    return;
  }

  const points = drawable.flatMap((row) => row.points);
  const lats = points.map(([lat]) => lat);
  const lngs = points.map(([, lng]) => lng);
  const bounds = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const width = 1200;
  const height = 360;
  const padding = 36;
  const paths = drawable.map((row, index) => {
    const d = projectedPath(row.points, bounds, width, height, padding);
    const first = row.points[0];
    const last = row.points[row.points.length - 1];
    const firstPoint = projectedPath([first], bounds, width, height, padding);
    const lastPoint = projectedPath([last], bounds, width, height, padding);
    const [sx, sy] = firstPoint.split(',');
    const [ex, ey] = lastPoint.split(',');
    return `<polyline class="rf-v2-map-route" points="${d}"><title>${esc(trackLabel(row.track))}</title></polyline>${index === 0 ? `<circle class="rf-v2-map-start" cx="${sx}" cy="${sy}" r="6"/>` : ''}<circle class="rf-v2-map-end" cx="${ex}" cy="${ey}" r="6"/>`;
  }).join('');

  el.innerHTML = `<svg class="rf-v2-map-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Archive GPX route map fallback"><defs><pattern id="rf-map-grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M 80 0 L 0 0 0 80" fill="none" stroke="currentColor" stroke-opacity="0.08" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#rf-map-grid)"/>${paths}</svg>`;
  setStatus(`${drawable.length} completed GPX route${drawable.length === 1 ? '' : 's'} shown as a local GPX fallback. OpenStreetMap tiles are unavailable.`);
}

async function render() {
  if (!isArchiveView()) {
    destroyMap();
    return;
  }

  const el = slot();
  if (!el) {
    destroyMap();
    return;
  }

  if (el === lastSlot && mapIsAlive()) {
    const L = await ensureLeaflet().catch(() => null);
    if (L) drawRoutes(L);
    else drawSvgFallback(new Error('Leaflet unavailable.'));
    return;
  }

  if (initInFlight) {
    renderAgain = true;
    return;
  }

  initInFlight = true;
  renderAgain = false;
  destroyMap();
  lastSlot = el;
  setStatus('Loading archive geography…');

  try {
    api().ensureArchiveData?.();
    api().ensureArchiveGpxGeometries?.();
    const L = await ensureLeaflet();
    if (slot() !== el || !isAttached(el)) return;
    buildMap(L, el);
    drawRoutes(L);
  } catch (error) {
    if (slot() === el && isAttached(el)) drawSvgFallback(error);
  } finally {
    initInFlight = false;
    if (renderAgain) schedule();
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    render();
  });
}

document.addEventListener('routefolk:v2-render', schedule);
document.addEventListener('routefolk:render', schedule);
document.addEventListener('routefolk:archive-map-refresh', schedule);
window.addEventListener('resize', () => { if (mapIsAlive()) map.invalidateSize(); });
schedule();
