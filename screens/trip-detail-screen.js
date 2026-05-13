// ============================================================
// routefolk — screens/trip-detail-screen.js
// Trip Detail screen shell rendering.
//
// This first extraction keeps the heavily-coupled stage, journal,
// GPX, expense, and modal helpers in app.js. Those sections should be
// extracted in smaller follow-up slices, not all at once.
// ============================================================

import { esc } from '../utils/dom.js';
import { fmtDateRange } from '../utils/datetime.js';
import { STATUS_META } from '../constants/app-constants.js';
import { visibilityPillHtml } from '../components/trip-card.js';

export function renderTripDetailScreen({
  currentTrip,
  tripNotFoundHtml,
  auditLineHtml,
  tripStatsStripHtml,
  renderStagesSection,
  renderExpensesSection,
  canDeleteTrip,
  writeDisabledAttr,
}) {
  const trip = currentTrip();
  if (!trip) return tripNotFoundHtml();

  const meta = STATUS_META[trip.status] || STATUS_META.planning;
  return `
    <button class="btn btn-secondary btn-sm" id="backToTripsBtn" style="margin-bottom:12px;">← Back</button>

    <div class="card">
      <div class="trip-detail-head">
        <h1 class="trip-detail-title">${esc(trip.title)}</h1>
        <div class="trip-detail-pills">
          <span class="status-pill ${meta.cls}">${esc(meta.label)}</span>
          ${visibilityPillHtml(trip)}
        </div>
      </div>
      <div class="trip-detail-dates">${esc(fmtDateRange(trip.start_date, trip.end_date))}</div>
      ${trip.description ? `<div class="trip-detail-desc">${esc(trip.description)}</div>` : ''}
      ${auditLineHtml(trip)}
      ${tripStatsStripHtml(trip)}
      <div class="trip-detail-actions">
        <button class="btn btn-secondary btn-sm" id="summaryTripBtn">Summary</button>
        <button class="btn btn-secondary btn-sm" id="editTripBtn"${writeDisabledAttr()}>Edit</button>
        ${canDeleteTrip(trip) ? `<button class="btn btn-danger btn-sm" id="deleteTripBtn"${writeDisabledAttr()}>Delete</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Stages</div>
      ${renderStagesSection(trip)}
    </div>

    <div class="card">
      <div class="card-title">Expenses</div>
      ${renderExpensesSection(trip)}
    </div>
  `;
}
