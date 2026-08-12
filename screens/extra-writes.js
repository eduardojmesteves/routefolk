// ============================================================
// routefolk — screens/extra-writes.js
// Expense edit/delete and item edit/delete workflows.
// Kept separate from the main renderer to avoid bloating display code.
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { updateExpense, deleteExpense } from '../lib/expenses.js';
import { deleteTripItem } from '../lib/items.js';
import { EXPENSE_CATEGORY_META } from '../constants/app-constants.js';
import { fmtDate } from '../utils/datetime.js';
import { fmtEuro } from '../utils/format.js';
import {
  narrativeShellHtml,
  narrativeSection,
  choiceCards,
  setActivePreviewBuilder,
  refreshWizardPreview,
} from './wizards/wizard-shared.js';
import { CATEGORY_OPTIONS as EXPENSE_CATEGORY_OPTIONS } from './wizards/expense-wizard.js';

const isDesktop = () => window.matchMedia('(min-width:960px)').matches;
const byId = (id) => document.getElementById(id);
const activeTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || STATE.selectedTripId)) || null;
const expensesForTrip = (tripId) => Array.isArray(STATE.expensesByTrip[tripId]) ? STATE.expensesByTrip[tripId] : [];
const itemsForTrip = (tripId) => Array.isArray(STATE.itemsByTrip[tripId]) ? STATE.itemsByTrip[tripId] : [];
const stagesForTrip = (tripId) => Array.isArray(STATE.stagesByTrip[tripId]) ? STATE.stagesByTrip[tripId] : [];

function api() {
  return window.routefolkData || {};
}

function renderAll() {
  api().renderAll?.();
  window.__routefolkWizardRender?.();
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

// Only the edit overlay (appended to <body>) needs explicit teardown; the
// inline expense/item action buttons are part of the main render and are
// rebuilt with it, so they are no longer stripped + re-injected here.
function removeLayer() {
  document.querySelectorAll('.rf-extra-host').forEach((node) => node.remove());
}

// item-edit used to render its own competing overlay here too, but that
// path was dead: rf-update-item is intercepted by actions/item-actions
// .js before it ever reaches dispatchExtraWriteAction below, so its save
// button never actually worked. Editing an item now renders solely
// through screens/wizards/item-wizard.js (wizard-host.js's system) —
// this module only sets STATE.wizard = 'item-edit' (see
// dispatchExtraWriteAction) and owns its delete flow.
function renderExtraWritesLayer() {
  removeLayer();
  if (!STATE.user || STATE.wizard !== 'expense-edit') return;

  const host = document.createElement('div');
  host.className = `rf-extra-host ${isDesktop() ? 'is-desktop' : 'is-mobile'}`;
  host.innerHTML = expenseEditWizardHtml();
  document.body.appendChild(host);
  setActivePreviewBuilder(expenseEditPreviewHtml);
  // The preview embedded in the innerHTML above was built pre-attachment,
  // so its byId() lookups returned null. Refresh now that the host (and
  // its real prefilled fields) are live in the document.
  refreshWizardPreview();
  const first = host.querySelector('input, select, textarea, button');
  if (first instanceof HTMLElement) first.focus({ preventScroll: true });
}

function option(value, label, selected) {
  return `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`;
}

/** Sticky live-preview: the actual ledger row this expense will render as. */
function expenseEditPreviewHtml() {
  const category = byId('expense-edit-category')?.value || 'other';
  const amount = byId('expense-edit-amount')?.value || '';
  const date = byId('expense-edit-date')?.value || '';
  const payerId = byId('expense-edit-payer')?.value || STATE.user?.id;
  const payer = [STATE.user, ...STATE.profiles].find((profile) => profile?.id === payerId);
  const payerLabel = payer?.full_name || payer?.email || 'Rider';
  return `<div class="rf-desktop-table-row rf-preview-card"><div>${esc(EXPENSE_CATEGORY_META[category]?.label || 'Other')}</div><div>${esc(payerLabel)}</div><div>${esc(fmtDate(date) || 'No date yet')}</div><div>${fmtEuro(Number(amount) || 0)}</div></div>`;
}

function expenseEditWizardHtml() {
  const trip = activeTrip();
  const expense = selectedExpense();
  if (!trip || !expense) return emptyWizard('No expense selected.');
  const stageOptions = ['<option value="">Whole trip</option>', ...stagesForTrip(trip.id).map((stage, index) => option(stage.id, `${index + 1}. ${stage.start_location || 'Start'} → ${stage.end_location || 'End'}`, expense.stage_id))].join('');
  const payerOptions = [STATE.user, ...STATE.profiles.filter((profile) => profile.id !== STATE.user?.id)]
    .filter(Boolean)
    .map((profile) => option(profile.id, profile.full_name || profile.email || 'Rider', expense.user_id))
    .join('');
  const sections = [
    narrativeSection('expense-edit-section-category', 'What was it for?', '', choiceCards('expense-edit-category', EXPENSE_CATEGORY_OPTIONS, expense.category || 'other')),
    narrativeSection('expense-edit-section-who', 'Who paid, and how much?', '', [
      `<div class="rf-desktop-form-row-pair"><div class="rf-desktop-form-row"><label class="rf-desktop-form-label" for="expense-edit-payer">Paid by</label><select class="rf-desktop-input" id="expense-edit-payer">${payerOptions}</select></div><div class="rf-desktop-form-row"><label class="rf-desktop-form-label" for="expense-edit-amount">Amount EUR</label><input class="rf-desktop-input" id="expense-edit-amount" inputmode="decimal" value="${esc(expense.amount ?? '')}"></div></div>`,
      `<div class="rf-desktop-form-row-pair"><div class="rf-desktop-form-row"><label class="rf-desktop-form-label" for="expense-edit-date">Date</label><input class="rf-desktop-input" id="expense-edit-date" type="date" value="${esc(expense.date || '')}"></div><div class="rf-desktop-form-row"><label class="rf-desktop-form-label" for="expense-edit-stage">Stage</label><select class="rf-desktop-input" id="expense-edit-stage">${stageOptions}</select></div></div>`,
      `<div class="rf-desktop-form-row"><label class="rf-desktop-form-label" for="expense-edit-description">Description</label><input class="rf-desktop-input" id="expense-edit-description" value="${esc(expense.description || '')}"></div>`,
    ].join('')),
  ];
  return narrativeShellHtml({
    id: 'rf-expense-edit-title',
    kicker: 'Edit expense',
    title: 'Correct the ledger',
    sub: 'Keep the cost data clean. Bad cost data is useless.',
    sections,
    previewLabel: 'Ledger preview',
    previewHtml: expenseEditPreviewHtml(),
    errorId: 'expense-edit-error',
    saveAction: 'rf-update-expense',
    saveLabel: 'Save expense',
    cancelAction: 'rf-extra-cancel',
  });
}

function emptyWizard(message) {
  return `<aside class="rf-wizard-panel"><div class="rf-wizard-head"><h2 class="rf-desktop-aside-title">Nothing selected</h2><p>${esc(message)}</p></div><button class="rf-desktop-btn" data-action="rf-extra-cancel" type="button">Close</button></aside>`;
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
      category: byId('expense-edit-category')?.value || 'other',
      amount: byId('expense-edit-amount')?.value || '',
      user_id: byId('expense-edit-payer')?.value || STATE.user?.id,
      date: byId('expense-edit-date')?.value || null,
      stage_id: byId('expense-edit-stage')?.value || null,
      description: byId('expense-edit-description')?.value?.trim() || '',
    });
    STATE.expensesByTrip[trip.id] = expensesForTrip(trip.id).map((candidate) => candidate.id === updated.id ? updated : candidate);
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadExpensesForTrip?.(trip.id, { quiet: true });
    renderAll();
  } catch (error) {
    showError('expense-edit-error', error);
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
  if (action === 'rf-edit-expense') { claim(event); STATE.wizard = 'expense-edit'; STATE.editTargetId = btn.dataset.expenseId; renderAll(); return true; }
  if (action === 'rf-delete-expense') { await removeExpense(event, btn.dataset.expenseId); return true; }
  if (action === 'rf-edit-item') { claim(event); STATE.wizard = 'item-edit'; STATE.editTargetId = btn.dataset.itemId; renderAll(); return true; }
  if (action === 'rf-delete-item') { await removeItem(event, btn.dataset.itemId); return true; }
  if (action === 'rf-extra-cancel') { claim(event); STATE.wizard = null; STATE.editTargetId = null; renderAll(); return true; }
  if (action === 'rf-update-expense') { await saveExpenseEdit(event); return true; }
  return false;
}

document.addEventListener('routefolk:wizard-render', () => requestAnimationFrame(renderExtraWritesLayer));
window.addEventListener('resize', () => requestAnimationFrame(renderExtraWritesLayer));
requestAnimationFrame(renderExtraWritesLayer);
