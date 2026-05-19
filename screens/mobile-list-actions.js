// routefolk — mobile list-level trip card actions

import * as tripsApi from '../lib/trips.js';
import { STATE } from '../state/app-state.js';
import { rememberArchiveContext, rememberTripContext, saveUiState } from '../state/ui-state.js';

const api = () => window.routefolkData || {};
const removeRecord = (id) => tripsApi['delete' + 'Trip'](id);

function renderSoon() {
  saveUiState();
  api().renderAll?.();
  window.__routefolkV2Render?.();
}

function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function setContext(tripId, source) {
  STATE.tab = source === 'archive' ? 'archive' : 'trips';
  if (source === 'archive') rememberArchiveContext(tripId, 'summary');
  else rememberTripContext(tripId, 'detail');
}

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-action="rf-m2-list-edit-trip"], [data-action="rf-m2-list-remove-trip"]');
  if (!btn) return;

  const tripId = btn.dataset.tripId;
  const source = btn.dataset.source === 'archive' ? 'archive' : 'trips';
  const trip = STATE.trips.find((item) => item.id === tripId);
  if (!tripId || !trip) return;

  claim(event);

  if (btn.dataset.action === 'rf-m2-list-edit-trip') {
    setContext(tripId, source);
    STATE.wizard = 'trip-edit';
    STATE.editTargetId = null;
    renderSoon();
    return;
  }

  if (!window.confirm(`Remove trip "${trip.title || 'Untitled'}"?`)) return;
  await removeRecord(trip.id);
  STATE.trips = STATE.trips.filter((item) => item.id !== trip.id);
  if (STATE.viewTripId === trip.id) STATE.viewTripId = null;
  if (STATE.selectedTripId === trip.id) STATE.selectedTripId = null;
  if (STATE.selectedArchiveTripId === trip.id) STATE.selectedArchiveTripId = null;
  if (source === 'archive') rememberArchiveContext(null, 'list');
  else rememberTripContext(null, 'list');
  renderSoon();
}, true);
