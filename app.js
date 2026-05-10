// ============================================================
// routefolk — app.js
// Phase 1, step 6.5: custom Maps URL on stages.
// Navigate button uses custom_route_url if set, else gmaps_url.
// ============================================================

import { signInWithGoogle, signOut, getCurrentUser, onAuthChange } from './lib/auth.js';
import { listTrips, createTrip, updateTrip, deleteTrip } from './lib/trips.js';
import { listStages, createStage, updateStage, deleteStage, swapStageOrder } from './lib/stages.js';
import { fetchStageForecasts } from './lib/weather.js';

const STATE = {
  tab: 'trips',
  view: 'list',
  viewTripId: null,
  user: null,
  trips: [],
  tripsLoading: false,
  tripsError: null,
  stagesByTrip: {},
  stagesLoading: false,
  stagesError: null,
  forecastsByStage: {},
};

const STATUS_META = {
  planning:  { label: 'Planning',  cls: 'status-planning'  },
  active:    { label: 'Active',    cls: 'status-active'    },
  completed: { label: 'Completed', cls: 'status-completed' },
  cancelled: { label: 'Cancelled', cls: 'status-cancelled' },
};

// ---------- DOM helpers ----------
function $(id) { return document.getElementById(id); }

function esc(v) {
  return String(v ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[ch]));
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

// ---------- Date helpers ----------
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
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

// ---------- Header ----------
function renderHeader() {
  const right = $('hdrRight');
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

// ---------- Data loaders ----------
async function loadTrips() {
  if (!STATE.user) return;
  STATE.tripsLoading = true;
  STATE.tripsError = null;
  renderTab();
  try {
    STATE.trips = await listTrips();
  } catch (err) {
    console.error(err);
    STATE.tripsError = err.message || 'Failed to load trips.';
  } finally {
    STATE.tripsLoading = false;
    renderTab();
  }
}

async function loadStagesForTrip(tripId) {
  STATE.stagesLoading = true;
  STATE.stagesError = null;
  renderTab();
  try {
    const stages = await listStages(tripId);
    STATE.stagesByTrip[tripId] = stages;
    stages.forEach(loadForecastForStage);
  } catch (err) {
    console.error(err);
    STATE.stagesError = err.message || 'Failed to load stages.';
  } finally {
    STATE.stagesLoading = false;
    renderTab();
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
  if (STATE.view === 'detail' && STATE.viewTripId === stage.trip_id) {
    renderTab();
  }
}

// ---------- Trip cards / list ----------
function tripCardHtml(trip) {
  const meta = STATUS_META[trip.status] || STATUS_META.planning;
  return `
    <button class="trip-card" data-id="${esc(trip.id)}">
      <div class="trip-card-head">
        <div class="trip-title">${esc(trip.title)}</div>
        <span class="status-pill ${meta.cls}">${esc(meta.label)}</span>
      </div>
      <div class="trip-dates">${esc(fmtDateRange(trip.start_date, trip.end_date))}</div>
      ${trip.description ? `<div class="trip-desc">${esc(trip.description)}</div>` : ''}
    </button>
  `;
}

function renderTrips() {
  if (!STATE.user) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 6h18M3 12h18M3 18h12"/>
        </svg>
        <div class="empty-title">Sign in to see trips</div>
        <div class="empty-sub">Trips are shared with everyone signed in.</div>
      </div>
    `;
  }

  if (STATE.tripsLoading && !STATE.trips.length) {
    return `<div class="empty-state"><div class="empty-sub">Loading trips…</div></div>`;
  }

  if (STATE.tripsError) {
    return `
      <div class="card">
        <div class="card-title" style="color:#ef6262;">Error</div>
        <div style="color:#c5d0e0;font-size:14px;line-height:1.5;">${esc(STATE.tripsError)}</div>
        <button class="btn btn-secondary btn-block" style="margin-top:12px;" id="retryTripsBtn">Retry</button>
      </div>
    `;
  }

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
  if (!STATE.user) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="9"/>
          <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>
        </svg>
        <div class="empty-title">Sign in to see the archive</div>
      </div>
    `;
  }

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

// ---------- Weather rendering ----------
function weatherStripHtml(stage) {
  const result = STATE.forecastsByStage[stage.id];

  const hasAnyCoords =
    (typeof stage.start_lat === 'number' && typeof stage.start_lng === 'number') ||
    (typeof stage.end_lat === 'number' && typeof stage.end_lng === 'number');
  if (!hasAnyCoords) return '';

  if (!stage.planned_date) {
    return `<div class="weather-strip muted">Set a planned date to see the weather forecast.</div>`;
  }

  if (result === 'loading' || result === undefined) {
    return `<div class="weather-strip muted">Loading weather…</div>`;
  }

  if (!result.length) return '';

  const usable = result.filter((p) => p.forecast);
  if (!usable.length) {
    return `<div class="weather-strip muted">No forecast available for this date (max 16 days ahead).</div>`;
  }

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

// ---------- Trip detail ----------
function stageNavigateUrl(stage) {
  // Custom takes precedence; fall back to auto-generated.
  return stage.custom_route_url || stage.gmaps_url || null;
}

function stageCardHtml(stage, index, total) {
  const route = [stage.start_location, stage.end_location].filter(Boolean).join(' → ') || stage.title || `Stage ${index + 1}`;
  const meta = [];
  if (stage.planned_date) meta.push(fmtDate(stage.planned_date));
  if (stage.distance_km != null) meta.push(`${stage.distance_km} km`);
  const hasCoords = stage.start_lat != null && stage.start_lng != null;
  const navUrl = stageNavigateUrl(stage);

  return `
    <div class="stage-card">
      <div class="stage-card-row">
        <div class="stage-order">
          <button class="stage-order-btn" data-action="up" data-id="${esc(stage.id)}" ${index === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button class="stage-order-btn" data-action="down" data-id="${esc(stage.id)}" ${index === total - 1 ? 'disabled' : ''} title="Move down">↓</button>
        </div>
        <div class="stage-body">
          <div class="stage-title">${esc(route)}</div>
          ${meta.length ? `<div class="stage-meta">${esc(meta.join(' · '))}</div>` : ''}
          ${stage.notes ? `<div class="stage-notes">${esc(stage.notes)}</div>` : ''}
          ${!hasCoords ? `<div class="stage-warn">No coordinates — type a city name and we'll look it up automatically.</div>` : ''}
        </div>
      </div>
      ${weatherStripHtml(stage)}
      <div class="stage-actions">
        ${navUrl ? `<a class="btn btn-secondary btn-sm" href="${esc(navUrl)}" target="_blank" rel="noopener">Navigate</a>` : ''}
        <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${esc(stage.id)}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${esc(stage.id)}">Delete</button>
      </div>
    </div>
  `;
}

function renderStagesSection(trip) {
  const stages = STATE.stagesByTrip[trip.id];

  if (STATE.stagesLoading && !stages) {
    return `<div class="empty-sub">Loading stages…</div>`;
  }

  if (STATE.stagesError) {
    return `
      <div style="color:#ef6262;font-size:13px;line-height:1.5;margin-bottom:8px;">${esc(STATE.stagesError)}</div>
      <button class="btn btn-secondary btn-sm" id="retryStagesBtn">Retry</button>
    `;
  }

  if (!stages || !stages.length) {
    return `
      <div class="empty-sub" style="margin-bottom:12px;">No stages yet. Add one to start planning the route.</div>
      <button class="btn btn-primary btn-block" id="addStageBtn">+ Add stage</button>
    `;
  }

  return `
    <div class="stage-list">
      ${stages.map((s, i) => stageCardHtml(s, i, stages.length)).join('')}
    </div>
    <button class="btn btn-primary btn-block" style="margin-top:12px;" id="addStageBtn">+ Add stage</button>
  `;
}

function renderTripDetail() {
  const trip = STATE.trips.find((t) => t.id === STATE.viewTripId);
  if (!trip) {
    return `
      <button class="btn btn-secondary btn-sm" id="backToTripsBtn" style="margin-bottom:12px;">← Back</button>
      <div class="empty-state">
        <div class="empty-title">Trip not found</div>
        <div class="empty-sub">It may have been deleted.</div>
      </div>
    `;
  }

  const meta = STATUS_META[trip.status] || STATUS_META.planning;
  return `
    <button class="btn btn-secondary btn-sm" id="backToTripsBtn" style="margin-bottom:12px;">← Back</button>

    <div class="card">
      <div class="trip-detail-head">
        <h1 class="trip-detail-title">${esc(trip.title)}</h1>
        <span class="status-pill ${meta.cls}">${esc(meta.label)}</span>
      </div>
      <div class="trip-detail-dates">${esc(fmtDateRange(trip.start_date, trip.end_date))}</div>
      ${trip.description ? `<div class="trip-detail-desc">${esc(trip.description)}</div>` : ''}

      <div class="trip-detail-actions">
        <button class="btn btn-secondary btn-sm" id="editTripBtn">Edit</button>
        <button class="btn btn-danger btn-sm" id="deleteTripBtn">Delete</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Stages</div>
      ${renderStagesSection(trip)}
    </div>
  `;
}

// ---------- Trip forms ----------
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
  `;
}

function readTripForm() {
  return {
    title: $('tfTitle')?.value.trim() || '',
    description: $('tfDesc')?.value.trim() || '',
    start_date: $('tfStart')?.value || '',
    end_date: $('tfEnd')?.value || '',
    status: $('tfStatus')?.value || 'planning',
  };
}

function showNewTripModal() {
  showModal('New trip', tripFormHtml({ status: 'planning' }), [
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

// ---------- Stage forms ----------
function stageFormHtml(stage = {}) {
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
      <div class="form-help">
        Plan your route in Google Maps, then paste the share link here to use it for navigation. Leave empty for the auto-generated route.
      </div>
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
      <div style="font-size:11px;color:#6b7a93;line-height:1.4;">
        Override only if the city lookup picks the wrong place. In Google Maps, right-click a place and click the coordinates to copy them.
      </div>
    </details>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="form-row">
        <label class="form-label" for="sfDate">Planned date</label>
        <input class="inp" id="sfDate" type="date" value="${esc(stage.planned_date || '')}">
      </div>
      <div class="form-row">
        <label class="form-label" for="sfDist">Distance (km)</label>
        <input class="inp" id="sfDist" type="number" min="0" step="1" value="${esc(stage.distance_km ?? '')}" placeholder="320">
      </div>
    </div>
    <div class="form-row">
      <label class="form-label" for="sfNotes">Notes</label>
      <textarea class="txt" id="sfNotes" maxlength="2000" placeholder="Optional notes about this stage">${esc(stage.notes || '')}</textarea>
    </div>
  `;
}

function readStageForm() {
  return {
    title: $('sfTitle')?.value || '',
    start_location: $('sfStartLoc')?.value || '',
    end_location: $('sfEndLoc')?.value || '',
    custom_route_url: $('sfCustomUrl')?.value || '',
    start_lat: $('sfStartLat')?.value || '',
    start_lng: $('sfStartLng')?.value || '',
    end_lat: $('sfEndLat')?.value || '',
    end_lng: $('sfEndLng')?.value || '',
    planned_date: $('sfDate')?.value || '',
    distance_km: $('sfDist')?.value || '',
    notes: $('sfNotes')?.value || '',
  };
}

function showNewStageModal(trip) {
  showModal('New stage', stageFormHtml(), [
    { label: 'Add stage', cls: 'btn-primary', fn: () => handleCreateStage(trip.id) },
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
  ]);
  setTimeout(() => $('sfStartLoc')?.focus(), 50);
}

function showEditStageModal(stage) {
  showModal('Edit stage', stageFormHtml(stage), [
    { label: 'Save', cls: 'btn-primary', fn: () => handleUpdateStage(stage.id) },
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
  ]);
}

function showDeleteStageConfirm(stage) {
  const label = [stage.start_location, stage.end_location].filter(Boolean).join(' → ') || stage.title || 'this stage';
  showModal('Delete stage',
    `<div style="font-size:14px;line-height:1.5;color:#c5d0e0;">
      Delete <strong>${esc(label)}</strong>? This also deletes its journal entries.
    </div>`,
    [
      { label: 'Delete', cls: 'btn-danger', fn: () => handleDeleteStage(stage.id) },
      { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    ]);
}

// ---------- Trip handlers ----------
async function handleCreateTrip() {
  const form = readTripForm();
  if (!form.title) { toast('Title is required.'); return; }
  try {
    const trip = await createTrip(form);
    STATE.trips = [trip, ...STATE.trips];
    closeModal();
    toast('Trip created.');
    goToDetail(trip.id);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to create trip.');
  }
}

async function handleUpdateTrip(id) {
  const form = readTripForm();
  if (!form.title) { toast('Title is required.'); return; }
  try {
    const updated = await updateTrip(id, form);
    STATE.trips = STATE.trips.map((t) => (t.id === id ? updated : t));
    closeModal();
    toast('Trip updated.');
    renderTab();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to update trip.');
  }
}

async function handleDeleteTrip(id) {
  try {
    await deleteTrip(id);
    STATE.trips = STATE.trips.filter((t) => t.id !== id);
    delete STATE.stagesByTrip[id];
    closeModal();
    toast('Trip deleted.');
    goTo(STATE.tab);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to delete trip.');
  }
}

// ---------- Stage handlers ----------
async function handleCreateStage(tripId) {
  const form = readStageForm();
  if (!form.start_location && !form.end_location && !form.title) {
    toast('Add at least a start, end, or stage title.');
    return;
  }
  try {
    const stage = await createStage(tripId, form);
    const list = STATE.stagesByTrip[tripId] || [];
    STATE.stagesByTrip[tripId] = [...list, stage];
    closeModal();
    toast('Stage added.');
    loadForecastForStage(stage);
    renderTab();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to add stage.');
  }
}

async function handleUpdateStage(id) {
  const form = readStageForm();
  try {
    const updated = await updateStage(id, form);
    const tripId = updated.trip_id;
    STATE.stagesByTrip[tripId] = (STATE.stagesByTrip[tripId] || []).map((s) =>
      (s.id === id ? updated : s)
    );
    delete STATE.forecastsByStage[id];
    closeModal();
    toast('Stage updated.');
    loadForecastForStage(updated);
    renderTab();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to update stage.');
  }
}

async function handleDeleteStage(id) {
  const tripId = STATE.viewTripId;
  try {
    await deleteStage(id);
    STATE.stagesByTrip[tripId] = (STATE.stagesByTrip[tripId] || []).filter((s) => s.id !== id);
    delete STATE.forecastsByStage[id];
    closeModal();
    toast('Stage deleted.');
    renderTab();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to delete stage.');
  }
}

async function handleMoveStage(id, direction) {
  const tripId = STATE.viewTripId;
  const stages = STATE.stagesByTrip[tripId] || [];
  const idx = stages.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= stages.length) return;

  const a = stages[idx];
  const b = stages[swapIdx];
  try {
    await swapStageOrder(a, b);
    const aOrder = a.order_index;
    a.order_index = b.order_index;
    b.order_index = aOrder;
    stages.sort((x, y) => x.order_index - y.order_index);
    STATE.stagesByTrip[tripId] = [...stages];
    renderTab();
  } catch (err) {
    console.error(err);
    toast('Reorder failed; reloading…');
    await loadStagesForTrip(tripId);
  }
}

// ---------- Navigation ----------
const SCREENS = {
  trips:   renderTrips,
  archive: renderArchive,
  account: renderAccount,
};

function goTo(tab) {
  if (!SCREENS[tab]) return;
  STATE.tab = tab;
  STATE.view = 'list';
  STATE.viewTripId = null;
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  renderTab();
}

function goToDetail(tripId) {
  STATE.view = 'detail';
  STATE.viewTripId = tripId;
  renderTab();
  if (!STATE.stagesByTrip[tripId]) loadStagesForTrip(tripId);
}

function renderAccount() {
  if (!STATE.user) {
    return `
      <div class="card">
        <div class="card-title">Sign in</div>
        <div style="color:#6b7a93;font-size:14px;line-height:1.5;margin-bottom:16px;">
          routefolk is for a fixed group of friends. Sign in with the Google
          account whose email has been added to the test users list.
        </div>
        <button class="btn-google" id="googleSignInBtn">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
          </svg>
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
          ${avatar
            ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">`
            : esc(userInitials(STATE.user))}
        </div>
        <div class="account-info">
          <div class="account-name">${esc(userDisplayName(STATE.user))}</div>
          <div class="account-email">${esc(STATE.user.email || '')}</div>
        </div>
      </div>
      <div style="margin-top:16px;">
        <button class="btn btn-danger btn-block" id="signOutBtn">Sign out</button>
      </div>
    </div>
  `;
}

function renderTab() {
  const content = $('content');
  if (STATE.view === 'detail') {
    content.innerHTML = renderTripDetail();
  } else {
    const fn = SCREENS[STATE.tab] || renderTrips;
    content.innerHTML = fn();
  }
  wireScreenButtons();
}

function wireScreenButtons() {
  $('googleSignInBtn')?.addEventListener('click', handleSignIn);
  $('signOutBtn')?.addEventListener('click', handleSignOut);

  $('newTripBtn')?.addEventListener('click', showNewTripModal);
  $('retryTripsBtn')?.addEventListener('click', loadTrips);
  document.querySelectorAll('.trip-card').forEach((el) => {
    el.addEventListener('click', () => goToDetail(el.dataset.id));
  });

  $('backToTripsBtn')?.addEventListener('click', () => goTo(STATE.tab));
  const trip = STATE.trips.find((t) => t.id === STATE.viewTripId);
  if (trip) {
    $('editTripBtn')?.addEventListener('click', () => showEditTripModal(trip));
    $('deleteTripBtn')?.addEventListener('click', () => showDeleteTripConfirm(trip));

    $('addStageBtn')?.addEventListener('click', () => showNewStageModal(trip));
    $('retryStagesBtn')?.addEventListener('click', () => loadStagesForTrip(trip.id));

    document.querySelectorAll('[data-action="up"], [data-action="down"]').forEach((btn) => {
      btn.addEventListener('click', () => handleMoveStage(btn.dataset.id, btn.dataset.action));
    });
    document.querySelectorAll('.stage-actions [data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stages = STATE.stagesByTrip[trip.id] || [];
        const stage = stages.find((s) => s.id === btn.dataset.id);
        if (stage) showEditStageModal(stage);
      });
    });
    document.querySelectorAll('.stage-actions [data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stages = STATE.stagesByTrip[trip.id] || [];
        const stage = stages.find((s) => s.id === btn.dataset.id);
        if (stage) showDeleteStageConfirm(stage);
      });
    });
  }
}

// ---------- Auth handlers ----------
async function handleSignIn() {
  try { await signInWithGoogle(); } catch { toast('Sign-in failed. Check console.'); }
}
async function handleSignOut() {
  try { await signOut(); toast('Signed out.'); } catch { toast('Sign-out failed.'); }
}

// ---------- Init ----------
async function init() {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => goTo(b.dataset.tab));
  });

  const d = new Date();
  $('hdrSub').textContent = d.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  STATE.user = await getCurrentUser();

  onAuthChange(async (user) => {
    const wasSignedIn = !!STATE.user;
    STATE.user = user;
    renderHeader();
    if (user && !wasSignedIn) {
      toast(`Welcome, ${userDisplayName(user).split(' ')[0]}!`);
      await loadTrips();
    } else if (!user) {
      STATE.trips = [];
      STATE.stagesByTrip = {};
      STATE.forecastsByStage = {};
      STATE.view = 'list';
      STATE.viewTripId = null;
      renderTab();
    }
  });

  renderHeader();
  renderTab();

  if (STATE.user) loadTrips();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

init();
