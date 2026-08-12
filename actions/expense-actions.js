// ============================================================
// routefolk — actions/expense-actions.js
// Expense domain: log expense (incl. stage expense CTA), save,
// edit and delete trip expenses.
//
// Expense create handler logic lives here (migrated out of
// screens/wizards.js). Expense edit/delete overlays still delegate to
// screens/extra-writes.js.
// ============================================================

import { STATE } from '../state/app-state.js';
import { createExpense } from '../lib/expenses.js';
import { dispatchExtraWriteAction } from '../screens/extra-writes.js';
import {
  claim,
  beginBusy,
  renderAll,
  api,
  activeTrip,
  expensesForTrip,
  field,
  fieldValue,
  showError,
} from '../screens/wizards.js';

/** Expense create actions (exact match) owned by this module. */
const EXPENSE_WIZARD_ACTIONS = new Set([
  'rf-add-expense',
  'rf-add-stage-expense',
  'rf-save-expense',
]);

/** Expense edit/delete actions (exact match) sourced from extra-writes.js. */
const EXPENSE_EXTRA_ACTIONS = new Set([
  'rf-edit-expense',
  'rf-delete-expense',
  'rf-update-expense',
]);

/**
 * Create an expense on the active trip from the wizard form.
 * @param {Event} event
 */
export async function saveExpense(event) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const endBusy = beginBusy(event);
  if (!endBusy) return;
  try {
    const expense = await createExpense(trip.id, {
      category: field('expense-category')?.value || 'other',
      amount: field('expense-amount')?.value || '',
      user_id: field('expense-payer')?.value || STATE.user?.id,
      date: field('expense-date')?.value || null,
      stage_id: field('expense-stage')?.value || null,
      description: fieldValue('expense-description'),
    });
    STATE.expensesByTrip[trip.id] = [...expensesForTrip(trip.id), expense];
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadExpensesForTrip?.(trip.id, { quiet: true });
    renderAll();
  } catch (error) {
    showError('expense-error', error);
  } finally {
    endBusy();
  }
}

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
  if (action === 'rf-add-expense' || action === 'rf-add-stage-expense') {
    claim(event);
    STATE.wizard = 'expense';
    STATE.editTargetId = btn.dataset.stageId || null;
    renderAll();
    return true;
  }
  if (action === 'rf-save-expense') {
    await saveExpense(event);
    return true;
  }
  if (EXPENSE_EXTRA_ACTIONS.has(action)) {
    return dispatchExtraWriteAction(event, btn, action);
  }
  return false;
}
