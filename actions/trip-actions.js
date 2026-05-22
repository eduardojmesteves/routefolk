// ============================================================
// routefolk — actions/trip-actions.js
// Trip domain: create, edit, save, delete, visibility and
// trip-member management.
//
// Task 4.2 wrapper: shell-level trip-list actions delegate to
// screens/app-actions.js; wizard save/edit/delete flows delegate to
// screens/wizards.js. Task 4.9 will move the underlying logic here.
// ============================================================

import { dispatchAppAction } from '../screens/app-actions.js';
import { dispatchWizardAction } from '../screens/wizards.js';

/** Shell-level trip actions (suffix-matched) sourced from app-actions.js. */
const TRIP_APP_SUFFIXES = ['new-trip', 'list-edit-trip', 'list-delete-trip'];

/** Wizard trip actions (exact match) sourced from wizards.js. */
const TRIP_WIZARD_ACTIONS = new Set([
  'rf-v2-edit-trip',
  'rf-v2-delete-trip',
  'rf-v2-save-trip',
  'rf-v2-update-trip',
]);

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
  if (TRIP_WIZARD_ACTIONS.has(action)) {
    return dispatchWizardAction(event, btn, action);
  }
  return dispatchAppAction(event, btn, action);
}
