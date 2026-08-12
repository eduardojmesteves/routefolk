// ============================================================
// routefolk — screens/render/trip-detail/gpx-panel.js
// Pure HTML generator for the GPX tracks section inside the
// selected stage detail pane. Called by both the desktop and
// mobile renderers so the panel is part of the initial render,
// not appended by a post-render sidecar.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import { fmtKm } from '../../../utils/format.js';
import { trackFileName } from '../../../lib/gpx.js';

/**
 * Return an HTML string for the GPX tracks section.
 *
 * @param {{ id: string }} trip  - active trip (needs .id)
 * @param {{ id: string }} stage - selected stage (needs .id)
 * @param {Array}          tracks - tracks already filtered to this stage
 * @returns {string}
 */
export function gpxPanelHtml(trip, stage, tracks) {
  const raw = STATE.gpxByTrip[trip.id];

  if (raw === 'loading' || STATE.gpxLoading) {
    return `
      <div class="rf-desktop-section-head">
        <div class="rf-desktop-section-title">GPX tracks</div>
      </div>
      <div class="rf-gpx-card">Loading GPX tracks…</div>`;
  }

  const error = STATE.gpxError
    ? `<div class="rf-gpx-error">${esc(STATE.gpxError)}</div>`
    : '';
  const trackRows = tracks.length
    ? tracks.map(trackRowHtml).join('')
    : '<div class="rf-gpx-empty">No GPX track attached to this stage yet.</div>';

  return `
    <div class="rf-desktop-section-head">
      <div class="rf-desktop-section-title">GPX tracks</div>
    </div>
    <div class="rf-gpx-card">
      ${error}
      ${trackRows}
      <button class="rf-gpx-upload"
              data-action="rf-open-gpx-upload"
              data-trip-id="${esc(trip.id)}"
              data-stage-id="${esc(stage.id)}"
              type="button">
        <span>Upload GPX</span>
      </button>
      <div class="rf-gpx-help">Use GPX exports from your navigation/tracking app. These files will power the archive geography.</div>
    </div>`;
}

function trackRowHtml(track) {
  const distance = Number.isFinite(Number(track.distance_km))
    ? fmtKm(Number(track.distance_km))
    : '—';
  const points = Number.isFinite(Number(track.point_count))
    ? `${Number(track.point_count).toLocaleString()} pts`
    : '—';
  return `
    <div class="rf-gpx-row">
      <div>
        <strong>${esc(trackFileName(track))}</strong>
        <small>${esc(distance)} · ${esc(points)}</small>
      </div>
      <button class="rf-desktop-btn is-danger"
              data-action="rf-delete-gpx"
              data-track-id="${esc(track.id)}"
              type="button">Delete</button>
    </div>`;
}
