// ============================================================
// routefolk — screens/trip-detail-screen.js
// Trip Detail screen shell rendering.
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
  const dateRange = fmtDateRange(trip.start_date, trip.end_date);

  return `
    <div class="rf-detail-shell">
      <div class="rf-detail-back-row">
        <button class="btn btn-secondary btn-sm rf-back-btn" id="backToTripsBtn">← Trips</button>
      </div>

      <section class="card rf-card rf-map-card rf-trip-detail-hero">
        <div class="rf-trip-detail-plate">
          <div class="rf-trip-detail-main">
            <div class="rf-detail-kicker">Field route · ${esc(meta.label)}</div>
            <h1 class="trip-detail-title rf-detail-title">${esc(trip.title)}</h1>
            <div class="trip-detail-dates rf-detail-dates">${esc(dateRange)}</div>
            ${trip.description ? `<div class="trip-detail-desc rf-detail-desc">${esc(trip.description)}</div>` : ''}
          </div>
          <div class="rf-trip-detail-stamps">
            <span class="status-pill ${meta.cls} rf-pill rf-status-stamp">${esc(meta.label)}</span>
            ${visibilityPillHtml(trip)}
          </div>
        </div>

        <div class="rf-route-sketch" aria-hidden="true">
          <span class="rf-route-dot"></span>
          <span class="rf-route-line"></span>
          <span class="rf-route-mountain"></span>
          <span class="rf-route-line rf-route-line-short"></span>
          <span class="rf-route-dot rf-route-dot-end"></span>
        </div>

        ${auditLineHtml(trip)}
        ${tripStatsStripHtml(trip)}

        <div class="trip-detail-actions rf-detail-actions">
          <button class="btn btn-secondary btn-sm" id="summaryTripBtn">Summary</button>
          <button class="btn btn-secondary btn-sm" id="editTripBtn"${writeDisabledAttr()}>Edit</button>
          ${canDeleteTrip(trip) ? `<button class="btn btn-danger btn-sm" id="deleteTripBtn"${writeDisabledAttr()}>Delete</button>` : ''}
        </div>
      </section>

      <section class="card rf-card rf-ledger-card rf-stages-panel">
        <div class="rf-section-head">
          <div>
            <div class="rf-section-kicker">Route ledger</div>
            <div class="card-title rf-section-title">Stages</div>
          </div>
        </div>
        ${renderStagesSection(trip)}
      </section>

      <section class="card rf-card rf-ledger-card rf-expenses-panel">
        <div class="rf-section-head">
          <div>
            <div class="rf-section-kicker">Road ledger</div>
            <div class="card-title rf-section-title">Expenses</div>
          </div>
        </div>
        ${renderExpensesSection(trip)}
      </section>
    </div>
  `;
}
