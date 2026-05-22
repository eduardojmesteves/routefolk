// ============================================================
// routefolk — actions/item-actions.js
// Packing item domain: add item, save, edit, delete, toggle
// packed, category selection and item list filters/views.
//
// Task 4.2 wrapper: item create/update flows delegate to
// screens/wizards.js; item edit/delete overlays delegate to
// screens/extra-writes.js; toggle/filter/category actions delegate
// to screens/app-actions.js. Task 4.9 will move the logic here.
//
// Legacy capture-phase listener priority is preserved:
//   wizards.js  >  extra-writes.js  >  app-actions.js
// ============================================================

import { dispatchAppAction } from '../screens/app-actions.js';
import { dispatchWizardAction } from '../screens/wizards.js';
import { dispatchExtraWriteAction } from '../screens/extra-writes.js';

/** Item actions handled by wizards.js (exact match) — highest priority. */
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
  if (ITEM_WIZARD_ACTIONS.has(action)) {
    return dispatchWizardAction(event, btn, action);
  }
  if (ITEM_EXTRA_ACTIONS.has(action)) {
    return dispatchExtraWriteAction(event, btn, action);
  }
  return dispatchAppAction(event, btn, action);
}
