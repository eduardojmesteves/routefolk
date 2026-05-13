// ============================================================
// routefolk — screens/summary-screen.js
// Trip Summary Review screen rendering.
// ============================================================

import { STATE } from '../state/app-state.js';
import { STATUS_META, ENTRY_TYPE_META, EXPENSE_CATEGORY_META } from '../constants/app-constants.js';
import { esc } from '../utils/dom.js';
import { fmtDate, fmtDateRange, fmtJournalWhen, isStageDateOutsideTrip, isExpenseDateOutsideTrip } from '../utils/datetime.js';
import { fmtEuro } from '../utils/format.js';
import { linkHostBadgeHtml } from '../utils/url.js';
import { displayNameForUserId } from '../utils/user.js';
import { visibilityPillHtml } from '../components/trip-card.js';

let CONTEXT = null;

export function renderTripSummary(ctx) {
  CONTEXT = ctx;
  const { currentTrip, tripNotFoundHtml, expensesForTrip, tripStatsStripHtml, expenseTotalsHtml, expenseTotals } = CONTEXT;
  const trip = currentTrip();
  if (!trip) return tripNotFoundHtml();

  const stages = STATE.stagesByTrip[trip.id] || [];
  const expenses = CONTEXT.expensesForTrip(trip.id);
  return `
    <button class="btn btn-secondary btn-sm" id="backToDetailBtn" style="margin-bottom:12px;">← Back to trip</button>

    <div class="card">
      <div class="trip-detail-head">
        <h1 class="trip-detail-title">${esc(trip.title)}</h1>
        <div class="trip-detail-pills">
          <span class="status-pill ${(STATUS_META[trip.status] || STATUS_META.planning).cls}">${esc((STATUS_META[trip.status] || STATUS_META.planning).label)}</span>
          ${visibilityPillHtml(trip)}
        </div>
      </div>
      <div class="trip-detail-dates">${esc(fmtDateRange(trip.start_date, trip.end_date))}</div>
      <div class="section-label" style="margin-top:12px;margin-bottom:8px;">Trip Summary Review</div>
      ${tripStatsStripHtml(trip)}
    </div>

    <div class="card">
      <div class="card-title">Trip cost</div>
      ${expenseTotalsHtml(expenseTotals(expenses))}
    </div>

    <div class="card">
      <div class="card-title">Summary table</div>
      ${summaryTableHtml(stages, trip)}
      ${summaryTripLevelExpensesHtml(trip)}
    </div>
  `;
}

function summaryTableHtml(stages, trip) {
  if (STATE.stagesLoading && !stages.length) return `<div class="empty-sub">Loading summary…</div>`;
  if (!stages.length) return `<div class="empty-sub">No stages yet.</div>`;

  return `
    <div class="summary-table-wrap">
      <table class="summary-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>From → To</th>
            <th>Distance</th>
            <th>Notes</th>
            <th>Journal / expenses</th>
          </tr>
        </thead>
        <tbody>
          ${stages.map((stage, index) => summaryStageRowsHtml(stage, trip, index)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function summaryStageRowsHtml(stage, trip, index) {
  const entries = STATE.entriesByStage[stage.id];
  const expenses = CONTEXT.expensesForTrip(trip.id).filter((expense) => expense.stage_id === stage.id);
  const expanded = STATE.expandedSummaryStages.has(stage.id);
  const entryCount = Array.isArray(entries) ? entries.length : (entries === 'loading' ? '…' : 0);
  const expenseCount = expenses.length;
  const warning = isStageDateOutsideTrip(stage, trip) ? `<div class="summary-warning">Outside trip dates</div>` : '';

  const main = `
    <tr class="summary-stage-row">
      <td>${stage.planned_date ? esc(fmtDate(stage.planned_date)) : '—'}${warning}</td>
      <td>${esc(CONTEXT.stageRouteLabel(stage, index))}</td>
      <td>${stage.distance_km != null ? `${esc(stage.distance_km)} km` : '—'}</td>
      <td>${stage.notes ? esc(stage.notes) : '—'}</td>
      <td>
        <button class="summary-toggle" data-summary-stage-id="${esc(stage.id)}">
          ${expanded ? '▾' : '▸'} ${esc(entryCount)} journal · ${esc(expenseCount)} expenses
        </button>
      </td>
    </tr>
  `;

  if (!expanded) return main;

  return main + `
    <tr class="summary-entry-row">
      <td colspan="5">
        <div class="summary-review-grid">
          <div>
            <div class="summary-subtitle">Journal entries</div>
            ${summaryEntriesHtml(entries)}
          </div>
          <div>
            <div class="summary-subtitle">Expenses assigned to this stage</div>
            ${summaryExpensesHtml(expenses, trip, 'No expenses assigned to this stage.')}
          </div>
        </div>
      </td>
    </tr>
  `;
}

function summaryEntriesHtml(entries) {
  if (entries === 'loading' || entries === undefined) return `<div class="empty-sub">Loading entries…</div>`;
  if (!entries.length) return `<div class="empty-sub">No journal entries for this stage.</div>`;

  return `
    <div class="summary-entry-table-wrap">
      <table class="summary-entry-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Time</th>
            <th>Title</th>
            <th>Location</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(summaryEntryRowHtml).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function summaryEntryRowHtml(entry) {
  const meta = ENTRY_TYPE_META[entry.entry_type] || ENTRY_TYPE_META.note;
  const location = entry.location_url
    ? `<a href="${esc(entry.location_url)}" target="_blank" rel="noopener">${esc(entry.location || 'Map')} ${linkHostBadgeHtml(entry.location_url)}</a>`
    : esc(entry.location || '—');
  const links = [];
  if (entry.info_url) links.push(`<a href="${esc(entry.info_url)}" target="_blank" rel="noopener">Website ${linkHostBadgeHtml(entry.info_url)}</a>`);
  if (entry.photo_album_url) links.push(`<a href="${esc(entry.photo_album_url)}" target="_blank" rel="noopener">Album ${linkHostBadgeHtml(entry.photo_album_url)}</a>`);

  return `
    <tr>
      <td>${esc(meta.icon)} ${esc(meta.label)}</td>
      <td>${entry.timestamp ? esc(fmtJournalWhen(entry.timestamp)) : '—'}</td>
      <td>${entry.title ? esc(entry.title) : '—'}${entry.description ? `<div class="summary-entry-desc">${esc(entry.description)}</div>` : ''}</td>
      <td>${location}</td>
      <td>${links.length ? links.join(' · ') : '—'}</td>
    </tr>
  `;
}

function summaryExpensesHtml(expenses, trip, emptyMessage = 'No expenses.') {
  if (!expenses.length) return `<div class="empty-sub">${esc(emptyMessage)}</div>`;
  return `
    <div class="summary-expense-list">
      ${expenses.map((expense) => summaryExpenseItemHtml(expense, trip)).join('')}
    </div>
  `;
}

function summaryExpenseItemHtml(expense, trip) {
  const meta = EXPENSE_CATEGORY_META[expense.category] || EXPENSE_CATEGORY_META.other;
  const payer = displayNameForUserId(expense.user_id);
  const warning = isExpenseDateOutsideTrip(expense, trip)
    ? `<div class="summary-warning">Expense date is outside the trip date range.</div>`
    : '';
  return `
    <div class="summary-expense-item">
      <div class="summary-expense-title">${esc(meta.icon)} ${esc(meta.label)} · ${esc(fmtEuro(expense.amount))}</div>
      <div class="summary-expense-meta">Paid by ${esc(payer)}${expense.date ? ` · ${esc(fmtDate(expense.date))}` : ''}</div>
      ${expense.description ? `<div class="summary-entry-desc">${esc(expense.description)}</div>` : ''}
      ${warning}
    </div>
  `;
}

function summaryTripLevelExpensesHtml(trip) {
  const expenses = CONTEXT.expensesForTrip(trip.id).filter((expense) => !expense.stage_id);
  if (!expenses.length) return '';
  return `
    <div class="summary-trip-expenses">
      <div class="summary-subtitle">Trip-level expenses</div>
      ${summaryExpensesHtml(expenses, trip, 'No trip-level expenses.')}
    </div>
  `;
}



export function bindSummaryEvents(root, { loadEntriesForStage, renderAll }) {
  root.querySelectorAll('[data-summary-stage-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stageId = btn.dataset.summaryStageId;
      if (STATE.expandedSummaryStages.has(stageId)) {
        STATE.expandedSummaryStages.delete(stageId);
      } else {
        STATE.expandedSummaryStages.add(stageId);
        if (!STATE.entriesByStage[stageId] || STATE.entriesByStage[stageId] === 'loading') {
          loadEntriesForStage(stageId, { quiet: true });
        }
      }
      renderAll();
    });
  });
}
