// ============================================================
// routefolk — components/trip-card.js
// Shared trip-card and visibility-pill rendering helpers.
// Phase 3: adds reusable Ink & Rust card/pill classes.
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

export function tripCardHtml(trip) {
  const meta = STATUS_META[trip.status] || STATUS_META.planning;
  const routeLabel = trip.description || fmtDateRange(trip.start_date, trip.end_date);
  return `
    <button class="trip-card rf-card rf-trip-card" type="button" data-trip-id="${esc(trip.id)}" aria-label="Open ${esc(trip.title)}">
      <div class="trip-card-head">
        <div>
          <div class="trip-title">${esc(trip.title)}</div>
          <div class="trip-dates">${esc(fmtDateRange(trip.start_date, trip.end_date))}</div>
        </div>
        <div class="trip-card-pills">
          <span class="status-pill rf-pill ${meta.cls}">${esc(meta.label)}</span>
          ${visibilityPillHtml(trip)}
        </div>
      </div>
      ${routeLabel ? `<div class="trip-desc">${esc(routeLabel)}</div>` : ''}
      <div class="rf-trip-card-mark" aria-hidden="true"></div>
    </button>
  `;
}
