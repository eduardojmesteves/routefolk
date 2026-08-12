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
  return `<div class="rf-desktop-table-row"><div>${esc(categoryLabel(expense.category))}</div><div>${esc(payerName(expense.user_id))}</div><div>${esc(fmtDate(expense.date) || '')}</div><div>${fmtEuro(expense.amount || 0)}</div><div class="rf-expense-actions"><button class="rf-desktop-btn" data-action="rf-edit-expense" data-expense-id="${esc(expense.id)}">Edit</button><button class="rf-desktop-btn is-danger" data-action="rf-delete-expense" data-expense-id="${esc(expense.id)}">Delete</button></div></div>`;
}

export function renderCosts(trip, { hero, tabs, stamp }) {
  const ex = expenses(trip.id);
  const agg = aggregateExpense(ex);
  const catCard = costsBreakdownHtml(agg.cat, { kind: 'category', prefix: 'rf-desktop' });
  const payerCard = costsBreakdownHtml(agg.payer, { kind: 'payer', prefix: 'rf-desktop' });
  return `<main class="rf-desktop-main">${hero(trip)}${tabs('costs')}<div class="rf-desktop-ledger-hero"><div><div class="rf-desktop-ledger-label">The trip ledger</div><div class="rf-desktop-ledger-value">${fmtEuro(agg.total)}</div>${stamp(`${ex.length} entries`)}</div><button class="rf-desktop-btn is-primary" data-action="rf-add-expense" type="button">+ Log expense</button></div><div class="rf-desktop-costs-breakdown-row">${catCard ? `<div><div class="rf-desktop-ledger-label">By category</div>${catCard}</div>` : ''}${payerCard ? `<div><div class="rf-desktop-ledger-label">By payer</div>${payerCard}</div>` : ''}</div><div class="rf-desktop-table">${ex.map(expenseRow).join('') || '<div class="rf-desktop-empty">No costs yet.</div>'}</div></main>`;
}
