// ============================================================
// routefolk — app.js
// Phase 3.23: GPX upload form extraction.
// ============================================================

import { signInWithGoogle, signOut, getCurrentUser, onAuthChange } from './lib/auth.js';
import { listTrips, createTrip, updateTrip, deleteTrip } from './lib/trips.js';
import { listExpensesForTrip, createExpense, updateExpense, deleteExpense } from './lib/expenses.js';
import { listStages, createStage, updateStage, deleteStage, swapStageOrder } from './lib/stages.js';
import { fetchStageForecasts } from './lib/weather.js';
import { listEntriesForStage, createEntry, updateEntry, deleteEntry } from './lib/journal.js';
import { upsertCurrentProfile, listProfiles } from './lib/profiles.js';
import { getSchemaVersion } from './lib/meta.js';
import { getCurrentAppAccess } from './lib/access.js';
import { listGpxTracksForTrip, uploadStageGpx, deleteGpxTrack, downloadAndParseGpxTrack, geometryFromGpxTrackRecord, trackFileName } from './lib/gpx.js';
import { STATE } from './state/app-state.js';
import {
  STATUS_META,
  TRIPS_SCREEN_STATUSES,
  VISIBILITY_META,
  ENTRY_TYPE_META,
  EXPENSE_CATEGORY_META,
} from './constants/app-constants.js';
import { $, esc, attr, boolAttr } from './utils/dom.js';
import { renderHeader, renderNav, bindNav, offlineBannerHtml } from './components/app-shell.js';
import { auditLineHtml } from './components/audit.js';
import { canDeleteTrip, canWrite, writeDisabledAttr, ensureOnline, friendlyError, friendlyGpxError } from './utils/write-guards.js';
import { gpxTracksForTrip, stageNavigateUrl, stageRouteLabel, stageLabelForExpense } from './utils/trip-detail.js';
import { tripStats, tripStatsStripHtml } from './utils/trip-stats.js';
import { validateEntryUrls } from './utils/url.js';
import {
  fmtDate,
  fmtDateRange,
  fmtDateTime,
  datetimeLocalToIso,
  nowAsDatetimeLocal,
  todayIsoDate,
  journalDefaultTimeLocal,
  inclusiveDays,
} from './utils/datetime.js';
import { fmtEuro, parseAmount } from './utils/format.js';
import { toast } from './components/toast.js';
import { showModal, closeModal } from './components/modal.js';
import { tripFormHtml, readTripForm } from './components/trip-form.js';
import { stageFormHtml, readStageForm, validateStageFormAgainstTrip } from './components/stage-form.js';
import { entryFormHtml, bindEntryTimeToggle, readEntryForm } from './components/journal-form.js';
import { expenseFormHtml, readExpenseForm } from './components/expense-form.js';
import { gpxUploadFormHtml } from './components/gpx-form.js';
import { signedOutState, errorCard } from './components/feedback.js';
import { statItemHtml } from './components/stats.js';
import { tripVisibility, visibilityPillHtml, tripCardHtml } from './components/trip-card.js';
import { renderTrips, tripResultsHtml } from './screens/trips-screen.js';
import { renderAccount } from './screens/account-screen.js';
import { renderArchive, archiveResultsHtml, bindArchiveMapEvents } from './screens/archive-screen.js';
import { renderTripSummary, bindSummaryEvents } from './screens/summary-screen.js';
import { renderTripDetailScreen } from './screens/trip-detail-screen.js';
import { renderStagesSection as renderStagesSectionView } from './screens/trip-detail-stages.js';
import { renderExpensesSection as renderExpensesSectionView, expensesForTrip as expensesForTripView, expenseTotals as expenseTotalsView, expenseTotalsHtml as expenseTotalsHtmlView } from './screens/trip-detail-expenses.js';
import { userDisplayName, userAvatarUrl, displayNameForUserId } from './utils/user.js';

const EXPECTED_SCHEMA_VERSION = '013';


// ---------- Navigation ----------
function goTo(tab) {
  STATE.tab = tab;
  STATE.view = 'list';
  STATE.viewTripId = null;
  renderAll();
  if (tab === 'archive') ensureArchiveData();
}

// ---------- Data loaders ----------
async function loadTrips() {
  if (!STATE.user) return;
  STATE.tripsLoading = true;
  STATE.tripsError = null;
  renderAll();

  try {
    STATE.trips = await listTrips();
  } catch (err) {
    console.error(err);
    STATE.tripsError = err.message || 'Failed to load trips.';
  } finally {
    STATE.tripsLoading = false;
    renderAll();
    if (STATE.tab === 'archive') ensureArchiveData();
  }
}

async function loadProfiles() {
  if (!STATE.user) return;
  STATE.profilesLoading = true;
  STATE.profilesError = null;
  renderAll();

  try {
    const profiles = await listProfiles();
    STATE.profiles = profiles;
    STATE.profilesById = Object.fromEntries(profiles.map((p) => [p.id, p]));
  } catch (err) {
    console.error(err);
    STATE.profiles = [];
    STATE.profilesById = {};
    STATE.profilesError = err.message || 'Failed to load people.';
  } finally {
    STATE.profilesLoading = false;
    renderAll();
  }
}


async function ensureAppAccess() {
  if (!STATE.user) return false;

  STATE.accessLoading = true;
  STATE.accessError = null;
  renderAll();

  try {
    const access = await getCurrentAppAccess();
    STATE.appAccess = access;

    if (!access?.is_allowed) {
      const email = access?.email || STATE.user?.email || 'this Google account';
      STATE.accessError = `This Google account (${email}) is signed in, but it is not an active routefolk app member. Ask the app admin to add this email to public.app_members.`;
      return false;
    }

    return true;
  } catch (err) {
    console.error(err);
    STATE.accessError = 'Could not verify app access. Confirm migration 011 has been applied in Supabase, then try again.';
    return false;
  } finally {
    STATE.accessLoading = false;
    renderAll();
  }
}

async function ensureSchemaCompatible() {
  if (!STATE.user) return false;

  STATE.schemaLoading = true;
  STATE.schemaError = null;
  renderAll();

  try {
    const version = await getSchemaVersion();
    STATE.schemaVersion = version;

    if (version !== EXPECTED_SCHEMA_VERSION) {
      STATE.schemaError = `Database migration required. Expected schema version ${EXPECTED_SCHEMA_VERSION}, but found ${version || 'none'}.`;
      return false;
    }

    return true;
  } catch (err) {
    console.error(err);
    STATE.schemaError = 'Could not verify database schema version. Check the connection and confirm migrations are applied.';
    return false;
  } finally {
    STATE.schemaLoading = false;
    renderAll();
  }
}

async function loadSignedInData() {
  if (!STATE.user) return;

  const accessOk = await ensureAppAccess();
  if (!accessOk) return;

  const schemaOk = await ensureSchemaCompatible();
  if (!schemaOk) return;

  try {
    await upsertCurrentProfile(STATE.user);
  } catch (err) {
    console.warn('Profile upsert failed:', err);
    toast('Signed in, but profile sync failed.');
  }
  await loadProfiles();
  await loadTrips();
}

async function loadStagesForTrip(tripId) {
  STATE.stagesLoading = true;
  STATE.stagesError = null;
  renderAll();

  try {
    const stages = await listStages(tripId);
    STATE.stagesByTrip[tripId] = stages;
    stages.forEach(loadForecastForStage);
    stages.forEach((stage) => {
      if (!STATE.entriesByStage[stage.id]) loadEntriesForStage(stage.id, { quiet: true });
    });
  } catch (err) {
    console.error(err);
    STATE.stagesError = err.message || 'Failed to load stages.';
  } finally {
    STATE.stagesLoading = false;
    renderAll();
  }
}

async function loadForecastForStage(stage) {
  if (!stage?.id) return;
  if (STATE.forecastsByStage[stage.id]) return;
  STATE.forecastsByStage[stage.id] = 'loading';

  try {
    const forecasts = await fetchStageForecasts(stage);
    STATE.forecastsByStage[stage.id] = forecasts;
  } catch (err) {
    console.warn('Forecast load failed:', err);
    STATE.forecastsByStage[stage.id] = [];
  }

  if (STATE.viewTripId === stage.trip_id) renderAll();
}

async function loadEntriesForStage(stageId, options = {}) {
  STATE.entriesByStage[stageId] = 'loading';
  if (!options.quiet) renderAll();

  try {
    const entries = await listEntriesForStage(stageId);
    STATE.entriesByStage[stageId] = entries;
  } catch (err) {
    console.error(err);
    STATE.entriesByStage[stageId] = [];
    if (!options.quiet) toast('Failed to load journal entries.');
  }

  renderAll();
}



async function loadExpensesForTrip(tripId, options = {}) {
  STATE.expensesLoading = true;
  STATE.expensesError = null;
  STATE.expensesByTrip[tripId] = STATE.expensesByTrip[tripId] || 'loading';
  if (!options.quiet) renderAll();

  try {
    const expenses = await listExpensesForTrip(tripId);
    STATE.expensesByTrip[tripId] = expenses;
  } catch (err) {
    console.error(err);
    STATE.expensesByTrip[tripId] = [];
    STATE.expensesError = err.message || 'Failed to load expenses.';
    if (!options.quiet) toast('Failed to load expenses.');
  } finally {
    STATE.expensesLoading = false;
    renderAll();
  }
}


async function loadGpxForTrip(tripId, options = {}) {
  STATE.gpxLoading = true;
  STATE.gpxError = null;
  STATE.gpxByTrip[tripId] = STATE.gpxByTrip[tripId] || 'loading';
  if (!options.quiet) renderAll();

  try {
    const tracks = await listGpxTracksForTrip(tripId);
    STATE.gpxByTrip[tripId] = tracks;
    tracks.forEach((track) => {
      const cachedGeometry = geometryFromGpxTrackRecord(track);
      if (cachedGeometry && !STATE.gpxGeometryByTrack[track.id]) {
        STATE.gpxGeometryByTrack[track.id] = cachedGeometry;
      }
    });
  } catch (err) {
    console.error(err);
    STATE.gpxByTrip[tripId] = [];
    STATE.gpxError = err.message || 'Failed to load GPX tracks.';
    if (!options.quiet) toast('Failed to load GPX tracks.');
  } finally {
    STATE.gpxLoading = false;
    renderAll();
  }
}

async function ensureGpxGeometry(track) {
  if (!track?.id) return null;
  const existing = STATE.gpxGeometryByTrack[track.id];
  if (existing && existing !== 'loading') return existing;
  if (existing === 'loading') return null;

  const cachedGeometry = geometryFromGpxTrackRecord(track);
  if (cachedGeometry) {
    STATE.gpxGeometryByTrack[track.id] = cachedGeometry;
    return cachedGeometry;
  }

  STATE.gpxGeometryByTrack[track.id] = 'loading';
  try {
    const geometry = await downloadAndParseGpxTrack(track);
    STATE.gpxGeometryByTrack[track.id] = geometry;
    return geometry;
  } catch (err) {
    console.warn('GPX parse failed:', err);
    STATE.gpxGeometryByTrack[track.id] = { points: [], error: err.message || 'Failed to load GPX file.' };
    return STATE.gpxGeometryByTrack[track.id];
  }
}

async function ensureArchiveGpxGeometries() {
  if (STATE.archiveGpxLoading) return;

  const completed = STATE.trips.filter((trip) => trip.status === 'completed');
  const tracks = completed.flatMap((trip) => gpxTracksForTrip(trip.id));
  const missing = tracks.filter((track) => !STATE.gpxGeometryByTrack[track.id]);
  if (!missing.length) return;

  STATE.archiveGpxLoading = true;
  STATE.archiveGpxError = null;
  renderAll();

  try {
    for (const track of missing) {
      await ensureGpxGeometry(track);
    }
  } catch (err) {
    console.error(err);
    STATE.archiveGpxError = err.message || 'Failed to load GPX geometry.';
  } finally {
    STATE.archiveGpxLoading = false;
    renderAll();
  }
}


async function ensureArchiveData() {
  if (!STATE.user || STATE.archiveDataLoading) return;
  const archived = STATE.trips.filter((t) => t.status === 'completed' || t.status === 'cancelled');
  if (!archived.length) return;

  const needsWork = archived.some((trip) => {
    const stages = STATE.stagesByTrip[trip.id];
    if (!Array.isArray(stages)) return true;
    if (!Array.isArray(STATE.expensesByTrip[trip.id])) return true;
    if (!Array.isArray(STATE.gpxByTrip[trip.id])) return true;
    return stages.some((stage) => !Array.isArray(STATE.entriesByStage[stage.id]));
  });
  if (!needsWork) return;

  STATE.archiveDataLoading = true;
  STATE.archiveDataError = null;
  renderAll();

  try {
    for (const trip of archived) {
      let stages = STATE.stagesByTrip[trip.id];
      if (!Array.isArray(stages)) {
        stages = await listStages(trip.id);
        STATE.stagesByTrip[trip.id] = stages;
      }

      if (!Array.isArray(STATE.expensesByTrip[trip.id])) {
        STATE.expensesByTrip[trip.id] = await listExpensesForTrip(trip.id);
      }

      if (!Array.isArray(STATE.gpxByTrip[trip.id])) {
        STATE.gpxByTrip[trip.id] = await listGpxTracksForTrip(trip.id);
      }

      for (const stage of stages) {
        if (!Array.isArray(STATE.entriesByStage[stage.id])) {
          STATE.entriesByStage[stage.id] = await listEntriesForStage(stage.id);
        }
      }
    }
  } catch (err) {
    console.error(err);
    STATE.archiveDataError = err.message || 'Failed to load archive details.';
  } finally {
    STATE.archiveDataLoading = false;
    renderAll();
  }
}

async function openTrip(tripId, view = 'detail') {
  STATE.viewTripId = tripId;
  STATE.view = view;
  renderAll();
  if (!STATE.stagesByTrip[tripId]) {
    await loadStagesForTrip(tripId);
  } else {
    const stages = STATE.stagesByTrip[tripId] || [];
    stages.forEach(loadForecastForStage);
    stages.forEach((stage) => {
      if (!STATE.entriesByStage[stage.id]) loadEntriesForStage(stage.id, { quiet: true });
    });
  }
  if (!Array.isArray(STATE.expensesByTrip[tripId])) await loadExpensesForTrip(tripId, { quiet: true });
  if (!Array.isArray(STATE.gpxByTrip[tripId])) await loadGpxForTrip(tripId, { quiet: true });
}

// ---------- Trip detail ----------
function currentTrip() {
  return STATE.trips.find((t) => t.id === STATE.viewTripId) || null;
}

function tripNotFoundHtml() {
  return `
    <button class="btn btn-secondary btn-sm" id="backToTripsBtn" style="margin-bottom:12px;">← Back</button>
    <div class="empty-state">
      <div class="empty-title">Trip not found</div>
      <div class="empty-sub">It may have been deleted.</div>
    </div>
  `;
}


// ---------- Forms ----------
function showNewTripModal() {
  showModal('New trip', tripFormHtml({ status: 'planning', visibility: 'group' }), [
    { label: 'Create', cls: 'btn-primary', fn: handleCreateTrip },
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
  ]);
  setTimeout(() => $('tfTitle')?.focus(), 50);
}

function showEditTripModal(trip) {
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

function findStageById(stageId) {
  for (const stages of Object.values(STATE.stagesByTrip)) {
    if (!Array.isArray(stages)) continue;
    const stage = stages.find((s) => s.id === stageId);
    if (stage) return stage;
  }
  return null;
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


// ---------- Expenses ----------
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


// ---------- Handlers ----------
async function handleSignIn() {
  try {
    await signInWithGoogle();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Sign-in failed.');
  }
}

async function handleSignOut() {
  try {
    await signOut();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Sign-out failed.');
  }
}

async function handleCreateTrip() {
  if (!ensureOnline()) return;
  try {
    const trip = await createTrip(readTripForm());
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
    await updateTrip(tripId, readTripForm());
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

async function handleCreateStage(tripId) {
  if (!ensureOnline()) return;
  const trip = STATE.trips.find((t) => t.id === tripId);
  try {
    const fields = readStageForm();
    validateStageFormAgainstTrip(fields, trip || {});
    await createStage(tripId, fields);
    closeModal();
    await loadStagesForTrip(tripId);
    toast('Stage added.');
  } catch (err) {
    console.error(err);
    toast(friendlyError('save stage', err));
  }
}

async function handleUpdateStage(stageId) {
  if (!ensureOnline()) return;
  const trip = currentTrip();
  try {
    const fields = readStageForm();
    validateStageFormAgainstTrip(fields, trip || {});
    await updateStage(stageId, fields);
    closeModal();
    if (trip) await loadStagesForTrip(trip.id);
    toast('Stage updated.');
  } catch (err) {
    console.error(err);
    toast(friendlyError('save stage', err));
  }
}

async function handleDeleteStage(stageId) {
  if (!ensureOnline()) return;
  const trip = currentTrip();
  try {
    await deleteStage(stageId);
    closeModal();
    STATE.expandedStages.delete(stageId);
    STATE.expandedSummaryStages.delete(stageId);
    delete STATE.entriesByStage[stageId];
    if (trip) await loadStagesForTrip(trip.id);
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
    content.innerHTML = offlineBannerHtml() + accessErrorHtml();
  } else if (STATE.user && STATE.schemaLoading) {
    content.innerHTML = offlineBannerHtml() + `<div class="empty-state"><div class="empty-sub">Checking database schema…</div></div>`;
  } else if (STATE.user && STATE.schemaError) {
    content.innerHTML = offlineBannerHtml() + schemaErrorHtml();
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

  bindContentEvents(content);
  bindArchiveMapEvents(content, openTrip);
  if (STATE.tab === 'archive' && STATE.archiveViewMode === 'map') ensureArchiveGpxGeometries();
}


function accessErrorHtml() {
  return `
    <div class="card">
      <div class="card-title" style="color:#ef6262;">App access required</div>
      <div style="color:#c5d0e0;font-size:14px;line-height:1.5;">${esc(STATE.accessError)}</div>
      <div class="form-help" style="margin-top:8px;">Signing in with Google is not enough. The account must also be active in the database allowlist.</div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        <button class="btn btn-secondary" id="retryAccessBtn">Check again</button>
        <button class="btn btn-secondary" id="signOutBtn">Sign out</button>
      </div>
    </div>
  `;
}

function schemaErrorHtml() {
  return `
    <div class="card">
      <div class="card-title" style="color:#ef6262;">Database migration required</div>
      <div style="color:#c5d0e0;font-size:14px;line-height:1.5;">${esc(STATE.schemaError)}</div>
      <div class="form-help" style="margin-top:8px;">Expected schema version: ${esc(EXPECTED_SCHEMA_VERSION)}</div>
      <button class="btn btn-secondary btn-block" style="margin-top:12px;" id="retrySchemaBtn">Check again</button>
    </div>
  `;
}

function bindTripCards(root) {
  root.querySelectorAll('[data-trip-id]').forEach((btn) => {
    btn.addEventListener('click', () => openTrip(btn.dataset.tripId));
  });
}

function bindContentEvents(content) {
  content.querySelector('#emptySignInBtn')?.addEventListener('click', handleSignIn);
  content.querySelector('#accountSignInBtn')?.addEventListener('click', handleSignIn);
  content.querySelector('#signOutBtn')?.addEventListener('click', handleSignOut);
  content.querySelector('#retryTripsBtn')?.addEventListener('click', loadTrips);
  content.querySelector('#retryAccessBtn')?.addEventListener('click', loadSignedInData);
  content.querySelector('#retrySchemaBtn')?.addEventListener('click', loadSignedInData);
  content.querySelector('#retryStagesBtn')?.addEventListener('click', () => {
    if (STATE.viewTripId) loadStagesForTrip(STATE.viewTripId);
  });
  content.querySelector('#retryExpensesBtn')?.addEventListener('click', () => {
    if (STATE.viewTripId) loadExpensesForTrip(STATE.viewTripId);
  });
  content.querySelector('#retryArchiveDataBtn')?.addEventListener('click', ensureArchiveData);
  content.querySelector('#tripFiltersToggle')?.addEventListener('click', () => {
    STATE.tripFiltersOpen = !STATE.tripFiltersOpen;
    renderAll();
  });
  content.querySelector('#tripSearchInput')?.addEventListener('input', (e) => {
    STATE.tripSearch = e.target.value || '';
    const results = content.querySelector('#tripResults');
    if (results) {
      results.innerHTML = tripResultsHtml();
      bindTripCards(results);
    }
  });
  content.querySelector('#tripStatusFilter')?.addEventListener('change', (e) => {
    STATE.tripStatusFilter = TRIPS_SCREEN_STATUSES.includes(e.target.value) ? e.target.value : 'all';
    const results = content.querySelector('#tripResults');
    if (results) {
      results.innerHTML = tripResultsHtml();
      bindTripCards(results);
    }
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
  content.querySelector('#newTripBtn')?.addEventListener('click', () => {
    if (ensureOnline()) showNewTripModal();
  });
  content.querySelector('#backToTripsBtn')?.addEventListener('click', () => {
    STATE.view = 'list';
    STATE.viewTripId = null;
    renderAll();
  });
  content.querySelector('#backToDetailBtn')?.addEventListener('click', () => {
    STATE.view = 'detail';
    renderAll();
  });
  content.querySelector('#summaryTripBtn')?.addEventListener('click', async () => {
    STATE.view = 'summary';
    renderAll();
  });
  content.querySelector('#editTripBtn')?.addEventListener('click', () => {
    if (!ensureOnline()) return;
    const trip = currentTrip();
    if (trip) showEditTripModal(trip);
  });
  content.querySelector('#deleteTripBtn')?.addEventListener('click', () => {
    if (!ensureOnline()) return;
    const trip = currentTrip();
    if (trip) showDeleteTripConfirm(trip);
  });
  content.querySelector('#addStageBtn')?.addEventListener('click', () => {
    if (!ensureOnline()) return;
    const trip = currentTrip();
    if (trip) showNewStageModal(trip);
  });
  content.querySelector('#addExpenseBtn')?.addEventListener('click', () => {
    if (!ensureOnline()) return;
    const trip = currentTrip();
    if (trip) showNewExpenseModal(trip);
  });

  bindTripCards(content);

  content.querySelectorAll('[data-stage-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.stageAction;
      const id = btn.dataset.id;
      const trip = currentTrip();
      const stage = (trip ? (STATE.stagesByTrip[trip.id] || []) : []).find((s) => s.id === id);
      if (!stage && action !== 'up' && action !== 'down') return;
      if (!ensureOnline()) return;
      if (action === 'up' || action === 'down') handleMoveStage(id, action);
      if (action === 'edit') showEditStageModal(stage, trip);
      if (action === 'delete') showDeleteStageConfirm(stage);
    });
  });

  content.querySelectorAll('[data-stage-id]').forEach((btn) => {
    btn.addEventListener('click', () => toggleStageJournal(btn.dataset.stageId));
  });

  content.querySelectorAll('[data-stage-add-entry]').forEach((btn) => {
    btn.addEventListener('click', () => { if (ensureOnline()) showNewEntryModal(btn.dataset.stageAddEntry); });
  });

  content.querySelectorAll('[data-gpx-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => toggleStageGpx(btn.dataset.gpxToggle));
  });

  content.querySelectorAll('[data-stage-gpx-upload]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!ensureOnline()) return;
      const trip = currentTrip();
      const stage = (trip ? (STATE.stagesByTrip[trip.id] || []) : []).find((s) => s.id === btn.dataset.stageGpxUpload);
      if (trip && stage) showGpxUploadModal(trip, stage);
    });
  });

  content.querySelectorAll('[data-entry-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entryId = btn.dataset.id;
      const { stageId, entry } = findEntry(entryId);
      if (!entry) return;
      if (!ensureOnline()) return;
      if (btn.dataset.entryAction === 'edit') showEditEntryModal(stageId, entry);
      if (btn.dataset.entryAction === 'delete') showDeleteEntryConfirm(stageId, entry);
    });
  });


  content.querySelectorAll('[data-gpx-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const trip = currentTrip();
      if (!trip) return;
      const track = gpxTracksForTrip(trip.id).find((t) => t.id === btn.dataset.id);
      if (!track) return;
      if (!ensureOnline()) return;
      if (btn.dataset.gpxAction === 'delete') showDeleteGpxConfirm(track);
    });
  });

  content.querySelectorAll('[data-expense-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const trip = currentTrip();
      if (!trip) return;
      const expense = expensesForTripView(trip.id).find((e) => e.id === btn.dataset.id);
      if (!expense) return;
      if (!ensureOnline()) return;
      if (btn.dataset.expenseAction === 'edit') showEditExpenseModal(trip, expense);
      if (btn.dataset.expenseAction === 'delete') showDeleteExpenseConfirm(trip, expense);
    });
  });

  bindSummaryEvents(content, { loadEntriesForStage, renderAll });
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

function toggleStageGpx(stageId) {
  if (!stageId) return;

  if (STATE.expandedGpxStages.has(stageId)) {
    STATE.expandedGpxStages.delete(stageId);
    renderAll();
    return;
  }

  STATE.expandedGpxStages.add(stageId);

  const trip = currentTrip();
  if (trip && !Array.isArray(STATE.gpxByTrip[trip.id])) {
    loadGpxForTrip(trip.id);
  } else {
    renderAll();
  }
}

function findEntry(entryId) {
  for (const [stageId, entries] of Object.entries(STATE.entriesByStage)) {
    if (!Array.isArray(entries)) continue;
    const entry = entries.find((e) => e.id === entryId);
    if (entry) return { stageId, entry };
  }
  return { stageId: null, entry: null };
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
    STATE.user = user;
    STATE.appAccess = null;
    STATE.accessLoading = false;
    STATE.accessError = null;
    STATE.schemaVersion = null;
    STATE.schemaLoading = false;
    STATE.schemaError = null;
    STATE.trips = [];
    STATE.stagesByTrip = {};
    STATE.entriesByStage = {};
    STATE.forecastsByStage = {};
    STATE.profiles = [];
    STATE.profilesById = {};
    STATE.profilesError = null;
    STATE.expensesByTrip = {};
    STATE.expensesError = null;
    STATE.expandedStages.clear();
    STATE.expandedGpxStages.clear();
    STATE.expandedSummaryStages.clear();
    STATE.tripFiltersOpen = false;
    STATE.view = 'list';
    STATE.viewTripId = null;
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
