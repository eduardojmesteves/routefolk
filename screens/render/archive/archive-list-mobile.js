// ============================================================
// routefolk — screens/render/archive/archive-list-mobile.js
// Mobile archive list rendering (map is its own module).
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import {
  ARCHIVE_FILTERS,
  archiveTrips,
  fmtEuro,
  lifetime,
  metricGrid,
  season,
  stats,
  tripNo,
} from '../shared.js';

function hasGpx(tripId) {
  const tracks = STATE.gpxByTrip[tripId];
  return Array.isArray(tracks) && tracks.length > 0;
}

function archiveTicket(trip) {
  const gpxTag = hasGpx(trip.id) ? '<span class="rf-mobile-stamp is-accent">GPX</span>' : '';
  return `<article class="rf-clean-archive-card"><button class="rf-clean-archive-row" data-action="rf-mobile-select-archived" data-trip-id="${esc(trip.id)}"><div><small>${esc(tripNo(trip))}</small><strong>${esc(trip.title || 'Untitled')}</strong><span>${esc(season(trip))}${gpxTag}</span></div><b>${fmtEuro(stats(trip).spent)}</b></button><div class="rf-clean-trip-card-footer"><button data-action="rf-mobile-list-edit-trip" data-source="archive" data-trip-id="${esc(trip.id)}">Edit</button><button data-action="rf-mobile-list-delete-trip" data-source="archive" data-trip-id="${esc(trip.id)}">Delete</button></div></article>`;
}

export function renderMobileArchive(screen) {
  const rows = archiveTrips();
  const l = lifetime();
  return screen(`<header class="rf-clean-trip-head"><div class="rf-clean-kicker">The collection</div><h1>Archive</h1><p>${rows.filter((trip) => trip.status === 'completed').length} put to bed · ${rows.filter((trip) => trip.status === 'cancelled').length} called off</p></header><main class="rf-clean-page"><div class="rf-clean-toolbar"><div>${ARCHIVE_FILTERS.map(([key, label]) => `<button class="${(STATE.archiveStatusFilter || 'all') === key ? 'is-active' : ''}" data-action="rf-mobile-status-filter" data-value="${key}">${label}</button>`).join('')}</div>${STATE.archiveFiltersOpen || STATE.archiveSearch ? `<input data-action="rf-mobile-search-input" value="${esc(STATE.archiveSearch || '')}" placeholder="Search by name" aria-label="Search archived trips"><button data-action="rf-mobile-search-toggle" aria-label="Close search">×</button>` : `<button class="rf-clean-search" data-action="rf-mobile-search-toggle" aria-label="Search archived trips">⌕</button>`}</div><h2>Lifetime totals</h2>${metricGrid([['Completed', String(l.completed), 'trips'], ['Distance', Math.round(l.distance).toLocaleString(), 'km'], ['Spent', fmtEuro(l.spent), 'total'], ['Notes', String(l.entries), 'journal']])}<div class="rf-clean-section-head"><h2>The geography</h2><span>Heatmap</span></div><div class="rf-mobile-map-card rf-clean-map"><div class="rf-archive-map" id="rf-archive-map"></div><div class="rf-archive-map-status" id="rf-archive-map-status">Loading archive geography…</div></div>${rows.map(archiveTicket).join('') || '<div class="rf-clean-empty">No archived trips.</div>'}</main>`, 'archive');
}
