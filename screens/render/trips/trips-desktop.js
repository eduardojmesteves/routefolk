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
  tripsHeroHtml,
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
  return `<button class="rf-desktop-trip-row ${selected === trip.id ? 'is-selected' : ''}" data-action="rf-desktop-select-trip" data-trip-id="${esc(trip.id)}" type="button"><div class="rf-desktop-trip-row-no">${esc(tripNo(trip))}</div><div class="rf-desktop-trip-row-title">${esc(trip.title || 'Untitled trip')}</div><div class="rf-desktop-trip-row-sub">${esc(subtitle(trip))}</div><div class="rf-desktop-trip-row-meta"><span>${esc(fmtDateRange(trip.start_date, trip.end_date))}</span><span>${Math.round(s.distance).toLocaleString()} km</span><span>${s.stages} st</span></div>${statePill(trip.status)}</button>`;
}

export function renderTripList(selected, { filters, search, statePill }) {
  return `<aside class="rf-desktop-trips-col"><div class="rf-desktop-trips-head"><div><div class="rf-desktop-kicker">The road map</div><h1 class="rf-desktop-col-title">Trips</h1><div class="rf-desktop-col-sub">${activeTrips().length} on the road map · ${archiveTrips().length} in archive</div></div><button class="rf-desktop-btn is-primary" data-action="rf-desktop-new-trip" type="button">+ New</button></div><div class="rf-desktop-filter-row">${filters(TRIP_FILTERS, STATE.tripStatusFilter || 'all')}${search(STATE.tripFiltersOpen || !!STATE.tripSearch, STATE.tripSearch)}</div>${tripsHeroHtml()}<div class="rf-desktop-master-list">${activeTrips().map((t) => renderTripRow(t, selected, statePill)).join('') || '<div class="rf-desktop-empty">No matching trips.</div>'}</div></aside>`;
}

export function renderLanding({ hero }) {
  const trip = activeTrips()[0];
  return `<main class="rf-desktop-main">${trip ? hero(trip, { withStats: true }) : '<div class="rf-desktop-empty-card">No trips yet.</div>'}<div class="rf-desktop-hint">Click a trip on the left to open it. The trip expands into stages and a detail pane.</div></main>`;
}
