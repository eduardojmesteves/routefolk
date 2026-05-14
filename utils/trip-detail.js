// ============================================================
// routefolk — trip-detail.js
// Shared trip-detail helper functions.
// ============================================================

import { STATE } from '../state/app-state.js';
import { fmtDate } from './datetime.js';

export function gpxTracksForTrip(tripId) {
  const tracks = STATE.gpxByTrip[tripId];
  return Array.isArray(tracks) ? tracks : [];
}

export function stageNavigateUrl(stage) {
  return stage?.custom_route_url || stage?.gmaps_url || null;
}

export function stageRouteLabel(stage, index = 0) {
  return [stage?.start_location, stage?.end_location]
    .filter(Boolean)
    .join(' → ') || stage?.title || `Stage ${index + 1}`;
}

export function stageLabelForExpense(stage, index = 0) {
  if (!stage) return 'Whole trip';
  const date = stage.planned_date ? fmtDate(stage.planned_date) : 'No date';
  return `${stageRouteLabel(stage, index)} · ${date}`;
}

export function expenseStageMeta(expense, trip) {
  const stages = STATE.stagesByTrip[trip?.id] || [];
  const index = stages.findIndex((stage) => stage.id === expense?.stage_id);
  const stage = index >= 0 ? stages[index] : null;
  return { stage, index };
}
