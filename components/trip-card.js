// ============================================================
// routefolk — components/trip-card.js
// Shared trip-card and visibility-pill rendering helpers.
// Phase 22: design ornament and stats footer.
// ============================================================

import { STATUS_META, VISIBILITY_META } from '../constants/app-constants.js';
import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { fmtDateRange } from '../utils/datetime.js';

export function tripVisibility(trip) {
  if (trip?.visibility === 'private') return 'private';
  if (trip?.visibility === 'selected') return 'selected';
  return 'group';
}

export function visibilityPillHtml(trip) {
  const key = tripVisibility(trip);
  const meta = VISIBILITY_META[key] || VISIBILITY_META.group;
  return `<span class="visibility-pill rf-pill ${meta.cls}">${esc(meta.label)}</span>`;
}

function tripIndexLabel(index) {
  return Number.isInteger(index) ? String(index + 1).padStart(2, '0') : 'RF';
}

function tripStageStats(trip) {
  const stages = STATE.stagesByTrip[trip.id];
  const stageCount = Array.isArray(stages) ? stages.length : null;
  const stageDistance = Array.isArray(stages) ? stages.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0) : null;
  const tripDistance = Number(trip.distance_km);
  const distance = Number.isFinite(tripDistance) && tripDistance > 0 ? tripDistance : stageDistance;
  return { stageCount, distance };
}

function activeDayStamp(trip, stageCount) {
  if (trip.status !== 'active' || !stageCount) return '';
  return `<span class="rf-stamp">Day 1 / ${esc(stageCount)}</span>`;
}

export function tripCardHtml(trip, index = null, options = {}) {
  const meta = STATUS_META[trip.status] || STATUS_META.planning;
  const dates = fmtDateRange(trip.start_date, trip.end_date);
  const routeLabel = trip.description || dates;
  const indexLabel = tripIndexLabel(index);
  const compact = options.compact ? ' is-compact' : '';
  const stats = tripStageStats(trip);
  const km = stats.distance ? Math.round(stats.distance).toLocaleString() : '—';
  const stageCount = stats.stageCount ?? '—';

  return `
    <button class="rf-tripCard trip-card${compact}" type="button" data-trip-id="${esc(trip.id)}" aria-label="Open ${esc(trip.title)}">
      <div class="rf-tripCard__index" aria-hidden="true">No. ${esc(indexLabel)}</div>
      <div class="rf-tripCard__body">
        <div class="rf-tripCard__title trip-title">${esc(trip.title)}</div>
        ${routeLabel ? `<div class="rf-tripCard__sub">${esc(routeLabel)}</div>` : ''}
        <div class="rf-tripCard__meta">${esc(dates)}</div>
        <div class="rf-tripCard__pills">
          <span class="status-pill rf-pill ${meta.cls}">${esc(meta.label)}</span>
          ${visibilityPillHtml(trip)}
        </div>
        <div class="rf-ornament" aria-hidden="true"><hr><span class="rf-ornament__mark">—</span><hr></div>
        <div class="rf-tripCard__footer">
          <div class="rf-tripCard__stats">
            <div class="rf-stat rf-tripCard__stat"><div class="rf-stat__v">${esc(km)}</div><div class="rf-stat__l">kilometres</div></div>
            <div class="rf-stat rf-tripCard__stat"><div class="rf-stat__v">${esc(stageCount)}</div><div class="rf-stat__l">stages</div></div>
          </div>
          ${activeDayStamp(trip, stats.stageCount)}
        </div>
      </div>
    </button>
  `;
}
