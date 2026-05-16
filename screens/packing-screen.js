// ============================================================
// routefolk — screens/packing-screen.js
// Supabase-backed trip packing list MVP.
// Screenshot fidelity pass: category progress first, form second.
// ============================================================

import { STATE } from '../state/app-state.js';
import { DEFAULT_ITEM_CATEGORIES } from '../lib/items.js';
import { esc } from '../utils/dom.js';
import { displayNameForUserId } from '../utils/user.js';

const STATUSES = [
  { key: 'planned', label: 'Planned' },
  { key: 'packed', label: 'Packed' },
  { key: 'optional', label: 'Optional' },
];

function categoriesForTrip(tripId) {
  const categories = STATE.itemCategoriesByTrip[tripId];
  return Array.isArray(categories) ? categories : [];
}

function itemsForTrip(tripId) {
  const items = STATE.itemsByTrip[tripId];
  return Array.isArray(items) ? items : [];
}

function statusLabel(status) {
  return STATUSES.find((s) => s.key === status)?.label || 'Planned';
}

function categoryName(item) {
  return item.category?.name || 'Other';
}

function categoryList(categories) {
  const names = categories.length ? categories.map((category) => category.name) : DEFAULT_ITEM_CATEGORIES;
  return names.length ? names : ['Other'];
}

function categoryStats(items, name) {
  const categoryItems = items.filter((item) => categoryName(item) === name);
  const packed = categoryItems.filter((item) => item.status === 'packed').length;
  const planned = categoryItems.filter((item) => item.status === 'planned').length;
  const optional = categoryItems.filter((item) => item.status === 'optional').length;
  const total = categoryItems.length;
  const pct = total ? Math.round((packed / total) * 100) : 0;
  return { categoryItems, packed, planned, optional, total, pct };
}

function contributorCount(items) {
  const people = new Set(items.map((item) => item.assigned_to || item.created_by).filter(Boolean));
  return people.size || (items.length ? 1 : 0);
}

function itemRowHtml(item) {
  const assigned = item.assigned_to ? displayNameForUserId(item.assigned_to) : '';
  return `
    <div class="rf-packing__item ${item.status === 'packed' ? 'is-packed' : ''}" data-item-id="${esc(item.id)}">
      <button class="rf-packing__check" data-pack-toggle="${esc(item.id)}" type="button" aria-label="Toggle packed status">
        ${item.status === 'packed' ? '✓' : ''}
      </button>
      <span class="rf-packing__text">
        ${esc(item.name)}
        ${item.notes ? `<small>${esc(item.notes)}</small>` : ''}
        ${assigned ? `<small>${esc(assigned)}</small>` : ''}
      </span>
      <span class="rf-packing__badge rf-packing__badge--${esc(item.status)}"><span class="dot"></span>${esc(statusLabel(item.status))}</span>
      <button class="rf-packing__del" data-pack-delete="${esc(item.id)}" type="button" aria-label="Delete item">×</button>
    </div>
  `;
}

function categoryOptionsHtml(categories) {
  if (categories.length) {
    return categories.map((cat) => `<option value="${esc(cat.id)}">${esc(cat.name)}</option>`).join('');
  }
  return DEFAULT_ITEM_CATEGORIES.map((name) => `<option value="">${esc(name)}</option>`).join('');
}

function addFormHtml(categories, disabled = false) {
  return `
    <form class="rf-packing__form" id="packingForm">
      <div class="rf-packing__form-title">Add an item or suggestion</div>
      <label class="form-label" for="packingText">Item</label>
      <input class="rf-field" id="packingText" name="text" type="text" placeholder="e.g. Rain gloves" required ${disabled ? 'disabled' : ''}>
      <div class="rf-packing__form-grid">
        <div>
          <label class="form-label" for="packingCategory">Category</label>
          <select class="rf-field" id="packingCategory" name="category_id" ${disabled ? 'disabled' : ''}>
            ${categoryOptionsHtml(categories)}
          </select>
        </div>
        <div>
          <label class="form-label" for="packingStatus">Status</label>
          <select class="rf-field" id="packingStatus" name="status" ${disabled ? 'disabled' : ''}>
            ${STATUSES.map((status) => `<option value="${esc(status.key)}">${esc(status.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      <label class="form-label" for="packingNotes">Notes</label>
      <input class="rf-field" id="packingNotes" name="notes" type="text" placeholder="Optional note" ${disabled ? 'disabled' : ''}>
      <button class="btn btn-primary btn-block" type="submit" ${disabled ? 'disabled' : ''}>+ Add item</button>
    </form>
  `;
}

function packingHeroHtml(items) {
  const packed = items.filter((item) => item.status === 'packed').length;
  const total = items.length;
  const pct = total ? Math.round((packed / total) * 100) : 0;
  const optional = items.filter((item) => item.status === 'optional').length;
  return `
    <div class="rf-packing__hero">
      <div>
        <div class="rf-packing__lede">The packing list</div>
        <div class="rf-packing__big">${esc(packed)} <span>of ${esc(total || 0)} packed</span></div>
      </div>
      <div class="rf-packing__heroBar" aria-hidden="true"><span style="width:${esc(String(pct))}%"></span></div>
      <div class="rf-packing__heroMeta">
        <span>${esc(contributorCount(items))} riders contributing</span>
        <span>${esc(optional)} optional</span>
      </div>
    </div>
  `;
}

function categoryRowsHtml(categories, items) {
  const names = categoryList(categories);
  return `
    <section class="rf-packing__categories">
      <h2 class="rf-packing__sectionTitle">Categories</h2>
      <div class="rf-packing__categoryCard">
        ${names.map((name, index) => {
          const stats = categoryStats(items, name);
          return `
            <button class="rf-packing__catRow" type="button" data-pack-category="${esc(name)}">
              <span class="rf-packing__catIndex">${esc(index + 1)}</span>
              <span class="rf-packing__catName">${esc(name)}</span>
              <span class="rf-packing__progress"><span style="width:${esc(String(stats.pct))}%"></span></span>
              <span class="rf-packing__catCount">${esc(stats.packed)} / ${esc(stats.total)} packed</span>
              <span class="rf-packing__chev">›</span>
            </button>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function groupedItemsHtml(categories, items) {
  const groups = categoryList(categories)
    .map((category) => ({ category, stats: categoryStats(items, category) }))
    .filter((group) => group.stats.categoryItems.length);

  return `
    <div class="rf-packing__groups">
      ${groups.length ? groups.map((group) => `
        <div class="rf-packing__group">
          <div class="rf-packing__cat">${esc(group.category)} <small>${esc(group.stats.packed)} packed · ${esc(group.stats.planned)} planned · ${esc(group.stats.optional)} optional</small></div>
          ${group.stats.categoryItems.map(itemRowHtml).join('')}
        </div>
      `).join('') : '<div class="empty-sub">No packing items yet.</div>'}
    </div>
  `;
}

export function renderPackingScreen(trip) {
  const rawItems = STATE.itemsByTrip[trip.id];
  const rawCategories = STATE.itemCategoriesByTrip[trip.id];
  const loading = rawItems === 'loading' || rawCategories === 'loading' || STATE.itemsLoading;
  const categories = categoriesForTrip(trip.id);
  const items = itemsForTrip(trip.id);

  return `
    <section class="rf-packing">
      ${STATE.itemsError ? `<div class="stage-warn" style="margin-bottom:10px;">${esc(STATE.itemsError)}</div>` : ''}
      ${loading ? '<div class="empty-sub">Loading packing items…</div>' : `
        ${packingHeroHtml(items)}
        ${categoryRowsHtml(categories, items)}
        ${groupedItemsHtml(categories, items)}
      `}
      ${addFormHtml(categories, loading || STATE.isOnline === false)}
    </section>
  `;
}
