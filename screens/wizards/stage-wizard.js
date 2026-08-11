// ============================================================
// routefolk — screens/wizards/stage-wizard.js
// Stage create/edit wizard markup (Route Atlas narrative pattern).
// ============================================================

import { esc } from '../../utils/dom.js';
import { fmtDate } from '../../utils/datetime.js';
import {
  selectedStage,
  byId,
  field,
  fieldValue,
  row,
  input,
  textarea,
  connectedRouteRow,
  narrativeShellHtml,
  narrativeSection,
  emptyWizard,
} from './wizard-shared.js';

function rideTimeLabel(distanceKm) {
  const km = Number(distanceKm);
  if (!km || km <= 0) return '';
  const hours = km / 60;
  const label = hours < 1 ? `${Math.round(hours * 60)} min` : `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
  return `≈${label} on the road`;
}

/** Re-renders the "≈Xh on the road" chip next to the distance field. */
export function refreshStageRideTimeChip() {
  const chip = byId('v2-stage-ride-time');
  if (!chip) return;
  const suffix = chip.dataset.suffix || '';
  const label = rideTimeLabel(field(`v2-stage-km${suffix}`)?.value);
  chip.textContent = label;
  chip.hidden = !label;
}

/** Sticky live-preview: the actual Stages-list card this stage will render as. */
export function stagePreviewHtml(suffix = '') {
  const from = fieldValue(`v2-stage-from${suffix}`) || 'Start';
  const to = fieldValue(`v2-stage-to${suffix}`) || 'End';
  const date = field(`v2-stage-date${suffix}`)?.value || '';
  const km = field(`v2-stage-km${suffix}`)?.value || '';
  const notes = fieldValue(`v2-stage-notes${suffix}`);
  return `<div class="rf-d2-stage-row rf-v2-preview-card"><div class="rf-d2-stage-no-col"><div class="rf-d2-stage-no">–</div></div><div class="rf-d2-stage-body"><div class="rf-d2-stage-row-head"><div class="rf-d2-stage-title">${esc(from)} <span class="rf-d2-stage-to">to</span> ${esc(to)}</div></div>${notes ? `<div class="rf-d2-stage-high">${esc(notes)}</div>` : ''}<div class="rf-d2-stage-mono"><span><span class="rf-d2-stage-mono-label">dist</span> ${Math.round(Number(km) || 0)}km</span><span>${esc(fmtDate(date) || 'No date yet')}</span></div></div></div>`;
}

export function stageCreateWizardHtml() {
  const sections = [
    narrativeSection('v2-stage-section-route', "Where's this leg go?", '', connectedRouteRow('v2-stage-from', 'v2-stage-to', '', '', 'placeholder="Aveiro"', 'placeholder="Ávila"')),
    narrativeSection('v2-stage-section-when', 'How far, and when?', '', [
      `<div class="rf-d2-form-row-pair">${row('v2-stage-date', 'Date', input('v2-stage-date', '', 'type="date"'))}${row('v2-stage-km', 'Distance km', input('v2-stage-km', '', 'inputmode="decimal" placeholder="410"'))}</div>`,
      `<p class="rf-v2-ride-time-chip" id="v2-stage-ride-time" data-suffix="" hidden></p>`,
    ].join('')),
    narrativeSection('v2-stage-section-more', 'Anything else?', '', [
      row('v2-stage-route', 'Custom Google Maps URL', input('v2-stage-route', '', 'placeholder="https://www.google.com/maps/..."')),
      row('v2-stage-notes', 'Notes', textarea('v2-stage-notes', '', 'placeholder="Motorway, mountain pass, long stage..."')),
    ].join('')),
  ];
  return narrativeShellHtml({
    id: 'rf-v2-stage-create-title',
    kicker: 'New stage',
    title: 'Add a route leg',
    sub: 'Coordinates and weather are resolved after saving.',
    sections,
    previewLabel: 'Stages list preview',
    previewHtml: stagePreviewHtml(),
    errorId: 'v2-stage-create-error',
    saveAction: 'rf-v2-save-stage',
    saveLabel: 'Save stage',
  });
}

export function stageEditWizardHtml() {
  const stage = selectedStage();
  if (!stage) return emptyWizard('No stage selected.');
  const sections = [
    narrativeSection('v2-stage-edit-section-route', "Where's this leg go?", '', connectedRouteRow('v2-stage-from-edit', 'v2-stage-to-edit', stage.start_location || '', stage.end_location || '')),
    narrativeSection('v2-stage-edit-section-when', 'How far, and when?', '', [
      `<div class="rf-d2-form-row-pair">${row('v2-stage-date-edit', 'Date', input('v2-stage-date-edit', stage.planned_date || '', 'type="date"'))}${row('v2-stage-km-edit', 'Distance km', input('v2-stage-km-edit', stage.distance_km ?? '', 'inputmode="decimal"'))}</div>`,
      `<p class="rf-v2-ride-time-chip" id="v2-stage-ride-time" data-suffix="-edit" ${rideTimeLabel(stage.distance_km) ? '' : 'hidden'}>${esc(rideTimeLabel(stage.distance_km))}</p>`,
    ].join('')),
    narrativeSection('v2-stage-edit-section-more', 'Anything else?', '', [
      row('v2-stage-route-edit', 'Custom Google Maps URL', input('v2-stage-route-edit', stage.custom_route_url || '', 'placeholder="https://www.google.com/maps/..."')),
      row('v2-stage-notes-edit', 'Notes', textarea('v2-stage-notes-edit', stage.notes || '')),
    ].join('')),
  ];
  return narrativeShellHtml({
    id: 'rf-v2-stage-title',
    kicker: 'Edit stage',
    title: 'Adjust the route leg',
    sub: 'Changing locations can refresh stored coordinates and weather.',
    sections,
    previewLabel: 'Stages list preview',
    previewHtml: stagePreviewHtml('-edit'),
    errorId: 'v2-stage-error',
    saveAction: 'rf-v2-update-stage',
    saveLabel: 'Save stage',
  });
}
