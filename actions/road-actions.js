// ============================================================
// routefolk — actions/road-actions.js
// Roads domain: add road, edit, delete, save create/update
// (including the current user's own rating and stage links).
// ============================================================

import { STATE } from '../state/app-state.js';
import { createRoad, updateRoad, deleteRoad, rateRoad, linkRoadToStage, unlinkRoadStage } from '../lib/roads.js';
import {
  claim,
  beginBusy,
  renderAll,
  api,
  selectedRoad,
  roadStageLinksForRoad,
  roadPayload,
  roadRatingValue,
  selectedStageLinkIds,
  toggleRoadStagePicker,
  addRoadStageLink,
  removeRoadStageLink,
  showError,
} from '../screens/wizards.js';

/** Wizard road actions (exact match) owned by this module. */
const ROAD_WIZARD_ACTIONS = new Set([
  'rf-add-road',
  'rf-edit-road',
  'rf-delete-road',
  'rf-save-road',
  'rf-update-road',
  'rf-road-link-stage-toggle',
  'rf-road-link-add',
  'rf-road-link-remove',
]);

/** Applies the checked stage links against a road's existing links,
 *  linking newly-checked stages and unlinking newly-unchecked ones. */
async function syncStageLinks(roadId) {
  const existing = roadStageLinksForRoad(roadId);
  const existingStageIds = new Set(existing.map((link) => link.stage_id));
  const checkedStageIds = new Set(selectedStageLinkIds());

  const toLink = [...checkedStageIds].filter((id) => !existingStageIds.has(id));
  const toUnlink = existing.filter((link) => !checkedStageIds.has(link.stage_id));

  await Promise.all([
    ...toLink.map((stageId) => linkRoadToStage(roadId, stageId)),
    ...toUnlink.map((link) => unlinkRoadStage(link.id)),
  ]);
}

/**
 * Create a road, apply the wizard's star rating and stage links.
 * @param {Event} event
 */
export async function saveRoadCreate(event) {
  claim(event);
  if (!STATE.user) return;
  const endBusy = beginBusy(event);
  if (!endBusy) return;
  try {
    const road = await createRoad(roadPayload());
    const rating = roadRatingValue();
    if (rating >= 1) await rateRoad(road.id, STATE.user.id, rating);
    await syncStageLinks(road.id);
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadMyRoads?.({ quiet: true });
    renderAll();
  } catch (error) {
    showError('road-create-error', error);
  } finally {
    endBusy();
  }
}

/**
 * Update the selected road, its rating and its stage links.
 * @param {Event} event
 */
export async function saveRoadEdit(event) {
  claim(event);
  const road = selectedRoad();
  if (!STATE.user || !road) return;
  const endBusy = beginBusy(event);
  if (!endBusy) return;
  try {
    await updateRoad(road.id, roadPayload('-edit'));
    const rating = roadRatingValue('-edit');
    if (rating >= 1) await rateRoad(road.id, STATE.user.id, rating);
    await syncStageLinks(road.id);
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadMyRoads?.({ quiet: true });
    renderAll();
  } catch (error) {
    showError('road-error', error);
  } finally {
    endBusy();
  }
}

/**
 * Delete a road by id after a confirmation prompt.
 * @param {Event} event
 * @param {string} roadId
 */
export async function removeRoad(event, roadId) {
  claim(event);
  const road = STATE.myRoads.find((candidate) => candidate.id === roadId);
  if (!road) return;
  if (!window.confirm(`Delete "${road.road_number_or_name || 'this road'}"? This removes it for the whole group.`)) return;
  await deleteRoad(road.id);
  STATE.wizard = null;
  STATE.editTargetId = null;
  await api().loadMyRoads?.({ quiet: true });
  renderAll();
}

/**
 * @param {string} action
 * @returns {boolean} true if this action belongs to the road domain
 */
export function owns(action) {
  return ROAD_WIZARD_ACTIONS.has(action);
}

/**
 * Handle a road action.
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>} true if handled
 */
export async function handle(event, btn, action) {
  if (action === 'rf-add-road') {
    claim(event);
    STATE.wizard = 'road';
    STATE.editTargetId = null;
    renderAll();
    return true;
  }
  if (action === 'rf-edit-road') {
    claim(event);
    STATE.wizard = 'road-edit';
    STATE.editTargetId = btn.dataset.roadId;
    renderAll();
    return true;
  }
  if (action === 'rf-delete-road') {
    await removeRoad(event, btn.dataset.roadId);
    return true;
  }
  if (action === 'rf-save-road') {
    await saveRoadCreate(event);
    return true;
  }
  if (action === 'rf-update-road') {
    await saveRoadEdit(event);
    return true;
  }
  if (action === 'rf-road-link-stage-toggle') {
    claim(event);
    toggleRoadStagePicker();
    return true;
  }
  if (action === 'rf-road-link-add') {
    claim(event);
    addRoadStageLink(btn.dataset.stageId);
    return true;
  }
  if (action === 'rf-road-link-remove') {
    claim(event);
    removeRoadStageLink(btn.dataset.stageId);
    return true;
  }
  return false;
}
