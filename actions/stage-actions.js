// ============================================================
// routefolk — actions/stage-actions.js
// Stage domain: add stage, select/open stage, edit, save and delete.
//
// Task 4.2 wrapper: shell-level stage actions delegate to
// screens/app-actions.js; wizard stage flows delegate to
// screens/wizards.js. Task 4.9 will move the underlying logic here.
// ============================================================

import { dispatchAppAction } from '../screens/app-actions.js';
import { dispatchWizardAction } from '../screens/wizards.js';

/** Shell-level stage actions (suffix-matched) sourced from app-actions.js. */
const STAGE_APP_SUFFIXES = [
  'add-stage',
  'select-stage',
  'open-stage',
  'save-stage',
];

/** Wizard stage actions (exact match) sourced from wizards.js. */
const STAGE_WIZARD_ACTIONS = new Set([
  'rf-v2-save-stage',
  'rf-v2-edit-stage',
  'rf-v2-delete-stage',
  'rf-v2-update-stage',
]);

/**
 * @param {string} action
 * @returns {boolean} true if this action belongs to the stage domain
 */
export function owns(action) {
  return STAGE_APP_SUFFIXES.some((suffix) => action.endsWith(suffix))
    || STAGE_WIZARD_ACTIONS.has(action);
}

/**
 * Handle a stage action.
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>} true if handled
 */
export async function handle(event, btn, action) {
  if (STAGE_WIZARD_ACTIONS.has(action)) {
    return dispatchWizardAction(event, btn, action);
  }
  return dispatchAppAction(event, btn, action);
}
