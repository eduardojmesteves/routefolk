// ============================================================
// routefolk — screens/ui-enhancements.js
// Focused UI layer for responsive production polish.
// Responsibilities:
// - stable mobile render output while the base renderer is consolidated
// - desktop archive detail override
// - desktop account preferences
// - small UI behaviours that do not belong in data loaders
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { fmtDate, fmtDateRange } from '../utils/datetime.js';
import { fmtEuro } from '../utils/format.js';
import { EXPENSE_CATEGORY_META } from '../constants/app-constants.js';
import { displayNameForUserId } from '../utils/user.js';
import { rememberArchiveContext, saveUiState } from '../state/ui-state.js';

const DETAIL_TABS = [['stages', 'Stages'], ['summary', 'Summary'], ['costs', 'Costs'], ['items', 'Items']];
const ARCHIVE_FILTERS = [['all', 'All'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
const PALETTES = [
  ['midnight', 'Ink & Rust', 'Cool cream · ink · rust'],
  ['forest', 'Forest & Ochre', 'Warm cream · forest · ochre'],
  ['oxblood', 'Slate & Bordeaux', 'Warm white · slate · bordeaux'],
  ['alpine', 'Graphite & Sun', 'Soft beige · graphite · sun'],
];
const DEFAULT_CATS = ['Clothing', 'Luggage', 'Tools & spares', 'Filming & gear', 'Chargers & power', 'Documents', 'First aid', 'Other'];

const arr = (value) => Array.isArray(value) ? value : [];
const isDesktop = () => window.matchMedia('(min-width:960px)').matches;
const isMobile = () => !isDesktop();
const stages = (tripId) => arr(STATE.stagesByTrip[tripId]);
const expenses = (tripId) => arr(STATE.expensesByTrip[tripId]);
const items = (tripId) => arr(STATE.itemsByTrip[tripId]);
const categories = (tripId) => arr(STATE.itemCategoriesByTrip[tripId]).length ? arr(STATE.itemCategoriesByTrip[tripId]) : DEFAULT_CATS.map((name, i) => ({ id: '', name, sort_order: i }));
const currentTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || (STATE.tab === 'archive' ? STATE.selectedArchiveTripId : STATE.selectedTripId))) || null;
const slug = (value) => String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';

function api() { return window.routefolkData || {}; }
function renderAll() { saveUiState(); api().renderAll?.(); }
function currentPalette() { try { return localStorage.getItem('rf.palette') || 'midnight'; } catch { return 'midnight'; } }
function setPalette(value) {
  const next = PALETTES.some(([key]) => key === value) ? value : 'midnight';
  document.documentElement.dataset.palette = next;
  try { localStorage.setItem('rf.palette', next); } catch {}
}
function userName() { return STATE.user?.user_metadata?.full_name || STATE.user?.user_metadata?.name || STATE.user?.email || 'Routefolk rider'; }
function avatarUrl() { return STATE.user?.user_metadata?.avatar_url || STATE.user?.user_metadata?.picture || ''; }
function initials() { return userName().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() || '').join('') || 'RF'; }
function memberSinceYear() {
  const profile = STATE.user?.id ? STATE.profilesById?.[STATE.user.id] : null;
  const value = STATE.user?.created_at || profile?.created_at || profile?.inserted_at || '';
  const year = value ? new Date(value).getFullYear() : null;
  return Number.isFinite(year) ? year : null;
}
function tripNo(trip) { return `No. ${String(Math.max(0, STATE.trips.findIndex((item) => item.id === trip?.id)) + 1).padStart(2, '0')}`; }
function season(trip) {
  const date = trip?.start_date ? new Date(`${trip.start_date}T00:00:00Z`) : null;
  const year = date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : new Date().getFullYear();
  const month = date && !Number.isNaN(date.getTime()) ? date.getUTCMonth() : 2;
  const name = month <= 1 || month === 11 ? 'Winter' : month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Autumn';
  return `${name} ${year}`;
}
function subtitle(trip) { return trip?.description || fmtDateRange(trip?.start_date, trip?.end_date) || 'A road journal'; }
function day(date) {
  if (!date) return '';
  try { return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3); } catch { return ''; }
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
  const entries = st.reduce((sum, stage) => sum + arr(STATE.entriesByStage[stage.id]).length, 0);
  const distance = st.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0) || Number(trip.distance_km) || 0;
  const spent = ex.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  return { stages: st.length, entries, distance, spent };
}
function lifetime() {
  return STATE.trips.reduce((acc, trip) => {
    const s = stats(trip);
    acc.trips += 1;
    acc.completed += trip.status === 'completed' ? 1 : 0;
    acc.distance += s.distance;
    acc.spent += s.spent;
    acc.entries += s.entries;
    acc.days += s.stages || dateSpan(trip.start_date, trip.end_date);
    return acc;
  }, { trips: 0, completed: 0, distance: 0, spent: 0, entries: 0, days: 0 });
}
function archiveTrips() {
  const query = (STATE.archiveSearch || '').trim().toLowerCase();
  const filter = STATE.archiveStatusFilter || 'all';
  return STATE.trips
    .filter((trip) => ['completed', 'cancelled'].includes(trip.status))
    .filter((trip) => (filter === 'all' || trip.status === filter) && (!query || `${trip.title || ''} ${trip.description || ''}`.toLowerCase().includes(query)));
}
function aggregateExpense(rows) {
  const cat = new Map();
  const payer = new Map();
  let total = 0;
  rows.forEach((expense) => {
    const amount = Number(expense.amount) || 0;
    total += amount;
    const category = EXPENSE_CATEGORY_META[expense.category]?.label || expense.category || 'Other';
    const paidBy = displayNameForUserId(expense.user_id) || 'Unknown';
    cat.set(category, (cat.get(category) || 0) + amount);
    payer.set(paidBy, (payer.get(paidBy) || 0) + amount);
  });
  return { total, cat, payer };
}

function bottomNav(active) {
  return `<nav class="rf-clean-bottom"><button class="${active === 'trips' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="trips">Trips</button><button class="${active === 'archive' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="archive">Archive</button><button class="${active === 'account' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="account">You</button></nav>`;
}
function screen(inner, active = 'trips') { return `<div class="rf-clean-mobile"><div class="rf-clean-scroll">${inner}</div>${bottomNav(active)}</div>`; }
function tripHeader(trip, active) {
  return `<header class="rf-clean-trip-head"><button class="rf-clean-back" data-action="rf-m2-back-to-trips">← Trips</button><div class="rf-clean-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1>${esc(trip.title || 'Untitled trip')}</h1><p>${esc(subtitle(trip))}</p><div class="rf-clean-stamps"><span>${esc(trip.status || 'planning')}</span><span>${esc(trip.visibility || 'group')}</span></div></header><nav class="rf-clean-tabs">${DETAIL_TABS.map(([key, label]) => `<button class="${active === key ? 'is-active' : ''}" data-action="rf-m2-tab" data-value="${key}">${label}</button>`).join('')}</nav>`;
}
function metricGrid(metrics) {
  return `<div class="rf-clean-metrics">${metrics.map(([label, value, unit]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(unit || '')}</small></div>`).join('')}</div>`;
}
function selectedStage(trip) {
  const st = stages(trip.id);
  return st.find((stage) => stage.id === STATE.selectedStageId) || st[0] || null;
}
function mobileStages(trip) {
  const st = stages(trip.id);
  return screen(`${tripHeader(trip, 'stages')}<main class="rf-clean-page"><div class="rf-clean-section-head"><h2>${st.length} stages</h2><button data-action="rf-m2-add-stage">+ Add stage</button></div>${st.map((stage, index) => `<button class="rf-clean-stage" data-action="rf-m2-open-stage" data-stage-id="${esc(stage.id)}"><span>${index + 1}</span><div><strong>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</strong><small>${esc(day(stage.planned_date))} · ${Math.round(Number(stage.distance_km) || 0)} km · ${esc(fmtDate(stage.planned_date) || '')}</small>${stage.notes ? `<p>${esc(stage.notes)}</p>` : ''}</div></button>`).join('') || '<div class="rf-clean-empty">No stages yet.</div>'}</main>`);
}
function mobileSummary(trip) {
  const s = stats(trip);
  return screen(`${tripHeader(trip, 'summary')}<main class="rf-clean-page"><h2>By stage</h2><div class="rf-clean-card-list">${stages(trip.id).map((stage, index) => `<article class="rf-clean-stage-card"><div class="rf-clean-row"><span>${index + 1}</span><strong>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</strong></div><div class="rf-clean-stage-meta"><span>${esc(fmtDate(stage.planned_date) || '—')}</span><span>${Math.round(Number(stage.distance_km) || 0)} km</span><span>${esc(stage.notes || '—')}</span></div>${arr(STATE.entriesByStage[stage.id]).map((entry, i) => `<div class="rf-clean-subrow"><small>${i + 1}. ${esc(entry.entry_type || 'note')}</small><b>${esc(entry.title || 'Untitled')}</b></div>`).join('')}</article>`).join('') || '<div class="rf-clean-empty">No stages yet.</div>'}</div><h2>Totals</h2>${metricGrid([['Distance', Math.round(s.distance).toLocaleString(), 'km'], ['Spent', fmtEuro(s.spent), 'total'], ['Stages', String(s.stages), 'days'], ['Entries', String(s.entries), 'journal']])}</main>`);
}
function mobileCosts(trip) {
  const rows = expenses(trip.id);
  const agg = aggregateExpense(rows);
  return screen(`${tripHeader(trip, 'costs')}<main class="rf-clean-page"><section class="rf-clean-ledger"><div><small>The trip ledger</small><strong>${fmtEuro(agg.total)}</strong><span>${rows.length} entries</span></div><button data-action="rf-v2-add-expense">+ Log expense</button></section><h2>All entries</h2>${rows.map((expense) => `<article class="rf-clean-expense"><div><strong>${esc(EXPENSE_CATEGORY_META[expense.category]?.label || expense.category || 'Other')}</strong><small>${esc(displayNameForUserId(expense.user_id))} · ${esc(fmtDate(expense.date) || '—')}</small></div><b>${fmtEuro(expense.amount || 0)}</b><div class="rf-clean-actions"><button data-action="rf-v2-edit-expense" data-expense-id="${esc(expense.id)}">Edit</button><button data-action="rf-v2-delete-expense" data-expense-id="${esc(expense.id)}">Delete</button></div></article>`).join('') || '<div class="rf-clean-empty">No costs yet.</div>'}</main>`);
}
function mobileItems(trip) {
  const all = items(trip.id);
  const cats = categories(trip.id);
  const selected = STATE.selectedCategoryKey || slug(cats[0]?.name);
  const group = all.filter((item) => slug(item.category?.name || item.category_name || 'Other') === selected);
  const packed = all.filter((item) => item.status === 'packed').length;
  return screen(`${tripHeader(trip, 'items')}<main class="rf-clean-page"><section class="rf-clean-ledger"><div><small>The packing list</small><strong>${packed}<span> / ${all.length}</span></strong><span>packed</span></div><button data-action="rf-m2-add-item">+ Add item</button></section><h2>Categories</h2><div class="rf-clean-card-list">${cats.map((cat, index) => { const key = slug(cat.name); const rows = all.filter((item) => slug(item.category?.name || item.category_name || 'Other') === key); const done = rows.filter((item) => item.status === 'packed').length; return `<button class="rf-clean-category ${selected === key ? 'is-active' : ''}" data-action="rf-m2-select-category" data-category="${esc(key)}"><span>${index + 1}</span><strong>${esc(cat.name)}</strong><b>${done}/${rows.length}</b></button>`; }).join('')}</div><h2>${esc(cats.find((cat) => slug(cat.name) === selected)?.name || 'Items')}</h2>${group.map((item) => `<article class="rf-clean-expense"><div><strong>${esc(item.name)}</strong><small>${esc(item.status || 'planned')}</small></div><button data-action="rf-m2-toggle-item" data-item-id="${esc(item.id)}">${item.status === 'packed' ? 'Packed' : 'Pack'}</button></article>`).join('') || '<div class="rf-clean-empty">No items in this category yet.</div>'}${STATE.wizard === 'item' ? `<form class="rf-clean-form" data-action="rf-m2-item-form"><input name="text" placeholder="e.g. Rain gloves"><select name="category_id">${cats.map((cat) => `<option value="${esc(cat.id || '')}">${esc(cat.name)}</option>`).join('')}</select><button type="submit">Add item</button></form>` : ''}</main>`);
}
function mobileJournal(trip) {
  const stage = selectedStage(trip);
  if (!stage) return screen('<main class="rf-clean-page"><div class="rf-clean-empty">No stage selected.</div></main>');
  const entries = arr(STATE.entriesByStage[stage.id]);
  const stageExpenses = expenses(trip.id).filter((expense) => expense.stage_id === stage.id);
  return screen(`<main class="rf-clean-page"><button class="rf-clean-back" data-action="rf-m2-back-to-stages">← ${esc(trip.title || 'Trip')}</button><div class="rf-clean-kicker">Stage · ${esc(fmtDate(stage.planned_date) || '')}</div><h1 class="rf-clean-title">${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</h1><p>${esc(stage.notes || '')}</p><section class="rf-clean-sky"><strong>Sky advisory</strong><div><span>Start<br>☁️<br>—</span><span>Midpoint<br>🌤️<br>—</span><span>End<br>🌧️<br>—</span></div></section><div class="rf-clean-section-head"><h2>The day's notes</h2><button data-action="rf-m2-add-journal">+ Add</button></div>${entries.map((entry, i) => `<article class="rf-clean-note"><span>${i + 1}</span><div><small>A ${esc(entry.entry_type || 'note')}</small><strong>${esc(entry.title || 'Untitled')}</strong>${entry.location ? `<em>at ${esc(entry.location)}</em>` : ''}</div></article>`).join('') || '<div class="rf-clean-empty">No entries yet.</div>'}<div class="rf-clean-section-head"><h2>Stage costs</h2><button data-action="rf-v2-add-stage-expense" data-stage-id="${esc(stage.id)}">+ Add</button></div>${stageExpenses.map((expense) => `<article class="rf-clean-expense"><div><strong>${esc(EXPENSE_CATEGORY_META[expense.category]?.label || expense.category || 'Other')}</strong><small>${esc(displayNameForUserId(expense.user_id))}</small></div><b>${fmtEuro(expense.amount || 0)}</b></article>`).join('') || '<div class="rf-clean-empty">No costs assigned to this stage.</div>'}<h2>GPX tracks</h2><div class="rf-clean-empty">GPX management is available on desktop for now.</div></main>`);
}
function mobileArchive() {
  const rows = archiveTrips();
  const l = lifetime();
  return screen(`<header class="rf-clean-trip-head"><div class="rf-clean-kicker">The collection</div><h1>Archive</h1><p>${rows.filter((trip) => trip.status === 'completed').length} put to bed · ${rows.filter((trip) => trip.status === 'cancelled').length} called off</p></header><main class="rf-clean-page"><div class="rf-clean-toolbar"><div>${ARCHIVE_FILTERS.map(([key, label]) => `<button class="${(STATE.archiveStatusFilter || 'all') === key ? 'is-active' : ''}" data-action="rf-m2-status-filter" data-value="${key}">${label}</button>`).join('')}</div>${STATE.archiveFiltersOpen || STATE.archiveSearch ? `<input data-action="rf-m2-search-input" value="${esc(STATE.archiveSearch || '')}" placeholder="Search by name"><button data-action="rf-m2-search-toggle">×</button>` : `<button data-action="rf-m2-search-toggle">⌕</button>`}</div><h2>Lifetime totals</h2>${metricGrid([['Completed', String(l.completed), 'trips'], ['Distance', Math.round(l.distance).toLocaleString(), 'km'], ['Spent', fmtEuro(l.spent), 'total'], ['Notes', String(l.entries), 'journal']])}<div class="rf-clean-section-head"><h2>The geography</h2><span>Heatmap</span></div><div class="rf-m2-map-card rf-clean-map"><div class="rf-v2-archive-map" id="rf-v2-archive-map"></div><div class="rf-v2-archive-map-status" id="rf-v2-archive-map-status">Loading archive geography…</div></div>${rows.map((trip) => `<button class="rf-clean-archive-row" data-action="rf-m2-select-archived" data-trip-id="${esc(trip.id)}"><div><small>${esc(tripNo(trip))}</small><strong>${esc(trip.title || 'Untitled')}</strong><span>${esc(season(trip))}</span></div><b>${fmtEuro(stats(trip).spent)}</b></button>`).join('') || '<div class="rf-clean-empty">No archived trips.</div>'}</main>`, 'archive');
}
function mobileAccount() {
  const l = lifetime();
  const year = memberSinceYear();
  const avatar = avatarUrl() ? `<img src="${esc(avatarUrl())}" alt="${esc(userName())}">` : esc(initials());
  return screen(`<header class="rf-clean-trip-head"><div class="rf-clean-kicker">The bearer</div><h1>You</h1></header><main class="rf-clean-page"><section class="rf-clean-profile"><div>${avatar}</div><h2>${esc(userName())}</h2><p>${year ? `Routefolk member since ${year}` : 'Routefolk member'}</p><button data-action="rf-m2-sign-out">Sign out</button></section><h2>Mileage to date</h2>${metricGrid([['Trips', String(l.trips), 'finished + planned'], ['Distance', Math.round(l.distance).toLocaleString(), 'km'], ['Days', String(l.days), 'on the road'], ['Spent', fmtEuro(l.spent), 'across trips']])}${palettePanel()}</main>`, 'account');
}
function palettePanel() {
  const active = currentPalette();
  return `<section class="rf-clean-pref"><h2>App colour</h2>${PALETTES.map(([key, label, sub]) => `<button class="${active === key ? 'is-active' : ''}" data-action="rf-palette-select" data-palette="${esc(key)}"><strong>${esc(label)}</strong><small>${esc(sub)}</small></button>`).join('')}</section>`;
}
function patchMobile() {
  if (!STATE.user || !isMobile()) return false;
  const content = document.getElementById('content');
  if (!content) return false;
  const trip = currentTrip();
  let html = '';
  if (STATE.tab === 'account') html = mobileAccount();
  else if (STATE.tab === 'archive') html = mobileArchive();
  else if (trip && STATE.view === 'journal') html = mobileJournal(trip);
  else if (trip && STATE.view === 'summary') html = mobileSummary(trip);
  else if (trip && STATE.view === 'costs') html = mobileCosts(trip);
  else if (trip && STATE.view === 'packing') html = mobileItems(trip);
  else if (trip) html = mobileStages(trip);
  if (!html) return false;
  const signature = `${STATE.tab}:${STATE.view}:${trip?.id || ''}:${STATE.wizard || ''}:${STATE.selectedCategoryKey || ''}:${STATE.archiveSearch || ''}:${STATE.archiveStatusFilter || ''}:${currentPalette()}:${JSON.stringify([stages(trip?.id || '').length, expenses(trip?.id || '').length, items(trip?.id || '').length])}`;
  if (content.dataset.rfCleanMobile === signature) return true;
  content.innerHTML = html;
  content.dataset.rfCleanMobile = signature;
  if (STATE.tab === 'archive') requestAnimationFrame(() => document.dispatchEvent(new Event('routefolk:archive-map-refresh')));
  return true;
}

function desktopPalettePanel() {
  if (!STATE.user || !isDesktop() || STATE.tab !== 'account') return;
  const main = document.querySelector('.rf-d2-main.is-account');
  if (!main || main.querySelector('.rf-clean-desktop-pref')) return;
  const wrap = document.createElement('section');
  wrap.className = 'rf-clean-desktop-pref';
  wrap.innerHTML = palettePanel();
  main.insertBefore(wrap, main.querySelector('.rf-d2-version'));
}
function desktopArchiveDetail() {
  if (!STATE.user || !isDesktop() || STATE.tab !== 'archive' || !STATE.selectedArchiveTripId) return;
  const trip = currentTrip();
  const content = document.getElementById('content');
  if (!trip || !content || content.querySelector('.rf-clean-archive-detail')) return;
  const s = stats(trip);
  content.innerHTML = `<div class="rf-d2-app"><aside class="rf-d2-sidebar"><div class="rf-d2-sidebar-head"><div class="rf-d2-sidebar-kicker">Routefolk</div><div class="rf-d2-sidebar-title">Field journal</div></div></aside><main class="rf-d2-main is-wide rf-clean-archive-detail"><button class="rf-d2-back" data-action="rf-d2-back-to-archive">← Archive</button><div class="rf-d2-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1 class="rf-d2-hero-title">${esc(trip.title || 'Untitled')}</h1><p class="rf-d2-hero-sub">${esc(subtitle(trip))}</p><div class="rf-d2-stat-grid"><div><span>Distance</span><strong>${Math.round(s.distance).toLocaleString()}</strong><small>km</small></div><div><span>Spent</span><strong>${fmtEuro(s.spent)}</strong><small>lifetime</small></div><div><span>Stages</span><strong>${s.stages}</strong><small>days</small></div><div><span>Entries</span><strong>${s.entries}</strong><small>journal</small></div></div><h2>Archive summary</h2>${desktopSummaryTable(trip)}</main></div>`;
}
function desktopSummaryTable(trip) {
  return `<div class="rf-clean-table"><div class="rf-clean-table-head"><span>Stage</span><span>Route</span><span>Date</span><span>Distance</span><span>Notes</span></div>${stages(trip.id).map((stage, index) => `<div class="rf-clean-table-row"><span>${index + 1}</span><strong>${esc(stage.start_location || 'Start')} to ${esc(stage.end_location || 'End')}</strong><span>${esc(fmtDate(stage.planned_date) || '—')}</span><span>${Math.round(Number(stage.distance_km) || 0)} km</span><span>${esc(stage.notes || '—')}</span></div>`).join('') || '<div class="rf-clean-empty">No stages.</div>'}</div>`;
}

function run() {
  if (!patchMobile()) {
    desktopArchiveDetail();
    desktopPalettePanel();
  }
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const palette = target?.closest('[data-action="rf-palette-select"]');
  if (palette) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setPalette(palette.dataset.palette || 'midnight');
    document.getElementById('content')?.removeAttribute('data-rf-clean-mobile');
    renderAll();
    run();
    return;
  }
  const back = target?.closest('[data-action="rf-d2-back-to-archive"], [data-action="rf-m2-back-to-archive"]');
  if (back) {
    event.preventDefault();
    event.stopImmediatePropagation();
    rememberArchiveContext(null, 'list');
    api().ensureArchiveData?.().finally(() => renderAll());
  }
}, true);

document.addEventListener('routefolk:render', () => requestAnimationFrame(run));
document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(run));
window.addEventListener('resize', () => requestAnimationFrame(run));
requestAnimationFrame(run);
