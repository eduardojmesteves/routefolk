
// ============================================================
// routefolk — state-selectors.js
// Shared state lookup helpers.
// ============================================================

import { STATE } from '../state/app-state.js';

export function currentTrip() {
  return STATE.trips.find((t) => t.id === STATE.viewTripId) || null;
}

export function findStageById(stageId) {
  for (const stages of Object.values(STATE.stagesByTrip)) {
    if (!Array.isArray(stages)) continue;
    const stage = stages.find((s) => s.id === stageId);
    if (stage) return stage;
  }
  return null;
}

export function findEntry(entryId) {
  for (const [stageId, entries] of Object.entries(STATE.entriesByStage)) {
    if (!Array.isArray(entries)) continue;
    const entry = entries.find((e) => e.id === entryId);
    if (entry) return { stageId, entry };
  }
  return { stageId: null, entry: null };
}


