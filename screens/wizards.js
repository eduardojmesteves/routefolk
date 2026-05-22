// ============================================================
// routefolk — screens/wizards.js
// Production wizard layer for write workflows not yet owned by the
// pure renderer. Keeps legacy modals out of the redesigned UI.
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { createTrip, updateTrip, deleteTrip } from '../lib/trips.js';
import { replaceTripMembers } from '../lib/trip-members.js';
import { createStage, updateStage, deleteStage } from '../lib/stages.js';
import { createEntry, updateEntry, deleteEntry } from '../lib/journal.js';
import { createExpense } from '../lib/expenses.js';
import { uploadStageGpx } from '../lib/gpx.js';
import { createTripItem, updateTripItem } from '../lib/items.js';
import { EXPENSE_CATEGORY_META } from '../constants/app-constants.js';
import { rememberArchiveContext, rememberTripContext } from '../state/ui-state.js';

const WIZARDS = new Set(['trip', 'trip-edit', 'stage', 'stage-edit', 'journal', 'journal-edit', 'gpx-upload', 'expense', 'item', 'item-edit']);
const isDesktop = () => window.matchMedia('(min-width:960px)').matches;
const byId = (id) => document.getElementById(id);
const activeTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || (STATE.tab === 'archive' ? STATE.selectedArchiveTripId : STATE.selectedTripId))) || null;
const stagesForTrip = (tripId) => Array.isArray(STATE.stagesByTrip[tripId]) ? STATE.stagesByTrip[tripId] : [];
const expensesForTrip = (tripId) => Array.isArray(STATE.expensesByTrip[tripId]) ? STATE.expensesByTrip[tripId] : [];
const categoriesForTrip = (tripId) => Array.isArray(STATE.itemCategoriesByTrip[tripId]) ? STATE.itemCategoriesByTrip[tripId] : [];
const itemsForTrip = (tripId) => Array.isArray(STATE.itemsByTrip[tripId]) ? STATE.itemsByTrip[tripId] : [];
const tracksForTrip = (tripId) => Array.isArray(STATE.gpxByTrip[tripId]) ? STATE.gpxByTrip[tripId] : [];
let selectableMembersLoadPromise = null;
let selectableMembersLoadUserId = null;
let draftTripVisibility = null;
let pendingGpxFile = null;
const tripMembersLoadPromises = new Map();

const selectedStage = () => {
  const trip = activeTrip();
  if (!trip) return null;
  return stagesForTrip(trip.id).find((stage) => stage.id === (STATE.editTargetId || STATE.selectedStageId)) || stagesForTrip(trip.id)[0] || null;
};
const entriesForStage = (stageId) => Array.isArray(STATE.entriesByStage[stageId]) ? STATE.entriesByStage[stageId] : [];
const selectedEntry = () => {
  const stage = selectedStage();
  if (!stage) return null;
  return entriesForStage(stage.id).find((entry) => entry.id === STATE.editTargetId) || null;
};
const selectedItem = () => {
  const trip = activeTrip();
  if (!trip) return null;
  return itemsForTrip(trip.id).find((item) => item.id === STATE.editTargetId) || null;
};

function api() { return window.routefolkData || {}; }

function renderAll() {
  api().renderAll?.();
  window.__routefolkV2Render?.();
  requestAnimationFrame(renderWizardLayer);
}

function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function wizardHost() {
  return document.querySelector('.rf-v2-wizard-host');
}

function field(id) {
  return wizardHost()?.querySelector(`#${CSS.escape(id)}`) || byId(id);
}

function fieldValue(id) {
  return field(id)?.value?.trim() || '';
}

function removeExisting() {
  document.querySelectorAll('.rf-v2-wizard-host, .rf-v2-cost-cta, .rf-v2-hero-actions, .rf-v2-stage-actions, .rf-v2-entry-actions').forEach((node) => node.remove());
}

function injectTripActions() {
  const trip = activeTrip();
  if (!trip || !STATE.viewTripId || STATE.wizard) return;
  if (!['trips', 'archive'].includes(STATE.tab)) return;
  const target = document.querySelector('.rf-d2-hero .rf-d2-hero-stamps, .rf-clean-trip-head .rf-clean-stamps, .rf-m2-detail-hero');
  if (!target || target.querySelector('.rf-v2-hero-actions')) return;
  const wrap = document.createElement('div');
  wrap.className = 'rf-v2-hero-actions';
  wrap.innerHTML = `<button class="rf-d2-btn" data-action="rf-v2-edit-trip" type="button">Edit trip</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-trip" type="button">Delete</button>`;
  target.appendChild(wrap);
}

function injectStageActions() {
  const stage = selectedStage();
  if (!stage || STATE.wizard || STATE.view !== 'detail') return;
  const target = document.querySelector('.rf-d2-aside-head, .rf-m2-aside-head');
  if (!target || target.querySelector('.rf-v2-stage-actions')) return;
  const wrap = document.createElement('div');
  wrap.className = 'rf-v2-stage-actions';
  wrap.innerHTML = `<button class="rf-d2-btn" data-action="rf-v2-edit-stage" data-stage-id="${esc(stage.id)}" type="button">Edit stage</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-stage" data-stage-id="${esc(stage.id)}" type="button">Delete</button>`;
  target.appendChild(wrap);
}

function injectEntryActions() {
  if (STATE.wizard) return;
  document.querySelectorAll('.rf-d2-entry, .rf-m2-entry').forEach((entryNode) => {
    if (entryNode.querySelector('.rf-v2-entry-actions')) return;
    const title = entryNode.querySelector('.rf-d2-entry-title, .rf-m2-entry-title')?.textContent?.trim();
    const stage = selectedStage();
    const entry = stage ? entriesForStage(stage.id).find((candidate) => (candidate.title || 'Untitled') === title) : null;
    if (!entry) return;
    const wrap = document.createElement('div');
    wrap.className = 'rf-v2-entry-actions';
    wrap.innerHTML = `<button class="rf-d2-btn" data-action="rf-v2-edit-entry" data-entry-id="${esc(entry.id)}" type="button">Edit</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-entry" data-entry-id="${esc(entry.id)}" type="button">Delete</button>`;
    entryNode.appendChild(wrap);
  });
}

function injectCostCta() {
  const trip = activeTrip();
  if (!trip || STATE.tab !== 'trips' || STATE.view !== 'costs' || STATE.wizard) return;
  const target = document.querySelector('.rf-d2-ledger-hero, .rf-m2-ledger-hero');
  if (!target || target.querySelector('.rf-v2-cost-cta')) return;
  const wrap = document.createElement('div');
  wrap.className = 'rf-v2-cost-cta';
  wrap.innerHTML = '<button class="rf-d2-btn rf-v2-add-expense-btn is-primary" data-action="rf-v2-add-expense" type="button">+ Log expense</button>';
  target.appendChild(wrap);
}

function rememberTripVisibility(value) {
  if (value === 'private' || value === 'selected' || value === 'group') draftTripVisibility = value;
}

function currentWizardVisibility() {
  const visibleValue = field('v2-trip-visibility')?.value;
  if (visibleValue === 'private' || visibleValue === 'selected' || visibleValue === 'group') return visibleValue;
  if (draftTripVisibility === 'private' || draftTripVisibility === 'selected' || draftTripVisibility === 'group') return draftTripVisibility;
  return activeTrip()?.visibility || 'group';
}

function syncSelectedUsersVisibility() {
  const row = byId('v2-trip-selected-users-row');
  if (!row || (STATE.wizard !== 'trip' && STATE.wizard !== 'trip-edit')) return false;
  const isSelected = currentWizardVisibility() === 'selected';
  row.hidden = !isSelected;
  if (isSelected) preloadVisibilityDataForWizard();
  return true;
}

function refreshTripSelectedUsersControl() {
  const node = byId('v2-trip-selected-users');
  if (!node || (STATE.wizard !== 'trip' && STATE.wizard !== 'trip-edit')) return false;
  const trip = STATE.wizard === 'trip-edit' ? activeTrip() : null;
  node.innerHTML = selectedTripUserCheckboxes(trip, !canManageTripVisibility(trip));
  const row = byId('v2-trip-selected-users-row');
  if (row) row.hidden = currentWizardVisibility() !== 'selected';
  const host = wizardHost();
  if (host) {
    const modeClass = isDesktop() ? 'is-desktop' : 'is-mobile';
    host.dataset.signature = wizardDataSignature(modeClass, STATE.editTargetId || '');
  }
  return true;
}

function preloadVisibilityDataForWizard() {
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
      if (!refreshTripSelectedUsersControl()) requestAnimationFrame(renderWizardLayer);
    });
  }

  if (trip?.id && !Array.isArray(STATE.tripMembersByTrip[trip.id]) && !STATE.tripMembersLoadingByTrip[trip.id] && !tripMembersLoadPromises.has(trip.id)) {
    const promise = Promise.resolve(api().loadTripMembersForTrip?.(trip.id, { quiet: true }));
    tripMembersLoadPromises.set(trip.id, promise);
    promise.finally(() => {
      tripMembersLoadPromises.delete(trip.id);
      if (!refreshTripSelectedUsersControl()) requestAnimationFrame(renderWizardLayer);
    });
  }
}

function wizardDataSignature(modeClass, targetKey) {
  if (STATE.wizard === 'gpx-upload') {
    const target = gpxTarget();
    return [modeClass, 'gpx-upload', target.tripId || '', target.stageId || ''].join('|');
  }

  if (STATE.wizard !== 'trip' && STATE.wizard !== 'trip-edit') return `${modeClass}|${targetKey}`;
  const trip = STATE.wizard === 'trip-edit' ? activeTrip() : null;
  const selectable = (STATE.selectableTripMembers || []).map((member) => `${member.email}:${member.full_name || ''}`).join(',');
  const selectedRows = trip?.id && Array.isArray(STATE.tripMembersByTrip[trip.id])
    ? STATE.tripMembersByTrip[trip.id].map((row) => row.member_email).join(',')
    : '';
  return [modeClass, targetKey, currentWizardVisibility(), STATE.selectableTripMembersLoading ? 'members-loading' : 'members-ready', STATE.selectableTripMembersError || '', selectable, trip?.id || '', trip?.id && STATE.tripMembersLoadingByTrip[trip.id] ? 'trip-members-loading' : 'trip-members-ready', selectedRows].join('|');
}

function renderWizardLayer() {
  const modeClass = isDesktop() ? 'is-desktop' : 'is-mobile';
  const targetKey = STATE.editTargetId || '';

  if (!STATE.user || !STATE.wizard || !WIZARDS.has(STATE.wizard)) {
    removeExisting();
    injectTripActions();
    injectStageActions();
    injectEntryActions();
    injectCostCta();
    return;
  }

  preloadVisibilityDataForWizard();
  const signature = wizardDataSignature(modeClass, targetKey);
  const existingHost = wizardHost();
  if (existingHost && existingHost.dataset.wizard === STATE.wizard && existingHost.dataset.targetId === targetKey && existingHost.dataset.signature === signature && existingHost.classList.contains(modeClass)) return;

  removeExisting();

  const host = document.createElement('div');
  host.className = `rf-v2-wizard-host ${modeClass}`;
  host.dataset.wizard = STATE.wizard;
  host.dataset.targetId = targetKey;
  host.dataset.signature = signature;
  host.innerHTML = wizardHtml();
  document.body.appendChild(host);
  syncSelectedUsersVisibility();

  if (isDesktop()) {
    const first = host.querySelector('input, select, textarea, button');
    if (first instanceof HTMLElement) first.focus({ preventScroll: true });
  }
}

function wizardHtml() {
  if (STATE.wizard === 'trip' || STATE.wizard === 'trip-edit') return tripWizardHtml(STATE.wizard === 'trip-edit');
  if (STATE.wizard === 'stage') return stageCreateWizardHtml();
  if (STATE.wizard === 'stage-edit') return stageEditWizardHtml();
  if (STATE.wizard === 'journal') return journalCreateWizardHtml();
  if (STATE.wizard === 'journal-edit') return journalEditWizardHtml();
  if (STATE.wizard === 'gpx-upload') return gpxUploadWizardHtml();
  if (STATE.wizard === 'item' || STATE.wizard === 'item-edit') return itemWizardHtml(STATE.wizard === 'item-edit');
  return expenseWizardHtml();
}

function panelHtml({ id, kicker, title, sub = '', body, errorId, saveAction, saveLabel }) {
  return `<aside class="rf-v2-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="${esc(id)}">
    <div class="rf-v2-wizard-head"><div class="rf-d2-aside-kicker">${esc(kicker)}</div><h2 class="rf-d2-aside-title" id="${esc(id)}">${esc(title)}</h2>${sub ? `<p class="rf-d2-aside-sub">${esc(sub)}</p>` : ''}</div>
    ${body}
    <div class="rf-v2-wizard-error" id="${esc(errorId)}" hidden></div>
    <div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-v2-cancel-wizard" type="button">Cancel</button><button class="rf-d2-btn is-primary" data-action="${esc(saveAction)}" type="button">${esc(saveLabel)}</button></div>
  </aside>`;
}

function row(id, label, controlHtml) { return `<div class="rf-d2-form-row"><label class="rf-d2-form-label" for="${esc(id)}">${esc(label)}</label>${controlHtml}</div>`; }
function pair(left, right) { return `<div class="rf-d2-form-row-pair">${left}${right}</div>`; }
function input(id, value = '', attrs = '') { return `<input class="rf-d2-input" id="${esc(id)}" value="${esc(value ?? '')}" ${attrs}>`; }
function fileInput(id, attrs = '') { return `<input class="rf-d2-input" id="${esc(id)}" type="file" ${attrs}>`; }
function textarea(id, value = '', attrs = '') { return `<textarea class="rf-d2-textarea" id="${esc(id)}" ${attrs}>${esc(value ?? '')}</textarea>`; }
function select(id, optionsHtml, attrs = '') { return `<select class="rf-d2-input" id="${esc(id)}" ${attrs}>${optionsHtml}</select>`; }

function selectedUsersRowHtml(trip, canManageVisibility, visibility) {
  const hidden = visibility === 'selected' ? '' : ' hidden';
  return `<div class="rf-d2-form-row" id="v2-trip-selected-users-row"${hidden}><label class="rf-d2-form-label" for="v2-trip-selected-users">Selected users</label><div id="v2-trip-selected-users">${selectedTripUserCheckboxes(trip, !canManageVisibility)}</div></div>`;
}

function canManageTripVisibility(trip) { return !trip?.id || trip.created_by === STATE.user?.id; }
function selectedTripMemberEmails(trip) { if (!trip?.id) return new Set(); const rows = STATE.tripMembersByTrip[trip.id]; if (!Array.isArray(rows)) return new Set(); return new Set(rows.map((row) => String(row.member_email || '').toLowerCase()).filter(Boolean)); }
function memberDisplayName(member) { const explicitName = String(member?.full_name || '').trim(); if (explicitName) return explicitName; const emailName = String(member?.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim(); return emailName || 'Routefolk member'; }

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

function tripWizardHtml(editing = false) {
  const trip = editing ? activeTrip() : null;
  const visibility = currentWizardVisibility();
  const canManageVisibility = canManageTripVisibility(trip);
  const visibilityAttrs = canManageVisibility ? '' : 'disabled';
  return panelHtml({ id: 'rf-v2-trip-title', kicker: editing ? 'Edit trip' : 'New trip', title: editing ? 'Edit road journal' : 'Plan a road journal', sub: 'Stages, costs, GPX and notes stay attached to this trip.', errorId: 'v2-trip-error', saveAction: editing ? 'rf-v2-update-trip' : 'rf-v2-save-trip', saveLabel: editing ? 'Save changes' : 'Create trip', body: [row('v2-trip-title', 'Title', input('v2-trip-title', trip?.title || '', 'placeholder="e.g. Pyrenees Crossing"')), row('v2-trip-desc', 'Subtitle / short description', input('v2-trip-desc', trip?.description || '', 'placeholder="Bordeaux to Barcelona"')), pair(row('v2-trip-start', 'Start', input('v2-trip-start', trip?.start_date || '', 'type="date"')), row('v2-trip-end', 'End', input('v2-trip-end', trip?.end_date || '', 'type="date"'))), pair(row('v2-trip-status', 'Status', select('v2-trip-status', `${option('planning', 'Planning', trip?.status)}${option('active', 'Active', trip?.status)}${option('completed', 'Completed', trip?.status)}${option('cancelled', 'Cancelled', trip?.status)}`)), row('v2-trip-visibility', 'Visibility', select('v2-trip-visibility', `${option('group', 'Shared with everyone', visibility)}${option('selected', 'Shared with selected users', visibility)}${option('private', 'Private', visibility)}`, visibilityAttrs))), selectedUsersRowHtml(trip, canManageVisibility, visibility)].join('') });
}

function stageCreateWizardHtml() { return panelHtml({ id: 'rf-v2-stage-create-title', kicker: 'New stage', title: 'Add a route leg', sub: 'Add the route basics now. Coordinates and weather are resolved after saving.', errorId: 'v2-stage-create-error', saveAction: 'rf-v2-save-stage', saveLabel: 'Save stage', body: [row('v2-stage-from', 'From', input('v2-stage-from', '', 'placeholder="Aveiro"')), row('v2-stage-to', 'To', input('v2-stage-to', '', 'placeholder="Ávila"')), pair(row('v2-stage-date', 'Date', input('v2-stage-date', '', 'type="date"')), row('v2-stage-km', 'Distance km', input('v2-stage-km', '', 'inputmode="decimal" placeholder="410"'))), row('v2-stage-notes', 'Notes', textarea('v2-stage-notes', '', 'placeholder="Motorway, mountain pass, long stage..."'))].join('') }); }

function stageEditWizardHtml() { const stage = selectedStage(); if (!stage) return emptyWizard('No stage selected.'); return panelHtml({ id: 'rf-v2-stage-title', kicker: 'Edit stage', title: 'Adjust the route leg', sub: 'Changing locations can refresh stored coordinates and weather.', errorId: 'v2-stage-error', saveAction: 'rf-v2-update-stage', saveLabel: 'Save stage', body: [row('v2-stage-from-edit', 'From', input('v2-stage-from-edit', stage.start_location || '')), row('v2-stage-to-edit', 'To', input('v2-stage-to-edit', stage.end_location || '')), pair(row('v2-stage-date-edit', 'Date', input('v2-stage-date-edit', stage.planned_date || '', 'type="date"')), row('v2-stage-km-edit', 'Distance km', input('v2-stage-km-edit', stage.distance_km ?? '', 'inputmode="decimal"'))), row('v2-stage-route-edit', 'Custom Google Maps URL', input('v2-stage-route-edit', stage.custom_route_url || '', 'placeholder="https://www.google.com/maps/..."')), row('v2-stage-notes-edit', 'Notes', textarea('v2-stage-notes-edit', stage.notes || ''))].join('') }); }

function journalCreateWizardHtml() { return panelHtml({ id: 'rf-v2-entry-create-title', kicker: 'New entry', title: 'Add a stage note', sub: 'Capture stops, meals, lodging, links and anything worth remembering.', errorId: 'v2-entry-create-error', saveAction: 'rf-v2-save-journal', saveLabel: 'Save entry', body: [row('v2-entry-type', 'Type', select('v2-entry-type', `${option('note', 'Note', STATE.journalType || 'note')}${option('stop', 'Stop', STATE.journalType)}${option('meal', 'Meal', STATE.journalType)}${option('drink', 'Drink', STATE.journalType)}${option('lodging', 'Lodging', STATE.journalType)}${option('other', 'Other', STATE.journalType)}`)), row('v2-entry-title', 'Title', input('v2-entry-title', '', 'placeholder="e.g. Lunch stop"')), pair(row('v2-entry-place', 'Place', input('v2-entry-place', '', 'placeholder="Town, restaurant, pass..."')), row('v2-entry-time', 'Time', input('v2-entry-time', '', 'type="time"'))), row('v2-entry-note', 'Description', textarea('v2-entry-note', '', 'placeholder="What happened here?"'))].join('') }); }

function journalEditWizardHtml() { const entry = selectedEntry(); if (!entry) return emptyWizard('No journal entry selected.'); const local = entry.timestamp ? new Date(entry.timestamp) : null; const time = local && !Number.isNaN(local.getTime()) ? String(local.getHours()).padStart(2, '0') + ':' + String(local.getMinutes()).padStart(2, '0') : ''; return panelHtml({ id: 'rf-v2-entry-title', kicker: 'Edit entry', title: 'Refine the note', errorId: 'v2-entry-error', saveAction: 'rf-v2-update-entry', saveLabel: 'Save entry', body: [row('v2-entry-type-edit', 'Type', select('v2-entry-type-edit', `${option('note', 'Note', entry.entry_type)}${option('stop', 'Stop', entry.entry_type)}${option('meal', 'Meal', entry.entry_type)}${option('drink', 'Drink', entry.entry_type)}${option('lodging', 'Lodging', entry.entry_type)}${option('other', 'Other', entry.entry_type)}`)), row('v2-entry-title-edit', 'Title', input('v2-entry-title-edit', entry.title || '')), pair(row('v2-entry-place-edit', 'Place', input('v2-entry-place-edit', entry.location || '')), row('v2-entry-time-edit', 'Time', input('v2-entry-time-edit', time, 'type="time"'))), row('v2-entry-note-edit', 'Description', textarea('v2-entry-note-edit', entry.description || '')), row('v2-entry-location-url-edit', 'Maps URL', input('v2-entry-location-url-edit', entry.location_url || '', 'placeholder="https://www.google.com/maps/..."'))].join('') }); }

function gpxTarget() { const target = STATE.gpxUploadTarget || {}; const trip = target.tripId ? STATE.trips.find((item) => item.id === target.tripId) : activeTrip(); const tripId = trip?.id || target.tripId || ''; const stageId = target.stageId || selectedStage()?.id || ''; const stage = stagesForTrip(tripId).find((item) => item.id === stageId) || selectedStage(); return { trip, tripId, stage, stageId }; }

function gpxUploadWizardHtml() { const { tripId, stage } = gpxTarget(); const selectedFile = pendingGpxFile?.name || ''; const stageLabel = stage ? `${stage.start_location || 'Start'} → ${stage.end_location || 'End'}` : 'Selected stage'; return panelHtml({ id: 'rf-v2-gpx-upload-title', kicker: 'GPX upload', title: 'Attach a GPX track', sub: `${stageLabel}. The selected file is captured before upload so a re-render cannot wipe it.`, errorId: 'v2-gpx-error', saveAction: 'rf-v2-save-gpx-upload', saveLabel: 'Upload GPX', body: [row('v2-gpx-file', 'GPX file', `${fileInput('v2-gpx-file', `accept=".gpx,application/gpx+xml,application/xml,text/xml" data-trip-id="${esc(tripId)}"`)}<div class="rf-d2-aside-sub" id="v2-gpx-selected-file">${selectedFile ? `Selected: ${esc(selectedFile)}` : 'No file selected yet.'}</div>`)].join('') }).replace('data-action="rf-v2-cancel-wizard"', 'data-action="rf-v2-cancel-gpx-upload"'); }

function itemWizardHtml(editing = false) { const trip = activeTrip(); const item = editing ? selectedItem() : null; if (editing && !item) return emptyWizard('No packing item selected.'); const cats = trip ? categoriesForTrip(trip.id) : []; const selectedCategoryId = item?.category_id || cats.find((cat) => STATE.selectedCategoryKey && slug(cat.name) === STATE.selectedCategoryKey)?.id || cats[0]?.id || ''; return panelHtml({ id: 'rf-v2-item-title', kicker: editing ? 'Edit item' : 'New item', title: editing ? 'Update packing item' : 'Add to the packing list', sub: 'Use this for equipment, documents, clothing and trip-specific preparation.', errorId: 'v2-item-error', saveAction: editing ? 'rf-v2-update-item' : 'rf-v2-save-item', saveLabel: editing ? 'Save item' : 'Add item', body: [row('v2-item-text', 'Item', input('v2-item-text', item?.name || '', 'placeholder="e.g. Rain gloves"')), pair(row('v2-item-category', 'Category', select('v2-item-category', cats.map((cat) => `<option value="${esc(cat.id || '')}" ${selectedCategoryId === cat.id ? 'selected' : ''}>${esc(cat.name)}</option>`).join(''))), row('v2-item-status', 'Status', select('v2-item-status', `${option('planned', 'To-do', item?.status || 'planned')}${option('packed', 'Done', item?.status)}${option('optional', 'Optional', item?.status)}`))), row('v2-item-notes', 'Notes', textarea('v2-item-notes', item?.notes || '', 'placeholder="Optional detail"'))].join('') }); }

function expenseWizardHtml() { const trip = activeTrip(); const loadedStages = trip ? stagesForTrip(trip.id) : []; const requestedStageId = STATE.editTargetId || ''; const fallbackStage = requestedStageId ? selectedStage() : null; const stageRows = [...loadedStages]; if (fallbackStage && !stageRows.some((stage) => stage.id === fallbackStage.id)) stageRows.push(fallbackStage); const selectedStageId = requestedStageId && stageRows.some((stage) => stage.id === requestedStageId) ? requestedStageId : ''; const categoryOptions = Object.entries(EXPENSE_CATEGORY_META).map(([key, meta]) => `<option value="${esc(key)}">${esc(meta.label)}</option>`).join(''); const stageOptions = ['<option value="">Whole trip</option>', ...stageRows.map((stage, index) => `<option value="${esc(stage.id)}" ${selectedStageId === stage.id ? 'selected' : ''}>${index + 1}. ${esc(stage.start_location || 'Start')} → ${esc(stage.end_location || 'End')}</option>`)].join(''); const payerOptions = [STATE.user, ...STATE.profiles.filter((profile) => profile.id !== STATE.user?.id)].filter(Boolean).map((profile) => `<option value="${esc(profile.id)}">${esc(profile.full_name || profile.email || 'Rider')}</option>`).join(''); return panelHtml({ id: 'rf-v2-expense-title', kicker: 'New expense', title: 'Log an expense', sub: 'Keep it simple: category, amount, payer, date and optional stage.', errorId: 'v2-expense-error', saveAction: 'rf-v2-save-expense', saveLabel: 'Save expense', body: [pair(row('v2-expense-category', 'Category', select('v2-expense-category', categoryOptions)), row('v2-expense-amount', 'Amount', input('v2-expense-amount', '', 'inputmode="decimal" placeholder="42.80"'))), pair(row('v2-expense-payer', 'Paid by', select('v2-expense-payer', payerOptions)), row('v2-expense-date', 'Date', input('v2-expense-date', new Date().toISOString().slice(0, 10), 'type="date"'))), row('v2-expense-stage', 'Stage', select('v2-expense-stage', stageOptions)), row('v2-expense-description', 'Description', input('v2-expense-description', '', 'placeholder="e.g. Fuel, lunch, lodging"'))].join('') }); }

function emptyWizard(message) { return `<aside class="rf-v2-wizard-panel"><div class="rf-v2-wizard-head"><h2 class="rf-d2-aside-title">Nothing selected</h2><p>${esc(message)}</p></div><button class="rf-d2-btn" data-action="rf-v2-cancel-wizard" type="button">Close</button></aside>`; }
function option(value, label, selected) { return `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`; }
function slug(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other'; }
function showError(id, error) { const fallback = wizardHost()?.querySelector('.rf-v2-wizard-error') || document.querySelector('.rf-v2-wizard-error'); const node = wizardHost()?.querySelector(`#${CSS.escape(id)}`) || byId(id) || fallback; if (!node) return; node.textContent = error?.message || String(error || 'Something went wrong.'); node.hidden = false; }
function selectedMemberEmailsFromWizard() { return [...document.querySelectorAll('input[name="v2-trip-selected-user"]:checked')].map((input) => String(input.value || '').trim().toLowerCase()).filter(Boolean); }

function assertSelectedVisibilityHasMembers(payload) { if (payload.visibility !== 'selected') return; if (STATE.selectableTripMembersLoading) throw new Error('Wait for active Routefolk members to finish loading before saving.'); if (STATE.selectableTripMembersError) throw new Error('Could not load active Routefolk members. Confirm migration 015 was applied.'); if (!payload.selected_member_emails.length) throw new Error('Selected-users visibility requires at least one selected user.'); }
function tripPayload() { return { title: fieldValue('v2-trip-title'), description: fieldValue('v2-trip-desc'), start_date: field('v2-trip-start')?.value || null, end_date: field('v2-trip-end')?.value || null, status: field('v2-trip-status')?.value || 'planning', visibility: field('v2-trip-visibility')?.value || activeTrip()?.visibility || 'group', selected_member_emails: selectedMemberEmailsFromWizard() }; }

async function saveTrip(event) { claim(event); try { const payload = tripPayload(); assertSelectedVisibilityHasMembers(payload); const trip = await createTrip({ ...payload, visibility: payload.visibility === 'selected' ? 'private' : payload.visibility }); if (payload.visibility === 'selected') { await replaceTripMembers(trip.id, payload.selected_member_emails); await updateTrip(trip.id, { visibility: 'selected' }); await api().loadTripMembersForTrip?.(trip.id, { force: true, quiet: true }); } draftTripVisibility = null; STATE.trips = [trip, ...STATE.trips.filter((item) => item.id !== trip.id)]; STATE.wizard = null; STATE.editTargetId = null; STATE.tab = 'trips'; rememberTripContext(trip.id, 'detail'); await api().loadTrips?.(); await api().openTrip?.(trip.id, 'detail'); renderAll(); } catch (error) { showError('v2-trip-error', error); } }

async function saveTripEdit(event) { claim(event); const trip = activeTrip(); if (!trip) return; try { const payload = tripPayload(); const canManageVisibility = canManageTripVisibility(trip); let updated; if (canManageVisibility) { assertSelectedVisibilityHasMembers(payload); if (payload.visibility === 'selected') await replaceTripMembers(trip.id, payload.selected_member_emails); updated = await updateTrip(trip.id, payload); await api().loadTripMembersForTrip?.(trip.id, { force: true, quiet: true }); } else { const { visibility, selected_member_emails, ...contentPayload } = payload; updated = await updateTrip(trip.id, contentPayload); } draftTripVisibility = null; STATE.trips = STATE.trips.map((item) => item.id === updated.id ? updated : item); STATE.wizard = null; STATE.editTargetId = null; if (STATE.tab === 'archive') rememberArchiveContext(updated.id, 'summary'); else rememberTripContext(updated.id, STATE.view || 'detail'); await api().openTrip?.(updated.id, STATE.view || 'detail'); renderAll(); } catch (error) { showError('v2-trip-error', error); } }

async function removeTrip(event) { claim(event); const trip = activeTrip(); if (!trip) return; if (!window.confirm(`Delete trip “${trip.title || 'Untitled'}”? This cannot be undone.`)) return; await deleteTrip(trip.id); STATE.trips = STATE.trips.filter((item) => item.id !== trip.id); STATE.wizard = null; STATE.editTargetId = null; if (STATE.tab === 'archive') rememberArchiveContext(null, 'list'); else rememberTripContext(null, 'list'); renderAll(); }

async function saveStageCreate(event) { claim(event); const trip = activeTrip(); if (!trip) return; try { const stage = await createStage(trip.id, { start_location: fieldValue('v2-stage-from'), end_location: fieldValue('v2-stage-to'), planned_date: field('v2-stage-date')?.value || null, distance_km: field('v2-stage-km')?.value || null, notes: fieldValue('v2-stage-notes') }); STATE.stagesByTrip[trip.id] = [...stagesForTrip(trip.id), stage]; STATE.selectedStageId = stage.id; STATE.view = 'detail'; STATE.wizard = null; STATE.editTargetId = null; await api().loadStagesForTrip?.(trip.id); renderAll(); } catch (error) { showError('v2-stage-create-error', error); } }

async function saveStageEdit(event) { claim(event); const stage = selectedStage(); const trip = activeTrip(); if (!stage || !trip) return; try { const updated = await updateStage(stage.id, { start_location: fieldValue('v2-stage-from-edit'), end_location: fieldValue('v2-stage-to-edit'), planned_date: field('v2-stage-date-edit')?.value || null, distance_km: field('v2-stage-km-edit')?.value || null, custom_route_url: fieldValue('v2-stage-route-edit') || null, notes: fieldValue('v2-stage-notes-edit') }); STATE.stagesByTrip[trip.id] = stagesForTrip(trip.id).map((candidate) => candidate.id === updated.id ? updated : candidate); STATE.selectedStageId = updated.id; STATE.wizard = null; STATE.editTargetId = null; await api().loadStagesForTrip?.(trip.id); renderAll(); } catch (error) { showError('v2-stage-error', error); } }

async function removeStage(event, stageId) { claim(event); const trip = activeTrip(); const stage = stagesForTrip(trip?.id).find((candidate) => candidate.id === stageId); if (!trip || !stage) return; if (!window.confirm(`Delete stage “${stage.start_location || 'Start'} to ${stage.end_location || 'End'}”?`)) return; await deleteStage(stage.id); STATE.stagesByTrip[trip.id] = stagesForTrip(trip.id).filter((candidate) => candidate.id !== stage.id); STATE.selectedStageId = stagesForTrip(trip.id)[0]?.id || null; STATE.wizard = null; STATE.editTargetId = null; renderAll(); }

async function saveEntryCreate(event) { claim(event); const stage = selectedStage(); if (!stage) return; try { const time = field('v2-entry-time')?.value || ''; const date = stage.planned_date || new Date().toISOString().slice(0, 10); const payload = { entry_type: field('v2-entry-type')?.value || STATE.journalType || 'note', title: fieldValue('v2-entry-title'), location: fieldValue('v2-entry-place'), description: fieldValue('v2-entry-note'), timestamp: time ? `${date}T${time}:00` : null }; if (!payload.title && !payload.location && !payload.description) throw new Error('Write a title, place, or description before saving the note.'); const entry = await createEntry(stage.id, payload); const existing = STATE.entriesByStage[stage.id]; STATE.entriesByStage[stage.id] = Array.isArray(existing) ? [...existing, entry] : [entry]; STATE.journalType = payload.entry_type; STATE.wizard = null; STATE.editTargetId = null; await api().loadEntriesForStage?.(stage.id, { quiet: true }); renderAll(); } catch (error) { showError('v2-entry-create-error', error); } }

async function saveEntryEdit(event) { claim(event); const entry = selectedEntry(); const stage = selectedStage(); if (!entry || !stage) return; try { const time = field('v2-entry-time-edit')?.value || ''; const date = stage.planned_date || new Date().toISOString().slice(0, 10); const updated = await updateEntry(entry.id, { entry_type: field('v2-entry-type-edit')?.value || 'note', title: fieldValue('v2-entry-title-edit'), location: fieldValue('v2-entry-place-edit'), description: fieldValue('v2-entry-note-edit'), location_url: fieldValue('v2-entry-location-url-edit') || null, timestamp: time ? `${date}T${time}:00` : null }); STATE.entriesByStage[stage.id] = entriesForStage(stage.id).map((candidate) => candidate.id === updated.id ? updated : candidate); STATE.wizard = null; STATE.editTargetId = null; await api().loadEntriesForStage?.(stage.id, { quiet: true }); renderAll(); } catch (error) { showError('v2-entry-error', error); } }

async function removeEntry(event, entryId) { claim(event); const stage = selectedStage(); const entry = entriesForStage(stage?.id).find((candidate) => candidate.id === entryId); if (!stage || !entry) return; if (!window.confirm(`Delete journal entry “${entry.title || 'Untitled'}”?`)) return; await deleteEntry(entry.id); STATE.entriesByStage[stage.id] = entriesForStage(stage.id).filter((candidate) => candidate.id !== entry.id); STATE.wizard = null; STATE.editTargetId = null; renderAll(); }
function clearGpxUploadState() { pendingGpxFile = null; STATE.gpxUploadTarget = null; }

async function saveGpxUpload(event) { claim(event); const { tripId, stageId } = gpxTarget(); const inputFile = field('v2-gpx-file')?.files?.[0] || null; const file = pendingGpxFile || inputFile; try { if (!tripId || !stageId) throw new Error('Trip and stage are required before uploading GPX.'); if (!file) throw new Error('Choose a GPX file first.'); const { record, geometry } = await uploadStageGpx({ tripId, stageId, file }); const existing = tracksForTrip(tripId).filter((track) => track.id !== record.id); STATE.gpxByTrip[tripId] = [record, ...existing]; if (geometry) STATE.gpxGeometryByTrack[record.id] = geometry; STATE.wizard = null; clearGpxUploadState(); await api().loadGpxForTrip?.(tripId, { quiet: true }); renderAll(); } catch (error) { showError('v2-gpx-error', error); } }

async function saveExpense(event) { claim(event); const trip = activeTrip(); if (!trip) return; try { const expense = await createExpense(trip.id, { category: field('v2-expense-category')?.value || 'other', amount: field('v2-expense-amount')?.value || '', user_id: field('v2-expense-payer')?.value || STATE.user?.id, date: field('v2-expense-date')?.value || null, stage_id: field('v2-expense-stage')?.value || null, description: fieldValue('v2-expense-description') }); STATE.expensesByTrip[trip.id] = [...expensesForTrip(trip.id), expense]; STATE.wizard = null; STATE.editTargetId = null; await api().loadExpensesForTrip?.(trip.id, { quiet: true }); renderAll(); } catch (error) { showError('v2-expense-error', error); } }
function itemPayload() { return { text: fieldValue('v2-item-text'), category_id: field('v2-item-category')?.value || null, status: field('v2-item-status')?.value || 'planned', notes: fieldValue('v2-item-notes') }; }
async function saveItem(event) { claim(event); const trip = activeTrip(); if (!trip) return; try { const item = await createTripItem(trip.id, itemPayload()); STATE.itemsByTrip[trip.id] = [...itemsForTrip(trip.id), item]; STATE.wizard = null; STATE.editTargetId = null; await api().loadItemsForTrip?.(trip.id, { quiet: true }); renderAll(); } catch (error) { showError('v2-item-error', error); } }
async function saveItemEdit(event) { claim(event); const trip = activeTrip(); const item = selectedItem(); if (!trip || !item) return; try { const updated = await updateTripItem(item.id, itemPayload()); STATE.itemsByTrip[trip.id] = itemsForTrip(trip.id).map((candidate) => candidate.id === updated.id ? updated : candidate); STATE.wizard = null; STATE.editTargetId = null; await api().loadItemsForTrip?.(trip.id, { quiet: true }); renderAll(); } catch (error) { showError('v2-item-error', error); } }

document.addEventListener('change', (event) => { const target = event.target instanceof Element ? event.target : null; if (target?.id === 'v2-trip-visibility') { rememberTripVisibility(target.value); syncSelectedUsersVisibility(); } if (target instanceof HTMLInputElement && target.id === 'v2-gpx-file') { pendingGpxFile = target.files?.[0] || null; const label = byId('v2-gpx-selected-file'); if (label) label.textContent = pendingGpxFile ? `Selected: ${pendingGpxFile.name}` : 'No file selected yet.'; } }, true);

/**
 * Dispatch a wizard-domain action. Returns true if the action was
 * recognised and handled (so callers can stop further routing).
 * Shared by the legacy capture-phase listener below and the unified
 * action-router domain modules (Tasks 4.2-4.8).
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>}
 */
export async function dispatchWizardAction(event, btn, action) {
  if (action.endsWith('new-trip')) draftTripVisibility = null;
  if (action === 'rf-v2-save-trip' || action === 'rf-v2-update-trip' || action === 'rf-v2-cancel-wizard') draftTripVisibility = null;
  if (action === 'rf-v2-edit-trip') { claim(event); STATE.wizard = 'trip-edit'; draftTripVisibility = null; renderAll(); return true; }
  if (action === 'rf-v2-delete-trip') { await removeTrip(event); return true; }
  if (action === 'rf-v2-cancel-wizard') { claim(event); STATE.wizard = null; STATE.editTargetId = null; clearGpxUploadState(); renderAll(); return true; }
  if (action === 'rf-v2-save-trip') { await saveTrip(event); return true; }
  if (action === 'rf-v2-update-trip') { await saveTripEdit(event); return true; }
  if (action === 'rf-v2-save-stage') { await saveStageCreate(event); return true; }
  if (action === 'rf-v2-edit-stage') { claim(event); STATE.wizard = 'stage-edit'; STATE.editTargetId = btn.dataset.stageId; renderAll(); return true; }
  if (action === 'rf-v2-delete-stage') { await removeStage(event, btn.dataset.stageId); return true; }
  if (action === 'rf-v2-edit-entry') { claim(event); STATE.wizard = 'journal-edit'; STATE.editTargetId = btn.dataset.entryId; renderAll(); return true; }
  if (action === 'rf-v2-delete-entry') { await removeEntry(event, btn.dataset.entryId); return true; }
  if (action === 'rf-v2-update-stage') { await saveStageEdit(event); return true; }
  if (action === 'rf-v2-save-journal') { await saveEntryCreate(event); return true; }
  if (action === 'rf-v2-update-entry') { await saveEntryEdit(event); return true; }
  if (action === 'rf-v2-open-gpx-upload') { claim(event); pendingGpxFile = null; STATE.wizard = 'gpx-upload'; STATE.gpxUploadTarget = { tripId: btn.dataset.tripId || activeTrip()?.id || null, stageId: btn.dataset.stageId || selectedStage()?.id || null }; renderAll(); return true; }
  if (action === 'rf-v2-cancel-gpx-upload') { claim(event); STATE.wizard = null; clearGpxUploadState(); renderAll(); return true; }
  if (action === 'rf-v2-save-gpx-upload') { await saveGpxUpload(event); return true; }
  if (action === 'rf-v2-add-expense' || action === 'rf-v2-add-stage-expense') { claim(event); STATE.wizard = 'expense'; STATE.editTargetId = btn.dataset.stageId || null; renderAll(); return true; }
  if (action === 'rf-v2-save-expense') { await saveExpense(event); return true; }
  if (action === 'rf-v2-save-item') { await saveItem(event); return true; }
  if (action === 'rf-v2-update-item') { await saveItemEdit(event); return true; }
  return false;
}

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(renderWizardLayer));
requestAnimationFrame(renderWizardLayer);
