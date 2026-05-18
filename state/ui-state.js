// ============================================================
// routefolk — ui-state.js
// Small, explicit persistence for view/navigation context.
// Keeps the app stable across tab switches, reloads, and auth refreshes.
// ============================================================

import { STATE } from './app-state.js';

const VERSION = 2;
const PREFIX = 'rf.ui.';
const TRIP_VIEWS = new Set(['detail', 'summary', 'costs', 'packing', 'journal']);

function userKey(user = STATE.user) {
  const id = user?.id || user?.email || 'anonymous';
  return `${PREFIX}${id}`;
}

function normalTripView(value, fallback = 'detail') {
  return TRIP_VIEWS.has(value) ? value : fallback;
}

function serialise() {
  return {
    version: VERSION,
    tab: STATE.tab || 'trips',
    view: STATE.view || 'list',
    viewTripId: STATE.viewTripId || null,
    selectedTripId: STATE.selectedTripId || null,
    selectedArchiveTripId: STATE.selectedArchiveTripId || null,
    selectedStageId: STATE.selectedStageId || null,
    selectedCategoryKey: STATE.selectedCategoryKey || null,
    lastTripView: normalTripView(STATE.lastTripView, 'detail'),
    lastArchiveView: STATE.lastArchiveView === 'summary' ? 'summary' : 'list',
    itemStatusFilter: STATE.itemStatusFilter || 'all',
    tripSearch: STATE.tripSearch || '',
    tripStatusFilter: STATE.tripStatusFilter || 'all',
    tripFiltersOpen: Boolean(STATE.tripFiltersOpen),
    archiveSearch: STATE.archiveSearch || '',
    archiveStatusFilter: STATE.archiveStatusFilter || 'all',
    archiveFiltersOpen: Boolean(STATE.archiveFiltersOpen),
    archiveViewMode: STATE.archiveViewMode || 'list',
    archiveMapLayer: STATE.archiveMapLayer || 'heatmap',
    timestamp: Date.now(),
  };
}

function isUsable(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.version !== VERSION) return false;
  const age = Date.now() - Number(payload.timestamp || 0);
  return age >= 0 && age < 1000 * 60 * 60 * 24 * 14;
}

export function saveUiState(user = STATE.user) {
  if (!user) return;
  try { localStorage.setItem(userKey(user), JSON.stringify(serialise())); } catch {}
}

export function restoreUiState(user = STATE.user) {
  if (!user) return false;
  try {
    const raw = localStorage.getItem(userKey(user));
    if (!raw) return false;
    const payload = JSON.parse(raw);
    if (!isUsable(payload)) return false;

    STATE.tab = payload.tab || 'trips';
    STATE.view = payload.view || 'list';
    STATE.viewTripId = payload.viewTripId || null;
    STATE.selectedTripId = payload.selectedTripId || (STATE.tab === 'trips' ? payload.viewTripId : null) || null;
    STATE.selectedArchiveTripId = payload.selectedArchiveTripId || (STATE.tab === 'archive' ? payload.viewTripId : null) || null;
    STATE.selectedStageId = payload.selectedStageId || null;
    STATE.selectedCategoryKey = payload.selectedCategoryKey || null;
    STATE.lastTripView = normalTripView(payload.lastTripView || (STATE.tab === 'trips' ? payload.view : null), 'detail');
    STATE.lastArchiveView = payload.lastArchiveView === 'summary' || STATE.tab === 'archive' && payload.view === 'summary' ? 'summary' : 'list';
    STATE.itemStatusFilter = payload.itemStatusFilter || 'all';
    STATE.tripSearch = payload.tripSearch || '';
    STATE.tripStatusFilter = payload.tripStatusFilter || 'all';
    STATE.tripFiltersOpen = Boolean(payload.tripFiltersOpen || payload.tripSearch);
    STATE.archiveSearch = payload.archiveSearch || '';
    STATE.archiveStatusFilter = payload.archiveStatusFilter || 'all';
    STATE.archiveFiltersOpen = Boolean(payload.archiveFiltersOpen || payload.archiveSearch);
    STATE.archiveViewMode = payload.archiveViewMode || 'list';
    STATE.archiveMapLayer = payload.archiveMapLayer || 'heatmap';
    STATE.wizard = null;
    STATE.editTargetId = null;
    return true;
  } catch { return false; }
}

export function clearUiState(user = STATE.user) {
  if (!user) return;
  try { localStorage.removeItem(userKey(user)); } catch {}
}

export function rememberTripContext(tripId, view = STATE.view || 'detail') {
  if (!tripId) return;
  STATE.selectedTripId = tripId;
  STATE.viewTripId = tripId;
  STATE.view = normalTripView(view, 'detail');
  STATE.lastTripView = STATE.view;
}

export function rememberArchiveContext(tripId = null, view = STATE.view || 'list') {
  STATE.selectedArchiveTripId = tripId || null;
  STATE.viewTripId = tripId || null;
  STATE.view = tripId ? 'summary' : 'list';
  STATE.lastArchiveView = tripId ? 'summary' : 'list';
}

export function switchPrimaryTab(tab) {
  STATE.tab = tab || 'trips';
  STATE.wizard = null;
  STATE.editTargetId = null;

  if (STATE.tab === 'trips') {
    const id = STATE.selectedTripId;
    STATE.viewTripId = id || null;
    STATE.view = id ? normalTripView(STATE.lastTripView, 'detail') : 'list';
    return;
  }

  if (STATE.tab === 'archive') {
    const id = STATE.selectedArchiveTripId;
    STATE.viewTripId = id || null;
    STATE.view = id && STATE.lastArchiveView === 'summary' ? 'summary' : 'list';
    return;
  }

  STATE.viewTripId = null;
  STATE.view = 'list';
}

export function validateUiSelection() {
  const hasTrip = (id) => Boolean(id && STATE.trips.some((trip) => trip.id === id));
  const isArchived = (id) => Boolean(id && STATE.trips.some((trip) => trip.id === id && ['completed', 'cancelled'].includes(trip.status)));
  const isActive = (id) => Boolean(id && STATE.trips.some((trip) => trip.id === id && ['planning', 'active'].includes(trip.status)));

  if (STATE.selectedTripId && (!hasTrip(STATE.selectedTripId) || !isActive(STATE.selectedTripId))) {
    STATE.selectedTripId = null;
    if (STATE.tab === 'trips') {
      STATE.viewTripId = null;
      STATE.selectedStageId = null;
      STATE.view = 'list';
    }
  }

  if (STATE.selectedArchiveTripId && (!hasTrip(STATE.selectedArchiveTripId) || !isArchived(STATE.selectedArchiveTripId))) {
    STATE.selectedArchiveTripId = null;
    if (STATE.tab === 'archive') {
      STATE.viewTripId = null;
      STATE.selectedStageId = null;
      STATE.view = 'list';
    }
  }

  if (STATE.tab === 'trips' && STATE.selectedTripId) {
    STATE.viewTripId = STATE.selectedTripId;
    STATE.view = normalTripView(STATE.view, STATE.lastTripView || 'detail');
  }

  if (STATE.tab === 'archive' && STATE.selectedArchiveTripId && STATE.lastArchiveView === 'summary') {
    STATE.viewTripId = STATE.selectedArchiveTripId;
    STATE.view = 'summary';
  }
}
