// ============================================================
// routefolk — actions/stage-actions.js
// Stage domain: add stage, select/open stage, edit, save and delete.
//
// Wizard stage save/edit/delete handler logic lives here (migrated out
// of screens/wizards.js). Shell-level stage actions still delegate to
// screens/app-actions.js.
// ============================================================

import { STATE } from '../state/app-state.js';
import { createStage, updateStage, deleteStage, swapStageOrder } from '../lib/stages.js';
import { dispatchAppAction } from '../screens/app-actions.js';
import {
  claim,
  renderAll,
  api,
  activeTrip,
  selectedStage,
  stagesForTrip,
  field,
  fieldValue,
  showError,
} from '../screens/wizards.js';

/** Shell-level stage actions (suffix-matched) sourced from app-actions.js. */
const STAGE_APP_SUFFIXES = [
  'add-stage',
  'select-stage',
  'open-stage',
  'save-stage',
];

/** Wizard stage actions (exact match) owned by this module. */
const STAGE_WIZARD_ACTIONS = new Set([
  'rf-v2-save-stage',
  'rf-v2-edit-stage',
  'rf-v2-delete-stage',
  'rf-v2-update-stage',
  'rf-v2-reorder-stage',
]);

/**
 * Create a new stage on the active trip from the wizard form.
 * @param {Event} event
 */
export async function saveStageCreate(event) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  try {
    const stage = await createStage(trip.id, {
      start_location: fieldValue('v2-stage-from'),
      end_location: fieldValue('v2-stage-to'),
      planned_date: field('v2-stage-date')?.value || null,
      distance_km: field('v2-stage-km')?.value || null,
      notes: fieldValue('v2-stage-notes'),
    });
    STATE.stagesByTrip[trip.id] = [...stagesForTrip(trip.id), stage];
    STATE.selectedStageId = stage.id;
    STATE.view = 'detail';
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadStagesForTrip?.(trip.id);
    renderAll();
  } catch (error) {
    showError('v2-stage-create-error', error);
  }
}

/**
 * Update the selected stage from the edit wizard form.
 * @param {Event} event
 */
export async function saveStageEdit(event) {
  claim(event);
  const stage = selectedStage();
  const trip = activeTrip();
  if (!stage || !trip) return;
  try {
    const updated = await updateStage(stage.id, {
      start_location: fieldValue('v2-stage-from-edit'),
      end_location: fieldValue('v2-stage-to-edit'),
      planned_date: field('v2-stage-date-edit')?.value || null,
      distance_km: field('v2-stage-km-edit')?.value || null,
      custom_route_url: fieldValue('v2-stage-route-edit') || null,
      notes: fieldValue('v2-stage-notes-edit'),
    });
    STATE.stagesByTrip[trip.id] = stagesForTrip(trip.id).map((candidate) => candidate.id === updated.id ? updated : candidate);
    STATE.selectedStageId = updated.id;
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadStagesForTrip?.(trip.id);
    renderAll();
  } catch (error) {
    showError('v2-stage-error', error);
  }
}

/**
 * Delete a stage by id after a confirmation prompt.
 * @param {Event} event
 * @param {string} stageId
 */
export async function removeStage(event, stageId) {
  claim(event);
  const trip = activeTrip();
  const stage = stagesForTrip(trip?.id).find((candidate) => candidate.id === stageId);
  if (!trip || !stage) return;
  if (!window.confirm(`Delete stage “${stage.start_location || 'Start'} to ${stage.end_location || 'End'}”?`)) return;
  await deleteStage(stage.id);
  STATE.stagesByTrip[trip.id] = stagesForTrip(trip.id).filter((candidate) => candidate.id !== stage.id);
  STATE.selectedStageId = stagesForTrip(trip.id)[0]?.id || null;
  STATE.wizard = null;
  STATE.editTargetId = null;
  renderAll();
}

/**
 * Swap an adjacent pair of stages via the atomic Postgres RPC.
 *
 * Optimistic: STATE.stagesByTrip[trip.id] is swapped in place and
 * re-rendered immediately. On RPC failure the original order is
 * restored and showError surfaces a friendly toast.
 *
 * @param {Event} event
 * @param {string} stageId
 * @param {'up' | 'down'} direction
 */
export async function reorderStage(event, stageId, direction) {
  claim(event);
  if (direction !== 'up' && direction !== 'down') return;
  const trip = activeTrip();
  if (!trip) return;
  const list = stagesForTrip(trip.id);
  const i = list.findIndex((candidate) => candidate.id === stageId);
  if (i < 0) return;
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;

  const swapped = list.slice();
  [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
  STATE.stagesByTrip[trip.id] = swapped;
  renderAll();

  try {
    await swapStageOrder(list[i], list[j]);
    await api().loadStagesForTrip?.(trip.id, { quiet: true });
  } catch (error) {
    STATE.stagesByTrip[trip.id] = list;
    renderAll();
    showError('v2-stage-error', error);
  }
}

/**
 * @param {string} action
 * @returns {boolean} true if this action belongs to the stage domain
 */
export function owns(action) {
  return STAGE_APP_SUFFIXES.some((suffix) => action.endsWith(suffix))
    || STAGE_WIZARD_ACTIONS.has(action);
}

/**
 * Handle a stage action.
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>} true if handled
 */
export async function handle(event, btn, action) {
  if (action === 'rf-v2-save-stage') {
    await saveStageCreate(event);
    return true;
  }
  if (action === 'rf-v2-update-stage') {
    await saveStageEdit(event);
    return true;
  }
  if (action === 'rf-v2-edit-stage') {
    claim(event);
    STATE.wizard = 'stage-edit';
    STATE.editTargetId = btn.dataset.stageId;
    renderAll();
    return true;
  }
  if (action === 'rf-v2-delete-stage') {
    await removeStage(event, btn.dataset.stageId);
    return true;
  }
  if (action === 'rf-v2-reorder-stage') {
    await reorderStage(event, btn.dataset.stageId, btn.dataset.direction);
    return true;
  }
  return dispatchAppAction(event, btn, action);
}
