// ============================================================
// routefolk — Leaflet archive map renderer
//
// Handles everything that needs `window.L`: probing for the runtime,
// creating the map + tile layer, drawing the GPX overlay, and tearing
// the map down. The controller in archive-map-controller.js owns the
// lifecycle; this module is intentionally state-light (it returns the
// objects it creates rather than caching them in module scope).
// ============================================================

import {
  collectCompletedGpxTracks,
  pointsForTrack,
  trackLabel,
} from './archive-map-geometry.js';

const DEFAULT_CENTER = [40, 0];
const DEFAULT_ZOOM = 5;

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_OPTIONS = {
  maxZoom: 18,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  crossOrigin: true,
  updateWhenIdle: true,
  keepBuffer: 2,
};

const MAP_OPTIONS = {
  dragging: true,
  scrollWheelZoom: true,
  touchZoom: true,
  doubleClickZoom: true,
  keyboard: true,
  tap: true,
  zoomControl: true,
  attributionControl: true,
  boxZoom: false,
};

const TRACK_LINE_STYLE = {
  color: '#26345e',
  weight: 3,
  opacity: 0.85,
  interactive: false,
  lineCap: 'round',
  lineJoin: 'round',
};

const START_MARKER_STYLE = {
  radius: 5,
  color: '#26345e',
  fillColor: '#f3f0e4',
  fillOpacity: 1,
  weight: 2,
  interactive: false,
};

const END_MARKER_STYLE = {
  radius: 5,
  color: '#b85a2e',
  fillColor: '#edcdb8',
  fillOpacity: 1,
  weight: 2,
  interactive: false,
};

/**
 * Detect whether window.L exposes the subset of Leaflet APIs the
 * archive map relies on.
 */
export function isLeafletReady() {
  const L = typeof window !== 'undefined' ? window.L : null;
  return !!(
    L &&
    L.map &&
    L.tileLayer &&
    L.polyline &&
    L.layerGroup &&
    L.circleMarker &&
    L.latLngBounds
  );
}

/**
 * Poll for Leaflet to become available, up to `timeoutMs`.
 * Resolves to true if/when it arrives, false on timeout.
 */
export function waitForLeaflet(timeoutMs = 2000) {
  return new Promise((resolve) => {
    if (isLeafletReady()) return resolve(true);
    const start = Date.now();
    const handle = window.setInterval(() => {
      if (isLeafletReady()) {
        window.clearInterval(handle);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        window.clearInterval(handle);
        resolve(false);
      }
    }, 40);
  });
}

/**
 * Mount a fresh Leaflet map + tile layer + (empty) layer group into
 * `container`. Returns { map, layerGroup }.
 *
 * `onTileError` fires the first time an OpenStreetMap tile fails so
 * the caller can log/telemeter it (the controller dedupes the warning).
 * `onReady` fires after the map has had a chance to size itself so the
 * controller can recompute layout (invalidateSize) when appropriate.
 */
export function createLeafletMap(L, container, { onTileError, onReady } = {}) {
  container.innerHTML = '';
  const map = L.map(container, MAP_OPTIONS).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  const tileLayer = L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(map);
  tileLayer.on?.('tileerror', () => {
    onTileError?.();
  });
  const layerGroup = L.layerGroup().addTo(map);
  if (typeof onReady === 'function') {
    window.setTimeout(() => onReady(map), 80);
    window.setTimeout(() => onReady(map), 260);
  }
  return { map, layerGroup };
}

/**
 * Tear a Leaflet map instance down. Safe to call with null/already-
 * destroyed instances.
 */
export function destroyLeafletMap(map) {
  if (!map) return;
  try {
    map.off?.();
  } catch {}
  try {
    map.remove();
  } catch {}
}

/**
 * Check whether `map` is still bound to `container` (i.e. the DOM
 * hasn't been re-rendered out from under us).
 */
export function mapMatchesContainer(map, container) {
  if (!map || !container) return false;
  try {
    return map.getContainer() === container;
  } catch {
    return false;
  }
}

/**
 * Build a stable signature for the current GPX tracks so the renderer
 * can short-circuit when nothing has changed.
 */
export function tracksSignature(tracks, state) {
  return tracks
    .map((track) => `${track.id}:${pointsForTrack(track, state.gpxGeometryByTrack).length}`)
    .sort()
    .join('|');
}

/**
 * Draw all completed GPX tracks (polylines + start/end dots) onto
 * `layerGroup`, fit the map's viewport to them, and return a status
 * message describing what happened.
 *
 * Returns one of:
 *   { kind: 'empty' }                  — no completed tracks at all
 *   { kind: 'no-geometry', loading }   — tracks exist but no points
 *   { kind: 'drawn', count }           — tracks were rendered
 */
export function drawTracksOnMap(L, map, layerGroup, state) {
  layerGroup.clearLayers();
  const tracks = collectCompletedGpxTracks(state);
  const drawn = [];
  const allPoints = [];

  tracks.forEach((track) => {
    const points = pointsForTrack(track, state.gpxGeometryByTrack);
    if (points.length < 2) return;
    drawn.push(track);
    allPoints.push(...points);
    L.polyline(points, TRACK_LINE_STYLE).addTo(layerGroup).bindTooltip(trackLabel(track));
    L.circleMarker(points[0], START_MARKER_STYLE).addTo(layerGroup);
    L.circleMarker(points[points.length - 1], END_MARKER_STYLE).addTo(layerGroup);
  });

  if (!tracks.length) {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    return { kind: 'empty' };
  }
  if (!drawn.length) {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    return { kind: 'no-geometry', loading: !!state.archiveGpxLoading };
  }

  const bounds = L.latLngBounds(allPoints);
  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13, animate: false });
  }
  return { kind: 'drawn', count: drawn.length };
}
