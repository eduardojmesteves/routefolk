// ============================================================
// routefolk — session-reset.js
// Session-bound state reset helper.
// ============================================================

import { STATE } from './app-state.js';

export function resetSessionState(user = null) {
  STATE.user = user;
  STATE.appAccess = null;
  STATE.accessLoading = false;
  STATE.accessError = null;
  STATE.schemaVersion = null;
  STATE.schemaLoading = false;
  STATE.schemaError = null;
  STATE.trips = [];
  STATE.stagesByTrip = {};
  STATE.entriesByStage = {};
  STATE.forecastsByStage = {};
  STATE.profiles = [];
  STATE.profilesById = {};
  STATE.profilesError = null;
  STATE.expensesByTrip = {};
  STATE.expensesError = null;
  STATE.expandedStages.clear();
  STATE.expandedGpxStages.clear();
  STATE.expandedSummaryStages.clear();
  STATE.tripFiltersOpen = false;
  STATE.view = 'list';
  STATE.viewTripId = null;
}
