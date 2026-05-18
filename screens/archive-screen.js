// ============================================================
// routefolk — screens/archive-screen.js
// Archive screen rendering and cached GPX geography view.
// Screenshot fidelity pass preserves existing GPX map modes.
// ============================================================

import { STATE } from '../state/app-state.js';
import { ARCHIVE_SCREEN_STATUSES, EUROPE_BOUNDARY_LINES } from '../constants/app-constants.js';
import { esc } from '../utils/dom.js';
import { fmtEuro } from '../utils/format.js';
import { signedOutState, errorCard } from '../components/feedback.js';
import { tripCardHtml } from '../components/trip-card.js';
import { trackFileName } from '../lib/gpx.js';

const HEATMAP_CACHE_LIMIT = 12;
const archiveHeatmapCache = new Map();

function gpxTracksForTrip(tripId) {
  const tracks = STATE.gpxByTrip[tripId];
  return Array.isArray(tracks) ? tracks : [];
}

function archiveTripsBase() {
  return STATE.trips.filter((t) => ARCHIVE_SCREEN_STATUSES.includes(t.status));
}

function completedArchiveTrips() {
  return STATE.trips.filter((t) => t.status === 'completed');
}

function archiveFiltersHtml() {
  const chips = [
    { key: 'all', label: 'All' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];
  const hasQuery = Boolean(STATE.archiveSearch.trim());

  return `
    <div class="rf-trip-filters rf-archive-filters">
      <div class="rf-filter-row">
        <div class="rf-chips" role="group" aria-label="Archive status filter">
          ${chips.map((chip) => `
            <button class="rf-chip ${STATE.archiveStatusFilter === chip.key ? 'is-active' : ''}" data-archive-status-chip="${esc(chip.key)}" type="button">
              ${esc(chip.label)}
            </button>
          `).join('')}
        </div>
        <button class="rf-search-pill ${hasQuery ? 'is-open' : ''}" id="archiveSearchPillBtn" data-search-pill="archive" type="button" aria-expanded="${hasQuery ? 'true' : 'false'}" aria-label="Search archive">
          <span class="rf-search-pill__icon" aria-hidden="true">⌕</span>
          <span class="rf-search-pill__label">Search</span>
        </button>
      </div>
      <div class="rf-search-drawer" id="archiveSearchDrawer" ${hasQuery ? '' : 'hidden'}>
        <input class="rf-search-input" id="archiveSearchInput" type="search" value="${esc(STATE.archiveSearch)}" placeholder="Search by name">
      </div>
    </div>
  `;
}

function filteredArchiveTrips() {
  const query = STATE.archiveSearch.trim().toLowerCase();
  return archiveTripsBase().filter((trip) => {
    const matchesStatus = STATE.archiveStatusFilter === 'all' || trip.status === STATE.archiveStatusFilter;
    const matchesSearch = !query || String(trip.title || '').toLowerCase().includes(query) || String(trip.description || '').toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });
}

function archiveMetrics() {
  const completed = completedArchiveTrips();
  let distance = 0;
  let cost = 0;
  let entries = 0;
  let completeData = true;

  completed.forEach((trip) => {
    const stages = STATE.stagesByTrip[trip.id];
    const expenses = STATE.expensesByTrip[trip.id];

    if (!Array.isArray(stages)) {
      completeData = false;
    } else {
      distance += stages.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0);
      stages.forEach((stage) => {
        const stageEntries = STATE.entriesByStage[stage.id];
        if (Array.isArray(stageEntries)) entries += stageEntries.length;
        else completeData = false;
      });
    }

    if (Array.isArray(expenses)) cost += expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    else completeData = false;
  });

  return { completedCount: completed.length, distance, cost, entries, completeData };
}

function archiveMetricsHtml() {
  const metrics = archiveMetrics();
  const loading = STATE.archiveDataLoading || !metrics.completeData;
  return `
    <section class="archive-stats" aria-label="Archive metrics">
      <div class="rf-archive-stat"><div class="rf-archive-stat__label">Completed</div><div class="rf-archive-stat__v">${esc(metrics.completedCount)}</div><div class="rf-archive-stat__sub">Trips</div></div>
      <div class="rf-archive-stat"><div class="rf-archive-stat__label">Distance</div><div class="rf-archive-stat__v">${loading ? '…' : esc(Math.round(metrics.distance).toLocaleString())}</div><div class="rf-archive-stat__sub">Kilometres</div></div>
      <div class="rf-archive-stat"><div class="rf-archive-stat__label">Spent</div><div class="rf-archive-stat__v">${loading ? '…' : esc(fmtEuro(metrics.cost || 0, { compact: true }))}</div><div class="rf-archive-stat__sub">Lifetime</div></div>
      <div class="rf-archive-stat"><div class="rf-archive-stat__label">Notes</div><div class="rf-archive-stat__v">${loading ? '…' : esc(metrics.entries)}</div><div class="rf-archive-stat__sub">Journal</div></div>
    </section>
    ${STATE.archiveDataLoading ? `<div class="form-help" style="margin:8px var(--rf-page-x) 0;">Loading archive details…</div>` : ''}
    ${STATE.archiveDataError ? `<div class="stage-warn" style="margin:8px var(--rf-page-x);">${esc(STATE.archiveDataError)}</div><button class="btn btn-secondary btn-sm" id="retryArchiveDataBtn" style="margin:8px var(--rf-page-x);">Retry archive details</button>` : ''}
  `;
}

function archiveTripMetaText(trip) {
  const stages = STATE.stagesByTrip[trip.id];
  const expenses = STATE.expensesByTrip[trip.id];
  const stagesLoaded = Array.isArray(stages);
  const expensesLoaded = Array.isArray(expenses);
  const stageCount = stagesLoaded ? stages.length : null;
  const distance = stagesLoaded ? stages.reduce((sum, s) => sum + (Number(s.distance_km) || 0), 0) : null;
  const cost = expensesLoaded ? expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) : null;
  return [
    trip.start_date ? String(trip.start_date).slice(0, 4) : null,
    stagesLoaded && distance ? `${Math.round(distance)} km` : null,
    stagesLoaded ? `${stageCount} stages` : null,
    expensesLoaded && cost ? fmtEuro(cost, { compact: true }) : null,
  ].filter(Boolean).join(' · ');
}

function archiveTripMetaHtml(trip) {
  const meta = archiveTripMetaText(trip);
  return meta ? `<div class="trip-desc archive-trip-meta">${esc(meta)}</div>` : '';
}

function archiveTripCardHtml(trip) {
  const base = tripCardHtml(trip);
  return base.replace('</button>', `${archiveTripMetaHtml(trip)}</button>`);
}

function archiveResultsListHtml() {
  const allArchived = archiveTripsBase();
  const trips = filteredArchiveTrips();
  const hasFilters = STATE.archiveSearch.trim() || STATE.archiveStatusFilter !== 'all';

  if (!allArchived.length) {
    return `<div class="empty-state"><div class="empty-title">Archive</div><div class="empty-sub">Completed and cancelled trips will appear here.</div></div>`;
  }

  if (!trips.length) {
    return `<div class="empty-state"><div class="empty-title">No matching archived trips</div><div class="empty-sub">${hasFilters ? 'Adjust the search or status filter.' : 'No archived trips to show.'}</div></div>`;
  }

  return `<div class="trip-list archive-trip-list">${trips.map(archiveTripCardHtml).join('')}</div>`;
}

function archiveMapLayerToggleHtml() {
  const layers = [
    { key: 'heatmap', label: 'Heatmap' },
    { key: 'hybrid', label: 'Hybrid' },
    { key: 'routes', label: 'Routes' },
  ];
  return `
    <div class="archive-layer-toggle" role="group" aria-label="Archive map style">
      ${layers.map((layer) => `
        <button class="archive-layer-btn ${STATE.archiveMapLayer === layer.key ? 'active' : ''}" data-archive-layer="${esc(layer.key)}" type="button">
          ${esc(layer.label)}
        </button>
      `).join('')}
    </div>
  `;
}

function archiveMapHtml() {
  const allArchived = archiveTripsBase();
  const completed = filteredArchiveTrips().filter((trip) => trip.status === 'completed');

  if (!allArchived.length) return archiveResultsListHtml();

  if (!completed.length) {
    return `<div class="archive-map-wrap"><div class="archive-map-empty"><div><div class="empty-title">No completed trips to map</div><div class="empty-sub">Cancelled trips stay listed for reference, but they are not plotted.</div></div></div></div>`;
  }

  const tracks = completed.flatMap((trip) => gpxTracksForTrip(trip.id).map((track) => ({ trip, track })));
  if (!tracks.length) {
    return `
      <div class="archive-map-wrap">
        <div class="archive-map-heading">
          <div><div class="card-title">The geography</div><div class="form-help">GPX-powered overview. Upload GPX files to stages to build the map.</div></div>
          <div class="rf-map-mode-label">${esc((STATE.archiveMapLayer || 'heatmap').toUpperCase())}</div>
        </div>
        <div class="archive-map-empty archive-map-empty-tall"><div><div class="empty-title">No GPX tracks yet</div><div class="empty-sub">Upload GPX files inside each stage.</div></div></div>
      </div>
    `;
  }

  const missing = tracks.filter(({ track }) => !STATE.gpxGeometryByTrack[track.id]);
  if (missing.length || STATE.archiveGpxLoading) {
    return `<div class="archive-map-wrap"><div class="archive-map-heading"><div><div class="card-title">The geography</div><div class="form-help">Loading GPX route geometry…</div></div></div><div class="archive-map-empty archive-map-empty-tall"><div><div class="empty-title">Loading GPX tracks…</div></div></div></div>`;
  }

  const records = archiveMapRecordsFromGpx();
  if (!records.length) {
    return `<div class="archive-map-wrap"><div class="archive-map-empty archive-map-empty-tall"><div><div class="empty-title">No usable GPX geometry</div><div class="empty-sub">GPX files exist, but no usable route points could be parsed.</div></div></div></div>`;
  }

  return `
    <div class="archive-map-wrap">
      <div class="archive-map-heading">
        <div>
          <div class="card-title">The geography</div>
          <div class="form-help">Completed trips from real stage GPX data.</div>
        </div>
        <div class="rf-map-mode-label">${esc((STATE.archiveMapLayer || 'heatmap').toUpperCase())}</div>
      </div>
      <details class="rf-archive-map-controls" ${STATE.archiveFiltersOpen ? 'open' : ''}>
        <summary>Map style</summary>
        ${archiveMapLayerToggleHtml()}
      </details>
      ${STATE.archiveGpxError ? `<div class="stage-warn" style="margin:8px 0;">${esc(STATE.archiveGpxError)}</div>` : ''}
      ${archiveGeoMapSvg(records)}
    </div>
  `;
}

function archiveMapRecordsFromGpx() {
  const completed = filteredArchiveTrips().filter((trip) => trip.status === 'completed');
  return completed.map((trip) => {
    const tracks = gpxTracksForTrip(trip.id);
    const polylines = tracks.map((track) => {
      const geometry = STATE.gpxGeometryByTrack[track.id];
      const routePoints = geometry && geometry !== 'loading' && Array.isArray(geometry.points) ? geometry.points : [];
      const heatPoints = geometry && geometry !== 'loading' && Array.isArray(geometry.heatPoints) ? geometry.heatPoints : [];
      return { track, points: simplifyTrackPoints(routePoints, 420), heatPoints: heatPoints.length >= 2 ? heatPoints : null };
    }).filter((line) => line.points.length >= 2);
    return { trip, polylines, point: archivePointFromPolylines(polylines) };
  }).filter((record) => record.polylines.length);
}

function simplifyTrackPoints(points, maxPoints = 420) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  const step = Math.ceil(points.length / maxPoints);
  const reduced = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (last && reduced[reduced.length - 1] !== last) reduced.push(last);
  return reduced;
}

function archivePointFromPolylines(polylines) {
  const points = polylines.flatMap((line) => line.points);
  if (!points.length) return null;
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
  return { lat, lng };
}

function archiveGeoMapSvg(records) {
  const extent = archiveMapExtent(records);
  const boundaryLines = archiveBoundaryLinesSvg(extent);
  const showHeatmap = STATE.archiveMapLayer === 'heatmap' || STATE.archiveMapLayer === 'hybrid';
  const showRoutes = STATE.archiveMapLayer === 'routes' || STATE.archiveMapLayer === 'hybrid';
  const heatmap = showHeatmap ? archiveHeatmapSvg(records, extent) : '';
  const segments = [];
  const centers = [];

  records.forEach(({ trip, point, polylines }) => {
    polylines.forEach(({ track, points }) => {
      const d = points.map((point, index) => {
        const p = projectArchivePoint(point, extent);
        return `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
      }).join(' ');
      segments.push(`<path class="archive-route-line" d="${esc(d)}" data-map-trip-id="${esc(trip.id)}"><title>${esc(trip.title)} — ${esc(trackFileName(track))}</title></path>`);
    });
    if (point) {
      const c = projectArchivePoint(point, extent);
      centers.push(`<g class="archive-trip-point" data-map-trip-id="${esc(trip.id)}" transform="translate(${c.x} ${c.y})"><circle r="7"></circle><circle r="3"></circle><title>${esc(trip.title)}</title></g>`);
    }
  });

  return `
    <svg class="archive-geo-svg" viewBox="0 0 1000 620" role="img" aria-label="Completed trip GPX archive geography overview">
      <defs><clipPath id="archiveMapClip"><rect x="42" y="28" width="916" height="540" rx="10"></rect></clipPath></defs>
      <rect class="archive-map-sea" x="0" y="0" width="1000" height="620" rx="14"></rect>
      <rect class="archive-map-land" x="42" y="28" width="916" height="540" rx="10"></rect>
      <g clip-path="url(#archiveMapClip)">
        ${showHeatmap ? `<g class="archive-heatmap">${heatmap}</g>` : ''}
        <g class="archive-boundaries">${boundaryLines}</g>
        ${showRoutes ? `<g class="archive-routes">${segments.join('')}</g>` : ''}
        <g class="archive-points">${centers.join('')}</g>
      </g>
    </svg>
  `;
}

function archiveHeatmapSvg(records, extent) {
  const cols = 160;
  const rows = 90;
  const cacheKey = archiveHeatmapCacheKey(records, extent, cols, rows);
  const cached = archiveHeatmapCache.get(cacheKey);
  if (typeof cached === 'string') {
    archiveHeatmapCache.delete(cacheKey);
    archiveHeatmapCache.set(cacheKey, cached);
    return cached;
  }

  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  records.forEach(({ polylines }) => {
    polylines.forEach(({ points, heatPoints }) => {
      const sampled = Array.isArray(heatPoints) && heatPoints.length >= 2 ? heatPoints : resampleTrackForHeatmap(points, 0.25, 2600);
      sampled.forEach((point) => addArchiveHeat(point, extent, grid, cols, rows));
    });
  });

  const values = grid.flat().filter((v) => v > 0);
  if (!values.length) {
    rememberArchiveHeatmap(cacheKey, '');
    return '';
  }
  values.sort((a, b) => a - b);
  const p98 = values[Math.floor((values.length - 1) * 0.98)] || values[values.length - 1] || 1;
  const maxValue = Math.max(p98, 1);
  const cellW = 916 / cols;
  const cellH = 540 / rows;
  const cells = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const v = grid[y][x];
      if (v <= 0.001) continue;
      const norm = Math.min(1, Math.log1p(v) / Math.log1p(maxValue));
      if (norm < 0.10) continue;
      cells.push(`<rect class="archive-heat-cell" x="${(42 + x * cellW).toFixed(2)}" y="${(28 + y * cellH).toFixed(2)}" width="${cellW.toFixed(2)}" height="${cellH.toFixed(2)}" rx="1.5" ry="1.5" fill="${archiveHeatColor(norm)}" fill-opacity="${(0.06 + norm * 0.42).toFixed(3)}"></rect>`);
    }
  }

  const svg = cells.join('');
  rememberArchiveHeatmap(cacheKey, svg);
  return svg;
}

function archiveHeatmapCacheKey(records, extent, cols, rows) {
  const viewport = [extent.minLat, extent.maxLat, extent.minLng, extent.maxLng].map((value) => Number(value).toFixed(3)).join(':');
  const tracks = records.flatMap((record) => (record.polylines || []).map((line) => {
    const track = line.track || {};
    return [track.id || track.file_path || 'unknown', track.updated_at || track.uploaded_at || track.created_at || '', track.point_count || '', Array.isArray(line.points) ? line.points.length : 0, Array.isArray(line.heatPoints) ? line.heatPoints.length : 0].join('@');
  })).sort().join('|');
  return `${cols}x${rows}:${viewport}:${tracks}`;
}

function rememberArchiveHeatmap(key, svg) {
  archiveHeatmapCache.set(key, svg);
  while (archiveHeatmapCache.size > HEATMAP_CACHE_LIMIT) archiveHeatmapCache.delete(archiveHeatmapCache.keys().next().value);
}

function resampleTrackForHeatmap(points, spacingKm = 0.25, maxSamples = 2600) {
  if (!Array.isArray(points) || points.length < 2) return points || [];
  const samples = [points[0]];
  let carried = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const segmentKm = haversineKm(prev, current);
    if (!Number.isFinite(segmentKm) || segmentKm <= 0) continue;
    let remaining = segmentKm;
    let anchor = prev;
    while (carried + remaining >= spacingKm && samples.length < maxSamples) {
      const need = spacingKm - carried;
      const ratio = Math.max(0, Math.min(1, need / remaining));
      const sample = interpolateGeoPoint(anchor, current, ratio);
      samples.push(sample);
      anchor = sample;
      remaining = haversineKm(anchor, current);
      carried = 0;
      if (!Number.isFinite(remaining) || remaining <= 0.00001) break;
    }
    carried += remaining;
    if (samples.length >= maxSamples) break;
  }
  const finalPoint = points[points.length - 1];
  if (samples[samples.length - 1] !== finalPoint && samples.length < maxSamples) samples.push(finalPoint);
  return samples;
}

function haversineKm(a, b) {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function interpolateGeoPoint(a, b, t) {
  return { lat: Number(a.lat) + (Number(b.lat) - Number(a.lat)) * t, lng: Number(a.lng) + (Number(b.lng) - Number(a.lng)) * t };
}

function addArchiveHeat(point, extent, grid, cols, rows) {
  const lngSpan = extent.maxLng - extent.minLng;
  const latSpan = extent.maxLat - extent.minLat;
  if (lngSpan <= 0 || latSpan <= 0) return;
  const xNorm = (point.lng - extent.minLng) / lngSpan;
  const yNorm = 1 - ((point.lat - extent.minLat) / latSpan);
  if (!Number.isFinite(xNorm) || !Number.isFinite(yNorm) || xNorm < 0 || xNorm > 1 || yNorm < 0 || yNorm > 1) return;
  const cx = Math.floor(xNorm * (cols - 1));
  const cy = Math.floor(yNorm * (rows - 1));
  [{ dx: 0, dy: 0, w: 1 }, { dx: -1, dy: 0, w: .55 }, { dx: 1, dy: 0, w: .55 }, { dx: 0, dy: -1, w: .55 }, { dx: 0, dy: 1, w: .55 }, { dx: -1, dy: -1, w: .3 }, { dx: -1, dy: 1, w: .3 }, { dx: 1, dy: -1, w: .3 }, { dx: 1, dy: 1, w: .3 }].forEach(({ dx, dy, w }) => {
    const x = cx + dx;
    const y = cy + dy;
    if (x >= 0 && x < cols && y >= 0 && y < rows) grid[y][x] += w;
  });
}

function archiveHeatColor(t) {
  if (t < 0.22) return '#2563eb';
  if (t < 0.45) return '#06b6d4';
  if (t < 0.68) return '#facc15';
  if (t < 0.86) return '#fb923c';
  return '#ef4444';
}

function archiveBoundaryLinesSvg(extent) {
  return EUROPE_BOUNDARY_LINES.map((line) => {
    const commands = [];
    let open = false;
    line.forEach(([lng, lat]) => {
      const visible = archiveBoundaryPointNearExtent(lng, lat, extent);
      if (!visible) { open = false; return; }
      const p = projectArchivePoint({ lat, lng }, extent);
      commands.push(`${open ? 'L' : 'M'} ${p.x} ${p.y}`);
      open = true;
    });
    if (commands.length < 2) return '';
    return `<path class="archive-country-line" d="${esc(commands.join(' '))}"></path>`;
  }).join('');
}

function archiveBoundaryPointNearExtent(lng, lat, extent) {
  const latBuffer = Math.max((extent.maxLat - extent.minLat) * 0.22, 1.5);
  const lngBuffer = Math.max((extent.maxLng - extent.minLng) * 0.22, 1.5);
  return lat >= extent.minLat - latBuffer && lat <= extent.maxLat + latBuffer && lng >= extent.minLng - lngBuffer && lng <= extent.maxLng + lngBuffer;
}

function archiveMapExtent(records) {
  const coords = [];
  records.forEach((record) => {
    if (record.point) coords.push(record.point);
    (record.polylines || []).forEach((line) => coords.push(...line.points));
  });
  let minLat = Math.min(...coords.map((p) => p.lat));
  let maxLat = Math.max(...coords.map((p) => p.lat));
  let minLng = Math.min(...coords.map((p) => p.lng));
  let maxLng = Math.max(...coords.map((p) => p.lng));
  if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) || !Number.isFinite(minLng) || !Number.isFinite(maxLng)) return { minLat: 35, maxLat: 45, minLng: -10, maxLng: 5 };
  const latSpan = Math.max(maxLat - minLat, 1);
  const lngSpan = Math.max(maxLng - minLng, 1);
  minLat = Math.max(-85, minLat - Math.max(latSpan * .18, .5));
  maxLat = Math.min(85, maxLat + Math.max(latSpan * .18, .5));
  minLng = Math.max(-180, minLng - Math.max(lngSpan * .18, .5));
  maxLng = Math.min(180, maxLng + Math.max(lngSpan * .18, .5));
  if (maxLat - minLat < 8) { const mid = (minLat + maxLat) / 2; minLat = Math.max(-85, mid - 4); maxLat = Math.min(85, mid + 4); }
  if (maxLng - minLng < 12) { const mid = (minLng + maxLng) / 2; minLng = Math.max(-180, mid - 6); maxLng = Math.min(180, mid + 6); }
  return { minLat, maxLat, minLng, maxLng };
}

function projectArchivePoint(point, extent) {
  const xMin = 42;
  const xMax = 958;
  const yMin = 28;
  const yMax = 568;
  const x = xMin + ((point.lng - extent.minLng) / (extent.maxLng - extent.minLng)) * (xMax - xMin);
  const y = yMax - ((point.lat - extent.minLat) / (extent.maxLat - extent.minLat)) * (yMax - yMin);
  return { x: Number.isFinite(x) ? Math.round(x * 10) / 10 : 500, y: Number.isFinite(y) ? Math.round(y * 10) / 10 : 300 };
}

export function bindArchiveMapEvents(root = document, onOpenTrip = null) {
  root.querySelectorAll('[data-map-trip-id]').forEach((el) => {
    el.addEventListener('click', () => { if (typeof onOpenTrip === 'function') onOpenTrip(el.dataset.mapTripId); });
  });
}

export function archiveResultsHtml() {
  return STATE.archiveViewMode === 'map' ? archiveMapHtml() : archiveResultsListHtml();
}

export function renderArchive() {
  if (!STATE.user) return signedOutState('Sign in to see the archive', 'Completed and cancelled trips will appear here.');

  if (STATE.tripsLoading && !STATE.trips.length) return `<div class="empty-state"><div class="empty-sub">Loading archive…</div></div>`;
  if (STATE.tripsError) return errorCard(STATE.tripsError, 'retryTripsBtn');

  const archived = archiveTripsBase();
  const completed = completedArchiveTrips();
  const cancelled = archived.filter((trip) => trip.status === 'cancelled').length;

  return `
    <section class="rf-archive-screen">
      <div class="rf-mobile-brand" aria-hidden="true"></div>
      <header class="rf-header rf-archive-header">
        <div class="rf-header__kicker">The collection</div>
        <h1 class="rf-page-title">Archive</h1>
        <p class="rf-page-subtitle">${esc(completed.length)} put to bed · ${esc(cancelled)} called off</p>
      </header>
      ${archiveFiltersHtml()}
      ${archiveMetricsHtml()}
      <section class="rf-archive-geography">
        <div class="rf-archive-geo-head">
          <h2 class="rf-account-section-title">The geography</h2>
          <button class="rf-map-mode-label" id="archiveFiltersToggle" type="button" aria-expanded="${STATE.archiveFiltersOpen ? 'true' : 'false'}">${esc((STATE.archiveMapLayer || 'heatmap').toUpperCase())}</button>
        </div>
        <div id="archiveResults">${archiveResultsHtml()}</div>
      </section>
    </section>
  `;
}
