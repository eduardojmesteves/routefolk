// ============================================================
// routefolk — screens/render/trips/trips-mobile.js
// Mobile trips list rendering.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import { fmtDate } from '../../../utils/datetime.js';
import {
  season,
  stages,
  stats,
  subtitle,
  tripNo,
  tripsHeroHtml,
} from '../shared.js';

const TRIP_FILTERS = [['all', 'All'], ['planning', 'Planning'], ['active', 'Active']];

function activeTrips() {
  const query = (STATE.tripSearch || '').trim().toLowerCase();
  const filter = STATE.tripStatusFilter || 'all';
  return STATE.trips
    .filter((trip) => ['planning', 'active'].includes(trip.status))
    .filter((trip) => (filter === 'all' || trip.status === filter) && (!query || `${trip.title || ''} ${trip.description || ''}`.toLowerCase().includes(query)));
}

function statusLabel(status) {
  if (status === 'active') return 'In progress';
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return 'Planning';
}

function statusClass(status) {
  return status === 'active' ? 'is-active' : status === 'completed' ? 'is-completed' : status === 'cancelled' ? 'is-cancelled' : 'is-planning';
}

function tripDateRange(trip) {
  const start = fmtDate(trip.start_date);
  const end = fmtDate(trip.end_date);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || season(trip);
}

function stageProgress(trip) {
  const st = stages(trip.id);
  const total = st.length || stats(trip).stages || 0;
  if (!total || trip.status !== 'active') return '';
  const index = Math.max(1, st.findIndex((stage) => stage.id === STATE.selectedStageId) + 1 || 1);
  return `<span class="rf-trip-day">Day ${index} / ${total}</span>`;
}

function tripTicket(trip) {
  const s = stats(trip);
  return `<article class="rf-clean-trip-card"><button class="rf-clean-trip-card-tap" data-action="rf-mobile-select-trip" data-trip-id="${esc(trip.id)}"><div class="rf-trip-card-top"><div><strong class="rf-trip-card-title">${esc(trip.title || 'Untitled trip')}</strong><span class="rf-trip-card-subtitle">${esc(subtitle(trip))}</span></div><em>${esc(tripNo(trip))}</em></div><div class="rf-trip-card-date">${esc(tripDateRange(trip))}</div><div class="rf-trip-card-rule"></div><div class="rf-trip-card-bottom"><div class="rf-trip-card-metrics"><span><b>${Math.round(s.distance).toLocaleString()}</b><small>Kilometres</small></span><span><b>${s.stages}</b><small>Stages</small></span></div><div class="rf-trip-card-side"><span class="rf-trip-status ${statusClass(trip.status)}">• ${esc(statusLabel(trip.status))}</span>${stageProgress(trip)}</div></div></button><div class="rf-clean-trip-card-footer"><button data-action="rf-mobile-list-edit-trip" data-source="trips" data-trip-id="${esc(trip.id)}">Edit</button><button data-action="rf-mobile-list-delete-trip" data-source="trips" data-trip-id="${esc(trip.id)}">Delete</button></div></article>`;
}

// Route Atlas mobile mockup: "+ New trip" is a floating action button
// anchored above the pill nav, not a header button — the header button
// pattern only appears in the mockup's desktop frame. See HANDOFF.md /
// the design handoff's "Trips list" mobile frame.
const NEW_TRIP_FAB = '<button class="rf-clean-fab-new-trip" data-action="rf-mobile-new-trip">+ New trip</button>';

export function renderMobileTrips(screen) {
  const rows = activeTrips();
  const activeCount = STATE.trips.filter((trip) => trip.status === 'active').length;
  const completedCount = STATE.trips.filter((trip) => trip.status === 'completed').length;
  if (STATE.tripsLoading && !STATE.trips.length) {
    return screen('<main class="rf-clean-page"><div class="rf-clean-empty">Loading trips…</div></main>', 'trips', NEW_TRIP_FAB);
  }
  if (STATE.tripsError) {
    return screen(`<main class="rf-clean-page"><div class="rf-clean-empty">${esc(STATE.tripsError)}</div></main>`, 'trips', NEW_TRIP_FAB);
  }
  return screen(`<header class="rf-clean-trips-hero"><div><div class="rf-clean-kicker">ROUTEFOLK</div><h1>Trips</h1><p>${activeCount} on the road map · ${completedCount} in archive</p></div></header><main class="rf-clean-page"><div class="rf-clean-toolbar"><div>${TRIP_FILTERS.map(([key, label]) => `<button class="${(STATE.tripStatusFilter || 'all') === key ? 'is-active' : ''}" data-action="rf-mobile-status-filter" data-value="${key}">${label}</button>`).join('')}</div>${STATE.tripFiltersOpen || STATE.tripSearch ? `<input data-action="rf-mobile-search-input" value="${esc(STATE.tripSearch || '')}" placeholder="Search by name" aria-label="Search trips"><button data-action="rf-mobile-search-toggle" aria-label="Close search">×</button>` : `<button class="rf-clean-search" data-action="rf-mobile-search-toggle" aria-label="Search trips">⌕</button>`}</div>${tripsHeroHtml()}<div class="rf-clean-card-list rf-clean-trip-list">${rows.map(tripTicket).join('') || '<div class="rf-clean-empty">No matching trips.</div>'}</div></main>`, 'trips', NEW_TRIP_FAB);
}

export { statusLabel, statusClass };
