// ============================================================
// routefolk — screens/wizards/journal-wizard.js
// Journal entry create/edit wizard markup.
// ============================================================

import { STATE } from '../../state/app-state.js';
import {
  selectedEntry,
  panelHtml,
  row,
  pair,
  input,
  textarea,
  select,
  option,
  emptyWizard,
} from './wizard-shared.js';

export function journalCreateWizardHtml() {
  return panelHtml({ id: 'rf-v2-entry-create-title', kicker: 'New entry', title: 'Add a stage note', sub: 'Capture stops, meals, lodging, links and anything worth remembering.', errorId: 'v2-entry-create-error', saveAction: 'rf-v2-save-journal', saveLabel: 'Save entry', body: [row('v2-entry-type', 'Type', select('v2-entry-type', `${option('note', 'Note', STATE.journalType || 'note')}${option('stop', 'Stop', STATE.journalType)}${option('meal', 'Meal', STATE.journalType)}${option('drink', 'Drink', STATE.journalType)}${option('lodging', 'Lodging', STATE.journalType)}${option('other', 'Other', STATE.journalType)}`)), row('v2-entry-title', 'Title', input('v2-entry-title', '', 'placeholder="e.g. Lunch stop"')), pair(row('v2-entry-place', 'Place', input('v2-entry-place', '', 'placeholder="Town, restaurant, pass..."')), row('v2-entry-time', 'Time', input('v2-entry-time', '', 'type="time"'))), row('v2-entry-note', 'Description', textarea('v2-entry-note', '', 'placeholder="What happened here?"'))].join('') });
}

export function journalEditWizardHtml() {
  const entry = selectedEntry();
  if (!entry) return emptyWizard('No journal entry selected.');
  const local = entry.timestamp ? new Date(entry.timestamp) : null;
  const time = local && !Number.isNaN(local.getTime()) ? String(local.getHours()).padStart(2, '0') + ':' + String(local.getMinutes()).padStart(2, '0') : '';
  return panelHtml({ id: 'rf-v2-entry-title', kicker: 'Edit entry', title: 'Refine the note', errorId: 'v2-entry-error', saveAction: 'rf-v2-update-entry', saveLabel: 'Save entry', body: [row('v2-entry-type-edit', 'Type', select('v2-entry-type-edit', `${option('note', 'Note', entry.entry_type)}${option('stop', 'Stop', entry.entry_type)}${option('meal', 'Meal', entry.entry_type)}${option('drink', 'Drink', entry.entry_type)}${option('lodging', 'Lodging', entry.entry_type)}${option('other', 'Other', entry.entry_type)}`)), row('v2-entry-title-edit', 'Title', input('v2-entry-title-edit', entry.title || '')), pair(row('v2-entry-place-edit', 'Place', input('v2-entry-place-edit', entry.location || '')), row('v2-entry-time-edit', 'Time', input('v2-entry-time-edit', time, 'type="time"'))), row('v2-entry-note-edit', 'Description', textarea('v2-entry-note-edit', entry.description || '')), row('v2-entry-location-url-edit', 'Maps URL', input('v2-entry-location-url-edit', entry.location_url || '', 'placeholder="https://www.google.com/maps/..."'))].join('') });
}
