// ============================================================
// routefolk — screens/render/trip-detail/packing-mobile.js
// Mobile packing list (items) panel rendering.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import {
  categories,
  items,
  slug,
} from '../shared.js';

const ITEM_VIEWS = [['list', 'List'], ['categories', 'Categories']];

function itemDone(item) { return item?.status === 'packed'; }
function itemTodo(item) { return !itemDone(item); }
function itemFilter() { return STATE.itemStatusFilter === 'done' ? 'done' : 'todo'; }
function itemView() { return STATE.itemViewMode === 'categories' ? 'categories' : 'list'; }
function itemCompletionLabel(item) { return itemDone(item) ? 'Done' : 'To-do'; }
function itemCategoryKey(item) { return slug(item.category?.name || item.category_name || 'Other'); }
function itemGroupForCategory(all, categoryKey) { return all.filter((item) => itemCategoryKey(item) === categoryKey); }

export function renderMobileItems(trip, { screen, tripHeader }) {
  const all = items(trip.id);
  const cats = categories(trip.id);
  const selected = STATE.selectedCategoryKey || slug(cats[0]?.name);
  const filter = itemFilter();
  const view = itemView();
  const done = all.filter(itemDone).length;
  const todo = all.length - done;
  const filteredItems = all.filter((item) => filter === 'done' ? itemDone(item) : itemTodo(item));
  const viewToggle = `<div class="rf-clean-view-toggle">${ITEM_VIEWS.map(([key, label]) => `<button class="${view === key ? 'is-active' : ''}" data-action="rf-m2-item-view" data-value="${key}">${label}</button>`).join('')}</div>`;
  const categoryList = `<h2>Categories</h2><div class="rf-clean-card-list">${cats.map((cat, index) => { const key = slug(cat.name); const rows = itemGroupForCategory(all, key); const catDone = rows.filter(itemDone).length; const catTodo = rows.length - catDone; return `<button class="rf-clean-category ${selected === key ? 'is-active' : ''}" data-action="rf-m2-select-category" data-category="${esc(key)}"><span>${index + 1}</span><strong>${esc(cat.name)}</strong><b>${catTodo} left · ${catDone} done</b></button>${selected === key && rows.length ? `<div class="rf-clean-category-preview">${rows.slice(0, 4).map((item) => `<span>${itemDone(item) ? '✓' : '○'} ${esc(item.name)}</span>`).join('')}</div>` : ''}`; }).join('')}</div>`;
  const itemList = `<div class="rf-clean-section-head rf-clean-item-list-head"><h2>Items</h2><div class="rf-clean-mini-pills"><button class="${filter === 'todo' ? 'is-active' : ''}" data-action="rf-m2-item-filter" data-value="todo">To-do</button><button class="${filter === 'done' ? 'is-active' : ''}" data-action="rf-m2-item-filter" data-value="done">Done</button></div></div><div class="rf-clean-card-list">${filteredItems.map((item) => `<article class="rf-clean-item-card ${itemDone(item) ? 'is-done' : 'is-todo'}"><button class="rf-clean-item-check" data-action="rf-m2-toggle-item" data-item-id="${esc(item.id)}">${itemDone(item) ? '✓' : ''}</button><div><strong>${esc(item.name)}</strong><small>${itemCompletionLabel(item)}${item.status === 'optional' ? ' · optional' : ''}</small></div><div class="rf-clean-actions"><button data-action="rf-m2-edit-item" data-item-id="${esc(item.id)}">Edit</button><button data-action="rf-m2-delete-item" data-item-id="${esc(item.id)}">Delete</button></div></article>`).join('') || `<div class="rf-clean-empty">No ${filter === 'done' ? 'done' : 'to-do'} items yet.</div>`}</div>`;
  return screen(`${tripHeader(trip, 'items')}<main class="rf-clean-page"><section class="rf-clean-ledger rf-clean-items-ledger"><div><small>The packing list</small><strong>${done}<span> / ${all.length}</span></strong><span>${todo} left · ${done} done</span></div><button data-action="rf-m2-add-item">+ Add item</button></section>${view === 'categories' ? categoryList : itemList}${viewToggle}</main>`);
}
