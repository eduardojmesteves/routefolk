// ============================================================
// routefolk — constants/app-constants.js
// Shared UI constants extracted from app.js.
// ============================================================

export const STATUS_META = {
  planning:  { label: 'Planning',  cls: 'status-planning'  },
  active:    { label: 'Active',    cls: 'status-active'    },
  completed: { label: 'Completed', cls: 'status-completed' },
  cancelled: { label: 'Cancelled', cls: 'status-cancelled' },
};

export const TRIPS_SCREEN_STATUSES = ['planning', 'active'];
export const ARCHIVE_SCREEN_STATUSES = ['completed', 'cancelled'];


export const VISIBILITY_META = {
  private: {
    label: 'Private',
    formLabel: 'Private — only me',
    help: 'Only you can see and edit this trip.',
    cls: 'visibility-private',
  },
  selected: {
    label: 'Selected',
    formLabel: 'Shared with selected users',
    help: 'Only selected active Routefolk members can see and edit this trip.',
    cls: 'visibility-selected',
  },
  group: {
    label: 'Everyone',
    formLabel: 'Shared with everyone',
    help: 'All active Routefolk app members can see and edit this trip.',
    cls: 'visibility-group',
  },
};

export const ENTRY_TYPE_META = {
  stop:    { label: 'Stop',    icon: '🛑' },
  meal:    { label: 'Meal',    icon: '🍽️' },
  lodging: { label: 'Lodging', icon: '🏨' },
  note:    { label: 'Note',    icon: '💬' },
  drink:   { label: 'Drink',   icon: '🍺' },
  other:   { label: 'Other',   icon: '📌' },
};


export const EXPENSE_CATEGORY_META = {
  fuel:         { label: 'Fuel',          icon: '⛽' },
  food_drinks:  { label: 'Food & drinks', icon: '🍽️' },
  lodging:      { label: 'Lodging',       icon: '🏨' },
  tolls:        { label: 'Tolls',         icon: '🛣️' },
  parking:      { label: 'Parking',       icon: '🅿️' },
  other:        { label: 'Other',         icon: '📌' },
};

// Simplified Europe country/border outlines for the archive geography view.
// These are deliberately coarse: they give geographic context without road tiles,
// labels, or external map providers. Coordinates are [longitude, latitude].
export const EUROPE_BOUNDARY_LINES = [
  // Portugal
  [[-8.67,42.15],[-8.1,41.8],[-8.8,40.0],[-9.45,38.7],[-8.98,37.0],[-7.3,37.0],[-6.9,38.2],[-7.1,39.6],[-6.8,41.0],[-6.2,41.9],[-7.0,42.1],[-8.67,42.15]],
  // Spain
  [[-9.3,43.4],[-7.0,43.6],[-3.0,43.5],[0.8,42.7],[3.2,42.3],[2.2,41.0],[0.2,40.7],[-0.3,39.0],[0.2,38.3],[-0.8,37.6],[-1.9,36.7],[-4.5,36.0],[-6.2,36.1],[-7.4,36.9],[-8.7,41.9],[-9.3,43.4]],
  // France
  [[-5.1,48.7],[-2.0,49.7],[1.6,50.9],[4.0,50.8],[7.6,49.1],[7.4,48.0],[6.2,46.2],[7.5,43.7],[5.5,43.2],[3.0,42.4],[0.8,42.7],[-1.8,43.4],[-1.6,46.0],[-5.1,48.7]],
  // United Kingdom
  [[-6.3,50.0],[-4.8,50.6],[-3.0,51.0],[-1.0,50.8],[1.7,52.1],[1.0,54.0],[-1.5,55.0],[-2.0,57.6],[-4.8,58.7],[-6.2,57.0],[-5.2,55.0],[-6.8,54.0],[-5.5,52.0],[-6.3,50.0]],
  // Ireland
  [[-10.5,51.4],[-9.0,51.4],[-7.2,52.2],[-6.0,53.4],[-6.1,55.1],[-8.2,55.3],[-10.0,54.2],[-10.5,51.4]],
  // Belgium / Netherlands rough coastline
  [[2.5,51.1],[3.4,51.4],[4.9,51.5],[5.8,53.4],[6.9,53.5],[7.2,51.8],[6.0,50.7],[4.0,50.7],[2.5,51.1]],
  // Germany / Denmark rough outline
  [[5.8,53.4],[8.0,54.9],[10.0,54.8],[12.5,54.5],[13.9,53.7],[14.9,51.0],[13.0,48.9],[10.5,47.4],[8.5,47.6],[7.6,49.1],[6.0,50.7],[7.2,51.8],[5.8,53.4]],
  // Switzerland / Austria
  [[6.0,46.2],[8.0,45.8],[10.5,46.5],[13.0,46.4],[16.5,47.7],[15.5,48.9],[13.0,48.9],[10.5,47.4],[8.5,47.6],[7.0,47.8],[6.0,46.2]],
  // Italy
  [[7.5,43.7],[8.8,44.4],[10.0,43.8],[12.0,42.2],[13.0,41.1],[14.5,40.5],[15.9,38.0],[15.6,37.0],[13.0,38.0],[12.2,40.0],[10.0,41.8],[9.0,43.8],[7.5,43.7]],
  // Northern Balkans / Adriatic context
  [[13.0,46.4],[14.5,45.5],[16.0,45.8],[18.0,44.8],[19.5,43.6],[18.5,42.5],[16.0,43.0],[14.0,44.2],[13.0,46.4]],
  // Scandinavia rough outline
  [[5.0,58.0],[8.0,58.5],[11.0,57.5],[13.0,55.5],[16.0,56.0],[18.5,59.0],[20.0,62.0],[23.5,65.0],[25.0,68.5],[21.0,70.0],[16.0,69.0],[12.0,66.0],[8.0,62.0],[5.0,58.0]],
  // Poland / Czechia / eastern context
  [[14.9,51.0],[17.0,50.7],[19.5,49.5],[23.0,50.0],[24.0,52.0],[22.5,54.0],[18.0,54.8],[14.9,51.0]],
];