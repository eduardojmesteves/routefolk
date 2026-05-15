// ============================================================
// routefolk — screens/packing-screen.js
// Local-only trip packing list.
// ============================================================

import { esc } from '../utils/dom.js';

const CATEGORIES = ['Clothing', 'Luggage', 'Tools', 'Gear', 'Documents', 'First-Aid', 'Other'];
const STATUSES = [
  { key: 'planned', label: 'Planned' },
  { key: 'packed', label: 'Packed' },
  { key: 'optional', label: 'Optional' },
  { key: 'assigned', label: 'Assigned' },
];

const keyFor = (tripId) => `rf-packing-${tripId}`;

export function readPackingItems(tripId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(tripId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePackingItems(tripId, items) {
  localStorage.setItem(keyFor(tripId), JSON.stringify(items));
}

function newId() {
  return crypto?.randomUUID ? crypto.randomUUID() : `pack-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function addPackingItem(tripId, fields) {
  const text = String(fields.text || '').trim();
  if (!text) return;
  const items = readPackingItems(tripId);
  items.push({
    id: newId(),
    text,
    category: CATEGORIES.includes(fields.category) ? fields.category : 'Other',
    status: STATUSES.some((s) => s.key === fields.status) ? fields.status : 'planned',
    assignedTo: fields.assignedTo || null,
  });
  savePackingItems(tripId, items);
}

export function togglePackingItem(tripId, itemId) {
  savePackingItems(tripId, readPackingItems(tripId).map((item) => (
    item.id === itemId ? { ...item, status: item.status === 'packed' ? 'planned' : 'packed' } : item
  )));
}

export function deletePackingItem(tripId, itemId) {
  savePackingItems(tripId, readPackingItems(tripId).filter((item) => item.id !== itemId));
}

function statusLabel(status) {
  return STATUSES.find((s) => s.key === status)?.label || 'Planned';
}

function itemRowHtml(item) {
  return `
    <div class="rf-packing__item ${item.status === 'packed' ? 'is-packed' : ''}" data-item-id="${esc(item.id)}">
      <button class="rf-packing__check" data-pack-toggle="${esc(item.id)}" type="button">${item.status === 'packed' ? '✓' : '○'}</button>
      <span class="rf-packing__text">${esc(item.text)}</span>
      <span class="rf-packing__badge rf-packing__badge--${esc(item.status)}">${esc(statusLabel(item.status))}</span>
      <button class="rf-packing__del" data-pack-delete="${esc(item.id)}" type="button">×</button>
    </div>
  `;
}

function addFormHtml() {
  return `
    <form class="rf-packing__form" id="packingForm">
      <label class="form-label" for="packingText">New item</label>
      <input class="rf-field" id="packingText" name="text" type="text" placeholder="e.g. Rain gloves" required>
      <div class="rf-packing__form-grid">
        <div>
          <label class="form-label" for="packingCategory">Category</label>
          <select class="rf-field" id="packingCategory" name="category">
            ${CATEGORIES.map((cat) => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label" for="packingStatus">Status</label>
          <select class="rf-field" id="packingStatus" name="status">
            ${STATUSES.map((status) => `<option value="${esc(status.key)}">${esc(status.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Add item</button>
    </form>
  `;
}

export function renderPackingScreen(trip) {
  const items = readPackingItems(trip.id);
  const groups = CATEGORIES.map((category) => ({ category, items: items.filter((i) => (i.category || 'Other') === category) }))
    .filter((group) => group.items.length);

  return `
    <section class="rf-packing">
      <div class="rf-packing__header">
        <div>
          <div class="rf-kicker">Trip kit</div>
          <div class="rf-section-title">Packing list</div>
          <div class="form-help">Local to this browser for now. Use it for clothing, tools, documents, camera gear, and shared trip ideas.</div>
        </div>
      </div>
      ${addFormHtml()}
      <div class="rf-packing__groups">
        ${groups.length ? groups.map((group) => `
          <div class="rf-packing__group">
            <div class="rf-packing__cat">${esc(group.category)}</div>
            ${group.items.map(itemRowHtml).join('')}
          </div>
        `).join('') : '<div class="empty-sub">No packing items yet.</div>'}
      </div>
    </section>
  `;
}
