// ============================================================
// routefolk — actions/trip-actions.js
// Trip domain: create, edit, save, delete, visibility and
// trip-member management.
//
// Wizard save/edit/delete handler logic lives here (migrated out of
// screens/wizards.js). Shell-level trip-list actions still delegate to
// screens/app-actions.js.
// ============================================================

import { STATE } from '../state/app-state.js';
import { createTrip, updateTrip, deleteTrip } from '../lib/trips.js';
import { replaceTripMembers } from '../lib/trip-members.js';
import { rememberArchiveContext, rememberTripContext } from '../state/ui-state.js';
import { dispatchAppAction } from '../screens/app-actions.js';
import {
  claim,
  beginBusy,
  renderAll,
  api,
  activeTrip,
  tripPayload,
  assertSelectedVisibilityHasMembers,
  canManageTripVisibility,
  setDraftTripVisibility,
  showError,
} from '../screens/wizards.js';

/** Shell-level trip actions (suffix-matched) sourced from app-actions.js. */
const TRIP_APP_SUFFIXES = ['new-trip', 'list-edit-trip', 'list-delete-trip'];

/** Wizard trip actions (exact match) owned by this module. */
const TRIP_WIZARD_ACTIONS = new Set([
  'rf-v2-edit-trip',
  'rf-v2-delete-trip',
  'rf-v2-save-trip',
  'rf-v2-update-trip',
]);

/**
 * Create a new trip from the wizard form.
 * @param {Event} event
 */
export async function saveTripCreate(event) {
  claim(event);
  const endBusy = beginBusy(event);
  if (!endBusy) return;
  try {
    const payload = tripPayload();
    assertSelectedVisibilityHasMembers(payload);
    const trip = await createTrip({ ...payload, visibility: payload.visibility === 'selected' ? 'private' : payload.visibility });
    if (payload.visibility === 'selected') {
      await replaceTripMembers(trip.id, payload.selected_member_emails);
      await updateTrip(trip.id, { visibility: 'selected' });
      await api().loadTripMembersForTrip?.(trip.id, { force: true, quiet: true });
    }
    setDraftTripVisibility(null);
    STATE.trips = [trip, ...STATE.trips.filter((item) => item.id !== trip.id)];
    STATE.wizard = null;
    STATE.editTargetId = null;
    STATE.tab = 'trips';
    rememberTripContext(trip.id, 'detail');
    await api().loadTrips?.();
    await api().openTrip?.(trip.id, 'detail');
    renderAll();
  } catch (error) {
    showError('v2-trip-error', error);
  } finally {
    endBusy();
  }
}

/**
 * Update the active trip from the edit wizard form.
 * @param {Event} event
 */
export async function saveTripEdit(event) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const endBusy = beginBusy(event);
  if (!endBusy) return;
  try {
    const payload = tripPayload();
    const canManageVisibility = canManageTripVisibility(trip);
    let updated;
    if (canManageVisibility) {
      assertSelectedVisibilityHasMembers(payload);
      if (payload.visibility === 'selected') await replaceTripMembers(trip.id, payload.selected_member_emails);
      updated = await updateTrip(trip.id, payload);
      await api().loadTripMembersForTrip?.(trip.id, { force: true, quiet: true });
    } else {
      const { visibility, selected_member_emails, ...contentPayload } = payload;
      updated = await updateTrip(trip.id, contentPayload);
    }
    setDraftTripVisibility(null);
    STATE.trips = STATE.trips.map((item) => item.id === updated.id ? updated : item);
    STATE.wizard = null;
    STATE.editTargetId = null;
    if (STATE.tab === 'archive') rememberArchiveContext(updated.id, 'summary');
    else rememberTripContext(updated.id, STATE.view || 'detail');
    await api().openTrip?.(updated.id, STATE.view || 'detail');
    renderAll();
  } catch (error) {
    showError('v2-trip-error', error);
  } finally {
    endBusy();
  }
}

/**
 * Delete the active trip after a confirmation prompt.
 * @param {Event} event
 */
export async function removeTrip(event) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  if (!window.confirm(`Delete trip “${trip.title || 'Untitled'}”? This cannot be undone.`)) return;
  await deleteTrip(trip.id);
  STATE.trips = STATE.trips.filter((item) => item.id !== trip.id);
  STATE.wizard = null;
  STATE.editTargetId = null;
  if (STATE.tab === 'archive') rememberArchiveContext(null, 'list');
  else rememberTripContext(null, 'list');
  renderAll();
}

/**
 * @param {string} action
 * @returns {boolean} true if this action belongs to the trip domain
 */
export function owns(action) {
  return TRIP_APP_SUFFIXES.some((suffix) => action.endsWith(suffix))
    || TRIP_WIZARD_ACTIONS.has(action);
}

/**
 * Handle a trip action.
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>} true if handled
 */
export async function handle(event, btn, action) {
  if (action.endsWith('new-trip')) setDraftTripVisibility(null);

  if (action === 'rf-v2-edit-trip') {
    claim(event);
    STATE.wizard = 'trip-edit';
    setDraftTripVisibility(null);
    renderAll();
    return true;
  }
  if (action === 'rf-v2-delete-trip') {
    await removeTrip(event);
    return true;
  }
  if (action === 'rf-v2-save-trip') {
    setDraftTripVisibility(null);
    await saveTripCreate(event);
    return true;
  }
  if (action === 'rf-v2-update-trip') {
    setDraftTripVisibility(null);
    await saveTripEdit(event);
    return true;
  }

  return dispatchAppAction(event, btn, action);
}
