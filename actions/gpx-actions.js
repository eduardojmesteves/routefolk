// ============================================================
// routefolk — actions/gpx-actions.js
// GPX domain: open the upload wizard, upload a GPX file, cancel an
// in-progress upload, and delete an attached GPX track.
//
// Upload handler logic lives here (migrated out of screens/wizards.js).
// The wizard-cancel action (rf-v2-cancel-gpx-upload) is routed straight
// to screens/wizards.js by action-router before the domain loop runs, so
// it is not handled here.
// ============================================================

import { STATE } from '../state/app-state.js';
import { uploadStageGpx, deleteGpxTrack, trackFileName } from '../lib/gpx.js';
import {
  claim,
  beginBusy,
  renderAll,
  api,
  activeTrip,
  selectedStage,
  gpxTarget,
  tracksForTrip,
  getPendingGpxFile,
  clearGpxUploadState,
  field,
  showError,
} from '../screens/wizards.js';

/** GPX upload-wizard actions (exact match) owned by this module. */
const GPX_WIZARD_ACTIONS = new Set([
  'rf-v2-open-gpx-upload',
  'rf-v2-cancel-gpx-upload',
  'rf-v2-save-gpx-upload',
]);

/** GPX track deletion action. */
const GPX_DELETE_ACTION = 'rf-v2-delete-gpx';

/**
 * Upload the captured GPX file for the current trip/stage target.
 * @param {Event} event
 */
export async function saveGpxUpload(event) {
  claim(event);
  const { tripId, stageId } = gpxTarget();
  const inputFile = field('v2-gpx-file')?.files?.[0] || null;
  const file = getPendingGpxFile() || inputFile;
  const endBusy = beginBusy(event);
  if (!endBusy) return;
  try {
    if (!tripId || !stageId) throw new Error('Trip and stage are required before uploading GPX.');
    if (!file) throw new Error('Choose a GPX file first.');
    const { record, geometry } = await uploadStageGpx({ tripId, stageId, file });
    const existing = tracksForTrip(tripId).filter((track) => track.id !== record.id);
    STATE.gpxByTrip[tripId] = [record, ...existing];
    if (geometry) STATE.gpxGeometryByTrack[record.id] = geometry;
    STATE.wizard = null;
    clearGpxUploadState();
    await api().loadGpxForTrip?.(tripId, { quiet: true });
    renderAll();
  } catch (error) {
    showError('v2-gpx-error', error);
  } finally {
    endBusy();
  }
}

/**
 * Delete an attached GPX track.
 * @param {Event} event
 * @param {string} trackId
 */
export async function removeGpxUpload(event, trackId) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const track = tracksForTrip(trip.id).find((candidate) => candidate.id === trackId);
  if (!track) return;
  if (!window.confirm(`Delete GPX track "${trackFileName(track)}"?`)) return;
  try {
    await deleteGpxTrack(track);
    STATE.gpxByTrip[trip.id] = tracksForTrip(trip.id).filter((candidate) => candidate.id !== track.id);
    delete STATE.gpxGeometryByTrack[track.id];
    renderAll();
  } catch (error) {
    window.alert(error?.message || 'Could not delete GPX track.');
  }
}

/**
 * @param {string} action
 * @returns {boolean} true if this action belongs to the GPX domain
 */
export function owns(action) {
  return GPX_WIZARD_ACTIONS.has(action) || action === GPX_DELETE_ACTION;
}

/**
 * Handle a GPX action.
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>} true if handled
 */
export async function handle(event, btn, action) {
  if (action === 'rf-v2-open-gpx-upload') {
    claim(event);
    clearGpxUploadState();
    STATE.wizard = 'gpx-upload';
    STATE.gpxUploadTarget = {
      tripId: btn.dataset.tripId || activeTrip()?.id || null,
      stageId: btn.dataset.stageId || selectedStage()?.id || null,
    };
    renderAll();
    return true;
  }
  if (action === 'rf-v2-save-gpx-upload') {
    await saveGpxUpload(event);
    return true;
  }
  if (action === GPX_DELETE_ACTION) {
    await removeGpxUpload(event, btn.dataset.trackId);
    return true;
  }
  return false;
}
