// ============================================================
// routefolk — screens/render/trip-detail/summary-mobile.js
// Mobile trip summary and archived trip summary rendering.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import { fmtDate } from '../../../utils/datetime.js';
import {
  arr,
  fmtEuro,
  metricGrid,
  stages,
  stats,
} from '../shared.js';

function summaryCard(trip) {
  return `<div class="rf-clean-card-list">${stages(trip.id).map((stage, index) => `<article class="rf-clean-stage-card"><div class="rf-clean-row"><span>${index + 1}</span><strong>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</strong></div><div class="rf-clean-stage-meta"><span>${esc(fmtDate(stage.planned_date) || '—')}</span><span>${Math.round(Number(stage.distance_km) || 0)} km</span><span>${esc(stage.notes || '—')}</span></div>${arr(STATE.entriesByStage[stage.id]).map((entry, i) => `<div class="rf-clean-subrow"><small>${i + 1}. ${esc(entry.entry_type || 'note')}</small><b>${esc(entry.title || 'Untitled')}</b></div>`).join('')}</article>`).join('') || '<div class="rf-clean-empty">No stages yet.</div>'}</div>`;
}

function totalsGrid(trip) {
  const s = stats(trip);
  return `<h2>Totals</h2>${metricGrid([['Distance', Math.round(s.distance).toLocaleString(), 'km'], ['Spent', fmtEuro(s.spent), 'total'], ['Stages', String(s.stages), 'days'], ['Entries', String(s.entries), 'journal']])}`;
}

// HANDOFF.md: stat grid sits above the must-keep stage-by-stage table.
export function renderMobileSummary(trip, { screen, tripHeader }) {
  return screen(`${tripHeader(trip, 'summary')}<main class="rf-clean-page">${totalsGrid(trip)}${summaryCard(trip)}</main>`);
}

export function renderMobileArchiveSummary(trip, { screen, tripHeader }) {
  return screen(`${tripHeader(trip, 'summary', 'archive', true)}<main class="rf-clean-page">${totalsGrid(trip)}${summaryCard(trip)}</main>`, 'archive');
}
