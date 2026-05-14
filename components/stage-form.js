// ============================================================
// routefolk — stage-form.js
// Stage form rendering, reading, and validation helpers.
// ============================================================

import { $, esc, attr, boolAttr } from '../utils/dom.js';
import { fmtDate } from '../utils/datetime.js';

export function stageFormHtml(stage = {}, trip = {}) {
  const hasTripDateBounds = Boolean(trip.start_date || trip.end_date);
  const dateDisabled = !hasTripDateBounds;
  return `
    <div class="form-row">
      <label class="form-label" for="sfTitle">Stage title (optional)</label>
      <input class="inp" id="sfTitle" maxlength="120" value="${esc(stage.title || '')}" placeholder="e.g. Mountain pass day">
    </div>
    <div class="form-row">
      <label class="form-label" for="sfStartLoc">From</label>
      <input class="inp" id="sfStartLoc" maxlength="120" value="${esc(stage.start_location || '')}" placeholder="e.g. Lisbon">
    </div>
    <div class="form-row">
      <label class="form-label" for="sfEndLoc">To</label>
      <input class="inp" id="sfEndLoc" maxlength="120" value="${esc(stage.end_location || '')}" placeholder="e.g. Porto">
    </div>
    <div class="form-row">
      <label class="form-label" for="sfCustomUrl">Custom Maps URL (optional)</label>
      <input class="inp" id="sfCustomUrl" value="${esc(stage.custom_route_url || '')}" placeholder="https://maps.app.goo.gl/...">
      <div class="form-help">Plan your route in Google Maps, then paste the share link here. Leave empty for the auto-generated route.</div>
    </div>
    <details class="form-details">
      <summary>Coordinates (advanced — auto-filled from city names)</summary>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
        <div class="form-row">
          <label class="form-label" for="sfStartLat">Start lat</label>
          <input class="inp" id="sfStartLat" inputmode="decimal" value="${esc(stage.start_lat ?? '')}" placeholder="auto">
        </div>
        <div class="form-row">
          <label class="form-label" for="sfStartLng">Start lng</label>
          <input class="inp" id="sfStartLng" inputmode="decimal" value="${esc(stage.start_lng ?? '')}" placeholder="auto">
        </div>
        <div class="form-row">
          <label class="form-label" for="sfEndLat">End lat</label>
          <input class="inp" id="sfEndLat" inputmode="decimal" value="${esc(stage.end_lat ?? '')}" placeholder="auto">
        </div>
        <div class="form-row">
          <label class="form-label" for="sfEndLng">End lng</label>
          <input class="inp" id="sfEndLng" inputmode="decimal" value="${esc(stage.end_lng ?? '')}" placeholder="auto">
        </div>
      </div>
    </details>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="form-row">
        <label class="form-label" for="sfDate">Planned date</label>
        <input class="inp" id="sfDate" type="date" value="${esc(stage.planned_date || '')}"${attr('min', trip.start_date)}${attr('max', trip.end_date)}${boolAttr('disabled', dateDisabled)}>
        ${dateDisabled ? `<div class="form-help">Set the trip's start or end date first to add stage dates.</div>` : ''}
      </div>
      <div class="form-row">
        <label class="form-label" for="sfDistance">Distance (km)</label>
        <input class="inp" id="sfDistance" inputmode="decimal" value="${esc(stage.distance_km ?? '')}" placeholder="e.g. 240">
      </div>
    </div>
    <div class="form-row">
      <label class="form-label" for="sfNotes">Notes</label>
      <textarea class="txt" id="sfNotes" maxlength="2000" placeholder="Roads, stops, warnings, ideas">${esc(stage.notes || '')}</textarea>
    </div>
  `;
}

export function readStageForm() {
  const fields = {
    title: $('sfTitle')?.value.trim() || '',
    start_location: $('sfStartLoc')?.value.trim() || '',
    end_location: $('sfEndLoc')?.value.trim() || '',
    custom_route_url: $('sfCustomUrl')?.value.trim() || '',
    start_lat: $('sfStartLat')?.value.trim() || '',
    start_lng: $('sfStartLng')?.value.trim() || '',
    end_lat: $('sfEndLat')?.value.trim() || '',
    end_lng: $('sfEndLng')?.value.trim() || '',
    distance_km: $('sfDistance')?.value.trim() || '',
    notes: $('sfNotes')?.value.trim() || '',
  };

  const dateInput = $('sfDate');
  if (dateInput && !dateInput.disabled) {
    fields.planned_date = dateInput.value || '';
  }

  return fields;
}

export function validateStageFormAgainstTrip(fields, trip = {}) {
  if (!fields.planned_date) return;
  if (trip.start_date && fields.planned_date < trip.start_date) {
    throw new Error(`Stage date cannot be before the trip starts (${fmtDate(trip.start_date)}).`);
  }
  if (trip.end_date && fields.planned_date > trip.end_date) {
    throw new Error(`Stage date cannot be after the trip ends (${fmtDate(trip.end_date)}).`);
  }
}
