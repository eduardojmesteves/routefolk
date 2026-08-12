// ============================================================
// routefolk — screens/wizards/index.js
// Barrel module for the wizard layer. Re-exports every symbol the
// action modules and the action-router import. screens/wizards.js
// re-exports from here for backward compatibility.
//
// Importing this module also boots wizard-host.js, which registers
// the document listeners and the initial wizard render.
// ============================================================

// Boot the host (registers listeners + initial render) and expose
// the cancel-action dispatcher + render-loop entry point.
export { dispatchWizardAction, renderWizardLayer } from './wizard-host.js';

// Shared helpers + selectors used across action modules.
export {
  claim,
  beginBusy,
  renderAll,
  api,
  activeTrip,
  stagesForTrip,
  expensesForTrip,
  itemsForTrip,
  tracksForTrip,
  selectedStage,
  entriesForStage,
  selectedEntry,
  selectedItem,
  selectedRoad,
  roadStageLinksForRoad,
  field,
  fieldValue,
  showError,
  clearGpxUploadState,
  getPendingGpxFile,
  setDraftTripVisibility,
} from './wizard-shared.js';

// Trip wizard — visibility helpers + write payload.
export {
  canManageTripVisibility,
  assertSelectedVisibilityHasMembers,
  tripPayload,
} from './trip-wizard.js';

// GPX wizard — upload-target resolver.
export { gpxTarget } from './gpx-wizard.js';

// Item wizard — write payload.
export { itemPayload } from './item-wizard.js';

// Road wizard — write payload + stage-link helpers.
export {
  roadPayload,
  roadRatingValue,
  selectedStageLinkIds,
  toggleRoadStagePicker,
  addRoadStageLink,
  removeRoadStageLink,
} from './road-wizard.js';
