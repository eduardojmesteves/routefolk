// ============================================================
// routefolk — app.js
// Phase 1: trips, stages, weather, journal, metrics, summary.
// ============================================================

import { signInWithGoogle, signOut, getCurrentUser, onAuthChange } from './lib/auth.js';
import { listTrips, createTrip, updateTrip, deleteTrip } from './lib/trips.js?v=20260511-visibility-fix';
import { listStages, createStage, updateStage, deleteStage, swapStageOrder } from './lib/stages.js';
import { fetchStageForecasts } from './lib/weather.js';
import { listEntriesForStage, createEntry, updateEntry, deleteEntry } from './lib/journal.js';
import { upsertCurrentProfile, listProfiles } from './lib/profiles.js';

const STATE = {
  tab: 'trips',
  view: 'list', // list | detail | summary
  viewTripId: null,
  user: null,
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
  if (STATE.view === 'summary') return 'Trip summary';
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

async function loadSignedInData() {
  if (!STATE.user) return;
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

async function openTrip(tripId, view = 'detail') {
  STATE.viewTripId = tripId;
  STATE.view = view;
  renderAll();
  if (!STATE.stagesByTrip[tripId]) await loadStagesForTrip(tripId);
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

function renderTrips() {
  if (!STATE.user) return signedOutState('Sign in to see trips', 'Trips are shared with everyone signed in.');

  if (STATE.tripsLoading && !STATE.trips.length) {
    return `<div class="empty-state"><div class="empty-sub">Loading trips…</div></div>`;
  }

  if (STATE.tripsError) return errorCard(STATE.tripsError, 'retryTripsBtn');

  const active = STATE.trips.filter((t) => t.status === 'planning' || t.status === 'active');

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
      <div class="section-label" style="margin-bottom:0;">Trips</div>
      <button class="btn btn-primary btn-sm" id="newTripBtn">+ New trip</button>
    </div>
  `;

  if (!active.length) {
    html += `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 6h18M3 12h18M3 18h12"/>
        </svg>
        <div class="empty-title">No active trips</div>
        <div class="empty-sub">Tap "+ New trip" to plan one.</div>
      </div>
    `;
  } else {
    html += `<div class="trip-list">${active.map(tripCardHtml).join('')}</div>`;
  }

  return html;
}

function renderArchive() {
  if (!STATE.user) return signedOutState('Sign in to see the archive', 'Completed and cancelled trips will appear here.');

  if (STATE.tripsLoading && !STATE.trips.length) {
    return `<div class="empty-state"><div class="empty-sub">Loading archive…</div></div>`;
  }

  if (STATE.tripsError) return errorCard(STATE.tripsError, 'retryTripsBtn');

  const archived = STATE.trips.filter((t) => t.status === 'completed' || t.status === 'cancelled');
  if (!archived.length) {
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

  return `
    <div class="section-label">Past trips</div>
    <div class="trip-list">${archived.map(tripCardHtml).join('')}</div>
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
          <button class="entry-icon-btn" data-entry-action="edit" data-id="${esc(entry.id)}" title="Edit">✎</button>
          <button class="entry-icon-btn entry-icon-danger" data-entry-action="delete" data-id="${esc(entry.id)}" title="Delete">✕</button>
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
      <button class="btn btn-secondary btn-sm btn-block" data-stage-add-entry="${esc(stage.id)}" style="margin-top:8px;">+ Add entry</button>
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
          <button class="stage-order-btn" data-stage-action="up" data-id="${esc(stage.id)}" ${index === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button class="stage-order-btn" data-stage-action="down" data-id="${esc(stage.id)}" ${index === total - 1 ? 'disabled' : ''} title="Move down">↓</button>
        </div>
        <div class="stage-body">
          <div class="stage-title">${esc(route)}</div>
          ${meta.length ? `<div class="stage-meta">${esc(meta.join(' · '))}</div>` : ''}
          ${stage.notes ? `<div class="stage-notes">${esc(stage.notes)}</div>` : ''}
          ${stageDateWarningHtml(stage, trip)}
          ${!hasCoords ? `<div class="stage-warn">No coordinates — type a city name and we'll look it up automatically.</div>` : ''}
        </div>
      </div>
      ${weatherStripHtml(stage)}
      <div class="stage-actions">
        ${navUrl ? `<a class="btn btn-secondary btn-sm" href="${esc(navUrl)}" target="_blank" rel="noopener">Navigate</a>` : ''}
        <button class="btn btn-secondary btn-sm" data-stage-action="edit" data-id="${esc(stage.id)}">Edit</button>
        <button class="btn btn-danger btn-sm" data-stage-action="delete" data-id="${esc(stage.id)}">Delete</button>
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
      <button class="btn btn-primary btn-block" id="addStageBtn">+ Add stage</button>
    `;
  }

  return `
    <div class="stage-list">
      ${stages.map((s, i) => stageCardHtml(s, trip, i, stages.length)).join('')}
    </div>
    <button class="btn btn-primary btn-block" style="margin-top:12px;" id="addStageBtn">+ Add stage</button>
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
      ${tripStatsStripHtml(trip)}
      <div class="trip-detail-actions">
        <button class="btn btn-secondary btn-sm" id="summaryTripBtn">Summary</button>
        <button class="btn btn-secondary btn-sm" id="editTripBtn">Edit</button>
        ${canDeleteTrip(trip) ? '<button class="btn btn-danger btn-sm" id="deleteTripBtn">Delete</button>' : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Stages</div>
      ${renderStagesSection(trip)}
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

  return {
    days: inclusiveDays(trip.start_date, trip.end_date),
    stages: stages.length,
    distance: totalDistance || null,
    entries: allEntriesLoaded ? entries.length : null,
    authors: allEntriesLoaded ? authors.size : null,
    avg,
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
      ${tripStatsStripHtml(trip)}
    </div>

    <div class="card">
      <div class="card-title">Summary table</div>
      ${summaryTableHtml(stages, trip)}
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
            <th>Journal</th>
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
  const expanded = STATE.expandedSummaryStages.has(stage.id);
  const count = Array.isArray(entries) ? entries.length : (entries === 'loading' ? '…' : 0);
  const warning = isStageDateOutsideTrip(stage, trip) ? `<div class="summary-warning">Outside trip dates</div>` : '';

  const main = `
    <tr class="summary-stage-row">
      <td>${stage.planned_date ? esc(fmtDate(stage.planned_date)) : '—'}${warning}</td>
      <td>${esc(stageRouteLabel(stage, index))}</td>
      <td>${stage.distance_km != null ? `${esc(stage.distance_km)} km` : '—'}</td>
      <td>${stage.notes ? esc(stage.notes) : '—'}</td>
      <td>
        <button class="summary-toggle" data-summary-stage-id="${esc(stage.id)}">
          ${expanded ? '▾' : '▸'} ${esc(count)}
        </button>
      </td>
    </tr>
  `;

  if (!expanded) return main;

  return main + `
    <tr class="summary-entry-row">
      <td colspan="5">
        ${summaryEntriesHtml(entries)}
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
  try {
    const trip = await createTrip(readTripForm());
    closeModal();
    await loadTrips();
    await openTrip(trip.id);
    toast('Trip created.');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to create trip.');
  }
}

async function handleUpdateTrip(tripId) {
  try {
    await updateTrip(tripId, readTripForm());
    closeModal();
    await loadTrips();
    renderAll();
    toast('Trip updated.');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to update trip.');
  }
}

async function handleDeleteTrip(tripId) {
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
    toast(err.message || 'Failed to delete trip.');
  }
}

async function handleCreateStage(tripId) {
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
    toast(err.message || 'Failed to add stage.');
  }
}

async function handleUpdateStage(stageId) {
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
    toast(err.message || 'Failed to update stage.');
  }
}

async function handleDeleteStage(stageId) {
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
    toast(err.message || 'Failed to delete stage.');
  }
}

async function handleMoveStage(stageId, direction) {
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
    toast(err.message || 'Failed to reorder stages.');
  }
}

async function handleCreateEntry(stageId) {
  try {
    await createEntry(stageId, readEntryForm());
    closeModal();
    await loadEntriesForStage(stageId, { quiet: true });
    toast('Entry added.');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to add entry.');
  }
}

async function handleUpdateEntry(stageId, entryId) {
  try {
    await updateEntry(entryId, readEntryForm());
    closeModal();
    await loadEntriesForStage(stageId, { quiet: true });
    toast('Entry updated.');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to update entry.');
  }
}

async function handleDeleteEntry(stageId, entryId) {
  try {
    await deleteEntry(entryId);
    closeModal();
    await loadEntriesForStage(stageId, { quiet: true });
    toast('Entry deleted.');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to delete entry.');
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

  if (STATE.tab === 'account') {
    content.innerHTML = renderAccount();
  } else if (STATE.view === 'detail') {
    content.innerHTML = renderTripDetail();
  } else if (STATE.view === 'summary') {
    content.innerHTML = renderTripSummary();
  } else if (STATE.tab === 'archive') {
    content.innerHTML = renderArchive();
  } else {
    content.innerHTML = renderTrips();
  }

  bindContentEvents(content);
}

function bindContentEvents(content) {
  content.querySelector('#emptySignInBtn')?.addEventListener('click', handleSignIn);
  content.querySelector('#accountSignInBtn')?.addEventListener('click', handleSignIn);
  content.querySelector('#signOutBtn')?.addEventListener('click', handleSignOut);
  content.querySelector('#retryTripsBtn')?.addEventListener('click', loadTrips);
  content.querySelector('#retryStagesBtn')?.addEventListener('click', () => {
    if (STATE.viewTripId) loadStagesForTrip(STATE.viewTripId);
  });
  content.querySelector('#newTripBtn')?.addEventListener('click', showNewTripModal);
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
    const trip = currentTrip();
    if (trip) showEditTripModal(trip);
  });
  content.querySelector('#deleteTripBtn')?.addEventListener('click', () => {
    const trip = currentTrip();
    if (trip) showDeleteTripConfirm(trip);
  });
  content.querySelector('#addStageBtn')?.addEventListener('click', () => {
    const trip = currentTrip();
    if (trip) showNewStageModal(trip);
  });

  content.querySelectorAll('[data-trip-id]').forEach((btn) => {
    btn.addEventListener('click', () => openTrip(btn.dataset.tripId));
  });

  content.querySelectorAll('[data-stage-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.stageAction;
      const id = btn.dataset.id;
      const trip = currentTrip();
      const stage = (trip ? (STATE.stagesByTrip[trip.id] || []) : []).find((s) => s.id === id);
      if (!stage && action !== 'up' && action !== 'down') return;
      if (action === 'up' || action === 'down') handleMoveStage(id, action);
      if (action === 'edit') showEditStageModal(stage, trip);
      if (action === 'delete') showDeleteStageConfirm(stage);
    });
  });

  content.querySelectorAll('[data-stage-id]').forEach((btn) => {
    btn.addEventListener('click', () => toggleStageJournal(btn.dataset.stageId));
  });

  content.querySelectorAll('[data-stage-add-entry]').forEach((btn) => {
    btn.addEventListener('click', () => showNewEntryModal(btn.dataset.stageAddEntry));
  });

  content.querySelectorAll('[data-entry-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entryId = btn.dataset.id;
      const { stageId, entry } = findEntry(entryId);
      if (!entry) return;
      if (btn.dataset.entryAction === 'edit') showEditEntryModal(stageId, entry);
      if (btn.dataset.entryAction === 'delete') showDeleteEntryConfirm(stageId, entry);
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
  renderAll();

  if (STATE.user) await loadSignedInData();

  onAuthChange(async (user) => {
    STATE.user = user;
    STATE.trips = [];
    STATE.stagesByTrip = {};
    STATE.entriesByStage = {};
    STATE.forecastsByStage = {};
    STATE.profiles = [];
    STATE.profilesById = {};
    STATE.profilesError = null;
    STATE.expandedStages.clear();
    STATE.expandedSummaryStages.clear();
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
