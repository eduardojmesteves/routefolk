// ============================================================
// routefolk — screens/render/trip-detail/costs-desktop.js
// Desktop trip costs / expenses panel rendering.
// ============================================================

import { esc } from '../../../utils/dom.js';
import { fmtDate } from '../../../utils/datetime.js';
import {
  aggregateExpense,
  categoryLabel,
  expenses,
  fmtEuro,
  payerName,
} from '../shared.js';
import { costsBreakdownHtml } from '../../../components/atoms/costs-breakdown.js';

function expenseRow(expense) {
  return `<div class="rf-d2-table-row"><div>${esc(categoryLabel(expense.category))}</div><div>${esc(payerName(expense.user_id))}</div><div>${esc(fmtDate(expense.date) || '')}</div><div>${fmtEuro(expense.amount || 0)}</div><div class="rf-v2-expense-actions"><button class="rf-d2-btn" data-action="rf-v2-edit-expense" data-expense-id="${esc(expense.id)}">Edit</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-expense" data-expense-id="${esc(expense.id)}">Delete</button></div></div>`;
}

export function renderCosts(trip, { hero, tabs, stamp }) {
  const ex = expenses(trip.id);
  const agg = aggregateExpense(ex);
  return `<main class="rf-d2-main">${hero(trip)}${tabs('costs')}<div class="rf-d2-ledger-hero"><div><div class="rf-d2-ledger-label">The trip ledger</div><div class="rf-d2-ledger-value">${fmtEuro(agg.total)}</div>${stamp(`${ex.length} entries`)}</div><button class="rf-d2-btn is-primary" data-action="rf-v2-add-expense" type="button">+ Log expense</button></div><div class="rf-d2-table">${ex.map(expenseRow).join('') || '<div class="rf-d2-empty">No costs yet.</div>'}</div></main><aside class="rf-d2-aside"><div class="rf-d2-section-title">By category</div>${costsBreakdownHtml(agg.cat, { kind: 'category', prefix: 'rf-d2' })}<div class="rf-d2-section-title">By payer</div>${costsBreakdownHtml(agg.payer, { kind: 'payer', prefix: 'rf-d2' })}</aside>`;
}
