
// ============================================================
// routefolk — trip-form.js
// Trip form rendering and reading helpers.
// ============================================================

import { $, esc } from '../utils/dom.js';
import { STATUS_META, VISIBILITY_META } from '../constants/app-constants.js';
import { tripVisibility } from './trip-card.js';

export function tripFormHtml(trip = {}) {
  return `
    <div class="form-row">
      <label class="form-label" for="tfTitle">Title</label>
      <input class="inp" id="tfTitle" maxlength="120" value="${esc(trip.title || '')}" placeholder="e.g. Pyrenees loop">
    </div>
    <div class="form-row">
      <label class="form-label" for="tfDesc">Description</label>
      <textarea class="txt" id="tfDesc" maxlength="2000" placeholder="Optional notes about the trip">${esc(trip.description || '')}</textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="form-row">
        <label class="form-label" for="tfStart">Start date</label>
        <input class="inp" id="tfStart" type="date" value="${esc(trip.start_date || '')}">
      </div>
      <div class="form-row">
        <label class="form-label" for="tfEnd">End date</label>
        <input class="inp" id="tfEnd" type="date" value="${esc(trip.end_date || '')}">
      </div>
    </div>
    <div class="form-row">
      <label class="form-label" for="tfStatus">Status</label>
      <select class="sel" id="tfStatus">
        ${Object.entries(STATUS_META).map(([key, m]) =>
          `<option value="${esc(key)}" ${trip.status === key ? 'selected' : ''}>${esc(m.label)}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-label">Visibility</div>
      <div class="choice-list" role="radiogroup" aria-label="Trip visibility">
        ${Object.entries(VISIBILITY_META).map(([key, m]) => `
          <label class="choice-option">
            <input type="radio" name="tfVisibility" value="${esc(key)}" ${tripVisibility(trip) === key ? 'checked' : ''}>
            <span>
              <strong>${esc(m.formLabel)}</strong>
              <small>${key === 'private' ? 'Only you can see and edit this trip.' : 'Everyone who can sign in to the app can see and edit this trip.'}</small>
            </span>
          </label>
        `).join('')}
      </div>
      <div class="form-help">This is enforced by Supabase RLS, not just hidden in the interface.</div>
    </div>
  `;
}


export function readTripForm() {
  const checkedVisibility = document.querySelector('input[name="tfVisibility"]:checked')?.value;
  return {
    title: $('tfTitle')?.value.trim() || '',
    description: $('tfDesc')?.value.trim() || '',
    start_date: $('tfStart')?.value || '',
    end_date: $('tfEnd')?.value || '',
    status: $('tfStatus')?.value || 'planning',
    visibility: checkedVisibility === 'private' ? 'private' : 'group',
  };
}

