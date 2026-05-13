// ============================================================
// routefolk — app.js
// Phase 3.9H: clarify app membership access state.
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
import { listGpxTracksForTrip, uploadStageGpx, deleteGpxTrack, downloadAndParseGpxTrack, trackFileName } from './lib/gpx.js';
import { STATE } from './state/app-state.js';
import {
  STATUS_META,
  TRIPS_SCREEN_STATUSES,
  VISIBILITY_META,
  ENTRY_TYPE_META,
  EXPENSE_CATEGORY_META,
} from './constants/app-constants.js';
import { $, esc, attr, boolAttr } from './utils/dom.js';
import { validateEntryUrls } from './utils/url.js';
import {
  fmtDate,
  fmtDateRange,
  fmtDateTime,
  isoToDatetimeLocal,
  datetimeLocalToIso,
  nowAsDatetimeLocal,
  todayIsoDate,
  currentLocalTimeHHMM,
  journalDefaultDatetimeLocal,
  inclusiveDays,
  isExpenseDateOutsideTrip,
} from './utils/datetime.js';
import { fmtEuro, parseAmount } from './utils/format.js';
import { toast } from './components/toast.js';
import { showModal, closeModal } from './components/modal.js';
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
import { userInitials, userDisplayName, userAvatarUrl, initialsFromName, displayNameForUserId } from './utils/user.js';

const EXPECTED_SCHEMA_VERSION = '011';

function canDeleteTrip(trip) {
  return Boolean(STATE.user?.id && trip?.created_by === STATE.user.id);
}

function canWrite() {
  return STATE.isOnline !== false;
}

function writeDisabledAttr() {
  return canWrite() ? '' : ' disabled';
}

function ensureOnline(message = 'You are offline. Reconnect before making changes.') {
  if (canWrite()) return true;
  toast(message);
  return false;
}

function auditLineHtml(record, label = 'Last edited') {
  if (!record?.updated_by || !record?.updated_at) return '';
  const who = displayNameForUserId(record.updated_by);
  return `<div class="audit-line">${esc(label)} by ${esc(who)} · ${esc(fmtDateTime(record.updated_at))}</div>`;
}



// ---------- Online/offline ----------
function offlineBannerHtml() {
  if (STATE.isOnline !== false) return '';
  return `
    <div class="offline-banner" role="status">
      You are offline. You can view cached content, but changes are disabled until you reconnect.
    </div>
  `;
}

// ---------- Header/nav ----------
function renderHeader() {
  const right = $('hdrRight');
  const sub = $('hdrSub');
  if (sub) sub.textContent = headerSubtitle();
  if (!right) return;

  if (!STATE.user) {
    right.innerHTML = `<button class="btn btn-secondary btn-sm" id="signInBtn">Sign in</button>`;
    $('signInBtn')?.addEventListener('click', handleSignIn);
    return;
  }

  const avatar = userAvatarUrl(STATE.user);
  right.innerHTML = `
    <button class="account-avatar" id="hdrAvatarBtn" title="${esc(userDisplayName(STATE.user))}" style="cursor:pointer;">
      ${avatar
        ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">`
        : esc(userInitials(STATE.user))}
    </button>
  `;
  $('hdrAvatarBtn')?.addEventListener('click', () => goTo('account'));
}

function headerSubtitle() {
  if (!STATE.user) return 'Sign in to plan trips';
  if (STATE.tab === 'account') return 'Account';
  if (STATE.view === 'summary') return 'Trip summary review';
  if (STATE.view === 'detail') return 'Trip detail';
  if (STATE.tab === 'archive') return 'Archive';
  return 'Trips';
}

function renderNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === STATE.tab);
  });
}

function bindNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => goTo(btn.dataset.tab));
  });
}

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

  const completed = filteredArchiveTrips().filter((trip) => trip.status === 'completed');
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

function friendlyError(action, err) {
  const msg = String(err?.message || '').toLowerCase();
  if (!canWrite()) return 'You are offline. Reconnect and try again.';
  if (msg.includes('permission') || msg.includes('policy') || msg.includes('rls') || msg.includes('not allowed')) {
    return `Could not ${action}. You may not have permission.`;
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) {
    return `Could not ${action}. Check your connection and try again.`;
  }
  return `Could not ${action}. Please try again.`;
}

function friendlyGpxError(action, err) {
  const msg = String(err?.message || '').toLowerCase();
  if (!canWrite()) return 'You are offline. Reconnect before changing GPX files.';
  if (msg.includes('file type') || msg.includes('extension') || msg.includes('.gpx')) {
    return 'Choose a valid .gpx file.';
  }
  if (msg.includes('too large') || msg.includes('size')) {
    return 'This GPX file is too large. Keep GPX files under 8 MB for now.';
  }
  if (msg.includes('empty') || msg.includes('no route') || msg.includes('no track') || msg.includes('track points') || msg.includes('usable')) {
    return 'Could not read this GPX file. It does not contain usable track points.';
  }
  if (msg.includes('storage') || msg.includes('bucket') || msg.includes('object')) {
    return `Could not ${action}. The GPX storage operation failed. Try again.`;
  }
  return friendlyError(action, err);
}

// ---------- GPX helpers ----------
function gpxTracksForTrip(tripId) {
  const tracks = STATE.gpxByTrip[tripId];
  return Array.isArray(tracks) ? tracks : [];
}

// ---------- Trip detail ----------
function stageNavigateUrl(stage) {
  return stage.custom_route_url || stage.gmaps_url || null;
}

function stageRouteLabel(stage, index = 0) {
  return [stage.start_location, stage.end_location].filter(Boolean).join(' → ') || stage.title || `Stage ${index + 1}`;
}

function stageLabelForExpense(stage, index = 0) {
  if (!stage) return 'Whole trip';
  const date = stage.planned_date ? fmtDate(stage.planned_date) : 'No date';
  return `${stageRouteLabel(stage, index)} · ${date}`;
}

function stageForExpense(expense, trip) {
  if (!expense?.stage_id || !trip?.id) return null;
  const stages = STATE.stagesByTrip[trip.id] || [];
  return stages.find((stage) => stage.id === expense.stage_id) || null;
}

function expenseStageMeta(expense, trip) {
  const stages = STATE.stagesByTrip[trip.id] || [];
  const index = stages.findIndex((stage) => stage.id === expense.stage_id);
  const stage = index >= 0 ? stages[index] : null;
  return { stage, index };
}

function stageDateWarningHtml(stage, trip) {
  if (!isStageDateOutsideTrip(stage, trip)) return '';
  return `<div class="stage-warn">Planned date is outside the trip date range.</div>`;
}

function stageCardHtml(stage, trip, index, total) {
  const route = stageRouteLabel(stage, index);
  const meta = [];
  if (stage.planned_date) meta.push(fmtDate(stage.planned_date));
  if (stage.distance_km != null) meta.push(`${stage.distance_km} km`);
  const hasCoords = stage.start_lat != null && stage.start_lng != null;
  const navUrl = stageNavigateUrl(stage);

  return `
    <div class="stage-card">
      <div class="stage-card-row">
        <div class="stage-order">
          <button class="stage-order-btn" data-stage-action="up" data-id="${esc(stage.id)}" ${index === 0 || !canWrite() ? 'disabled' : ''} title="Move up">↑</button>
          <button class="stage-order-btn" data-stage-action="down" data-id="${esc(stage.id)}" ${index === total - 1 || !canWrite() ? 'disabled' : ''} title="Move down">↓</button>
        </div>
        <div class="stage-body">
          <div class="stage-title">${esc(route)}</div>
          ${meta.length ? `<div class="stage-meta">${esc(meta.join(' · '))}</div>` : ''}
          ${stage.notes ? `<div class="stage-notes">${esc(stage.notes)}</div>` : ''}
          ${auditLineHtml(stage, 'Edited')}
          ${stageDateWarningHtml(stage, trip)}
          ${!hasCoords ? `<div class="stage-warn">No coordinates — type a city name and we'll look it up automatically.</div>` : ''}
        </div>
      </div>
      ${weatherStripHtml(stage)}
      ${gpxStageSectionHtml(stage, trip)}
      <div class="stage-actions">
        ${navUrl ? `<a class="btn btn-secondary btn-sm" href="${esc(navUrl)}" target="_blank" rel="noopener">Navigate</a>` : ''}
        <button class="btn btn-secondary btn-sm" data-stage-action="edit" data-id="${esc(stage.id)}"${writeDisabledAttr()}>Edit</button>
        <button class="btn btn-danger btn-sm" data-stage-action="delete" data-id="${esc(stage.id)}"${writeDisabledAttr()}>Delete</button>
      </div>
      <div class="journal-section">
        ${journalSectionHtml(stage)}
      </div>
    </div>
  `;
}

function renderStagesSection(trip) {
  const stages = STATE.stagesByTrip[trip.id];

  if (STATE.stagesLoading && !stages) return `<div class="empty-sub">Loading stages…</div>`;
  if (STATE.stagesError) return errorCard(STATE.stagesError, 'retryStagesBtn');

  if (!stages || !stages.length) {
    return `
      <div class="empty-sub" style="margin-bottom:12px;">No stages yet. Add one to start planning the route.</div>
      <button class="btn btn-primary btn-block" id="addStageBtn"${writeDisabledAttr()}>+ Add stage</button>
    `;
  }

  return `
    <div class="stage-list">
      ${stages.map((s, i) => stageCardHtml(s, trip, i, stages.length)).join('')}
    </div>
    <button class="btn btn-primary btn-block" style="margin-top:12px;" id="addStageBtn"${writeDisabledAttr()}>+ Add stage</button>
  `;
}

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

function tripStats(trip) {
  const stages = STATE.stagesByTrip[trip.id] || [];
  const distanceValues = stages
    .map((s) => Number(s.distance_km))
    .filter((n) => Number.isFinite(n));
  const totalDistance = distanceValues.reduce((sum, n) => sum + n, 0);
  const allEntriesLoaded = stages.every((s) => Array.isArray(STATE.entriesByStage[s.id]));
  const entries = allEntriesLoaded
    ? stages.flatMap((s) => STATE.entriesByStage[s.id] || [])
    : [];
  const authors = new Set(entries.map((e) => e.author_id).filter(Boolean));
  const avg = stages.length && totalDistance ? totalDistance / stages.length : null;
  const expenses = STATE.expensesByTrip[trip.id];
  const expensesLoaded = Array.isArray(expenses);
  const totalCost = expensesLoaded ? expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) : null;

  return {
    days: inclusiveDays(trip.start_date, trip.end_date),
    stages: stages.length,
    distance: totalDistance || null,
    entries: allEntriesLoaded ? entries.length : null,
    authors: allEntriesLoaded ? authors.size : null,
    avg,
    cost: expensesLoaded ? totalCost : null,
    costLoading: !expensesLoaded,
    entriesLoading: !allEntriesLoaded && stages.length > 0,
  };
}

function tripStatsStripHtml(trip) {
  const s = tripStats(trip);
  const entryValue = s.entriesLoading ? '…' : String(s.entries ?? 0);
  const authorValue = s.entriesLoading ? '…' : String(s.authors ?? 0);
  return `
    <div class="trip-stats" aria-label="Trip metrics">
      ${statItemHtml('Days', s.days ?? '—')}
      ${statItemHtml('Stages', s.stages)}
      ${statItemHtml('Distance', s.distance ? `${Math.round(s.distance)} km` : '—')}
      ${statItemHtml('Entries', entryValue)}
      ${statItemHtml('Authors', authorValue)}
      ${statItemHtml('Avg/stage', s.avg ? `${Math.round(s.avg)} km` : '—')}
      ${statItemHtml('Cost', s.costLoading ? '…' : (s.cost ? fmtEuro(s.cost, { compact: true }) : '—'))}
    </div>
  `;
}


// ---------- Forms ----------
function tripFormHtml(trip = {}) {
  return `
    <div class="form-row">
      <label class="form-label" for="tfTitle">Title</label>
      <input class="inp" id="tfTitle" maxlength="120" value="${esc(trip.title || '')}" placeholder="e.g. Pyrenees loop">
    </div>
    <div class="form-row">
      <label class="form-label" for="tfDesc">Description</label>
      <textarea class="txt" id="tfDesc" maxlength="2000" placeholder="Optional notes about the trip">${esc(trip.description || '')}</textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="form-row">
        <label class="form-label" for="tfStart">Start date</label>
        <input class="inp" id="tfStart" type="date" value="${esc(trip.start_date || '')}">
      </div>
      <div class="form-row">
        <label class="form-label" for="tfEnd">End date</label>
        <input class="inp" id="tfEnd" type="date" value="${esc(trip.end_date || '')}">
      </div>
    </div>
    <div class="form-row">
      <label class="form-label" for="tfStatus">Status</label>
      <select class="sel" id="tfStatus">
        ${Object.entries(STATUS_META).map(([key, m]) =>
          `<option value="${esc(key)}" ${trip.status === key ? 'selected' : ''}>${esc(m.label)}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-label">Visibility</div>
      <div class="choice-list" role="radiogroup" aria-label="Trip visibility">
        ${Object.entries(VISIBILITY_META).map(([key, m]) => `
          <label class="choice-option">
            <input type="radio" name="tfVisibility" value="${esc(key)}" ${tripVisibility(trip) === key ? 'checked' : ''}>
            <span>
              <strong>${esc(m.formLabel)}</strong>
              <small>${key === 'private' ? 'Only you can see and edit this trip.' : 'Everyone who can sign in to the app can see and edit this trip.'}</small>
            </span>
          </label>
        `).join('')}
      </div>
      <div class="form-help">This is enforced by Supabase RLS, not just hidden in the interface.</div>
    </div>
  `;
}

function readTripForm() {
  const checkedVisibility = document.querySelector('input[name="tfVisibility"]:checked')?.value;
  return {
    title: $('tfTitle')?.value.trim() || '',
    description: $('tfDesc')?.value.trim() || '',
    start_date: $('tfStart')?.value || '',
    end_date: $('tfEnd')?.value || '',
    status: $('tfStatus')?.value || 'planning',
    visibility: checkedVisibility === 'private' ? 'private' : 'group',
  };
}

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

function stageFormHtml(stage = {}, trip = {}) {
  const hasTripDateBounds = Boolean(trip.start_date || trip.end_date);
  const dateDisabled = !hasTripDateBounds;
  return `
    <div class="form-row">
      <label class="form-label" for="sfTitle">Stage title (optional)</label>
      <input class="inp" id="sfTitle" maxlength="120" value="${esc(stage.title || '')}" placeholder="e.g. Mountain pass day">
    </div>
    <div class="form-row">
      <label class="form-label" for="sfStartLoc">From</label>
      <input class="inp" id="sfStartLoc" maxlength="120" value="${esc(stage.start_location || '')}" placeholder="e.g. Lisbon">
    </div>
    <div class="form-row">
      <label class="form-label" for="sfEndLoc">To</label>
      <input class="inp" id="sfEndLoc" maxlength="120" value="${esc(stage.end_location || '')}" placeholder="e.g. Porto">
    </div>
    <div class="form-row">
      <label class="form-label" for="sfCustomUrl">Custom Maps URL (optional)</label>
      <input class="inp" id="sfCustomUrl" value="${esc(stage.custom_route_url || '')}" placeholder="https://maps.app.goo.gl/...">
      <div class="form-help">Plan your route in Google Maps, then paste the share link here. Leave empty for the auto-generated route.</div>
    </div>
    <details class="form-details">
      <summary>Coordinates (advanced — auto-filled from city names)</summary>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
        <div class="form-row">
          <label class="form-label" for="sfStartLat">Start lat</label>
          <input class="inp" id="sfStartLat" inputmode="decimal" value="${esc(stage.start_lat ?? '')}" placeholder="auto">
        </div>
        <div class="form-row">
          <label class="form-label" for="sfStartLng">Start lng</label>
          <input class="inp" id="sfStartLng" inputmode="decimal" value="${esc(stage.start_lng ?? '')}" placeholder="auto">
        </div>
        <div class="form-row">
          <label class="form-label" for="sfEndLat">End lat</label>
          <input class="inp" id="sfEndLat" inputmode="decimal" value="${esc(stage.end_lat ?? '')}" placeholder="auto">
        </div>
        <div class="form-row">
          <label class="form-label" for="sfEndLng">End lng</label>
          <input class="inp" id="sfEndLng" inputmode="decimal" value="${esc(stage.end_lng ?? '')}" placeholder="auto">
        </div>
      </div>
    </details>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="form-row">
        <label class="form-label" for="sfDate">Planned date</label>
        <input class="inp" id="sfDate" type="date" value="${esc(stage.planned_date || '')}"${attr('min', trip.start_date)}${attr('max', trip.end_date)}${boolAttr('disabled', dateDisabled)}>
        ${dateDisabled ? `<div class="form-help">Set the trip's start or end date first to add stage dates.</div>` : ''}
      </div>
      <div class="form-row">
        <label class="form-label" for="sfDistance">Distance (km)</label>
        <input class="inp" id="sfDistance" inputmode="decimal" value="${esc(stage.distance_km ?? '')}" placeholder="e.g. 240">
      </div>
    </div>
    <div class="form-row">
      <label class="form-label" for="sfNotes">Notes</label>
      <textarea class="txt" id="sfNotes" maxlength="2000" placeholder="Roads, stops, warnings, ideas">${esc(stage.notes || '')}</textarea>
    </div>
  `;
}

function readStageForm() {
  const fields = {
    title: $('sfTitle')?.value.trim() || '',
    start_location: $('sfStartLoc')?.value.trim() || '',
    end_location: $('sfEndLoc')?.value.trim() || '',
    custom_route_url: $('sfCustomUrl')?.value.trim() || '',
    start_lat: $('sfStartLat')?.value.trim() || '',
    start_lng: $('sfStartLng')?.value.trim() || '',
    end_lat: $('sfEndLat')?.value.trim() || '',
    end_lng: $('sfEndLng')?.value.trim() || '',
    distance_km: $('sfDistance')?.value.trim() || '',
    notes: $('sfNotes')?.value.trim() || '',
  };

  const dateInput = $('sfDate');
  if (dateInput && !dateInput.disabled) {
    fields.planned_date = dateInput.value || '';
  }

  return fields;
}

function validateStageFormAgainstTrip(fields, trip) {
  if (!fields.planned_date) return;
  if (trip.start_date && fields.planned_date < trip.start_date) {
    throw new Error(`Stage date cannot be before the trip starts (${fmtDate(trip.start_date)}).`);
  }
  if (trip.end_date && fields.planned_date > trip.end_date) {
    throw new Error(`Stage date cannot be after the trip ends (${fmtDate(trip.end_date)}).`);
  }
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

function entryFormHtml(entry = {}, stage = null) {
  const selectedType = entry.entry_type || 'stop';
  const timeValue = stage?.planned_date
    ? (entry.timestamp ? isoToDatetimeLocal(entry.timestamp) : journalDefaultDatetimeLocal(stage))
    : '';
  const timeAttrs = stage?.planned_date
    ? ` min="${esc(`${stage.planned_date}T00:00`)}" max="${esc(`${stage.planned_date}T23:59`)}"`
    : ' disabled';
  const timeHelp = stage?.planned_date
    ? `Journal entries for this stage must use ${esc(fmtDate(stage.planned_date))}.`
    : 'This stage has no planned date, so the journal date is left empty.';

  return `
    <div class="form-row">
      <label class="form-label" for="jfType">Type</label>
      <select class="sel" id="jfType">
        ${Object.entries(ENTRY_TYPE_META).map(([key, m]) =>
          `<option value="${esc(key)}" ${selectedType === key ? 'selected' : ''}>${esc(m.icon)} ${esc(m.label)}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-row">
      <label class="form-label" for="jfTitle">Title</label>
      <input class="inp" id="jfTitle" maxlength="120" value="${esc(entry.title || '')}" placeholder="e.g. Coffee stop, Hotel, Viewpoint">
    </div>
    <div class="form-row">
      <label class="form-label" for="jfDesc">Description</label>
      <textarea class="txt" id="jfDesc" maxlength="4000" placeholder="What happened here?">${esc(entry.description || '')}</textarea>
    </div>
    <div class="form-row">
      <label class="form-label" for="jfLocation">Location name</label>
      <input class="inp" id="jfLocation" maxlength="160" value="${esc(entry.location || '')}" placeholder="e.g. Hotel Lisboa, The old pub, Miradouro">
    </div>
    <div class="form-row">
      <label class="form-label" for="jfLocationUrl">Maps URL (optional)</label>
      <input class="inp" id="jfLocationUrl" value="${esc(entry.location_url || '')}" placeholder="https://maps.app.goo.gl/...">
      <div class="form-help">Google Maps link for where this entry happened.</div>
    </div>
    <div class="form-row">
      <label class="form-label" for="jfInfoUrl">Website URL (optional)</label>
      <input class="inp" id="jfInfoUrl" value="${esc(entry.info_url || '')}" placeholder="https://example.com/...">
      <div class="form-help">Booking.com, restaurant website, pub page, TripAdvisor, or any useful HTTPS link.</div>
    </div>
    <div class="form-row">
      <label class="form-label" for="jfTime">When</label>
      <input class="inp" id="jfTime" type="datetime-local" value="${esc(timeValue)}"${timeAttrs}>
      <div class="form-help">${timeHelp}</div>
    </div>
    <div class="form-row">
      <label class="form-label" for="jfAlbum">Photo album URL (optional)</label>
      <input class="inp" id="jfAlbum" value="${esc(entry.photo_album_url || '')}" placeholder="https://photos.app.goo.gl/...">
      <div class="form-help">External album link. Must start with https://.</div>
    </div>
  `;
}

function readEntryForm(stageId = null) {
  const stage = findStageById(stageId);
  const rawTime = $('jfTime')?.value || '';
  let timestamp = null;

  if (stage?.planned_date) {
    if (!rawTime) throw new Error('Journal entry date is required because the stage has a planned date.');
    if (!rawTime.startsWith(`${stage.planned_date}T`)) {
      throw new Error('Journal entry date must match the stage planned date.');
    }
    timestamp = datetimeLocalToIso(rawTime);
  }

  const fields = {
    entry_type: $('jfType')?.value || 'stop',
    title: $('jfTitle')?.value.trim() || '',
    description: $('jfDesc')?.value.trim() || '',
    location: $('jfLocation')?.value.trim() || '',
    location_url: $('jfLocationUrl')?.value.trim() || '',
    info_url: $('jfInfoUrl')?.value.trim() || '',
    timestamp,
    photo_album_url: $('jfAlbum')?.value.trim() || '',
  };

  validateEntryUrls(fields);
  return fields;
}

function showNewEntryModal(stageId) {
  const stage = findStageById(stageId);
  showModal('Add journal entry', entryFormHtml({ entry_type: 'stop' }, stage), [
    { label: 'Add entry', cls: 'btn-primary', fn: () => handleCreateEntry(stageId) },
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
  ]);
  setTimeout(() => $('jfTitle')?.focus(), 50);
}

function showEditEntryModal(stageId, entry) {
  const stage = findStageById(stageId);
  showModal('Edit journal entry', entryFormHtml(entry, stage), [
    { label: 'Save', cls: 'btn-primary', fn: () => handleUpdateEntry(stageId, entry.id) },
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
  ]);
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
function expensesForTrip(tripId) {
  const expenses = STATE.expensesByTrip[tripId];
  return Array.isArray(expenses) ? expenses : [];
}

function renderExpensesSection(trip) {
  const raw = STATE.expensesByTrip[trip.id];

  if (raw === 'loading' || (STATE.expensesLoading && raw === undefined)) {
    return `<div class="empty-sub">Loading expenses…</div>`;
  }

  if (STATE.expensesError) {
    return `
      <div class="stage-warn" style="margin-bottom:8px;">${esc(STATE.expensesError)}</div>
      <button class="btn btn-secondary btn-sm" id="retryExpensesBtn">Retry</button>
    `;
  }

  const expenses = expensesForTrip(trip.id);
  const totals = expenseTotals(expenses);

  return `
    ${expenseTotalsHtml(totals)}
    <button class="btn btn-primary btn-block" id="addExpenseBtn" style="margin:12px 0;"${writeDisabledAttr()}>+ Add expense</button>
    ${expenses.length ? `<div class="expense-list">${expenses.map((e) => expenseCardHtml(e)).join('')}</div>` : '<div class="empty-sub">No expenses yet. Add the first cost for this trip.</div>'}
  `;
}

function expenseTotals(expenses) {
  const byCategory = new Map();
  const byPayer = new Map();
  let total = 0;

  expenses.forEach((expense) => {
    const amount = Number(expense.amount) || 0;
    total += amount;
    byCategory.set(expense.category, (byCategory.get(expense.category) || 0) + amount);
    byPayer.set(expense.user_id, (byPayer.get(expense.user_id) || 0) + amount);
  });

  return { total, byCategory, byPayer };
}

function expenseTotalsHtml(totals) {
  if (!totals.total) {
    return `
      <div class="expense-total-box">
        <div class="expense-total-label">Total trip cost</div>
        <div class="expense-total-value">€0.00</div>
      </div>
    `;
  }

  const categoryRows = [...totals.byCategory.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => {
      const meta = EXPENSE_CATEGORY_META[category] || EXPENSE_CATEGORY_META.other;
      return breakdownRowHtml(meta.label, amount, meta.icon);
    }).join('');

  const payerRows = [...totals.byPayer.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([userId, amount]) => breakdownRowHtml(displayNameForUserId(userId), amount, '👤'))
    .join('');

  return `
    <div class="expense-total-box">
      <div class="expense-total-label">Total trip cost</div>
      <div class="expense-total-value">${esc(fmtEuro(totals.total))}</div>
    </div>
    <div class="expense-breakdowns">
      <div class="expense-breakdown">
        <div class="expense-breakdown-title">By category</div>
        ${categoryRows || '<div class="empty-sub">No category totals yet.</div>'}
      </div>
      <div class="expense-breakdown">
        <div class="expense-breakdown-title">By payer</div>
        ${payerRows || '<div class="empty-sub">No payer totals yet.</div>'}
      </div>
    </div>
  `;
}

function breakdownRowHtml(label, amount, icon = '') {
  return `
    <div class="expense-breakdown-row">
      <span>${icon ? `${esc(icon)} ` : ''}${esc(label)}</span>
      <strong>${esc(fmtEuro(amount))}</strong>
    </div>
  `;
}

function expenseStageLineHtml(expense, trip) {
  if (!expense.stage_id) return '';
  const { stage, index } = expenseStageMeta(expense, trip);
  if (!stage) return `<span> · Stage no longer available</span>`;
  return `<span> · ${esc(stageLabelForExpense(stage, index))}</span>`;
}

function expenseDateWarningHtml(expense, trip) {
  if (!isExpenseDateOutsideTrip(expense, trip)) return '';
  return `<div class="stage-warn">Expense date is outside the trip date range.</div>`;
}

function expenseCardHtml(expense) {
  const trip = currentTrip();
  const meta = EXPENSE_CATEGORY_META[expense.category] || EXPENSE_CATEGORY_META.other;
  const payer = displayNameForUserId(expense.user_id);
  return `
    <div class="expense-card">
      <div class="expense-card-head">
        <div>
          <div class="expense-title">${esc(meta.icon)} ${esc(meta.label)} · ${esc(fmtEuro(expense.amount))}</div>
          <div class="expense-meta">
            Paid by ${esc(payer)}${expense.date ? ` · ${esc(fmtDate(expense.date))}` : ''}${trip ? expenseStageLineHtml(expense, trip) : ''}
          </div>
        </div>
        <div class="expense-actions">
          <button class="entry-icon-btn" data-expense-action="edit" data-id="${esc(expense.id)}" title="Edit"${writeDisabledAttr()}>✎</button>
          <button class="entry-icon-btn entry-icon-danger" data-expense-action="delete" data-id="${esc(expense.id)}" title="Delete"${writeDisabledAttr()}>✕</button>
        </div>
      </div>
      ${expense.description ? `<div class="expense-desc">${esc(expense.description)}</div>` : ''}
      ${trip ? expenseDateWarningHtml(expense, trip) : ''}
    </div>
  `;
}

function stageOptionsHtml(trip, selectedStageId) {
  const stages = STATE.stagesByTrip[trip.id] || [];
  const selected = selectedStageId || '';
  const options = [`<option value="" ${!selected ? 'selected' : ''}>Whole trip / no specific stage</option>`];
  stages.forEach((stage, index) => {
    options.push(`<option value="${esc(stage.id)}" ${stage.id === selected ? 'selected' : ''}>${esc(stageLabelForExpense(stage, index))}</option>`);
  });
  return options.join('');
}

function expenseDateAttrs(trip) {
  return `${attr('min', trip.start_date || '')}${attr('max', trip.end_date || '')}`;
}

function validateExpenseForTrip(trip, fields) {
  if (fields.date) {
    if (trip.start_date && fields.date < trip.start_date) throw new Error('Expense date must be on or after the trip start date.');
    if (trip.end_date && fields.date > trip.end_date) throw new Error('Expense date must be on or before the trip end date.');
  }
  if (fields.stage_id) {
    const stages = STATE.stagesByTrip[trip.id] || [];
    if (!stages.some((stage) => stage.id === fields.stage_id)) throw new Error('Selected stage does not belong to this trip.');
  }
  return fields;
}

function payerOptionsHtml(trip, selectedUserId) {
  const selected = selectedUserId || STATE.user?.id || '';
  if (tripVisibility(trip) === 'private') {
    return `<option value="${esc(STATE.user?.id || '')}" selected>${esc(userDisplayName(STATE.user))}</option>`;
  }

  const profiles = [...STATE.profiles];
  if (STATE.user && !profiles.some((p) => p.id === STATE.user.id)) {
    profiles.unshift({
      id: STATE.user.id,
      email: STATE.user.email,
      full_name: userDisplayName(STATE.user),
      avatar_url: userAvatarUrl(STATE.user),
    });
  }

  return profiles.map((profile) => {
    const label = profile.full_name || profile.email || 'Unknown';
    return `<option value="${esc(profile.id)}" ${profile.id === selected ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

function expenseFormHtml(trip, expense = {}) {
  const isPrivate = tripVisibility(trip) === 'private';
  const amount = expense.amount != null ? String(expense.amount) : '';
  return `
    <div class="form-row">
      <label class="form-label" for="efPayer">Paid by</label>
      <select class="sel" id="efPayer"${boolAttr('disabled', isPrivate)}>
        ${payerOptionsHtml(trip, expense.user_id)}
      </select>
      ${isPrivate ? '<div class="form-help">Private trip expenses can only be paid by you.</div>' : ''}
    </div>
    <div class="form-row">
      <label class="form-label" for="efCategory">Category</label>
      <select class="sel" id="efCategory">
        ${Object.entries(EXPENSE_CATEGORY_META).map(([key, meta]) => `<option value="${esc(key)}" ${(expense.category || 'food_drinks') === key ? 'selected' : ''}>${esc(meta.label)}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <label class="form-label" for="efStage">Applies to</label>
      <select class="sel" id="efStage">
        ${stageOptionsHtml(trip, expense.stage_id)}
      </select>
      <div class="form-help">Optional. Use “Whole trip” for costs that do not belong to a specific stage.</div>
    </div>
    <div class="form-row">
      <label class="form-label" for="efAmount">Amount (€)</label>
      <input class="inp" id="efAmount" type="text" inputmode="decimal" autocomplete="off" value="${esc(amount)}" placeholder="0.00">
      <div class="form-help">Use decimals for cents. The app stores all expenses in Euro.</div>
    </div>
    <div class="form-row">
      <label class="form-label" for="efDate">Date</label>
      <input class="inp" id="efDate" type="date" value="${esc(expense.date || todayIsoDate())}"${expenseDateAttrs(trip)}>
    </div>
    <div class="form-row">
      <label class="form-label" for="efDesc">Description (optional)</label>
      <textarea class="txt" id="efDesc" maxlength="1000" placeholder="e.g. Dinner in Ávila">${esc(expense.description || '')}</textarea>
    </div>
  `;
}

function readExpenseForm(trip) {
  const amount = parseAmount($('efAmount')?.value);
  const fields = {
    user_id: tripVisibility(trip) === 'private' ? STATE.user?.id : ($('efPayer')?.value || STATE.user?.id),
    category: $('efCategory')?.value || 'food_drinks',
    stage_id: $('efStage')?.value || null,
    amount,
    date: $('efDate')?.value || todayIsoDate(),
    description: $('efDesc')?.value.trim() || '',
    currency: 'EUR',
  };
  return validateExpenseForTrip(trip, fields);
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


function gpxUploadFormHtml(stage) {
  return `
    <div style="font-size:14px;line-height:1.5;color:#c5d0e0;margin-bottom:12px;">
      Upload the GPX file for <strong>${esc(stageRouteLabel(stage))}</strong>. GPX tracks are linked to stages, not directly to whole trips.
    </div>
    <div class="form-row">
      <label class="form-label" for="gpxFileInput">GPX file</label>
      <input class="inp" id="gpxFileInput" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml">
      <div class="form-help">Use the real track exported from your GPS/Wahoo/Intervals/etc. Max 8 MB for now.</div>
    </div>
  `;
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
    await createEntry(stageId, readEntryForm(stageId));
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
    await updateEntry(entryId, readEntryForm(stageId));
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
  renderHeader();
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
  bindNav();
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
