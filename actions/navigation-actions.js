// ============================================================
// routefolk — actions/navigation-actions.js
// Navigation domain: primary tab switching, trip selection,
// archived trip selection, back navigation, and Navigate sheet.
// ============================================================

import { dispatchAppAction } from '../screens/app-actions.js';
import { STATE } from '../state/app-state.js';
import { openNavTarget, probeWaze } from '../utils/navigation-url.js';
import { toast } from '../components/toast.js';

const NAVIGATION_SUFFIXES = [
  'nav',
  'select-trip',
  'select-archived',
  'back-to-trips',
  'back-to-archive',
  'back-to-stages',
  'tab',
  'sign-in',
  'sign-out',
  'status-filter',
  'search-toggle',
];

const NAVIGATION_EXACT = new Set([
  'rf-palette-select',
  'rf-m2-open-nav-sheet',
  'rf-m2-close-nav-sheet',
  'rf-m2-nav-open',
  'rf-m2-nav-direct',
  'rf-m2-toggle-nav-remember',
  'rf-m2-add-route',
]);

function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function renderSoon() {
  window.routefolkData?.renderAll?.();
  window.__routefolkV2Render?.();
}

function activeTrip() {
  return STATE.trips.find((trip) => trip.id === (STATE.viewTripId || (STATE.tab === 'archive' ? STATE.selectedArchiveTripId : STATE.selectedTripId))) || null;
}

function stageById(stageId) {
  const trip = activeTrip();
  const stages = Array.isArray(STATE.stagesByTrip[trip?.id]) ? STATE.stagesByTrip[trip.id] : [];
  return stages.find((stage) => stage.id === stageId) || stages.find((stage) => stage.id === STATE.selectedStageId) || stages[0] || null;
}

function rememberDefault(target) {
  try { localStorage.setItem('rf_nav_default', target); } catch {}
}

export function owns(action) {
  return NAVIGATION_EXACT.has(action)
    || NAVIGATION_SUFFIXES.some((suffix) => action.endsWith(suffix));
}

async function handleNavigateAction(event, btn, action) {
  if (action === 'rf-m2-open-nav-sheet') {
    claim(event);
    const stageId = btn.dataset.stageId || STATE.selectedStageId;
    STATE.navSheet = {
      stageId,
      wazeInstalled: await probeWaze(),
      remember: false,
    };
    renderSoon();
    return true;
  }

  if (action === 'rf-m2-close-nav-sheet') {
    claim(event);
    STATE.navSheet = null;
    renderSoon();
    return true;
  }

  if (action === 'rf-m2-toggle-nav-remember') {
    claim(event);
    if (STATE.navSheet) STATE.navSheet = { ...STATE.navSheet, remember: !STATE.navSheet.remember };
    renderSoon();
    return true;
  }

  if (action === 'rf-m2-nav-open' || action === 'rf-m2-nav-direct') {
    claim(event);
    const target = btn.dataset.target || 'google';
    const stage = stageById(btn.dataset.stageId || STATE.navSheet?.stageId);
    if (!stage) return true;
    try {
      await openNavTarget(target, stage);
      if (STATE.navSheet?.remember && target !== 'copy') rememberDefault(target);
    } catch (error) {
      console.warn('[routefolk navigate] failed', error);
      toast(error?.message || 'Could not open navigation.');
    }
    STATE.navSheet = null;
    renderSoon();
    return true;
  }

  if (action === 'rf-m2-add-route') {
    claim(event);
    const stageId = btn.dataset.stageId || STATE.selectedStageId;
    STATE.selectedStageId = stageId;
    STATE.editTargetId = stageId;
    STATE.wizard = 'stage-edit';
    STATE.navSheet = null;
    renderSoon();
    requestAnimationFrame(() => document.getElementById('v2-stage-route-edit')?.focus?.());
    return true;
  }

  return false;
}

export async function handle(event, btn, action) {
  const handled = await handleNavigateAction(event, btn, action);
  if (handled) return true;
  return dispatchAppAction(event, btn, action);
}
