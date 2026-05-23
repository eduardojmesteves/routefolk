// ============================================================
// routefolk — screens/wizards/gpx-wizard.js
// GPX upload wizard markup plus the upload-target resolver.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import {
  activeTrip,
  selectedStage,
  stagesForTrip,
  getPendingGpxFile,
  panelHtml,
  row,
  fileInput,
} from './wizard-shared.js';

export function gpxTarget() {
  const target = STATE.gpxUploadTarget || {};
  const trip = target.tripId ? STATE.trips.find((item) => item.id === target.tripId) : activeTrip();
  const tripId = trip?.id || target.tripId || '';
  const stageId = target.stageId || selectedStage()?.id || '';
  const stage = stagesForTrip(tripId).find((item) => item.id === stageId) || selectedStage();
  return { trip, tripId, stage, stageId };
}

export function gpxUploadWizardHtml() {
  const { tripId, stage } = gpxTarget();
  const selectedFile = getPendingGpxFile()?.name || '';
  const stageLabel = stage ? `${stage.start_location || 'Start'} → ${stage.end_location || 'End'}` : 'Selected stage';
  return panelHtml({ id: 'rf-v2-gpx-upload-title', kicker: 'GPX upload', title: 'Attach a GPX track', sub: `${stageLabel}. The selected file is captured before upload so a re-render cannot wipe it.`, errorId: 'v2-gpx-error', saveAction: 'rf-v2-save-gpx-upload', saveLabel: 'Upload GPX', body: [row('v2-gpx-file', 'GPX file', `${fileInput('v2-gpx-file', `accept=".gpx,application/gpx+xml,application/xml,text/xml" data-trip-id="${esc(tripId)}"`)}<div class="rf-d2-aside-sub" id="v2-gpx-selected-file">${selectedFile ? `Selected: ${esc(selectedFile)}` : 'No file selected yet.'}</div>`)].join('') }).replace('data-action="rf-v2-cancel-wizard"', 'data-action="rf-v2-cancel-gpx-upload"');
}

/** Data signature fragment for the GPX wizard (used for host caching). */
export function gpxWizardDataSignature(modeClass) {
  const target = gpxTarget();
  return [modeClass, 'gpx-upload', target.tripId || '', target.stageId || ''].join('|');
}
