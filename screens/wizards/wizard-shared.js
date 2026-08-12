// ============================================================
// routefolk — screens/wizards/wizard-shared.js
// Shared helpers, selectors and module state used across every
// wizard markup module and the wizard host renderer.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc, starSvg } from '../../utils/dom.js';

export const WIZARDS = new Set(['trip', 'trip-edit', 'stage', 'stage-edit', 'journal', 'journal-edit', 'gpx-upload', 'expense', 'item', 'item-edit', 'road', 'road-edit']);
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
  const list = stagesForTrip(trip.id);
  // editTargetId only identifies a stage during stage-edit; in journal-edit /
  // item-edit it holds an entry/item id, so fall back to the open stage.
  const wantId = STATE.wizard === 'stage-edit' ? (STATE.editTargetId || STATE.selectedStageId) : STATE.selectedStageId;
  return list.find((stage) => stage.id === wantId) || list[0] || null;
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
export const selectedRoad = () => STATE.myRoads.find((road) => road.id === STATE.editTargetId) || null;
export const roadStageLinksForRoad = (roadId) => Array.isArray(STATE.roadStageLinksByRoad[roadId]) ? STATE.roadStageLinksByRoad[roadId] : [];

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
// Matches either open-overlay system: the main wizard host (trip, stage,
// journal, expense, item, gpx) or the legacy extra-writes edit overlay
// (expense-edit, item-edit — screens/extra-writes.js). Both host exactly
// one overlay at a time, so field()/fieldValue()/refreshWizardPreview()
// can stay host-agnostic.
export function wizardHost() {
  return document.querySelector('.rf-wizard-host, .rf-extra-host');
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
  window.__routefolkWizardRender?.();
  requestAnimationFrame(() => {
    document.dispatchEvent(new Event('routefolk:wizard-relayout'));
  });
}

export function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/**
 * Disables the button that triggered `event` for the duration of an
 * async save, so a slow/stalled request can't be double-submitted by an
 * impatient tap. Returns a restore function to call in a `finally` block,
 * or `null` if the button was already mid-request — callers should treat
 * a `null` return as "ignore this click, a save is already running".
 * @param {Event} event
 * @returns {(() => void) | null}
 */
export function beginBusy(event) {
  const btn = event.target instanceof Element ? event.target.closest('button') : null;
  if (!btn || btn.disabled) return null;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  return () => {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.textContent = label;
    }
  };
}

export function showError(id, error) {
  const fallback = wizardHost()?.querySelector('.rf-wizard-error') || document.querySelector('.rf-wizard-error');
  const node = wizardHost()?.querySelector(`#${CSS.escape(id)}`) || byId(id) || fallback;
  if (!node) return;
  node.textContent = error?.message || String(error || 'Something went wrong.');
  node.hidden = false;
}

export function clearGpxUploadState() { pendingGpxFile = null; STATE.gpxUploadTarget = null; }

// ---- Shared markup helpers ------------------------------------------
export function panelHtml({ id, kicker, title, sub = '', body, errorId, saveAction, saveLabel }) {
  return `<aside class="rf-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="${esc(id)}">
    <div class="rf-wizard-head"><div class="rf-desktop-aside-kicker">${esc(kicker)}</div><h2 class="rf-desktop-aside-title" id="${esc(id)}">${esc(title)}</h2>${sub ? `<p class="rf-desktop-aside-sub">${esc(sub)}</p>` : ''}</div>
    ${body}
    <div class="rf-wizard-error" id="${esc(errorId)}" hidden></div>
    <div class="rf-desktop-form-actions"><button class="rf-desktop-btn" data-action="rf-cancel-wizard" type="button">Cancel</button><button class="rf-desktop-btn is-primary" data-action="${esc(saveAction)}" type="button">${esc(saveLabel)}</button></div>
  </aside>`;
}

export function row(id, label, controlHtml) { return `<div class="rf-desktop-form-row"><label class="rf-desktop-form-label" for="${esc(id)}">${esc(label)}</label>${controlHtml}</div>`; }
export function pair(left, right) { return `<div class="rf-desktop-form-row-pair">${left}${right}</div>`; }
export function input(id, value = '', attrs = '') { return `<input class="rf-desktop-input" id="${esc(id)}" value="${esc(value ?? '')}" ${attrs}>`; }
export function fileInput(id, attrs = '') { return `<input class="rf-desktop-input" id="${esc(id)}" type="file" ${attrs}>`; }
export function textarea(id, value = '', attrs = '') { return `<textarea class="rf-desktop-textarea" id="${esc(id)}" ${attrs}>${esc(value ?? '')}</textarea>`; }
export function select(id, optionsHtml, attrs = '') { return `<select class="rf-desktop-input" id="${esc(id)}" ${attrs}>${optionsHtml}</select>`; }
export function option(value, label, selected) { return `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`; }
export function slug(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other'; }

export function emptyWizard(message) {
  return `<aside class="rf-wizard-panel"><div class="rf-wizard-head"><h2 class="rf-desktop-aside-title">Nothing selected</h2><p>${esc(message)}</p></div><button class="rf-desktop-btn" data-action="rf-cancel-wizard" type="button">Close</button></aside>`;
}

// ---- Narrative wizard shell (Route Atlas) -----------------------------
// The multi-section, choice-card, live-preview pattern from HANDOFF.md's
// "Wizard redesign pattern" — the shape every wizard migrates to.
// trip-wizard.js is the first (reference) migration; other wizards keep
// using panelHtml()/row()/select() above until their own migration.

/** Wizard shell: narrative sections + a sticky live-preview + sticky footer. */
export function narrativeShellHtml({ id, kicker, title, sub = '', sections, previewLabel = 'Preview', previewHtml, errorId, saveAction, saveLabel, cancelAction = 'rf-cancel-wizard' }) {
  return `<aside class="rf-wizard-panel rf-wizard-narrative" role="dialog" aria-modal="true" aria-labelledby="${esc(id)}">
    <div class="rf-wizard-head"><div class="rf-desktop-aside-kicker">${esc(kicker)}</div><h2 class="rf-desktop-aside-title" id="${esc(id)}">${esc(title)}</h2>${sub ? `<p class="rf-desktop-aside-sub">${esc(sub)}</p>` : ''}</div>
    <div class="rf-wizard-scroll">
      ${sections.join('')}
      <div class="rf-wizard-preview" id="rf-wizard-preview"><div class="rf-wizard-preview-label">${esc(previewLabel)}</div>${previewHtml}</div>
    </div>
    <div class="rf-wizard-error" id="${esc(errorId)}" hidden></div>
    <div class="rf-wizard-footer"><button class="rf-desktop-btn" data-action="${esc(cancelAction)}" type="button">Cancel</button><button class="rf-desktop-btn is-primary" data-action="${esc(saveAction)}" type="button">${esc(saveLabel)}</button></div>
  </aside>`;
}

/** One narrative section: a conversational question + hint, then its fields. */
export function narrativeSection(id, question, hint, fieldsHtml) {
  return `<section class="rf-wizard-section" id="${esc(id)}"><div class="rf-wizard-section-head"><h3>${esc(question)}</h3>${hint ? `<p>${esc(hint)}</p>` : ''}</div>${fieldsHtml}</section>`;
}

/**
 * A connected From/To row with a small dashed route-connector between the
 * two fields (Stage wizard's "Where's this leg go?"; reused verbatim by
 * the Road wizard's "What does it connect?" per HANDOFF.md).
 */
export function connectedRouteRow(fromId, toId, fromValue, toValue, fromAttrs = '', toAttrs = '') {
  return `<div class="rf-route-row">${input(fromId, fromValue, `placeholder="From" ${fromAttrs}`)}<span class="rf-route-connector" aria-hidden="true"></span>${input(toId, toValue, `placeholder="To" ${toAttrs}`)}</div>`;
}

/**
 * Tappable choice-cards for a small, meaningful option set (replaces a
 * <select> for things like Status/Visibility/entry type). Renders a
 * hidden input carrying the field id so field()/fieldValue() keep
 * working unchanged for existing payload-building code.
 * @param {string} fieldId
 * @param {{value:string, label:string, description?:string, tone?:string}[]} options
 * @param {string} selectedValue
 */
export function choiceCards(fieldId, options, selectedValue, { disabled = false } = {}) {
  const cards = options.map((opt) => `<button type="button" class="rf-choice-card ${opt.value === selectedValue ? 'is-active' : ''}" data-action="rf-choice-select" data-field="${esc(fieldId)}" data-value="${esc(opt.value)}" ${disabled ? 'disabled' : ''}><span class="rf-choice-dot" data-tone="${esc(opt.tone || '')}"></span><span class="rf-choice-body"><strong>${esc(opt.label)}</strong>${opt.description ? `<small>${esc(opt.description)}</small>` : ''}</span></button>`).join('');
  return `<div class="rf-choice-cards ${disabled ? 'is-disabled' : ''}" data-field-group="${esc(fieldId)}">${cards}<input type="hidden" id="${esc(fieldId)}" value="${esc(selectedValue)}"></div>`;
}

/**
 * Tappable 1-5 star picker (Road wizard's "How many stars?" — HANDOFF.md:
 * "NOT a dropdown — tap a star to set the rating, all stars up to and
 * including the tapped one fill"). Same hidden-input pattern as
 * choiceCards() so field()/fieldValue() work unchanged.
 */
export function starPickerHtml(fieldId, rating = 0) {
  const stars = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="rf-star ${n <= rating ? 'is-filled' : ''}" data-action="rf-star-select" data-field="${esc(fieldId)}" data-value="${n}" aria-label="${n} star${n === 1 ? '' : 's'}">${starSvg()}</button>`).join('');
  return `<div class="rf-starpicker" data-field-group="${esc(fieldId)}">${stars}<input type="hidden" id="${esc(fieldId)}" value="${rating}"></div>`;
}

/** Applies a choice-card click: sets the hidden field, toggles is-active,
 *  and fires a real 'change' event so existing field-watching listeners
 *  (e.g. trip visibility) keep working unchanged. */
export function selectChoiceCard(fieldId, value, groupEl) {
  const hidden = groupEl.querySelector(`#${CSS.escape(fieldId)}`);
  if (!hidden) return;
  hidden.value = value;
  groupEl.querySelectorAll('.rf-choice-card').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.value === value));
  hidden.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Applies a star-picker tap: sets the hidden field to the tapped value
 *  and fills every star at or below it (HANDOFF.md star-picker rule). */
export function selectStar(fieldId, value, groupEl) {
  const hidden = groupEl.querySelector(`#${CSS.escape(fieldId)}`);
  if (!hidden) return;
  hidden.value = value;
  groupEl.querySelectorAll('.rf-star').forEach((btn) => btn.classList.toggle('is-filled', Number(btn.dataset.value) <= Number(value)));
  hidden.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Smoothly scrolls the wizard's own internal scroll container (never
 *  scrollIntoView, which can fight other scroll containers) to bring the
 *  next section into view. */
export function autoScrollToNextSection(fromEl) {
  const section = fromEl.closest('.rf-wizard-section');
  const scroller = fromEl.closest('.rf-wizard-scroll');
  const next = section?.nextElementSibling;
  if (!scroller || !next || !next.classList.contains('rf-wizard-section')) return;
  scroller.scrollTo({ top: next.offsetTop - 12, behavior: 'smooth' });
}

// The open narrative wizard registers its own preview builder here so a
// choice-card click or field input can refresh just the sticky preview
// without going through the full render loop (the host's data-signature
// is keyed off STATE, not live in-DOM field values).
let activePreviewBuilder = null;
export function setActivePreviewBuilder(fn) { activePreviewBuilder = fn; }
export function refreshWizardPreview() {
  const node = wizardHost()?.querySelector('#rf-wizard-preview');
  if (!node || !activePreviewBuilder) return;
  node.innerHTML = `<div class="rf-wizard-preview-label">${node.querySelector('.rf-wizard-preview-label')?.textContent || 'Preview'}</div>${activePreviewBuilder()}`;
}

// A narrative wizard's other live-computed readouts (e.g. a "7 days on
// the road" duration chip next to a date range) that live outside the
// sticky preview node and so need their own refresh hook.
let activeReadoutsRefresh = null;
export function setActiveReadoutsRefresh(fn) { activeReadoutsRefresh = fn; }
export function refreshWizardReadouts() { activeReadoutsRefresh?.(); }
