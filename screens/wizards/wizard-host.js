// ============================================================
// routefolk — screens/wizards/wizard-host.js
// Wizard host container management: builds/removes the overlay,
// injects contextual action buttons, owns the render loop and
// the routefolk:v2-render listener.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import {
  WIZARDS,
  isDesktop,
  activeTrip,
  selectedStage,
  selectedEntry,
  entriesForStage,
  wizardHost,
  claim,
  renderAll,
  clearGpxUploadState,
  setDraftTripVisibility,
} from './wizard-shared.js';
import {
  tripWizardHtml,
  tripWizardDataSignature,
  preloadVisibilityDataForWizard,
  syncSelectedUsersVisibility,
  setSignatureRefreshHandler,
  rememberTripVisibility,
} from './trip-wizard.js';
import { stageCreateWizardHtml, stageEditWizardHtml } from './stage-wizard.js';
import { journalCreateWizardHtml, journalEditWizardHtml } from './journal-wizard.js';
import { expenseWizardHtml } from './expense-wizard.js';
import { itemWizardHtml } from './item-wizard.js';
import { gpxUploadWizardHtml, gpxWizardDataSignature } from './gpx-wizard.js';
import { setPendingGpxFile, getPendingGpxFile, byId } from './wizard-shared.js';

// ---- Contextual action injection ------------------------------------
//
// Renderer-first architecture (see CLAUDE.md):
//   Write affordances — trip Edit/Delete, stage Edit/Delete/Reorder,
//   entry Edit/Delete, cost + Log expense — are emitted directly by
//   the renderer modules in screens/render/. This host no longer
//   injects them via DOM mutation. The remaining responsibility here
//   is owning the wizard overlay (.rf-v2-wizard-host) only.

function removeExisting() {
  document.querySelectorAll('.rf-v2-wizard-host, .rf-v2-cost-cta').forEach((node) => node.remove());
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

// ---- Host signature + markup dispatch -------------------------------
function wizardDataSignature(modeClass, targetKey) {
  if (STATE.wizard === 'gpx-upload') return gpxWizardDataSignature(modeClass);
  if (STATE.wizard === 'trip' || STATE.wizard === 'trip-edit') return tripWizardDataSignature(modeClass, targetKey);
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
    injectCostCta();
    return;
  }

  preloadVisibilityDataForWizard(scheduleRender);
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
  return false;
}

document.addEventListener('routefolk:v2-render', scheduleRender);
document.addEventListener('routefolk:wizard-relayout', scheduleRender);
requestAnimationFrame(renderWizardLayer);
