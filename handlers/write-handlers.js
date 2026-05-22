// ============================================================
// routefolk — write-handlers.js
// Non-stage write handlers extracted from app.js.
// ============================================================

import { createTrip, updateTrip, deleteTrip } from '../lib/trips.js';
import { replaceTripMembers } from '../lib/trip-members.js';
import { createExpense, updateExpense, deleteExpense } from '../lib/expenses.js';
import { createEntry, updateEntry, deleteEntry } from '../lib/journal.js';
import { uploadStageGpx, deleteGpxTrack } from '../lib/gpx.js';
import { STATE } from '../state/app-state.js';
import { $ } from '../utils/dom.js';
import { findStageById } from '../utils/state-selectors.js';
import { canDeleteTrip, ensureOnline, friendlyError, friendlyGpxError } from '../utils/write-guards.js';
import { toast } from '../components/toast.js';
import { closeModal } from '../components/modal.js';
import { readTripForm } from '../components/trip-form.js';
import { readEntryForm } from '../components/journal-form.js';
import { readExpenseForm } from '../components/expense-form.js';

function assertSelectedVisibilityHasMembers(fields) {
  if (fields.visibility === 'selected' && !fields.selected_member_emails?.length) {
    throw new Error('Selected-user visibility requires at least one selected user.');
  }
}

export function createWriteHandlers({
  loadTrips,
  openTrip,
  renderAll,
  loadEntriesForStage,
  loadGpxForTrip,
  loadExpensesForTrip,
}) {
  async function handleCreateTrip() {
    if (!ensureOnline()) return;
    try {
      const fields = readTripForm();
      assertSelectedVisibilityHasMembers(fields);
      const trip = await createTrip({ ...fields, visibility: fields.visibility === 'selected' ? 'private' : fields.visibility });

      if (fields.visibility === 'selected') {
        await replaceTripMembers(trip.id, fields.selected_member_emails);
        await updateTrip(trip.id, { visibility: 'selected' });
      }

      closeModal();
      await loadTrips();
      await openTrip(trip.id);
      toast('Trip created.');
    } catch (err) {
      console.error(err);
      toast(friendlyError('save trip', err));
    }
  }

  async function handleUpdateTrip(tripId) {
    if (!ensureOnline()) return;
    try {
      const fields = readTripForm();
      const trip = STATE.trips.find((t) => t.id === tripId);
      const canManageVisibility = trip?.created_by === STATE.user?.id;

      if (canManageVisibility) {
        assertSelectedVisibilityHasMembers(fields);
        if (fields.visibility === 'selected') {
          await replaceTripMembers(tripId, fields.selected_member_emails);
        }
        await updateTrip(tripId, fields);
      } else {
        const { selected_member_emails, visibility, ...contentFields } = fields;
        await updateTrip(tripId, contentFields);
      }

      closeModal();
      await loadTrips();
      renderAll();
      toast('Trip updated.');
    } catch (err) {
      console.error(err);
      toast(friendlyError('save trip', err));
    }
  }

  async function handleDeleteTrip(tripId) {
    if (!ensureOnline()) return;
    const trip = STATE.trips.find((t) => t.id === tripId);
    if (trip && !canDeleteTrip(trip)) {
      toast('Only the trip creator can delete this trip.');
      closeModal();
      return;
    }
    try {
      await deleteTrip(tripId);
      closeModal();
      STATE.view = 'list';
      STATE.viewTripId = null;
      await loadTrips();
      toast('Trip deleted.');
    } catch (err) {
      console.error(err);
      toast(friendlyError('delete trip', err));
    }
  }

  async function handleCreateEntry(stageId) {
    if (!ensureOnline()) return;
    try {
      await createEntry(stageId, readEntryForm(findStageById(stageId)));
      closeModal();
      await loadEntriesForStage(stageId, { quiet: true });
      toast('Entry added.');
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || '');
      toast(msg.startsWith('Journal entry') ? msg : friendlyError('save journal entry', err));
    }
  }

  async function handleUpdateEntry(stageId, entryId) {
    if (!ensureOnline()) return;
    try {
      await updateEntry(entryId, readEntryForm(findStageById(stageId)));
      closeModal();
      await loadEntriesForStage(stageId, { quiet: true });
      toast('Entry updated.');
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || '');
      toast(msg.startsWith('Journal entry') ? msg : friendlyError('save journal entry', err));
    }
  }

  async function handleDeleteEntry(stageId, entryId) {
    if (!ensureOnline()) return;
    try {
      await deleteEntry(entryId);
      closeModal();
      await loadEntriesForStage(stageId, { quiet: true });
      toast('Entry deleted.');
    } catch (err) {
      console.error(err);
      toast(friendlyError('delete journal entry', err));
    }
  }

  async function handleUploadStageGpx(tripId, stageId) {
    if (!ensureOnline()) return;
    const file = $('gpxFileInput')?.files?.[0];
    if (!file) {
      toast('Choose a GPX file first.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      toast('Choose a valid .gpx file.');
      return;
    }
    if (file.size <= 0) {
      toast('This GPX file is empty. Choose another file.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('This GPX file is too large. Keep GPX files under 8 MB for now.');
      return;
    }

    try {
      const { record, geometry } = await uploadStageGpx({ tripId, stageId, file });
      STATE.gpxGeometryByTrack[record.id] = geometry;
      closeModal();
      await loadGpxForTrip(tripId, { quiet: true });
      toast('GPX uploaded.');
    } catch (err) {
      console.error(err);
      toast(friendlyGpxError('upload GPX', err));
    }
  }

  async function handleDeleteGpx(track) {
    if (!ensureOnline()) return;
    try {
      await deleteGpxTrack(track);
      delete STATE.gpxGeometryByTrack[track.id];
      closeModal();
      await loadGpxForTrip(track.trip_id, { quiet: true });
      toast('GPX deleted.');
    } catch (err) {
      console.error(err);
      toast(friendlyGpxError('delete GPX', err));
    }
  }

  async function handleCreateExpense(tripId) {
    if (!ensureOnline()) return;
    const trip = STATE.trips.find((t) => t.id === tripId);
    if (!trip) return;
    try {
      await createExpense(tripId, readExpenseForm(trip));
      closeModal();
      await loadExpensesForTrip(tripId, { quiet: true });
      toast('Expense added.');
    } catch (err) {
      console.error(err);
      toast(friendlyError('save expense', err));
    }
  }

  async function handleUpdateExpense(tripId, expenseId) {
    if (!ensureOnline()) return;
    const trip = STATE.trips.find((t) => t.id === tripId);
    if (!trip) return;
    try {
      await updateExpense(expenseId, readExpenseForm(trip));
      closeModal();
      await loadExpensesForTrip(tripId, { quiet: true });
      toast('Expense updated.');
    } catch (err) {
      console.error(err);
      toast(friendlyError('save expense', err));
    }
  }

  async function handleDeleteExpense(tripId, expenseId) {
    if (!ensureOnline()) return;
    try {
      await deleteExpense(expenseId);
      closeModal();
      await loadExpensesForTrip(tripId, { quiet: true });
      toast('Expense deleted.');
    } catch (err) {
      console.error(err);
      toast(friendlyError('delete expense', err));
    }
  }

  return {
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
  };
}
