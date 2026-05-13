// ============================================================
// routefolk — state/app-state.js
// Shared mutable app state. Imported by app.js during Phase 3.9A.
// ============================================================

export const STATE = {
  tab: 'trips',
  view: 'list', // list | detail | summary
  viewTripId: null,
  user: null,
  schemaVersion: null,
  schemaLoading: false,
  schemaError: null,
  trips: [],
  tripsLoading: false,
  tripsError: null,
  stagesByTrip: {},
  stagesLoading: false,
  stagesError: null,
  forecastsByStage: {},
  entriesByStage: {},          // stageId -> array of entries OR 'loading'
  expandedStages: new Set(),   // journal sections open in trip detail
  expandedGpxStages: new Set(), // GPX sections open in trip detail
  expandedSummaryStages: new Set(),
  profiles: [],                // users who have signed in at least once
  profilesById: {},
  profilesLoading: false,
  profilesError: null,
  expensesByTrip: {},       // tripId -> array of expenses OR 'loading'
  gpxByTrip: {},            // tripId -> array of GPX track records OR 'loading'
  gpxGeometryByTrack: {},   // trackId -> parsed geometry OR 'loading'
  gpxLoading: false,
  gpxError: null,
  archiveGpxLoading: false,
  archiveGpxError: null,
  expensesLoading: false,
  expensesError: null,
  tripSearch: '',
  tripStatusFilter: 'all',
  tripFiltersOpen: false,
  archiveSearch: '',
  archiveStatusFilter: 'all',
  archiveFiltersOpen: false,
  archiveViewMode: 'list', // list | map
  archiveMapLayer: 'heatmap', // heatmap | hybrid | routes
  archiveDataLoading: false,
  archiveDataError: null,
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
};
