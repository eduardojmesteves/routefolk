// ============================================================
// routefolk — screens/render/trip-detail/packing-desktop.js
// Desktop packing list (items) panel rendering.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import {
  categories,
  items,
  slug,
} from '../shared.js';

const ITEM_FILTERS = [['todo', 'To-do'], ['done', 'Done']];

const rawItems = (tripId) => STATE.itemsByTrip[tripId];

function itemDone(item) { return item?.status === 'packed'; }
function itemTodo(item) { return !itemDone(item); }
function itemFilter() { return STATE.itemStatusFilter === 'done' ? 'done' : 'todo'; }
function itemCompletionLabel(item) { return itemDone(item) ? 'Done' : 'To-do'; }
function itemCompletionClass(item) { return itemDone(item) ? 'is-done' : 'is-todo'; }
function itemGroupForCategory(all, categoryKey) {
  return all.filter((item) => slug(item.category?.name || item.category_name || 'Other') === categoryKey);
}

function itemCatRow(cat, index, selected, all) {
  const key = slug(cat.name);
  const group = itemGroupForCategory(all, key);
  const done = group.filter(itemDone).length;
  const todo = group.length - done;
  const expanded = key === selected;
  return `<div class="rf-item-cat-block ${expanded ? 'is-selected' : ''}"><button class="rf-desktop-item-cat-row ${expanded ? 'is-selected' : ''}" data-action="rf-desktop-select-category" data-category="${esc(key)}" type="button"><span>${index + 1}</span><strong>${esc(cat.name)}</strong><span class="rf-desktop-item-progress"><i style="width:${group.length ? Math.round((done / group.length) * 100) : 0}%"></i></span><span>${todo} left · ${done} done</span><span>›</span></button>${expanded && group.length ? `<div class="rf-cat-preview">${group.slice(0, 5).map((item) => `<div class="rf-cat-preview-row ${itemCompletionClass(item)}"><span>${itemDone(item) ? '✓' : '○'}</span><strong>${esc(item.name)}</strong><small>${itemCompletionLabel(item)}${item.status === 'optional' ? ' · optional' : ''}</small></div>`).join('')}${group.length > 5 ? `<div class="rf-cat-preview-more">+ ${group.length - 5} more</div>` : ''}</div>` : ''}</div>`;
}

function itemRow(item) {
  return `<article class="rf-item-card ${itemCompletionClass(item)}"><button class="rf-item-check" data-action="rf-desktop-toggle-item" data-item-id="${esc(item.id)}" type="button" aria-label="Toggle packed state">${itemDone(item) ? '✓' : ''}</button><div class="rf-item-body"><div class="rf-item-card-head"><strong>${esc(item.name)}</strong><span class="rf-completion-pill ${itemCompletionClass(item)}">${itemCompletionLabel(item)}</span></div>${item.notes ? `<small>${esc(item.notes)}</small>` : ''}${item.status === 'optional' ? '<em>Optional</em>' : ''}<div class="rf-item-actions"><button class="rf-desktop-btn" data-action="rf-edit-item" data-item-id="${esc(item.id)}" type="button">Edit</button><button class="rf-desktop-btn is-danger" data-action="rf-delete-item" data-item-id="${esc(item.id)}" type="button">Delete</button></div></div></article>`;
}

function itemForm(cs) {
  return `<form class="rf-desktop-quick-form rf-item-form" data-action="rf-desktop-item-form"><input class="rf-desktop-input" name="text" placeholder="e.g. Rain gloves"><select class="rf-desktop-input" name="category_id">${cs.map((cat) => `<option value="${esc(cat.id || '')}">${esc(cat.name)}</option>`).join('')}</select><button class="rf-desktop-btn is-primary" type="submit">Add item</button></form>`;
}

export function renderItems(trip, { hero, tabs, stamp, filters, loadingHtml }) {
  const raw = rawItems(trip.id);
  if (raw === 'loading' || STATE.itemsLoading) {
    return `<main class="rf-desktop-main">${hero(trip)}${tabs('items')}${loadingHtml('Loading items…')}</main><aside class="rf-desktop-aside">${loadingHtml('Loading category…')}</aside>`;
  }
  const all = items(trip.id);
  const cs = categories(trip.id);
  const selected = STATE.selectedCategoryKey || slug(cs[0]?.name);
  const selectedCat = cs.find((cat) => slug(cat.name) === selected);
  const filter = itemFilter();
  const group = itemGroupForCategory(all, selected).filter((item) => filter === 'done' ? itemDone(item) : itemTodo(item));
  const done = all.filter(itemDone).length;
  const todo = all.length - done;
  return `<main class="rf-desktop-main">${hero(trip)}${tabs('items')}<div class="rf-desktop-items-hero rf-items-hero"><div><div class="rf-desktop-ledger-label">The packing list</div><div class="rf-desktop-items-big">${done} <span>of ${all.length} packed</span></div>${stamp(`${todo} left · ${done} done`)}</div><button class="rf-desktop-btn is-primary" data-action="rf-desktop-add-item" type="button">+ Add item</button></div><div class="rf-desktop-section-head"><div class="rf-desktop-section-title">Categories</div></div><div class="rf-desktop-item-cats rf-item-cats">${cs.map((cat, i) => itemCatRow(cat, i, selected, all)).join('')}</div></main><aside class="rf-desktop-aside rf-items-aside"><div class="rf-desktop-aside-head"><div class="rf-desktop-aside-kicker">Category</div><h2 class="rf-desktop-aside-title">${esc(selectedCat?.name || 'Items')}</h2><div class="rf-desktop-aside-sub">${esc(group.length)} ${filter === 'done' ? 'done' : 'to-do'} item${group.length === 1 ? '' : 's'}</div></div>${filters(ITEM_FILTERS, filter, 'item-filter')}${STATE.wizard === 'item' ? itemForm(cs) : ''}<div class="rf-desktop-item-list rf-item-list">${group.map(itemRow).join('') || `<div class="rf-desktop-empty">No ${filter === 'done' ? 'done' : 'to-do'} items here.</div>`}</div></aside>`;
}
