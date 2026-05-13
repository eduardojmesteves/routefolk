// ============================================================
// routefolk — screens/trips-screen.js
// Trips list screen rendering and filtering helpers.
// ============================================================

import { STATE } from '../state/app-state.js';
import { STATUS_META, TRIPS_SCREEN_STATUSES } from '../constants/app-constants.js';
import { esc } from '../utils/dom.js';
import { signedOutState, errorCard } from '../components/feedback.js';
import { tripCardHtml } from '../components/trip-card.js';

function writeDisabledAttr() {
  return STATE.isOnline !== false ? '' : ' disabled';
}

function activeTripsBase() {
  return STATE.trips.filter((trip) => TRIPS_SCREEN_STATUSES.includes(trip.status));
}

function filteredTripsForTripsScreen() {
  const query = STATE.tripSearch.trim().toLowerCase();
  const statusFilter = TRIPS_SCREEN_STATUSES.includes(STATE.tripStatusFilter) ? STATE.tripStatusFilter : 'all';
  return activeTripsBase().filter((trip) => {
    const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
    const matchesSearch = !query || String(trip.title || '').toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });
}

function tripFiltersHtml() {
  const activeFilters = Number(Boolean(STATE.tripSearch.trim())) + Number(STATE.tripStatusFilter !== 'all');
  const toggleText = STATE.tripFiltersOpen ? 'Hide filters' : `Filters${activeFilters ? ` (${activeFilters})` : ''}`;

  return `
    <div class="trip-filter-toggle-row">
      <button class="btn btn-secondary btn-sm trip-filter-toggle" id="tripFiltersToggle" aria-expanded="${STATE.tripFiltersOpen ? 'true' : 'false'}">
        ${esc(toggleText)}
      </button>
    </div>
    <div class="trip-controls ${STATE.tripFiltersOpen ? 'open' : ''}" id="tripFiltersPanel">
      <div class="trip-search-wrap">
        <label class="form-label" for="tripSearchInput">Search trips</label>
        <input class="inp" id="tripSearchInput" type="search" value="${esc(STATE.tripSearch)}" placeholder="Search by trip title">
      </div>
      <div class="trip-status-wrap">
        <label class="form-label" for="tripStatusFilter">Status</label>
        <select class="sel" id="tripStatusFilter">
          <option value="all" ${STATE.tripStatusFilter === 'all' ? 'selected' : ''}>All active</option>
          ${TRIPS_SCREEN_STATUSES.map((key) => {
            const meta = STATUS_META[key];
            return `<option value="${esc(key)}" ${STATE.tripStatusFilter === key ? 'selected' : ''}>${esc(meta.label)}</option>`;
          }).join('')}
        </select>
      </div>
    </div>
  `;
}

export function tripResultsHtml() {
  const baseTrips = activeTripsBase();
  const trips = filteredTripsForTripsScreen();
  const hasFilters = STATE.tripSearch.trim() || STATE.tripStatusFilter !== 'all';

  if (!baseTrips.length) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 6h18M3 12h18M3 18h12"/>
        </svg>
        <div class="empty-title">No active trips</div>
        <div class="empty-sub">Planning and active trips appear here. Completed and cancelled trips live in the Archive.</div>
      </div>
    `;
  }

  if (!trips.length) {
    return `
      <div class="empty-state">
        <div class="empty-title">No matching trips</div>
        <div class="empty-sub">${hasFilters ? 'Adjust the search or active-trip status filter.' : 'No planning or active trips to show.'}</div>
      </div>
    `;
  }

  return `<div class="trip-list">${trips.map(tripCardHtml).join('')}</div>`;
}

export function renderTrips() {
  if (!STATE.user) return signedOutState('Sign in to see trips', 'Trips are shared with everyone signed in.');

  if (STATE.tripsLoading && !STATE.trips.length) {
    return `<div class="empty-state"><div class="empty-sub">Loading trips…</div></div>`;
  }

  if (STATE.tripsError) return errorCard(STATE.tripsError, 'retryTripsBtn');

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
      <div class="section-label" style="margin-bottom:0;">Trips</div>
      <button class="btn btn-primary btn-sm" id="newTripBtn"${writeDisabledAttr()}>+ New trip</button>
    </div>
    ${tripFiltersHtml()}
    <div id="tripResults">${tripResultsHtml()}</div>
  `;
}
