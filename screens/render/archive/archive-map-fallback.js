// ============================================================
// routefolk — local SVG fallback for the archive map
//
// Renders the same set of completed GPX tracks as the Leaflet
// renderer, but as a single inline <svg> over a grid pattern. Used
// when Leaflet (or the OpenStreetMap tile server) can't be reached.
//
// Returns a result describing what was rendered so the controller can
// pick the right status line — this module never touches the status
// element itself.
// ============================================================

import {
  bbox,
  collectCompletedGpxTracks,
  errorMessage,
  pointsForTrack,
  projectPointsToSvg,
  trackLabel,
} from './archive-map-geometry.js';
import { esc } from '../../../utils/dom.js';

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 360;
const PADDING = 36;

/**
 * Render the SVG fallback into `container`.
 *
 * Returns one of:
 *   { kind: 'empty', message }   — nothing drawable; container shows
 *                                  an "unavailable" placeholder
 *   { kind: 'drawn', count }     — `count` tracks rendered as polylines
 */
export function renderSvgFallback(container, state, err) {
  const tracks = collectCompletedGpxTracks(state)
    .map((track) => ({ track, points: pointsForTrack(track, state.gpxGeometryByTrack) }))
    .filter((entry) => entry.points.length >= 2);

  if (!tracks.length) {
    const message = errorMessage(err);
    container.innerHTML = `<div class="rf-v2-map-fallback"><div><strong>Map unavailable</strong><span>${esc(message)}</span></div></div>`;
    return { kind: 'empty', message };
  }

  const flatPoints = tracks.flatMap((entry) => entry.points);
  const box = bbox(flatPoints);

  const routesMarkup = tracks
    .map((entry, index) => {
      const polyline = projectPointsToSvg(entry.points, box, VIEW_WIDTH, VIEW_HEIGHT, PADDING);
      const startPoint = entry.points[0];
      const endPoint = entry.points[entry.points.length - 1];
      const startCoord = projectPointsToSvg([startPoint], box, VIEW_WIDTH, VIEW_HEIGHT, PADDING);
      const endCoord = projectPointsToSvg([endPoint], box, VIEW_WIDTH, VIEW_HEIGHT, PADDING);
      const [startX, startY] = startCoord.split(',');
      const [endX, endY] = endCoord.split(',');
      const startCircle =
        index === 0 ? `<circle class="rf-v2-map-start" cx="${startX}" cy="${startY}" r="6"/>` : '';
      return `<polyline class="rf-v2-map-route" points="${polyline}"><title>${esc(trackLabel(entry.track))}</title></polyline>${startCircle}<circle class="rf-v2-map-end" cx="${endX}" cy="${endY}" r="6"/>`;
    })
    .join('');

  container.innerHTML = `<svg class="rf-v2-map-svg" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" role="img" aria-label="Archive GPX route map fallback"><defs><pattern id="rf-map-grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M 80 0 L 0 0 0 80" fill="none" stroke="currentColor" stroke-opacity="0.08" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#rf-map-grid)"/>${routesMarkup}</svg>`;

  return { kind: 'drawn', count: tracks.length };
}
