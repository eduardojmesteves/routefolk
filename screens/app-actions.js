// ============================================================
// routefolk — screens/app-actions.js
// Capture-phase UI actions for the production shell.
// Routes navigation through app data loaders so the UI receives
// stages, journal, costs, GPX, and items before rendering.
// ============================================================

import { createStage } from '../lib/stages.js';
import { createEntry } from '../lib/journal.js';
import { deleteTrip } from '../lib/trips.js';
import { createTripItem, deleteTripItem, toggleTripItemPacked, updateTripItem } from '../lib/items.js';
import { STATE } from '../state/app-state.js';
import { rememberArchiveContext, rememberTripContext, saveUiState, switchPrimaryTab } from '../state/ui-state.js';
import { setPalette } from './render/shared.js';

const byId = (id) => document.getElementById(id);
const activeTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || (STATE.tab === 'archive' ? STATE.selectedArchiveTripId : STATE.selectedTripId))) || null;
const tripStages = (tripId) => Array.isArray(STATE.stagesByTrip[tripId]) ? STATE.stagesByTrip[tripId] : [];
const tripItems = (tripId) => Array.isArray(STATE.itemsByTrip[tripId]) ? STATE.itemsByTrip[tripId] : [];
const viewForTab = (key) => key === 'summary' ? 'summary' : key === 'costs' ? 'costs' : key === 'items' ? 'packing' : 'detail';
const normalTripView = (view) => ['detail', 'summary', 'costs', 'packing', 'journal'].includes(view) ? view : 'detail';
let wizardRenderQueued = false;

function appApi() {
  return window.routefolkData || {};
}

function notifyWizardLayer() {
  if (wizardRenderQueued) return;
  wizardRenderQueued = true;
  requestAnimationFrame(() => {
    wizardRenderQueued = false;
    document.dispatchEvent(new Event('routefolk:v2-render'));
  });
}

function renderSoon() {
  saveUiState();
  appApi().renderAll?.();
  if (typeof window.__routefolkV2Render === 'function') window.__routefolkV2Render();
  if (!STATE.wizard) notifyWizardLayer();
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

function isArchiveTrip(trip, source = '') {
  return source === 'archive' || ['completed', 'cancelled'].includes(trip?.status);
}

function clearDeletedTripContext(tripId, archiveContext = false) {
  if (STATE.viewTripId === tripId) STATE.viewTripId = null;
  if (STATE.selectedTripId === tripId) STATE.selectedTripId = null;
  if (STATE.selectedArchiveTripId === tripId) STATE.selectedArchiveTripId = null;
  STATE.selectedStageId = null;
  STATE.wizard = null;
  STATE.editTargetId = null;
  if (archiveContext) {
    STATE.tab = 'archive';
    rememberArchiveContext(null, 'list');
  } else {
    STATE.tab = 'trips';
    STATE.view = 'list';
  }
}

async function openTripWithData(tripId, view = 'detail', tab = 'trips') {
  STATE.tab = tab;
  STATE.wizard = null;
  const nextView = normalTripView(view);
  if (tab === 'archive') {
    rememberArchiveContext(tripId, 'summary');
  } else {
    rememberTripContext(tripId, nextView);
  }
  renderSoon();
  if (appApi().openTrip) await appApi().openTrip(tripId, nextView);
  STATE.tab = tab;
  if (tab === 'archive') rememberArchiveContext(tripId, 'summary');
  else rememberTripContext(tripId, nextView);
  renderSoon();
}

async function editTripFromList(event, btn) {
  claim(event);
  const tripId = btn.dataset.tripId;
  const trip = STATE.trips.find((candidate) => candidate.id === tripId);
  if (!trip) return;
  const archiveContext = isArchiveTrip(trip, btn.dataset.source);
  const view = archiveContext ? 'summary' : 'detail';
  STATE.tab = archiveContext ? 'archive' : 'trips';
  STATE.wizard = null;
  STATE.editTargetId = null;
  if (archiveContext) rememberArchiveContext(trip.id, 'summary');
  else rememberTripContext(trip.id, 'detail');
  if (appApi().openTrip) await appApi().openTrip(trip.id, view);
  STATE.tab = archiveContext ? 'archive' : 'trips';
  if (archiveContext) rememberArchiveContext(trip.id, 'summary');
  else rememberTripContext(trip.id, 'detail');
  STATE.wizard = 'trip-edit';
  renderSoon();
}

async function deleteTripFromList(event, btn) {
  claim(event);
  const tripId = btn.dataset.tripId;
  const trip = STATE.trips.find((candidate) => candidate.id === tripId);
  if (!trip) return;
  if (!window.confirm(`Delete trip "${trip.title || 'Untitled'}"? This cannot be undone.`)) return;
  const archiveContext = isArchiveTrip(trip, btn.dataset.source);
  await deleteTrip(trip.id);
  STATE.trips = STATE.trips.filter((candidate) => candidate.id !== trip.id);
  delete STATE.stagesByTrip[trip.id];
  delete STATE.expensesByTrip[trip.id];
  delete STATE.itemsByTrip[trip.id];
  delete STATE.itemCategoriesByTrip[trip.id];
  clearDeletedTripContext(trip.id, archiveContext);
  renderSoon();
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
    entry_type: byId('v2-entry-type')?.value || STATE.journalType || 'note',
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

async function editItem(event, btn) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const item = tripItems(trip.id).find((candidate) => candidate.id === btn.dataset.itemId);
  if (!item) return;
  STATE.wizard = 'item-edit';
  STATE.editTargetId = item.id;
  renderSoon();
}

async function removeItem(event, btn) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const item = tripItems(trip.id).find((candidate) => candidate.id === btn.dataset.itemId);
  if (!item) return;
  const ok = window.confirm(`Delete "${item.name || 'this item'}" from the packing list?`);
  if (!ok) return;
  await deleteTripItem(item.id);
  STATE.itemsByTrip[trip.id] = tripItems(trip.id).filter((candidate) => candidate.id !== item.id);
  renderSoon();
}

async function addItem(event, form) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const fd = new FormData(form);
  const item = await createTripItem(trip.id, { text: fd.get('text'), category_id: fd.get('category_id') || null, status: fd.get('status') || 'planned', notes: fd.get('notes') || '' });
  STATE.itemsByTrip[trip.id] = [...tripItems(trip.id), item];
  form.reset();
  STATE.wizard = null;
  await appApi().loadItemsForTrip?.(trip.id, { quiet: true });
  renderSoon();
}

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action || '';

  if (action === 'rf-palette-select') { claim(event); setPalette(btn.dataset.palette || 'midnight'); renderSoon(); return; }
  if (action.endsWith('sign-in')) { claim(event); await appApi().handleSignIn?.(); return; }
  if (action.endsWith('sign-out')) { claim(event); await appApi().handleSignOut?.(); window.location.reload(); return; }
  if (action.endsWith('new-trip')) { claim(event); STATE.wizard = 'trip'; renderSoon(); return; }
  if (action.endsWith('list-edit-trip')) { await editTripFromList(event, btn); return; }
  if (action.endsWith('list-delete-trip')) { await deleteTripFromList(event, btn); return; }

  if (action.endsWith('nav')) {
    claim(event);
    switchPrimaryTab(btn.dataset.tab || 'trips');
    if (STATE.tab === 'archive') await appApi().ensureArchiveData?.();
    const id = STATE.viewTripId;
    if (id && STATE.tab !== 'account') await appApi().openTrip?.(id, STATE.view);
    renderSoon();
    return;
  }

  if (action.endsWith('select-trip')) {
    claim(event);
    await openTripWithData(btn.dataset.tripId, 'detail', 'trips');
    return;
  }

  if (action.endsWith('select-archived')) {
    claim(event);
    await openTripWithData(btn.dataset.tripId, 'summary', 'archive');
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

  if (action.endsWith('back-to-archive')) {
    claim(event);
    rememberArchiveContext(null, 'list');
    await appApi().ensureArchiveData?.();
    renderSoon();
    return;
  }

  if (action.endsWith('tab')) {
    claim(event);
    const trip = activeTrip();
    const view = viewForTab(btn.dataset.value);
    if (trip?.id) await openTripWithData(trip.id, view, STATE.tab || 'trips');
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
    STATE.lastTripView = 'journal';
    await appApi().loadEntriesForStage?.(STATE.selectedStageId, { quiet: true });
    renderSoon();
    return;
  }

  if (action.endsWith('back-to-stages')) { claim(event); STATE.view = 'detail'; STATE.lastTripView = 'detail'; renderSoon(); return; }
  if (action.endsWith('add-stage')) { claim(event); STATE.wizard = 'stage'; renderSoon(); return; }
  if (action.endsWith('add-journal')) { claim(event); STATE.wizard = 'journal'; renderSoon(); return; }
  if (action.endsWith('add-item')) { claim(event); STATE.wizard = 'item'; renderSoon(); return; }
  if (action.endsWith('cancel-wizard')) { claim(event); STATE.wizard = null; STATE.editTargetId = null; renderSoon(); return; }
  if (action.endsWith('save-stage')) { await saveStage(event); return; }
  if (action.endsWith('save-journal')) { await saveJournal(event); return; }
  if (action.endsWith('journal-type')) { claim(event); STATE.journalType = btn.dataset.value || 'note'; renderSoon(); return; }
  if (action.endsWith('status-filter')) { claim(event); if (STATE.tab === 'archive') STATE.archiveStatusFilter = btn.dataset.value; else STATE.tripStatusFilter = btn.dataset.value; renderSoon(); return; }
  if (action.endsWith('item-view')) { claim(event); STATE.itemViewMode = btn.dataset.value === 'list' ? 'list' : 'categories'; renderSoon(); return; }
  if (action.endsWith('item-filter')) { claim(event); STATE.itemStatusFilter = btn.dataset.value === 'done' ? 'done' : 'todo'; renderSoon(); return; }
  if (action.endsWith('search-toggle')) { claim(event); if (STATE.tab === 'archive') STATE.archiveFiltersOpen = !STATE.archiveFiltersOpen; else STATE.tripFiltersOpen = !STATE.tripFiltersOpen; renderSoon(); return; }
  if (action.endsWith('select-category')) { claim(event); STATE.selectedCategoryKey = btn.dataset.category; STATE.wizard = null; renderSoon(); return; }
  if (action.endsWith('toggle-item')) { await toggleItem(event, btn); return; }
  if (action.endsWith('edit-item')) { await editItem(event, btn); return; }
  if (action.endsWith('delete-item')) { await removeItem(event, btn); return; }
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
  const form = target?.closest('[data-action="rf-d2-item-form"], [data-action="rf-m2-item-form"], [data-action="rf-v2-item-form"], [data-action="rf-v3-item-form"]');
  if (!form) return;
  await addItem(event, form);
}, true);
