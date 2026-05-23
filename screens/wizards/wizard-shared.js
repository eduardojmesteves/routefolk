// ============================================================
// routefolk — screens/wizards/wizard-shared.js
// Shared helpers, selectors and module state used across every
// wizard markup module and the wizard host renderer.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';

export const WIZARDS = new Set(['trip', 'trip-edit', 'stage', 'stage-edit', 'journal', 'journal-edit', 'gpx-upload', 'expense', 'item', 'item-edit']);
export const isDesktop = () => window.matchMedia('(min-width:960px)').matches;
export const byId = (id) => document.getElementById(id);

// ---- State selectors -------------------------------------------------
export const activeTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || (STATE.tab === 'archive' ? STATE.selectedArchiveTripId : STATE.selectedTripId))) || null;
export const stagesForTrip = (tripId) => Array.isArray(STATE.stagesByTrip[tripId]) ? STATE.stagesByTrip[tripId] : [];
export const expensesForTrip = (tripId) => Array.isArray(STATE.expensesByTrip[tripId]) ? STATE.expensesByTrip[tripId] : [];
export const categoriesForTrip = (tripId) => Array.isArray(STATE.itemCategoriesByTrip[tripId]) ? STATE.itemCategoriesByTrip[tripId] : [];
export const itemsForTrip = (tripId) => Array.isArray(STATE.itemsByTrip[tripId]) ? STATE.itemsByTrip[tripId] : [];
export const tracksForTrip = (tripId) => Array.isArray(STATE.gpxByTrip[tripId]) ? STATE.gpxByTrip[tripId] : [];

export const selectedStage = () => {
  const trip = activeTrip();
  if (!trip) return null;
  return stagesForTrip(trip.id).find((stage) => stage.id === (STATE.editTargetId || STATE.selectedStageId)) || stagesForTrip(trip.id)[0] || null;
};
export const entriesForStage = (stageId) => Array.isArray(STATE.entriesByStage[stageId]) ? STATE.entriesByStage[stageId] : [];
export const selectedEntry = () => {
  const stage = selectedStage();
  if (!stage) return null;
  return entriesForStage(stage.id).find((entry) => entry.id === STATE.editTargetId) || null;
};
export const selectedItem = () => {
  const trip = activeTrip();
  if (!trip) return null;
  return itemsForTrip(trip.id).find((item) => item.id === STATE.editTargetId) || null;
};

// ---- Module state ----------------------------------------------------
let draftTripVisibility = null;
let pendingGpxFile = null;

/** Module-state setter for the wizard draft trip visibility. */
export function setDraftTripVisibility(value) { draftTripVisibility = value; }
/** Module-state accessor for the wizard draft trip visibility. */
export function getDraftTripVisibility() { return draftTripVisibility; }
/** Module-state setter for the captured pending GPX file. */
export function setPendingGpxFile(value) { pendingGpxFile = value; }
/** Module-state accessor for the captured pending GPX file. */
export function getPendingGpxFile() { return pendingGpxFile; }

// ---- Wizard host accessors ------------------------------------------
export function wizardHost() {
  return document.querySelector('.rf-v2-wizard-host');
}

export function field(id) {
  return wizardHost()?.querySelector(`#${CSS.escape(id)}`) || byId(id);
}

export function fieldValue(id) {
  return field(id)?.value?.trim() || '';
}

// ---- Generic write-flow helpers -------------------------------------
export function api() { return window.routefolkData || {}; }

export function renderAll() {
  api().renderAll?.();
  window.__routefolkV2Render?.();
  requestAnimationFrame(() => {
    document.dispatchEvent(new Event('routefolk:wizard-relayout'));
  });
}

export function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

export function showError(id, error) {
  const fallback = wizardHost()?.querySelector('.rf-v2-wizard-error') || document.querySelector('.rf-v2-wizard-error');
  const node = wizardHost()?.querySelector(`#${CSS.escape(id)}`) || byId(id) || fallback;
  if (!node) return;
  node.textContent = error?.message || String(error || 'Something went wrong.');
  node.hidden = false;
}

export function clearGpxUploadState() { pendingGpxFile = null; STATE.gpxUploadTarget = null; }

// ---- Shared markup helpers ------------------------------------------
export function panelHtml({ id, kicker, title, sub = '', body, errorId, saveAction, saveLabel }) {
  return `<aside class="rf-v2-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="${esc(id)}">
    <div class="rf-v2-wizard-head"><div class="rf-d2-aside-kicker">${esc(kicker)}</div><h2 class="rf-d2-aside-title" id="${esc(id)}">${esc(title)}</h2>${sub ? `<p class="rf-d2-aside-sub">${esc(sub)}</p>` : ''}</div>
    ${body}
    <div class="rf-v2-wizard-error" id="${esc(errorId)}" hidden></div>
    <div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-v2-cancel-wizard" type="button">Cancel</button><button class="rf-d2-btn is-primary" data-action="${esc(saveAction)}" type="button">${esc(saveLabel)}</button></div>
  </aside>`;
}

export function row(id, label, controlHtml) { return `<div class="rf-d2-form-row"><label class="rf-d2-form-label" for="${esc(id)}">${esc(label)}</label>${controlHtml}</div>`; }
export function pair(left, right) { return `<div class="rf-d2-form-row-pair">${left}${right}</div>`; }
export function input(id, value = '', attrs = '') { return `<input class="rf-d2-input" id="${esc(id)}" value="${esc(value ?? '')}" ${attrs}>`; }
export function fileInput(id, attrs = '') { return `<input class="rf-d2-input" id="${esc(id)}" type="file" ${attrs}>`; }
export function textarea(id, value = '', attrs = '') { return `<textarea class="rf-d2-textarea" id="${esc(id)}" ${attrs}>${esc(value ?? '')}</textarea>`; }
export function select(id, optionsHtml, attrs = '') { return `<select class="rf-d2-input" id="${esc(id)}" ${attrs}>${optionsHtml}</select>`; }
export function option(value, label, selected) { return `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`; }
export function slug(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other'; }

export function emptyWizard(message) {
  return `<aside class="rf-v2-wizard-panel"><div class="rf-v2-wizard-head"><h2 class="rf-d2-aside-title">Nothing selected</h2><p>${esc(message)}</p></div><button class="rf-d2-btn" data-action="rf-v2-cancel-wizard" type="button">Close</button></aside>`;
}
