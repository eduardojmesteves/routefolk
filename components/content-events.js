// ============================================================
// routefolk — content-events.js
// Main content event binding for app views.
// Claude Design UI reset.
// ============================================================

import { STATE } from '../state/app-state.js';
import { TRIPS_SCREEN_STATUSES } from '../constants/app-constants.js';
import { tripResultsHtml } from '../screens/trips-screen.js';
import { archiveResultsHtml, bindArchiveMapEvents } from '../screens/archive-screen.js';
import { expensesForTrip as expensesForTripView } from '../screens/trip-detail-expenses.js';
import { currentTrip, findEntry, findStageById } from '../utils/state-selectors.js';
import { gpxTracksForTrip } from '../utils/trip-detail.js';

export function createContentEvents(actions) {
  const {
    handleSignIn, handleSignOut, loadTrips, loadSignedInData, loadStagesForTrip, loadExpensesForTrip,
    loadEntriesForStage, loadGpxForTrip, ensureArchiveData, ensureArchiveGpxGeometries, openTrip, renderAll,
    ensureOnline, handleMoveStage, showNewTripModal, showEditTripModal, showDeleteTripConfirm, showNewStageModal,
    showEditStageModal, showDeleteStageConfirm, showNewEntryModal, showEditEntryModal, showDeleteEntryConfirm,
    showNewExpenseModal, showEditExpenseModal, showDeleteExpenseConfirm, showGpxUploadModal, showDeleteGpxConfirm,
    addPackingItem, togglePackingItem, deletePackingItem,
  } = actions;

  function tripForCurrentView() {
    return currentTrip() || STATE.trips.find((trip) => trip.id === STATE.viewTripId) || null;
  }

  function tripForStage(stage) {
    if (!stage) return tripForCurrentView();
    return tripForCurrentView() || STATE.trips.find((trip) => trip.id === stage.trip_id) || null;
  }

  function bindTripCards(root) {
    root.querySelectorAll('[data-trip-id]').forEach((btn) => {
      btn.addEventListener('click', () => openTrip(btn.dataset.tripId));
    });
  }

  function refreshTripResults(content) {
    const results = content.querySelector('#tripResults');
    if (results) {
      results.innerHTML = tripResultsHtml();
      bindTripCards(results);
    } else {
      renderAll();
    }
  }

  function toggleStageJournal(stageId) {
    if (STATE.expandedStages.has(stageId)) {
      STATE.expandedStages.delete(stageId);
      renderAll();
      return;
    }
    STATE.expandedStages.add(stageId);
    if (!STATE.entriesByStage[stageId] || STATE.entriesByStage[stageId] === 'loading') {
      loadEntriesForStage(stageId);
    } else {
      renderAll();
    }
  }

  function toggleSummaryStage(stageId) {
    if (!stageId) return;
    if (STATE.expandedSummaryStages.has(stageId)) {
      STATE.expandedSummaryStages.delete(stageId);
      renderAll();
      return;
    }
    STATE.expandedSummaryStages.add(stageId);
    if (!STATE.entriesByStage[stageId] || STATE.entriesByStage[stageId] === 'loading') {
      STATE.entriesByStage[stageId] = 'loading';
      renderAll();
      loadEntriesForStage(stageId, { quiet: true });
      return;
    }
    renderAll();
  }

  function toggleStageGpx(stageId) {
    if (!stageId) return;
    if (STATE.expandedGpxStages.has(stageId)) {
      STATE.expandedGpxStages.delete(stageId);
      renderAll();
      return;
    }
    STATE.expandedGpxStages.add(stageId);
    const trip = currentTrip();
    if (trip && !Array.isArray(STATE.gpxByTrip[trip.id])) loadGpxForTrip(trip.id);
    else renderAll();
  }

  function bindContentEvents(content) {
    content.querySelector('#emptySignInBtn')?.addEventListener('click', handleSignIn);
    content.querySelector('#accountSignInBtn')?.addEventListener('click', handleSignIn);
    content.querySelector('#signOutBtn')?.addEventListener('click', handleSignOut);
    content.querySelector('#retryTripsBtn')?.addEventListener('click', loadTrips);
    content.querySelector('#retryAccessBtn')?.addEventListener('click', loadSignedInData);
    content.querySelector('#retrySchemaBtn')?.addEventListener('click', loadSignedInData);
    content.querySelector('#retryStagesBtn')?.addEventListener('click', () => { if (STATE.viewTripId) loadStagesForTrip(STATE.viewTripId); });
    content.querySelector('#retryExpensesBtn')?.addEventListener('click', () => { if (STATE.viewTripId) loadExpensesForTrip(STATE.viewTripId); });
    content.querySelector('#retryArchiveDataBtn')?.addEventListener('click', ensureArchiveData);

    content.querySelector('#tripSearchInput')?.addEventListener('input', (e) => {
      STATE.tripSearch = e.target.value || '';
      refreshTripResults(content);
    });
    content.querySelectorAll('[data-search-pill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const drawer = content.querySelector('#searchDrawer');
        const input = content.querySelector('#tripSearchInput');
        const open = drawer && !drawer.hidden;
        if (open && STATE.tripSearch.trim()) {
          STATE.tripSearch = '';
          if (input) input.value = '';
          renderAll();
          return;
        }
        if (drawer) drawer.hidden = !open;
        if (drawer && !drawer.hidden) setTimeout(() => input?.focus(), 0);
      });
    });


    content.querySelectorAll('[data-status-chip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.statusChip || 'all';
        STATE.tripStatusFilter = TRIPS_SCREEN_STATUSES.includes(next) ? next : 'all';
        renderAll();
      });
    });

    content.querySelector('#tripStatusFilter')?.addEventListener('change', (e) => {
      STATE.tripStatusFilter = TRIPS_SCREEN_STATUSES.includes(e.target.value) ? e.target.value : 'all';
      refreshTripResults(content);
    });

    content.querySelectorAll('[data-archive-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        STATE.archiveViewMode = btn.dataset.archiveView || 'list';
        renderAll();
        if (STATE.archiveViewMode === 'map') ensureArchiveGpxGeometries();
      });
    });

    content.querySelectorAll('[data-archive-layer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextLayer = btn.dataset.archiveLayer || 'heatmap';
        STATE.archiveMapLayer = ['heatmap', 'hybrid', 'routes'].includes(nextLayer) ? nextLayer : 'heatmap';
        renderAll();
      });
    });

    content.querySelector('#archiveFiltersToggle')?.addEventListener('click', () => {
      STATE.archiveFiltersOpen = !STATE.archiveFiltersOpen;
      renderAll();
    });

    content.querySelector('#archiveSearchInput')?.addEventListener('input', (e) => {
      STATE.archiveSearch = e.target.value || '';
      const results = content.querySelector('#archiveResults');
      if (results) {
        results.innerHTML = archiveResultsHtml();
        bindTripCards(results);
        if (STATE.archiveViewMode === 'map') {
          bindArchiveMapEvents(results, openTrip);
          ensureArchiveGpxGeometries();
        }
      }
    });

    content.querySelector('#archiveSearchPillBtn')?.addEventListener('click', () => {
      const drawer = content.querySelector('#archiveSearchDrawer');
      const input = content.querySelector('#archiveSearchInput');
      const open = drawer && !drawer.hidden;
      if (open && STATE.archiveSearch.trim()) {
        STATE.archiveSearch = '';
        if (input) input.value = '';
        renderAll();
        return;
      }
      if (drawer) drawer.hidden = !open;
      if (drawer && !drawer.hidden) setTimeout(() => input?.focus(), 0);
    });

    content.querySelectorAll('[data-archive-status-chip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        STATE.archiveStatusFilter = btn.dataset.archiveStatusChip || 'all';
        renderAll();
      });
    });

    content.querySelector('#archiveStatusFilter')?.addEventListener('change', (e) => {
      STATE.archiveStatusFilter = e.target.value || 'all';
      const results = content.querySelector('#archiveResults');
      if (results) {
        results.innerHTML = archiveResultsHtml();
        bindTripCards(results);
        if (STATE.archiveViewMode === 'map') {
          bindArchiveMapEvents(results, openTrip);
          ensureArchiveGpxGeometries();
        }
      }
    });

    content.querySelectorAll('[data-detail-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.detailTab || 'detail';
        STATE.view = key;
        if (key !== 'detail') STATE.selectedStageId = null;
        renderAll();
      });
    });

    content.querySelectorAll('[data-stage-select]').forEach((row) => {
      row.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('button,a,input,select,textarea')) return;
        STATE.selectedStageId = row.dataset.stageSelect || null;
        renderAll();
        const stage = findStageById(STATE.selectedStageId);
        if (stage && (!STATE.entriesByStage[stage.id] || STATE.entriesByStage[stage.id] === 'loading')) {
          loadEntriesForStage(stage.id, { quiet: true });
        }
      });
    });

    content.querySelector('#packingForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const trip = tripForCurrentView();
      if (!trip) return;
      const form = event.currentTarget;
      addPackingItem?.(trip.id, {
        text: form.elements.text?.value || '',
        category: form.elements.category?.value || 'Other',
        status: form.elements.status?.value || 'planned',
      });
      renderAll();
    });

    content.querySelectorAll('[data-pack-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const trip = tripForCurrentView();
        if (!trip) return;
        togglePackingItem?.(trip.id, btn.dataset.packToggle);
        renderAll();
      });
    });

    content.querySelectorAll('[data-pack-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const trip = tripForCurrentView();
        if (!trip) return;
        deletePackingItem?.(trip.id, btn.dataset.packDelete);
        renderAll();
      });
    });

    content.querySelector('#newTripBtn')?.addEventListener('click', () => { if (ensureOnline()) showNewTripModal(); });
    content.querySelector('#backToTripsBtn')?.addEventListener('click', () => { STATE.view = 'list'; STATE.viewTripId = null; STATE.selectedStageId = null; renderAll(); });
    content.querySelector('#backToDetailBtn')?.addEventListener('click', () => { STATE.view = 'detail'; renderAll(); });
    content.querySelector('#summaryTripBtn')?.addEventListener('click', () => { STATE.view = 'summary'; renderAll(); });
    content.querySelector('#editTripBtn')?.addEventListener('click', () => { if (!ensureOnline()) return; const trip = currentTrip(); if (trip) showEditTripModal(trip); });
    content.querySelector('#deleteTripBtn')?.addEventListener('click', () => { if (!ensureOnline()) return; const trip = currentTrip(); if (trip) showDeleteTripConfirm(trip); });
    content.querySelector('#addStageBtn')?.addEventListener('click', () => { if (!ensureOnline()) return; const trip = tripForCurrentView(); if (trip) showNewStageModal(trip); });
    content.querySelector('#addExpenseBtn')?.addEventListener('click', () => { if (!ensureOnline()) return; const trip = currentTrip(); if (trip) showNewExpenseModal(trip); });

    bindTripCards(content);

    content.querySelectorAll('[data-summary-stage-id]').forEach((btn) => btn.addEventListener('click', () => toggleSummaryStage(btn.dataset.summaryStageId)));

    content.querySelectorAll('[data-stage-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.stageAction;
        const id = btn.dataset.id;
        const stage = findStageById(id);
        const trip = tripForStage(stage);
        if (!stage && action !== 'up' && action !== 'down') return;
        if (!ensureOnline()) return;
        if (action === 'up' || action === 'down') handleMoveStage(id, action);
        if (action === 'edit' && stage) showEditStageModal(stage, trip || {});
        if (action === 'delete' && stage) showDeleteStageConfirm(stage);
      });
    });

    content.querySelectorAll('[data-stage-id]').forEach((btn) => btn.addEventListener('click', () => toggleStageJournal(btn.dataset.stageId)));
    content.querySelectorAll('[data-stage-add-entry]').forEach((btn) => btn.addEventListener('click', () => { if (ensureOnline()) showNewEntryModal(btn.dataset.stageAddEntry); }));
    content.querySelectorAll('[data-gpx-toggle]').forEach((btn) => btn.addEventListener('click', () => toggleStageGpx(btn.dataset.gpxToggle)));

    content.querySelectorAll('[data-stage-gpx-upload]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!ensureOnline()) return;
        const stage = findStageById(btn.dataset.stageGpxUpload);
        const trip = tripForStage(stage);
        if (trip && stage) showGpxUploadModal(trip, stage);
      });
    });

    content.querySelectorAll('[data-entry-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const entryId = btn.dataset.id;
        const { stageId, entry } = findEntry(entryId);
        if (!entry || !ensureOnline()) return;
        if (btn.dataset.entryAction === 'edit') showEditEntryModal(stageId, entry);
        if (btn.dataset.entryAction === 'delete') showDeleteEntryConfirm(stageId, entry);
      });
    });

    content.querySelectorAll('[data-gpx-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const trip = currentTrip();
        if (!trip || !ensureOnline()) return;
        const track = gpxTracksForTrip(trip.id).find((t) => t.id === btn.dataset.id);
        if (track && btn.dataset.gpxAction === 'delete') showDeleteGpxConfirm(track);
      });
    });

    content.querySelectorAll('[data-expense-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const trip = currentTrip();
        if (!trip || !ensureOnline()) return;
        const expense = expensesForTripView(trip.id).find((e) => e.id === btn.dataset.id);
        if (!expense) return;
        if (btn.dataset.expenseAction === 'edit') showEditExpenseModal(trip, expense);
        if (btn.dataset.expenseAction === 'delete') showDeleteExpenseConfirm(trip, expense);
      });
    });
  }

  return { bindContentEvents, bindTripCards, toggleStageJournal, toggleStageGpx, toggleSummaryStage };
}
