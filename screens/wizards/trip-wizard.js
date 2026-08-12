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
  row,
  input,
  narrativeShellHtml,
  narrativeSection,
  choiceCards,
} from './wizard-shared.js';
import { api } from './wizard-shared.js';
import { dateSpan } from '../render/shared.js';
import { fmtDateRange } from '../../utils/datetime.js';

let selectableMembersLoadPromise = null;
let selectableMembersLoadUserId = null;
const tripMembersLoadPromises = new Map();

// ---- Visibility helpers ---------------------------------------------
export function rememberTripVisibility(value) {
  if (value === 'private' || value === 'selected' || value === 'group') setDraftTripVisibility(value);
}

export function currentWizardVisibility() {
  const visibleValue = field('trip-visibility')?.value;
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
  return [...document.querySelectorAll('input[name="trip-selected-user"]:checked')].map((input) => String(input.value || '').trim().toLowerCase()).filter(Boolean);
}

function selectedTripUserCheckboxes(trip, disabled = false) {
  if (STATE.selectableTripMembersLoading) return '<p class="rf-desktop-aside-sub">Loading active Routefolk members…</p>';
  if (STATE.selectableTripMembersError) return `<p class="rf-desktop-aside-sub">Could not load active Routefolk members. Confirm migration 015 was applied. ${esc(STATE.selectableTripMembersError)}</p>`;
  const currentEmail = String(STATE.user?.email || '').toLowerCase();
  const selected = selectedTripMemberEmails(trip);
  selectedMemberEmailsFromWizard().forEach((email) => selected.add(email));
  const members = (STATE.selectableTripMembers || []).filter((member) => member.email && member.email !== currentEmail);
  if (!members.length) return '<p class="rf-desktop-aside-sub">No other active Routefolk members are available yet. Add another active app member before using selected-user visibility.</p>';
  return `<div class="rf-selected-users">${members.map((member) => `<label class="rf-selected-user"><input type="checkbox" name="trip-selected-user" value="${esc(member.email)}" ${selected.has(member.email) ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${esc(memberDisplayName(member))}</strong></span></label>`).join('')}<p class="rf-desktop-aside-sub">Selected users can view and edit the whole trip. Only the creator can manage this list.</p></div>`;
}

function selectedUsersRowHtml(trip, canManageVisibility, visibility) {
  const hidden = visibility === 'selected' ? '' : ' hidden';
  return `<div class="rf-desktop-form-row" id="trip-selected-users-row"${hidden}><label class="rf-desktop-form-label" for="trip-selected-users">Selected users</label><div id="trip-selected-users">${selectedTripUserCheckboxes(trip, !canManageVisibility)}</div></div>`;
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
  const node = byId('trip-selected-users');
  if (!node || (STATE.wizard !== 'trip' && STATE.wizard !== 'trip-edit')) return false;
  const trip = STATE.wizard === 'trip-edit' ? activeTrip() : null;
  node.innerHTML = selectedTripUserCheckboxes(trip, !canManageTripVisibility(trip));
  const visRow = byId('trip-selected-users-row');
  if (visRow) visRow.hidden = currentWizardVisibility() !== 'selected';
  onSignatureRefresh?.();
  return true;
}

export function syncSelectedUsersVisibility(relayout) {
  const visRow = byId('trip-selected-users-row');
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

// ---- Trip wizard markup (Route Atlas narrative pattern) --------------
// This is the reference migration for the wizard shell described in
// HANDOFF.md's "Wizard redesign pattern" — every other wizard follows
// this shape in a later phase.

const STATUS_LABELS = { planning: 'Planning', active: 'Active', completed: 'Completed', cancelled: 'Cancelled' };
const VISIBILITY_LABELS = { group: 'Everyone', selected: 'Selected users', private: 'Private' };

function durationLabel(start, end) {
  if (!start || !end) return '';
  const days = dateSpan(start, end);
  return days ? `${days} day${days === 1 ? '' : 's'} on the road` : '';
}

/** Re-renders the "N days on the road" chip next to the date fields. */
export function refreshTripDurationChip() {
  const chip = byId('trip-duration');
  if (!chip) return;
  const label = durationLabel(field('trip-start')?.value, field('trip-end')?.value);
  chip.textContent = label;
  chip.hidden = !label;
}

/** Sticky live-preview: the actual Trips-list card this trip will render as. */
export function tripPreviewHtml() {
  const title = fieldValue('trip-title') || 'Untitled trip';
  const desc = fieldValue('trip-desc');
  const start = field('trip-start')?.value || '';
  const end = field('trip-end')?.value || '';
  const status = field('trip-status')?.value || 'planning';
  const visibility = field('trip-visibility')?.value || 'group';
  const dateLabel = start || end ? fmtDateRange(start, end) : 'Planned for later';
  return `<div class="rf-desktop-trip-row rf-preview-card"><div class="rf-desktop-trip-row-no">No. --</div><div class="rf-desktop-trip-row-title">${esc(title)}</div><div class="rf-desktop-trip-row-sub">${esc(desc || dateLabel)}</div><div class="rf-desktop-trip-row-meta"><span>${esc(dateLabel)}</span></div><span class="rf-desktop-state-pill is-${esc(status)}"><span class="rf-desktop-state-dot"></span>${esc(STATUS_LABELS[status] || 'Planning')}</span><span class="rf-desktop-stamp is-accent">${esc(VISIBILITY_LABELS[visibility] || 'Everyone')}</span></div>`;
}

export function tripWizardHtml(editing = false) {
  const trip = editing ? activeTrip() : null;
  const visibility = currentWizardVisibility();
  const canManageVisibility = canManageTripVisibility(trip);
  const status = trip?.status || 'planning';

  const sections = [
    narrativeSection('trip-section-name', 'What should we call it?', '', [
      row('trip-title', 'Title', input('trip-title', trip?.title || '', 'placeholder="e.g. Pyrenees Crossing"')),
      row('trip-desc', 'Subtitle / short description', input('trip-desc', trip?.description || '', 'placeholder="Bordeaux to Barcelona"')),
    ].join('')),
    narrativeSection('trip-section-when', 'When does it roll?', '', [
      `<div class="rf-desktop-form-row-pair">${row('trip-start', 'Start', input('trip-start', trip?.start_date || '', 'type="date"'))}${row('trip-end', 'End', input('trip-end', trip?.end_date || '', 'type="date"'))}</div>`,
      `<p class="rf-duration-chip" id="trip-duration" ${durationLabel(trip?.start_date, trip?.end_date) ? '' : 'hidden'}>${esc(durationLabel(trip?.start_date, trip?.end_date))}</p>`,
    ].join('')),
    narrativeSection('trip-section-status', "Where's it at?", '', choiceCards('trip-status', [
      { value: 'planning', label: 'Planning', description: 'Still coming together', tone: 'info' },
      { value: 'active', label: 'Active', description: 'On the road right now', tone: 'primary' },
      // Completed/cancelled only make sense for a trip that already
      // exists — a brand-new trip can't be born finished. Both lock the
      // trip from further stage/journal/expense edits on save (see
      // canWriteToTrip() in screens/render/shared.js) and move it into
      // the Archive, so they're edit-only, never offered at creation.
      ...(editing ? [
        { value: 'completed', label: 'Completed', description: 'Wrapped up — moves to the archive', tone: 'accent' },
        { value: 'cancelled', label: 'Cancelled', description: "Called off — moves to the archive", tone: 'muted' },
      ] : []),
    ], status)),
    narrativeSection('trip-section-who', "Who's riding along?", '', [
      choiceCards('trip-visibility', [
        { value: 'group', label: 'Everyone', description: 'Visible to every active member', tone: 'accent' },
        { value: 'selected', label: 'Selected users', description: 'Only the riders you pick', tone: 'info' },
        { value: 'private', label: 'Private', description: 'Visible only to you', tone: 'muted' },
      ], visibility, { disabled: !canManageVisibility }),
      selectedUsersRowHtml(trip, canManageVisibility, visibility),
    ].join('')),
  ];

  return narrativeShellHtml({
    id: 'rf-trip-title',
    kicker: editing ? 'Edit trip' : 'New trip',
    title: editing ? 'Edit road journal' : 'Plan a road journal',
    sub: 'Stages, costs, GPX and notes stay attached to this trip.',
    sections,
    previewLabel: 'Trips list preview',
    previewHtml: tripPreviewHtml(),
    errorId: 'trip-error',
    saveAction: editing ? 'rf-update-trip' : 'rf-save-trip',
    saveLabel: editing ? 'Save changes' : 'Create trip',
  });
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
    title: fieldValue('trip-title'),
    description: fieldValue('trip-desc'),
    start_date: field('trip-start')?.value || null,
    end_date: field('trip-end')?.value || null,
    status: field('trip-status')?.value || 'planning',
    visibility: field('trip-visibility')?.value || activeTrip()?.visibility || 'group',
    selected_member_emails: selectedMemberEmailsFromWizard(),
  };
}
