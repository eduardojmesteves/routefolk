// ============================================================
// routefolk — components/trip-card.js
// Shared trip-card and visibility-pill rendering helpers.
// Claude Design UI reset.
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

export function tripCardHtml(trip, index = null, options = {}) {
  const meta = STATUS_META[trip.status] || STATUS_META.planning;
  const dates = fmtDateRange(trip.start_date, trip.end_date);
  const routeLabel = trip.description || dates;
  const indexLabel = tripIndexLabel(index);
  const compact = options.compact ? ' is-compact' : '';

  return `
    <button class="rf-tripCard trip-card${compact}" type="button" data-trip-id="${esc(trip.id)}" aria-label="Open ${esc(trip.title)}">
      <div class="rf-tripCard__index" aria-hidden="true">No. ${esc(indexLabel)}</div>
      <div class="rf-tripCard__body">
        <div class="rf-tripCard__title trip-title">${esc(trip.title)}</div>
        ${routeLabel ? `<div class="rf-tripCard__sub">${esc(routeLabel)}</div>` : ''}
        <div class="rf-tripCard__meta">${esc(dates)}</div>
        <div class="rf-tripCard__pills">
          <span class="status-pill rf-pill ${meta.cls}">${esc(meta.label)}</span>
          ${visibilityPillHtml(trip)}
        </div>
        <div class="rf-trip-route-sketch" aria-hidden="true"><span></span><i></i><span></span></div>
      </div>
    </button>
  `;
}
