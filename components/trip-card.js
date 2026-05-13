// ============================================================
// routefolk — components/trip-card.js
// Shared trip-card and visibility-pill rendering helpers.
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
  return `<span class="visibility-pill ${meta.cls}">${esc(meta.label)}</span>`;
}

export function tripCardHtml(trip) {
  const meta = STATUS_META[trip.status] || STATUS_META.planning;
  return `
    <button class="trip-card" data-trip-id="${esc(trip.id)}">
      <div class="trip-card-head">
        <div class="trip-title">${esc(trip.title)}</div>
        <div class="trip-card-pills">
          <span class="status-pill ${meta.cls}">${esc(meta.label)}</span>
          ${visibilityPillHtml(trip)}
        </div>
      </div>
      <div class="trip-dates">${esc(fmtDateRange(trip.start_date, trip.end_date))}</div>
      ${trip.description ? `<div class="trip-desc">${esc(trip.description)}</div>` : ''}
    </button>
  `;
}
