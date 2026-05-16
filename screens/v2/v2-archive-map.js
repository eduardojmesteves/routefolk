// ============================================================
// routefolk — screens/v2/v2-archive-map.js
// Archive geography renderer.
// Uses archived trip GPX geometry from STATE and renders a reliable
// field-map SVG. This avoids blank map regressions while keeping the
// local Leaflet-compatible vendor available for future base-map work.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';

let lastSignature = '';
let hydrationStarted = false;

function api() {
  return window.routefolkData || {};
}

function isArchiveView() {
  return STATE.user && STATE.tab === 'archive';
}

function archiveMapCard() {
  return document.querySelector('.rf-d2-map-card, .rf-m2-map-card');
}

function replaceMapCardShell(card) {
  if (!card || card.querySelector('.rf-v2-archive-map')) return;
  card.innerHTML = `
    <div class="rf-v2-archive-map rf-v2-archive-svg-map" id="rf-v2-archive-map" role="img" aria-label="Archive GPX route map"></div>
    <div class="rf-v2-archive-map-status" id="rf-v2-archive-map-status">Loading archive geography…</div>
  `;
}

function status(text) {
  const node = document.getElementById('rf-v2-archive-map-status');
  if (node) node.textContent = text;
}

function archivedTripIds() {
  return new Set(
    STATE.trips
      .filter((trip) => trip.status === 'completed' || trip.status === 'cancelled')
      .map((trip) => trip.id),
  );
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
    // GPX parsers in this app usually store [lat,lng], GeoJSON stores [lng,lat].
    return Math.abs(a) <= 90 ? [a, b] : [b, a];
  }
  if (!point || typeof point !== 'object') return null;
  const lat = Number(point.lat ?? point.latitude ?? point.y);
  const lng = Number(point.lng ?? point.lon ?? point.longitude ?? point.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
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
  return tracksForArchivedTrips()
    .map((track) => ({ track, points: geometryForTrack(track) }))
    .filter((item) => item.points);
}

function mapSignature() {
  const tracks = tracksForArchivedTrips();
  return JSON.stringify({
    tab: STATE.tab,
    loading: STATE.archiveDataLoading || STATE.archiveGpxLoading,
    tracks: tracks.map((track) => ({ id: track.id, points: geometryForTrack(track)?.length || 0 })),
  });
}

function boundsFor(geometries) {
  const all = geometries.flatMap((item) => item.points);
  if (!all.length) return null;
  const lats = all.map((point) => point[0]);
  const lngs = all.map((point) => point[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latPad = Math.max((maxLat - minLat) * 0.18, 0.04);
  const lngPad = Math.max((maxLng - minLng) * 0.18, 0.04);
  return { minLat: minLat - latPad, maxLat: maxLat + latPad, minLng: minLng - lngPad, maxLng: maxLng + lngPad };
}

function makeProjector(bounds, width, height) {
  return ([lat, lng]) => {
    const x = ((lng - bounds.minLng) / Math.max(bounds.maxLng - bounds.minLng, 0.00001)) * width;
    const y = height - ((lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.00001)) * height;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  };
}

function simplify(points, maxPoints = 420) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

function pathFor(points, project) {
  return simplify(points)
    .map((point, index) => {
      const [x, y] = project(point);
      return `${index ? 'L' : 'M'} ${x} ${y}`;
    })
    .join(' ');
}

function renderSvgMap() {
  const el = document.getElementById('rf-v2-archive-map');
  if (!el) return;

  const tracks = tracksForArchivedTrips();
  const geometries = geometriesForArchive();

  if (!tracks.length) {
    el.innerHTML = `<div class="rf-v2-archive-empty-map">No GPX tracks in archived trips yet.</div>`;
    status('Upload GPX files to completed or cancelled trips to build the archive geography.');
    return;
  }

  if (!geometries.length) {
    el.innerHTML = `<div class="rf-v2-archive-empty-map">GPX tracks found, but route geometry is still unavailable.</div>`;
    status(STATE.archiveGpxLoading ? 'Loading GPX geometry…' : 'No usable GPX geometry loaded yet.');
    return;
  }

  const width = 1200;
  const height = 360;
  const bounds = boundsFor(geometries);
  const project = makeProjector(bounds, width, height);
  const pathHtml = geometries.map(({ track, points }, index) => {
    const d = pathFor(points, project);
    const [sx, sy] = project(points[0]);
    const [ex, ey] = project(points[points.length - 1]);
    const name = esc(track.file_path ? track.file_path.split('/').pop() : `GPX route ${index + 1}`);
    return `
      <path class="rf-v2-archive-route" d="${d}"><title>${name}</title></path>
      <circle class="rf-v2-archive-start" cx="${sx}" cy="${sy}" r="5"><title>${name} start</title></circle>
      <circle class="rf-v2-archive-end" cx="${ex}" cy="${ey}" r="5"><title>${name} end</title></circle>
    `;
  }).join('');

  el.innerHTML = `
    <svg class="rf-v2-archive-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs>
        <pattern id="rf-v2-map-contours" width="260" height="90" patternUnits="userSpaceOnUse">
          <path d="M -20 48 C 70 5 160 88 280 44" fill="none" stroke="rgba(38,52,94,.16)" stroke-width="1"/>
          <path d="M -20 75 C 80 35 150 112 280 73" fill="none" stroke="rgba(38,52,94,.11)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="rgba(243,240,228,.58)"/>
      <rect width="${width}" height="${height}" fill="url(#rf-v2-map-contours)"/>
      <g class="rf-v2-archive-grid">
        <path d="M80 0 V${height} M240 0 V${height} M400 0 V${height} M560 0 V${height} M720 0 V${height} M880 0 V${height} M1040 0 V${height}"/>
        <path d="M0 72 H${width} M0 144 H${width} M0 216 H${width} M0 288 H${width}"/>
      </g>
      <g>${pathHtml}</g>
    </svg>
  `;

  status(`${geometries.length} GPX route${geometries.length === 1 ? '' : 's'} shown from archived trips.`);
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
  if (!isArchiveView()) {
    lastSignature = '';
    return;
  }

  const card = archiveMapCard();
  if (!card) return;
  replaceMapCardShell(card);

  if (STATE.archiveDataLoading || STATE.archiveGpxLoading) status('Loading archive geography…');

  const signature = mapSignature();
  if (signature !== lastSignature) {
    lastSignature = signature;
    renderSvgMap();
  }

  hydrateArchiveGpx();
}

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(renderArchiveMap));
window.addEventListener('resize', () => requestAnimationFrame(renderArchiveMap));
requestAnimationFrame(renderArchiveMap);
