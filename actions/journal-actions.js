// ============================================================
// routefolk — actions/journal-actions.js
// Journal domain: add entry, choose entry type, save, edit and
// delete stage journal entries.
//
// Task 4.2 wrapper: shell-level journal actions delegate to
// screens/app-actions.js; wizard journal flows delegate to
// screens/wizards.js. Task 4.9 will move the underlying logic here.
// ============================================================

import { dispatchAppAction } from '../screens/app-actions.js';
import { dispatchWizardAction } from '../screens/wizards.js';

/** Shell-level journal actions (suffix-matched) sourced from app-actions.js. */
const JOURNAL_APP_SUFFIXES = [
  'add-journal',
  'save-journal',
  'journal-type',
];

/** Wizard journal actions (exact match) sourced from wizards.js. */
const JOURNAL_WIZARD_ACTIONS = new Set([
  'rf-v2-save-journal',
  'rf-v2-edit-entry',
  'rf-v2-delete-entry',
  'rf-v2-update-entry',
]);

/**
 * @param {string} action
 * @returns {boolean} true if this action belongs to the journal domain
 */
export function owns(action) {
  return JOURNAL_APP_SUFFIXES.some((suffix) => action.endsWith(suffix))
    || JOURNAL_WIZARD_ACTIONS.has(action);
}

/**
 * Handle a journal action.
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>} true if handled
 */
export async function handle(event, btn, action) {
  if (JOURNAL_WIZARD_ACTIONS.has(action)) {
    return dispatchWizardAction(event, btn, action);
  }
  return dispatchAppAction(event, btn, action);
}
