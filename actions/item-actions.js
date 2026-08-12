// ============================================================
// routefolk — actions/item-actions.js
// Packing item domain: add item, save, edit, delete, toggle
// packed, category selection and item list filters/views.
//
// Item create/update handler logic lives here (migrated out of
// screens/wizards.js). Item edit/delete overlays still delegate to
// screens/extra-writes.js; toggle/filter/category actions still
// delegate to screens/app-actions.js.
//
// Legacy capture-phase listener priority is preserved:
//   wizards.js  >  extra-writes.js  >  app-actions.js
// ============================================================

import { STATE } from '../state/app-state.js';
import { createTripItem, updateTripItem } from '../lib/items.js';
import { dispatchAppAction } from '../screens/app-actions.js';
import { dispatchExtraWriteAction } from '../screens/extra-writes.js';
import {
  claim,
  beginBusy,
  renderAll,
  api,
  activeTrip,
  selectedItem,
  itemsForTrip,
  itemPayload,
  showError,
} from '../screens/wizards.js';

/** Item create/update actions (exact match) owned by this module. */
const ITEM_WIZARD_ACTIONS = new Set([
  'rf-v2-save-item',
  'rf-v2-update-item',
]);

/** Item actions handled by extra-writes.js (exact match) — second priority. */
const ITEM_EXTRA_ACTIONS = new Set([
  'rf-v2-edit-item',
  'rf-v2-delete-item',
]);

/** Shell-level item actions (suffix-matched) sourced from app-actions.js. */
const ITEM_APP_SUFFIXES = [
  'add-item',
  'toggle-item',
  'item-view',
  'item-filter',
  'select-category',
];

/**
 * Create a packing item on the active trip from the wizard form.
 * @param {Event} event
 */
export async function saveItemCreate(event) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const endBusy = beginBusy(event);
  if (!endBusy) return;
  try {
    const item = await createTripItem(trip.id, itemPayload());
    STATE.itemsByTrip[trip.id] = [...itemsForTrip(trip.id), item];
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadItemsForTrip?.(trip.id, { quiet: true });
    renderAll();
  } catch (error) {
    showError('v2-item-error', error);
  } finally {
    endBusy();
  }
}

/**
 * Update the selected packing item from the edit wizard form.
 * @param {Event} event
 */
export async function saveItemEdit(event) {
  claim(event);
  const trip = activeTrip();
  const item = selectedItem();
  if (!trip || !item) return;
  const endBusy = beginBusy(event);
  if (!endBusy) return;
  try {
    const updated = await updateTripItem(item.id, itemPayload());
    STATE.itemsByTrip[trip.id] = itemsForTrip(trip.id).map((candidate) => candidate.id === updated.id ? updated : candidate);
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadItemsForTrip?.(trip.id, { quiet: true });
    renderAll();
  } catch (error) {
    showError('v2-item-error', error);
  } finally {
    endBusy();
  }
}

/**
 * @param {string} action
 * @returns {boolean} true if this action belongs to the item domain
 */
export function owns(action) {
  return ITEM_WIZARD_ACTIONS.has(action)
    || ITEM_EXTRA_ACTIONS.has(action)
    || ITEM_APP_SUFFIXES.some((suffix) => action.endsWith(suffix));
}

/**
 * Handle a packing item action. Mirrors the legacy capture-phase
 * listener priority (wizards before extra-writes before app-actions).
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>} true if handled
 */
export async function handle(event, btn, action) {
  if (action === 'rf-v2-save-item') {
    await saveItemCreate(event);
    return true;
  }
  if (action === 'rf-v2-update-item') {
    await saveItemEdit(event);
    return true;
  }
  if (ITEM_EXTRA_ACTIONS.has(action)) {
    return dispatchExtraWriteAction(event, btn, action);
  }
  return dispatchAppAction(event, btn, action);
}
