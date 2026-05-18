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

function bottomNav(active) {
  return `<nav class="rf-clean-bottom"><button class="${active === 'trips' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="trips">Trips</button><button class="${active === 'archive' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="archive">Archive</button><button class="${active === 'account' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="account">You</button></nav>`;
}

function screen(inner, active = 'trips') {
  return `<div class="rf-clean-mobile"><div class="rf-clean-scroll">${inner}</div>${bottomNav(active)}</div>`;
}

function tripHeader(trip, active) {
  const visibility = trip.visibility === 'private' ? 'Private' : 'Group';
  const status = trip.status || 'planning';
  return `<header class="rf-clean-trip-head"><button class="rf-clean-back" data-action="rf-m2-back-to-trips">← Trips</button><div class="rf-clean-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1>${esc(trip.title || 'Untitled trip')}</h1><p>${esc(subtitle(trip))}</p><div class="rf-clean-stamps"><span class="rf-clean-status-pill is-${esc(status)}">${esc(status)}</span><span class="rf-clean-visibility-pill">${esc(visibility)}</span></div></header><nav class="rf-clean-tabs">${DETAIL_TABS.map(([key, label]) => `<button class="${active === key ? 'is-active' : ''}" data-action="rf-m2-tab" data-value="${key}">${label}</button>`).join('')}</nav>`;
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
function itemCompletionLabel(item) { return itemDone(item) ? 'Done' : 'To-do'; }
function itemGroupForCategory(all, categoryKey) { return all.filter((item) => slug(item.category?.name || item.category_name || 'Other') === categoryKey); }
function mobileItemsView() { return STATE.mobileItemsView === 'category' ? 'category' : 'list'; }
function categoryNameForItem(item, cats = []) {
  if (item?.category?.name) return item.category.name;
  if (item?.category_name) return item.category_name;
  const cat = cats.find((row) => row.id && row.id === item?.category_id);
  return cat?.name || 'Other';
}
function sortItemsNewestFirst(rows) {
  return rows
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ad = Date.parse(a.item.created_at || a.item.inserted_at || a.item.updated_at || '');
      const bd = Date.parse(b.item.created_at || b.item.inserted_at || b.item.updated_at || '');
      if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return bd - ad;
      if (Number.isFinite(bd) && !Number.isFinite(ad)) return 1;
      if (Number.isFinite(ad) && !Number.isFinite(bd)) return -1;
      return b.index - a.index;
    })
    .map(({ item }) => item);
}
function itemSectionTitle(label, count) {
  return `<div class="rf-clean-items-section-title"><span>${esc(label)}</span><small>${count}</small></div>`;
}
function mobileItemCard(item, cats, completed = false) {
  const category = categoryNameForItem(item, cats);
  return `<article class="rf-clean-packing-card ${completed ? 'is-done' : 'is-todo'}"><button class="rf-clean-item-check" data-action="rf-m2-toggle-item" data-item-id="${esc(item.id)}" aria-label="Toggle packed state">${completed ? '✓' : ''}</button><div class="rf-clean-packing-main"><strong>${esc(item.name)}</strong><small>${esc(itemCompletionLabel(item))}${item.status === 'optional' ? ' · optional' : ''}${item.notes ? ` · ${esc(item.notes)}` : ''}</small><div class="rf-clean-actions"><button data-action="rf-m2-edit-item" data-item-id="${esc(item.id)}">Edit</button><button data-action="rf-m2-delete-item" data-item-id="${esc(item.id)}">Delete</button></div></div><span class="rf-clean-category-pill">${esc(category)}</span></article>`;
}

function mobileTrips() {
  const rows = activeTrips();
  if (STATE.tripsLoading && !STATE.trips.length) {
    return screen('<main class="rf-clean-page"><div class="rf-clean-empty">Loading trips…</div></main>', 'trips');
  }
  if (STATE.tripsError) {
    return screen(`<main class="rf-clean-page"><div class="rf-clean-empty">${esc(STATE.tripsError)}</div></main>`, 'trips');
  }
  return screen(`<header class="rf-clean-trip-head"><div class="rf-clean-kicker">Routefolk</div><h1>Trips</h1><p>${rows.length} on the road map · ${archiveTrips().length} in archive</p></header><main class="rf-clean-page"><div class="rf-clean-section-head"><h2>The road map</h2><button data-action="rf-m2-new-trip">+ New</button></div><div class="rf-clean-toolbar"><div>${TRIP_FILTERS.map(([key, label]) => `<button class="${(STATE.tripStatusFilter || 'all') === key ? 'is-active' : ''}" data-action="rf-m2-status-filter" data-value="${key}">${label}</button>`).join('')}</div>${STATE.tripFiltersOpen || STATE.tripSearch ? `<input data-action="rf-m2-search-input" value="${esc(STATE.tripSearch || '')}" placeholder="Search by name"><button data-action="rf-m2-search-toggle">×</button>` : `<button data-action="rf-m2-search-toggle">⌕</button>`}</div><div class="rf-clean-card-list rf-clean-trip-list">${rows.map((trip) => { const s = stats(trip); return `<button class="rf-clean-trip-card" data-action="rf-m2-select-trip" data-trip-id="${esc(trip.id)}"><small>${esc(tripNo(trip))} · ${esc(season(trip))}</small><strong>${esc(trip.title || 'Untitled trip')}</strong><span>${esc(subtitle(trip))}</span><b>${Math.round(s.distance).toLocaleString()} km</b></button>`; }).join('') || '<div class="rf-clean-empty">No matching trips.</div>'}</div></main>`, 'trips');
}

function mobileStages(trip) {
  const st = stages(trip.id);
  const rows = st.map((stage, index) => `<button class="rf-clean-stage" data-action="rf-m2-open-stage" data-stage-id="${esc(stage.id)}"><span>${index + 1}</span><div><strong>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</strong><small>${esc(day(stage.planned_date))} · ${Math.round(Number(stage.distance_km) || 0)} km · ${esc(fmtDate(stage.planned_date) || '')}</small>${stage.notes ? `<p>${esc(stage.notes)}</p>` : ''}</div></button>`).join('');
  return screen(`${tripHeader(trip, 'stages')}<main class="rf-clean-page rf-clean-stage-page">${rows || '<div class="rf-clean-empty">No stages yet.</div>'}<button class="rf-clean-add-bottom" data-action="rf-m2-add-stage">+ Add stage</button></main>`);
}

function mobileSummary(trip) {
  const s = stats(trip);
  return screen(`${tripHeader(trip, 'summary')}<main class="rf-clean-page rf-clean-summary-page"><div class="rf-clean-card-list rf-clean-summary-list">${stages(trip.id).map((stage, index) => `<article class="rf-clean-stage-card"><div class="rf-clean-row"><span>${index + 1}</span><strong>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</strong></div><div class="rf-clean-stage-meta"><span>${esc(fmtDate(stage.planned_date) || '—')}</span><span>${Math.round(Number(stage.distance_km) || 0)} km</span><span>${esc(stage.notes || '—')}</span></div>${arr(STATE.entriesByStage[stage.id]).map((entry, i) => `<div class="rf-clean-subrow"><small>${i + 1}. ${esc(entry.entry_type || 'note')}</small><b>${esc(entry.title || 'Untitled')}</b></div>`).join('')}</article>`).join('') || '<div class="rf-clean-empty">No stages yet.</div>'}</div><h2>Totals</h2>${metricGrid([['Distance', Math.round(s.distance).toLocaleString(), 'km'], ['Spent', fmtEuro(s.spent), 'total'], ['Stages', String(s.stages), 'days'], ['Entries', String(s.entries), 'journal']])}</main>`);
}

function mobileCosts(trip) {
  const rows = expenses(trip.id);
  const agg = aggregateExpense(rows);
  return screen(`${tripHeader(trip, 'costs')}<main class="rf-clean-page"><section class="rf-clean-ledger"><div><small>The trip ledger</small><strong>${fmtEuro(agg.total)}</strong><span>${rows.length} entries</span></div><button data-action="rf-v2-add-expense">+ Log expense</button></section><h2>All entries</h2>${rows.map((expense) => `<article class="rf-clean-expense"><div><strong>${esc(categoryLabel(expense.category))}</strong><small>${esc(payerName(expense.user_id))} · ${esc(fmtDate(expense.date) || '—')}</small></div><b>${fmtEuro(expense.amount || 0)}</b><div class="rf-clean-actions"><button data-action="rf-v2-edit-expense" data-expense-id="${esc(expense.id)}">Edit</button><button data-action="rf-v2-delete-expense" data-expense-id="${esc(expense.id)}">Delete</button></div></article>`).join('') || '<div class="rf-clean-empty">No costs yet.</div>'}</main>`);
}

function mobileItemsListView(trip, all, cats, done, todo) {
  const toDoItems = sortItemsNewestFirst(all.filter(itemTodo));
  const doneItems = sortItemsNewestFirst(all.filter(itemDone));
  return `<main class="rf-clean-page rf-clean-items-page"><section class="rf-clean-ledger rf-clean-items-ledger"><div><small>The packing list</small><strong>${done}<span> / ${all.length}</span></strong><span>${todo} left · ${done} done</span></div><button data-action="rf-m2-add-item">+ Add item</button></section><div class="rf-clean-packing-list">${itemSectionTitle('To-do', toDoItems.length)}${toDoItems.map((item) => mobileItemCard(item, cats, false)).join('') || '<div class="rf-clean-empty">No to-do items left.</div>'}<div class="rf-clean-completed-divider"><span>Completed</span></div>${doneItems.map((item) => mobileItemCard(item, cats, true)).join('') || '<div class="rf-clean-empty is-muted">No completed items yet.</div>'}</div><button class="rf-clean-view-switch" data-action="rf-m2-item-view" data-value="category">Category view</button></main>`;
}

function mobileItemsCategoryView(trip, all, cats, done, todo) {
  const selected = STATE.selectedCategoryKey || slug(cats[0]?.name);
  const selectedCat = cats.find((cat) => slug(cat.name) === selected);
  const filter = itemFilter();
  const group = itemGroupForCategory(all, selected).filter((item) => filter === 'done' ? itemDone(item) : itemTodo(item));
  return `<main class="rf-clean-page rf-clean-items-page"><section class="rf-clean-ledger rf-clean-items-ledger"><div><small>The packing list</small><strong>${done}<span> / ${all.length}</span></strong><span>${todo} left · ${done} done</span></div><button data-action="rf-m2-add-item">+ Add item</button></section><h2>Categories</h2><div class="rf-clean-card-list">${cats.map((cat, index) => { const key = slug(cat.name); const rows = itemGroupForCategory(all, key); const catDone = rows.filter(itemDone).length; const catTodo = rows.length - catDone; return `<button class="rf-clean-category ${selected === key ? 'is-active' : ''}" data-action="rf-m2-select-category" data-category="${esc(key)}"><span>${index + 1}</span><strong>${esc(cat.name)}</strong><b>${catTodo} left · ${catDone} done</b></button>${selected === key && rows.length ? `<div class="rf-clean-category-preview">${rows.slice(0,4).map((item) => `<span>${itemDone(item) ? '✓' : '○'} ${esc(item.name)}</span>`).join('')}</div>` : ''}`; }).join('')}</div><div class="rf-clean-section-head"><h2>${esc(selectedCat?.name || 'Items')}</h2><div class="rf-clean-mini-pills"><button class="${filter === 'todo' ? 'is-active' : ''}" data-action="rf-m2-item-filter" data-value="todo">To-do</button><button class="${filter === 'done' ? 'is-active' : ''}" data-action="rf-m2-item-filter" data-value="done">Done</button></div></div><div class="rf-clean-card-list">${group.map((item) => `<article class="rf-clean-item-card ${itemDone(item) ? 'is-done' : 'is-todo'}"><button class="rf-clean-item-check" data-action="rf-m2-toggle-item" data-item-id="${esc(item.id)}">${itemDone(item) ? '✓' : ''}</button><div><strong>${esc(item.name)}</strong><small>${itemCompletionLabel(item)}${item.status === 'optional' ? ' · optional' : ''}</small></div><div class="rf-clean-actions"><button data-action="rf-m2-edit-item" data-item-id="${esc(item.id)}">Edit</button><button data-action="rf-m2-delete-item" data-item-id="${esc(item.id)}">Delete</button></div></article>`).join('') || `<div class="rf-clean-empty">No ${filter === 'done' ? 'done' : 'to-do'} items in this category yet.</div>`}</div><button class="rf-clean-view-switch" data-action="rf-m2-item-view" data-value="list">List view</button></main>`;
}

function mobileItems(trip) {
  const all = items(trip.id);
  const cats = categories(trip.id);
  const done = all.filter(itemDone).length;
  const todo = all.length - done;
  const body = mobileItemsView() === 'category'
    ? mobileItemsCategoryView(trip, all, cats, done, todo)
    : mobileItemsListView(trip, all, cats, done, todo);
  return screen(`${tripHeader(trip, 'items')}${body}`);
}

function mobileJournal(trip) {
  const stage = selectedStage(trip);
  if (!stage) return screen('<main class="rf-clean-page"><div class="rf-clean-empty">No stage selected.</div></main>');
  const entries = arr(STATE.entriesByStage[stage.id]);
  const stageExpenses = expenses(trip.id).filter((expense) => expense.stage_id === stage.id);
  return screen(`<main class="rf-clean-page"><button class="rf-clean-back" data-action="rf-m2-back-to-stages">← ${esc(trip.title || 'Trip')}</button><div class="rf-clean-kicker">Stage · ${esc(fmtDate(stage.planned_date) || '')}</div><h1 class="rf-clean-title">${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</h1><p>${esc(stage.notes || '')}</p><section class="rf-clean-sky"><strong>Sky advisory</strong><div><span>Start<br>☁️<br>—</span><span>Midpoint<br>🌤️<br>—</span><span>End<br>🌧️<br>—</span></div></section><div class="rf-clean-section-head"><h2>The day's notes</h2><button data-action="rf-m2-add-journal">+ Add</button></div>${entries.map((entry, i) => `<article class="rf-clean-note"><span>${i + 1}</span><div><small>A ${esc(entry.entry_type || 'note')}</small><strong>${esc(entry.title || 'Untitled')}</strong>${entry.location ? `<em>at ${esc(entry.location)}</em>` : ''}</div></article>`).join('') || '<div class="rf-clean-empty">No entries yet.</div>'}<div class="rf-clean-section-head"><h2>Stage costs</h2><button data-action="rf-v2-add-stage-expense" data-stage-id="${esc(stage.id)}">+ Add</button></div>${stageExpenses.map((expense) => `<article class="rf-clean-expense"><div><strong>${esc(categoryLabel(expense.category))}</strong><small>${esc(payerName(expense.user_id))}</small></div><b>${fmtEuro(expense.amount || 0)}</b></article>`).join('') || '<div class="rf-clean-empty">No costs assigned to this stage.</div>'}<h2>GPX tracks</h2><div class="rf-clean-empty">GPX management is available on desktop for now.</div></main>`);
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

export function renderMobileMarkup() {
  const trip = currentTrip();
  if (STATE.tab === 'account') return mobileAccount();
  if (STATE.tab === 'archive') return mobileArchive();
  if (trip && STATE.view === 'journal') return mobileJournal(trip);
  if (trip && STATE.view === 'summary') return mobileSummary(trip);
  if (trip && STATE.view === 'costs') return mobileCosts(trip);
  if (trip && STATE.view === 'packing') return mobileItems(trip);
  if (trip) return mobileStages(trip);
  return mobileTrips();
}

export function mobileSignature() {
  const trip = currentTrip();
  return `${STATE.tab}:${STATE.view}:${trip?.id || ''}:${STATE.wizard || ''}:${STATE.tripSearch || ''}:${STATE.tripStatusFilter || ''}:${STATE.selectedCategoryKey || ''}:${STATE.itemStatusFilter || ''}:${STATE.mobileItemsView || ''}:${STATE.archiveSearch || ''}:${STATE.archiveStatusFilter || ''}:${currentPalette()}:${JSON.stringify([STATE.trips.length, stages(trip?.id || '').length, expenses(trip?.id || '').length, items(trip?.id || '').length])}`;
}
