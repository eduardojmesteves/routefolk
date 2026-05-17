// ============================================================
// routefolk — screens/production-fixes.js
// Production behaviour hardening for edge interactions and
// final UI refinement hooks.
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { fmtDate, fmtDateRange } from '../utils/datetime.js';
import { fmtEuro } from '../utils/format.js';
import { EXPENSE_CATEGORY_META } from '../constants/app-constants.js';

const arr = (value) => Array.isArray(value) ? value : [];
const currentTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || STATE.selectedTripId)) || null;
const stages = (tripId) => arr(STATE.stagesByTrip[tripId]);
const expenses = (tripId) => arr(STATE.expensesByTrip[tripId]);
const items = (tripId) => arr(STATE.itemsByTrip[tripId]);
const categories = (tripId) => arr(STATE.itemCategoriesByTrip[tripId]);
const isDesktop = () => window.matchMedia('(min-width:960px)').matches;
const isMobile = () => !isDesktop();

const DEFAULT_CATS = ['Clothing', 'Luggage', 'Tools & spares', 'Filming & gear', 'Chargers & power', 'Documents', 'First aid', 'Other essentials'];
const PALETTES = [
  ['midnight', 'Ink & Rust', 'Cool cream · ink · rust'],
  ['forest', 'Forest & Ochre', 'Warm cream · forest · ochre'],
  ['oxblood', 'Slate & Bordeaux', 'Warm white · slate · bordeaux'],
  ['alpine', 'Graphite & Sun', 'Soft beige · graphite · sun'],
];

function tripNo(trip) { return `No. ${String(Math.max(0, STATE.trips.findIndex((candidate) => candidate.id === trip?.id)) + 1).padStart(2, '0')}`; }
function subtitle(trip) { return trip?.description || fmtDateRange(trip?.start_date, trip?.end_date) || 'A road journal'; }
function season(trip) {
  const date = trip?.start_date ? new Date(`${trip.start_date}T00:00:00Z`) : null;
  const year = date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : new Date().getFullYear();
  const month = date && !Number.isNaN(date.getTime()) ? date.getUTCMonth() : 2;
  const name = month <= 1 || month === 11 ? 'Winter' : month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Autumn';
  return `${name} ${year}`;
}
function slug(value) { return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other'; }
function day(date) {
  if (!date) return '';
  try { return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3); }
  catch { return ''; }
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
  let distance = 0;
  let spent = 0;
  let entries = 0;
  let days = 0;
  let completed = 0;
  STATE.trips.forEach((trip) => {
    if (trip.status === 'completed') completed += 1;
    const st = stages(trip.id);
    distance += st.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0) || Number(trip.distance_km) || 0;
    spent += expenses(trip.id).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    entries += st.reduce((sum, stage) => sum + arr(STATE.entriesByStage[stage.id]).length, 0);
    days += st.length || dateSpan(trip.start_date, trip.end_date);
  });
  return { trips: STATE.trips.length, completed, distance, spent, entries, days };
}
function archiveTrips() {
  const query = (STATE.archiveSearch || '').trim().toLowerCase();
  const filter = STATE.archiveStatusFilter || 'all';
  return STATE.trips
    .filter((trip) => ['completed', 'cancelled'].includes(trip.status))
    .filter((trip) => (filter === 'all' || trip.status === filter) && (!query || `${trip.title || ''} ${trip.description || ''}`.toLowerCase().includes(query)));
}
function avatarUrl() { return STATE.user?.user_metadata?.avatar_url || STATE.user?.user_metadata?.picture || STATE.profilesById?.[STATE.user?.id]?.avatar_url || ''; }
function userName() { return STATE.user?.user_metadata?.full_name || STATE.user?.user_metadata?.name || STATE.user?.email || 'Routefolk rider'; }
function userInitials() { return userName().trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || 'RF'; }
function memberSinceYear() {
  const profile = STATE.user?.id ? STATE.profilesById?.[STATE.user.id] : null;
  const date = STATE.user?.created_at || profile?.created_at || profile?.inserted_at || '';
  const year = date ? new Date(date).getFullYear() : null;
  return Number.isFinite(year) ? year : null;
}
function currentPalette() {
  try { return localStorage.getItem('rf.palette') || document.documentElement.dataset.palette || 'midnight'; }
  catch { return document.documentElement.dataset.palette || 'midnight'; }
}

function signedOutLanding() {
  if (STATE.user) return;
  const content = document.getElementById('content');
  if (!content || content.querySelector('.rf-v2-auth')) return;
  content.innerHTML = `<div class="rf-v2-auth"><section class="rf-v2-auth-card"><div class="rf-v2-auth-kicker">Routefolk</div><h1>Field journal for the road</h1><p>Plan routes, record stages, keep notes, costs, packing lists and GPX tracks in one road journal.</p><button class="rf-d2-btn is-primary rf-v2-auth-button" data-action="rf-d2-sign-in" type="button">Sign in with Google</button></section></div>`;
}

function entryRowsForStage(stage, ns) {
  const entries = arr(STATE.entriesByStage[stage.id]);
  if (!entries.length) return '';
  return entries.map((entry, entryIndex) => `<div class="rf-v2-summary-entry ${ns}-summary-entry"><span></span><span><em>${entryIndex + 1}. ${esc(entry.entry_type || 'note')}</em><strong>${esc(entry.title || 'Untitled entry')}</strong>${entry.location ? `<small>at ${esc(entry.location)}</small>` : ''}</span><span>${entry.timestamp ? esc(new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '—'}</span><span>Journal</span><span>${esc(entry.description || '—')}</span></div>`).join('');
}
function summaryTable(trip, ns = 'rf-d2') {
  const rows = stages(trip.id).map((stage, index) => `<div class="rf-v2-summary-row"><span>${index + 1}</span><span><strong>${esc(stage.start_location || 'Start')} to ${esc(stage.end_location || 'End')}</strong></span><span>${esc(fmtDate(stage.planned_date) || '—')}</span><span>${Math.round(Number(stage.distance_km) || 0)} km</span><span>${esc(stage.notes || '—')}</span></div>${entryRowsForStage(stage, ns)}`).join('');
  return `<div class="${ns}-table rf-v2-summary-table"><div class="rf-v2-summary-head"><span>Stage</span><span>Route / journal</span><span>Date / time</span><span>Distance / type</span><span>Status / notes</span></div>${rows || `<div class="${ns}-empty">No stages yet.</div>`}</div>`;
}
function patchSummary() {
  if (!STATE.user || STATE.view !== 'summary') return;
  const trip = currentTrip();
  if (!trip) return;
  const table = document.querySelector('.rf-d2-table:not(.rf-v2-summary-table), .rf-m2-table:not(.rf-v2-summary-table)');
  if (!table) return;
  const ns = table.className.includes('rf-m2') ? 'rf-m2' : 'rf-d2';
  const wrap = document.createElement('div');
  wrap.innerHTML = summaryTable(trip, ns);
  table.replaceWith(wrap.firstElementChild);
}

function sideNav() {
  return `<aside class="rf-d2-sidebar"><div class="rf-d2-sidebar-head"><div class="rf-d2-sidebar-kicker">Routefolk</div><div class="rf-d2-sidebar-title">Field journal</div></div><nav class="rf-d2-rail"><button class="rf-d2-rail-item" data-action="rf-d2-nav" data-tab="trips" type="button"><span class="rf-d2-rail-glyph">T</span><span class="rf-d2-rail-label">Trips</span></button><button class="rf-d2-rail-item is-active" data-action="rf-d2-nav" data-tab="archive" type="button"><span class="rf-d2-rail-glyph">A</span><span class="rf-d2-rail-label">Archive</span></button><button class="rf-d2-rail-item" data-action="rf-d2-nav" data-tab="account" type="button"><span class="rf-d2-rail-glyph">Y</span><span class="rf-d2-rail-label">You</span></button></nav></aside>`;
}
function archiveDetail(trip) {
  const s = stats(trip);
  return `<main class="rf-d2-main is-wide rf-v2-archive-detail"><button class="rf-d2-back" data-action="rf-d2-nav" data-tab="archive" type="button">← Archive</button><header class="rf-d2-hero"><div class="rf-d2-hero-top"><div><div class="rf-d2-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1 class="rf-d2-hero-title">${esc(trip.title || 'Untitled trip')}</h1><div class="rf-d2-hero-sub">${esc(subtitle(trip))}</div></div><div class="rf-d2-hero-stamps"><span class="rf-d2-state-pill is-${esc(trip.status || 'completed')}">${esc(trip.status || 'completed')}</span><div class="rf-v2-hero-actions"><button class="rf-d2-btn" data-action="rf-v2-edit-trip" type="button">Edit trip</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-trip" type="button">Delete</button></div></div></div><div class="rf-d2-stat-grid"><div><span>Distance</span><strong>${Math.round(s.distance).toLocaleString()}</strong><small>km recorded</small></div><div><span>Spent</span><strong>${fmtEuro(s.spent)}</strong><small>lifetime</small></div><div><span>Stages</span><strong>${s.stages}</strong><small>days</small></div><div><span>Entries</span><strong>${s.entries}</strong><small>journal</small></div></div></header><div class="rf-d2-section-title">Archive summary</div>${summaryTable(trip)}</main>`;
}
function patchArchiveOpen() {
  const trip = currentTrip();
  if (!STATE.user || STATE.tab !== 'archive' || !trip) return;
  const content = document.getElementById('content');
  if (!content || content.querySelector('.rf-v2-archive-detail')) return;
  content.innerHTML = isDesktop() ? `<div class="rf-d2-app">${sideNav()}${archiveDetail(trip)}</div>` : mobileArchiveDetail(trip);
}
function patchHeroActions() {
  document.querySelectorAll('.rf-v2-hero-actions').forEach((node) => {
    const target = document.querySelector('.rf-d2-hero-stamps, .rf-m2-detail-stamps');
    if (target && !target.querySelector('.rf-v2-hero-actions')) target.appendChild(node);
  });
}

function parseUiDate(text) {
  if (!text) return null;
  const parsed = new Date(`${text} 00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function isSameLocalDate(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function patchTodayLabels() {
  const today = new Date();
  document.querySelectorAll('.rf-d2-stage-row, .rf-m2-stage').forEach((row) => {
    const stampNode = [...row.querySelectorAll('.rf-d2-stamp, .rf-m2-stamp')].find((node) => node.textContent.trim().toLowerCase() === 'today');
    if (!stampNode) return;
    const dateText = [...row.querySelectorAll('.rf-d2-stage-mono span, .rf-m2-stage-mono')].map((node) => node.textContent.trim()).find((value) => /\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/.test(value));
    const stageDate = parseUiDate(dateText);
    if (!isSameLocalDate(stageDate, today)) stampNode.remove();
  });
}
function patchStageCostsAdd() {
  const trip = currentTrip();
  const stageId = STATE.selectedStageId || stages(trip?.id || '')[0]?.id || '';
  document.querySelectorAll('.rf-d2-section-head, .rf-m2-section-head').forEach((head) => {
    const title = head.querySelector('.rf-d2-section-title, .rf-m2-section-title');
    if (!title || title.textContent.trim().toLowerCase() !== 'stage costs' || head.querySelector('[data-action="rf-v2-add-stage-expense"]')) return;
    const btn = document.createElement('button');
    btn.className = 'rf-d2-btn is-primary';
    btn.dataset.action = 'rf-v2-add-stage-expense';
    btn.dataset.stageId = stageId;
    btn.type = 'button';
    btn.textContent = '+ Add';
    head.appendChild(btn);
  });
}
function patchExpenseStageSelection() {
  if (STATE.wizard !== 'expense' || !STATE.editTargetId) return;
  const select = document.getElementById('v2-expense-stage');
  if (select && select.value !== STATE.editTargetId) select.value = STATE.editTargetId;
}
function patchAccount() {
  if (!STATE.user || STATE.tab !== 'account') return;
  const accountCard = document.querySelector('.rf-d2-account-card, .rf-m2-account-card');
  if (!accountCard) return;
  const manage = accountCard.querySelector('[data-action="rf-d2-manage-google"], [data-action="rf-m2-manage-google"]');
  if (manage) {
    manage.textContent = 'Sign out';
    manage.dataset.action = manage.dataset.action?.startsWith('rf-m2') ? 'rf-m2-sign-out' : 'rf-d2-sign-out';
    manage.classList.add('is-signout');
  }
  document.querySelectorAll('.rf-d2-main.is-account > .rf-d2-btn[data-action$="sign-out"], .rf-m2-body > .rf-m2-btn[data-action$="sign-out"]').forEach((node) => node.remove());
  const avatar = accountCard.querySelector('.rf-d2-account-avatar, .rf-m2-account-avatar');
  const src = avatarUrl();
  if (avatar && src && !avatar.querySelector('img')) avatar.innerHTML = `<img src="${esc(src)}" alt="${esc(userName())}">`;
  const em = accountCard.querySelector('em');
  const year = memberSinceYear();
  if (em) em.textContent = year ? `Routefolk member since ${year}` : 'Routefolk member';
}

function mBar(active) {
  return `<nav class="rf-m2-tab-bar"><div class="rf-m2-tab-row">${[['trips', 'Trips'], ['archive', 'Archive'], ['account', 'You']].map(([key, label]) => `<button class="rf-m2-tab-btn ${active === key ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="${key}" type="button"><span class="rf-m2-tab-bar-dash"></span><span class="rf-m2-tab-label">${label}</span></button>`).join('')}</div></nav>`;
}
function mTabs(active) {
  return `<nav class="rf-m2-tabs rf-v3-mobile-tabs">${[['stages', 'Stages'], ['summary', 'Summary'], ['costs', 'Costs'], ['items', 'Items']].map(([key, label]) => `<button class="rf-m2-tab ${active === key ? 'is-active' : ''}" data-action="rf-m2-tab" data-value="${key}">${label}</button>`).join('')}</nav>`;
}
function mobileTripHero(trip, active) {
  return `<header class="rf-v3-mobile-hero"><button class="rf-v3-back" data-action="rf-m2-back-to-trips" type="button">← Trips</button><div class="rf-v3-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1>${esc(trip.title || 'Untitled trip')}</h1><p>${esc(subtitle(trip))}</p><div class="rf-v3-stamps"><span>${esc(trip.status || 'planning')}</span><span>${esc(trip.visibility || 'group')}</span></div></header>${mTabs(active)}`;
}
function mobileScreen(inner, active = 'trips') {
  return `<div class="rf-m2-screen rf-v3-mobile-screen"><div class="rf-v3-scroll">${inner}</div>${mBar(active)}</div>`;
}
function mobileArchiveDetail(trip) {
  const s = stats(trip);
  return mobileScreen(`<section class="rf-v3-mobile-page"><button class="rf-v3-back" data-action="rf-m2-nav" data-tab="archive" type="button">← Archive</button><div class="rf-v3-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1>${esc(trip.title || 'Untitled trip')}</h1><p>${esc(subtitle(trip))}</p><div class="rf-v3-metric-grid"><div><span>Distance</span><strong>${Math.round(s.distance).toLocaleString()}</strong><small>km</small></div><div><span>Spent</span><strong>${fmtEuro(s.spent)}</strong><small>lifetime</small></div><div><span>Stages</span><strong>${s.stages}</strong><small>days</small></div><div><span>Entries</span><strong>${s.entries}</strong><small>journal</small></div></div><div class="rf-v3-actions"><button class="rf-d2-btn" data-action="rf-v2-edit-trip" type="button">Edit trip</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-trip" type="button">Delete</button></div><h2>Archive summary</h2>${summaryTable(trip, 'rf-m2')}</section>`, 'archive');
}
function selectedStage(trip) {
  const st = stages(trip.id);
  return st.find((stage) => stage.id === STATE.selectedStageId) || st[0] || null;
}
function mobileJournal(trip) {
  const stage = selectedStage(trip);
  if (!stage) return mobileScreen(`<section class="rf-v3-mobile-page"><button class="rf-v3-back" data-action="rf-m2-back-to-stages" type="button">← ${esc(trip.title)}</button><p>No stage selected.</p></section>`);
  if (STATE.wizard === 'journal') return mobileJournalWizard(trip, stage);
  const entries = arr(STATE.entriesByStage[stage.id]);
  const stageExpenses = expenses(trip.id).filter((expense) => expense.stage_id === stage.id);
  return mobileScreen(`<section class="rf-v3-mobile-page"><button class="rf-v3-back" data-action="rf-m2-back-to-stages" type="button">← ${esc(trip.title)}</button><div class="rf-v3-kicker">Stage ${esc(stage.order_index || '')} · ${esc(fmtDate(stage.planned_date) || '')}</div><h1>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</h1><p>${esc(stage.notes || '')}</p><section class="rf-v3-card"><div class="rf-v3-card-kicker">Sky advisory</div><div class="rf-v3-sky"><div><strong>Start</strong><span>☁️</span><small>—</small></div><div><strong>Midpoint</strong><span>🌤️</span><small>—</small></div><div><strong>End</strong><span>🌧️</span><small>—</small></div></div></section><div class="rf-v3-section-head"><h2>The day's notes</h2><button class="rf-d2-btn is-primary" data-action="rf-m2-add-journal" type="button">+ Add</button></div>${entries.length ? entries.map(mEntry).join('') : '<div class="rf-v3-empty">No entries yet.</div>'}<div class="rf-v3-section-head"><h2>Stage costs</h2><button class="rf-d2-btn is-primary" data-action="rf-v2-add-stage-expense" data-stage-id="${esc(stage.id)}" type="button">+ Add</button></div>${stageExpenses.length ? stageExpenses.map(mExpense).join('') : '<div class="rf-v3-empty">No costs assigned to this stage.</div>'}<h2>GPX tracks</h2><div class="rf-v3-card rf-v3-muted-card">Use the GPX panel from the stage detail on desktop for now.</div></section>`);
}
function mobileJournalWizard(trip, stage) {
  return mobileScreen(`<section class="rf-v3-mobile-page"><button class="rf-v3-back" data-action="rf-m2-cancel-wizard" type="button">← ${esc(stage.start_location || 'Stage')}</button><div class="rf-v3-kicker">New entry</div><h1>A note from the road</h1><input class="rf-d2-input" id="v2-entry-title" placeholder="Title"><input class="rf-d2-input" id="v2-entry-place" placeholder="Place"><input class="rf-d2-input" id="v2-entry-time" type="time"><textarea class="rf-d2-textarea" id="v2-entry-note" placeholder="What happened here?"></textarea><div class="rf-v3-actions is-stacked"><button class="rf-d2-btn" data-action="rf-m2-cancel-wizard" type="button">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-m2-save-journal" type="button">Save entry</button></div></section>`);
}
function mEntry(entry, index) {
  const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return `<article class="rf-v3-entry"><div class="rf-v3-entry-no">${index + 1}</div><div><small>A ${esc(entry.entry_type || 'note')} ${time ? `· ${esc(time)}` : ''}</small><strong>${esc(entry.title || 'Untitled')}</strong>${entry.location ? `<em>at ${esc(entry.location)}</em>` : ''}${entry.description ? `<p>${esc(entry.description)}</p>` : ''}</div></article>`;
}
function mExpense(expense) {
  const meta = EXPENSE_CATEGORY_META[expense.category] || EXPENSE_CATEGORY_META.other || { label: expense.category || 'Other' };
  return `<article class="rf-v3-list-row"><div><strong>${esc(meta.label)}</strong><small>${esc(fmtDate(expense.date) || '')}</small></div><b>${fmtEuro(expense.amount || 0)}</b></article>`;
}
function mobileCosts(trip) {
  const ex = expenses(trip.id);
  const total = ex.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  return mobileScreen(`${mobileTripHero(trip, 'costs')}<section class="rf-v3-mobile-page"><section class="rf-v3-ledger-card"><small>The trip ledger</small><strong>${fmtEuro(total)}</strong><span>${ex.length} entries</span><button class="rf-d2-btn is-primary" data-action="rf-v2-add-expense" type="button">+ Log expense</button></section><h2>All entries</h2>${ex.length ? ex.map(mExpense).join('') : '<div class="rf-v3-empty">No costs yet.</div>'}</section>`);
}
function mobileItems(trip) {
  const its = items(trip.id);
  const cats = categories(trip.id).length ? categories(trip.id) : DEFAULT_CATS.map((name, i) => ({ id: '', name, sort_order: i }));
  const selected = STATE.selectedCategoryKey || slug(cats[0]?.name);
  const group = its.filter((item) => slug(item.category?.name || item.category_name || 'Other') === selected);
  const packed = its.filter((item) => item.status === 'packed').length;
  return mobileScreen(`${mobileTripHero(trip, 'items')}<section class="rf-v3-mobile-page"><section class="rf-v3-ledger-card"><small>The packing list</small><strong>${packed}<span> of ${its.length} packed</span></strong></section><h2>Categories</h2><div class="rf-v3-card">${cats.map((cat, i) => itemCategoryRow(cat, i, its, selected)).join('')}</div><h2>${esc(cats.find((cat) => slug(cat.name) === selected)?.name || 'Items')}</h2>${group.length ? group.map(mItem).join('') : '<div class="rf-v3-empty">No items in this category yet.</div>'}<form class="rf-v3-form" data-action="rf-m2-item-form"><input class="rf-d2-input" name="text" placeholder="e.g. Rain gloves"><select class="rf-d2-input" name="category_id">${cats.map((cat) => `<option value="${esc(cat.id || '')}">${esc(cat.name)}</option>`).join('')}</select><button class="rf-d2-btn is-primary" type="submit">Add item</button></form></section>`);
}
function itemCategoryRow(cat, index, its, selected) {
  const key = slug(cat.name);
  const group = its.filter((item) => slug(item.category?.name || item.category_name || 'Other') === key);
  const packed = group.filter((item) => item.status === 'packed').length;
  return `<button class="rf-v3-list-row is-button ${selected === key ? 'is-selected' : ''}" data-action="rf-m2-select-category" data-category="${esc(key)}" type="button"><div><small>${index + 1}</small><strong>${esc(cat.name)}</strong></div><b>${packed}/${group.length}</b></button>`;
}
function mItem(item) {
  return `<article class="rf-v3-list-row"><div><strong>${esc(item.name)}</strong><small>${esc(item.status || 'planned')}</small></div><button class="rf-d2-btn" data-action="rf-m2-toggle-item" data-item-id="${esc(item.id)}" type="button">${item.status === 'packed' ? 'Packed' : 'Pack'}</button></article>`;
}
function mobileSummary(trip) {
  const s = stats(trip);
  return mobileScreen(`${mobileTripHero(trip, 'summary')}<section class="rf-v3-mobile-page"><h2>By stage</h2>${summaryTable(trip, 'rf-m2')}<h2>Totals</h2><div class="rf-v3-metric-grid"><div><span>Distance</span><strong>${Math.round(s.distance).toLocaleString()}</strong><small>km</small></div><div><span>Time</span><strong>—</strong><small>recorded</small></div><div><span>Spent</span><strong>${fmtEuro(s.spent)}</strong><small>total</small></div><div><span>Entries</span><strong>${s.entries}</strong><small>journal</small></div></div></section>`);
}
function mobileArchive() {
  const rows = archiveTrips();
  const l = lifetime();
  return mobileScreen(`<header class="rf-v3-mobile-hero"><div class="rf-v3-kicker">The collection</div><h1>Archive</h1><p>${rows.filter((trip) => trip.status === 'completed').length} put to bed · ${rows.filter((trip) => trip.status === 'cancelled').length} called off</p></header><section class="rf-v3-mobile-page"><div class="rf-v3-filter-row"><button class="rf-m2-pill ${STATE.archiveStatusFilter === 'all' ? 'is-active' : ''}" data-action="rf-m2-status-filter" data-value="all">All</button><button class="rf-m2-pill ${STATE.archiveStatusFilter === 'completed' ? 'is-active' : ''}" data-action="rf-m2-status-filter" data-value="completed">Completed</button><button class="rf-m2-pill ${STATE.archiveStatusFilter === 'cancelled' ? 'is-active' : ''}" data-action="rf-m2-status-filter" data-value="cancelled">Cancelled</button></div><h2>Lifetime totals</h2><div class="rf-v3-metric-grid"><div><span>Completed</span><strong>${l.completed}</strong><small>trips</small></div><div><span>Distance</span><strong>${Math.round(l.distance).toLocaleString()}</strong><small>km</small></div><div><span>Spent</span><strong>${fmtEuro(l.spent)}</strong><small>total</small></div><div><span>Notes</span><strong>${l.entries}</strong><small>journal</small></div></div><div class="rf-v3-section-head"><h2>The geography</h2><span class="rf-v3-stamp">Heatmap</span></div><div class="rf-m2-map-card rf-v3-map-card"><div class="rf-v2-archive-map" id="rf-v2-archive-map"></div><div class="rf-v2-archive-map-status" id="rf-v2-archive-map-status">Loading archive geography…</div></div>${rows.map((trip) => `<button class="rf-v3-list-row is-button" data-action="rf-m2-select-archived" data-trip-id="${esc(trip.id)}"><div><small>${esc(tripNo(trip))}</small><strong>${esc(trip.title || 'Untitled')}</strong><span>${esc(season(trip))}</span></div><b>${fmtEuro(stats(trip).spent)}</b></button>`).join('') || '<div class="rf-v3-empty">No archived trips.</div>'}</section>`, 'archive');
}
function paletteSettings() {
  const active = currentPalette();
  return `<section class="rf-v3-card rf-v3-palette-card"><h2>App colour</h2><p>Choose the palette used across Routefolk.</p>${PALETTES.map(([key, label, sub]) => `<button class="rf-v3-palette-choice ${active === key ? 'is-active' : ''}" data-action="rf-palette-select" data-palette="${esc(key)}" type="button"><span>${esc(label)}</span><small>${esc(sub)}</small></button>`).join('')}</section>`;
}
function mobileAccount() {
  const l = lifetime();
  const year = memberSinceYear();
  const avatar = avatarUrl() ? `<img src="${esc(avatarUrl())}" alt="${esc(userName())}">` : esc(userInitials());
  return mobileScreen(`<header class="rf-v3-mobile-hero"><div class="rf-v3-kicker">The bearer</div><h1>You</h1></header><section class="rf-v3-mobile-page"><section class="rf-v3-profile-card"><div class="rf-v3-profile-photo">${avatar}</div><h2>${esc(userName())}</h2><p>${year ? `Routefolk member since ${year}` : 'Routefolk member'}</p><button class="rf-d2-btn is-danger" data-action="rf-m2-sign-out" type="button">Sign out</button></section><section class="rf-v3-card"><h2>Other riders</h2><p>${Math.max(0, STATE.profiles.length - 1)} people you've ridden with</p></section><h2>Mileage to date</h2><div class="rf-v3-metric-grid"><div><span>Trips</span><strong>${l.trips}</strong><small>finished + planned</small></div><div><span>Distance</span><strong>${Math.round(l.distance).toLocaleString()}</strong><small>km</small></div><div><span>Days</span><strong>${l.days}</strong><small>on the road</small></div><div><span>Spent</span><strong>${fmtEuro(l.spent)}</strong><small>across trips</small></div></div>${paletteSettings()}</section>`, 'account');
}
function patchMobileScreens() {
  if (!STATE.user || !isMobile()) return false;
  const content = document.getElementById('content');
  if (!content) return false;
  const trip = currentTrip();
  let html = '';
  if (STATE.tab === 'account') html = mobileAccount();
  else if (STATE.tab === 'archive' && trip) html = mobileArchiveDetail(trip);
  else if (STATE.tab === 'archive') html = mobileArchive();
  else if (trip && STATE.view === 'journal') html = mobileJournal(trip);
  else if (trip && STATE.view === 'summary') html = mobileSummary(trip);
  else if (trip && STATE.view === 'costs') html = mobileCosts(trip);
  else if (trip && STATE.view === 'packing') html = mobileItems(trip);
  if (!html) return false;
  if (content.dataset.rfMobilePatch === `${STATE.tab}:${STATE.view}:${trip?.id || 'none'}:${STATE.wizard || 'none'}:${STATE.selectedCategoryKey || ''}:${currentPalette()}`) return true;
  content.innerHTML = html;
  content.dataset.rfMobilePatch = `${STATE.tab}:${STATE.view}:${trip?.id || 'none'}:${STATE.wizard || 'none'}:${STATE.selectedCategoryKey || ''}:${currentPalette()}`;
  if (STATE.tab === 'archive') requestAnimationFrame(() => document.dispatchEvent(new Event('routefolk:archive-map-refresh')));
  return true;
}

function patchPaletteControls() {
  document.getElementById('rf-paletteFab')?.remove();
  document.getElementById('rf-paletteSheet')?.remove();
}

function run() {
  signedOutLanding();
  const mobilePatched = patchMobileScreens();
  if (!mobilePatched) {
    patchArchiveOpen();
    patchSummary();
  }
  patchHeroActions();
  patchTodayLabels();
  patchStageCostsAdd();
  patchExpenseStageSelection();
  patchAccount();
  patchPaletteControls();
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const palette = target?.closest('[data-action="rf-palette-select"]');
  if (palette) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const value = palette.dataset.palette || 'midnight';
    document.documentElement.dataset.palette = value;
    try { localStorage.setItem('rf.palette', value); } catch {}
    document.getElementById('content')?.removeAttribute('data-rf-mobile-patch');
    run();
    return;
  }
  const btn = target?.closest('[data-action="rf-v2-add-stage-expense"]');
  if (!btn) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  STATE.wizard = 'expense';
  STATE.editTargetId = btn.dataset.stageId || STATE.selectedStageId || null;
  window.routefolkData?.renderAll?.();
}, true);

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(run));
document.addEventListener('routefolk:render', () => requestAnimationFrame(run));
window.addEventListener('resize', () => requestAnimationFrame(run));
requestAnimationFrame(run);
