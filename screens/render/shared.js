// ============================================================
// routefolk — screens/render/shared.js
// Shared formatting, selection, metrics and small HTML helpers
// used by the transitional desktop/mobile render layers.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc, starSvg } from '../../utils/dom.js';
import { fmtDateRange, fmtDate } from '../../utils/datetime.js';
import { fmtEuro } from '../../utils/format.js';
import { EXPENSE_CATEGORY_META } from '../../constants/app-constants.js';
import { displayNameForUserId } from '../../utils/user.js';

export const DETAIL_TABS = [['stages', 'Stages'], ['summary', 'Summary'], ['costs', 'Costs'], ['items', 'Items']];
export const ARCHIVE_FILTERS = [['all', 'All'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
// "midnight" is the single palette key the app ships: Ember Trail, the
// Route Atlas redesign's dark charcoal / amber / teal palette. The prior
// four light palettes were retired with this redesign (see
// styles/interface-polish.css).
export const PALETTES = [
  ['midnight', 'Ember Trail', 'Dark charcoal · amber · teal'],
];
export const DEFAULT_CATEGORIES = ['Clothing', 'Luggage', 'Tools & spares', 'Filming & gear', 'Chargers & power', 'Documents', 'First aid', 'Other'];

export const arr = (value) => Array.isArray(value) ? value : [];
export const isDesktop = () => window.matchMedia('(min-width:960px)').matches;
export const isMobile = () => !isDesktop();
export const stages = (tripId) => arr(STATE.stagesByTrip[tripId]);
export const expenses = (tripId) => arr(STATE.expensesByTrip[tripId]);
export const items = (tripId) => arr(STATE.itemsByTrip[tripId]);
export const slug = (value) => String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';

export function categories(tripId) {
  const rows = arr(STATE.itemCategoriesByTrip[tripId]);
  return rows.length ? rows : DEFAULT_CATEGORIES.map((name, sort_order) => ({ id: '', name, sort_order }));
}

export function currentTrip() {
  const id = STATE.viewTripId || (STATE.tab === 'archive' ? STATE.selectedArchiveTripId : STATE.selectedTripId);
  return STATE.trips.find((trip) => trip.id === id) || null;
}

// F1 — write/visibility guards. Centralize the archived-view-only and
// offline-disabled rules so action atoms read them from one place instead of
// re-deriving ['completed','cancelled'].includes(trip.status) inline.

/** True when the trip is editable (not archived). */
export function canWriteToTrip(trip) {
  return !!trip && !['completed', 'cancelled'].includes(trip.status);
}

/** True when stage/entry action affordances should render at all. */
export function showStageActions(trip) {
  return canWriteToTrip(trip);
}

/** Disabled-attribute fragment for write actions: '' or ' disabled'
 *  (leading space). Append directly: `<button ...${writeDisabledAttr(trip)}>`. */
export function writeDisabledAttr(trip) {
  return (canWriteToTrip(trip) && STATE.isOnline) ? '' : ' disabled';
}

export function currentPalette() {
  try { return localStorage.getItem('rf.palette') || 'midnight'; } catch { return 'midnight'; }
}

export function setPalette(value) {
  const next = PALETTES.some(([key]) => key === value) ? value : 'midnight';
  document.documentElement.dataset.palette = next;
  try { localStorage.setItem('rf.palette', next); } catch {}
}

export function userName() {
  return STATE.user?.user_metadata?.full_name || STATE.user?.user_metadata?.name || STATE.user?.email || 'Routefolk rider';
}

export function avatarUrl() {
  return STATE.user?.user_metadata?.avatar_url || STATE.user?.user_metadata?.picture || '';
}

export function initials() {
  return userName().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() || '').join('') || 'RF';
}

export function memberSinceYear() {
  const profile = STATE.user?.id ? STATE.profilesById?.[STATE.user.id] : null;
  const value = STATE.user?.created_at || profile?.created_at || profile?.inserted_at || '';
  const year = value ? new Date(value).getFullYear() : null;
  return Number.isFinite(year) ? year : null;
}

export function tripNo(trip) {
  return `No. ${String(Math.max(0, STATE.trips.findIndex((item) => item.id === trip?.id)) + 1).padStart(2, '0')}`;
}

export function season(trip) {
  const date = trip?.start_date ? new Date(`${trip.start_date}T00:00:00Z`) : null;
  const year = date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : new Date().getFullYear();
  const month = date && !Number.isNaN(date.getTime()) ? date.getUTCMonth() : 2;
  const name = month <= 1 || month === 11 ? 'Winter' : month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Autumn';
  return `${name} ${year}`;
}

export function subtitle(trip) {
  return trip?.description || fmtDateRange(trip?.start_date, trip?.end_date) || 'A road journal';
}

export function day(date) {
  if (!date) return '';
  try { return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3); } catch { return ''; }
}

export function dateSpan(start, end) {
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  return Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) ? 0 : Math.max(1, Math.round((b - a) / 86400000) + 1);
}

// ---- Trips-list hero state machine (Route Atlas) ----------------------
// One component, three states, switching on real trip/stage data — never
// manually toggled. See HANDOFF.md "Trips-list hero area — state machine".
function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysUntil(dateStr) {
  if (!dateStr) return 0;
  const target = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.max(0, Math.round((target - todayUTC()) / 86400000));
}

/** Now-riding progress computed from the active trip's real stage data. */
function nowRidingProgress(trip) {
  const st = stages(trip.id).slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const today = todayUTC();
  let currentIndex = -1;
  st.forEach((stage, i) => {
    if (!stage.planned_date) return;
    if (new Date(`${stage.planned_date}T00:00:00Z`) <= today) currentIndex = i;
  });
  if (currentIndex < 0) currentIndex = 0;
  const kmTotal = st.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0) || Number(trip.distance_km) || 0;
  const kmCovered = st.slice(0, currentIndex + 1).reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0);
  const dayY = dateSpan(trip.start_date, trip.end_date);
  const dayX = trip.start_date ? Math.min(dayY || 1, Math.max(1, dateSpan(trip.start_date, new Date().toISOString().slice(0, 10)))) : 1;
  const next = st[currentIndex + 1] || null;
  const todayStr = new Date().toISOString().slice(0, 10);
  return {
    stageIndex: st.length ? currentIndex + 1 : 0,
    stageTotal: st.length,
    dayX,
    dayY,
    kmCovered,
    kmTotal,
    progressPct: kmTotal > 0 ? Math.min(100, Math.round((kmCovered / kmTotal) * 100)) : 0,
    next: next ? { route: `${next.start_location || 'Start'} → ${next.end_location || 'End'}`, distance: Math.round(Number(next.distance_km) || 0), when: next.planned_date === todayStr ? 'today' : (fmtDate(next.planned_date) || 'soon') } : null,
  };
}

/** Resolves which of the hero's three states applies right now. */
export function tripsHeroState() {
  const active = STATE.trips.find((trip) => trip.status === 'active');
  if (active) return { kind: 'now-riding', trip: active, ...nowRidingProgress(active) };
  const planning = STATE.trips.filter((trip) => trip.status === 'planning');
  if (planning.length) {
    const next = planning.slice().sort((a, b) => (a.start_date || '9999-12-31').localeCompare(b.start_date || '9999-12-31'))[0];
    const days = daysUntil(next.start_date);
    return { kind: 'planning-queue', next, count: planning.length, daysLabel: days <= 0 ? 'starts today' : `starts in ${days} day${days === 1 ? '' : 's'}` };
  }
  return { kind: 'none' };
}

/** Renders the hero: "Now riding" banner, "planning queue" card, or
 *  nothing (falls through to the screen's own generic empty state). */
export function tripsHeroHtml() {
  const state = tripsHeroState();
  if (state.kind === 'now-riding') {
    const { trip, stageIndex, stageTotal, dayX, dayY, kmCovered, kmTotal, progressPct, next } = state;
    const meta = stageTotal ? `<div class="ra-nowriding-meta"><span>Day ${dayX} of ${dayY}</span><span>${Math.round(kmCovered).toLocaleString()} / ${Math.round(kmTotal).toLocaleString()} km</span></div><div class="ra-nowriding-bar"><span style="width:${progressPct}%"></span></div>` : '';
    const nextLine = next ? `<div class="ra-nowriding-next">Next: <b>${esc(next.route)}</b> · ${next.distance} km · ${esc(next.when)}</div>` : '';
    return `<div class="ra-nowriding"><div class="rf-eyebrow">Now riding${stageTotal ? ` · Stage ${stageIndex} of ${stageTotal}` : ''}</div><h2>${esc(trip.title || 'Untitled trip')}</h2>${meta}${nextLine}</div>`;
  }
  if (state.kind === 'planning-queue') {
    return `<div class="ra-planningq"><div class="rf-eyebrow">No trip on the road right now</div><strong>Next up: ${esc(state.next.title || 'Untitled trip')}</strong><span>${state.count} trip${state.count === 1 ? '' : 's'} in planning · ${esc(state.daysLabel)}</span></div>`;
  }
  return '';
}

/** Journal entries for a stage, ordered per HANDOFF.md's Auto/Override
 *  rule: sort_order when the stage has manual order active, otherwise
 *  chronological by timestamp (falling back to created_at). */
export function orderedEntries(stage) {
  const rows = arr(STATE.entriesByStage[stage?.id]);
  if (!stage?.journal_manual_order) {
    return rows.slice().sort((a, b) => {
      const at = a.timestamp ? new Date(a.timestamp).getTime() : Infinity;
      const bt = b.timestamp ? new Date(b.timestamp).getTime() : Infinity;
      if (at !== bt) return at - bt;
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });
  }
  return rows.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

// Entry ordering control (HANDOFF.md): Auto (by time, default) vs a
// per-stage manual override. Shared markup for mobile + desktop. Grip
// handles are locked/dimmed in Auto and active in Override — reorder
// itself uses the same ↑/↓ swap pattern already proven for stages,
// rather than native drag (no reliable touch story in this codebase).
export function journalOrderBarHtml(stage) {
  const manual = !!stage.journal_manual_order;
  return `<div class="rf-sortbar"><button class="${!manual ? 'is-active' : ''}" data-action="rf-v2-journal-order-auto" type="button"><span class="rf-clockdot"></span>Auto · by time</button><button class="${manual ? 'is-active' : ''}" data-action="rf-v2-journal-order-manual" type="button">Override order</button></div>`;
}

export function gripHtml(manual) {
  return `<div class="rf-grip ${manual ? '' : 'is-locked'}"><span></span><span></span><span></span></div>`;
}

/** Stage rail node color (HANDOFF.md: "orange=upcoming, green=done"),
 *  based on the stage's real planned_date vs today — never manually set. */
export function stageNodeStatus(stage) {
  if (!stage?.planned_date) return 'upcoming';
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const d = new Date(`${stage.planned_date}T00:00:00Z`);
  return d < today ? 'done' : 'upcoming';
}

// HANDOFF.md "Offline / empty states": orange left-accent callout, shown
// app-wide whenever the real connection is down — fixed-position so it
// never disturbs the flex app-shell layout underneath it.
export function offlineBannerHtml() {
  if (STATE.isOnline !== false) return '';
  return `<div class="rf-offline-banner">You're offline. Trip data is cached; new stages, notes and expenses can't be saved until you're back online.</div>`;
}

export function stats(trip) {
  if (!trip) return { stages: 0, entries: 0, distance: 0, spent: 0 };
  const st = stages(trip.id);
  const ex = expenses(trip.id);
  const entries = st.reduce((sum, stage) => sum + arr(STATE.entriesByStage[stage.id]).length, 0);
  const distance = st.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0) || Number(trip.distance_km) || 0;
  const spent = ex.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  return { stages: st.length, entries, distance, spent };
}

export function lifetime() {
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

export function archiveTrips() {
  const query = (STATE.archiveSearch || '').trim().toLowerCase();
  const filter = STATE.archiveStatusFilter || 'all';
  return STATE.trips
    .filter((trip) => ['completed', 'cancelled'].includes(trip.status))
    .filter((trip) => (filter === 'all' || trip.status === filter) && (!query || `${trip.title || ''} ${trip.description || ''}`.toLowerCase().includes(query)));
}

export function categoryLabel(category) {
  return EXPENSE_CATEGORY_META[category]?.label || category || 'Other';
}

export function payerName(userId) {
  return displayNameForUserId(userId) || 'Unknown';
}

export function aggregateExpense(rows) {
  const cat = new Map();
  const payer = new Map();
  let total = 0;
  rows.forEach((expense) => {
    const amount = Number(expense.amount) || 0;
    total += amount;
    const category = categoryLabel(expense.category);
    const paidBy = payerName(expense.user_id);
    cat.set(category, (cat.get(category) || 0) + amount);
    payer.set(paidBy, (payer.get(paidBy) || 0) + amount);
  });
  return { total, cat, payer };
}

export function metricGrid(metrics) {
  return `<div class="rf-clean-metrics">${metrics.map(([label, value, unit]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(unit || '')}</small></div>`).join('')}</div>`;
}

// Retired: the app now ships a single palette (Ember Trail), so a
// pick-your-theme panel with one always-active option is dead weight.
// The Account screen's full Route Atlas rebuild (a later phase) drops
// this section entirely; PALETTES/setPalette stay for that migration.
export function palettePanel() {
  return '';
}

// "My roads" (HANDOFF.md #16): the current user's own starred roads,
// sorted by their own rating (see lib/roads.js listMyRoads()). Shared,
// no drill-in — every linked stage renders directly on the card.
function starRowHtml(rating) {
  const n = Number(rating) || 0;
  return `<span class="rf-star-mini-row">${[1, 2, 3, 4, 5].map((i) => `<span class="rf-star-mini ${i <= n ? 'is-filled' : ''}">${starSvg()}</span>`).join('')}</span>`;
}

function roadStageLinkRowsHtml(roadId) {
  const links = arr(STATE.roadStageLinksByRoad[roadId]);
  if (!links.length) return '';
  return `<div class="rf-v2-road-links">${links.map((link) => {
    const stage = link.stages;
    const tripTitle = stage?.trips?.title || 'Trip';
    const stageNo = stage?.order_index ? `Stage ${stage.order_index}` : 'Stage';
    const date = fmtDate(link.link_date);
    return `<div class="rf-v2-road-link-row">${esc(tripTitle)} · ${esc(stageNo)}${date ? ` · ${esc(date)}` : ''}</div>`;
  }).join('')}</div>`;
}

function roadCardHtml(road) {
  const connects = road.connection_from || road.connection_to ? `<div class="rf-v2-road-connects">${esc(road.connection_from || 'Start')} <span class="rf-v2-route-arrow">→</span> ${esc(road.connection_to || 'End')}</div>` : '';
  const notes = road.notes ? `<p class="rf-v2-road-notes">${esc(road.notes)}</p>` : '';
  return `<article class="rf-v2-road-card" data-road-id="${esc(road.id)}"><div class="rf-v2-road-card-head"><strong>${esc(road.road_number_or_name || 'Unnamed road')}</strong>${starRowHtml(road.my_rating)}</div>${connects}${notes}${roadStageLinkRowsHtml(road.id)}<div class="rf-v2-road-card-actions"><button class="rf-d2-btn" data-action="rf-v2-edit-road" data-road-id="${esc(road.id)}" type="button">Edit</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-road" data-road-id="${esc(road.id)}" type="button">Delete</button></div></article>`;
}

export function myRoadsSectionHtml() {
  const roads = arr(STATE.myRoads);
  const body = STATE.myRoadsLoading && !roads.length
    ? '<p class="rf-d2-aside-sub">Loading your roads…</p>'
    : STATE.myRoadsError
      ? `<p class="rf-d2-aside-sub">${esc(STATE.myRoadsError)}</p>`
      : roads.length
        ? `<div class="rf-v2-road-list">${roads.map(roadCardHtml).join('')}</div>`
        : '<p class="rf-d2-aside-sub">Rate a road you have ridden and it shows up here.</p>';
  return `<section class="rf-d2-my-roads"><div class="rf-v2-my-roads-head"><h2>My roads</h2><button class="rf-d2-btn is-primary" data-action="rf-v2-add-road" type="button">+ Add road</button></div><p class="rf-d2-aside-sub">Shared with everyone — your stars decide what's pinned to the top of your list.</p>${body}</section>`;
}

export { fmtEuro };
