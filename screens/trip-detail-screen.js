// ============================================================
// routefolk — screens/trip-detail-screen.js
// Trip detail shell with 4-tab system.
// Screenshot fidelity pass.
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { fmtDateRange } from '../utils/datetime.js';
import { STATUS_META } from '../constants/app-constants.js';
import { visibilityPillHtml } from '../components/trip-card.js';

function routeSubtitle(trip, dateRange) {
  return trip.description || dateRange;
}

function activeDetailView() {
  return ['summary', 'costs', 'packing'].includes(STATE.view) ? STATE.view : 'detail';
}

function tabButtonHtml(key, label) {
  const active = activeDetailView() === key;
  return `<button class="rf-tabs__tab ${active ? 'is-active' : ''}" data-detail-tab="${esc(key)}" type="button">${esc(label)}</button>`;
}

function seasonKicker(trip) {
  const date = trip.start_date ? new Date(`${trip.start_date}T00:00:00Z`) : null;
  const year = date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : new Date().getFullYear();
  const month = date && !Number.isNaN(date.getTime()) ? date.getUTCMonth() : 2;
  const season = month <= 1 || month === 11 ? 'Winter' : month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Autumn';
  const index = Math.max(1, STATE.trips.findIndex((candidate) => candidate.id === trip.id) + 1);
  return `No. ${String(index).padStart(2, '0')} · ${season} ${year}`;
}

function routeSketchSvg(stages = []) {
  const points = stages
    .flatMap((stage) => [[stage.start_lat, stage.start_lng], [stage.end_lat, stage.end_lng]])
    .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  if (points.length < 2) {
    return `
      <div class="rf-routeSketch" aria-label="Route sketch">
        <div class="rf-routeSketch__labels"><span>Bordeaux</span><span>Barcelona</span></div>
        <svg viewBox="0 0 640 140" aria-hidden="true">
          <path d="M40 92 C 150 38, 250 118, 360 68 S 520 42, 600 82" />
          <circle cx="40" cy="92" r="5" />
          <circle cx="150" cy="74" r="5" />
          <circle cx="260" cy="66" r="5" />
          <circle cx="380" cy="64" r="5" />
          <circle cx="500" cy="66" r="5" />
          <circle cx="600" cy="82" r="5" />
        </svg>
      </div>
    `;
  }

  const minLat = Math.min(...points.map((p) => p.lat));
  const maxLat = Math.max(...points.map((p) => p.lat));
  const minLng = Math.min(...points.map((p) => p.lng));
  const maxLng = Math.max(...points.map((p) => p.lng));
  const lngSpan = maxLng - minLng || 1;
  const latSpan = maxLat - minLat || 1;
  const projected = points.map((p) => ({
    x: 34 + ((p.lng - minLng) / lngSpan) * 572,
    y: 112 - ((p.lat - minLat) / latSpan) * 84,
  }));
  const d = projected.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return `
    <div class="rf-routeSketch" aria-label="Route sketch">
      <div class="rf-routeSketch__labels"><span>${esc(stages[0]?.start_location || 'Start')}</span><span>${esc(stages[stages.length - 1]?.end_location || 'End')}</span></div>
      <svg viewBox="0 0 640 140" aria-hidden="true">
        <path d="${esc(d)}" />
        ${projected.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === 0 || i === projected.length - 1 ? 5 : 4}" />`).join('')}
      </svg>
    </div>
  `;
}

export function renderTripDetailScreen({
  currentTrip,
  tripNotFoundHtml,
  auditLineHtml,
  tripStatsStripHtml,
  renderStagesSection,
  activeContentHtml = '',
  canDeleteTrip,
  writeDisabledAttr,
}) {
  const trip = currentTrip();
  if (!trip) return tripNotFoundHtml();

  const meta = STATUS_META[trip.status] || STATUS_META.planning;
  const dateRange = fmtDateRange(trip.start_date, trip.end_date);
  const stages = STATE.stagesByTrip[trip.id] || [];
  const isStages = activeDetailView() === 'detail';

  return `
    <div class="rf-detail-shell ${isStages ? 'is-stages-view' : 'is-full-view'}">
      <div class="rf-mobile-brand" aria-hidden="true"></div>
      <section class="card rf-card rf-hero rf-trip-detail-hero">
        <div class="rf-hero__top">
          <div>
            <button class="btn btn-secondary btn-sm rf-back-btn" id="backToTripsBtn">← Trips</button>
            <div class="rf-kicker">${esc(seasonKicker(trip))}</div>
            <h1 class="rf-detail-title trip-detail-title">${esc(trip.title)}</h1>
            <div class="rf-hero__sub">${esc(routeSubtitle(trip, dateRange))}</div>
          </div>
          <div class="rf-trip-detail-stamps">
            <span class="status-pill rf-pill ${meta.cls}">${esc(meta.label)}</span>
            ${visibilityPillHtml(trip)}
          </div>
        </div>

        ${isStages ? routeSketchSvg(stages) : ''}
        ${auditLineHtml(trip)}
        <div class="summary-compact-stats">${tripStatsStripHtml(trip)}</div>

        <nav class="rf-tabs rf-detail-tabs" aria-label="Trip detail sections">
          ${tabButtonHtml('detail', 'Stages')}
          ${tabButtonHtml('summary', 'Summary')}
          ${tabButtonHtml('costs', 'Costs')}
          ${tabButtonHtml('packing', 'Items')}
        </nav>

        <div class="trip-detail-actions rf-detail-actions">
          <button class="btn btn-secondary btn-sm" id="editTripBtn"${writeDisabledAttr()}>Edit trip</button>
          ${canDeleteTrip(trip) ? `<button class="btn btn-danger btn-sm" id="deleteTripBtn"${writeDisabledAttr()}>Delete</button>` : ''}
        </div>
      </section>

      <section class="card rf-card rf-stages-panel ${isStages ? '' : 'rf-wide-panel'}">
        ${isStages ? `
          <div class="rf-section-head">
            <div class="rf-section-title">${esc(Array.isArray(stages) ? stages.length : 0)} stages · day 2 of ${esc(Array.isArray(stages) ? stages.length || 1 : 1)}</div>
            <button class="btn btn-primary btn-sm" id="addStageBtn"${writeDisabledAttr()}>+ Add stage</button>
          </div>
          ${renderStagesSection(trip)}
        ` : activeContentHtml}
      </section>
    </div>
  `;
}
