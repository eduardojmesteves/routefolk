// ============================================================
// routefolk — app.js
// Phase 3.34: final stability closure.
// ============================================================

import { getCurrentUser, onAuthChange } from './lib/auth.js';
import { createStage, updateStage, deleteStage, swapStageOrder } from './lib/stages.js';
import { STATE } from './state/app-state.js';
import { resetSessionState } from './state/session-reset.js';
import { currentTrip, findStageById } from './utils/state-selectors.js';
import { $, esc } from './utils/dom.js';
import { renderHeader, renderNav, bindNav, offlineBannerHtml } from './components/app-shell.js';
import { auditLineHtml } from './components/audit.js';
import { canDeleteTrip, writeDisabledAttr, ensureOnline, friendlyError } from './utils/write-guards.js';
import { stageRouteLabel } from './utils/trip-detail.js';
import { tripStatsStripHtml } from './utils/trip-stats.js';
import { toast } from './components/toast.js';
import { showModal, closeModal } from './components/modal.js';
import { stageFormHtml, readStageForm, validateStageFormAgainstTrip } from './components/stage-form.js';
import { createActionModals } from './components/action-modals.js';
import { createContentEvents } from './components/content-events.js';
import { createDataLoaders } from './state/data-loaders.js';
import { createSessionController } from './state/session-controller.js';
import { createWriteHandlers } from './handlers/write-handlers.js';
import { accessErrorHtml, schemaErrorHtml } from './components/access-schema-cards.js';
import { tripNotFoundHtml } from './components/trip-not-found.js';
import { renderTrips } from './screens/trips-screen.js';
import { renderAccount } from './screens/account-screen.js';
import { renderArchive, bindArchiveMapEvents } from './screens/archive-screen.js';
import { renderTripSummary } from './screens/summary-screen.js';
import { renderTripDetailScreen } from './screens/trip-detail-screen.js';
import { renderStagesSection as renderStagesSectionView } from './screens/trip-detail-stages.js';
import {
  renderExpensesSection as renderExpensesSectionView,
  expensesForTrip as expensesForTripView,
  expenseTotals as expenseTotalsView,
  expenseTotalsHtml as expenseTotalsHtmlView,
} from './screens/trip-detail-expenses.js';

const EXPECTED_SCHEMA_VERSION = '013';


const {
  loadTrips,
  loadProfiles,
  loadStagesForTrip,
  loadEntriesForStage,
  loadExpensesForTrip,
  loadGpxForTrip,
  ensureArchiveGpxGeometries,
  ensureArchiveData,
  openTrip,
} = createDataLoaders({ renderAll });

const {
  handleSignIn,
  handleSignOut,
  loadSignedInData,
  ensureAppAccess,
  ensureSchemaCompatible,
} = createSessionController({
  expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
  renderAll,
  loadProfiles,
  loadTrips,
});

const {
  handleCreateTrip,
  handleUpdateTrip,
  handleDeleteTrip,
  handleCreateEntry,
  handleUpdateEntry,
  handleDeleteEntry,
  handleUploadStageGpx,
  handleDeleteGpx,
  handleCreateExpense,
  handleUpdateExpense,
  handleDeleteExpense,
} = createWriteHandlers({
  loadTrips,
  openTrip,
  renderAll,
  loadEntriesForStage,
  loadGpxForTrip,
  loadExpensesForTrip,
});

const {
  showNewTripModal,
  showEditTripModal,
  showDeleteTripConfirm,
  showNewStageModal,
  showEditStageModal,
  showDeleteStageConfirm,
  showNewEntryModal,
  showEditEntryModal,
  showDeleteEntryConfirm,
  showNewExpenseModal,
  showEditExpenseModal,
  showDeleteExpenseConfirm,
  showGpxUploadModal,
  showDeleteGpxConfirm,
} = createActionModals({
  handleCreateTrip,
  handleUpdateTrip,
  handleDeleteTrip,
  handleCreateStage,
  handleUpdateStage,
  handleDeleteStage,
  handleCreateEntry,
  handleUpdateEntry,
  handleDeleteEntry,
  handleCreateExpense,
  handleUpdateExpense,
  handleDeleteExpense,
  handleUploadStageGpx,
  handleDeleteGpx,
});

const { bindContentEvents } = createContentEvents({
  handleSignIn,
  handleSignOut,
  loadTrips,
  loadSignedInData,
  loadStagesForTrip,
  loadExpensesForTrip,
  loadEntriesForStage,
  loadGpxForTrip,
  ensureArchiveData,
  ensureArchiveGpxGeometries,
  openTrip,
  renderAll,
  ensureOnline,
  handleMoveStage,
  showNewTripModal,
  showEditTripModal,
  showDeleteTripConfirm,
  showNewStageModal,
  showEditStageModal,
  showDeleteStageConfirm,
  showNewEntryModal,
  showEditEntryModal,
  showDeleteEntryConfirm,
  showNewExpenseModal,
  showEditExpenseModal,
  showDeleteExpenseConfirm,
  showGpxUploadModal,
  showDeleteGpxConfirm,
});

// ---------- Navigation ----------
function goTo(tab) {
  STATE.tab = tab;
  STATE.view = 'list';
  STATE.viewTripId = null;
  renderAll();
  if (tab === 'archive') ensureArchiveData();
}

// ---------- Data loaders ----------
// ---------- Trip detail ----------
// ---------- Forms ----------
// ---------- Expenses ----------
// ---------- Handlers ----------
async function handleCreateStage(tripId) {
  if (!ensureOnline()) return;
  const trip = STATE.trips.find((t) => t.id === tripId) || currentTrip();
  if (!trip?.id) {
    toast('Trip is still loading. Try again in a moment.');
    return;
  }

  try {
    const fields = readStageForm();
    validateStageFormAgainstTrip(fields, trip || {});
    await createStage(trip.id, fields);
    closeModal();
    await loadStagesForTrip(trip.id);
    toast('Stage added.');
  } catch (err) {
    console.error(err);
    toast(friendlyError('save stage', err));
  }
}

async function handleUpdateStage(stageId) {
  if (!ensureOnline()) return;
  const stage = findStageById(stageId);
  const trip = tripForStageAction(stage);
  if (!stage?.id) {
    toast('Stage is still loading. Try again in a moment.');
    return;
  }

  try {
    const fields = readStageForm();
    validateStageFormAgainstTrip(fields, trip || {});
    await updateStage(stageId, fields);
    closeModal();
    await loadStagesForTrip(stage.trip_id || trip?.id || STATE.viewTripId);
    toast('Stage updated.');
  } catch (err) {
    console.error(err);
    toast(friendlyError('save stage', err));
  }
}

async function handleDeleteStage(stageId) {
  if (!ensureOnline()) return;
  const stage = findStageById(stageId);
  const trip = tripForStageAction(stage);

  try {
    await deleteStage(stageId);
    closeModal();
    STATE.expandedStages.delete(stageId);
    STATE.expandedSummaryStages.delete(stageId);
    delete STATE.entriesByStage[stageId];
    const reloadTripId = stage?.trip_id || trip?.id || STATE.viewTripId;
    if (reloadTripId) await loadStagesForTrip(reloadTripId);
    toast('Stage deleted.');
  } catch (err) {
    console.error(err);
    toast(friendlyError('delete stage', err));
  }
}

async function handleMoveStage(stageId, direction) {
  if (!ensureOnline()) return;
  const trip = currentTrip();
  if (!trip) return;
  const stages = STATE.stagesByTrip[trip.id] || [];
  const index = stages.findIndex((s) => s.id === stageId);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= stages.length) return;

  try {
    await swapStageOrder(stages[index], stages[targetIndex]);
    await loadStagesForTrip(trip.id);
  } catch (err) {
    console.error(err);
    toast(friendlyError('reorder stages', err));
  }
}

// ---------- Rendering / event binding ----------
function renderAll() {
  renderHeader({
    onSignIn: handleSignIn,
    onAccountClick: () => goTo('account'),
  });
  renderNav();
  renderTab();
}

function renderTab() {
  const content = $('content');
  if (!content) return;

  if (STATE.user && STATE.accessLoading) {
    content.innerHTML = offlineBannerHtml() + `<div class="empty-state"><div class="empty-sub">Checking app access…</div></div>`;
  } else if (STATE.user && STATE.accessError) {
    content.innerHTML = offlineBannerHtml() + accessErrorHtml(STATE.accessError);
  } else if (STATE.user && STATE.schemaLoading) {
    content.innerHTML = offlineBannerHtml() + `<div class="empty-state"><div class="empty-sub">Checking database schema…</div></div>`;
  } else if (STATE.user && STATE.schemaError) {
    content.innerHTML = offlineBannerHtml() + schemaErrorHtml(STATE.schemaError, EXPECTED_SCHEMA_VERSION);
  } else if (STATE.tab === 'account') {
    content.innerHTML = offlineBannerHtml() + renderAccount();
  } else if (STATE.view === 'detail') {
    content.innerHTML = offlineBannerHtml() + renderTripDetailScreen({
      currentTrip,
      tripNotFoundHtml,
      auditLineHtml,
      tripStatsStripHtml,
      renderStagesSection: renderStagesSectionView,
      renderExpensesSection: (trip) => renderExpensesSectionView(trip, { writeDisabledAttr }),
      canDeleteTrip,
      writeDisabledAttr,
    });
  } else if (STATE.view === 'summary') {
    content.innerHTML = offlineBannerHtml() + renderTripSummary({
      currentTrip,
      tripNotFoundHtml,
      expensesForTrip: expensesForTripView,
      tripStatsStripHtml,
      expenseTotalsHtml: expenseTotalsHtmlView,
      expenseTotals: expenseTotalsView,
      stageRouteLabel,
    });
  } else if (STATE.tab === 'archive') {
    content.innerHTML = offlineBannerHtml() + renderArchive();
  } else {
    content.innerHTML = offlineBannerHtml() + renderTrips();
  }

  bindStageActionFallbacks(content);
  try {
    bindContentEvents(content);
  } catch (err) {
    console.error('Content event binding failed:', err);
    toast('Some controls failed to initialise. Stage controls are still available.');
  }
  bindArchiveMapEvents(content, openTrip);
  if (STATE.tab === 'archive' && STATE.archiveViewMode === 'map') ensureArchiveGpxGeometries();
}


function showNewStageModalFallback(trip) {
  if (!trip?.id) {
    toast('Trip is still loading. Try again in a moment.');
    return;
  }

  showModal('Add stage', stageFormHtml({}, trip), [
    { label: 'Add stage', cls: 'btn-primary', fn: () => handleCreateStage(trip.id) },
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
  ]);

  setTimeout(() => $('sfStartLoc')?.focus(), 50);
}

function showEditStageModalFallback(stage, trip = {}) {
  if (!stage?.id) {
    toast('Stage is still loading. Try again in a moment.');
    return;
  }

  showModal('Edit stage', stageFormHtml(stage, trip || {}), [
    { label: 'Save', cls: 'btn-primary', fn: () => handleUpdateStage(stage.id) },
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
  ]);
}

function showDeleteStageConfirmFallback(stage) {
  if (!stage?.id) {
    toast('Stage is still loading. Try again in a moment.');
    return;
  }

  showModal('Delete stage',
    `<div style="font-size:14px;line-height:1.5;color:#c5d0e0;">
      Delete <strong>${esc(stageRouteLabel(stage))}</strong>? This also deletes its journal entries.
    </div>`,
    [
      { label: 'Delete', cls: 'btn-danger', fn: () => handleDeleteStage(stage.id) },
      { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    ]);
}

function tripForStageAction(stage = null) {
  if (stage?.trip_id) {
    return STATE.trips.find((trip) => trip.id === stage.trip_id) || currentTrip();
  }
  return currentTrip() || STATE.trips.find((trip) => trip.id === STATE.viewTripId) || null;
}

function bindStageActionFallbacks(content) {
  content.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const addStageBtn = target.closest('#addStageBtn');
    if (addStageBtn && content.contains(addStageBtn)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (!ensureOnline()) return;
      const trip = tripForStageAction();
      if (!trip) {
        toast('Trip is still loading. Try again in a moment.');
        return;
      }
      showNewStageModalFallback(trip);
      return;
    }

    const stageActionBtn = target.closest('[data-stage-action]');
    if (!stageActionBtn || !content.contains(stageActionBtn)) return;

    const action = stageActionBtn.dataset.stageAction;
    const stageId = stageActionBtn.dataset.id;
    if (!stageId || !action) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (!ensureOnline()) return;

    if (action === 'up' || action === 'down') {
      handleMoveStage(stageId, action);
      return;
    }

    const stage = findStageById(stageId);
    if (!stage) {
      toast('Stage is still loading. Try again in a moment.');
      return;
    }

    const trip = tripForStageAction(stage);

    if (action === 'edit') {
      showEditStageModalFallback(stage, trip || {});
      return;
    }

    if (action === 'delete') {
      showDeleteStageConfirmFallback(stage);
    }
  }, true);
}

async function init() {
  STATE.user = await getCurrentUser();
  bindNav((tab) => goTo(tab));
  window.addEventListener('online', () => {
    STATE.isOnline = true;
    renderAll();
    toast('Back online.');
  });
  window.addEventListener('offline', () => {
    STATE.isOnline = false;
    renderAll();
    toast('You are offline. Changes are disabled.');
  });
  renderAll();

  if (STATE.user) await loadSignedInData();

  onAuthChange(async (user) => {
    resetSessionState(user);
    renderAll();
    if (STATE.user) await loadSignedInData();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

init().catch((err) => {
  console.error(err);
  toast(err.message || 'App failed to start.');
});
