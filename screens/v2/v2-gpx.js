// ============================================================
// routefolk — screens/v2/v2-gpx.js
// Restores GPX visibility/upload/delete inside the v2 selected
// stage detail pane. Archive map will consume this same data next.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import { fmtKm } from '../../utils/format.js';
import { uploadStageGpx, deleteGpxTrack, trackFileName } from '../../lib/gpx.js';

const activeTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || STATE.selectedTripId)) || null;
const stagesForTrip = (tripId) => Array.isArray(STATE.stagesByTrip[tripId]) ? STATE.stagesByTrip[tripId] : [];
const tracksForTrip = (tripId) => Array.isArray(STATE.gpxByTrip[tripId]) ? STATE.gpxByTrip[tripId] : [];
const activeStage = () => {
  const trip = activeTrip();
  if (!trip) return null;
  return stagesForTrip(trip.id).find((stage) => stage.id === STATE.selectedStageId) || stagesForTrip(trip.id)[0] || null;
};

function api() {
  return window.routefolkData || {};
}

function renderAll() {
  api().renderAll?.();
  window.__routefolkV2Render?.();
  requestAnimationFrame(renderGpxPanel);
}

function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function stageTracks(tripId, stageId) {
  return tracksForTrip(tripId).filter((track) => track.stage_id === stageId);
}

function removePanel() {
  document.querySelectorAll('.rf-v2-gpx-section').forEach((node) => node.remove());
}

function targetPane() {
  return document.querySelector('.rf-d2-aside, .rf-m2-aside') || document.querySelector('.rf-m2-body > div');
}

function renderGpxPanel() {
  removePanel();
  const trip = activeTrip();
  const stage = activeStage();
  if (!trip || !stage) return;
  if (!['detail', 'journal'].includes(STATE.view)) return;
  if (STATE.wizard) return;
  const target = targetPane();
  if (!target) return;

  const wrapper = document.createElement('section');
  wrapper.className = 'rf-v2-gpx-section';
  wrapper.innerHTML = gpxHtml(trip, stage);
  target.appendChild(wrapper);
}

function gpxHtml(trip, stage) {
  const raw = STATE.gpxByTrip[trip.id];
  if (raw === 'loading' || STATE.gpxLoading) {
    return `<div class="rf-d2-section-head"><div class="rf-d2-section-title">GPX tracks</div></div><div class="rf-v2-gpx-card">Loading GPX tracks…</div>`;
  }

  const tracks = stageTracks(trip.id, stage.id);
  return `
    <div class="rf-d2-section-head">
      <div class="rf-d2-section-title">GPX tracks</div>
    </div>
    <div class="rf-v2-gpx-card">
      ${STATE.gpxError ? `<div class="rf-v2-gpx-error">${esc(STATE.gpxError)}</div>` : ''}
      ${tracks.length ? tracks.map(trackRow).join('') : '<div class="rf-v2-gpx-empty">No GPX track attached to this stage yet.</div>'}
      <label class="rf-v2-gpx-upload">
        <span>Upload GPX</span>
        <input type="file" accept=".gpx,application/gpx+xml" data-action="rf-v2-upload-gpx" data-trip-id="${esc(trip.id)}" data-stage-id="${esc(stage.id)}">
      </label>
      <div class="rf-v2-gpx-help">Use GPX exports from your navigation/tracking app. These files will power the archive geography.</div>
    </div>
  `;
}

function trackRow(track) {
  const distance = Number.isFinite(Number(track.distance_km)) ? fmtKm(Number(track.distance_km)) : '—';
  const points = Number.isFinite(Number(track.point_count)) ? `${Number(track.point_count).toLocaleString()} pts` : '—';
  return `
    <div class="rf-v2-gpx-row">
      <div>
        <strong>${esc(trackFileName(track))}</strong>
        <small>${esc(distance)} · ${esc(points)}</small>
      </div>
      <button class="rf-d2-btn is-danger" data-action="rf-v2-delete-gpx" data-track-id="${esc(track.id)}" type="button">Delete</button>
    </div>
  `;
}

async function uploadGpx(input) {
  const tripId = input.dataset.tripId;
  const stageId = input.dataset.stageId;
  const file = input.files?.[0];
  if (!tripId || !stageId || !file) return;

  try {
    const { record, geometry } = await uploadStageGpx({ tripId, stageId, file });
    const existing = tracksForTrip(tripId).filter((track) => track.id !== record.id);
    STATE.gpxByTrip[tripId] = [record, ...existing];
    if (geometry) STATE.gpxGeometryByTrack[record.id] = geometry;
    renderAll();
  } catch (error) {
    window.alert(error?.message || 'Could not upload GPX file.');
  } finally {
    input.value = '';
  }
}

async function removeGpx(event, trackId) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  const track = tracksForTrip(trip.id).find((candidate) => candidate.id === trackId);
  if (!track) return;
  if (!window.confirm(`Delete GPX track “${trackFileName(track)}”?`)) return;
  try {
    await deleteGpxTrack(track);
    STATE.gpxByTrip[trip.id] = tracksForTrip(trip.id).filter((candidate) => candidate.id !== track.id);
    delete STATE.gpxGeometryByTrack[track.id];
    renderAll();
  } catch (error) {
    window.alert(error?.message || 'Could not delete GPX track.');
  }
}

document.addEventListener('change', async (event) => {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input?.dataset?.action?.endsWith('upload-gpx')) return;
  event.stopImmediatePropagation();
  await uploadGpx(input);
}, true);

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-action="rf-v2-delete-gpx"]');
  if (!btn) return;
  await removeGpx(event, btn.dataset.trackId);
}, true);

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(renderGpxPanel));
window.addEventListener('resize', () => requestAnimationFrame(renderGpxPanel));
requestAnimationFrame(renderGpxPanel);
