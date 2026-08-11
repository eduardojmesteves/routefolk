// ============================================================
// routefolk — screens/render/trip-detail/summary-desktop.js
// Desktop trip summary table + summary view rendering.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import { fmtDate } from '../../../utils/datetime.js';
import {
  arr,
  fmtEuro,
  stages,
  stats,
} from '../shared.js';

export function summaryTable(trip) {
  const rows = stages(trip.id).map((stage, i) => {
    const entries = arr(STATE.entriesByStage[stage.id]);
    return `<div class="rf-clean-table-row"><span>${i + 1}</span><strong>${esc(stage.start_location || 'Start')} to ${esc(stage.end_location || 'End')}</strong><span>${esc(fmtDate(stage.planned_date) || '—')}</span><span>${Math.round(Number(stage.distance_km) || 0)} km</span><span>${esc(stage.notes || '—')}</span></div>${entries.map((entry, j) => `<div class="rf-clean-summary-entry"><span></span><strong>${j + 1}. ${esc(entry.title || 'Untitled entry')}</strong><span>${entry.timestamp ? esc(new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '—'}</span><span>${esc(entry.entry_type || 'note')}</span><span>${esc(entry.location || entry.description || 'Journal entry')}</span></div>`).join('')}`;
  }).join('');
  return `<div class="rf-clean-table"><div class="rf-clean-table-head"><span>Stage</span><span>Route / journal</span><span>Date / time</span><span>Distance / type</span><span>Notes / place</span></div>${rows || '<div class="rf-d2-empty">No stages yet.</div>'}</div>`;
}

// HANDOFF.md: "2×2 stat tile grid (Distance, Spent, Stages, Entries)"
// above the must-keep stage-by-stage table — reuses the same
// .rf-d2-stat-grid tile pattern as the trip hero's withStats option.
export function renderSummary(trip, { hero, tabs }) {
  const s = stats(trip);
  return `<main class="rf-d2-main is-wide">${hero(trip)}${tabs('summary')}<div class="rf-d2-stat-grid"><div><span>Distance</span><strong>${Math.round(s.distance).toLocaleString()}</strong><small>km recorded</small></div><div><span>Spent</span><strong>${fmtEuro(s.spent)}</strong><small>so far</small></div><div><span>Stages</span><strong>${s.stages}</strong><small>days</small></div><div><span>Entries</span><strong>${s.entries}</strong><small>journal</small></div></div>${summaryTable(trip)}</main>`;
}
