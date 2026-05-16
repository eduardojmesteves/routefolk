// ============================================================
// routefolk — screens/v2/v2-actions.js
// Capture-phase bridge actions for the v2 shell.
// Routes navigation through app-v2 data loaders so the designer UI
// receives the original PWA data: stages, journal, costs, GPX, items.
// ============================================================

import { createTrip } from '../../lib/trips.js';
import { createStage } from '../../lib/stages.js';
import { createEntry } from '../../lib/journal.js';
import { createTripItem, toggleTripItemPacked } from '../../lib/items.js';
import { STATE } from '../../state/app-state.js';

const byId = (id) => document.getElementById(id);
const activeTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || STATE.selectedTripId)) || null;
const tripStages = (tripId) => Array.isArray(STATE.stagesByTrip[tripId]) ? STATE.stagesByTrip[tripId] : [];
const tripItems = (tripId) => Array.isArray(STATE.itemsByTrip[tripId]) ? STATE.itemsByTrip[tripId] : [];
const viewForTab = (key) => key === 'summary' ? 'summary' : key === 'costs' ? 'costs' : key === 'items' ? 'packing' : 'detail';

function appApi() {
  return window.routefolkData || {};
}

function renderSoon() {
  appApi().renderAll?.();
  if (typeof window.__routefolkV2Render === 'function') window.__routefolkV2Render();
}

function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function selectedStage() {
  const trip = activeTrip();
  if (!trip) return null;
  const stages = tripStages(trip.id);
  return stages.find((stage) => stage.id === STATE.selectedStageId) || stages[0] || null;
}

async function openTripWithData(tripId, view = 'detail') {
  STATE.tab = 'trips';
  STATE.viewTripId = tripId;
  STATE.selectedTripId = tripId;
  STATE.view = view;
  STATE.wizard = null;
  renderSoon();
  if (appApi().openTrip) await appApi().openTrip(tripId, view);
}

async function createNewTrip(event) {
  claim(event);
  const title = window.prompt('Trip title');
  if (!title?.trim()) return;
  const trip = await createTrip({ title: title.trim(), description: '', start_date: null, end_date: null, status: 'planning', visibility: 'group' });
  STATE.trips = [trip, ...STATE.trips.filter((item) => item.id !== trip.id)];
  await openTripWithData(trip.id, 'detail');
}

async function saveStage(event) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const stage = await createStage(trip.id, {
    start_location: byId('v2-stage-from')?.value?.trim() || '',
    end_location: byId('v2-stage-to')?.value?.trim() || '',
    planned_date: byId('v2-stage-date')?.value || '',
    distance_km: byId('v2-stage-km')?.value?.trim() || '',
    notes: byId('v2-stage-notes')?.value?.trim() || '',
  });
  STATE.stagesByTrip[trip.id] = [...tripStages(trip.id), stage];
  STATE.selectedStageId = stage.id;
  STATE.wizard = null;
  await appApi().loadEntriesForStage?.(stage.id, { quiet: true });
  await appApi().loadStagesForTrip?.(trip.id);
  renderSoon();
}

async function saveJournal(event) {
  claim(event);
  const stage = selectedStage();
  if (!stage) return;
  const time = byId('v2-entry-time')?.value || '';
  const date = stage.planned_date || new Date().toISOString().slice(0, 10);
  const entry = await createEntry(stage.id, {
    entry_type: STATE.journalType || 'note',
    title: byId('v2-entry-title')?.value?.trim() || '',
    location: byId('v2-entry-place')?.value?.trim() || '',
    description: byId('v2-entry-note')?.value?.trim() || '',
    timestamp: time ? `${date}T${time}:00` : null,
  });
  const existing = STATE.entriesByStage[stage.id];
  STATE.entriesByStage[stage.id] = Array.isArray(existing) ? [...existing, entry] : [entry];
  STATE.wizard = null;
  await appApi().loadEntriesForStage?.(stage.id, { quiet: true });
  renderSoon();
}

async function toggleItem(event, btn) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const item = tripItems(trip.id).find((candidate) => candidate.id === btn.dataset.itemId);
  if (!item) return;
  const updated = await toggleTripItemPacked(item);
  STATE.itemsByTrip[trip.id] = tripItems(trip.id).map((candidate) => candidate.id === updated.id ? updated : candidate);
  renderSoon();
}

async function addItem(event, form) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const fd = new FormData(form);
  const item = await createTripItem(trip.id, { text: fd.get('text'), category_id: fd.get('category_id') || null, status: 'planned' });
  STATE.itemsByTrip[trip.id] = [...tripItems(trip.id), item];
  form.reset();
  await appApi().loadItemsForTrip?.(trip.id, { quiet: true });
  renderSoon();
}

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action || '';

  if (action.endsWith('sign-in')) { claim(event); await appApi().handleSignIn?.(); return; }
  if (action.endsWith('sign-out')) { claim(event); await appApi().handleSignOut?.(); window.location.reload(); return; }
  if (action.endsWith('new-trip')) { await createNewTrip(event); return; }

  if (action.endsWith('nav')) {
    claim(event);
    STATE.tab = btn.dataset.tab || 'trips';
    STATE.view = 'list';
    STATE.viewTripId = null;
    STATE.selectedTripId = null;
    STATE.selectedStageId = null;
    STATE.wizard = null;
    if (STATE.tab === 'archive') await appApi().ensureArchiveData?.();
    renderSoon();
    return;
  }

  if (action.endsWith('select-trip')) {
    claim(event);
    await openTripWithData(btn.dataset.tripId, 'detail');
    return;
  }

  if (action.endsWith('back-to-trips')) {
    claim(event);
    STATE.view = 'list';
    STATE.viewTripId = null;
    STATE.selectedTripId = null;
    STATE.selectedStageId = null;
    STATE.wizard = null;
    renderSoon();
    return;
  }

  if (action.endsWith('tab')) {
    claim(event);
    const trip = activeTrip();
    const view = viewForTab(btn.dataset.value);
    if (trip?.id) await openTripWithData(trip.id, view);
    else { STATE.view = view; renderSoon(); }
    return;
  }

  if (action.endsWith('select-stage')) {
    claim(event);
    STATE.selectedStageId = btn.dataset.stageId;
    STATE.wizard = null;
    await appApi().loadEntriesForStage?.(STATE.selectedStageId, { quiet: true });
    renderSoon();
    return;
  }

  if (action.endsWith('open-stage')) {
    claim(event);
    STATE.selectedStageId = btn.dataset.stageId;
    STATE.view = 'journal';
    await appApi().loadEntriesForStage?.(STATE.selectedStageId, { quiet: true });
    renderSoon();
    return;
  }

  if (action.endsWith('back-to-stages')) { claim(event); STATE.view = 'detail'; renderSoon(); return; }
  if (action.endsWith('add-stage')) { claim(event); STATE.wizard = 'stage'; renderSoon(); return; }
  if (action.endsWith('add-journal')) { claim(event); STATE.wizard = 'journal'; renderSoon(); return; }
  if (action.endsWith('cancel-wizard')) { claim(event); STATE.wizard = null; renderSoon(); return; }
  if (action.endsWith('save-stage')) { await saveStage(event); return; }
  if (action.endsWith('save-journal')) { await saveJournal(event); return; }
  if (action.endsWith('journal-type')) { claim(event); STATE.journalType = btn.dataset.value || 'note'; renderSoon(); return; }
  if (action.endsWith('status-filter')) { claim(event); if (STATE.tab === 'archive') STATE.archiveStatusFilter = btn.dataset.value; else STATE.tripStatusFilter = btn.dataset.value; renderSoon(); return; }
  if (action.endsWith('search-toggle')) { claim(event); if (STATE.tab === 'archive') STATE.archiveFiltersOpen = !STATE.archiveFiltersOpen; else STATE.tripFiltersOpen = !STATE.tripFiltersOpen; renderSoon(); return; }
  if (action.endsWith('select-category')) { claim(event); STATE.selectedCategoryKey = btn.dataset.category; renderSoon(); return; }
  if (action.endsWith('toggle-item')) { await toggleItem(event, btn); }
}, true);

document.addEventListener('input', (event) => {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  if (!target?.dataset?.action?.endsWith('search-input')) return;
  if (STATE.tab === 'archive') STATE.archiveSearch = target.value;
  else STATE.tripSearch = target.value;
  renderSoon();
}, true);

document.addEventListener('submit', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const form = target?.closest('[data-action="rf-d2-item-form"], [data-action="rf-m2-item-form"]');
  if (!form) return;
  await addItem(event, form);
}, true);
