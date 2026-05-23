// ============================================================
// routefolk — screens/wizards/wizard-host.js
// Wizard host container management: builds/removes the overlay,
// injects contextual action buttons, owns the render loop and
// the routefolk:v2-render listener.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import { isArchivedTrip, writeDisabledAttr } from '../../utils/write-guards.js';
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
function removeExisting() {
  document.querySelectorAll('.rf-v2-wizard-host, .rf-v2-cost-cta, .rf-v2-hero-actions, .rf-v2-stage-actions, .rf-v2-entry-actions').forEach((node) => node.remove());
}

function injectTripActions() {
  const trip = activeTrip();
  if (!trip || !STATE.viewTripId || STATE.wizard) return;
  if (!['trips', 'archive'].includes(STATE.tab)) return;
  const target = document.querySelector('.rf-d2-hero .rf-d2-hero-stamps, .rf-clean-trip-head .rf-clean-stamps, .rf-m2-detail-hero');
  if (!target || target.querySelector('.rf-v2-hero-actions')) return;
  const dis = writeDisabledAttr();
  const wrap = document.createElement('div');
  wrap.className = 'rf-v2-hero-actions';
  wrap.innerHTML = `<button class="rf-d2-btn" data-action="rf-v2-edit-trip" type="button"${dis}>Edit trip</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-trip" type="button"${dis}>Delete</button>`;
  target.appendChild(wrap);
}

function injectStageActions() {
  // Stage header controls are now owned by the stage renderer. Do not
  // inject the legacy Edit/Delete row here, otherwise desktop receives a
  // duplicate action block underneath the new Navigate/Reorder controls.
}

function injectEntryActions() {
  if (STATE.wizard) return;
  const trip = activeTrip();
  if (isArchivedTrip(trip)) return;
  const dis = writeDisabledAttr();
  document.querySelectorAll('.rf-d2-entry, .rf-m2-entry').forEach((entryNode) => {
    if (entryNode.querySelector('.rf-v2-entry-actions')) return;
    const title = entryNode.querySelector('.rf-d2-entry-title, .rf-m2-entry-title')?.textContent?.trim();
    const stage = selectedStage();
    const entry = stage ? entriesForStage(stage.id).find((candidate) => (candidate.title || 'Untitled') === title) : null;
    if (!entry) return;
    const wrap = document.createElement('div');
    wrap.className = 'rf-v2-entry-actions';
    wrap.innerHTML = `<button class="rf-d2-btn" data-action="rf-v2-edit-entry" data-entry-id="${esc(entry.id)}" type="button"${dis}>Edit</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-entry" data-entry-id="${esc(entry.id)}" type="button"${dis}>Delete</button>`;
    entryNode.appendChild(wrap);
  });
}

function injectCostCta() {
  const trip = activeTrip();
  if (!trip || STATE.tab !== 'trips' || STATE.view !== 'costs' || STATE.wizard) return;
  if (isArchivedTrip(trip)) return;
  const target = document.querySelector('.rf-d2-ledger-hero, .rf-m2-ledger-hero');
  if (!target || target.querySelector('.rf-v2-cost-cta')) return;
  const dis = writeDisabledAttr();
  const wrap = document.createElement('div');
  wrap.className = 'rf-v2-cost-cta';
  wrap.innerHTML = `<button class="rf-d2-btn rf-v2-add-expense-btn is-primary" data-action="rf-v2-add-expense" type="button"${dis}>+ Log expense</button>`;
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
    injectTripActions();
    injectStageActions();
    injectEntryActions();
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

export async function dispatchWizardAction(event, btn, action) {
  if (action === 'rf-v2-cancel-wizard') { setDraftTripVisibility(null); claim(event); STATE.wizard = null; STATE.editTargetId = null; clearGpxUploadState(); renderAll(); return true; }
  if (action === 'rf-v2-cancel-gpx-upload') { claim(event); STATE.wizard = null; clearGpxUploadState(); renderAll(); return true; }
  return false;
}

document.addEventListener('routefolk:v2-render', scheduleRender);
document.addEventListener('routefolk:wizard-relayout', scheduleRender);
requestAnimationFrame(renderWizardLayer);
