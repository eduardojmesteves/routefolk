// ============================================================
// routefolk — screens/v2/v2-actions.js
// Capture-phase bridge actions for controls that cannot rely on
// the legacy hidden DOM after the v2 render takeover.
// ============================================================

import { signInWithGoogle, signOut } from '../../lib/auth.js';
import { createTrip } from '../../lib/trips.js';
import { createStage } from '../../lib/stages.js';
import { createEntry } from '../../lib/journal.js';
import { createTripItem, toggleTripItemPacked } from '../../lib/items.js';
import { STATE } from '../../state/app-state.js';

const byId = (id) => document.getElementById(id);
const activeTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || STATE.selectedTripId)) || null;
const tripStages = (tripId) => Array.isArray(STATE.stagesByTrip[tripId]) ? STATE.stagesByTrip[tripId] : [];
const tripItems = (tripId) => Array.isArray(STATE.itemsByTrip[tripId]) ? STATE.itemsByTrip[tripId] : [];

function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function reloadSoon() {
  setTimeout(() => window.location.reload(), 250);
}

function selectedStage() {
  const trip = activeTrip();
  if (!trip) return null;
  const stages = tripStages(trip.id);
  return stages.find((stage) => stage.id === STATE.selectedStageId) || stages[0] || null;
}

async function createNewTrip(event) {
  claim(event);
  const title = window.prompt('Trip title');
  if (!title?.trim()) return;
  const trip = await createTrip({ title: title.trim(), description: '', start_date: null, end_date: null, status: 'planning', visibility: 'group' });
  STATE.trips = [trip, ...STATE.trips.filter((item) => item.id !== trip.id)];
  STATE.tab = 'trips';
  STATE.view = 'detail';
  STATE.viewTripId = trip.id;
  STATE.selectedTripId = trip.id;
  STATE.wizard = null;
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
}

async function toggleItem(event, btn) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const item = tripItems(trip.id).find((candidate) => candidate.id === btn.dataset.itemId);
  if (!item) return;
  const updated = await toggleTripItemPacked(item);
  STATE.itemsByTrip[trip.id] = tripItems(trip.id).map((candidate) => candidate.id === updated.id ? updated : candidate);
}

async function addItem(event, form) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const fd = new FormData(form);
  const item = await createTripItem(trip.id, { text: fd.get('text'), category_id: fd.get('category_id') || null, status: 'planned' });
  STATE.itemsByTrip[trip.id] = [...tripItems(trip.id), item];
  form.reset();
}

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action || '';

  if (action.endsWith('sign-in')) { claim(event); await signInWithGoogle(); return; }
  if (action.endsWith('sign-out')) { claim(event); await signOut(); reloadSoon(); return; }
  if (action.endsWith('new-trip')) { await createNewTrip(event); return; }
  if (action.endsWith('save-stage')) { await saveStage(event); return; }
  if (action.endsWith('save-journal')) { await saveJournal(event); return; }
  if (action.endsWith('journal-type')) { claim(event); STATE.journalType = btn.dataset.value || 'note'; return; }
  if (action.endsWith('toggle-item')) { await toggleItem(event, btn); }
}, true);

document.addEventListener('submit', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const form = target?.closest('[data-action="rf-d2-item-form"], [data-action="rf-m2-item-form"]');
  if (!form) return;
  await addItem(event, form);
}, true);
