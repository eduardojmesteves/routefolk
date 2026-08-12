// ============================================================
// routefolk — screens/render/trip-detail/costs-mobile.js
// Mobile trip costs / expenses panel rendering.
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

export function renderMobileCosts(trip, { screen, tripHeader }) {
  const rows = expenses(trip.id);
  const agg = aggregateExpense(rows);
  return screen(`${tripHeader(trip, 'costs')}<main class="rf-clean-page"><section class="rf-clean-ledger"><div><small>The trip ledger</small><strong>${fmtEuro(agg.total)}</strong><span>${rows.length} entries</span></div><button data-action="rf-add-expense">+ Log expense</button></section>${costsBreakdownHtml(agg.cat, { kind: 'category', prefix: 'rf-mobile', heading: 'By category' })}${costsBreakdownHtml(agg.payer, { kind: 'payer', prefix: 'rf-mobile', heading: 'By payer' })}<h2>All entries</h2>${rows.map((expense) => `<article class="rf-clean-expense"><div><strong>${esc(categoryLabel(expense.category))}</strong><small>${esc(payerName(expense.user_id))} · ${esc(fmtDate(expense.date) || '—')}</small></div><b>${fmtEuro(expense.amount || 0)}</b><div class="rf-clean-actions"><button data-action="rf-edit-expense" data-expense-id="${esc(expense.id)}">Edit</button><button data-action="rf-delete-expense" data-expense-id="${esc(expense.id)}">Delete</button></div></article>`).join('') || '<div class="rf-clean-empty">No costs yet.</div>'}</main>`);
}
