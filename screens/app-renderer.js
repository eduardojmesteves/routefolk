// ============================================================
// routefolk — screens/app-renderer.js
// Production renderer mapped to existing STATE/data.
// Render-only module: runtime is app.js, actions are app-actions.js.
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { fmtDate, fmtDateRange } from '../utils/datetime.js';
import { fmtEuro } from '../utils/format.js';
import { userDisplayName, userInitials, initialsFromName, displayNameForUserId } from '../utils/user.js';
import { STATUS_META, EXPENSE_CATEGORY_META } from '../constants/app-constants.js';

const TRIP_FILTERS = [{ key: 'all', label: 'All' }, { key: 'planning', label: 'Planning' }, { key: 'active', label: 'Active' }];
const ARCHIVE_FILTERS = [{ key: 'all', label: 'All' }, { key: 'completed', label: 'Completed' }, { key: 'cancelled', label: 'Cancelled' }];
const DETAIL_TABS = [{ key: 'stages', label: 'Stages' }, { key: 'summary', label: 'Summary' }, { key: 'costs', label: 'Costs' }, { key: 'items', label: 'Items' }];
const ITEM_FILTERS = [{ key: 'all', label: 'All' }, { key: 'planned', label: 'Planned' }, { key: 'packed', label: 'Packed' }, { key: 'optional', label: 'Optional' }];
const DEFAULT_CATS = ['Clothing', 'Luggage', 'Tools & spares', 'Filming & gear', 'Chargers & power', 'Documents', 'First aid', 'Other essentials'];

let lastMarkup = '';

const isDesktop = () => window.matchMedia('(min-width:960px)').matches;
const currentTripId = () => STATE.viewTripId || STATE.selectedTripId || null;
const currentTrip = () => STATE.trips.find((trip) => trip.id === currentTripId()) || null;
const maybeArray = (value) => Array.isArray(value) ? value : [];
const rawStages = (tripId) => STATE.stagesByTrip[tripId];
const rawExpenses = (tripId) => STATE.expensesByTrip[tripId];
const rawItems = (tripId) => STATE.itemsByTrip[tripId];
const stages = (tripId) => maybeArray(rawStages(tripId));
const expenses = (tripId) => maybeArray(rawExpenses(tripId));
const items = (tripId) => maybeArray(rawItems(tripId));
const cats = (tripId) => {
  const rows = STATE.itemCategoriesByTrip[tripId];
  return Array.isArray(rows) && rows.length ? rows : DEFAULT_CATS.map((name, i) => ({ id: '', name, sort_order: i }));
};

function tripView() {
  if (STATE.view === 'summary') return 'summary';
  if (STATE.view === 'costs') return 'costs';
  if (STATE.view === 'packing') return 'items';
  if (STATE.view === 'journal') return 'journal';
  return 'stages';
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
}

function loadingHtml(label = 'Loading…', ns = 'rf-d2') {
  return `<div class="${ns}-empty is-loading">${esc(label)}</div>`;
}

function errorHtml(error, ns = 'rf-d2') {
  return error ? `<div class="${ns}-empty is-error">${esc(error)}</div>` : '';
}

function tripNo(trip) {
  const i = Math.max(0, STATE.trips.findIndex((candidate) => candidate.id === trip?.id));
  return `No. ${String(i + 1).padStart(2, '0')}`;
}

function season(trip) {
  const date = trip?.start_date ? new Date(`${trip.start_date}T00:00:00Z`) : null;
  const year = date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : new Date().getFullYear();
  const month = date && !Number.isNaN(date.getTime()) ? date.getUTCMonth() : 2;
  const name = month <= 1 || month === 11 ? 'Winter' : month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Autumn';
  return `${name} ${year}`;
}

function subtitle(trip) {
  return trip?.description || fmtDateRange(trip?.start_date, trip?.end_date) || 'A new road journal';
}

function dateSpan(start, end) {
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  return Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) ? 0 : Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function stats(trip) {
  const st = stages(trip.id);
  const ex = expenses(trip.id);
  const entries = st.reduce((sum, stage) => {
    const rows = STATE.entriesByStage[stage.id];
    return sum + (Array.isArray(rows) ? rows.length : 0);
  }, 0);
  const distance = st.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0) || Number(trip.distance_km) || 0;
  const spent = ex.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  return { stages: st.length, entries, distance, spent };
}

function lifetime() {
  let distance = 0;
  let spent = 0;
  let entries = 0;
  let days = 0;
  let completed = 0;
  STATE.trips.forEach((trip) => {
    if (trip.status === 'completed') completed += 1;
    const st = stages(trip.id);
    const ex = expenses(trip.id);
    distance += st.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0) || Number(trip.distance_km) || 0;
    spent += ex.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    entries += st.reduce((sum, stage) => {
      const rows = STATE.entriesByStage[stage.id];
      return sum + (Array.isArray(rows) ? rows.length : 0);
    }, 0);
    days += st.length || dateSpan(trip.start_date, trip.end_date);
  });
  return { trips: STATE.trips.length, completed, distance, spent, entries, days };
}

function day(date) {
  if (!date) return '';
  try { return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3); }
  catch { return ''; }
}

function statusName(status) {
  return STATUS_META[status]?.label || String(status || 'Planning');
}

function activeTrips() {
  const query = (STATE.tripSearch || '').trim().toLowerCase();
  const filter = STATE.tripStatusFilter || 'all';
  return STATE.trips
    .filter((trip) => ['planning', 'active'].includes(trip.status))
    .filter((trip) => (filter === 'all' || trip.status === filter) && (!query || `${trip.title || ''} ${trip.description || ''}`.toLowerCase().includes(query)));
}

function archiveTrips() {
  const query = (STATE.archiveSearch || '').trim().toLowerCase();
  const filter = STATE.archiveStatusFilter || 'all';
  return STATE.trips
    .filter((trip) => ['completed', 'cancelled'].includes(trip.status))
    .filter((trip) => (filter === 'all' || trip.status === filter) && (!query || `${trip.title || ''} ${trip.description || ''}`.toLowerCase().includes(query)));
}

function statePill(status, ns = 'rf-d2') {
  return `<span class="${ns}-state-pill is-${esc(status || 'planning')}"><span class="${ns}-state-dot"></span>${esc(statusName(status))}</span>`;
}

function stamp(text, kind = 'primary', ns = 'rf-d2') {
  return `<span class="${ns}-stamp is-${esc(kind)}">${esc(text)}</span>`;
}

function avatar(name, ns = 'rf-d2') {
  return `<span class="${ns}-avatar">${esc(initialsFromName(name || 'RF'))}</span>`;
}

function filters(options, active, ns = 'rf-d2', action = 'status-filter') {
  return `<div class="${ns}-pills">${options.map((option) => `<button class="${ns}-pill ${active === option.key ? 'is-active' : ''}" data-action="${ns}-${action}" data-value="${esc(option.key)}" type="button">${esc(option.label)}</button>`).join('')}</div>`;
}

function search(open, value, ns = 'rf-d2') {
  if (!open) return `<button class="${ns}-search-btn" data-action="${ns}-search-toggle" type="button" aria-label="Search"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14.5" y2="14.5" stroke-linecap="round"/></svg></button>`;
  return `<div class="${ns}-search"><input type="search" data-action="${ns}-search-input" value="${esc(value || '')}" placeholder="Search by name"><button class="${ns}-search-close" data-action="${ns}-search-toggle" type="button">×</button></div>`;
}

function tabs(active, ns = 'rf-d2') {
  return `<nav class="${ns}-selector-tabs">${DETAIL_TABS.map((tab) => `<button class="${ns}-selector-tab ${active === tab.key ? 'is-active' : ''}" data-action="${ns}-tab" data-value="${tab.key}" type="button">${tab.label}</button>`).join('')}</nav>`;
}

function route(trip, ns = 'rf-d2') {
  const st = stages(trip.id);
  const from = st[0]?.start_location || 'Start';
  const to = st[st.length - 1]?.end_location || 'End';
  return `<div class="${ns}-route"><div class="${ns}-route-labels"><span>${esc(from)}</span><span>${esc(to)}</span></div><svg viewBox="0 0 780 120"><path d="M48 80 C150 36 250 92 355 58 S535 46 724 74"></path>${[48, 188, 328, 468, 608, 724].map((x, i) => `<circle cx="${x}" cy="${i === 0 ? 80 : i === 5 ? 74 : 66}" r="5"/>`).join('')}</svg></div>`;
}

function hero(trip, { withStats = false, withRoute = false } = {}) {
  const s = stats(trip);
  return `<header class="rf-d2-hero"><div class="rf-d2-hero-top"><div><button class="rf-d2-back" data-action="rf-d2-back-to-trips" type="button">← Trips</button><div class="rf-d2-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1 class="rf-d2-hero-title">${esc(trip.title)}</h1><div class="rf-d2-hero-sub">${esc(subtitle(trip))}</div></div><div class="rf-d2-hero-stamps">${statePill(trip.status)}${stamp('Group', 'accent')}</div></div>${withStats ? `<div class="rf-d2-stat-grid"><div><span>Distance</span><strong>${Math.round(s.distance).toLocaleString()}</strong><small>km recorded</small></div><div><span>Spent</span><strong>${fmtEuro(s.spent)}</strong><small>so far</small></div><div><span>Stages</span><strong>${s.stages}</strong><small>days</small></div><div><span>Entries</span><strong>${s.entries}</strong><small>journal</small></div></div>` : ''}${withRoute ? route(trip) : ''}</header>`;
}

function desktop() {
  if (STATE.tripsLoading && !STATE.trips.length) return `<div class="rf-d2-app"><main class="rf-d2-main">${loadingHtml('Loading trips…')}</main></div>`;
  if (STATE.tripsError) return `<div class="rf-d2-app"><main class="rf-d2-main">${errorHtml(STATE.tripsError)}</main></div>`;
  const trip = currentTrip();
  const thirdPane = STATE.tab === 'trips' && trip && tripView() !== 'summary';
  let body = '';
  if (STATE.tab === 'archive') body = dArchive();
  else if (STATE.tab === 'account') body = dAccount();
  else if (!trip) body = dTripList(null) + dLanding();
  else body = dTripList(trip.id) + dTripView(trip);
  return `<div class="rf-d2-app ${thirdPane ? 'is-3-pane' : ''}">${dSidebar(thirdPane)}${body}</div>`;
}

function dSidebar(collapsed) {
  const l = lifetime();
  return `<aside class="rf-d2-sidebar ${collapsed ? 'is-collapsed' : ''}"><div class="rf-d2-sidebar-head">${collapsed ? '<div class="rf-d2-sidebar-mark">r</div><div class="rf-d2-sidebar-mark-sub">routefolk</div>' : '<div class="rf-d2-sidebar-kicker">Routefolk</div><div class="rf-d2-sidebar-title">Field journal</div>'}</div><nav class="rf-d2-rail">${[['trips', 'T'], ['archive', 'A'], ['account', 'Y']].map(([key, glyph]) => `<button class="rf-d2-rail-item ${STATE.tab === key ? 'is-active' : ''}" data-action="rf-d2-nav" data-tab="${key}" type="button"><span class="rf-d2-rail-glyph">${glyph}</span><span class="rf-d2-rail-label">${key === 'account' ? 'You' : key[0].toUpperCase() + key.slice(1)}</span></button>`).join('')}</nav><div class="rf-d2-sidebar-spacer"></div><div class="rf-d2-lifetime"><div class="rf-d2-lifetime-kicker">Lifetime</div><div class="rf-d2-lifetime-row"><span>${l.trips}</span><span>${Math.round(l.distance).toLocaleString()}</span></div><div class="rf-d2-lifetime-labels"><span>Trips</span><span>km</span></div></div><div class="rf-d2-user"><span class="rf-d2-user-avatar">${esc(userInitials(STATE.user))}</span><span class="rf-d2-user-meta"><strong>${esc(userDisplayName(STATE.user))}</strong><small>${esc(STATE.user?.email || '')}</small></span></div></aside>`;
}

function dTripList(selected) {
  return `<aside class="rf-d2-trips-col"><div class="rf-d2-trips-head"><div><div class="rf-d2-kicker">The road map</div><h1 class="rf-d2-col-title">Trips</h1><div class="rf-d2-col-sub">${activeTrips().length} on the road map · ${archiveTrips().length} in archive</div></div><button class="rf-d2-btn is-primary" data-action="rf-d2-new-trip" type="button">+ New</button></div><div class="rf-d2-filter-row">${filters(TRIP_FILTERS, STATE.tripStatusFilter || 'all')}${search(STATE.tripFiltersOpen || !!STATE.tripSearch, STATE.tripSearch)}</div><div class="rf-d2-master-list">${activeTrips().map((trip) => dTripRow(trip, selected)).join('') || '<div class="rf-d2-empty">No matching trips.</div>'}</div></aside>`;
}

function dTripRow(trip, selected) {
  const s = stats(trip);
  return `<button class="rf-d2-trip-row ${selected === trip.id ? 'is-selected' : ''}" data-action="rf-d2-select-trip" data-trip-id="${esc(trip.id)}" type="button"><div class="rf-d2-trip-row-no">${esc(tripNo(trip))}</div><div class="rf-d2-trip-row-title">${esc(trip.title)}</div><div class="rf-d2-trip-row-sub">${esc(subtitle(trip))}</div><div class="rf-d2-trip-row-meta"><span>${esc(fmtDateRange(trip.start_date, trip.end_date))}</span><span>${Math.round(s.distance).toLocaleString()} km</span><span>${s.stages} st</span></div>${statePill(trip.status)}</button>`;
}

function dLanding() {
  const trip = activeTrips()[0];
  return `<main class="rf-d2-main">${trip ? hero(trip, { withStats: true, withRoute: true }) : '<div class="rf-d2-empty-card">No trips yet.</div>'}<div class="rf-d2-hint">Click a trip on the left to open it. The trip expands into stages and a detail pane.</div></main>`;
}

function dTripView(trip) {
  const view = tripView();
  if (view === 'summary') return dSummary(trip);
  if (view === 'costs') return dCosts(trip);
  if (view === 'items') return dItems(trip);
  return dStages(trip);
}

function dStages(trip) {
  const raw = rawStages(trip.id);
  if (raw === 'loading' || STATE.stagesLoading) return `<main class="rf-d2-main">${hero(trip, { withStats: true, withRoute: true })}${tabs('stages')}${loadingHtml('Loading stages…')}</main><aside class="rf-d2-aside">${loadingHtml('Loading detail…')}</aside>`;
  const st = stages(trip.id);
  const selected = st.find((stage) => stage.id === STATE.selectedStageId) || st[0];
  return `<main class="rf-d2-main">${hero(trip, { withStats: true, withRoute: true })}${tabs('stages')}<div class="rf-d2-section-head"><div class="rf-d2-section-title">${st.length} stages · day ${Math.min(2, st.length) || 1} of ${st.length || 1}</div><button class="rf-d2-btn is-primary" data-action="rf-d2-add-stage" type="button">+ Add stage</button></div><div class="rf-d2-stage-list">${st.map((stage, i) => dStageRow(stage, i, selected?.id)).join('')}<button class="rf-d2-btn is-dashed" data-action="rf-d2-add-stage" type="button">+ Add another stage</button></div></main>${dAside(trip, selected)}`;
}

function dStageRow(stage, index, selectedId) {
  return `<button class="rf-d2-stage-row ${selectedId === stage.id ? 'is-selected' : ''}" data-action="rf-d2-select-stage" data-stage-id="${esc(stage.id)}" type="button"><div class="rf-d2-stage-no-col"><div class="rf-d2-stage-no">${index + 1}</div><div class="rf-d2-stage-rule"></div><div class="rf-d2-stage-day">${esc(day(stage.planned_date))}</div></div><div class="rf-d2-stage-body"><div class="rf-d2-stage-row-head"><div class="rf-d2-stage-title">${esc(stage.start_location || 'Start')} <span class="rf-d2-stage-to">to</span> ${esc(stage.end_location || 'End')}</div>${index === 1 ? stamp('Today') : ''}</div><div class="rf-d2-stage-high">${esc(stage.notes || '')}</div><div class="rf-d2-stage-mono"><span><span class="rf-d2-stage-mono-label">dist</span> ${Math.round(Number(stage.distance_km) || 0)}km</span><span>${esc(fmtDate(stage.planned_date) || '')}</span></div></div></button>`;
}

function dAside(trip, stage) {
  if (STATE.wizard === 'stage') return dStageWizard(trip);
  if (STATE.wizard === 'journal') return dJournalWizard();
  if (!stage) return '<aside class="rf-d2-aside"><div class="rf-d2-empty">Select a stage.</div></aside>';
  const rawEntries = STATE.entriesByStage[stage.id];
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  const stageExpenses = expenses(trip.id).filter((expense) => expense.stage_id === stage.id);
  return `<aside class="rf-d2-aside"><div class="rf-d2-aside-head"><div class="rf-d2-aside-kicker">Stage ${esc(stage.order_index || '')} · ${esc(fmtDate(stage.planned_date) || '')}</div><h2 class="rf-d2-aside-title">${esc(stage.start_location || 'Start')} <span style="font-style:italic;color:var(--rf-d2-muted)">to</span> ${esc(stage.end_location || 'End')}</h2><div class="rf-d2-aside-sub">${esc(stage.notes || '')}</div></div><div class="rf-d2-sky"><div class="rf-d2-sky-tag">Sky advisory</div><div class="rf-d2-sky-grid"><div>Start<br>☁️<br>—</div><div>Midpoint<br>🌤️<br>—</div><div>End<br>🌧️<br>—</div></div></div><div class="rf-d2-section-head"><div class="rf-d2-section-title">The day's notes</div><button class="rf-d2-btn is-primary" data-action="rf-d2-add-journal" type="button">+ Add</button></div>${rawEntries === 'loading' ? loadingHtml('Loading notes…') : entries.map((entry, i) => entryHtml(entry, i)).join('') || '<div class="rf-d2-mini-table">No entries yet.</div>'}<div class="rf-d2-section-head"><div class="rf-d2-section-title">Stage costs</div></div><div class="rf-d2-mini-table">${stageExpenses.map(expenseMini).join('') || 'No costs assigned to this stage.'}</div></aside>`;
}

function entryHtml(entry, index) {
  const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="rf-d2-entry"><div class="rf-d2-entry-bullet">${index + 1}</div><div><div class="rf-d2-entry-head"><div class="rf-d2-entry-type">A ${esc(entry.entry_type || 'note')}</div><div class="rf-d2-entry-when">${esc(time)}</div></div><div class="rf-d2-entry-title">${esc(entry.title || 'Untitled')}</div><div class="rf-d2-entry-loc">${entry.location ? `at ${esc(entry.location)}` : ''}</div></div></div>`;
}

function expenseMini(expense) {
  const meta = EXPENSE_CATEGORY_META[expense.category] || EXPENSE_CATEGORY_META.other;
  return `<div class="rf-d2-mini-table-row"><div><div class="rf-d2-mini-cat">${esc(meta.label)}</div><div class="rf-d2-mini-meta">${esc(displayNameForUserId(expense.user_id))}</div></div><div>${esc(fmtEuro(expense.amount || 0))}</div></div>`;
}

function dStageWizard(trip) {
  return `<aside class="rf-d2-aside"><div class="rf-d2-aside-head"><div class="rf-d2-aside-kicker">New stage</div><h2 class="rf-d2-aside-title">Add a stage</h2></div><input class="rf-d2-input" id="v2-stage-from" placeholder="From"><input class="rf-d2-input" id="v2-stage-to" placeholder="To"><input class="rf-d2-input" id="v2-stage-date" type="date" value="${esc(trip.start_date || '')}"><input class="rf-d2-input" id="v2-stage-km" inputmode="decimal" placeholder="Distance km"><textarea class="rf-d2-textarea" id="v2-stage-notes" placeholder="Notes"></textarea><div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-d2-cancel-wizard">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-d2-save-stage">Save stage</button></div></aside>`;
}

function dJournalWizard() {
  return `<aside class="rf-d2-aside"><div class="rf-d2-aside-head"><div class="rf-d2-aside-kicker">New entry</div><h2 class="rf-d2-aside-title">A note from the road</h2></div><input class="rf-d2-input" id="v2-entry-title" placeholder="Title"><input class="rf-d2-input" id="v2-entry-place" placeholder="Place"><input class="rf-d2-input" id="v2-entry-time" type="time"><textarea class="rf-d2-textarea" id="v2-entry-note" placeholder="What happened here?"></textarea><div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-d2-cancel-wizard">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-d2-save-journal">Save entry</button></div></aside>`;
}

function dSummary(trip) {
  const s = stats(trip);
  return `<main class="rf-d2-main is-wide">${hero(trip)}${tabs('summary')}${route(trip)}<div class="rf-d2-section-title">By stage</div><div class="rf-d2-table">${stages(trip.id).map((stage, i) => `<div class="rf-d2-table-row"><div>${i + 1}</div><div><strong>${esc(stage.start_location || '')} to ${esc(stage.end_location || '')}</strong><small>${esc(fmtDate(stage.planned_date) || '')}</small></div><div>${Math.round(Number(stage.distance_km) || 0)} km</div><div>—</div></div>`).join('') || '<div class="rf-d2-empty">No stages yet.</div>'}</div><div class="rf-d2-total-strip"><div><span>Total distance</span><strong>${Math.round(s.distance).toLocaleString()} km</strong></div><div><span>Total spent</span><strong>${fmtEuro(s.spent)}</strong></div><div><span>Journal</span><strong>${s.entries} entries</strong></div></div></main>`;
}

function dCosts(trip) {
  const ex = expenses(trip.id);
  const agg = aggregate(ex);
  return `<main class="rf-d2-main">${hero(trip)}${tabs('costs')}<div class="rf-d2-ledger-hero"><div class="rf-d2-ledger-label">The trip ledger</div><div class="rf-d2-ledger-value">${fmtEuro(agg.total)}</div>${stamp(`${ex.length} entries`)}</div><div class="rf-d2-table">${ex.map((expense) => `<div class="rf-d2-table-row"><div>${esc(EXPENSE_CATEGORY_META[expense.category]?.label || expense.category)}</div><div>${esc(displayNameForUserId(expense.user_id))}</div><div>${esc(fmtDate(expense.date) || '')}</div><div>${fmtEuro(expense.amount || 0)}</div></div>`).join('') || '<div class="rf-d2-empty">No costs yet.</div>'}</div></main><aside class="rf-d2-aside"><div class="rf-d2-section-title">By category</div>${breakdown(agg.cat)}<div class="rf-d2-section-title">By payer</div>${breakdown(agg.payer)}</aside>`;
}

function aggregate(rows) {
  const cat = new Map();
  const payer = new Map();
  let total = 0;
  rows.forEach((expense) => {
    const amount = Number(expense.amount) || 0;
    total += amount;
    const c = EXPENSE_CATEGORY_META[expense.category]?.label || expense.category || 'Other';
    cat.set(c, (cat.get(c) || 0) + amount);
    const p = displayNameForUserId(expense.user_id);
    payer.set(p, (payer.get(p) || 0) + amount);
  });
  return { cat, payer, total };
}

function breakdown(map) {
  return `<div class="rf-d2-breakdown">${[...map.entries()].map(([label, amount]) => `<div class="rf-d2-break-row"><span>${esc(label)}</span><strong>${fmtEuro(amount)}</strong></div>`).join('') || 'No data.'}</div>`;
}

function dItems(trip) {
  const raw = rawItems(trip.id);
  if (raw === 'loading' || STATE.itemsLoading) return `<main class="rf-d2-main">${hero(trip)}${tabs('items')}${loadingHtml('Loading items…')}</main><aside class="rf-d2-aside">${loadingHtml('Loading category…')}</aside>`;
  const its = items(trip.id);
  const cs = cats(trip.id);
  const selected = STATE.selectedCategoryKey || slug(cs[0]?.name);
  const group = its.filter((item) => slug(item.category?.name || 'Other') === selected && ((STATE.itemStatusFilter || 'all') === 'all' || item.status === STATE.itemStatusFilter));
  return `<main class="rf-d2-main">${hero(trip)}${tabs('items')}<div class="rf-d2-items-hero"><div class="rf-d2-ledger-label">The packing list</div><div class="rf-d2-items-big">${its.filter((item) => item.status === 'packed').length} <span>of ${its.length} packed</span></div></div><div class="rf-d2-section-head"><div class="rf-d2-section-title">Categories</div></div><div class="rf-d2-item-cats">${cs.map((cat, i) => itemCatRow(cat, i, selected, its)).join('')}</div></main><aside class="rf-d2-aside"><div class="rf-d2-aside-head"><div class="rf-d2-aside-kicker">Category</div><h2 class="rf-d2-aside-title">${esc(cs.find((cat) => slug(cat.name) === selected)?.name || 'Items')}</h2></div>${filters(ITEM_FILTERS, STATE.itemStatusFilter || 'all', 'rf-d2', 'item-filter')}<div class="rf-d2-item-list">${group.map(itemRow).join('') || '<div class="rf-d2-empty">No items here.</div>'}</div><form class="rf-d2-quick-form" data-action="rf-d2-item-form"><input class="rf-d2-input" name="text" placeholder="e.g. Rain gloves"><select class="rf-d2-input" name="category_id">${cs.map((cat) => `<option value="${esc(cat.id || '')}">${esc(cat.name)}</option>`).join('')}</select><button class="rf-d2-btn is-primary" type="submit">Add item</button></form></aside>`;
}

function itemCatRow(cat, index, selected, its) {
  const key = slug(cat.name);
  const group = its.filter((item) => slug(item.category?.name || 'Other') === key);
  const packed = group.filter((item) => item.status === 'packed').length;
  return `<button class="rf-d2-item-cat-row ${key === selected ? 'is-selected' : ''}" data-action="rf-d2-select-category" data-category="${key}" type="button"><span>${index + 1}</span><strong>${esc(cat.name)}</strong><span class="rf-d2-item-progress"><i style="width:${group.length ? Math.round((packed / group.length) * 100) : 0}%"></i></span><span>${packed}/${group.length} packed</span><span>›</span></button>`;
}

function itemRow(item) {
  return `<div class="rf-d2-item-row ${item.status === 'packed' ? 'is-packed' : ''}"><button class="rf-d2-item-check" data-action="rf-d2-toggle-item" data-item-id="${esc(item.id)}" type="button">${item.status === 'packed' ? '✓' : ''}</button><div><strong>${esc(item.name)}</strong>${item.notes ? `<small>${esc(item.notes)}</small>` : ''}</div><span class="rf-d2-item-chip is-${esc(item.status || 'planned')}"><span class="dot"></span>${esc(item.status || 'planned')}</span>${avatar(displayNameForUserId(item.assigned_to || item.created_by))}</div>`;
}

function dArchive() {
  const rows = archiveTrips();
  const l = lifetime();
  return `<main class="rf-d2-main is-archive"><div class="rf-d2-kicker">The collection</div><h1 class="rf-d2-hero-title">Archive</h1><div class="rf-d2-hero-sub">${rows.filter((trip) => trip.status === 'completed').length} put to bed · ${rows.filter((trip) => trip.status === 'cancelled').length} called off</div><div class="rf-d2-filter-row">${filters(ARCHIVE_FILTERS, STATE.archiveStatusFilter || 'all')}${search(STATE.archiveFiltersOpen || !!STATE.archiveSearch, STATE.archiveSearch)}</div>${STATE.archiveDataLoading ? loadingHtml('Loading archive totals…') : ''}<div class="rf-d2-archive-totals"><h2>Lifetime totals</h2><div>Completed <strong>${l.completed}</strong></div><div>Distance <strong>${Math.round(l.distance).toLocaleString()}</strong></div><div>Spent <strong>${fmtEuro(l.spent)}</strong></div><div>Notes <strong>${l.entries}</strong></div></div><div class="rf-d2-section-head"><div class="rf-d2-section-title">The geography</div>${stamp('Heatmap')}</div><div class="rf-d2-map-card"><svg viewBox="0 0 700 320"><path class="rf-d2-map-land" d="M90 190 L140 120 L300 90 L450 125 L560 125 L610 170 L570 230 L420 245 L360 290 L250 270 L160 235 Z"></path><path class="rf-d2-map-route" d="M160 210 C240 160 315 210 390 180 S485 130 545 165"></path></svg></div>${rows.map((trip) => `<button class="rf-d2-archive-row" data-action="rf-d2-select-archived" data-trip-id="${esc(trip.id)}" type="button"><span>${esc(tripNo(trip))}</span><strong>${esc(trip.title)}</strong><small>${esc(season(trip))}</small><b>${fmtEuro(stats(trip).spent)}</b></button>`).join('') || '<div class="rf-d2-empty">No archived trips.</div>'}</main>`;
}

function dAccount() {
  const l = lifetime();
  return `<main class="rf-d2-main is-account"><section class="rf-d2-account-card"><div class="rf-d2-account-avatar">${esc(userInitials(STATE.user))}</div><div><h1>${esc(userDisplayName(STATE.user))}</h1><p>${esc(STATE.user?.email || '')}</p><em>Routefolk member since 2023</em></div><button class="rf-d2-btn" data-action="rf-d2-manage-google">Manage Google account</button></section><section class="rf-d2-riders-card"><h2>Other riders</h2><p>${Math.max(0, STATE.profiles.length - 1)} people you've ridden with</p></section><section class="rf-d2-mileage"><h2>Mileage to date</h2><div><strong>${l.trips}</strong><span>Trips</span></div><div><strong>${Math.round(l.distance).toLocaleString()}</strong><span>Distance</span></div><div><strong>${l.days}</strong><span>Days</span></div><div><strong>${fmtEuro(l.spent)}</strong><span>Spent</span></div></section><button class="rf-d2-btn" data-action="rf-d2-sign-out">Sign out</button><div class="rf-d2-version">routefolk · v0.6.2</div></main>`;
}

function mobile() {
  if (STATE.tripsLoading && !STATE.trips.length) return `<div class="rf-m2-screen"><div class="rf-m2-body">${loadingHtml('Loading trips…', 'rf-m2')}</div></div>`;
  if (STATE.tab === 'archive') return mArchive();
  if (STATE.tab === 'account') return mAccount();
  const trip = currentTrip();
  if (!trip) return mTrips();
  if (STATE.view === 'journal') return mJournal(trip);
  const view = tripView();
  if (view === 'summary') return mSummary(trip);
  if (view === 'costs') return mCosts(trip);
  if (view === 'items') return mItems(trip);
  return mStages(trip);
}

function mBar(active) {
  return `<nav class="rf-m2-tab-bar"><div class="rf-m2-tab-row">${[['trips', 'Trips'], ['archive', 'Archive'], ['account', 'You']].map(([key, label]) => `<button class="rf-m2-tab-btn ${active === key ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="${key}" type="button"><span class="rf-m2-tab-bar-dash"></span><span class="rf-m2-tab-label">${label}</span></button>`).join('')}</div></nav>`;
}

function mTrips() {
  return `<div class="rf-m2-screen"><header class="rf-m2-header"><div class="rf-m2-header-row"><div><div class="rf-m2-header-kicker">Routefolk</div><h1 class="rf-m2-header-title">Trips</h1><div class="rf-m2-header-sub">${activeTrips().length} on the road map · ${archiveTrips().length} in archive</div></div><button class="rf-m2-btn is-primary" data-action="rf-m2-new-trip">+ New</button></div></header><div class="rf-m2-body"><div class="rf-m2-filter-row">${filters(TRIP_FILTERS, STATE.tripStatusFilter || 'all', 'rf-m2')}${search(STATE.tripFiltersOpen || !!STATE.tripSearch, STATE.tripSearch, 'rf-m2')}</div>${activeTrips().map(mTripCard).join('') || '<div class="rf-m2-empty">No active trips.</div>'}</div>${mBar('trips')}</div>`;
}

function mTripCard(trip) {
  const s = stats(trip);
  return `<button class="rf-m2-trip-card" data-action="rf-m2-select-trip" data-trip-id="${esc(trip.id)}"><div class="rf-m2-trip-no-ribbon">${esc(tripNo(trip))}</div><div class="rf-m2-trip-card-title">${esc(trip.title)}</div><div class="rf-m2-trip-card-sub">${esc(subtitle(trip))}</div><div class="rf-m2-trip-card-meta"><div class="rf-m2-trip-card-dates">${esc(fmtDateRange(trip.start_date, trip.end_date))}</div>${statePill(trip.status, 'rf-m2')}</div><div class="rf-m2-trip-card-divider"><span class="rule"></span><span class="ornament">—</span><span class="rule"></span></div><div class="rf-m2-trip-card-foot"><div><div class="rf-m2-trip-card-num">${Math.round(s.distance).toLocaleString()}</div><div class="rf-m2-trip-card-unit">kilometres</div></div><div><div class="rf-m2-trip-card-num">${s.stages}</div><div class="rf-m2-trip-card-unit">stages</div></div></div></button>`;
}

function mHead(trip, sketch = true) {
  return `<header class="rf-m2-detail-hero"><button class="rf-m2-back" data-action="rf-m2-back-to-trips">← Trips</button><div class="rf-m2-detail-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1 class="rf-m2-detail-title">${esc(trip.title)}</h1><div class="rf-m2-detail-sub">${esc(subtitle(trip))}</div><div class="rf-m2-detail-stamps">${statePill(trip.status, 'rf-m2')}${stamp('Group', 'accent', 'rf-m2')}</div>${sketch ? route(trip, 'rf-m2') : ''}</header>`;
}

function mTabs(active) {
  return `<nav class="rf-m2-tabs">${DETAIL_TABS.map((tab) => `<button class="rf-m2-tab ${active === tab.key ? 'is-active' : ''}" data-action="rf-m2-tab" data-value="${tab.key}">${tab.label}</button>`).join('')}</nav>`;
}

function mStages(trip) {
  return `<div class="rf-m2-screen">${mHead(trip)}${mTabs('stages')}<div class="rf-m2-body">${stages(trip.id).map((stage, i) => `<button class="rf-m2-stage" data-action="rf-m2-open-stage" data-stage-id="${esc(stage.id)}"><div class="rf-m2-stage-no-col"><div class="rf-m2-stage-no">${i + 1}</div><div class="rf-m2-stage-day">${esc(day(stage.planned_date))}</div></div><div><div class="rf-m2-stage-title">${esc(stage.start_location || '')} <span class="rf-m2-stage-to">to</span> ${esc(stage.end_location || '')}</div><div class="rf-m2-stage-high">${esc(stage.notes || '')}</div><div class="rf-m2-stage-mono">${Math.round(Number(stage.distance_km) || 0)} km · ${esc(fmtDate(stage.planned_date) || '')}</div></div></button>`).join('') || '<div class="rf-m2-empty">No stages yet.</div>'}<button class="rf-m2-btn is-dashed" data-action="rf-m2-add-stage">+ Add another stage</button></div>${mBar('trips')}</div>`;
}

function mSummary(trip) { return `<div class="rf-m2-screen">${mHead(trip, false)}${mTabs('summary')}<div class="rf-m2-body">${dSummary(trip).replaceAll('rf-d2', 'rf-m2').replace(/<main[^>]*>|<\/main>/g, '')}</div>${mBar('trips')}</div>`; }
function mCosts(trip) { return `<div class="rf-m2-screen">${mHead(trip, false)}${mTabs('costs')}<div class="rf-m2-body">${dCosts(trip).split('</main>')[0].replaceAll('rf-d2', 'rf-m2').replace(/<main[^>]*>/, '')}</div>${mBar('trips')}</div>`; }
function mItems(trip) { return `<div class="rf-m2-screen">${mHead(trip, false)}${mTabs('items')}<div class="rf-m2-body">${dItems(trip).split('</main>')[0].replaceAll('rf-d2', 'rf-m2').replace(/<main[^>]*>/, '')}</div>${mBar('trips')}</div>`; }
function mJournal(trip) { const stage = stages(trip.id).find((s) => s.id === STATE.selectedStageId) || stages(trip.id)[0]; return `<div class="rf-m2-screen"><div class="rf-m2-body"><button class="rf-m2-back" data-action="rf-m2-back-to-stages">← ${esc(trip.title)}</button>${stage ? dAside(trip, stage).replaceAll('rf-d2', 'rf-m2').replace('<aside class="rf-m2-aside">', '<div>').replace('</aside>', '</div>') : '<div class="rf-m2-empty">Select a stage.</div>'}</div>${mBar('trips')}</div>`; }
function mArchive() { return `<div class="rf-m2-screen"><header class="rf-m2-header"><div class="rf-m2-header-kicker">The collection</div><h1 class="rf-m2-header-title">Archive</h1></header><div class="rf-m2-body">${dArchive().replaceAll('rf-d2', 'rf-m2').replace(/<main[^>]*>|<\/main>/g, '')}</div>${mBar('archive')}</div>`; }
function mAccount() { return `<div class="rf-m2-screen"><header class="rf-m2-header"><div class="rf-m2-header-kicker">The bearer</div><h1 class="rf-m2-header-title">You</h1></header><div class="rf-m2-body">${dAccount().replaceAll('rf-d2', 'rf-m2').replace(/<main[^>]*>|<\/main>/g, '')}</div>${mBar('account')}</div>`; }

function signedOut() {
  return isDesktop() ? '<div class="rf-d2-app"><main class="rf-d2-main"><button class="rf-d2-btn is-primary" data-action="rf-d2-sign-in">Sign in with Google</button></main></div>' : '<div class="rf-m2-screen"><div class="rf-m2-body"><button class="rf-m2-btn is-primary is-block" data-action="rf-m2-sign-in">Sign in with Google</button></div></div>';
}

export function renderRoutefolk() {
  const app = document.getElementById('app');
  const content = document.getElementById('content');
  if (!app || !content) return;
  app.classList.add('is-v2');
  const html = `<div class="rf-v2-root-host">${STATE.user ? (isDesktop() ? desktop() : mobile()) : signedOut()}</div>`;
  if (html !== lastMarkup) {
    content.innerHTML = html;
    lastMarkup = html;
  }
}

window.__routefolkRender = renderRoutefolk;
window.__routefolkV2Render = renderRoutefolk;
document.addEventListener('routefolk:render', renderRoutefolk);
document.addEventListener('routefolk:v2-render', renderRoutefolk);
window.addEventListener('resize', renderRoutefolk);
renderRoutefolk();
