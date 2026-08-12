// ============================================================
// routefolk — screens/wizards/item-wizard.js
// Packing item create/edit wizard markup (Route Atlas narrative
// pattern) plus its write payload.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import {
  activeTrip,
  selectedItem,
  categoriesForTrip,
  field,
  fieldValue,
  row,
  input,
  textarea,
  select,
  choiceCards,
  slug,
  narrativeShellHtml,
  narrativeSection,
  emptyWizard,
} from './wizard-shared.js';

// "Is it settled?" (HANDOFF.md): To-do vs Optional. The third real status,
// 'packed', is toggled from the packing list's own checkbox (rf-desktop-toggle
// -item / rf-mobile-toggle-item), not through this wizard — so it isn't one of
// the choice-cards, but editing an already-packed item and saving without
// touching this section leaves its status untouched (hidden field keeps
// whatever value was rendered in).
const STATUS_OPTIONS = [
  { value: 'planned', label: 'To-do', description: 'Still needs sorting', tone: 'primary' },
  { value: 'optional', label: 'Optional', description: "Nice to have, not required", tone: 'muted' },
];
const STATUS_LABELS = { planned: 'To-do', packed: 'Done', optional: 'Optional' };

/** Sticky live-preview: the actual packing-list row this item will render as. */
export function itemPreviewHtml() {
  const trip = activeTrip();
  const name = fieldValue('item-text') || 'Untitled item';
  const status = field('item-status')?.value || 'planned';
  const categoryId = field('item-category')?.value || '';
  const category = trip ? categoriesForTrip(trip.id).find((cat) => cat.id === categoryId) : null;
  return `<article class="rf-item-card rf-preview-card"><span class="rf-item-check">${status === 'packed' ? '✓' : ''}</span><div class="rf-item-body"><div class="rf-item-card-head"><strong>${esc(name)}</strong><span class="rf-completion-pill">${esc(STATUS_LABELS[status] || 'To-do')}</span></div>${category ? `<small>${esc(category.name)}</small>` : ''}</div></article>`;
}

export function itemWizardHtml(editing = false) {
  const trip = activeTrip();
  const item = editing ? selectedItem() : null;
  if (editing && !item) return emptyWizard('No packing item selected.');
  const cats = trip ? categoriesForTrip(trip.id) : [];
  const selectedCategoryId = item?.category_id || cats.find((cat) => STATE.selectedCategoryKey && slug(cat.name) === STATE.selectedCategoryKey)?.id || cats[0]?.id || '';
  const status = item?.status || 'planned';

  const sections = [
    narrativeSection('item-section-what', 'What is it?', '', row('item-text', 'Item', input('item-text', item?.name || '', 'placeholder="e.g. Rain gloves"'))),
    narrativeSection('item-section-kind', 'What kind of item?', '', [
      row('item-category', 'Category', select('item-category', cats.map((cat) => `<option value="${esc(cat.id || '')}" ${selectedCategoryId === cat.id ? 'selected' : ''}>${esc(cat.name)}</option>`).join(''))),
      row('item-notes', 'Notes', textarea('item-notes', item?.notes || '', 'placeholder="Optional detail"')),
    ].join('')),
    narrativeSection('item-section-settled', 'Is it settled?', '', choiceCards('item-status', STATUS_OPTIONS, status)),
  ];

  return narrativeShellHtml({
    id: 'rf-item-title',
    kicker: editing ? 'Edit item' : 'New item',
    title: editing ? 'Update packing item' : 'Add to the packing list',
    sub: 'Use this for equipment, documents, clothing and trip-specific preparation.',
    sections,
    previewLabel: 'Packing list preview',
    previewHtml: itemPreviewHtml(),
    errorId: 'item-error',
    saveAction: editing ? 'rf-update-item' : 'rf-save-item',
    saveLabel: editing ? 'Save item' : 'Add item',
  });
}

export function itemPayload() {
  return {
    text: fieldValue('item-text'),
    category_id: field('item-category')?.value || null,
    status: field('item-status')?.value || 'planned',
    notes: fieldValue('item-notes'),
  };
}
