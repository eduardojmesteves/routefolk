// ============================================================
// routefolk — actions/expense-actions.js
// Expense domain: log expense (incl. stage expense CTA), save,
// edit and delete trip expenses.
//
// Task 4.2 wrapper: expense create flows delegate to
// screens/wizards.js; expense edit/delete overlays delegate to
// screens/extra-writes.js. Task 4.9 will move the logic here.
// ============================================================

import { dispatchWizardAction } from '../screens/wizards.js';
import { dispatchExtraWriteAction } from '../screens/extra-writes.js';

/** Expense create actions (exact match) sourced from wizards.js. */
const EXPENSE_WIZARD_ACTIONS = new Set([
  'rf-v2-add-expense',
  'rf-v2-add-stage-expense',
  'rf-v2-save-expense',
]);

/** Expense edit/delete actions (exact match) sourced from extra-writes.js. */
const EXPENSE_EXTRA_ACTIONS = new Set([
  'rf-v2-edit-expense',
  'rf-v2-delete-expense',
  'rf-v2-update-expense',
]);

/**
 * @param {string} action
 * @returns {boolean} true if this action belongs to the expense domain
 */
export function owns(action) {
  return EXPENSE_WIZARD_ACTIONS.has(action) || EXPENSE_EXTRA_ACTIONS.has(action);
}

/**
 * Handle an expense action.
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>} true if handled
 */
export async function handle(event, btn, action) {
  if (EXPENSE_WIZARD_ACTIONS.has(action)) {
    return dispatchWizardAction(event, btn, action);
  }
  if (EXPENSE_EXTRA_ACTIONS.has(action)) {
    return dispatchExtraWriteAction(event, btn, action);
  }
  return false;
}
