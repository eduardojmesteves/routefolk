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
  const chip = byId('stage-ride-time');
  if (!chip) return;
  const suffix = chip.dataset.suffix || '';
  const label = rideTimeLabel(field(`stage-km${suffix}`)?.value);
  chip.textContent = label;
  chip.hidden = !label;
}

/** Sticky live-preview: the actual Stages-list card this stage will render as. */
export function stagePreviewHtml(suffix = '') {
  const from = fieldValue(`stage-from${suffix}`) || 'Start';
  const to = fieldValue(`stage-to${suffix}`) || 'End';
  const date = field(`stage-date${suffix}`)?.value || '';
  const km = field(`stage-km${suffix}`)?.value || '';
  const notes = fieldValue(`stage-notes${suffix}`);
  return `<div class="rf-desktop-stage-row rf-preview-card"><div class="rf-desktop-stage-no-col"><div class="rf-desktop-stage-no">–</div></div><div class="rf-desktop-stage-body"><div class="rf-desktop-stage-row-head"><div class="rf-desktop-stage-title">${esc(from)} <span class="rf-desktop-stage-to">to</span> ${esc(to)}</div></div>${notes ? `<div class="rf-desktop-stage-high">${esc(notes)}</div>` : ''}<div class="rf-desktop-stage-mono"><span><span class="rf-desktop-stage-mono-label">dist</span> ${Math.round(Number(km) || 0)}km</span><span>${esc(fmtDate(date) || 'No date yet')}</span></div></div></div>`;
}

export function stageCreateWizardHtml() {
  const sections = [
    narrativeSection('stage-section-route', "Where's this leg go?", '', connectedRouteRow('stage-from', 'stage-to', '', '', 'placeholder="Aveiro"', 'placeholder="Ávila"')),
    narrativeSection('stage-section-when', 'How far, and when?', '', [
      `<div class="rf-desktop-form-row-pair">${row('stage-date', 'Date', input('stage-date', '', 'type="date"'))}${row('stage-km', 'Distance km', input('stage-km', '', 'inputmode="decimal" placeholder="410"'))}</div>`,
      `<p class="rf-ride-time-chip" id="stage-ride-time" data-suffix="" hidden></p>`,
    ].join('')),
    narrativeSection('stage-section-more', 'Anything else?', '', [
      row('stage-route', 'Custom Google Maps URL', input('stage-route', '', 'placeholder="https://www.google.com/maps/..."')),
      row('stage-notes', 'Notes', textarea('stage-notes', '', 'placeholder="Motorway, mountain pass, long stage..."')),
    ].join('')),
  ];
  return narrativeShellHtml({
    id: 'rf-stage-create-title',
    kicker: 'New stage',
    title: 'Add a route leg',
    sub: 'Coordinates and weather are resolved after saving.',
    sections,
    previewLabel: 'Stages list preview',
    previewHtml: stagePreviewHtml(),
    errorId: 'stage-create-error',
    saveAction: 'rf-save-stage',
    saveLabel: 'Save stage',
  });
}

export function stageEditWizardHtml() {
  const stage = selectedStage();
  if (!stage) return emptyWizard('No stage selected.');
  const sections = [
    narrativeSection('stage-edit-section-route', "Where's this leg go?", '', connectedRouteRow('stage-from-edit', 'stage-to-edit', stage.start_location || '', stage.end_location || '')),
    narrativeSection('stage-edit-section-when', 'How far, and when?', '', [
      `<div class="rf-desktop-form-row-pair">${row('stage-date-edit', 'Date', input('stage-date-edit', stage.planned_date || '', 'type="date"'))}${row('stage-km-edit', 'Distance km', input('stage-km-edit', stage.distance_km ?? '', 'inputmode="decimal"'))}</div>`,
      `<p class="rf-ride-time-chip" id="stage-ride-time" data-suffix="-edit" ${rideTimeLabel(stage.distance_km) ? '' : 'hidden'}>${esc(rideTimeLabel(stage.distance_km))}</p>`,
    ].join('')),
    narrativeSection('stage-edit-section-more', 'Anything else?', '', [
      row('stage-route-edit', 'Custom Google Maps URL', input('stage-route-edit', stage.custom_route_url || '', 'placeholder="https://www.google.com/maps/..."')),
      row('stage-notes-edit', 'Notes', textarea('stage-notes-edit', stage.notes || '')),
    ].join('')),
  ];
  return narrativeShellHtml({
    id: 'rf-stage-title',
    kicker: 'Edit stage',
    title: 'Adjust the route leg',
    sub: 'Changing locations can refresh stored coordinates and weather.',
    sections,
    previewLabel: 'Stages list preview',
    previewHtml: stagePreviewHtml('-edit'),
    errorId: 'stage-error',
    saveAction: 'rf-update-stage',
    saveLabel: 'Save stage',
  });
}
