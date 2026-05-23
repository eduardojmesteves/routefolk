// ============================================================
// routefolk — screens/wizards/stage-wizard.js
// Stage create/edit wizard markup.
// ============================================================

import {
  selectedStage,
  panelHtml,
  row,
  pair,
  input,
  textarea,
  emptyWizard,
} from './wizard-shared.js';

export function stageCreateWizardHtml() {
  return panelHtml({ id: 'rf-v2-stage-create-title', kicker: 'New stage', title: 'Add a route leg', sub: 'Add the route basics now. Coordinates and weather are resolved after saving.', errorId: 'v2-stage-create-error', saveAction: 'rf-v2-save-stage', saveLabel: 'Save stage', body: [row('v2-stage-from', 'From', input('v2-stage-from', '', 'placeholder="Aveiro"')), row('v2-stage-to', 'To', input('v2-stage-to', '', 'placeholder="Ávila"')), pair(row('v2-stage-date', 'Date', input('v2-stage-date', '', 'type="date"')), row('v2-stage-km', 'Distance km', input('v2-stage-km', '', 'inputmode="decimal" placeholder="410"'))), row('v2-stage-notes', 'Notes', textarea('v2-stage-notes', '', 'placeholder="Motorway, mountain pass, long stage..."'))].join('') });
}

export function stageEditWizardHtml() {
  const stage = selectedStage();
  if (!stage) return emptyWizard('No stage selected.');
  return panelHtml({ id: 'rf-v2-stage-title', kicker: 'Edit stage', title: 'Adjust the route leg', sub: 'Changing locations can refresh stored coordinates and weather.', errorId: 'v2-stage-error', saveAction: 'rf-v2-update-stage', saveLabel: 'Save stage', body: [row('v2-stage-from-edit', 'From', input('v2-stage-from-edit', stage.start_location || '')), row('v2-stage-to-edit', 'To', input('v2-stage-to-edit', stage.end_location || '')), pair(row('v2-stage-date-edit', 'Date', input('v2-stage-date-edit', stage.planned_date || '', 'type="date"')), row('v2-stage-km-edit', 'Distance km', input('v2-stage-km-edit', stage.distance_km ?? '', 'inputmode="decimal"'))), row('v2-stage-route-edit', 'Custom Google Maps URL', input('v2-stage-route-edit', stage.custom_route_url || '', 'placeholder="https://www.google.com/maps/..."')), row('v2-stage-notes-edit', 'Notes', textarea('v2-stage-notes-edit', stage.notes || ''))].join('') });
}
