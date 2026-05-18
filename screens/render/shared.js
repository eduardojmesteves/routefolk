// ============================================================
// routefolk — screens/render/shared.js
// Shared formatting, selection, metrics and small HTML helpers
// used by the transitional desktop/mobile render layers.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import { fmtDateRange } from '../../utils/datetime.js';
import { fmtEuro } from '../../utils/format.js';
import { EXPENSE_CATEGORY_META } from '../../constants/app-constants.js';
import { displayNameForUserId } from '../../utils/user.js';

export const DETAIL_TABS = [['stages', 'Stages'], ['summary', 'Summary'], ['costs', 'Costs'], ['items', 'Items']];
export const ARCHIVE_FILTERS = [['all', 'All'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
export const PALETTES = [
  ['midnight', 'Ink & Rust', 'Cool cream · ink · rust'],
  ['forest', 'Forest & Ochre', 'Warm cream · forest · ochre'],
  ['oxblood', 'Slate & Bordeaux', 'Warm white · slate · bordeaux'],
  ['alpine', 'Graphite & Sun', 'Soft beige · graphite · sun'],
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

export function palettePanel() {
  const active = currentPalette();
  return `<section class="rf-clean-pref"><h2>App colour</h2>${PALETTES.map(([key, label, sub]) => `<button class="${active === key ? 'is-active' : ''}" data-action="rf-palette-select" data-palette="${esc(key)}"><strong>${esc(label)}</strong><small>${esc(sub)}</small></button>`).join('')}</section>`;
}

export { fmtEuro };
