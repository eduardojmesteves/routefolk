// ============================================================
// routefolk — screens/render/mobile.js
// Clean mobile renderer used while the full base renderer is being
// consolidated. It owns mobile-only markup; no desktop concerns here.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import { fmtDate } from '../../utils/datetime.js';
import {
  DETAIL_TABS,
  ARCHIVE_FILTERS,
  aggregateExpense,
  archiveTrips,
  arr,
  avatarUrl,
  categories,
  categoryLabel,
  currentPalette,
  currentTrip,
  day,
  expenses,
  fmtEuro,
  initials,
  items,
  lifetime,
  memberSinceYear,
  metricGrid,
  palettePanel,
  payerName,
  season,
  slug,
  stages,
  stats,
  subtitle,
  tripNo,
  userName,
} from './shared.js';

const TRIP_FILTERS = [['all', 'All'], ['planning', 'Planning'], ['active', 'Active']];
const ITEM_VIEWS = [['list', 'List'], ['categories', 'Categories']];

function bottomNav(active) {
  return `<nav class="rf-clean-bottom"><button class="${active === 'trips' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="trips">Trips</button><button class="${active === 'archive' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="archive">Archive</button><button class="${active === 'account' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="account">You</button></nav>`;
}

function screen(inner, active = 'trips') {
  return `<div class="rf-clean-mobile"><div class="rf-clean-scroll">${inner}</div>${bottomNav(active)}</div>`;
}

function tripHeader(trip, active, backTo = 'trips', summaryOnly = false) {
  const backAction = backTo === 'archive' ? 'rf-m2-back-to-archive' : 'rf-m2-back-to-trips';
  const backLabel = backTo === 'archive' ? 'Archive' : 'Trips';
  const tabs = summaryOnly ? [['summary', 'Summary']] : DETAIL_TABS;
  return `<header class="rf-clean-trip-head"><button class="rf-clean-back" data-action="${backAction}">← ${backLabel}</button><div class="rf-clean-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1>${esc(trip.title || 'Untitled trip')}</h1><p>${esc(subtitle(trip))}</p><div class="rf-m2-detail-stamps">${statePillHtml(trip.status)}${stampHtml(trip.visibility || 'group', 'accent')}</div></header><nav class="rf-clean-tabs">${tabs.map(([key, label]) => `<button class="${active === key ? 'is-active' : ''}" data-action="rf-m2-tab" data-value="${key}">${label}</button>`).join('')}</nav>`;
}

function selectedStage(trip) {
  const st = stages(trip.id);
  return st.find((stage) => stage.id === STATE.selectedStageId) || st[0] || null;
}

function activeTrips() {
  const query = (STATE.tripSearch || '').trim().toLowerCase();
  const filter = STATE.tripStatusFilter || 'all';
  return STATE.trips
    .filter((trip) => ['planning', 'active'].includes(trip.status))
    .filter((trip) => (filter === 'all' || trip.status === filter) && (!query || `${trip.title || ''} ${trip.description || ''}`.toLowerCase().includes(query)));
}

function itemDone(item) { return item?.status === 'packed'; }
function itemTodo(item) { return !itemDone(item); }
function itemFilter() { return STATE.itemStatusFilter === 'done' ? 'done' : 'todo'; }
function itemView() { return STATE.itemViewMode === 'categories' ? 'categories' : 'list'; }
function itemCompletionLabel(item) { return itemDone(item) ? 'Done' : 'To-do'; }
function itemCategoryKey(item) { return slug(item.category?.name || item.category_name || 'Other'); }
function itemGroupForCategory(all, categoryKey) { return all.filter((item) => itemCategoryKey(item) === categoryKey); }

function statusLabel(status) {
  if (status === 'active') return 'In progress';
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return 'Planning';
}

function statusClass(status) {
  return status === 'active' ? 'is-active' : status === 'completed' ? 'is-completed' : status === 'cancelled' ? 'is-cancelled' : 'is-planning';
}

function stateKey(status) {
  if (status === 'active') return 'active';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'planning';
}

function statePillHtml(status) {
  return `<span class="rf-m2-state-pill is-state-${stateKey(status)}"><span class="rf-m2-state-pill-dot"></span>${esc(statusLabel(status))}</span>`;
}

function stampHtml(value, tone = '') {
  return `<span class="rf-m2-stamp ${tone ? `is-${tone}` : ''}">${esc(value)}</span>`;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stageHasCoords(stage) {
  return (numeric(stage?.start_lat) !== null && numeric(stage?.start_lng) !== null)
    || (numeric(stage?.end_lat) !== null && numeric(stage?.end_lng) !== null);
}

function forecastTempRange(forecast) {
  if (forecast?.tempMin != null && forecast?.tempMax != null) return `${Math.round(forecast.tempMin)}–${Math.round(forecast.tempMax)}°`;
  return '—';
}

function forecastMeta(forecast) {
  const precip = forecast?.precipProb != null
    ? `${Math.round(forecast.precipProb)}% rain`
    : forecast?.precipMm != null ? `${forecast.precipMm} mm rain` : 'rain —';
  const wind = forecast?.windKmh != null ? `${Math.round(forecast.windKmh)} km/h wind` : 'wind —';
  return `${precip} · ${wind}`;
}

function skyPointHtml(point) {
  const forecast = point.forecast;
  return `<span><strong>${esc(point.label)}</strong><br>${esc(forecast.icon || '·')}<br>${esc(forecastTempRange(forecast))}<small>${esc(forecastMeta(forecast))}</small></span>`;
}

function mobileSkyHtml(stage) {
  const result = STATE.forecastsByStage[stage.id];

  if (!stage?.planned_date) {
    return `<section class="rf-clean-sky"><strong>Sky advisory</strong><p>Set a planned date to see the weather forecast.</p></section>`;
  }
  if (!stageHasCoords(stage)) {
    return `<section class="rf-clean-sky"><strong>Sky advisory</strong><p>Weather unavailable. Edit the stage location so routefolk can store coordinates.</p></section>`;
  }
  if (result === 'loading' || result === undefined) {
    return `<section class="rf-clean-sky"><strong>Sky advisory</strong><p>Loading weather…</p></section>`;
  }
  if (!Array.isArray(result) || !result.length) {
    return `<section class="rf-clean-sky"><strong>Sky advisory</strong><p>Weather unavailable for this stage.</p></section>`;
  }

  const usable = result.filter((point) => point.forecast);
  if (!usable.length) {
    return `<section class="rf-clean-sky"><strong>Sky advisory</strong><p>No forecast available for this date.</p></section>`;
  }

  return `<section class="rf-clean-sky"><strong>Sky advisory</strong><div>${usable.map(skyPointHtml).join('')}</div><em>Weather by Open-Meteo</em></section>`;
}

function tripDateRange(trip) {
  const start = fmtDate(trip.start_date);
  const end = fmtDate(trip.end_date);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || season(trip);
}

function stageProgress(trip) {
  const st = stages(trip.id);
  const total = st.length || stats(trip).stages || 0;
  if (!total || trip.status !== 'active') return '';
  const index = Math.max(1, st.findIndex((stage) => stage.id === STATE.selectedStageId) + 1 || 1);
  return `<span class="rf-trip-day">Day ${index} / ${total}</span>`;
}

function tripTicket(trip) {
  const s = stats(trip);
  return `<article class="rf-clean-trip-card"><button class="rf-clean-trip-card-tap" data-action="rf-m2-select-trip" data-trip-id="${esc(trip.id)}"><div class="rf-trip-card-top"><div><strong class="rf-trip-card-title">${esc(trip.title || 'Untitled trip')}</strong><span class="rf-trip-card-subtitle">${esc(subtitle(trip))}</span></div><em>${esc(tripNo(trip))}</em></div><div class="rf-trip-card-date">${esc(tripDateRange(trip))}</div><div class="rf-trip-card-rule"></div><div class="rf-trip-card-bottom"><div class="rf-trip-card-metrics"><span><b>${Math.round(s.distance).toLocaleString()}</b><small>Kilometres</small></span><span><b>${s.stages}</b><small>Stages</small></span></div><div class="rf-trip-card-side"><span class="rf-trip-status ${statusClass(trip.status)}">• ${esc(statusLabel(trip.status))}</span>${stageProgress(trip)}</div></div></button><div class="rf-clean-trip-card-footer"><button data-action="rf-m2-list-edit-trip" data-source="trips" data-trip-id="${esc(trip.id)}">Edit</button><button data-action="rf-m2-list-delete-trip" data-source="trips" data-trip-id="${esc(trip.id)}">Delete</button></div></article>`;
}

function mobileTrips() {
  const rows = activeTrips();
  const activeCount = STATE.trips.filter((trip) => trip.status === 'active').length;
  const completedCount = STATE.trips.filter((trip) => trip.status === 'completed').length;
  if (STATE.tripsLoading && !STATE.trips.length) {
    return screen('<main class="rf-clean-page"><div class="rf-clean-empty">Loading trips…</div></main>', 'trips');
  }
  if (STATE.tripsError) {
    return screen(`<main class="rf-clean-page"><div class="rf-clean-empty">${esc(STATE.tripsError)}</div></main>`, 'trips');
  }
  return screen(`<header class="rf-clean-trips-hero"><div><div class="rf-clean-kicker">ROUTEFOLK</div><h1>Trips</h1><p>${activeCount} on the road map · ${completedCount} in archive</p></div><button class="rf-clean-new-trip" data-action="rf-m2-new-trip">+ New</button></header><main class="rf-clean-page"><div class="rf-clean-toolbar"><div>${TRIP_FILTERS.map(([key, label]) => `<button class="${(STATE.tripStatusFilter || 'all') === key ? 'is-active' : ''}" data-action="rf-m2-status-filter" data-value="${key}">${label}</button>`).join('')}</div>${STATE.tripFiltersOpen || STATE.tripSearch ? `<input data-action="rf-m2-search-input" value="${esc(STATE.tripSearch || '')}" placeholder="Search by name"><button data-action="rf-m2-search-toggle">×</button>` : `<button class="rf-clean-search" data-action="rf-m2-search-toggle">⌕</button>`}</div><div class="rf-clean-card-list rf-clean-trip-list">${rows.map(tripTicket).join('') || '<div class="rf-clean-empty">No matching trips.</div>'}</div></main>`, 'trips');
}

function mobileStages(trip) {
  const st = stages(trip.id);
  return screen(`${tripHeader(trip, 'stages')}<main class="rf-clean-page">${st.map((stage, index) => `<button class="rf-clean-stage" data-action="rf-m2-open-stage" data-stage-id="${esc(stage.id)}"><span>${index + 1}</span><div><strong>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</strong><small>${esc(day(stage.planned_date))} · ${Math.round(Number(stage.distance_km) || 0)} km · ${esc(fmtDate(stage.planned_date) || '')}</small>${stage.notes ? `<p>${esc(stage.notes)}</p>` : ''}</div></button>`).join('') || '<div class="rf-clean-empty">No stages yet.</div>'}<button class="rf-m2-btn is-dashed" data-action="rf-m2-add-stage">+ Add another stage</button></main>`);
}

function mobileSummary(trip) {
  const s = stats(trip);
  return screen(`${tripHeader(trip, 'summary')}<main class="rf-clean-page"><div class="rf-clean-card-list">${stages(trip.id).map((stage, index) => `<article class="rf-clean-stage-card"><div class="rf-clean-row"><span>${index + 1}</span><strong>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</strong></div><div class="rf-clean-stage-meta"><span>${esc(fmtDate(stage.planned_date) || '—')}</span><span>${Math.round(Number(stage.distance_km) || 0)} km</span><span>${esc(stage.notes || '—')}</span></div>${arr(STATE.entriesByStage[stage.id]).map((entry, i) => `<div class="rf-clean-subrow"><small>${i + 1}. ${esc(entry.entry_type || 'note')}</small><b>${esc(entry.title || 'Untitled')}</b></div>`).join('')}</article>`).join('') || '<div class="rf-clean-empty">No stages yet.</div>'}</div><h2>Totals</h2>${metricGrid([['Distance', Math.round(s.distance).toLocaleString(), 'km'], ['Spent', fmtEuro(s.spent), 'total'], ['Stages', String(s.stages), 'days'], ['Entries', String(s.entries), 'journal']])}</main>`);
}

function mobileArchiveSummary(trip) {
  const s = stats(trip);
  return screen(`${tripHeader(trip, 'summary', 'archive', true)}<main class="rf-clean-page"><div class="rf-clean-card-list">${stages(trip.id).map((stage, index) => `<article class="rf-clean-stage-card"><div class="rf-clean-row"><span>${index + 1}</span><strong>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</strong></div><div class="rf-clean-stage-meta"><span>${esc(fmtDate(stage.planned_date) || '—')}</span><span>${Math.round(Number(stage.distance_km) || 0)} km</span><span>${esc(stage.notes || '—')}</span></div>${arr(STATE.entriesByStage[stage.id]).map((entry, i) => `<div class="rf-clean-subrow"><small>${i + 1}. ${esc(entry.entry_type || 'note')}</small><b>${esc(entry.title || 'Untitled')}</b></div>`).join('')}</article>`).join('') || '<div class="rf-clean-empty">No stages yet.</div>'}</div><h2>Totals</h2>${metricGrid([['Distance', Math.round(s.distance).toLocaleString(), 'km'], ['Spent', fmtEuro(s.spent), 'total'], ['Stages', String(s.stages), 'days'], ['Entries', String(s.entries), 'journal']])}</main>`, 'archive');
}

function mobileCosts(trip) {
  const rows = expenses(trip.id);
  const agg = aggregateExpense(rows);
  return screen(`${tripHeader(trip, 'costs')}<main class="rf-clean-page"><section class="rf-clean-ledger"><div><small>The trip ledger</small><strong>${fmtEuro(agg.total)}</strong><span>${rows.length} entries</span></div><button data-action="rf-v2-add-expense">+ Log expense</button></section><h2>All entries</h2>${rows.map((expense) => `<article class="rf-clean-expense"><div><strong>${esc(categoryLabel(expense.category))}</strong><small>${esc(payerName(expense.user_id))} · ${esc(fmtDate(expense.date) || '—')}</small></div><b>${fmtEuro(expense.amount || 0)}</b><div class="rf-clean-actions"><button data-action="rf-v2-edit-expense" data-expense-id="${esc(expense.id)}">Edit</button><button data-action="rf-v2-delete-expense" data-expense-id="${esc(expense.id)}">Delete</button></div></article>`).join('') || '<div class="rf-clean-empty">No costs yet.</div>'}</main>`);
}

function mobileItems(trip) {
  const all = items(trip.id);
  const cats = categories(trip.id);
  const selected = STATE.selectedCategoryKey || slug(cats[0]?.name);
  const filter = itemFilter();
  const view = itemView();
  const done = all.filter(itemDone).length;
  const todo = all.length - done;
  const filteredItems = all.filter((item) => filter === 'done' ? itemDone(item) : itemTodo(item));
  const viewToggle = `<div class="rf-clean-view-toggle">${ITEM_VIEWS.map(([key, label]) => `<button class="${view === key ? 'is-active' : ''}" data-action="rf-m2-item-view" data-value="${key}">${label}</button>`).join('')}</div>`;
  const categoryList = `<h2>Categories</h2><div class="rf-clean-card-list">${cats.map((cat, index) => { const key = slug(cat.name); const rows = itemGroupForCategory(all, key); const catDone = rows.filter(itemDone).length; const catTodo = rows.length - catDone; return `<button class="rf-clean-category ${selected === key ? 'is-active' : ''}" data-action="rf-m2-select-category" data-category="${esc(key)}"><span>${index + 1}</span><strong>${esc(cat.name)}</strong><b>${catTodo} left · ${catDone} done</b></button>${selected === key && rows.length ? `<div class="rf-clean-category-preview">${rows.slice(0,4).map((item) => `<span>${itemDone(item) ? '✓' : '○'} ${esc(item.name)}</span>`).join('')}</div>` : ''}`; }).join('')}</div>`;
  const itemList = `<div class="rf-clean-section-head rf-clean-item-list-head"><h2>Items</h2><div class="rf-clean-mini-pills"><button class="${filter === 'todo' ? 'is-active' : ''}" data-action="rf-m2-item-filter" data-value="todo">To-do</button><button class="${filter === 'done' ? 'is-active' : ''}" data-action="rf-m2-item-filter" data-value="done">Done</button></div></div><div class="rf-clean-card-list">${filteredItems.map((item) => `<article class="rf-clean-item-card ${itemDone(item) ? 'is-done' : 'is-todo'}"><button class="rf-clean-item-check" data-action="rf-m2-toggle-item" data-item-id="${esc(item.id)}">${itemDone(item) ? '✓' : ''}</button><div><strong>${esc(item.name)}</strong><small>${itemCompletionLabel(item)}${item.status === 'optional' ? ' · optional' : ''}</small></div><div class="rf-clean-actions"><button data-action="rf-m2-edit-item" data-item-id="${esc(item.id)}">Edit</button><button data-action="rf-m2-delete-item" data-item-id="${esc(item.id)}">Delete</button></div></article>`).join('') || `<div class="rf-clean-empty">No ${filter === 'done' ? 'done' : 'to-do'} items yet.</div>`}</div>`;
  return screen(`${tripHeader(trip, 'items')}<main class="rf-clean-page"><section class="rf-clean-ledger rf-clean-items-ledger"><div><small>The packing list</small><strong>${done}<span> / ${all.length}</span></strong><span>${todo} left · ${done} done</span></div><button data-action="rf-m2-add-item">+ Add item</button></section>${view === 'categories' ? categoryList : itemList}${viewToggle}</main>`);
}

function mobileJournal(trip) {
  const stage = selectedStage(trip);
  if (!stage) return screen('<main class="rf-clean-page"><div class="rf-clean-empty">No stage selected.</div></main>');
  const entries = arr(STATE.entriesByStage[stage.id]);
  const stageExpenses = expenses(trip.id).filter((expense) => expense.stage_id === stage.id);
  return screen(`<main class="rf-clean-page"><button class="rf-clean-back" data-action="rf-m2-back-to-stages">← ${esc(trip.title || 'Trip')}</button><div class="rf-clean-kicker">Stage · ${esc(fmtDate(stage.planned_date) || '')}</div><h1 class="rf-clean-title">${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</h1><p>${esc(stage.notes || '')}</p>${mobileSkyHtml(stage)}<div class="rf-clean-section-head"><h2>The day's notes</h2><button data-action="rf-m2-add-journal">+ Add</button></div>${entries.map((entry, i) => `<article class="rf-clean-note"><span>${i + 1}</span><div><small>A ${esc(entry.entry_type || 'note')}</small><strong>${esc(entry.title || 'Untitled')}</strong>${entry.location ? `<em>at ${esc(entry.location)}</em>` : ''}</div></article>`).join('') || '<div class="rf-clean-empty">No entries yet.</div>'}<div class="rf-clean-section-head"><h2>Stage costs</h2><button data-action="rf-v2-add-stage-expense" data-stage-id="${esc(stage.id)}">+ Add</button></div>${stageExpenses.map((expense) => `<article class="rf-clean-expense"><div><strong>${esc(categoryLabel(expense.category))}</strong><small>${esc(payerName(expense.user_id))}</small></div><b>${fmtEuro(expense.amount || 0)}</b></article>`).join('') || '<div class="rf-clean-empty">No costs assigned to this stage.</div>'}<h2>GPX tracks</h2><div class="rf-clean-empty">GPX management is available on desktop for now.</div></main>`);
}

function archiveTicket(trip) {
  return `<article class="rf-clean-archive-card"><button class="rf-clean-archive-row" data-action="rf-m2-select-archived" data-trip-id="${esc(trip.id)}"><div><small>${esc(tripNo(trip))}</small><strong>${esc(trip.title || 'Untitled')}</strong><span>${esc(season(trip))}</span></div><b>${fmtEuro(stats(trip).spent)}</b></button><div class="rf-clean-trip-card-footer"><button data-action="rf-m2-list-edit-trip" data-source="archive" data-trip-id="${esc(trip.id)}">Edit</button><button data-action="rf-m2-list-delete-trip" data-source="archive" data-trip-id="${esc(trip.id)}">Delete</button></div></article>`;
}

function mobileArchive() {
  const rows = archiveTrips();
  const l = lifetime();
  return screen(`<header class="rf-clean-trip-head"><div class="rf-clean-kicker">The collection</div><h1>Archive</h1><p>${rows.filter((trip) => trip.status === 'completed').length} put to bed · ${rows.filter((trip) => trip.status === 'cancelled').length} called off</p></header><main class="rf-clean-page"><div class="rf-clean-toolbar"><div>${ARCHIVE_FILTERS.map(([key, label]) => `<button class="${(STATE.archiveStatusFilter || 'all') === key ? 'is-active' : ''}" data-action="rf-m2-status-filter" data-value="${key}">${label}</button>`).join('')}</div>${STATE.archiveFiltersOpen || STATE.archiveSearch ? `<input data-action="rf-m2-search-input" value="${esc(STATE.archiveSearch || '')}" placeholder="Search by name"><button data-action="rf-m2-search-toggle">×</button>` : `<button data-action="rf-m2-search-toggle">⌕</button>`}</div><h2>Lifetime totals</h2>${metricGrid([['Completed', String(l.completed), 'trips'], ['Distance', Math.round(l.distance).toLocaleString(), 'km'], ['Spent', fmtEuro(l.spent), 'total'], ['Notes', String(l.entries), 'journal']])}<div class="rf-clean-section-head"><h2>The geography</h2><span>Heatmap</span></div><div class="rf-m2-map-card rf-clean-map"><div class="rf-v2-archive-map" id="rf-v2-archive-map"></div><div class="rf-v2-archive-map-status" id="rf-v2-archive-map-status">Loading archive geography…</div></div>${rows.map(archiveTicket).join('') || '<div class="rf-clean-empty">No archived trips.</div>'}</main>`, 'archive');
}

function mobileAccount() {
  const l = lifetime();
  const year = memberSinceYear();
  const avatar = avatarUrl() ? `<img src="${esc(avatarUrl())}" alt="${esc(userName())}">` : esc(initials());
  return screen(`<header class="rf-clean-trip-head"><div class="rf-clean-kicker">The bearer</div><h1>You</h1></header><main class="rf-clean-page"><section class="rf-clean-profile"><div>${avatar}</div><h2>${esc(userName())}</h2><p>${year ? `Routefolk member since ${year}` : 'Routefolk member'}</p><button data-action="rf-m2-sign-out">Sign out</button></section><h2>Mileage to date</h2>${metricGrid([['Trips', String(l.trips), 'finished + planned'], ['Distance', Math.round(l.distance).toLocaleString(), 'km'], ['Days', String(l.days), 'on the road'], ['Spent', fmtEuro(l.spent), 'across trips']])}${palettePanel()}</main>`, 'account');
}

export function renderMobileMarkup() {
  const trip = currentTrip();
  if (STATE.tab === 'account') return mobileAccount();
  if (STATE.tab === 'archive') {
    if (trip) return mobileArchiveSummary(trip);
    return mobileArchive();
  }
  if (trip && STATE.view === 'journal') return mobileJournal(trip);
  if (trip && STATE.view === 'summary') return mobileSummary(trip);
  if (trip && STATE.view === 'costs') return mobileCosts(trip);
  if (trip && STATE.view === 'packing') return mobileItems(trip);
  if (trip) return mobileStages(trip);
  return mobileTrips();
}

export function mobileSignature() {
  const trip = currentTrip();
  return `${STATE.tab}:${STATE.view}:${trip?.id || ''}:${STATE.wizard || ''}:${STATE.tripSearch || ''}:${STATE.tripStatusFilter || ''}:${STATE.selectedCategoryKey || ''}:${STATE.itemStatusFilter || ''}:${STATE.itemViewMode || ''}:${STATE.archiveSearch || ''}:${STATE.archiveStatusFilter || ''}:${currentPalette()}:${JSON.stringify([STATE.trips.length, stages(trip?.id || '').length, expenses(trip?.id || '').length, items(trip?.id || '').length])}`;
}
