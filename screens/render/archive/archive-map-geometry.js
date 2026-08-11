// ============================================================
// routefolk — archive map geometry helpers
//
// Pure functions that turn raw GPX-track records (as stored in
// STATE.gpxByTrip / STATE.gpxGeometryByTrack) into drawable
// [lat, lng] pairs, bounding boxes, and projected SVG coords.
//
// Everything in here is intentionally side-effect free so it can
// be unit-tested without a DOM, Leaflet, or app state.
// ============================================================

/**
 * Normalize a single GPX point into [lat, lng].
 *
 * Accepts either:
 *   - [lat, lng] arrays (and tolerates [lng, lat] when lat looks too
 *     large to be a latitude — same heuristic the legacy module used)
 *   - { lat|latitude|y, lng|lon|longitude|x } objects
 *
 * Returns null when the input cannot be coerced into finite, in-range
 * coordinates.
 */
export function normalizePoint(point) {
  if (Array.isArray(point)) {
    const lat = Number(point[0]);
    const lng = Number(point[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return Math.abs(lat) <= 90 ? [lat, lng] : [lng, lat];
  }
  if (!point || typeof point !== 'object') return null;
  const lat = Number(point.lat ?? point.latitude ?? point.y);
  const lng = Number(point.lng ?? point.lon ?? point.longitude ?? point.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

/**
 * Pull the drawable [lat, lng] points for a GPX track record from the
 * state's `gpxGeometryByTrack` map.
 *
 * - Returns [] when the geometry is missing or still loading.
 * - Accepts either an array of points or `{ points: [...] }`.
 * - Silently drops points that fail `normalizePoint`.
 */
export function pointsForTrack(track, gpxGeometryByTrack) {
  const entry = gpxGeometryByTrack?.[track.id];
  if (!entry || entry === 'loading') return [];
  const raw = Array.isArray(entry) ? entry : entry.points;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePoint).filter(Boolean);
}

/**
 * Collect every GPX track that belongs to a completed trip, tagging
 * each track with its parent trip_id when the track record is missing
 * one.
 */
export function collectCompletedGpxTracks(state) {
  const completedTripIds = new Set(
    state.trips.filter((trip) => trip.status === 'completed').map((trip) => trip.id),
  );
  return Object.entries(state.gpxByTrip || {})
    .filter(([tripId, tracks]) => completedTripIds.has(tripId) && Array.isArray(tracks))
    .flatMap(([tripId, tracks]) =>
      tracks.map((track) => ({ ...track, trip_id: track.trip_id || tripId })),
    );
}

/**
 * Real GPX coverage across completed trips — HANDOFF.md: "show a caption
 * stating how many of the completed trips are actually plotted", computed
 * from real data, never a static string. A trip counts as "plotted" once
 * it has at least one uploaded GPX track record, regardless of whether
 * that track's geometry has finished parsing yet.
 */
export function completedTripGpxCoverage(state) {
  const completed = (state.trips || []).filter((trip) => trip.status === 'completed');
  const tripIdsWithGpx = new Set(
    Object.entries(state.gpxByTrip || {})
      .filter(([, tracks]) => Array.isArray(tracks) && tracks.length > 0)
      .map(([tripId]) => tripId),
  );
  const withGpx = completed.filter((trip) => tripIdsWithGpx.has(trip.id)).length;
  return { withGpx, total: completed.length };
}

/**
 * Compute a [minLat, maxLat, minLng, maxLng] bounding box for a flat
 * list of [lat, lng] points. Returns null when the list is empty.
 */
export function bbox(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const lats = points.map(([lat]) => lat);
  const lngs = points.map(([, lng]) => lng);
  return [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
}

/**
 * Project a list of [lat, lng] points into the SVG coordinate system
 * used by the local fallback map.
 *
 * Returns an SVG "points" string ("x,y x,y x,y …") suitable for a
 * <polyline points="…">. Inverts latitude so that north ends up at the
 * top of the viewBox.
 */
export function projectPointsToSvg(points, box, width, height, padding) {
  const [minLat, maxLat, minLng, maxLng] = box;
  const latSpan = Math.max(1e-6, maxLat - minLat);
  const lngSpan = Math.max(1e-6, maxLng - minLng);
  return points
    .map(([lat, lng]) => {
      const y = padding + ((maxLat - lat) / latSpan) * (height - 2 * padding);
      const x = padding + ((lng - minLng) / lngSpan) * (width - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Human-readable label for a GPX track record.
 *
 * Mirrors the legacy behaviour: strip directory prefix, fall back to
 * "GPX route" when neither file_path nor filename are usable.
 */
export function trackLabel(track) {
  return (
    String(track.file_path || track.filename || 'GPX route')
      .split('/')
      .pop() || 'GPX route'
  );
}

/**
 * Escape characters that would break out of HTML attribute / text
 * contexts. Used by the SVG fallback when injecting track labels.
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
  );
}

/**
 * Normalize an arbitrary thrown value into a human-readable message
 * suitable for showing in the fallback UI.
 */
export function errorMessage(err) {
  if (!err) return 'No drawable GPX geometry yet.';
  return err instanceof Error ? err.message : String(err);
}
