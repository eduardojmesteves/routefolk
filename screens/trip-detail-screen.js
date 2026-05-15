// ============================================================
// routefolk — screens/trip-detail-screen.js
// Trip Detail screen shell rendering.
// Claude Design UI reset.
// ============================================================

import { esc } from '../utils/dom.js';
import { fmtDateRange } from '../utils/datetime.js';
import { STATUS_META } from '../constants/app-constants.js';
import { visibilityPillHtml } from '../components/trip-card.js';

function routeSubtitle(trip, dateRange) {
  return trip.description || dateRange;
}

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
      <section class="card rf-card rf-hero rf-trip-detail-hero">
        <div class="rf-hero__top">
          <div>
            <button class="btn btn-secondary btn-sm rf-back-btn" id="backToTripsBtn">← Trips</button>
            <div class="rf-kicker" style="margin-top:14px;">No. ${esc(trip.status || 'route')} · ${esc(dateRange)}</div>
            <h1 class="rf-detail-title trip-detail-title">${esc(trip.title)}</h1>
            <div class="rf-hero__sub">${esc(routeSubtitle(trip, dateRange))}</div>
          </div>
          <div class="rf-trip-detail-stamps">
            <span class="status-pill rf-pill ${meta.cls}">${esc(meta.label)}</span>
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

        <div class="rf-tabs rf-detail-tabs">
          <button class="rf-tabBtn rf-detail-tab is-active" type="button">Stages</button>
          <button class="rf-tabBtn rf-detail-tab" type="button" id="summaryTripBtn">Summary</button>
          <a class="rf-tabBtn rf-detail-tab" href="#tripCostsPanel">Costs</a>
        </div>

        <div class="trip-detail-actions rf-detail-actions">
          <button class="btn btn-secondary btn-sm" id="editTripBtn"${writeDisabledAttr()}>Edit</button>
          ${canDeleteTrip(trip) ? `<button class="btn btn-danger btn-sm" id="deleteTripBtn"${writeDisabledAttr()}>Delete</button>` : ''}
        </div>
      </section>

      <section class="card rf-card rf-stages-panel">
        <div class="rf-section-head"><div><div class="rf-section-kicker">Route ledger</div><div class="card-title rf-section-title">Stages</div></div></div>
        ${renderStagesSection(trip)}
      </section>

      <section class="card rf-card rf-expenses-panel" id="tripCostsPanel">
        <div class="rf-section-head"><div><div class="rf-section-kicker">Road ledger</div><div class="card-title rf-section-title">Costs</div></div></div>
        ${renderExpensesSection(trip)}
      </section>
    </div>
  `;
}
