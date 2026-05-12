// ============================================================
// routefolk — app.js
// Phase 3B.2.1: archive heatmap visual calibration.
// ============================================================

import { signInWithGoogle, signOut, getCurrentUser, onAuthChange } from './lib/auth.js';
import { listTrips, createTrip, updateTrip, deleteTrip } from './lib/trips.js';
import { listExpensesForTrip, createExpense, updateExpense, deleteExpense } from './lib/expenses.js';
import { listStages, createStage, updateStage, deleteStage, swapStageOrder } from './lib/stages.js';
import { fetchStageForecasts } from './lib/weather.js';
import { listEntriesForStage, createEntry, updateEntry, deleteEntry } from './lib/journal.js';
import { upsertCurrentProfile, listProfiles } from './lib/profiles.js';
import { getSchemaVersion } from './lib/meta.js';
import { listGpxTracksForTrip, uploadStageGpx, deleteGpxTrack, downloadAndParseGpxTrack, trackFileName } from './lib/gpx.js';

const EXPECTED_SCHEMA_VERSION = '009';

const STATE = {
  tab: 'trips',
  view: 'list', // list | detail | summary
  viewTripId: null,
  user: null,
  schemaVersion: null,
  schemaLoading: false,
  schemaError: null,
  trips: [],
  tripsLoading: false,
  tripsError: null,
  stagesByTrip: {},
  stagesLoading: false,
  stagesError: null,
  forecastsByStage: {},
  entriesByStage: {},          // stageId -> array of entries OR 'loading'
  expandedStages: new Set(),   // journal sections open in trip detail
  expandedGpxStages: new Set(), // GPX sections open in trip detail
  expandedSummaryStages: new Set(),
  profiles: [],                // users who have signed in at least once
  profilesById: {},
  profilesLoading: false,
  profilesError: null,
  expensesByTrip: {},       // tripId -> array of expenses OR 'loading'
  gpxByTrip: {},            // tripId -> array of GPX track records OR 'loading'
  gpxGeometryByTrack: {},   // trackId -> parsed geometry OR 'loading'
  gpxLoading: false,
  gpxError: null,
  archiveGpxLoading: false,
  archiveGpxError: null,
  expensesLoading: false,
  expensesError: null,
  tripSearch: '',
  tripStatusFilter: 'all',
  tripFiltersOpen: false,
  archiveSearch: '',
  archiveStatusFilter: 'all',
  archiveFiltersOpen: false,
  archiveViewMode: 'list', // list | map
  archiveMapLayer: 'heatmap', // heatmap | hybrid | routes
  archiveDataLoading: false,
  archiveDataError: null,
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
};


const STATUS_META = {
  planning:  { label: 'Planning',  cls: 'status-planning'  },
  active:    { label: 'Active',    cls: 'status-active'    },
  completed: { label: 'Completed', cls: 'status-completed' },
  cancelled: { label: 'Cancelled', cls: 'status-cancelled' },
};

const TRIPS_SCREEN_STATUSES = ['planning', 'active'];
const ARCHIVE_SCREEN_STATUSES = ['completed', 'cancelled'];


const VISIBILITY_META = {
  private: { label: 'Private', formLabel: 'Private — only me', cls: 'visibility-private' },
  group:   { label: 'Group',   formLabel: 'Friends group — everyone with app access', cls: 'visibility-group' },
};

const ENTRY_TYPE_META = {
  stop:    { label: 'Stop',    icon: '🛑' },
  meal:    { label: 'Meal',    icon: '🍽️' },
  lodging: { label: 'Lodging', icon: '🏨' },
  note:    { label: 'Note',    icon: '💬' },
  drink:   { label: 'Drink',   icon: '🍺' },
  other:   { label: 'Other',   icon: '📌' },
};


const EXPENSE_CATEGORY_META = {
  fuel:         { label: 'Fuel',          icon: '⛽' },
  food_drinks:  { label: 'Food & drinks', icon: '🍽️' },
  lodging:      { label: 'Lodging',       icon: '🏨' },
  tolls:        { label: 'Tolls',         icon: '🛣️' },
  parking:      { label: 'Parking',       icon: '🅿️' },
  other:        { label: 'Other',         icon: '📌' },
};

// Simplified Europe country/border outlines for the archive geography view.
// These are deliberately coarse: they give geographic context without road tiles,
// labels, or external map providers. Coordinates are [longitude, latitude].
const EUROPE_BOUNDARY_LINES = [
  // Portugal
  [[-8.67,42.15],[-8.1,41.8],[-8.8,40.0],[-9.45,38.7],[-8.98,37.0],[-7.3,37.0],[-6.9,38.2],[-7.1,39.6],[-6.8,41.0],[-6.2,41.9],[-7.0,42.1],[-8.67,42.15]],
  // Spain
  [[-9.3,43.4],[-7.0,43.6],[-3.0,43.5],[0.8,42.7],[3.2,42.3],[2.2,41.0],[0.2,40.7],[-0.3,39.0],[0.2,38.3],[-0.8,37.6],[-1.9,36.7],[-4.5,36.0],[-6.2,36.1],[-7.4,36.9],[-8.7,41.9],[-9.3,43.4]],
  // France
  [[-5.1,48.7],[-2.0,49.7],[1.6,50.9],[4.0,50.8],[7.6,49.1],[7.4,48.0],[6.2,46.2],[7.5,43.7],[5.5,43.2],[3.0,42.4],[0.8,42.7],[-1.8,43.4],[-1.6,46.0],[-5.1,48.7]],
  // United Kingdom
  [[-6.3,50.0],[-4.8,50.6],[-3.0,51.0],[-1.0,50.8],[1.7,52.1],[1.0,54.0],[-1.5,55.0],[-2.0,57.6],[-4.8,58.7],[-6.2,57.0],[-5.2,55.0],[-6.8,54.0],[-5.5,52.0],[-6.3,50.0]],
  // Ireland
  [[-10.5,51.4],[-9.0,51.4],[-7.2,52.2],[-6.0,53.4],[-6.1,55.1],[-8.2,55.3],[-10.0,54.2],[-10.5,51.4]],
  // Belgium / Netherlands rough coastline
  [[2.5,51.1],[3.4,51.4],[4.9,51.5],[5.8,53.4],[6.9,53.5],[7.2,51.8],[6.0,50.7],[4.0,50.7],[2.5,51.1]],
  // Germany / Denmark rough outline
  [[5.8,53.4],[8.0,54.9],[10.0,54.8],[12.5,54.5],[13.9,53.7],[14.9,51.0],[13.0,48.9],[10.5,47.4],[8.5,47.6],[7.6,49.1],[6.0,50.7],[7.2,51.8],[5.8,53.4]],
  // Switzerland / Austria
  [[6.0,46.2],[8.0,45.8],[10.5,46.5],[13.0,46.4],[16.5,47.7],[15.5,48.9],[13.0,48.9],[10.5,47.4],[8.5,47.6],[7.0,47.8],[6.0,46.2]],
  // Italy
  [[7.5,43.7],[8.8,44.4],[10.0,43.8],[12.0,42.2],[13.0,41.1],[14.5,40.5],[15.9,38.0],[15.6,37.0],[13.0,38.0],[12.2,40.0],[10.0,41.8],[9.0,43.8],[7.5,43.7]],
  // Northern Balkans / Adriatic context
  [[13.0,46.4],[14.5,45.5],[16.0,45.8],[18.0,44.8],[19.5,43.6],[18.5,42.5],[16.0,43.0],[14.0,44.2],[13.0,46.4]],
  // Scandinavia rough outline
  [[5.0,58.0],[8.0,58.5],[11.0,57.5],[13.0,55.5],[16.0,56.0],[18.5,59.0],[20.0,62.0],[23.5,65.0],[25.0,68.5],[21.0,70.0],[16.0,69.0],[12.0,66.0],[8.0,62.0],[5.0,58.0]],
  // Poland / Czechia / eastern context
  [[14.9,51.0],[17.0,50.7],[19.5,49.5],[23.0,50.0],[24.0,52.0],[22.5,54.0],[18.0,54.8],[14.9,51.0]],
];

// ---------- DOM helpers ----------
function $(id) { return document.getElementById(id); }

function esc(v) {
  return String(v ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[ch]));
}

function attr(name, value) {
  return value ? ` ${name}="${esc(value)}"` : '';
}

function boolAttr(name, condition) {
  return condition ? ` ${name}` : '';
}

function canonicalHost(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    let host = url.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
  } catch {
    return '';
  }
}

function linkHostBadgeHtml(value) {
  const host = canonicalHost(value);
  return host ? `<span class="link-host">· ${esc(host)}</span>` : '';
}

function isHttpsUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isGoogleMapsUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(String(value).trim());
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (host === 'maps.app.goo.gl' || host === 'goo.gl') return true;
    const isGoogleHost = host === 'google.com'
      || host === 'www.google.com'
      || host.startsWith('maps.google.')
      || /^www\.google\.[a-z.]+$/.test(host)
      || /^google\.[a-z.]+$/.test(host);
    return url.protocol === 'https:' && isGoogleHost && (path.startsWith('/maps') || path.includes('/maps/'));
  } catch {
    return false;
  }
}

function validateEntryUrls(fields) {
  if (fields.location_url && !isGoogleMapsUrl(fields.location_url)) {
    throw new Error('Use a valid HTTPS Google Maps link for the Maps URL.');
  }
  if (fields.info_url && !isHttpsUrl(fields.info_url)) {
    throw new Error('Use a valid HTTPS website link.');
  }
  if (fields.photo_album_url && !isHttpsUrl(fields.photo_album_url)) {
    throw new Error('Photo album links must start with https://.');
  }
}

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- Modal ----------
function showModal(title, bodyHtml, buttons) {
  let overlay = $('modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'modal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box" id="modalBox">
        <div class="modal-title" id="modalTitle"></div>
        <div id="modalBody"></div>
        <div class="modal-btns" id="modalBtns"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;

  const btnWrap = $('modalBtns');
  btnWrap.innerHTML = '';
  buttons.forEach((b) => {
    const btn = document.createElement('button');
    btn.className = `btn ${b.cls || 'btn-secondary'} btn-block`;
    btn.textContent = b.label;
    btn.addEventListener('click', () => b.fn?.());
    btnWrap.appendChild(btn);
  });

  overlay.style.display = 'flex';
}

function closeModal() {
  const overlay = $('modal');
  if (overlay) overlay.style.display = 'none';
}

// ---------- User helpers ----------
function userInitials(user) {
  const name = user?.user_metadata?.full_name || user?.email || '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
}

function userDisplayName(user) {
  return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Unknown';
}

function userAvatarUrl(user) {
  return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';
}

function initialsFromName(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';
}

function profileForUserId(userId) {
  return userId ? STATE.profilesById[userId] || null : null;
}

function displayNameForUserId(userId) {
  if (STATE.user && userId === STATE.user.id) return userDisplayName(STATE.user);
  const profile = profileForUserId(userId);
  return profile?.full_name || profile?.email || 'Friend';
}

function authorInitials(authorId) {
  return initialsFromName(displayNameForUserId(authorId));
}

function authorLabel(authorId) {
  if (STATE.user && authorId === STATE.user.id) return `You — ${userDisplayName(STATE.user)}`;
  return displayNameForUserId(authorId);
}

function tripVisibility(trip) {
  return trip?.visibility === 'private' ? 'private' : 'group';
}

function visibilityPillHtml(trip) {
  const key = tripVisibility(trip);
  const meta = VISIBILITY_META[key];
  return `<span class="visibility-pill ${meta.cls}">${esc(meta.label)}</span>`;
}

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

// ---------- Date helpers ----------
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateRange(start, end) {
  if (!start && !end) return 'No dates set';
  if (start && !end) return fmtDate(start);
  if (!start && end) return `Until ${fmtDate(end)}`;
  if (start === end) return fmtDate(start);
  return `${fmtDate(start)} → ${fmtDate(end)}`;
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function auditLineHtml(record, label = 'Last edited') {
  if (!record?.updated_by || !record?.updated_at) return '';
  const who = displayNameForUserId(record.updated_by);
  return `<div class="audit-line">${esc(label)} by ${esc(who)} · ${esc(fmtDateTime(record.updated_at))}</div>`;
}

function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function nowAsDatetimeLocal() {
  return isoToDatetimeLocal(new Date().toISOString());
}


function todayIsoDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentLocalTimeHHMM() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function journalDefaultDatetimeLocal(stage) {
  return stage?.planned_date ? `${stage.planned_date}T${currentLocalTimeHHMM()}` : '';
}

function fmtEuro(value, options = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return options.empty || '—';
  const maximumFractionDigits = options.compact ? 0 : 2;
  const minimumFractionDigits = options.compact ? 0 : 2;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(n);
}

function fmtDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const hours = Math.floor(n / 3600);
  const minutes = Math.round((n % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function fmtKm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n * 10) / 10} km`;
}

function parseAmount(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function inclusiveDays(start, end) {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const diff = Math.round((b - a) / 86400000) + 1;
  return diff > 0 ? diff : null;
}

function isStageDateOutsideTrip(stage, trip) {
  if (!stage?.planned_date) return false;
  if (trip.start_date && stage.planned_date < trip.start_date) return true;
  if (trip.end_date && stage.planned_date > trip.end_date) return true;
  return false;
}

function isExpenseDateOutsideTrip(expense, trip) {
  if (!expense?.date) return false;
  if (trip.start_date && expense.date < trip.start_date) return true;
  if (trip.end_date && expense.date > trip.end_date) return true;
  return false;
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

// ---------- Trip cards / list ----------
function tripCardHtml(trip) {
  const meta = STATUS_META[trip.status] || STATUS_META.planning;
  return `
    <button class="trip-card" data-trip-id="${esc(trip.id)}">
      <div class="trip-card-head">
        <div class="trip-title">${esc(trip.title)}</div>
        <div class="trip-card-pills">
          <span class="status-pill ${meta.cls}">${esc(meta.label)}</span>
          ${visibilityPillHtml(trip)}
        </div>
      </div>
      <div class="trip-dates">${esc(fmtDateRange(trip.start_date, trip.end_date))}</div>
      ${trip.description ? `<div class="trip-desc">${esc(trip.description)}</div>` : ''}
    </button>
  `;
}

function tripFiltersHtml() {
  const activeFilters = Number(Boolean(STATE.tripSearch.trim())) + Number(STATE.tripStatusFilter !== 'all');
  const toggleText = STATE.tripFiltersOpen ? 'Hide filters' : `Filters${activeFilters ? ` (${activeFilters})` : ''}`;

  return `
    <div class="trip-filter-toggle-row">
      <button class="btn btn-secondary btn-sm trip-filter-toggle" id="tripFiltersToggle" aria-expanded="${STATE.tripFiltersOpen ? 'true' : 'false'}">
        ${esc(toggleText)}
      </button>
    </div>
    <div class="trip-controls ${STATE.tripFiltersOpen ? 'open' : ''}" id="tripFiltersPanel">
      <div class="trip-search-wrap">
        <label class="form-label" for="tripSearchInput">Search trips</label>
        <input class="inp" id="tripSearchInput" type="search" value="${esc(STATE.tripSearch)}" placeholder="Search by trip title">
      </div>
      <div class="trip-status-wrap">
        <label class="form-label" for="tripStatusFilter">Status</label>
        <select class="sel" id="tripStatusFilter">
          <option value="all" ${STATE.tripStatusFilter === 'all' ? 'selected' : ''}>All active</option>
          ${TRIPS_SCREEN_STATUSES.map((key) => {
            const meta = STATUS_META[key];
            return `<option value="${esc(key)}" ${STATE.tripStatusFilter === key ? 'selected' : ''}>${esc(meta.label)}</option>`;
          }).join('')}
        </select>
      </div>
    </div>
  `;
}

function activeTripsBase() {
  return STATE.trips.filter((trip) => TRIPS_SCREEN_STATUSES.includes(trip.status));
}

function filteredTripsForTripsScreen() {
  const query = STATE.tripSearch.trim().toLowerCase();
  const statusFilter = TRIPS_SCREEN_STATUSES.includes(STATE.tripStatusFilter) ? STATE.tripStatusFilter : 'all';
  return activeTripsBase().filter((trip) => {
    const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
    const matchesSearch = !query || String(trip.title || '').toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });
}

function tripResultsHtml() {
  const baseTrips = activeTripsBase();
  const trips = filteredTripsForTripsScreen();
  const hasFilters = STATE.tripSearch.trim() || STATE.tripStatusFilter !== 'all';

  if (!baseTrips.length) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 6h18M3 12h18M3 18h12"/>
        </svg>
        <div class="empty-title">No active trips</div>
        <div class="empty-sub">Planning and active trips appear here. Completed and cancelled trips live in the Archive.</div>
      </div>
    `;
  }

  if (!trips.length) {
    return `
      <div class="empty-state">
        <div class="empty-title">No matching trips</div>
        <div class="empty-sub">${hasFilters ? 'Adjust the search or active-trip status filter.' : 'No planning or active trips to show.'}</div>
      </div>
    `;
  }

  return `<div class="trip-list">${trips.map(tripCardHtml).join('')}</div>`;
}

function renderTrips() {
  if (!STATE.user) return signedOutState('Sign in to see trips', 'Trips are shared with everyone signed in.');

  if (STATE.tripsLoading && !STATE.trips.length) {
    return `<div class="empty-state"><div class="empty-sub">Loading trips…</div></div>`;
  }

  if (STATE.tripsError) return errorCard(STATE.tripsError, 'retryTripsBtn');

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
      <div class="section-label" style="margin-bottom:0;">Trips</div>
      <button class="btn btn-primary btn-sm" id="newTripBtn"${writeDisabledAttr()}>+ New trip</button>
    </div>
    ${tripFiltersHtml()}
    <div id="tripResults">${tripResultsHtml()}</div>
  `;
}


function archiveTripsBase() {
  return STATE.trips.filter((t) => ARCHIVE_SCREEN_STATUSES.includes(t.status));
}

function completedArchiveTrips() {
  return STATE.trips.filter((t) => t.status === 'completed');
}

function archiveFiltersHtml() {
  const activeFilters = Number(Boolean(STATE.archiveSearch.trim())) + Number(STATE.archiveStatusFilter !== 'all');
  const toggleText = STATE.archiveFiltersOpen ? 'Hide filters' : `Filters${activeFilters ? ` (${activeFilters})` : ''}`;

  return `
    <div class="trip-filter-toggle-row">
      <button class="btn btn-secondary btn-sm trip-filter-toggle" id="archiveFiltersToggle" aria-expanded="${STATE.archiveFiltersOpen ? 'true' : 'false'}">
        ${esc(toggleText)}
      </button>
    </div>
    <div class="trip-controls ${STATE.archiveFiltersOpen ? 'open' : ''}" id="archiveFiltersPanel">
      <div class="trip-search-wrap">
        <label class="form-label" for="archiveSearchInput">Search archive</label>
        <input class="inp" id="archiveSearchInput" type="search" value="${esc(STATE.archiveSearch)}" placeholder="Search by trip title">
      </div>
      <div class="trip-status-wrap">
        <label class="form-label" for="archiveStatusFilter">Status</label>
        <select class="sel" id="archiveStatusFilter">
          <option value="all" ${STATE.archiveStatusFilter === 'all' ? 'selected' : ''}>All</option>
          <option value="completed" ${STATE.archiveStatusFilter === 'completed' ? 'selected' : ''}>Completed</option>
          <option value="cancelled" ${STATE.archiveStatusFilter === 'cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </div>
    </div>
  `;
}

function filteredArchiveTrips() {
  const query = STATE.archiveSearch.trim().toLowerCase();
  return archiveTripsBase().filter((trip) => {
    const matchesStatus = STATE.archiveStatusFilter === 'all' || trip.status === STATE.archiveStatusFilter;
    const matchesSearch = !query || String(trip.title || '').toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });
}

function archiveMetrics() {
  const completed = completedArchiveTrips();
  let distance = 0;
  let cost = 0;
  let entries = 0;
  let completeData = true;

  completed.forEach((trip) => {
    const stages = STATE.stagesByTrip[trip.id];
    const expenses = STATE.expensesByTrip[trip.id];

    if (!Array.isArray(stages)) {
      completeData = false;
    } else {
      distance += stages.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0);
      stages.forEach((stage) => {
        const stageEntries = STATE.entriesByStage[stage.id];
        if (Array.isArray(stageEntries)) {
          entries += stageEntries.length;
        } else {
          completeData = false;
        }
      });
    }

    if (Array.isArray(expenses)) {
      cost += expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    } else {
      completeData = false;
    }
  });

  return { completedCount: completed.length, distance, cost, entries, completeData };
}

function archiveMetricsHtml() {
  const metrics = archiveMetrics();
  const loading = STATE.archiveDataLoading || !metrics.completeData;
  return `
    <div class="archive-stats" aria-label="Archive metrics">
      ${statItemHtml('Completed', metrics.completedCount)}
      ${statItemHtml('Distance', loading ? '…' : (metrics.distance ? `${Math.round(metrics.distance)} km` : '—'))}
      ${statItemHtml('Cost', loading ? '…' : (metrics.cost ? fmtEuro(metrics.cost, { compact: true }) : '—'))}
      ${statItemHtml('Entries', loading ? '…' : metrics.entries)}
    </div>
    ${STATE.archiveDataLoading ? `<div class="form-help" style="margin-top:8px;">Loading archive details…</div>` : ''}
    ${STATE.archiveDataError ? `<div class="stage-warn" style="margin-top:8px;">${esc(STATE.archiveDataError)}</div><button class="btn btn-secondary btn-sm" id="retryArchiveDataBtn" style="margin-top:8px;">Retry archive details</button>` : ''}
  `;
}


function archiveTripMapPoint(trip) {
  const stages = STATE.stagesByTrip[trip.id];
  if (!Array.isArray(stages)) return null;

  const points = archiveStageCoordinatePoints(stages);
  if (!points.length) return null;

  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
  return { lat, lng, points };
}

function archiveStageCoordinatePoints(stages) {
  const points = [];
  stages.forEach((stage) => {
    const pairs = [
      [stage.start_lat, stage.start_lng],
      [stage.end_lat, stage.end_lng],
    ];
    pairs.forEach(([lat, lng]) => {
      const la = Number(lat);
      const ln = Number(lng);
      if (Number.isFinite(la) && Number.isFinite(ln)) points.push({ lat: la, lng: ln });
    });
  });
  return points;
}

function archiveRouteSegmentsForTrip(trip) {
  const stages = STATE.stagesByTrip[trip.id];
  if (!Array.isArray(stages)) return [];

  return stages.flatMap((stage) => {
    const startLat = Number(stage.start_lat);
    const startLng = Number(stage.start_lng);
    const endLat = Number(stage.end_lat);
    const endLng = Number(stage.end_lng);
    if (![startLat, startLng, endLat, endLng].every(Number.isFinite)) return [];
    return [{
      trip,
      stage,
      start: { lat: startLat, lng: startLng },
      end: { lat: endLat, lng: endLng },
    }];
  });
}

function archiveMapRecords() {
  return filteredArchiveTrips()
    .filter((trip) => trip.status === 'completed')
    .map((trip) => ({
      trip,
      point: archiveTripMapPoint(trip),
      segments: archiveRouteSegmentsForTrip(trip),
    }))
    .filter((record) => record.point || record.segments.length);
}

function archiveViewToggleHtml() {
  return `
    <div class="archive-view-toggle" role="group" aria-label="Archive view">
      <button class="archive-view-btn ${STATE.archiveViewMode === 'list' ? 'active' : ''}" data-archive-view="list">List</button>
      <button class="archive-view-btn ${STATE.archiveViewMode === 'map' ? 'active' : ''}" data-archive-view="map">Map</button>
    </div>
  `;
}

function archiveMapLayerToggleHtml() {
  const layers = [
    { key: 'heatmap', label: 'Heatmap' },
    { key: 'hybrid', label: 'Hybrid' },
    { key: 'routes', label: 'Routes' },
  ];
  return `
    <div class="archive-layer-toggle" role="group" aria-label="Archive map style">
      ${layers.map((layer) => `
        <button class="archive-layer-btn ${STATE.archiveMapLayer === layer.key ? 'active' : ''}" data-archive-layer="${esc(layer.key)}" type="button">
          ${esc(layer.label)}
        </button>
      `).join('')}
    </div>
  `;
}

function archiveMapHtml() {
  const allArchived = archiveTripsBase();
  const completed = filteredArchiveTrips().filter((trip) => trip.status === 'completed');

  if (!allArchived.length) return archiveResultsListHtml();

  if (!completed.length) {
    return `
      <div class="archive-map-wrap">
        <div class="archive-map-empty">
          <div>
            <div class="empty-title">No completed trips to map</div>
            <div class="empty-sub">Cancelled trips stay listed for reference, but they are not plotted on the archive geography view.</div>
          </div>
        </div>
      </div>
    `;
  }

  const tracks = completed.flatMap((trip) => gpxTracksForTrip(trip.id).map((track) => ({ trip, track })));
  if (!tracks.length) {
    return `
      <div class="archive-map-wrap">
        <div class="archive-map-heading">
          <div>
            <div class="card-title">Archive geography</div>
            <div class="form-help">GPX-powered overview. Upload GPX files to individual stages to build the map.</div>
          </div>
        </div>
        <div class="archive-map-empty archive-map-empty-tall">
          <div>
            <div class="empty-title">No GPX tracks yet</div>
            <div class="empty-sub">Upload GPX files inside each stage. The archive map uses only real GPX tracks, so it stays empty until at least one completed trip has usable stage GPX data.</div>
          </div>
        </div>
      </div>
    `;
  }

  const missing = tracks.filter(({ track }) => !STATE.gpxGeometryByTrack[track.id]);
  if (missing.length || STATE.archiveGpxLoading) {
    return `
      <div class="archive-map-wrap">
        <div class="archive-map-heading">
          <div>
            <div class="card-title">Archive geography</div>
            <div class="form-help">Loading GPX route geometry…</div>
          </div>
        </div>
        <div class="archive-map-empty archive-map-empty-tall">
          <div>
            <div class="empty-title">Loading GPX tracks…</div>
            <div class="empty-sub">This can take a moment on mobile if several files are attached.</div>
          </div>
        </div>
      </div>
    `;
  }

  const records = archiveMapRecordsFromGpx();
  if (!records.length) {
    return `
      <div class="archive-map-wrap">
        <div class="archive-map-empty archive-map-empty-tall">
          <div>
            <div class="empty-title">No usable GPX geometry</div>
            <div class="empty-sub">GPX files exist, but no usable route points could be parsed. Try replacing the problematic GPX file from the stage GPX section.</div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="archive-map-wrap">
      <div class="archive-map-heading">
        <div>
          <div class="card-title">Archive geography</div>
          <div class="form-help">Heatmap-first view from real stage GPX data. Hybrid and Routes modes keep the same data visible in different ways.</div>
        </div>
        ${archiveMapLayerToggleHtml()}
      </div>
      ${STATE.archiveGpxError ? `<div class="stage-warn" style="margin:8px 0;">${esc(STATE.archiveGpxError)}</div>` : ''}
      ${archiveGeoMapSvg(records)}
    </div>
  `;
}

function archiveMapRecordsFromGpx() {
  const completed = filteredArchiveTrips().filter((trip) => trip.status === 'completed');
  return completed.map((trip) => {
    const tracks = gpxTracksForTrip(trip.id);
    const polylines = tracks.map((track) => {
      const geometry = STATE.gpxGeometryByTrack[track.id];
      const points = geometry && geometry !== 'loading' && Array.isArray(geometry.points) ? geometry.points : [];
      return { track, points: simplifyTrackPoints(points, 420) };
    }).filter((line) => line.points.length >= 2);
    return { trip, polylines, point: archivePointFromPolylines(polylines) };
  }).filter((record) => record.polylines.length);
}

function simplifyTrackPoints(points, maxPoints = 420) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  const step = Math.ceil(points.length / maxPoints);
  const reduced = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (last && reduced[reduced.length - 1] !== last) reduced.push(last);
  return reduced;
}

function archivePointFromPolylines(polylines) {
  const points = polylines.flatMap((line) => line.points);
  if (!points.length) return null;
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
  return { lat, lng };
}

function archiveGeoMapSvg(records) {
  const extent = archiveMapExtent(records);
  const boundaryLines = archiveBoundaryLinesSvg(extent);
  const showHeatmap = STATE.archiveMapLayer === 'heatmap' || STATE.archiveMapLayer === 'hybrid';
  const showRoutes = STATE.archiveMapLayer === 'routes' || STATE.archiveMapLayer === 'hybrid';
  const heatmap = showHeatmap ? archiveHeatmapSvg(records, extent) : '';
  const segments = [];
  const centers = [];

  records.forEach(({ trip, point, polylines }) => {
    const meta = archiveTripMetaText(trip);
    polylines.forEach(({ track, points }) => {
      const d = points.map((point, index) => {
        const p = projectArchivePoint(point, extent);
        return `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
      }).join(' ');
      segments.push(`
        <path class="archive-route-line" d="${esc(d)}" data-map-trip-id="${esc(trip.id)}">
          <title>${esc(trip.title)} — ${esc(trackFileName(track))}</title>
        </path>
      `);
    });
    if (point) {
      const c = projectArchivePoint(point, extent);
      centers.push(`
        <g class="archive-trip-point" data-map-trip-id="${esc(trip.id)}" transform="translate(${c.x} ${c.y})">
          <circle r="7"></circle>
          <circle r="3"></circle>
          <title>${esc(trip.title)}${meta ? ` · ${meta}` : ''}</title>
        </g>
      `);
    }
  });

  return `
    <svg class="archive-geo-svg" viewBox="0 0 1000 620" role="img" aria-label="Completed trip GPX archive geography overview">
      <defs>
        <clipPath id="archiveMapClip"><rect x="42" y="28" width="916" height="540" rx="10"></rect></clipPath>
      </defs>
      <rect class="archive-map-sea" x="0" y="0" width="1000" height="620" rx="14"></rect>
      <rect class="archive-map-land" x="42" y="28" width="916" height="540" rx="10"></rect>
      <g clip-path="url(#archiveMapClip)">
        ${showHeatmap ? `<g class="archive-heatmap">${heatmap}</g>` : ''}
        <g class="archive-boundaries">${boundaryLines}</g>
        ${showRoutes ? `<g class="archive-routes">${segments.join('')}</g>` : ''}
        <g class="archive-points">${centers.join('')}</g>
      </g>
    </svg>
  `;
}

function archiveHeatmapSvg(records, extent) {
  const cols = 160;
  const rows = 90;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));

  records.forEach(({ polylines }) => {
    polylines.forEach(({ points }) => {
      const sampled = resampleTrackForHeatmap(points, 0.25, 2600);
      sampled.forEach((point) => addArchiveHeat(point, extent, grid, cols, rows));
    });
  });

  const values = grid.flat().filter((v) => v > 0);
  if (!values.length) return '';
  values.sort((a, b) => a - b);
  const p98 = values[Math.floor((values.length - 1) * 0.98)] || values[values.length - 1] || 1;
  const maxValue = Math.max(p98, 1);
  const cellW = 916 / cols;
  const cellH = 540 / rows;
  const cells = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const v = grid[y][x];
      if (v <= 0.001) continue;
      const norm = Math.min(1, Math.log1p(v) / Math.log1p(maxValue));
      if (norm < 0.10) continue;
      cells.push(`<rect class="archive-heat-cell" x="${(42 + x * cellW).toFixed(2)}" y="${(28 + y * cellH).toFixed(2)}" width="${cellW.toFixed(2)}" height="${cellH.toFixed(2)}" rx="1.5" ry="1.5" fill="${archiveHeatColor(norm)}" fill-opacity="${(0.06 + norm * 0.42).toFixed(3)}"></rect>`);
    }
  }

  return cells.join('');
}

function resampleTrackForHeatmap(points, spacingKm = 0.25, maxSamples = 2600) {
  if (!Array.isArray(points) || points.length < 2) return points || [];
  const samples = [points[0]];
  let lastSample = points[0];
  let carried = 0;

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const segmentKm = haversineKm(prev, current);
    if (!Number.isFinite(segmentKm) || segmentKm <= 0) continue;

    let remaining = segmentKm;
    let anchor = prev;
    while (carried + remaining >= spacingKm && samples.length < maxSamples) {
      const need = spacingKm - carried;
      const ratio = Math.max(0, Math.min(1, need / remaining));
      const sample = interpolateGeoPoint(anchor, current, ratio);
      samples.push(sample);
      lastSample = sample;
      anchor = sample;
      remaining = haversineKm(anchor, current);
      carried = 0;
      if (!Number.isFinite(remaining) || remaining <= 0.00001) break;
    }

    carried += remaining;
    lastSample = current;
    if (samples.length >= maxSamples) break;
  }

  const finalPoint = points[points.length - 1];
  if (samples[samples.length - 1] !== finalPoint && samples.length < maxSamples) samples.push(finalPoint);
  return samples.length ? samples : [lastSample].filter(Boolean);
}

function haversineKm(a, b) {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function interpolateGeoPoint(a, b, t) {
  return {
    lat: Number(a.lat) + (Number(b.lat) - Number(a.lat)) * t,
    lng: Number(a.lng) + (Number(b.lng) - Number(a.lng)) * t,
  };
}

function addArchiveHeat(point, extent, grid, cols, rows) {
  const lngSpan = extent.maxLng - extent.minLng;
  const latSpan = extent.maxLat - extent.minLat;
  if (lngSpan <= 0 || latSpan <= 0) return;
  const xNorm = (point.lng - extent.minLng) / lngSpan;
  const yNorm = 1 - ((point.lat - extent.minLat) / latSpan);
  if (!Number.isFinite(xNorm) || !Number.isFinite(yNorm)) return;
  if (xNorm < 0 || xNorm > 1 || yNorm < 0 || yNorm > 1) return;

  const cx = Math.floor(xNorm * (cols - 1));
  const cy = Math.floor(yNorm * (rows - 1));
  const kernel = [
    { dx: 0, dy: 0, w: 1.0 },
    { dx: -1, dy: 0, w: 0.55 }, { dx: 1, dy: 0, w: 0.55 },
    { dx: 0, dy: -1, w: 0.55 }, { dx: 0, dy: 1, w: 0.55 },
    { dx: -1, dy: -1, w: 0.3 }, { dx: -1, dy: 1, w: 0.3 },
    { dx: 1, dy: -1, w: 0.3 }, { dx: 1, dy: 1, w: 0.3 },
  ];

  kernel.forEach(({ dx, dy, w }) => {
    const x = cx + dx;
    const y = cy + dy;
    if (x >= 0 && x < cols && y >= 0 && y < rows) grid[y][x] += w;
  });
}

function archiveHeatColor(t) {
  if (t < 0.22) return '#2563eb';
  if (t < 0.45) return '#06b6d4';
  if (t < 0.68) return '#facc15';
  if (t < 0.86) return '#fb923c';
  return '#ef4444';
}

function archiveBoundaryLinesSvg(extent) {
  return EUROPE_BOUNDARY_LINES.map((line) => {
    const commands = [];
    let open = false;

    line.forEach(([lng, lat]) => {
      const visible = archiveBoundaryPointNearExtent(lng, lat, extent);
      if (!visible) {
        open = false;
        return;
      }

      const p = projectArchivePoint({ lat, lng }, extent);
      commands.push(`${open ? 'L' : 'M'} ${p.x} ${p.y}`);
      open = true;
    });

    if (commands.length < 2) return '';
    return `<path class="archive-country-line" d="${esc(commands.join(' '))}"></path>`;
  }).join('');
}

function archiveBoundaryPointNearExtent(lng, lat, extent) {
  const latBuffer = Math.max((extent.maxLat - extent.minLat) * 0.22, 1.5);
  const lngBuffer = Math.max((extent.maxLng - extent.minLng) * 0.22, 1.5);
  return lat >= extent.minLat - latBuffer
    && lat <= extent.maxLat + latBuffer
    && lng >= extent.minLng - lngBuffer
    && lng <= extent.maxLng + lngBuffer;
}

function archiveMapExtent(records) {
  const coords = [];
  records.forEach((record) => {
    if (record.point) coords.push(record.point);
    (record.polylines || []).forEach((line) => coords.push(...line.points));
  });

  let minLat = Math.min(...coords.map((p) => p.lat));
  let maxLat = Math.max(...coords.map((p) => p.lat));
  let minLng = Math.min(...coords.map((p) => p.lng));
  let maxLng = Math.max(...coords.map((p) => p.lng));

  if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) || !Number.isFinite(minLng) || !Number.isFinite(maxLng)) {
    return { minLat: 35, maxLat: 45, minLng: -10, maxLng: 5 };
  }

  const latSpan = Math.max(maxLat - minLat, 1);
  const lngSpan = Math.max(maxLng - minLng, 1);
  const padLat = Math.max(latSpan * 0.18, 0.5);
  const padLng = Math.max(lngSpan * 0.18, 0.5);

  minLat = Math.max(-85, minLat - padLat);
  maxLat = Math.min(85, maxLat + padLat);
  minLng = Math.max(-180, minLng - padLng);
  maxLng = Math.min(180, maxLng + padLng);

  // The Archive map is a geography overview, not a tight GPX chart.
  // Keep a generous minimum viewport so one trip does not become an oversized bar
  // and coarse country outlines do not collapse into strange diagonal fragments.
  const minLatSpan = 8;
  const minLngSpan = 12;
  if (maxLat - minLat < minLatSpan) {
    const mid = (minLat + maxLat) / 2;
    minLat = Math.max(-85, mid - minLatSpan / 2);
    maxLat = Math.min(85, mid + minLatSpan / 2);
  }
  if (maxLng - minLng < minLngSpan) {
    const mid = (minLng + maxLng) / 2;
    minLng = Math.max(-180, mid - minLngSpan / 2);
    maxLng = Math.min(180, mid + minLngSpan / 2);
  }

  return { minLat, maxLat, minLng, maxLng };
}

function projectArchivePoint(point, extent) {
  const xMin = 42;
  const xMax = 958;
  const yMin = 28;
  const yMax = 568;
  const x = xMin + ((point.lng - extent.minLng) / (extent.maxLng - extent.minLng)) * (xMax - xMin);
  const y = yMax - ((point.lat - extent.minLat) / (extent.maxLat - extent.minLat)) * (yMax - yMin);
  return {
    x: Number.isFinite(x) ? Math.round(x * 10) / 10 : 500,
    y: Number.isFinite(y) ? Math.round(y * 10) / 10 : 300,
  };
}

function archiveMapTicks(extent) {
  return {
    lat: niceTicks(extent.minLat, extent.maxLat, 4),
    lng: niceTicks(extent.minLng, extent.maxLng, 5),
  };
}

function niceTicks(min, max, target) {
  const span = Math.max(max - min, 1);
  const rawStep = span / Math.max(target, 1);
  const pow = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / pow;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pow;
  const first = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = first; v <= max + step * 0.25; v += step) {
    if (v > min && v < max) ticks.push(Math.round(v * 100) / 100);
  }
  return ticks.slice(0, target + 2);
}

function formatLat(lat) {
  const hemi = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(Math.round(lat * 10) / 10)}°${hemi}`;
}

function formatLng(lng) {
  const hemi = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(Math.round(lng * 10) / 10)}°${hemi}`;
}

function bindArchiveMapEvents(root = document) {
  root.querySelectorAll('[data-map-trip-id]').forEach((el) => {
    el.addEventListener('click', () => openTrip(el.dataset.mapTripId));
  });
}

function archiveTripMetaText(trip) {
  const stages = STATE.stagesByTrip[trip.id];
  const expenses = STATE.expensesByTrip[trip.id];
  const stagesLoaded = Array.isArray(stages);
  const expensesLoaded = Array.isArray(expenses);
  const stageCount = stagesLoaded ? stages.length : null;
  const distance = stagesLoaded ? stages.reduce((sum, s) => sum + (Number(s.distance_km) || 0), 0) : null;
  const cost = expensesLoaded ? expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) : null;
  let entries = 0;
  let entriesLoaded = stagesLoaded;

  if (stagesLoaded) {
    stages.forEach((stage) => {
      const stageEntries = STATE.entriesByStage[stage.id];
      if (Array.isArray(stageEntries)) entries += stageEntries.length;
      else entriesLoaded = false;
    });
  }

  return [
    stagesLoaded ? `${stageCount} stage${stageCount === 1 ? '' : 's'}` : 'Stages …',
    stagesLoaded && distance ? `${Math.round(distance)} km` : (stagesLoaded ? null : 'Distance …'),
    expensesLoaded && cost ? fmtEuro(cost, { compact: true }) : (expensesLoaded ? null : 'Cost …'),
    entriesLoaded ? `${entries} entr${entries === 1 ? 'y' : 'ies'}` : 'Entries …',
  ].filter(Boolean).join(' · ');
}

function archiveTripMetaHtml(trip) {
  const meta = archiveTripMetaText(trip);
  return meta ? `<div class="trip-desc archive-trip-meta">${esc(meta)}</div>` : '';
}

function archiveTripCardHtml(trip) {
  const base = tripCardHtml(trip);
  return base.replace('</button>', `${archiveTripMetaHtml(trip)}</button>`);
}

function archiveResultsListHtml() {
  const allArchived = archiveTripsBase();
  const trips = filteredArchiveTrips();
  const hasFilters = STATE.archiveSearch.trim() || STATE.archiveStatusFilter !== 'all';

  if (!allArchived.length) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="9"/>
          <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>
        </svg>
        <div class="empty-title">Archive</div>
        <div class="empty-sub">Completed and cancelled trips will appear here.</div>
      </div>
    `;
  }

  if (!trips.length) {
    return `
      <div class="empty-state">
        <div class="empty-title">No matching archived trips</div>
        <div class="empty-sub">${hasFilters ? 'Adjust the search or status filter.' : 'No archived trips to show.'}</div>
      </div>
    `;
  }

  return `<div class="trip-list">${trips.map(archiveTripCardHtml).join('')}</div>`;
}


function archiveResultsHtml() {
  return STATE.archiveViewMode === 'map' ? archiveMapHtml() : archiveResultsListHtml();
}

function renderArchive() {
  if (!STATE.user) return signedOutState('Sign in to see the archive', 'Completed and cancelled trips will appear here.');

  if (STATE.tripsLoading && !STATE.trips.length) {
    return `<div class="empty-state"><div class="empty-sub">Loading archive…</div></div>`;
  }

  if (STATE.tripsError) return errorCard(STATE.tripsError, 'retryTripsBtn');

  return `
    <div class="card">
      <div class="card-title">Archive</div>
      <div style="font-size:14px;color:#c5d0e0;line-height:1.5;margin-bottom:12px;">
        Completed trips count toward archive totals. Cancelled trips stay listed for reference but do not affect totals.
      </div>
      ${archiveMetricsHtml()}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;">
      <div class="section-label" style="margin-bottom:0;">Past trips</div>
      ${archiveViewToggleHtml()}
    </div>
    ${archiveFiltersHtml()}
    <div id="archiveResults">${archiveResultsHtml()}</div>
  `;
}


function signedOutState(title, subtitle) {
  return `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 6h18M3 12h18M3 18h12"/>
      </svg>
      <div class="empty-title">${esc(title)}</div>
      <div class="empty-sub">${esc(subtitle || '')}</div>
      <button class="btn btn-primary" id="emptySignInBtn" style="margin-top:14px;">Sign in with Google</button>
    </div>
  `;
}

function errorCard(message, retryId) {
  return `
    <div class="card">
      <div class="card-title" style="color:#ef6262;">Error</div>
      <div style="color:#c5d0e0;font-size:14px;line-height:1.5;">${esc(message)}</div>
      <button class="btn btn-secondary btn-block" style="margin-top:12px;" id="${esc(retryId)}">Retry</button>
    </div>
  `;
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

// ---------- Weather rendering ----------
function weatherStripHtml(stage) {
  const result = STATE.forecastsByStage[stage.id];
  const hasAnyCoords =
    (typeof stage.start_lat === 'number' && typeof stage.start_lng === 'number') ||
    (typeof stage.end_lat === 'number' && typeof stage.end_lng === 'number');

  if (!hasAnyCoords) {
    const hasLocationText = Boolean(stage.start_location || stage.end_location);
    return hasLocationText && stage.planned_date
      ? `<div class="weather-strip muted">Weather unavailable. Check the stage location names or try again later.</div>`
      : '';
  }
  if (!stage.planned_date) return `<div class="weather-strip muted">Set a planned date to see the weather forecast.</div>`;
  if (result === 'loading' || result === undefined) return `<div class="weather-strip muted">Loading weather…</div>`;
  if (!result.length) return `<div class="weather-strip muted">Weather unavailable for this stage. Check the location names or try again later.</div>`;

  const usable = result.filter((p) => p.forecast);
  if (!usable.length) return `<div class="weather-strip muted">No forecast available for this date (max 16 days ahead).</div>`;

  const points = usable.map((p) => {
    const f = p.forecast;
    const tempRange = (f.tempMin != null && f.tempMax != null)
      ? `${Math.round(f.tempMin)}–${Math.round(f.tempMax)}°`
      : '—';
    const precip = (f.precipProb != null)
      ? `${Math.round(f.precipProb)}%`
      : (f.precipMm != null ? `${f.precipMm} mm` : '—');
    const wind = f.windKmh != null ? `${Math.round(f.windKmh)} km/h` : '—';
    return `
      <div class="wx-point">
        <div class="wx-label">${esc(p.label)}</div>
        <div class="wx-icon" title="${esc(f.label)}">${f.icon}</div>
        <div class="wx-temp">${esc(tempRange)}</div>
        <div class="wx-meta">💧 ${esc(precip)} · 💨 ${esc(wind)}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="weather-strip">
      <div class="wx-points">${points}</div>
      <div class="wx-attribution">Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></div>
    </div>
  `;
}

// ---------- Journal rendering ----------
function entryCardHtml(entry) {
  const meta = ENTRY_TYPE_META[entry.entry_type] || ENTRY_TYPE_META.note;
  const location = entry.location_url
    ? `<a class="entry-meta-link" href="${esc(entry.location_url)}" target="_blank" rel="noopener">📍 ${esc(entry.location || 'Location')}${linkHostBadgeHtml(entry.location_url)}</a>`
    : (entry.location ? `<span>📍 ${esc(entry.location)}</span>` : '');

  return `
    <div class="entry-card">
      <div class="entry-head">
        <div class="entry-type-icon" title="${esc(meta.label)}">${meta.icon}</div>
        <div class="entry-head-text">
          ${entry.title ? `<div class="entry-title">${esc(entry.title)}</div>` : `<div class="entry-title entry-title-muted">${esc(meta.label)}</div>`}
          <div class="entry-meta">
            <span class="entry-author" title="${esc(authorLabel(entry.author_id))}">${esc(authorInitials(entry.author_id))}</span>
            ${entry.timestamp ? `<span>${esc(fmtDateTime(entry.timestamp))}</span>` : ''}
            ${location}
          </div>
        </div>
        <div class="entry-actions">
          <button class="entry-icon-btn" data-entry-action="edit" data-id="${esc(entry.id)}" title="Edit"${writeDisabledAttr()}>✎</button>
          <button class="entry-icon-btn entry-icon-danger" data-entry-action="delete" data-id="${esc(entry.id)}" title="Delete"${writeDisabledAttr()}>✕</button>
        </div>
      </div>
      ${entry.description ? `<div class="entry-desc">${esc(entry.description)}</div>` : ''}
      ${entryLinksHtml(entry)}
    </div>
  `;
}

function entryLinksHtml(entry) {
  const links = [];
  if (entry.info_url) links.push(`<a class="entry-link" href="${esc(entry.info_url)}" target="_blank" rel="noopener">🔗 Website ${linkHostBadgeHtml(entry.info_url)}</a>`);
  if (entry.photo_album_url) links.push(`<a class="entry-link" href="${esc(entry.photo_album_url)}" target="_blank" rel="noopener">📷 Photo album ${linkHostBadgeHtml(entry.photo_album_url)}</a>`);
  return links.length ? `<div class="entry-links">${links.join('')}</div>` : '';
}

function journalSectionHtml(stage) {
  const expanded = STATE.expandedStages.has(stage.id);
  const entries = STATE.entriesByStage[stage.id];
  const count = Array.isArray(entries) ? entries.length : null;

  const summary = `
    <button class="journal-toggle" data-stage-id="${esc(stage.id)}">
      <span>${expanded ? '▾' : '▸'} Journal${count !== null ? ` (${count})` : ''}</span>
    </button>
  `;

  if (!expanded) return summary;

  let body;
  if (entries === 'loading' || entries === undefined) {
    body = `<div class="empty-sub" style="padding:8px 0;">Loading entries…</div>`;
  } else if (!entries.length) {
    body = `<div class="empty-sub" style="padding:8px 0;">No entries yet.</div>`;
  } else {
    body = `<div class="entry-list">${entries.map(entryCardHtml).join('')}</div>`;
  }

  return `
    ${summary}
    <div class="journal-body">
      ${body}
      <button class="btn btn-secondary btn-sm btn-block" data-stage-add-entry="${esc(stage.id)}" style="margin-top:8px;"${writeDisabledAttr()}>+ Add entry</button>
    </div>
  `;
}

// ---------- GPX rendering ----------
function gpxTracksForTrip(tripId) {
  const tracks = STATE.gpxByTrip[tripId];
  return Array.isArray(tracks) ? tracks : [];
}

function gpxTracksForStage(trip, stage) {
  return gpxTracksForTrip(trip.id).filter((track) => track.stage_id === stage.id);
}

function gpxTrackMeta(track) {
  const parts = [];
  if (track.distance_km != null) parts.push(fmtKm(track.distance_km));
  if (track.duration_seconds != null) parts.push(fmtDuration(track.duration_seconds));
  return parts.join(' · ');
}

function gpxUploadButtonHtml(stage, label = 'Upload GPX') {
  return `
    <button class="btn btn-secondary btn-sm gpx-upload-btn" data-stage-gpx-upload="${esc(stage.id)}"${writeDisabledAttr()}>
      ${esc(label)}
    </button>
  `;
}

function gpxStageSectionHtml(stage, trip) {
  const tracksRaw = STATE.gpxByTrip[trip.id];
  const tracks = gpxTracksForStage(trip, stage);
  const expanded = STATE.expandedGpxStages.has(stage.id);
  const totalDistance = tracks.reduce((sum, track) => sum + (Number(track.distance_km) || 0), 0);
  const summary = tracksRaw === 'loading' || STATE.gpxLoading
    ? 'Loading…'
    : tracks.length
      ? `${tracks.length} track${tracks.length === 1 ? '' : 's'}${totalDistance ? ` · ${fmtKm(totalDistance)}` : ''}`
      : 'No track yet';

  let body = '';
  if (expanded) {
    if (tracksRaw === 'loading' || STATE.gpxLoading) {
      body = `<div class="empty-sub gpx-section-body">Loading GPX tracks…</div>`;
    } else if (!tracks.length) {
      body = `
        <div class="gpx-section-body">
          <div class="empty-sub">Upload one or more GPX files for this stage. Multiple files are expected when GPS recording was stopped during breaks.</div>
          <div class="gpx-actions-row">${gpxUploadButtonHtml(stage, 'Upload GPX')}</div>
        </div>
      `;
    } else {
      body = `
        <div class="gpx-track-list gpx-section-body">
          ${tracks.map((track) => `
            <div class="gpx-track-row">
              <div class="gpx-track-main">
                <div class="gpx-track-name">${esc(trackFileName(track))}</div>
                <div class="gpx-track-meta">${esc(gpxTrackMeta(track) || 'GPX track')}</div>
              </div>
              <button class="entry-icon-btn entry-icon-danger" data-gpx-action="delete" data-id="${esc(track.id)}" title="Delete GPX"${writeDisabledAttr()}>✕</button>
            </div>
          `).join('')}
        </div>
        <div class="gpx-actions-row">${gpxUploadButtonHtml(stage, 'Upload another GPX')}</div>
      `;
    }
  }

  return `
    <div class="gpx-section ${expanded ? 'open' : ''}">
      <div class="gpx-section-head">
        <button class="gpx-summary-toggle" data-gpx-toggle="${esc(stage.id)}" aria-expanded="${expanded ? 'true' : 'false'}">
          <span class="gpx-caret">${expanded ? '▾' : '▸'}</span>
          <span class="gpx-summary-copy">
            <span class="gpx-section-title">GPX</span>
            <span class="gpx-summary-text">${esc(summary)}</span>
          </span>
        </button>
      </div>
      ${STATE.gpxError ? `<div class="stage-warn">${esc(STATE.gpxError)}</div>` : ''}
      ${body}
    </div>
  `;
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

function renderTripDetail() {
  const trip = currentTrip();
  if (!trip) return tripNotFoundHtml();

  const meta = STATUS_META[trip.status] || STATUS_META.planning;
  return `
    <button class="btn btn-secondary btn-sm" id="backToTripsBtn" style="margin-bottom:12px;">← Back</button>

    <div class="card">
      <div class="trip-detail-head">
        <h1 class="trip-detail-title">${esc(trip.title)}</h1>
        <div class="trip-detail-pills">
          <span class="status-pill ${meta.cls}">${esc(meta.label)}</span>
          ${visibilityPillHtml(trip)}
        </div>
      </div>
      <div class="trip-detail-dates">${esc(fmtDateRange(trip.start_date, trip.end_date))}</div>
      ${trip.description ? `<div class="trip-detail-desc">${esc(trip.description)}</div>` : ''}
      ${auditLineHtml(trip)}
      ${tripStatsStripHtml(trip)}
      <div class="trip-detail-actions">
        <button class="btn btn-secondary btn-sm" id="summaryTripBtn">Summary</button>
        <button class="btn btn-secondary btn-sm" id="editTripBtn"${writeDisabledAttr()}>Edit</button>
        ${canDeleteTrip(trip) ? `<button class="btn btn-danger btn-sm" id="deleteTripBtn"${writeDisabledAttr()}>Delete</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Stages</div>
      ${renderStagesSection(trip)}
    </div>

    <div class="card">
      <div class="card-title">Expenses</div>
      ${renderExpensesSection(trip)}
    </div>
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

function statItemHtml(label, value) {
  return `
    <div class="trip-stat">
      <div class="trip-stat-value">${esc(value)}</div>
      <div class="trip-stat-label">${esc(label)}</div>
    </div>
  `;
}

// ---------- Summary view ----------
function renderTripSummary() {
  const trip = currentTrip();
  if (!trip) return tripNotFoundHtml();

  const stages = STATE.stagesByTrip[trip.id] || [];
  const expenses = expensesForTrip(trip.id);
  return `
    <button class="btn btn-secondary btn-sm" id="backToDetailBtn" style="margin-bottom:12px;">← Back to trip</button>

    <div class="card">
      <div class="trip-detail-head">
        <h1 class="trip-detail-title">${esc(trip.title)}</h1>
        <div class="trip-detail-pills">
          <span class="status-pill ${(STATUS_META[trip.status] || STATUS_META.planning).cls}">${esc((STATUS_META[trip.status] || STATUS_META.planning).label)}</span>
          ${visibilityPillHtml(trip)}
        </div>
      </div>
      <div class="trip-detail-dates">${esc(fmtDateRange(trip.start_date, trip.end_date))}</div>
      <div class="section-label" style="margin-top:12px;margin-bottom:8px;">Trip Summary Review</div>
      ${tripStatsStripHtml(trip)}
    </div>

    <div class="card">
      <div class="card-title">Trip cost</div>
      ${expenseTotalsHtml(expenseTotals(expenses))}
    </div>

    <div class="card">
      <div class="card-title">Summary table</div>
      ${summaryTableHtml(stages, trip)}
      ${summaryTripLevelExpensesHtml(trip)}
    </div>
  `;
}

function summaryTableHtml(stages, trip) {
  if (STATE.stagesLoading && !stages.length) return `<div class="empty-sub">Loading summary…</div>`;
  if (!stages.length) return `<div class="empty-sub">No stages yet.</div>`;

  return `
    <div class="summary-table-wrap">
      <table class="summary-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>From → To</th>
            <th>Distance</th>
            <th>Notes</th>
            <th>Journal / expenses</th>
          </tr>
        </thead>
        <tbody>
          ${stages.map((stage, index) => summaryStageRowsHtml(stage, trip, index)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function summaryStageRowsHtml(stage, trip, index) {
  const entries = STATE.entriesByStage[stage.id];
  const expenses = expensesForTrip(trip.id).filter((expense) => expense.stage_id === stage.id);
  const expanded = STATE.expandedSummaryStages.has(stage.id);
  const entryCount = Array.isArray(entries) ? entries.length : (entries === 'loading' ? '…' : 0);
  const expenseCount = expenses.length;
  const warning = isStageDateOutsideTrip(stage, trip) ? `<div class="summary-warning">Outside trip dates</div>` : '';

  const main = `
    <tr class="summary-stage-row">
      <td>${stage.planned_date ? esc(fmtDate(stage.planned_date)) : '—'}${warning}</td>
      <td>${esc(stageRouteLabel(stage, index))}</td>
      <td>${stage.distance_km != null ? `${esc(stage.distance_km)} km` : '—'}</td>
      <td>${stage.notes ? esc(stage.notes) : '—'}</td>
      <td>
        <button class="summary-toggle" data-summary-stage-id="${esc(stage.id)}">
          ${expanded ? '▾' : '▸'} ${esc(entryCount)} journal · ${esc(expenseCount)} expenses
        </button>
      </td>
    </tr>
  `;

  if (!expanded) return main;

  return main + `
    <tr class="summary-entry-row">
      <td colspan="5">
        <div class="summary-review-grid">
          <div>
            <div class="summary-subtitle">Journal entries</div>
            ${summaryEntriesHtml(entries)}
          </div>
          <div>
            <div class="summary-subtitle">Expenses assigned to this stage</div>
            ${summaryExpensesHtml(expenses, trip, 'No expenses assigned to this stage.')}
          </div>
        </div>
      </td>
    </tr>
  `;
}

function summaryEntriesHtml(entries) {
  if (entries === 'loading' || entries === undefined) return `<div class="empty-sub">Loading entries…</div>`;
  if (!entries.length) return `<div class="empty-sub">No journal entries for this stage.</div>`;

  return `
    <div class="summary-entry-table-wrap">
      <table class="summary-entry-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Time</th>
            <th>Title</th>
            <th>Location</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(summaryEntryRowHtml).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function summaryEntryRowHtml(entry) {
  const meta = ENTRY_TYPE_META[entry.entry_type] || ENTRY_TYPE_META.note;
  const location = entry.location_url
    ? `<a href="${esc(entry.location_url)}" target="_blank" rel="noopener">${esc(entry.location || 'Map')} ${linkHostBadgeHtml(entry.location_url)}</a>`
    : esc(entry.location || '—');
  const links = [];
  if (entry.info_url) links.push(`<a href="${esc(entry.info_url)}" target="_blank" rel="noopener">Website ${linkHostBadgeHtml(entry.info_url)}</a>`);
  if (entry.photo_album_url) links.push(`<a href="${esc(entry.photo_album_url)}" target="_blank" rel="noopener">Album ${linkHostBadgeHtml(entry.photo_album_url)}</a>`);

  return `
    <tr>
      <td>${esc(meta.icon)} ${esc(meta.label)}</td>
      <td>${entry.timestamp ? esc(fmtDateTime(entry.timestamp)) : '—'}</td>
      <td>${entry.title ? esc(entry.title) : '—'}${entry.description ? `<div class="summary-entry-desc">${esc(entry.description)}</div>` : ''}</td>
      <td>${location}</td>
      <td>${links.length ? links.join(' · ') : '—'}</td>
    </tr>
  `;
}

function summaryExpensesHtml(expenses, trip, emptyMessage = 'No expenses.') {
  if (!expenses.length) return `<div class="empty-sub">${esc(emptyMessage)}</div>`;
  return `
    <div class="summary-expense-list">
      ${expenses.map((expense) => summaryExpenseItemHtml(expense, trip)).join('')}
    </div>
  `;
}

function summaryExpenseItemHtml(expense, trip) {
  const meta = EXPENSE_CATEGORY_META[expense.category] || EXPENSE_CATEGORY_META.other;
  const payer = displayNameForUserId(expense.user_id);
  const warning = isExpenseDateOutsideTrip(expense, trip)
    ? `<div class="summary-warning">Expense date is outside the trip date range.</div>`
    : '';
  return `
    <div class="summary-expense-item">
      <div class="summary-expense-title">${esc(meta.icon)} ${esc(meta.label)} · ${esc(fmtEuro(expense.amount))}</div>
      <div class="summary-expense-meta">Paid by ${esc(payer)}${expense.date ? ` · ${esc(fmtDate(expense.date))}` : ''}</div>
      ${expense.description ? `<div class="summary-entry-desc">${esc(expense.description)}</div>` : ''}
      ${warning}
    </div>
  `;
}

function summaryTripLevelExpensesHtml(trip) {
  const expenses = expensesForTrip(trip.id).filter((expense) => !expense.stage_id);
  if (!expenses.length) return '';
  return `
    <div class="summary-trip-expenses">
      <div class="summary-subtitle">Trip-level expenses</div>
      ${summaryExpensesHtml(expenses, trip, 'No trip-level expenses.')}
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


// ---------- PWA install helper ----------
function detectedInstallPlatform() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return 'desktop';
}

function installStepsForPlatform(platform) {
  if (platform === 'ios') {
    return {
      title: 'iPhone / iPad',
      note: 'Use Safari. Other iOS browsers usually cannot add the PWA properly.',
      steps: ['Open routefolk in Safari.', 'Tap the Share button.', 'Choose Add to Home Screen.', 'Tap Add.'],
    };
  }
  if (platform === 'android') {
    return {
      title: 'Android',
      note: 'Chrome gives the most reliable install flow.',
      steps: ['Open routefolk in Chrome.', 'Tap the three-dot menu.', 'Choose Install app or Add to Home screen.', 'Confirm the install.'],
    };
  }
  return {
    title: 'Desktop',
    note: 'Chrome and Edge usually show an install icon in the address bar when the app is installable.',
    steps: ['Open routefolk in Chrome or Edge.', 'Click the install icon in the address bar, when available.', 'Confirm the install.', 'Open routefolk from your app launcher or dock.'],
  };
}

function installStepsHtml(config) {
  return `
    <div class="install-helper-block">
      <div class="install-helper-title">${esc(config.title)}</div>
      <ol class="install-steps">
        ${config.steps.map((step) => `<li>${esc(step)}</li>`).join('')}
      </ol>
      <div class="form-help">${esc(config.note)}</div>
    </div>
  `;
}

function pwaInstallHelperHtml() {
  const platform = detectedInstallPlatform();
  const primary = installStepsForPlatform(platform);
  const others = ['ios', 'android', 'desktop'].filter((p) => p !== platform).map(installStepsForPlatform);
  return `
    <div class="card">
      <div class="card-title">Install routefolk</div>
      <div style="font-size:14px;color:#c5d0e0;line-height:1.5;margin-bottom:12px;">
        Add routefolk to your home screen so it opens like a normal app.
      </div>
      ${installStepsHtml(primary)}
      <details class="form-details install-helper-details">
        <summary>Instructions for other devices</summary>
        <div class="install-helper-extra">
          ${others.map(installStepsHtml).join('')}
        </div>
      </details>
    </div>
  `;
}

// ---------- Account ----------
function renderAccount() {
  if (!STATE.user) {
    return `
      <div class="card">
        <div class="card-title">Account</div>
        <div style="font-size:14px;color:#c5d0e0;line-height:1.5;margin-bottom:14px;">
          Sign in with Google to access shared trips.
        </div>
        <button class="btn-google" id="accountSignInBtn">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"/></svg>
          Sign in with Google
        </button>
      </div>
    `;
  }

  const avatar = userAvatarUrl(STATE.user);
  return `
    <div class="card">
      <div class="card-title">Account</div>
      <div class="account-row">
        <div class="account-avatar">
          ${avatar ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : esc(userInitials(STATE.user))}
        </div>
        <div class="account-info">
          <div class="account-name">${esc(userDisplayName(STATE.user))}</div>
          <div class="account-email">${esc(STATE.user.email || '')}</div>
        </div>
      </div>
      <button class="btn btn-secondary btn-block" id="signOutBtn" style="margin-top:12px;">Sign out</button>
    </div>

    <div class="card">
      <div class="card-title">People with access</div>
      ${peopleListHtml()}
      <div class="form-help" style="margin-top:10px;">
        This list shows users who have signed in at least once. Add or remove access in the Google OAuth Test users list.
      </div>
    </div>

    ${pwaInstallHelperHtml()}
  `;
}

function peopleListHtml() {
  if (STATE.profilesLoading && !STATE.profiles.length) return `<div class="empty-sub">Loading people…</div>`;
  if (STATE.profilesError) return `<div class="stage-warn">${esc(STATE.profilesError)}</div>`;
  if (!STATE.profiles.length) return `<div class="empty-sub">No profiles yet. People appear here after their first sign-in.</div>`;

  return `
    <div class="people-list">
      ${STATE.profiles.map((profile) => {
        const initials = initialsFromName(profile.full_name || profile.email);
        const isYou = STATE.user?.id === profile.id;
        return `
          <div class="people-row">
            <div class="account-avatar people-avatar">
              ${profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="" referrerpolicy="no-referrer">` : esc(initials)}
            </div>
            <div class="account-info">
              <div class="account-name">${esc(profile.full_name || profile.email || 'Unknown')}${isYou ? ' <span class="people-you">You</span>' : ''}</div>
              <div class="account-email">${esc(profile.email || '')}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
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

  if (STATE.user && STATE.schemaLoading) {
    content.innerHTML = offlineBannerHtml() + `<div class="empty-state"><div class="empty-sub">Checking database schema…</div></div>`;
  } else if (STATE.user && STATE.schemaError) {
    content.innerHTML = offlineBannerHtml() + schemaErrorHtml();
  } else if (STATE.tab === 'account') {
    content.innerHTML = offlineBannerHtml() + renderAccount();
  } else if (STATE.view === 'detail') {
    content.innerHTML = offlineBannerHtml() + renderTripDetail();
  } else if (STATE.view === 'summary') {
    content.innerHTML = offlineBannerHtml() + renderTripSummary();
  } else if (STATE.tab === 'archive') {
    content.innerHTML = offlineBannerHtml() + renderArchive();
  } else {
    content.innerHTML = offlineBannerHtml() + renderTrips();
  }

  bindContentEvents(content);
  bindArchiveMapEvents(content);
  if (STATE.tab === 'archive' && STATE.archiveViewMode === 'map') ensureArchiveGpxGeometries();
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
        bindArchiveMapEvents(results);
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
        bindArchiveMapEvents(results);
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
      const expense = expensesForTrip(trip.id).find((e) => e.id === btn.dataset.id);
      if (!expense) return;
      if (!ensureOnline()) return;
      if (btn.dataset.expenseAction === 'edit') showEditExpenseModal(trip, expense);
      if (btn.dataset.expenseAction === 'delete') showDeleteExpenseConfirm(trip, expense);
    });
  });

  content.querySelectorAll('[data-summary-stage-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stageId = btn.dataset.summaryStageId;
      if (STATE.expandedSummaryStages.has(stageId)) {
        STATE.expandedSummaryStages.delete(stageId);
      } else {
        STATE.expandedSummaryStages.add(stageId);
        if (!STATE.entriesByStage[stageId] || STATE.entriesByStage[stageId] === 'loading') {
          loadEntriesForStage(stageId, { quiet: true });
        }
      }
      renderAll();
    });
  });
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
