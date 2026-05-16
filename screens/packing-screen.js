// ============================================================
// routefolk — screens/packing-screen.js
// Supabase-backed trip packing list MVP.
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

function itemRowHtml(item) {
  const assigned = item.assigned_to ? displayNameForUserId(item.assigned_to) : '';
  return `
    <div class="rf-packing__item ${item.status === 'packed' ? 'is-packed' : ''}" data-item-id="${esc(item.id)}">
      <button class="rf-packing__check" data-pack-toggle="${esc(item.id)}" type="button" aria-label="Toggle packed status">
        ${item.status === 'packed' ? '✓' : '○'}
      </button>
      <span class="rf-packing__text">
        ${esc(item.name)}
        ${item.notes ? `<small>${esc(item.notes)}</small>` : ''}
        ${assigned ? `<small>Assigned to ${esc(assigned)}</small>` : ''}
      </span>
      <span class="rf-packing__badge rf-packing__badge--${esc(item.status)}">${esc(statusLabel(item.status))}</span>
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
      <label class="form-label" for="packingText">New item</label>
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
      <button class="btn btn-primary btn-block" type="submit" ${disabled ? 'disabled' : ''}>Add item</button>
    </form>
  `;
}

export function renderPackingScreen(trip) {
  const rawItems = STATE.itemsByTrip[trip.id];
  const rawCategories = STATE.itemCategoriesByTrip[trip.id];
  const loading = rawItems === 'loading' || rawCategories === 'loading' || STATE.itemsLoading;
  const categories = categoriesForTrip(trip.id);
  const items = itemsForTrip(trip.id);
  const groups = (categories.length ? categories.map((category) => category.name) : DEFAULT_ITEM_CATEGORIES)
    .map((category) => ({ category, items: items.filter((item) => categoryName(item) === category) }))
    .filter((group) => group.items.length);

  return `
    <section class="rf-packing">
      <div class="rf-packing__header">
        <div>
          <div class="rf-kicker">Trip kit</div>
          <div class="rf-section-title">Packing list</div>
          <div class="form-help">Shared MVP list for clothing, tools, documents, camera gear, and other trip essentials. Keep it simple; richer templates can come later.</div>
        </div>
      </div>
      ${STATE.itemsError ? `<div class="stage-warn" style="margin-bottom:10px;">${esc(STATE.itemsError)}</div>` : ''}
      ${addFormHtml(categories, loading || STATE.isOnline === false)}
      <div class="rf-packing__groups">
        ${loading ? '<div class="empty-sub">Loading packing items…</div>' : ''}
        ${!loading && groups.length ? groups.map((group) => `
          <div class="rf-packing__group">
            <div class="rf-packing__cat">${esc(group.category)}</div>
            ${group.items.map(itemRowHtml).join('')}
          </div>
        `).join('') : ''}
        ${!loading && !groups.length ? '<div class="empty-sub">No packing items yet.</div>' : ''}
      </div>
    </section>
  `;
}
