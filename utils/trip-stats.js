// ============================================================
// routefolk — trip-stats.js
// Shared trip statistics helpers.
// ============================================================

import { STATE } from '../state/app-state.js';
import { fmtDateTime, inclusiveDays } from './datetime.js';
import { fmtEuro } from './format.js';
import { statItemHtml } from '../components/stats.js';

export function tripStats(trip) {
  const stages = STATE.stagesByTrip[trip.id] || [];
  const distanceValues = stages
    .map((s) => Number(s.distance_km))
    .filter((n) => Number.isFinite(n));
  const totalDistance = distanceValues.reduce((sum, n) => sum + n, 0);
  const allEntriesLoaded = stages.every((s) => Array.isArray(STATE.entriesByStage[s.id]));
  const entries = allEntriesLoaded
    ? stages.flatMap((s) => STATE.entriesByStage[s.id] || [])
    : [];
  const authors = new Set(entries.map((e) => e.author_id).filter(Boolean));
  const avg = stages.length && totalDistance ? totalDistance / stages.length : null;
  const expenses = STATE.expensesByTrip[trip.id];
  const expensesLoaded = Array.isArray(expenses);
  const totalCost = expensesLoaded ? expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) : null;

  return {
    days: inclusiveDays(trip.start_date, trip.end_date),
    stages: stages.length,
    distance: totalDistance || null,
    entries: allEntriesLoaded ? entries.length : null,
    authors: allEntriesLoaded ? authors.size : null,
    avg,
    cost: expensesLoaded ? totalCost : null,
    costLoading: !expensesLoaded,
    entriesLoading: !allEntriesLoaded && stages.length > 0,
  };
}

export function tripStatsStripHtml(trip) {
  const s = tripStats(trip);
  const entryValue = s.entriesLoading ? '…' : String(s.entries ?? 0);
  const authorValue = s.entriesLoading ? '…' : String(s.authors ?? 0);

  return `
    <div class="trip-stats" aria-label="Trip metrics">
      ${statItemHtml('Days', s.days ?? '—')}
      ${statItemHtml('Stages', s.stages)}
      ${statItemHtml('Distance', s.distance ? `${Math.round(s.distance)} km` : '—')}
      ${statItemHtml('Entries', entryValue)}
      ${statItemHtml('Authors', authorValue)}
      ${statItemHtml('Avg/stage', s.avg ? `${Math.round(s.avg)} km` : '—')}
      ${statItemHtml('Cost', s.costLoading ? '…' : (s.cost ? fmtEuro(s.cost, { compact: true }) : '—'))}
    </div>
  `;
}
