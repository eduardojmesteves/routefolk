// ============================================================
// routefolk — screens/wizards/journal-wizard.js
// Journal entry create/edit wizard markup (Route Atlas narrative pattern).
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import {
  selectedEntry,
  field,
  fieldValue,
  row,
  input,
  textarea,
  choiceCards,
  narrativeShellHtml,
  narrativeSection,
  emptyWizard,
} from './wizard-shared.js';

// Full-width tappable type cards (HANDOFF.md: "NOT the old inline
// 3-column button grid"). Tones map onto the app's four available
// accent tones (primary/accent/info/muted) — the token set has no
// distinct hue per entry type, so tones repeat by design.
const ENTRY_TYPE_OPTIONS = [
  { value: 'stop', label: 'Stop', description: 'A viewpoint, a break, a detour', tone: 'primary' },
  { value: 'meal', label: 'Meal', description: 'Where you stopped to eat', tone: 'accent' },
  { value: 'lodging', label: 'Lodging', description: "Where you're staying the night", tone: 'muted' },
  { value: 'note', label: 'Note', description: 'A thought worth remembering', tone: 'info' },
  { value: 'drink', label: 'Drink', description: 'A coffee, a beer, a breather', tone: 'accent' },
  { value: 'other', label: 'Other', description: 'Anything else worth logging', tone: 'muted' },
];
const ENTRY_TYPE_LABELS = Object.fromEntries(ENTRY_TYPE_OPTIONS.map((opt) => [opt.value, opt.label]));

function linkSectionFields(suffix) {
  return [
    row(`entry-location-url${suffix}`, 'Google Maps URL', input(`entry-location-url${suffix}`, '', 'placeholder="https://www.google.com/maps/..."')),
    row(`entry-info-url${suffix}`, 'Website URL', input(`entry-info-url${suffix}`, '', 'placeholder="https://..."')),
    row(`entry-photo-url${suffix}`, 'Photo album URL', input(`entry-photo-url${suffix}`, '', 'placeholder="https://..."')),
  ].join('');
}

function linkSectionFieldsFilled(suffix, entry) {
  return [
    row(`entry-location-url${suffix}`, 'Google Maps URL', input(`entry-location-url${suffix}`, entry.location_url || '', 'placeholder="https://www.google.com/maps/..."')),
    row(`entry-info-url${suffix}`, 'Website URL', input(`entry-info-url${suffix}`, entry.info_url || '', 'placeholder="https://..."')),
    row(`entry-photo-url${suffix}`, 'Photo album URL', input(`entry-photo-url${suffix}`, entry.photo_album_url || '', 'placeholder="https://..."')),
  ].join('');
}

/** Sticky live-preview: the actual Journal entry row this will render as. */
export function journalPreviewHtml(suffix = '') {
  const type = field(`entry-type${suffix}`)?.value || 'note';
  const title = fieldValue(`entry-title${suffix}`) || 'Untitled';
  const place = fieldValue(`entry-place${suffix}`);
  const time = field(`entry-time${suffix}`)?.value || '';
  return `<div class="rf-desktop-entry rf-preview-card"><div class="rf-desktop-entry-bullet">–</div><div><div class="rf-desktop-entry-head"><div class="rf-desktop-entry-type">A ${esc(ENTRY_TYPE_LABELS[type] || 'Note')}</div><div class="rf-desktop-entry-when">${esc(time)}</div></div><div class="rf-desktop-entry-title">${esc(title)}</div><div class="rf-desktop-entry-loc">${place ? `at ${esc(place)}` : ''}</div></div></div>`;
}

export function journalCreateWizardHtml() {
  const type = STATE.journalType || 'note';
  const sections = [
    narrativeSection('entry-section-type', 'What kind of moment is this?', '', choiceCards('entry-type', ENTRY_TYPE_OPTIONS, type)),
    narrativeSection('entry-section-about', 'Tell us about it', '', [
      row('entry-title', 'Title', input('entry-title', '', 'placeholder="e.g. Lunch stop"')),
      `<div class="rf-desktop-form-row-pair">${row('entry-place', 'Place', input('entry-place', '', 'placeholder="Town, restaurant, pass..."'))}${row('entry-time', 'Time', input('entry-time', '', 'type="time"'))}</div>`,
      row('entry-note', 'Description', textarea('entry-note', '', 'placeholder="What happened here?"')),
    ].join('')),
    narrativeSection('entry-section-links', 'Anything to link?', '', linkSectionFields('')),
  ];
  return narrativeShellHtml({
    id: 'rf-entry-create-title',
    kicker: 'New entry',
    title: 'Add a stage note',
    sub: 'Capture stops, meals, lodging, links and anything worth remembering.',
    sections,
    previewLabel: 'Journal preview',
    previewHtml: journalPreviewHtml(''),
    errorId: 'entry-create-error',
    saveAction: 'rf-save-journal',
    saveLabel: 'Save entry',
  });
}

export function journalEditWizardHtml() {
  const entry = selectedEntry();
  if (!entry) return emptyWizard('No journal entry selected.');
  const local = entry.timestamp ? new Date(entry.timestamp) : null;
  const time = local && !Number.isNaN(local.getTime()) ? String(local.getHours()).padStart(2, '0') + ':' + String(local.getMinutes()).padStart(2, '0') : '';
  const sections = [
    narrativeSection('entry-edit-section-type', 'What kind of moment is this?', '', choiceCards('entry-type-edit', ENTRY_TYPE_OPTIONS, entry.entry_type || 'note')),
    narrativeSection('entry-edit-section-about', 'Tell us about it', '', [
      row('entry-title-edit', 'Title', input('entry-title-edit', entry.title || '')),
      `<div class="rf-desktop-form-row-pair">${row('entry-place-edit', 'Place', input('entry-place-edit', entry.location || ''))}${row('entry-time-edit', 'Time', input('entry-time-edit', time, 'type="time"'))}</div>`,
      row('entry-note-edit', 'Description', textarea('entry-note-edit', entry.description || '')),
    ].join('')),
    narrativeSection('entry-edit-section-links', 'Anything to link?', '', linkSectionFieldsFilled('-edit', entry)),
  ];
  return narrativeShellHtml({
    id: 'rf-entry-title',
    kicker: 'Edit entry',
    title: 'Refine the note',
    sub: '',
    sections,
    previewLabel: 'Journal preview',
    previewHtml: journalPreviewHtml('-edit'),
    errorId: 'entry-error',
    saveAction: 'rf-update-entry',
    saveLabel: 'Save entry',
  });
}
