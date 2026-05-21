
// ============================================================
// routefolk — action-modals.js
// Modal-opening orchestration for trip/stage/journal/expense/GPX actions.
// ============================================================

import { STATE } from '../state/app-state.js';
import { $, esc } from '../utils/dom.js';
import { todayIsoDate } from '../utils/datetime.js';
import { fmtEuro } from '../utils/format.js';
import { EXPENSE_CATEGORY_META } from '../constants/app-constants.js';
import { showModal, closeModal } from './modal.js';
import { tripFormHtml } from './trip-form.js';
import { stageFormHtml } from './stage-form.js';
import { entryFormHtml, bindEntryTimeToggle } from './journal-form.js';
import { expenseFormHtml } from './expense-form.js';
import { gpxUploadFormHtml } from './gpx-form.js';
import { stageRouteLabel } from '../utils/trip-detail.js';
import { findStageById } from '../utils/state-selectors.js';
import { trackFileName } from '../lib/gpx.js';

async function preloadTripVisibilityData(trip = null) {
  await window.routefolkData?.loadSelectableTripMembers?.({ quiet: true });
  if (trip?.id) await window.routefolkData?.loadTripMembersForTrip?.(trip.id, { quiet: true });
}

export function createActionModals(handlers) {
  const {
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
  } = handlers;

  async function showNewTripModal() {
    await preloadTripVisibilityData();
    showModal('New trip', tripFormHtml({ status: 'planning', visibility: 'group' }), [
      { label: 'Create', cls: 'btn-primary', fn: handleCreateTrip },
      { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    ]);
    setTimeout(() => $('tfTitle')?.focus(), 50);
  }

  async function showEditTripModal(trip) {
    await preloadTripVisibilityData(trip);
    showModal('Edit trip', tripFormHtml(trip), [
      { label: 'Save', cls: 'btn-primary', fn: () => handleUpdateTrip(trip.id) },
      { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    ]);
  }

  function showDeleteTripConfirm(trip) {
    showModal('Delete trip',
      `<div style="font-size:14px;line-height:1.5;color:#c5d0e0;">
        Permanently delete <strong>${esc(trip.title)}</strong>? This also deletes its stages, journal entries, expenses, and any GPX tracks.
        <br><br>
        <span style="color:#6b7a93;">For trips you decided not to take, set the status to <em>Cancelled</em> instead — that keeps the record.</span>
      </div>`,
      [
        { label: 'Delete', cls: 'btn-danger', fn: () => handleDeleteTrip(trip.id) },
        { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
      ]);
  }

  function showNewStageModal(trip) {
    showModal('Add stage', stageFormHtml({}, trip), [
      { label: 'Add stage', cls: 'btn-primary', fn: () => handleCreateStage(trip.id) },
      { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    ]);
    setTimeout(() => $('sfStartLoc')?.focus(), 50);
  }

  function showEditStageModal(stage, trip) {
    showModal('Edit stage', stageFormHtml(stage, trip), [
      { label: 'Save', cls: 'btn-primary', fn: () => handleUpdateStage(stage.id) },
      { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    ]);
  }

  function showDeleteStageConfirm(stage) {
    showModal('Delete stage',
      `<div style="font-size:14px;line-height:1.5;color:#c5d0e0;">
        Delete <strong>${esc(stageRouteLabel(stage))}</strong>? This also deletes its journal entries.
      </div>`,
      [
        { label: 'Delete', cls: 'btn-danger', fn: () => handleDeleteStage(stage.id) },
        { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
      ]);
  }

  function showNewEntryModal(stageId) {
    const stage = findStageById(stageId);
    showModal('Add journal entry', entryFormHtml({ entry_type: 'stop' }, stage), [
      { label: 'Add entry', cls: 'btn-primary', fn: () => handleCreateEntry(stageId) },
      { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    ]);
    bindEntryTimeToggle();
    setTimeout(() => $('jfTitle')?.focus(), 50);
  }

  function showEditEntryModal(stageId, entry) {
    const stage = findStageById(stageId);
    showModal('Edit journal entry', entryFormHtml(entry, stage), [
      { label: 'Save', cls: 'btn-primary', fn: () => handleUpdateEntry(stageId, entry.id) },
      { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    ]);
    bindEntryTimeToggle();
  }

  function showDeleteEntryConfirm(stageId, entry) {
    showModal('Delete entry',
      `<div style="font-size:14px;line-height:1.5;color:#c5d0e0;">
        Delete <strong>${esc(entry.title || 'this journal entry')}</strong>?
      </div>`,
      [
        { label: 'Delete', cls: 'btn-danger', fn: () => handleDeleteEntry(stageId, entry.id) },
        { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
      ]);
  }

  function showNewExpenseModal(trip) {
    showModal('New expense', expenseFormHtml(trip, { user_id: STATE.user?.id, category: 'food_drinks', date: todayIsoDate() }), [
      { label: 'Add expense', cls: 'btn-primary', fn: () => handleCreateExpense(trip.id) },
      { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    ]);
    setTimeout(() => $('efAmount')?.focus(), 50);
  }

  function showEditExpenseModal(trip, expense) {
    showModal('Edit expense', expenseFormHtml(trip, expense), [
      { label: 'Save', cls: 'btn-primary', fn: () => handleUpdateExpense(trip.id, expense.id) },
      { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    ]);
  }

  function showDeleteExpenseConfirm(trip, expense) {
    const meta = EXPENSE_CATEGORY_META[expense.category] || EXPENSE_CATEGORY_META.other;
    showModal('Delete expense',
      `<div style="font-size:14px;line-height:1.5;color:#c5d0e0;">
        Delete <strong>${esc(meta.label)} · ${esc(fmtEuro(expense.amount))}</strong>?
      </div>`,
      [
        { label: 'Delete', cls: 'btn-danger', fn: () => handleDeleteExpense(trip.id, expense.id) },
        { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
      ]);
  }

  function showGpxUploadModal(trip, stage) {
    showModal('Upload GPX', gpxUploadFormHtml(stage), [
      { label: 'Upload GPX', cls: 'btn-primary', fn: () => handleUploadStageGpx(trip.id, stage.id) },
      { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    ]);
  }

  function showDeleteGpxConfirm(track) {
    showModal('Delete GPX track',
      `<div style="font-size:14px;line-height:1.5;color:#c5d0e0;">
        Delete <strong>${esc(trackFileName(track))}</strong>? This removes the stored GPX file and its track record.
      </div>`,
      [
        { label: 'Delete', cls: 'btn-danger', fn: () => handleDeleteGpx(track) },
        { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
      ]);
  }

  return {
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
  };
}
