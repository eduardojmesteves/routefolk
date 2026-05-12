// ============================================================
// routefolk — app.js
// Phase 3A: archive baseline, install helper, cache-hardened shell.
// ============================================================

import { signInWithGoogle, signOut, getCurrentUser, onAuthChange } from './lib/auth.js';
import { listTrips, createTrip, updateTrip, deleteTrip } from './lib/trips.js';
import { listExpensesForTrip, createExpense, updateExpense, deleteExpense } from './lib/expenses.js';
import { listStages, createStage, updateStage, deleteStage, swapStageOrder } from './lib/stages.js';
import { fetchStageForecasts } from './lib/weather.js';
import { listEntriesForStage, createEntry, updateEntry, deleteEntry } from './lib/journal.js';
import { upsertCurrentProfile, listProfiles } from './lib/profiles.js';
import { getSchemaVersion } from './lib/meta.js';

const EXPECTED_SCHEMA_VERSION = '008';

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
  expandedSummaryStages: new Set(),
  profiles: [],                // users who have signed in at least once
  profilesById: {},
  profilesLoading: false,
  profilesError: null,
  expensesByTrip: {},       // tripId -> array of expenses OR 'loading'
  expensesLoading: false,
  expensesError: null,
  tripSearch: '',
  tripStatusFilter: 'all',
  tripFiltersOpen: false,
  archiveSearch: '',
  archiveStatusFilter: 'all',
  archiveFiltersOpen: false,
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


async function ensureArchiveData() {
  if (!STATE.user || STATE.archiveDataLoading) return;
  const archived = STATE.trips.filter((t) => t.status === 'completed' || t.status === 'cancelled');
  if (!archived.length) return;

  const needsWork = archived.some((trip) => {
    const stages = STATE.stagesByTrip[trip.id];
    if (!Array.isArray(stages)) return true;
    if (!Array.isArray(STATE.expensesByTrip[trip.id])) return true;
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
          <option value="all" ${STATE.tripStatusFilter === 'all' ? 'selected' : ''}>All</option>
          ${Object.entries(STATUS_META).map(([key, meta]) => `<option value="${esc(key)}" ${STATE.tripStatusFilter === key ? 'selected' : ''}>${esc(meta.label)}</option>`).join('')}
        </select>
      </div>
    </div>
  `;
}

function filteredTripsForTripsScreen() {
  const query = STATE.tripSearch.trim().toLowerCase();
  return STATE.trips.filter((trip) => {
    const matchesStatus = STATE.tripStatusFilter === 'all' || trip.status === STATE.tripStatusFilter;
    const matchesSearch = !query || String(trip.title || '').toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });
}

function tripResultsHtml() {
  const trips = filteredTripsForTripsScreen();
  const hasFilters = STATE.tripSearch.trim() || STATE.tripStatusFilter !== 'all';

  if (!STATE.trips.length) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 6h18M3 12h18M3 18h12"/>
        </svg>
        <div class="empty-title">No trips</div>
        <div class="empty-sub">Tap "+ New trip" to plan one.</div>
      </div>
    `;
  }

  if (!trips.length) {
    return `
      <div class="empty-state">
        <div class="empty-title">No matching trips</div>
        <div class="empty-sub">${hasFilters ? 'Adjust the search or status filter.' : 'No trips to show.'}</div>
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
  return STATE.trips.filter((t) => t.status === 'completed' || t.status === 'cancelled');
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

function archiveTripMetaHtml(trip) {
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

  const parts = [
    stagesLoaded ? `${stageCount} stage${stageCount === 1 ? '' : 's'}` : 'Stages …',
    stagesLoaded && distance ? `${Math.round(distance)} km` : (stagesLoaded ? null : 'Distance …'),
    expensesLoaded && cost ? fmtEuro(cost, { compact: true }) : (expensesLoaded ? null : 'Cost …'),
    entriesLoaded ? `${entries} entr${entries === 1 ? 'y' : 'ies'}` : 'Entries …',
  ].filter(Boolean);

  return `<div class="trip-desc archive-trip-meta">${esc(parts.join(' · '))}</div>`;
}

function archiveTripCardHtml(trip) {
  const base = tripCardHtml(trip);
  return base.replace('</button>', `${archiveTripMetaHtml(trip)}</button>`);
}

function archiveResultsHtml() {
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

    <div class="section-label">Past trips</div>
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

// ---------- Weather rendering ----------
function weatherStripHtml(stage) {
  const result = STATE.forecastsByStage[stage.id];
  const hasAnyCoords =
    (typeof stage.start_lat === 'number' && typeof stage.start_lng === 'number') ||
    (typeof stage.end_lat === 'number' && typeof stage.end_lng === 'number');

  if (!hasAnyCoords) return '';
  if (!stage.planned_date) return `<div class="weather-strip muted">Set a planned date to see the weather forecast.</div>`;
  if (result === 'loading' || result === undefined) return `<div class="weather-strip muted">Loading weather…</div>`;
  if (!result.length) return '';

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
    ? `<a class="entry-meta-link" href="${esc(entry.location_url)}" target="_blank" rel="noopener">📍 ${esc(entry.location || 'View location')}</a>`
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
  if (entry.info_url) links.push(`<a class="entry-link" href="${esc(entry.info_url)}" target="_blank" rel="noopener">🔗 Website</a>`);
  if (entry.photo_album_url) links.push(`<a class="entry-link" href="${esc(entry.photo_album_url)}" target="_blank" rel="noopener">📷 Photo album</a>`);
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
    ? `<a href="${esc(entry.location_url)}" target="_blank" rel="noopener">${esc(entry.location || 'Map')}</a>`
    : esc(entry.location || '—');
  const links = [];
  if (entry.info_url) links.push(`<a href="${esc(entry.info_url)}" target="_blank" rel="noopener">Website</a>`);
  if (entry.photo_album_url) links.push(`<a href="${esc(entry.photo_album_url)}" target="_blank" rel="noopener">Album</a>`);

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

function entryFormHtml(entry = {}) {
  return `
    <div class="form-row">
      <label class="form-label" for="jfType">Type</label>
      <select class="sel" id="jfType">
        ${Object.entries(ENTRY_TYPE_META).map(([key, m]) =>
          `<option value="${esc(key)}" ${(entry.entry_type || 'note') === key ? 'selected' : ''}>${esc(m.icon)} ${esc(m.label)}</option>`
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
      <input class="inp" id="jfTime" type="datetime-local" value="${esc(entry.timestamp ? isoToDatetimeLocal(entry.timestamp) : nowAsDatetimeLocal())}">
    </div>
    <div class="form-row">
      <label class="form-label" for="jfAlbum">Photo album URL (optional)</label>
      <input class="inp" id="jfAlbum" value="${esc(entry.photo_album_url || '')}" placeholder="https://photos.app.goo.gl/...">
      <div class="form-help">External album link. Must start with https://.</div>
    </div>
  `;
}

function readEntryForm() {
  return {
    entry_type: $('jfType')?.value || 'note',
    title: $('jfTitle')?.value.trim() || '',
    description: $('jfDesc')?.value.trim() || '',
    location: $('jfLocation')?.value.trim() || '',
    location_url: $('jfLocationUrl')?.value.trim() || '',
    info_url: $('jfInfoUrl')?.value.trim() || '',
    timestamp: datetimeLocalToIso($('jfTime')?.value || ''),
    photo_album_url: $('jfAlbum')?.value.trim() || '',
  };
}

function showNewEntryModal(stageId) {
  showModal('Add journal entry', entryFormHtml({ entry_type: 'note' }), [
    { label: 'Add entry', cls: 'btn-primary', fn: () => handleCreateEntry(stageId) },
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
  ]);
  setTimeout(() => $('jfTitle')?.focus(), 50);
}

function showEditEntryModal(stageId, entry) {
  showModal('Edit journal entry', entryFormHtml(entry), [
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
    await createEntry(stageId, readEntryForm());
    closeModal();
    await loadEntriesForStage(stageId, { quiet: true });
    toast('Entry added.');
  } catch (err) {
    console.error(err);
    toast(friendlyError('save journal entry', err));
  }
}

async function handleUpdateEntry(stageId, entryId) {
  if (!ensureOnline()) return;
  try {
    await updateEntry(entryId, readEntryForm());
    closeModal();
    await loadEntriesForStage(stageId, { quiet: true });
    toast('Entry updated.');
  } catch (err) {
    console.error(err);
    toast(friendlyError('save journal entry', err));
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
    STATE.tripStatusFilter = e.target.value || 'all';
    const results = content.querySelector('#tripResults');
    if (results) {
      results.innerHTML = tripResultsHtml();
      bindTripCards(results);
    }
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
    }
  });
  content.querySelector('#archiveStatusFilter')?.addEventListener('change', (e) => {
    STATE.archiveStatusFilter = e.target.value || 'all';
    const results = content.querySelector('#archiveResults');
    if (results) {
      results.innerHTML = archiveResultsHtml();
      bindTripCards(results);
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
