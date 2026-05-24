// ============================================================
// routefolk — screens/render/trip-detail/costs-mobile.js
// Mobile trip costs / expenses panel rendering.
// ============================================================

import { esc } from '../../../utils/dom.js';
import { fmtDate } from '../../../utils/datetime.js';
import { isArchivedTrip, writeDisabledAttr } from '../../../utils/write-guards.js';
import {
  aggregateExpense,
  categoryLabel,
  expenses,
  fmtEuro,
  payerName,
} from '../shared.js';

export function renderMobileCosts(trip, { screen, tripHeader }) {
  const rows = expenses(trip.id);
  const agg = aggregateExpense(rows);
  const archived = isArchivedTrip(trip);
  const dis = writeDisabledAttr();
  const catRows = [...agg.cat.entries()].sort((a, b) => b[1] - a[1]);
  const payerRows = [...agg.payer.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = catRows[0]?.[1] || 1;
  const maxPayer = payerRows[0]?.[1] || 1;
  const logBtn = archived ? '' : `<button data-action="rf-v2-add-expense"${dis}>+ Log expense</button>`;
  const catBreakdown = catRows.length ? `<section class="rf-clean-breakdown"><strong>By category</strong>${catRows.map(([name, amount]) => `<div class="br-row"><span>${esc(name)}</span><b>${fmtEuro(amount)}</b></div><div class="bar"><i style="width:${Math.round((amount / maxCat) * 100)}%;"></i></div>`).join('')}</section>` : '';
  const payerBreakdown = payerRows.length ? `<section class="rf-clean-breakdown is-payer"><strong>By payer</strong>${payerRows.map(([name, amount]) => `<div class="br-row"><span>${esc(name)}</span><b>${fmtEuro(amount)}</b></div><div class="bar"><i style="width:${Math.round((amount / maxPayer) * 100)}%;"></i></div>`).join('')}</section>` : '';
  return screen(`${tripHeader(trip, 'costs')}<main class="rf-clean-page"><section class="rf-clean-ledger"><div><small>The trip ledger</small><strong>${fmtEuro(agg.total)}</strong><span>${rows.length} entries</span></div>${logBtn}</section>${catBreakdown}${payerBreakdown}<h2>All entries</h2>${rows.map((expense) => `<article class="rf-clean-expense"><div><strong>${esc(categoryLabel(expense.category))}</strong><small>${esc(payerName(expense.user_id))} · ${esc(fmtDate(expense.date) || '—')}</small></div><b>${fmtEuro(expense.amount || 0)}</b>${archived ? '' : `<div class="rf-clean-actions"><button data-action="rf-v2-edit-expense" data-expense-id="${esc(expense.id)}"${dis}>Edit</button><button data-action="rf-v2-delete-expense" data-expense-id="${esc(expense.id)}"${dis}>Delete</button></div>`}</article>`).join('') || '<div class="rf-clean-empty">No costs yet.</div>'}</main>`);
}
