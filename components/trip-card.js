// ============================================================
// routefolk — components/trip-card.js
// Shared trip-card and visibility-pill rendering helpers.
// Phase 20: aligns No. index ribbon with D · Ink mock.
// ============================================================

import { STATUS_META, VISIBILITY_META } from '../constants/app-constants.js';
import { esc } from '../utils/dom.js';
import { fmtDateRange } from '../utils/datetime.js';

export function tripVisibility(trip) {
  return trip?.visibility === 'private' ? 'private' : 'group';
}

export function visibilityPillHtml(trip) {
  const key = tripVisibility(trip);
  const meta = VISIBILITY_META[key];
  return `<span class="visibility-pill rf-pill ${meta.cls}">${esc(meta.label)}</span>`;
}

function tripIndexLabel(index) {
  return Number.isInteger(index) ? String(index + 1).padStart(2, '0') : 'RF';
}

export function tripCardHtml(trip, index = null) {
  const meta = STATUS_META[trip.status] || STATUS_META.planning;
  const dates = fmtDateRange(trip.start_date, trip.end_date);
  const routeLabel = trip.description || dates;
  const indexLabel = tripIndexLabel(index);

  return `
    <button class="trip-card rf-card rf-trip-card rf-almanac-trip-card" type="button" data-trip-id="${esc(trip.id)}" aria-label="Open ${esc(trip.title)}">
      <div class="rf-trip-card-index rf-trip-card-index--ribbon" aria-hidden="true">
        No. ${esc(indexLabel)}
      </div>

      <div class="trip-card-head rf-trip-card-head">
        <div class="rf-trip-card-title-block">
          <div class="trip-title rf-trip-card-title">${esc(trip.title)}</div>
          <div class="trip-dates rf-trip-card-dates">${esc(dates)}</div>
        </div>
        <div class="trip-card-pills rf-trip-card-pills">
          <span class="status-pill rf-pill ${meta.cls}">${esc(meta.label)}</span>
          ${visibilityPillHtml(trip)}
        </div>
      </div>

      ${routeLabel ? `<div class="trip-desc rf-trip-card-route">${esc(routeLabel)}</div>` : ''}

      <div class="rf-trip-route-sketch" aria-hidden="true">
        <span></span>
        <i></i>
        <span></span>
      </div>
    </button>
  `;
}
