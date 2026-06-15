// ============================================================
// routefolk — screens/extra-writes.js
// Expense edit/delete and item edit/delete workflows.
// Kept separate from the main renderer to avoid bloating display code.
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { updateExpense, deleteExpense } from '../lib/expenses.js';
import { updateTripItem, deleteTripItem, DEFAULT_ITEM_CATEGORIES } from '../lib/items.js';
import { EXPENSE_CATEGORY_META } from '../constants/app-constants.js';

const isDesktop = () => window.matchMedia('(min-width:960px)').matches;
const byId = (id) => document.getElementById(id);
const activeTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || STATE.selectedTripId)) || null;
const expensesForTrip = (tripId) => Array.isArray(STATE.expensesByTrip[tripId]) ? STATE.expensesByTrip[tripId] : [];
const itemsForTrip = (tripId) => Array.isArray(STATE.itemsByTrip[tripId]) ? STATE.itemsByTrip[tripId] : [];
const categoriesForTrip = (tripId) => {
  const rows = STATE.itemCategoriesByTrip[tripId];
  return Array.isArray(rows) && rows.length ? rows : DEFAULT_ITEM_CATEGORIES.map((name) => ({ id: '', name }));
};
const stagesForTrip = (tripId) => Array.isArray(STATE.stagesByTrip[tripId]) ? STATE.stagesByTrip[tripId] : [];

function api() {
  return window.routefolkData || {};
}

function renderAll() {
  api().renderAll?.();
  window.__routefolkV2Render?.();
  requestAnimationFrame(renderExtraWritesLayer);
}

function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function selectedExpense() {
  const trip = activeTrip();
  if (!trip || !STATE.editTargetId) return null;
  return expensesForTrip(trip.id).find((expense) => expense.id === STATE.editTargetId) || null;
}

function selectedItem() {
  const trip = activeTrip();
  if (!trip || !STATE.editTargetId) return null;
  return itemsForTrip(trip.id).find((item) => item.id === STATE.editTargetId) || null;
}

// Only the edit overlay (appended to <body>) needs explicit teardown; the
// inline expense/item action buttons are part of the main render and are
// rebuilt with it, so they are no longer stripped + re-injected here.
function removeLayer() {
  document.querySelectorAll('.rf-v2-extra-host').forEach((node) => node.remove());
}

function renderExtraWritesLayer() {
  removeLayer();
  if (!STATE.user || !['expense-edit', 'item-edit'].includes(STATE.wizard)) return;

  const host = document.createElement('div');
  host.className = `rf-v2-extra-host ${isDesktop() ? 'is-desktop' : 'is-mobile'}`;
  host.innerHTML = STATE.wizard === 'expense-edit' ? expenseEditWizardHtml() : itemEditWizardHtml();
  document.body.appendChild(host);
  const first = host.querySelector('input, select, textarea, button');
  if (first instanceof HTMLElement) first.focus({ preventScroll: true });
}

function option(value, label, selected) {
  return `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`;
}

function expenseEditWizardHtml() {
  const trip = activeTrip();
  const expense = selectedExpense();
  if (!trip || !expense) return emptyWizard('No expense selected.');
  const categoryOptions = Object.entries(EXPENSE_CATEGORY_META).map(([key, meta]) => option(key, meta.label, expense.category)).join('');
  const stageOptions = ['<option value="">Whole trip</option>', ...stagesForTrip(trip.id).map((stage, index) => option(stage.id, `${index + 1}. ${stage.start_location || 'Start'} → ${stage.end_location || 'End'}`, expense.stage_id))].join('');
  const payerOptions = [STATE.user, ...STATE.profiles.filter((profile) => profile.id !== STATE.user?.id)]
    .filter(Boolean)
    .map((profile) => option(profile.id, profile.full_name || profile.email || 'Rider', expense.user_id))
    .join('');
  return `<aside class="rf-v2-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="rf-v2-expense-edit-title">
    <div class="rf-v2-wizard-head"><div class="rf-d2-aside-kicker">Edit expense</div><h2 class="rf-d2-aside-title" id="rf-v2-expense-edit-title">Correct the ledger</h2><p class="rf-d2-aside-sub">Keep the cost data clean. Bad cost data is useless.</p></div>
    <div class="rf-d2-form-row-pair"><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-edit-category">Category</label><select class="rf-d2-input" id="v2-expense-edit-category">${categoryOptions}</select></div><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-edit-amount">Amount</label><input class="rf-d2-input" id="v2-expense-edit-amount" inputmode="decimal" value="${esc(expense.amount ?? '')}"></div></div>
    <div class="rf-d2-form-row-pair"><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-edit-payer">Paid by</label><select class="rf-d2-input" id="v2-expense-edit-payer">${payerOptions}</select></div><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-edit-date">Date</label><input class="rf-d2-input" id="v2-expense-edit-date" type="date" value="${esc(expense.date || '')}"></div></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-edit-stage">Stage</label><select class="rf-d2-input" id="v2-expense-edit-stage">${stageOptions}</select></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-edit-description">Description</label><input class="rf-d2-input" id="v2-expense-edit-description" value="${esc(expense.description || '')}"></div>
    <div class="rf-v2-wizard-error" id="v2-expense-edit-error" hidden></div>
    <div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-v2-extra-cancel" type="button">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-v2-update-expense" type="button">Save expense</button></div>
  </aside>`;
}

function itemEditWizardHtml() {
  const trip = activeTrip();
  const item = selectedItem();
  if (!trip || !item) return emptyWizard('No item selected.');
  const categoryOptions = categoriesForTrip(trip.id).map((category) => option(category.id || '', category.name, item.category_id || item.category?.id || '')).join('');
  const riderOptions = ['<option value="">Unassigned</option>', ...[STATE.user, ...STATE.profiles.filter((profile) => profile.id !== STATE.user?.id)].filter(Boolean).map((profile) => option(profile.id, profile.full_name || profile.email || 'Rider', item.assigned_to || ''))].join('');
  return `<aside class="rf-v2-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="rf-v2-item-edit-title">
    <div class="rf-v2-wizard-head"><div class="rf-d2-aside-kicker">Edit item</div><h2 class="rf-d2-aside-title" id="rf-v2-item-edit-title">Tidy the packing list</h2><p class="rf-d2-aside-sub">Packing lists rot fast if nobody cleans them.</p></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-item-edit-name">Item</label><input class="rf-d2-input" id="v2-item-edit-name" value="${esc(item.name || '')}"></div>
    <div class="rf-d2-form-row-pair"><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-item-edit-category">Category</label><select class="rf-d2-input" id="v2-item-edit-category">${categoryOptions}</select></div><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-item-edit-status">Status</label><select class="rf-d2-input" id="v2-item-edit-status">${option('planned', 'Planned', item.status)}${option('packed', 'Packed', item.status)}${option('optional', 'Optional', item.status)}</select></div></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-item-edit-assigned">Assigned to</label><select class="rf-d2-input" id="v2-item-edit-assigned">${riderOptions}</select></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-item-edit-notes">Notes</label><textarea class="rf-d2-textarea" id="v2-item-edit-notes">${esc(item.notes || '')}</textarea></div>
    <div class="rf-v2-wizard-error" id="v2-item-edit-error" hidden></div>
    <div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-v2-extra-cancel" type="button">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-v2-update-item" type="button">Save item</button></div>
  </aside>`;
}

function emptyWizard(message) {
  return `<aside class="rf-v2-wizard-panel"><div class="rf-v2-wizard-head"><h2 class="rf-d2-aside-title">Nothing selected</h2><p>${esc(message)}</p></div><button class="rf-d2-btn" data-action="rf-v2-extra-cancel" type="button">Close</button></aside>`;
}

function showError(id, error) {
  const node = byId(id);
  if (!node) return;
  node.textContent = error?.message || String(error || 'Something went wrong.');
  node.hidden = false;
}

async function saveExpenseEdit(event) {
  claim(event);
  const trip = activeTrip();
  const expense = selectedExpense();
  if (!trip || !expense) return;
  try {
    const updated = await updateExpense(expense.id, {
      category: byId('v2-expense-edit-category')?.value || 'other',
      amount: byId('v2-expense-edit-amount')?.value || '',
      user_id: byId('v2-expense-edit-payer')?.value || STATE.user?.id,
      date: byId('v2-expense-edit-date')?.value || null,
      stage_id: byId('v2-expense-edit-stage')?.value || null,
      description: byId('v2-expense-edit-description')?.value?.trim() || '',
    });
    STATE.expensesByTrip[trip.id] = expensesForTrip(trip.id).map((candidate) => candidate.id === updated.id ? updated : candidate);
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadExpensesForTrip?.(trip.id, { quiet: true });
    renderAll();
  } catch (error) {
    showError('v2-expense-edit-error', error);
  }
}

async function removeExpense(event, expenseId) {
  claim(event);
  const trip = activeTrip();
  const expense = expensesForTrip(trip?.id).find((candidate) => candidate.id === expenseId);
  if (!trip || !expense) return;
  if (!window.confirm('Delete this expense?')) return;
  await deleteExpense(expense.id);
  STATE.expensesByTrip[trip.id] = expensesForTrip(trip.id).filter((candidate) => candidate.id !== expense.id);
  STATE.wizard = null;
  STATE.editTargetId = null;
  renderAll();
}

async function saveItemEdit(event) {
  claim(event);
  const trip = activeTrip();
  const item = selectedItem();
  if (!trip || !item) return;
  try {
    const updated = await updateTripItem(item.id, {
      name: byId('v2-item-edit-name')?.value?.trim() || '',
      category_id: byId('v2-item-edit-category')?.value || null,
      status: byId('v2-item-edit-status')?.value || 'planned',
      assigned_to: byId('v2-item-edit-assigned')?.value || null,
      notes: byId('v2-item-edit-notes')?.value?.trim() || '',
    });
    STATE.itemsByTrip[trip.id] = itemsForTrip(trip.id).map((candidate) => candidate.id === updated.id ? updated : candidate);
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadItemsForTrip?.(trip.id, { quiet: true });
    renderAll();
  } catch (error) {
    showError('v2-item-edit-error', error);
  }
}

async function removeItem(event, itemId) {
  claim(event);
  const trip = activeTrip();
  const item = itemsForTrip(trip?.id).find((candidate) => candidate.id === itemId);
  if (!trip || !item) return;
  if (!window.confirm(`Delete item “${item.name || 'Untitled'}”?`)) return;
  await deleteTripItem(item.id);
  STATE.itemsByTrip[trip.id] = itemsForTrip(trip.id).filter((candidate) => candidate.id !== item.id);
  STATE.wizard = null;
  STATE.editTargetId = null;
  renderAll();
}

/**
 * Dispatch an expense/item edit-or-delete overlay action.
 * Returns true if the action was recognised and handled.
 * Shared by the legacy capture-phase listener below and the unified
 * action-router domain modules (Tasks 4.2-4.8).
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>}
 */
export async function dispatchExtraWriteAction(event, btn, action) {
  if (action === 'rf-v2-edit-expense') { claim(event); STATE.wizard = 'expense-edit'; STATE.editTargetId = btn.dataset.expenseId; renderAll(); return true; }
  if (action === 'rf-v2-delete-expense') { await removeExpense(event, btn.dataset.expenseId); return true; }
  if (action === 'rf-v2-edit-item') { claim(event); STATE.wizard = 'item-edit'; STATE.editTargetId = btn.dataset.itemId; renderAll(); return true; }
  if (action === 'rf-v2-delete-item') { await removeItem(event, btn.dataset.itemId); return true; }
  if (action === 'rf-v2-extra-cancel') { claim(event); STATE.wizard = null; STATE.editTargetId = null; renderAll(); return true; }
  if (action === 'rf-v2-update-expense') { await saveExpenseEdit(event); return true; }
  if (action === 'rf-v2-update-item') { await saveItemEdit(event); return true; }
  return false;
}

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(renderExtraWritesLayer));
window.addEventListener('resize', () => requestAnimationFrame(renderExtraWritesLayer));
requestAnimationFrame(renderExtraWritesLayer);
