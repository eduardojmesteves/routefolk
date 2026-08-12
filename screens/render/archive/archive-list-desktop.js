// ============================================================
// routefolk — screens/render/archive/archive-list-desktop.js
// Desktop archive list / detail rendering (map is its own module).
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import {
  ARCHIVE_FILTERS,
  archiveTrips,
  fmtEuro,
  lifetime,
  season,
  stats,
  tripNo,
} from '../shared.js';

function hasGpx(tripId) {
  const tracks = STATE.gpxByTrip[tripId];
  return Array.isArray(tracks) && tracks.length > 0;
}

export function renderArchive({ hero, summaryTable, filters, search, stamp, loadingHtml }) {
  const selected = STATE.selectedArchiveTripId
    ? STATE.trips.find((t) => t.id === STATE.selectedArchiveTripId)
    : null;
  if (selected) {
    return `<main class="rf-desktop-main is-wide rf-clean-archive-detail">${hero(selected, { withStats: true, backAction: 'rf-desktop-back-to-archive' })}<div class="rf-desktop-section-title">Archive summary</div>${summaryTable(selected)}</main>`;
  }
  const rows = archiveTrips();
  const l = lifetime();
  return `<main class="rf-desktop-main is-archive"><div class="rf-desktop-kicker">The collection</div><h1 class="rf-desktop-hero-title">Archive</h1><div class="rf-desktop-hero-sub">${rows.filter((t) => t.status === 'completed').length} put to bed · ${rows.filter((t) => t.status === 'cancelled').length} called off</div><div class="rf-desktop-filter-row">${filters(ARCHIVE_FILTERS, STATE.archiveStatusFilter || 'all')}${search(STATE.archiveFiltersOpen || !!STATE.archiveSearch, STATE.archiveSearch)}</div>${STATE.archiveDataLoading ? loadingHtml('Loading archive totals…') : ''}<div class="rf-desktop-archive-totals"><h2>Lifetime totals</h2><div>Completed <strong>${l.completed}</strong></div><div>Distance <strong>${Math.round(l.distance).toLocaleString()}</strong></div><div>Spent <strong>${fmtEuro(l.spent)}</strong></div><div>Notes <strong>${l.entries}</strong></div></div><div class="rf-desktop-section-head"><div class="rf-desktop-section-title">The geography</div>${stamp('Heatmap')}</div><div class="rf-desktop-map-card"><div class="rf-archive-map" id="rf-archive-map"></div><div class="rf-archive-map-status" id="rf-archive-map-status">Loading archive geography…</div></div>${rows.map((trip) => `<button class="rf-desktop-archive-row" data-action="rf-desktop-select-archived" data-trip-id="${esc(trip.id)}" type="button"><span>${esc(tripNo(trip))}</span><strong>${esc(trip.title || 'Untitled trip')}</strong><small>${esc(season(trip))}${hasGpx(trip.id) ? stamp('GPX', 'accent') : ''}</small><b>${fmtEuro(stats(trip).spent)}</b></button>`).join('') || '<div class="rf-desktop-empty">No archived trips.</div>'}</main>`;
}
