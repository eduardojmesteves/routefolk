// ============================================================
// routefolk — screens/trips-screen.js
// Trips list screen rendering and filtering helpers.
// Phase 4: Almanac × Topographic Trips screen.
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

function tripsScreenStatsHtml() {
  const activeTrips = activeTripsBase();
  const planning = activeTrips.filter((trip) => trip.status === 'planning').length;
  const active = activeTrips.filter((trip) => trip.status === 'active').length;
  const archived = STATE.trips.filter((trip) => trip.status === 'completed' || trip.status === 'cancelled').length;

  return `
    <div class="rf-trips-ledger-stats" aria-label="Trip counts">
      <div>
        <span>${esc(activeTrips.length)}</span>
        <small>active file${activeTrips.length === 1 ? '' : 's'}</small>
      </div>
      <div>
        <span>${esc(planning)}</span>
        <small>planning</small>
      </div>
      <div>
        <span>${esc(active)}</span>
        <small>on road</small>
      </div>
      <div>
        <span>${esc(archived)}</span>
        <small>archive</small>
      </div>
    </div>
  `;
}

function tripFiltersHtml() {
  const activeFilters = Number(Boolean(STATE.tripSearch.trim())) + Number(STATE.tripStatusFilter !== 'all');
  const toggleText = STATE.tripFiltersOpen ? 'Hide filters' : `Filters${activeFilters ? ` (${activeFilters})` : ''}`;

  return `
    <div class="rf-trip-filter-shell">
      <div class="trip-filter-toggle-row rf-trip-filter-toggle-row">
        <button class="btn btn-secondary btn-sm trip-filter-toggle rf-filter-toggle" id="tripFiltersToggle" aria-expanded="${STATE.tripFiltersOpen ? 'true' : 'false'}" aria-controls="tripFiltersPanel">
          ${esc(toggleText)}
        </button>
        <div class="rf-filter-summary">Search the active field index</div>
      </div>
      <div class="trip-controls rf-trip-controls ${STATE.tripFiltersOpen ? 'open' : ''}" id="tripFiltersPanel">
        <div class="trip-search-wrap rf-trip-search-wrap">
          <label class="form-label" for="tripSearchInput">Search trips</label>
          <input class="inp rf-field" id="tripSearchInput" type="search" value="${esc(STATE.tripSearch)}" placeholder="Search by trip title">
        </div>
        <div class="trip-status-wrap rf-trip-status-wrap">
          <label class="form-label" for="tripStatusFilter">Status</label>
          <select class="sel rf-field" id="tripStatusFilter">
            <option value="all" ${STATE.tripStatusFilter === 'all' ? 'selected' : ''}>All active</option>
            ${TRIPS_SCREEN_STATUSES.map((key) => {
              const meta = STATUS_META[key];
              return `<option value="${esc(key)}" ${STATE.tripStatusFilter === key ? 'selected' : ''}>${esc(meta.label)}</option>`;
            }).join('')}
          </select>
        </div>
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
      <div class="empty-state rf-empty-state rf-trips-empty">
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
      <div class="empty-state rf-empty-state rf-trips-empty">
        <div class="empty-title">No matching trips</div>
        <div class="empty-sub">${hasFilters ? 'Adjust the search or active-trip status filter.' : 'No planning or active trips to show.'}</div>
      </div>
    `;
  }

  return `<div class="trip-list rf-trip-list">${trips.map((trip, index) => tripCardHtml(trip, index)).join('')}</div>`;
}

export function renderTrips() {
  if (!STATE.user) return signedOutState('Sign in to see trips', 'Trips are shared with everyone signed in.');

  if (STATE.tripsLoading && !STATE.trips.length) {
    return `<div class="empty-state rf-empty-state"><div class="empty-sub">Loading trips…</div></div>`;
  }

  if (STATE.tripsError) return errorCard(STATE.tripsError, 'retryTripsBtn');

  return `
    <section class="rf-trips-hero rf-card">
      <div>
        <div class="rf-kicker">Routefolk field index</div>
        <h1 class="rf-page-title">Trips</h1>
        <p class="rf-page-subtitle">Plan active routes, keep road notes, and send completed journeys to the archive.</p>
      </div>
      <button class="btn btn-primary btn-sm rf-new-trip-btn" id="newTripBtn"${writeDisabledAttr()}>+ New trip</button>
    </section>

    ${tripsScreenStatsHtml()}
    ${tripFiltersHtml()}
    <div id="tripResults" class="rf-trip-results">${tripResultsHtml()}</div>
  `;
}
