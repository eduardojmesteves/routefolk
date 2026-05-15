// ============================================================
// routefolk — screens/trips-screen.js
// Trips list screen rendering and filtering helpers.
// Claude Design UI reset.
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

export function filteredTripsForTripsScreen() {
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
    <div class="rf-stats__grid" aria-label="Trip counts">
      <div class="rf-stat"><div class="rf-stat__v">${esc(activeTrips.length)}</div><div class="rf-stat__l">Active files</div></div>
      <div class="rf-stat"><div class="rf-stat__v">${esc(planning)}</div><div class="rf-stat__l">Planning</div></div>
      <div class="rf-stat"><div class="rf-stat__v">${esc(active)}</div><div class="rf-stat__l">On road</div></div>
      <div class="rf-stat"><div class="rf-stat__v">${esc(archived)}</div><div class="rf-stat__l">Archive</div></div>
    </div>
  `;
}

export function tripFiltersHtml() {
  const chips = [
    { key: 'all', label: 'All active' },
    ...TRIPS_SCREEN_STATUSES.map((key) => ({ key, label: STATUS_META[key]?.label || key })),
  ];
  const hasQuery = Boolean(STATE.tripSearch.trim());
  const label = hasQuery ? `Search: ${STATE.tripSearch.trim()}` : 'Search';

  return `
    <div class="rf-trip-filters">
      <div class="rf-filter-row">
        <button class="rf-search-pill ${hasQuery ? 'is-open' : ''}" id="searchPillBtn" data-search-pill="trips" type="button" aria-expanded="${hasQuery ? 'true' : 'false'}">
          <span class="rf-search-pill__icon">⌕</span>
          <span class="rf-search-pill__label">${esc(label)}</span>
        </button>
        <div class="rf-chips" role="group" aria-label="Trip status filter">
          ${chips.map((chip) => `
            <button class="rf-chip ${STATE.tripStatusFilter === chip.key ? 'is-active' : ''}" data-status-chip="${esc(chip.key)}" type="button">
              ${esc(chip.label)}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="rf-search-drawer" id="searchDrawer" ${hasQuery ? '' : 'hidden'}>
        <input class="rf-search-input" id="tripSearchInput" type="search" placeholder="Search by name" value="${esc(STATE.tripSearch)}">
      </div>
    </div>
  `;
}

export function tripResultsHtml(options = {}) {
  const baseTrips = activeTripsBase();
  const trips = filteredTripsForTripsScreen();
  const hasFilters = STATE.tripSearch.trim() || STATE.tripStatusFilter !== 'all';

  if (!baseTrips.length) {
    return `
      <div class="empty-state rf-empty-state">
        <div class="empty-title">No active trips</div>
        <div class="empty-sub">Planning and active trips appear here. Completed and cancelled trips live in the Archive.</div>
      </div>
    `;
  }

  if (!trips.length) {
    return `
      <div class="empty-state rf-empty-state">
        <div class="empty-title">No matching trips</div>
        <div class="empty-sub">${hasFilters ? 'Adjust the search or active-trip status filter.' : 'No planning or active trips to show.'}</div>
      </div>
    `;
  }

  return `<div class="rf-tripList rf-trip-list trip-list">${trips.map((trip, index) => tripCardHtml(trip, index, options)).join('')}</div>`;
}

export function renderTripsPane() {
  if (!STATE.user) return '';
  return `
    <section class="rf-pane">
      <div class="rf-header">
        <div class="rf-header__kicker">Routefolk</div>
        <h2 class="rf-title">Trips</h2>
        <p class="rf-sub">${activeTripsBase().length} on the road map · ${STATE.trips.filter((t) => t.status === 'completed' || t.status === 'cancelled').length} in archive</p>
      </div>
      ${tripFiltersHtml()}
      <div id="tripResults" class="rf-trip-results">${tripResultsHtml({ compact: true })}</div>
    </section>
  `;
}

export function renderTrips() {
  if (!STATE.user) return signedOutState('Sign in to see trips', 'Trips are shared with everyone signed in.');

  if (STATE.tripsLoading && !STATE.trips.length) {
    return `<div class="empty-state rf-empty-state"><div class="empty-sub">Loading trips…</div></div>`;
  }

  if (STATE.tripsError) return errorCard(STATE.tripsError, 'retryTripsBtn');

  return `
    <section class="rf-trips-layout">
      <div class="rf-header">
        <div class="rf-header__kicker">Routefolk</div>
        <h1 class="rf-page-title">Trips</h1>
        <p class="rf-page-subtitle">Plan active routes, keep road notes, and send completed journeys to the archive.</p>
        <button class="btn btn-primary btn-sm rf-new-trip-btn" id="newTripBtn"${writeDisabledAttr()}>+ New trip</button>
      </div>
      ${tripsScreenStatsHtml()}
      ${tripFiltersHtml()}
      <div id="tripResults" class="rf-trip-results">${tripResultsHtml()}</div>
    </section>
  `;
}
