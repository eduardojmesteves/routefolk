// ============================================================
// routefolk — screens/wizards/item-wizard.js
// Packing item create/edit wizard markup plus its write payload.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import {
  activeTrip,
  selectedItem,
  categoriesForTrip,
  field,
  fieldValue,
  panelHtml,
  row,
  pair,
  input,
  textarea,
  select,
  option,
  slug,
  emptyWizard,
} from './wizard-shared.js';

export function itemWizardHtml(editing = false) {
  const trip = activeTrip();
  const item = editing ? selectedItem() : null;
  if (editing && !item) return emptyWizard('No packing item selected.');
  const cats = trip ? categoriesForTrip(trip.id) : [];
  const selectedCategoryId = item?.category_id || cats.find((cat) => STATE.selectedCategoryKey && slug(cat.name) === STATE.selectedCategoryKey)?.id || cats[0]?.id || '';
  return panelHtml({ id: 'rf-v2-item-title', kicker: editing ? 'Edit item' : 'New item', title: editing ? 'Update packing item' : 'Add to the packing list', sub: 'Use this for equipment, documents, clothing and trip-specific preparation.', errorId: 'v2-item-error', saveAction: editing ? 'rf-v2-update-item' : 'rf-v2-save-item', saveLabel: editing ? 'Save item' : 'Add item', body: [row('v2-item-text', 'Item', input('v2-item-text', item?.name || '', 'placeholder="e.g. Rain gloves"')), pair(row('v2-item-category', 'Category', select('v2-item-category', cats.map((cat) => `<option value="${esc(cat.id || '')}" ${selectedCategoryId === cat.id ? 'selected' : ''}>${esc(cat.name)}</option>`).join(''))), row('v2-item-status', 'Status', select('v2-item-status', `${option('planned', 'To-do', item?.status || 'planned')}${option('packed', 'Done', item?.status)}${option('optional', 'Optional', item?.status)}`))), row('v2-item-notes', 'Notes', textarea('v2-item-notes', item?.notes || '', 'placeholder="Optional detail"'))].join('') });
}

export function itemPayload() {
  return {
    text: fieldValue('v2-item-text'),
    category_id: field('v2-item-category')?.value || null,
    status: field('v2-item-status')?.value || 'planned',
    notes: fieldValue('v2-item-notes'),
  };
}
