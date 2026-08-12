// ============================================================
// routefolk — archive map controller
//
// Orchestrates the archive geography map: listens for render events,
// decides whether to mount Leaflet or fall back to the local SVG, and
// keeps the overlay in sync with STATE.gpxByTrip / gpxGeometryByTrack.
//
// Owns all of the mutable lifecycle state (the Leaflet instance, the
// overlay layer, the container we last bound to, refresh debouncing,
// and one-shot warning flags). The pure helpers live in their sibling
// modules.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { errorMessage, completedTripGpxCoverage } from './archive-map-geometry.js';
import {
  createLeafletMap,
  destroyLeafletMap,
  drawTracksOnMap,
  isLeafletReady,
  mapMatchesContainer,
  tracksSignature,
  waitForLeaflet,
} from './archive-map-leaflet.js';
import { renderSvgFallback } from './archive-map-fallback.js';
import { collectCompletedGpxTracks } from './archive-map-geometry.js';

// ----- Lifecycle state ------------------------------------------------

let mapInstance = null;
let overlayLayer = null;
let lastContainer = null;
let lastSignature = '';

let isBuilding = false;
let rebuildPending = false;
let refreshScheduled = false;

let leafletLoadErrorLogged = false;
let tileErrorLogged = false;

// ----- DOM helpers ----------------------------------------------------

function getRoutefolkData() {
  return (typeof window !== 'undefined' && window.routefolkData) || {};
}

function getMapContainer() {
  return document.getElementById('rf-archive-map');
}

function setStatus(message) {
  const el = document.getElementById('rf-archive-map-status');
  if (el) el.textContent = message || '';
}

// HANDOFF.md: caption real GPX coverage across completed trips, e.g.
// "2 of 5 completed trips plotted from uploaded GPX" — never a static
// string. Trip-level (a trip may have several stages/tracks), independent
// of whether every track's geometry has finished parsing.
function coverageLabel() {
  const { withGpx, total } = completedTripGpxCoverage(STATE);
  return `${withGpx} of ${total} completed trip${total === 1 ? '' : 's'} plotted from uploaded GPX`;
}

function isInDocument(el) {
  return !!el && document.documentElement.contains(el);
}

function isMapMountedHere() {
  const container = getMapContainer();
  if (!container || !isInDocument(container)) return false;
  return mapMatchesContainer(mapInstance, container);
}

function disposeMap() {
  destroyLeafletMap(mapInstance);
  mapInstance = null;
  overlayLayer = null;
  lastContainer = null;
  lastSignature = '';
}

// ----- Rendering passes -----------------------------------------------

function renderLeafletOverlay(L) {
  if (!isMapMountedHere() || !overlayLayer) return;
  const tracks = collectCompletedGpxTracks(STATE);
  const signature = tracksSignature(tracks, STATE);
  if (signature === lastSignature) return;
  lastSignature = signature;

  const result = drawTracksOnMap(L, mapInstance, overlayLayer, STATE);
  if (result.kind === 'empty') {
    setStatus(coverageLabel());
  } else if (result.kind === 'no-geometry') {
    setStatus(
      result.loading
        ? 'Loading GPX geometry…'
        : 'Completed GPX tracks exist, but no drawable geometry is available.',
    );
  } else {
    setStatus(coverageLabel());
  }
}

function renderFallback(err) {
  const container = getMapContainer();
  if (!container || !isInDocument(container)) return;
  if (err) console.warn('[routefolk] archive map fallback:', errorMessage(err));
  const result = renderSvgFallback(container, STATE, err);
  if (result.kind === 'empty') {
    setStatus(`${coverageLabel()}. Interactive map unavailable.`);
  } else {
    setStatus(`${coverageLabel()} (local fallback — interactive map unavailable).`);
  }
}

// ----- Lifecycle ------------------------------------------------------

async function buildOrUpdateMap() {
  if (!STATE.user || STATE.tab !== 'archive' || STATE.selectedArchiveTripId) {
    disposeMap();
    return;
  }

  const container = getMapContainer();
  if (!container) {
    disposeMap();
    return;
  }

  // Fast path: same container, map still mounted — just refresh the overlay.
  if (container === lastContainer && isMapMountedHere()) {
    if (isLeafletReady()) {
      renderLeafletOverlay(window.L);
    } else {
      renderFallback(new Error('Leaflet-compatible map runtime is unavailable.'));
    }
    return;
  }

  // Another build is in flight; coalesce a follow-up refresh.
  if (isBuilding) {
    rebuildPending = true;
    return;
  }

  isBuilding = true;
  rebuildPending = false;
  disposeMap();
  lastContainer = container;
  setStatus('Loading archive geography…');

  try {
    const data = getRoutefolkData();
    data.ensureArchiveData?.();
    data.ensureArchiveGpxGeometries?.();

    const leafletAvailable = await waitForLeaflet();
    if (!leafletAvailable) {
      if (!leafletLoadErrorLogged) {
        leafletLoadErrorLogged = true;
        console.error(
          '[routefolk] Leaflet-compatible map runtime (window.L) is not available. Confirm /vendor/leaflet/leaflet.js is loaded and not blocked by CSP.',
        );
      }
      renderFallback(
        new Error('Leaflet-compatible map runtime is not available. See console for details.'),
      );
      return;
    }

    // The DOM may have re-rendered out from under us while we waited.
    if (getMapContainer() !== container || !isInDocument(container)) return;

    const L = window.L;
    tileErrorLogged = false;
    const built = createLeafletMap(L, container, {
      onTileError: () => {
        if (!tileErrorLogged) {
          tileErrorLogged = true;
          console.warn(
            '[routefolk] OpenStreetMap tile failed to load. The GPX overlay may still be available.',
          );
        }
      },
      onReady: (map) => {
        if (isMapMountedHere()) map.invalidateSize();
      },
    });
    mapInstance = built.map;
    overlayLayer = built.layerGroup;
    renderLeafletOverlay(L);
  } catch (err) {
    if (getMapContainer() === container && isInDocument(container)) renderFallback(err);
  } finally {
    isBuilding = false;
    if (rebuildPending) scheduleRefresh();
  }
}

function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  requestAnimationFrame(() => {
    refreshScheduled = false;
    buildOrUpdateMap();
  });
}

// ----- Wiring ---------------------------------------------------------

document.addEventListener('routefolk:wizard-render', scheduleRefresh);
document.addEventListener('routefolk:render', scheduleRefresh);
document.addEventListener('routefolk:archive-map-refresh', scheduleRefresh);
window.addEventListener('resize', () => {
  if (isMapMountedHere()) mapInstance.invalidateSize();
});

// Kick off an initial pass so the map paints on first load when the
// archive screen is already on-screen.
scheduleRefresh();

export { scheduleRefresh as refreshArchiveMap };
