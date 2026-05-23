// ============================================================
// routefolk — screens/render/trips/trips-desktop.js
// Desktop trips master-list column rendering.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import { fmtDateRange } from '../../../utils/datetime.js';
import {
  archiveTrips,
  stats,
  subtitle,
  tripNo,
} from '../shared.js';

const TRIP_FILTERS = [['all', 'All'], ['planning', 'Planning'], ['active', 'Active']];

export function activeTrips() {
  const q = (STATE.tripSearch || '').trim().toLowerCase();
  const f = STATE.tripStatusFilter || 'all';
  return STATE.trips
    .filter((t) => ['planning', 'active'].includes(t.status))
    .filter((t) => (f === 'all' || t.status === f) && (!q || `${t.title || ''} ${t.description || ''}`.toLowerCase().includes(q)));
}

function renderTripRow(trip, selected, statePill) {
  const s = stats(trip);
  return `<button class="rf-d2-trip-row ${selected === trip.id ? 'is-selected' : ''}" data-action="rf-d2-select-trip" data-trip-id="${esc(trip.id)}" type="button"><div class="rf-d2-trip-row-no">${esc(tripNo(trip))}</div><div class="rf-d2-trip-row-title">${esc(trip.title || 'Untitled trip')}</div><div class="rf-d2-trip-row-sub">${esc(subtitle(trip))}</div><div class="rf-d2-trip-row-meta"><span>${esc(fmtDateRange(trip.start_date, trip.end_date))}</span><span>${Math.round(s.distance).toLocaleString()} km</span><span>${s.stages} st</span></div>${statePill(trip.status)}</button>`;
}

export function renderTripList(selected, { filters, search, statePill }) {
  return `<aside class="rf-d2-trips-col"><div class="rf-d2-trips-head"><div><div class="rf-d2-kicker">The road map</div><h1 class="rf-d2-col-title">Trips</h1><div class="rf-d2-col-sub">${activeTrips().length} on the road map · ${archiveTrips().length} in archive</div></div><button class="rf-d2-btn is-primary" data-action="rf-d2-new-trip" type="button">+ New</button></div><div class="rf-d2-filter-row">${filters(TRIP_FILTERS, STATE.tripStatusFilter || 'all')}${search(STATE.tripFiltersOpen || !!STATE.tripSearch, STATE.tripSearch)}</div><div class="rf-d2-master-list">${activeTrips().map((t) => renderTripRow(t, selected, statePill)).join('') || '<div class="rf-d2-empty">No matching trips.</div>'}</div></aside>`;
}

export function renderLanding({ hero }) {
  const trip = activeTrips()[0];
  return `<main class="rf-d2-main">${trip ? hero(trip, { withStats: true }) : '<div class="rf-d2-empty-card">No trips yet.</div>'}<div class="rf-d2-hint">Click a trip on the left to open it. The trip expands into stages and a detail pane.</div></main>`;
}
