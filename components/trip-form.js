
// ============================================================
// routefolk — trip-form.js
// Trip form rendering and reading helpers.
// ============================================================

import { $, esc } from '../utils/dom.js';
import { STATUS_META, VISIBILITY_META } from '../constants/app-constants.js';
import { STATE } from '../state/app-state.js';
import { tripVisibility } from './trip-card.js';

function selectedTripMemberEmails(trip) {
  if (!trip?.id) return new Set();
  const rows = STATE.tripMembersByTrip[trip.id];
  if (!Array.isArray(rows)) return new Set();
  return new Set(rows.map((row) => String(row.member_email || '').toLowerCase()).filter(Boolean));
}

function memberLabel(member) {
  return member.full_name || member.email || 'Unknown member';
}

function selectedMembersHtml(trip, canManageVisibility) {
  const selected = selectedTripMemberEmails(trip);
  const currentEmail = String(STATE.user?.email || '').toLowerCase();
  const members = (STATE.selectableTripMembers || []).filter((member) => member.email && member.email !== currentEmail);
  const disabled = canManageVisibility ? '' : ' disabled';

  if (!members.length) {
    return `<div class="form-help">No other active Routefolk members are available yet. Add active app members before using selected-user visibility.</div>`;
  }

  return `
    <div class="choice-list" aria-label="Selected trip users">
      ${members.map((member) => `
        <label class="choice-option">
          <input type="checkbox" name="tfSelectedMember" value="${esc(member.email)}" ${selected.has(member.email) ? 'checked' : ''}${disabled}>
          <span>
            <strong>${esc(memberLabel(member))}</strong>
            <small>${esc(member.email)}</small>
          </span>
        </label>
      `).join('')}
    </div>
    <div class="form-help">Selected users can view and edit the whole trip. Only the trip creator can manage this list.</div>
  `;
}

export function tripFormHtml(trip = {}) {
  const visibility = tripVisibility(trip);
  const canManageVisibility = !trip.id || trip.created_by === STATE.user?.id;
  const visibilityDisabled = canManageVisibility ? '' : ' disabled';

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
            <input type="radio" name="tfVisibility" value="${esc(key)}" ${visibility === key ? 'checked' : ''}${visibilityDisabled}>
            <span>
              <strong>${esc(m.formLabel)}</strong>
              <small>${esc(m.help)}</small>
            </span>
          </label>
        `).join('')}
      </div>
      ${canManageVisibility ? '' : '<div class="form-help">Only the trip creator can change visibility.</div>'}
      <div class="form-help">This is enforced by Supabase RLS, not just hidden in the interface.</div>
    </div>
    <div class="form-row" id="tfSelectedMembersBlock"${visibility !== 'selected' ? ' hidden' : ''}>
      <div class="form-label">Selected users</div>
      ${selectedMembersHtml(trip, canManageVisibility)}
    </div>
  `;
}


export function readTripForm() {
  const checkedVisibility = document.querySelector('input[name="tfVisibility"]:checked')?.value;
  const selected_member_emails = [...document.querySelectorAll('input[name="tfSelectedMember"]:checked')]
    .map((input) => String(input.value || '').trim().toLowerCase())
    .filter(Boolean);

  return {
    title: $('tfTitle')?.value.trim() || '',
    description: $('tfDesc')?.value.trim() || '',
    start_date: $('tfStart')?.value || '',
    end_date: $('tfEnd')?.value || '',
    status: $('tfStatus')?.value || 'planning',
    visibility: checkedVisibility === 'private' ? 'private' : checkedVisibility === 'selected' ? 'selected' : 'group',
    selected_member_emails,
  };
}

document.addEventListener('change', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.name !== 'tfVisibility') return;
  const block = document.getElementById('tfSelectedMembersBlock');
  if (block) block.hidden = target.value !== 'selected';
}, true);

