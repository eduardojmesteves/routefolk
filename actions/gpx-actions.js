// ============================================================
// routefolk — actions/gpx-actions.js
// GPX domain: open the upload wizard, upload a GPX file, cancel an
// in-progress upload, and delete an attached GPX track.
//
// Task 4.2 wrapper: upload-wizard flows delegate to
// screens/wizards.js; track deletion delegates to
// screens/gpx-panel.js. Task 4.9 will move the logic here.
// ============================================================

import { dispatchWizardAction } from '../screens/wizards.js';
import { removeGpx } from '../screens/gpx-panel.js';

/** GPX upload-wizard actions (exact match) sourced from wizards.js. */
const GPX_WIZARD_ACTIONS = new Set([
  'rf-v2-open-gpx-upload',
  'rf-v2-cancel-gpx-upload',
  'rf-v2-save-gpx-upload',
]);

/** GPX track deletion action sourced from gpx-panel.js. */
const GPX_DELETE_ACTION = 'rf-v2-delete-gpx';

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
  if (GPX_WIZARD_ACTIONS.has(action)) {
    return dispatchWizardAction(event, btn, action);
  }
  if (action === GPX_DELETE_ACTION) {
    await removeGpx(event, btn.dataset.trackId);
    return true;
  }
  return false;
}
