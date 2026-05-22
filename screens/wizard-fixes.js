// ============================================================
// routefolk — screens/wizard-fixes.js
// Stabilises v2 write flows that must not fall through to the
// legacy global action layer.
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { createEntry } from '../lib/journal.js';
import { uploadStageGpx } from '../lib/gpx.js';

const isDesktop = () => window.matchMedia('(min-width:960px)').matches;
const activeTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || (STATE.tab === 'archive' ? STATE.selectedArchiveTripId : STATE.selectedTripId))) || null;
const stagesForTrip = (tripId) => Array.isArray(STATE.stagesByTrip[tripId]) ? STATE.stagesByTrip[tripId] : [];
const entriesForStage = (stageId) => Array.isArray(STATE.entriesByStage[stageId]) ? STATE.entriesByStage[stageId] : [];
const tracksForTrip = (tripId) => Array.isArray(STATE.gpxByTrip[tripId]) ? STATE.gpxByTrip[tripId] : [];
let pendingGpxFile = null;

function api() { return window.routefolkData || {}; }

function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function selectedStage() {
  const trip = activeTrip();
  if (!trip) return null;
  return stagesForTrip(trip.id).find((stage) => stage.id === (STATE.editTargetId || STATE.selectedStageId)) || stagesForTrip(trip.id)[0] || null;
}

function renderAll() {
  api().renderAll?.();
  window.__routefolkV2Render?.();
  requestAnimationFrame(renderGpxUploadWizard);
}

function journalWizardHost() {
  return document.querySelector('.rf-v2-wizard-host[data-wizard="journal"]');
}

function wizardValue(root, id) {
  return root?.querySelector(`#${id}`)?.value?.trim() || '';
}

function showScopedError(root, id, error) {
  const node = root?.querySelector(`#${id}`) || document.getElementById(id) || root?.querySelector('.rf-v2-wizard-error');
  if (!node) return;
  node.textContent = error?.message || String(error || 'Something went wrong.');
  node.hidden = false;
}

async function saveJournalCreate(event) {
  claim(event);
  const root = journalWizardHost();
  const stage = selectedStage();
  if (!root || !stage) return;

  try {
    const time = wizardValue(root, 'v2-entry-time');
    const date = stage.planned_date || new Date().toISOString().slice(0, 10);
    const payload = {
      entry_type: wizardValue(root, 'v2-entry-type') || STATE.journalType || 'note',
      title: wizardValue(root, 'v2-entry-title'),
      location: wizardValue(root, 'v2-entry-place'),
      description: wizardValue(root, 'v2-entry-note'),
      timestamp: time ? `${date}T${time}:00` : null,
    };

    if (!payload.title && !payload.location && !payload.description) {
      throw new Error('Write a title, place, or description before saving the note.');
    }

    const entry = await createEntry(stage.id, payload);
    const existing = STATE.entriesByStage[stage.id];
    STATE.entriesByStage[stage.id] = Array.isArray(existing) ? [...existing, entry] : [entry];
    STATE.journalType = payload.entry_type;
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadEntriesForStage?.(stage.id, { quiet: true });
    renderAll();
  } catch (error) {
    showScopedError(root, 'v2-entry-create-error', error);
  }
}

function clearGpxUploadState() {
  pendingGpxFile = null;
  STATE.gpxUploadTarget = null;
}

function gpxTarget() {
  const target = STATE.gpxUploadTarget || {};
  const trip = target.tripId ? STATE.trips.find((item) => item.id === target.tripId) : activeTrip();
  const tripId = trip?.id || target.tripId || '';
  const stageId = target.stageId || selectedStage()?.id || '';
  const stage = stagesForTrip(tripId).find((item) => item.id === stageId) || selectedStage();
  return { trip, tripId, stage, stageId };
}

function gpxUploadWizardHtml({ tripId, stage }) {
  const selectedFile = pendingGpxFile?.name || '';
  const stageLabel = stage ? `${stage.start_location || 'Start'} → ${stage.end_location || 'End'}` : 'Selected stage';
  return `<aside class="rf-v2-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="rf-v2-gpx-upload-title">
    <div class="rf-v2-wizard-head">
      <div class="rf-d2-aside-kicker">GPX upload</div>
      <h2 class="rf-d2-aside-title" id="rf-v2-gpx-upload-title">Attach a GPX track</h2>
      <p class="rf-d2-aside-sub">${esc(stageLabel)}. The selected file is captured before upload so a re-render cannot wipe it.</p>
    </div>
    <div class="rf-d2-form-row">
      <label class="rf-d2-form-label" for="v2-gpx-file">GPX file</label>
      <input class="rf-d2-input" id="v2-gpx-file" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" data-trip-id="${esc(tripId)}">
      <div class="rf-d2-aside-sub" id="v2-gpx-selected-file">${selectedFile ? `Selected: ${esc(selectedFile)}` : 'No file selected yet.'}</div>
    </div>
    <div class="rf-v2-wizard-error" id="v2-gpx-error" hidden></div>
    <div class="rf-d2-form-actions">
      <button class="rf-d2-btn" data-action="rf-v2-cancel-gpx-upload" type="button">Cancel</button>
      <button class="rf-d2-btn is-primary" data-action="rf-v2-save-gpx-upload" type="button">Upload GPX</button>
    </div>
  </aside>`;
}

function renderGpxUploadWizard() {
  document.querySelectorAll('.rf-v2-gpx-wizard-host').forEach((node) => node.remove());
  if (!STATE.user || STATE.wizard !== 'gpx-upload') return;

  const { tripId, stageId, stage } = gpxTarget();
  if (!tripId || !stageId) {
    STATE.wizard = null;
    clearGpxUploadState();
    return;
  }

  const host = document.createElement('div');
  host.className = `rf-v2-wizard-host rf-v2-gpx-wizard-host ${isDesktop() ? 'is-desktop' : 'is-mobile'}`;
  host.dataset.wizard = 'gpx-upload';
  host.innerHTML = gpxUploadWizardHtml({ tripId, stage });
  document.body.appendChild(host);
}

async function saveGpxUpload(event) {
  claim(event);
  const root = document.querySelector('.rf-v2-gpx-wizard-host');
  const { tripId, stageId } = gpxTarget();
  const inputFile = root?.querySelector('#v2-gpx-file')?.files?.[0] || null;
  const file = pendingGpxFile || inputFile;

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
    showScopedError(root, 'v2-gpx-error', error);
  }
}

document.addEventListener('change', (event) => {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (input?.id !== 'v2-gpx-file') return;
  pendingGpxFile = input.files?.[0] || null;
  const label = document.getElementById('v2-gpx-selected-file');
  if (label) label.textContent = pendingGpxFile ? `Selected: ${pendingGpxFile.name}` : 'No file selected yet.';
}, true);

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action || '';

  if (action === 'rf-v2-save-journal' && STATE.wizard === 'journal') {
    await saveJournalCreate(event);
    return;
  }

  if (action === 'rf-v2-open-gpx-upload') {
    claim(event);
    pendingGpxFile = null;
    STATE.wizard = 'gpx-upload';
    STATE.gpxUploadTarget = {
      tripId: btn.dataset.tripId || activeTrip()?.id || null,
      stageId: btn.dataset.stageId || selectedStage()?.id || null,
    };
    renderAll();
    return;
  }

  if (action === 'rf-v2-cancel-gpx-upload') {
    claim(event);
    STATE.wizard = null;
    clearGpxUploadState();
    renderAll();
    return;
  }

  if (action === 'rf-v2-save-gpx-upload') {
    await saveGpxUpload(event);
  }
}, true);

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(renderGpxUploadWizard));
window.addEventListener('resize', () => requestAnimationFrame(renderGpxUploadWizard));
requestAnimationFrame(renderGpxUploadWizard);
