// ============================================================
// routefolk — screens/wizards/trip-wizard.js
// Trip create/edit wizard markup plus the selected-user
// visibility UI (member checkboxes, visibility row sync).
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import {
  activeTrip,
  byId,
  field,
  fieldValue,
  getDraftTripVisibility,
  setDraftTripVisibility,
  panelHtml,
  row,
  pair,
  input,
  select,
  option,
} from './wizard-shared.js';
import { api } from './wizard-shared.js';

let selectableMembersLoadPromise = null;
let selectableMembersLoadUserId = null;
const tripMembersLoadPromises = new Map();

// ---- Visibility helpers ---------------------------------------------
export function rememberTripVisibility(value) {
  if (value === 'private' || value === 'selected' || value === 'group') setDraftTripVisibility(value);
}

export function currentWizardVisibility() {
  const visibleValue = field('v2-trip-visibility')?.value;
  if (visibleValue === 'private' || visibleValue === 'selected' || visibleValue === 'group') return visibleValue;
  const draft = getDraftTripVisibility();
  if (draft === 'private' || draft === 'selected' || draft === 'group') return draft;
  return activeTrip()?.visibility || 'group';
}

export function canManageTripVisibility(trip) { return !trip?.id || trip.created_by === STATE.user?.id; }

function selectedTripMemberEmails(trip) {
  if (!trip?.id) return new Set();
  const rows = STATE.tripMembersByTrip[trip.id];
  if (!Array.isArray(rows)) return new Set();
  return new Set(rows.map((row) => String(row.member_email || '').toLowerCase()).filter(Boolean));
}

function memberDisplayName(member) {
  const explicitName = String(member?.full_name || '').trim();
  if (explicitName) return explicitName;
  const emailName = String(member?.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  return emailName || 'Routefolk member';
}

export function selectedMemberEmailsFromWizard() {
  return [...document.querySelectorAll('input[name="v2-trip-selected-user"]:checked')].map((input) => String(input.value || '').trim().toLowerCase()).filter(Boolean);
}

function selectedTripUserCheckboxes(trip, disabled = false) {
  if (STATE.selectableTripMembersLoading) return '<p class="rf-d2-aside-sub">Loading active Routefolk members…</p>';
  if (STATE.selectableTripMembersError) return `<p class="rf-d2-aside-sub">Could not load active Routefolk members. Confirm migration 015 was applied. ${esc(STATE.selectableTripMembersError)}</p>`;
  const currentEmail = String(STATE.user?.email || '').toLowerCase();
  const selected = selectedTripMemberEmails(trip);
  selectedMemberEmailsFromWizard().forEach((email) => selected.add(email));
  const members = (STATE.selectableTripMembers || []).filter((member) => member.email && member.email !== currentEmail);
  if (!members.length) return '<p class="rf-d2-aside-sub">No other active Routefolk members are available yet. Add another active app member before using selected-user visibility.</p>';
  return `<div class="rf-v2-selected-users">${members.map((member) => `<label class="rf-v2-selected-user"><input type="checkbox" name="v2-trip-selected-user" value="${esc(member.email)}" ${selected.has(member.email) ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${esc(memberDisplayName(member))}</strong></span></label>`).join('')}<p class="rf-d2-aside-sub">Selected users can view and edit the whole trip. Only the creator can manage this list.</p></div>`;
}

function selectedUsersRowHtml(trip, canManageVisibility, visibility) {
  const hidden = visibility === 'selected' ? '' : ' hidden';
  return `<div class="rf-d2-form-row" id="v2-trip-selected-users-row"${hidden}><label class="rf-d2-form-label" for="v2-trip-selected-users">Selected users</label><div id="v2-trip-selected-users">${selectedTripUserCheckboxes(trip, !canManageVisibility)}</div></div>`;
}

// The host injects this so an in-place control refresh can re-stamp the
// host signature (preserving the original wizardDataSignature behaviour).
let onSignatureRefresh = null;
/** Registered once by wizard-host so trip-wizard can re-stamp the host. */
export function setSignatureRefreshHandler(handler) { onSignatureRefresh = handler; }

// ---- Visibility data preload + control refresh ----------------------
export function preloadVisibilityDataForWizard(relayout) {
  if (STATE.wizard !== 'trip' && STATE.wizard !== 'trip-edit') return;
  const trip = STATE.wizard === 'trip-edit' ? activeTrip() : null;
  const currentUserId = STATE.user?.id || '';

  if (selectableMembersLoadUserId !== currentUserId) {
    selectableMembersLoadUserId = currentUserId;
    selectableMembersLoadPromise = null;
  }

  if (!STATE.selectableTripMembers.length && !STATE.selectableTripMembersLoading && !STATE.selectableTripMembersError && !selectableMembersLoadPromise) {
    selectableMembersLoadPromise = Promise.resolve(api().loadSelectableTripMembers?.({ quiet: true }));
    selectableMembersLoadPromise.finally(() => {
      selectableMembersLoadPromise = null;
      if (!refreshTripSelectedUsersControl()) relayout?.();
    });
  }

  if (trip?.id && !Array.isArray(STATE.tripMembersByTrip[trip.id]) && !STATE.tripMembersLoadingByTrip[trip.id] && !tripMembersLoadPromises.has(trip.id)) {
    const promise = Promise.resolve(api().loadTripMembersForTrip?.(trip.id, { quiet: true }));
    tripMembersLoadPromises.set(trip.id, promise);
    promise.finally(() => {
      tripMembersLoadPromises.delete(trip.id);
      if (!refreshTripSelectedUsersControl()) relayout?.();
    });
  }
}

/**
 * Re-render the selected-users checkbox control in place, then ask the
 * host to re-stamp its data signature so a later render-loop pass does
 * not throw the freshly-loaded control away.
 */
export function refreshTripSelectedUsersControl() {
  const node = byId('v2-trip-selected-users');
  if (!node || (STATE.wizard !== 'trip' && STATE.wizard !== 'trip-edit')) return false;
  const trip = STATE.wizard === 'trip-edit' ? activeTrip() : null;
  node.innerHTML = selectedTripUserCheckboxes(trip, !canManageTripVisibility(trip));
  const visRow = byId('v2-trip-selected-users-row');
  if (visRow) visRow.hidden = currentWizardVisibility() !== 'selected';
  onSignatureRefresh?.();
  return true;
}

export function syncSelectedUsersVisibility(relayout) {
  const visRow = byId('v2-trip-selected-users-row');
  if (!visRow || (STATE.wizard !== 'trip' && STATE.wizard !== 'trip-edit')) return false;
  const isSelected = currentWizardVisibility() === 'selected';
  visRow.hidden = !isSelected;
  if (isSelected) preloadVisibilityDataForWizard(relayout);
  return true;
}

/** Data signature fragment for the trip wizard (used for host caching). */
export function tripWizardDataSignature(modeClass, targetKey) {
  const trip = STATE.wizard === 'trip-edit' ? activeTrip() : null;
  const selectable = (STATE.selectableTripMembers || []).map((member) => `${member.email}:${member.full_name || ''}`).join(',');
  const selectedRows = trip?.id && Array.isArray(STATE.tripMembersByTrip[trip.id])
    ? STATE.tripMembersByTrip[trip.id].map((row) => row.member_email).join(',')
    : '';
  return [modeClass, targetKey, currentWizardVisibility(), STATE.selectableTripMembersLoading ? 'members-loading' : 'members-ready', STATE.selectableTripMembersError || '', selectable, trip?.id || '', trip?.id && STATE.tripMembersLoadingByTrip[trip.id] ? 'trip-members-loading' : 'trip-members-ready', selectedRows].join('|');
}

// ---- Trip wizard markup ---------------------------------------------
export function tripWizardHtml(editing = false) {
  const trip = editing ? activeTrip() : null;
  const visibility = currentWizardVisibility();
  const canManageVisibility = canManageTripVisibility(trip);
  const visibilityAttrs = canManageVisibility ? '' : 'disabled';
  return panelHtml({ id: 'rf-v2-trip-title', kicker: editing ? 'Edit trip' : 'New trip', title: editing ? 'Edit road journal' : 'Plan a road journal', sub: 'Stages, costs, GPX and notes stay attached to this trip.', errorId: 'v2-trip-error', saveAction: editing ? 'rf-v2-update-trip' : 'rf-v2-save-trip', saveLabel: editing ? 'Save changes' : 'Create trip', body: [row('v2-trip-title', 'Title', input('v2-trip-title', trip?.title || '', 'placeholder="e.g. Pyrenees Crossing"')), row('v2-trip-desc', 'Subtitle / short description', input('v2-trip-desc', trip?.description || '', 'placeholder="Bordeaux to Barcelona"')), pair(row('v2-trip-start', 'Start', input('v2-trip-start', trip?.start_date || '', 'type="date"')), row('v2-trip-end', 'End', input('v2-trip-end', trip?.end_date || '', 'type="date"'))), pair(row('v2-trip-status', 'Status', select('v2-trip-status', `${option('planning', 'Planning', trip?.status)}${option('active', 'Active', trip?.status)}${option('completed', 'Completed', trip?.status)}${option('cancelled', 'Cancelled', trip?.status)}`)), row('v2-trip-visibility', 'Visibility', select('v2-trip-visibility', `${option('group', 'Shared with everyone', visibility)}${option('selected', 'Shared with selected users', visibility)}${option('private', 'Private', visibility)}`, visibilityAttrs))), selectedUsersRowHtml(trip, canManageVisibility, visibility)].join('') });
}

// ---- Trip write payload helpers (used by actions/trip-actions.js) ----
export function assertSelectedVisibilityHasMembers(payload) {
  if (payload.visibility !== 'selected') return;
  if (STATE.selectableTripMembersLoading) throw new Error('Wait for active Routefolk members to finish loading before saving.');
  if (STATE.selectableTripMembersError) throw new Error('Could not load active Routefolk members. Confirm migration 015 was applied.');
  if (!payload.selected_member_emails.length) throw new Error('Selected-users visibility requires at least one selected user.');
}

export function tripPayload() {
  return {
    title: fieldValue('v2-trip-title'),
    description: fieldValue('v2-trip-desc'),
    start_date: field('v2-trip-start')?.value || null,
    end_date: field('v2-trip-end')?.value || null,
    status: field('v2-trip-status')?.value || 'planning',
    visibility: field('v2-trip-visibility')?.value || activeTrip()?.visibility || 'group',
    selected_member_emails: selectedMemberEmailsFromWizard(),
  };
}
