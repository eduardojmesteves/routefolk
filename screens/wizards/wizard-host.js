// ============================================================
// routefolk — screens/wizards/wizard-host.js
// Wizard host container management: builds/removes the overlay,
// injects contextual action buttons, owns the render loop and
// the routefolk:v2-render listener.
// ============================================================

import { STATE } from '../../state/app-state.js';
import {
  WIZARDS,
  isDesktop,
  activeTrip,
  wizardHost,
  claim,
  renderAll,
  clearGpxUploadState,
  setDraftTripVisibility,
  setActivePreviewBuilder,
  refreshWizardPreview,
  setActiveReadoutsRefresh,
  refreshWizardReadouts,
  selectChoiceCard,
  selectStar,
  autoScrollToNextSection,
} from './wizard-shared.js';
import {
  tripWizardHtml,
  tripWizardDataSignature,
  tripPreviewHtml,
  refreshTripDurationChip,
  preloadVisibilityDataForWizard,
  syncSelectedUsersVisibility,
  setSignatureRefreshHandler,
  rememberTripVisibility,
} from './trip-wizard.js';
import { stageCreateWizardHtml, stageEditWizardHtml, stagePreviewHtml, refreshStageRideTimeChip } from './stage-wizard.js';
import { journalCreateWizardHtml, journalEditWizardHtml, journalPreviewHtml } from './journal-wizard.js';
import { expenseWizardHtml, expensePreviewHtml } from './expense-wizard.js';
import { itemWizardHtml, itemPreviewHtml } from './item-wizard.js';
import { gpxUploadWizardHtml, gpxWizardDataSignature } from './gpx-wizard.js';
import { setPendingGpxFile, getPendingGpxFile, byId } from './wizard-shared.js';
import { roadCreateWizardHtml, roadEditWizardHtml, roadPreviewHtml, preloadStagesForRoadWizard, roadWizardDataSignature } from './road-wizard.js';

// ---- Contextual action injection ------------------------------------
function removeExisting() {
  document.querySelectorAll('.rf-v2-wizard-host, .rf-v2-cost-cta, .rf-v2-hero-actions, .rf-v2-stage-actions, .rf-v2-entry-actions').forEach((node) => node.remove());
}

function injectTripActions() {
  const trip = activeTrip();
  if (!trip || !STATE.viewTripId || STATE.wizard) return;
  if (!['trips', 'archive'].includes(STATE.tab)) return;
  const target = document.querySelector('.rf-d2-hero .rf-d2-hero-stamps, .rf-clean-trip-head .rf-m2-detail-stamps, .rf-m2-detail-hero');
  if (!target || target.querySelector('.rf-v2-hero-actions')) return;
  const wrap = document.createElement('div');
  wrap.className = 'rf-v2-hero-actions';
  wrap.innerHTML = `<button class="rf-d2-btn" data-action="rf-v2-edit-trip" type="button">Edit trip</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-trip" type="button">Delete</button>`;
  target.appendChild(wrap);
}

// Stage and journal-entry edit/delete affordances now render in the
// declarative render path (atoms M2/M3/M4 mobile, D1/D2 desktop), so the
// former injectStageActions/injectEntryActions injectors were removed to
// avoid duplicate controls on desktop. Trip + cost-CTA injection remain.

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

// ---- Host signature + markup dispatch -------------------------------
function wizardDataSignature(modeClass, targetKey) {
  if (STATE.wizard === 'gpx-upload') return gpxWizardDataSignature(modeClass);
  if (STATE.wizard === 'trip' || STATE.wizard === 'trip-edit') return tripWizardDataSignature(modeClass, targetKey);
  if (STATE.wizard === 'road' || STATE.wizard === 'road-edit') return roadWizardDataSignature(modeClass, targetKey);
  return `${modeClass}|${targetKey}`;
}

function wizardHtml() {
  if (STATE.wizard === 'trip' || STATE.wizard === 'trip-edit') return tripWizardHtml(STATE.wizard === 'trip-edit');
  if (STATE.wizard === 'stage') return stageCreateWizardHtml();
  if (STATE.wizard === 'stage-edit') return stageEditWizardHtml();
  if (STATE.wizard === 'journal') return journalCreateWizardHtml();
  if (STATE.wizard === 'journal-edit') return journalEditWizardHtml();
  if (STATE.wizard === 'gpx-upload') return gpxUploadWizardHtml();
  if (STATE.wizard === 'item' || STATE.wizard === 'item-edit') return itemWizardHtml(STATE.wizard === 'item-edit');
  if (STATE.wizard === 'road') return roadCreateWizardHtml();
  if (STATE.wizard === 'road-edit') return roadEditWizardHtml();
  return expenseWizardHtml();
}

/** Re-stamp the host signature after an in-place control refresh. */
function restampHostSignature() {
  const host = wizardHost();
  if (!host) return;
  const modeClass = isDesktop() ? 'is-desktop' : 'is-mobile';
  host.dataset.signature = wizardDataSignature(modeClass, STATE.editTargetId || '');
}

// ---- Render loop -----------------------------------------------------
export function renderWizardLayer() {
  const modeClass = isDesktop() ? 'is-desktop' : 'is-mobile';
  const targetKey = STATE.editTargetId || '';

  if (!STATE.user || !STATE.wizard || !WIZARDS.has(STATE.wizard)) {
    removeExisting();
    injectTripActions();
    injectCostCta();
    return;
  }

  preloadVisibilityDataForWizard(scheduleRender);
  preloadStagesForRoadWizard(scheduleRender);
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
  syncSelectedUsersVisibility(scheduleRender);
  // Register the open wizard's live-preview builder and computed-readouts
  // refresher (narrative wizards only — see wizard-shared.js
  // refreshWizardPreview()/refreshWizardReadouts()). Extend this map as
  // more wizards migrate to the narrative shell.
  const NARRATIVE_WIZARDS = {
    trip: { preview: tripPreviewHtml, readouts: refreshTripDurationChip },
    'trip-edit': { preview: tripPreviewHtml, readouts: refreshTripDurationChip },
    stage: { preview: () => stagePreviewHtml(''), readouts: refreshStageRideTimeChip },
    'stage-edit': { preview: () => stagePreviewHtml('-edit'), readouts: refreshStageRideTimeChip },
    journal: { preview: () => journalPreviewHtml(''), readouts: null },
    'journal-edit': { preview: () => journalPreviewHtml('-edit'), readouts: null },
    expense: { preview: expensePreviewHtml, readouts: null },
    item: { preview: itemPreviewHtml, readouts: null },
    'item-edit': { preview: itemPreviewHtml, readouts: null },
    road: { preview: () => roadPreviewHtml(''), readouts: null },
    'road-edit': { preview: () => roadPreviewHtml('-edit'), readouts: null },
  };
  const narrative = NARRATIVE_WIZARDS[STATE.wizard];
  setActivePreviewBuilder(narrative?.preview || null);
  setActiveReadoutsRefresh(narrative?.readouts || null);
  // The preview/readouts embedded in wizardHtml() above were built before
  // the host was attached to the document, so any field()/byId() lookup
  // inside them returned null — real for edit wizards, where the initial
  // render should reflect the record's actual data. Refresh once now that
  // the host (and its fields) are live in the DOM.
  refreshWizardPreview();
  refreshWizardReadouts();

  if (isDesktop()) {
    const first = host.querySelector('input, select, textarea, button');
    if (first instanceof HTMLElement) first.focus({ preventScroll: true });
  }
}

function scheduleRender() {
  requestAnimationFrame(renderWizardLayer);
}

// Let trip-wizard re-stamp the host signature after an in-place control
// refresh (preserves the original single-module behaviour).
setSignatureRefreshHandler(restampHostSignature);

// ---- Document listeners ---------------------------------------------
// The change listener and the render listeners are registered exactly
// once at module load, so importing this module multiple times (it is a
// singleton ES module) cannot introduce duplicate document listeners.
document.addEventListener('change', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.id === 'v2-trip-visibility') {
    rememberTripVisibility(target.value);
    syncSelectedUsersVisibility(scheduleRender);
  }
  if (target instanceof HTMLInputElement && target.id === 'v2-gpx-file') {
    setPendingGpxFile(target.files?.[0] || null);
    const label = byId('v2-gpx-selected-file');
    if (label) {
      const file = getPendingGpxFile();
      label.textContent = file ? `Selected: ${file.name}` : 'No file selected yet.';
    }
  }
}, true);

// Narrative wizards (Route Atlas): any field edit refreshes the sticky
// live-preview in place, without going through the full render loop.
document.addEventListener('input', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('.rf-v2-wizard-narrative')) { refreshWizardPreview(); refreshWizardReadouts(); }
}, true);

// ---- Keyboard accessibility: Escape closes, Tab stays trapped ---------
// No overlay previously handled Escape or trapped focus, letting Tab walk
// keyboard users out into the (visually obscured) background page behind
// the modal backdrop. wizardHost() matches both the wizard overlay and
// the extra-writes edit overlay, so this one listener covers every
// wizard/edit panel in the app.
function focusableElements(host) {
  return [...host.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.offsetParent !== null);
}

document.addEventListener('keydown', (event) => {
  const host = wizardHost();
  if (!host) return;
  if (event.key === 'Escape') {
    const cancelBtn = host.querySelector('[data-action="rf-v2-cancel-wizard"], [data-action="rf-v2-cancel-gpx-upload"], [data-action="rf-v2-extra-cancel"]');
    if (cancelBtn instanceof HTMLElement) { event.preventDefault(); cancelBtn.click(); }
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = focusableElements(host);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  else if (!host.contains(active)) { event.preventDefault(); first.focus(); }
}, true);

/**
 * Dispatch the two shared wizard-cancel actions. The unified
 * action-router (actions/action-router.js) routes
 * `rf-v2-cancel-wizard` and `rf-v2-cancel-gpx-upload` straight here
 * before its domain loop, because cancelling closes the wizard host —
 * a concern owned by this rendering module rather than any one domain.
 *
 * All save/edit/delete handler logic now lives in the actions/* domain
 * modules.
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>}
 */
export async function dispatchWizardAction(event, btn, action) {
  if (action === 'rf-v2-cancel-wizard') { setDraftTripVisibility(null); claim(event); STATE.wizard = null; STATE.editTargetId = null; clearGpxUploadState(); renderAll(); return true; }
  if (action === 'rf-v2-cancel-gpx-upload') { claim(event); STATE.wizard = null; clearGpxUploadState(); renderAll(); return true; }
  if (action === 'rf-v2-choice-select') {
    claim(event);
    const group = btn.closest('.rf-v2-choice-cards');
    if (group) {
      selectChoiceCard(btn.dataset.field, btn.dataset.value, group);
      refreshWizardPreview();
      refreshWizardReadouts();
      autoScrollToNextSection(btn);
    }
    return true;
  }
  if (action === 'rf-v2-star-select') {
    claim(event);
    const group = btn.closest('.rf-starpicker');
    if (group) {
      selectStar(btn.dataset.field, btn.dataset.value, group);
      refreshWizardPreview();
      refreshWizardReadouts();
    }
    return true;
  }
  return false;
}

document.addEventListener('routefolk:v2-render', scheduleRender);
document.addEventListener('routefolk:wizard-relayout', scheduleRender);
requestAnimationFrame(renderWizardLayer);
