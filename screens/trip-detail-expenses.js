// ============================================================
// routefolk — screens/trip-detail-expenses.js
// Trip Detail expense rendering.
// Claude Design UI reset.
// ============================================================

import { EXPENSE_CATEGORY_META } from '../constants/app-constants.js';
import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { fmtDate } from '../utils/datetime.js';
import { fmtEuro } from '../utils/format.js';
import { displayNameForUserId } from '../utils/user.js';

export function expensesForTrip(tripId) {
  const expenses = STATE.expensesByTrip[tripId];
  return Array.isArray(expenses) ? expenses : [];
}

export function expenseTotals(expenses) {
  const byCategory = new Map();
  const byPayer = new Map();
  let total = 0;
  expenses.forEach((expense) => {
    const amount = Number(expense.amount) || 0;
    total += amount;
    byCategory.set(expense.category, (byCategory.get(expense.category) || 0) + amount);
    byPayer.set(expense.user_id, (byPayer.get(expense.user_id) || 0) + amount);
  });
  return { total, byCategory, byPayer };
}

export function renderExpensesSection(trip, options = {}) {
  const raw = STATE.expensesByTrip[trip.id];
  const writeDisabledAttr = options.writeDisabledAttr || (() => '');
  if (raw === 'loading' || (STATE.expensesLoading && raw === undefined)) return `<div class="empty-sub">Loading expenses…</div>`;
  if (STATE.expensesError) {
    return `<div class="stage-warn" style="margin-bottom:8px;">${esc(STATE.expensesError)}</div><button class="btn btn-secondary btn-sm" id="retryExpensesBtn">Retry</button>`;
  }
  const expenses = expensesForTrip(trip.id);
  const totals = expenseTotals(expenses);
  return `
    ${expenseTotalsHtml(totals)}
    <button class="btn btn-primary btn-block" id="addExpenseBtn" style="margin:12px 0;"${writeDisabledAttr()}>+ Add expense</button>
    ${expenses.length ? `<div class="expense-list">${expenses.map((e) => expenseCardHtml(e, trip, writeDisabledAttr)).join('')}</div>` : '<div class="empty-sub">No expenses yet. Add the first cost for this trip.</div>'}
  `;
}

export function expenseTotalsHtml(totals) {
  const categoryRows = [...totals.byCategory.entries()].filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]).map(([category, amount]) => {
    const meta = EXPENSE_CATEGORY_META[category] || EXPENSE_CATEGORY_META.other;
    return breakdownRowHtml(meta.label, amount, meta.icon, totals.total);
  }).join('');
  const payerRows = [...totals.byPayer.entries()].filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]).map(([userId, amount]) => breakdownRowHtml(displayNameForUserId(userId), amount, '👤', totals.total)).join('');
  return `
    <div class="expense-total-box rf-ledger">
      <div class="expense-total-label">The trip ledger</div>
      <div class="expense-total-value">${esc(fmtEuro(totals.total || 0))}</div>
    </div>
    <div class="expense-breakdowns">
      <div class="expense-breakdown"><div class="expense-breakdown-title">By category</div>${categoryRows || '<div class="empty-sub">No category totals yet.</div>'}</div>
      <div class="expense-breakdown"><div class="expense-breakdown-title">By payer</div>${payerRows || '<div class="empty-sub">No payer totals yet.</div>'}</div>
    </div>
  `;
}

function breakdownRowHtml(label, amount, icon = '', total = 0) {
  const pct = total ? Math.max(3, Math.round((Number(amount) / total) * 100)) : 0;
  return `
    <div class="expense-breakdown-row rf-row">
      <span>${icon ? `${esc(icon)} ` : ''}${esc(label)}</span>
      <strong>${esc(fmtEuro(amount))}</strong>
    </div>
    <div class="rf-rowBar" aria-hidden="true"><span style="width:${esc(String(pct))}%"></span></div>
  `;
}

function expenseCardHtml(expense, trip, writeDisabledAttr) {
  const meta = EXPENSE_CATEGORY_META[expense.category] || EXPENSE_CATEGORY_META.other;
  const payer = displayNameForUserId(expense.user_id);
  return `
    <div class="expense-card rf-listCard">
      <div class="expense-card-head">
        <div>
          <div class="expense-title">${esc(meta.icon)} ${esc(meta.label)} · ${esc(fmtEuro(expense.amount))}</div>
          <div class="expense-meta">Paid by ${esc(payer)}${expense.date ? ` · ${esc(fmtDate(expense.date))}` : ''}${expense.stage_id ? ' · Stage cost' : ' · Whole trip'}</div>
        </div>
        <div class="expense-actions">
          <button class="entry-icon-btn" data-expense-action="edit" data-id="${esc(expense.id)}" title="Edit"${writeDisabledAttr()}>✎</button>
          <button class="entry-icon-btn entry-icon-danger" data-expense-action="delete" data-id="${esc(expense.id)}" title="Delete"${writeDisabledAttr()}>✕</button>
        </div>
      </div>
      ${expense.description ? `<div class="expense-desc">${esc(expense.description)}</div>` : ''}
      ${trip ? expenseDateWarningHtml(expense, trip) : ''}
    </div>
  `;
}

function expenseDateWarningHtml(expense, trip) {
  if (!expense?.date) return '';
  if (trip.start_date && expense.date < trip.start_date) return `<div class="stage-warn">Expense date is outside the trip date range.</div>`;
  if (trip.end_date && expense.date > trip.end_date) return `<div class="stage-warn">Expense date is outside the trip date range.</div>`;
  return '';
}
