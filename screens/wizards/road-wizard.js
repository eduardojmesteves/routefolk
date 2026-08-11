// ============================================================
// routefolk — screens/wizards/road-wizard.js
// Road create/edit wizard markup (Route Atlas narrative pattern):
// name, connection (reuses connectedRouteRow), notes, star rating,
// and a cross-trip stage linker.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc, starSvg } from '../../utils/dom.js';
import { fmtDate } from '../../utils/datetime.js';
import {
  api,
  wizardHost,
  selectedRoad,
  roadStageLinksForRoad,
  stagesForTrip,
  field,
  fieldValue,
  row,
  input,
  textarea,
  connectedRouteRow,
  starPickerHtml,
  narrativeShellHtml,
  narrativeSection,
  emptyWizard,
} from './wizard-shared.js';

// ---- Cross-trip stage preload -----------------------------------------
// The linker needs every trip's stages loaded, not just the active one
// (STATE.stagesByTrip is normally populated lazily per open trip).
const stagesPreloadPromises = new Map();

export function preloadStagesForRoadWizard(relayout) {
  if (STATE.wizard !== 'road' && STATE.wizard !== 'road-edit') return;
  STATE.trips.forEach((trip) => {
    if (STATE.stagesByTrip[trip.id] || stagesPreloadPromises.has(trip.id)) return;
    const promise = Promise.resolve(api().loadStagesForTrip?.(trip.id)).finally(() => {
      stagesPreloadPromises.delete(trip.id);
      relayout?.();
    });
    stagesPreloadPromises.set(trip.id, promise);
  });
}

/** Data signature fragment for the road wizard — busts the host cache as
 *  each trip's stages finish loading in the background. */
export function roadWizardDataSignature(modeClass, targetKey) {
  const loaded = STATE.trips.map((trip) => `${trip.id}:${STATE.stagesByTrip[trip.id] ? stagesForTrip(trip.id).length : 'x'}`).join(',');
  return [modeClass, targetKey, loaded].join('|');
}

// ---- Stage linker: mock's one-at-a-time pattern ------------------------
// The mock shows only the road's already-linked stages as compact cards
// plus a single "+ Link another stage" button that reveals a picker of
// not-yet-linked stages (Routefolk - Route Atlas.html "Road wizard" frame)
// — not an always-visible bulk checklist. Add/remove mutate the DOM in
// place (no renderAll()) so unsaved fields elsewhere in the form survive,
// matching the selectChoiceCard()/selectStar() pattern.

function findStageAndTrip(stageId) {
  for (const trip of STATE.trips) {
    const stage = stagesForTrip(trip.id).find((candidate) => candidate.id === stageId);
    if (stage) return { stage, trip };
  }
  return null;
}

function stageLinkCardHtml(stageId, tripTitle, stageNo, date) {
  return `<div class="rf-v2-road-link-card" data-stage-id="${esc(stageId)}"><span>${esc(tripTitle)} · Stage ${esc(stageNo || '')}</span><b class="rf-mono">${esc(date || '')}</b><button type="button" class="rf-v2-road-link-remove" data-action="rf-v2-road-link-remove" data-stage-id="${esc(stageId)}" aria-label="Remove link">×</button><input type="hidden" name="v2-road-stage-link" value="${esc(stageId)}"></div>`;
}

function stagePickerRowHtml(stage, tripTitle) {
  return `<button type="button" class="rf-v2-stage-link-row" data-action="rf-v2-road-link-add" data-stage-id="${esc(stage.id)}"><strong>${esc(stage.start_location || 'Start')} <span class="rf-d2-stage-to">to</span> ${esc(stage.end_location || 'End')}</strong><small>${esc(tripTitle)} · ${esc(fmtDate(stage.planned_date) || 'No date yet')}</small></button>`;
}

function stagePickerHtml(excludeIds) {
  const trips = STATE.trips;
  const groups = trips.map((trip) => {
    const stages = stagesForTrip(trip.id).filter((stage) => !excludeIds.has(stage.id));
    if (!stages.length) return '';
    const rows = stages.map((stage) => stagePickerRowHtml(stage, trip.title)).join('');
    return `<div class="rf-v2-stage-link-group"><div class="rf-v2-stage-link-trip">${esc(trip.title)}</div>${rows}</div>`;
  }).filter(Boolean).join('');
  if (groups) return groups;
  const stillLoading = trips.length && trips.some((trip) => !STATE.stagesByTrip[trip.id]);
  return `<p class="rf-d2-aside-sub">${stillLoading ? 'Loading your stages…' : 'No more stages to link.'}</p>`;
}

function roadLinkedSectionHtml(linkedIds, pickerOpen = false) {
  const cards = [...linkedIds].map((id) => {
    const found = findStageAndTrip(id);
    if (!found) return '';
    return stageLinkCardHtml(id, found.trip.title, found.stage.order_index, fmtDate(found.stage.planned_date));
  }).join('');
  return `<div class="rw-linked-stages" id="v2-road-linked-stages">${cards}</div><button type="button" class="rf-d2-btn is-dashed" data-action="rf-v2-road-link-stage-toggle" aria-expanded="${pickerOpen ? 'true' : 'false'}" aria-controls="v2-road-stage-picker">+ Link another stage</button><div class="rf-v2-stage-linker" id="v2-road-stage-picker" ${pickerOpen ? '' : 'hidden'}>${stagePickerHtml(linkedIds)}</div>`;
}

function stageLinkerHtml(linkedStageIds) {
  return `<div id="v2-road-linker-body">${roadLinkedSectionHtml(linkedStageIds)}</div>`;
}

function currentLinkedStageIds() {
  return new Set([...(wizardHost()?.querySelectorAll('input[name="v2-road-stage-link"]') || [])].map((el) => el.value));
}

function refreshRoadStageLinker(linkedIds, pickerOpen) {
  const body = wizardHost()?.querySelector('#v2-road-linker-body');
  if (!body) return;
  body.innerHTML = roadLinkedSectionHtml(linkedIds, pickerOpen);
}

/** "+ Link another stage" — reveals/hides the not-yet-linked stage picker. */
export function toggleRoadStagePicker() {
  const picker = wizardHost()?.querySelector('#v2-road-stage-picker');
  refreshRoadStageLinker(currentLinkedStageIds(), picker ? picker.hidden : true);
}

/** Picker row tap — links a stage and keeps the picker open for more. */
export function addRoadStageLink(stageId) {
  const linked = currentLinkedStageIds();
  linked.add(stageId);
  refreshRoadStageLinker(linked, true);
}

/** "×" on a linked-stage card — unlinks it and collapses the picker. */
export function removeRoadStageLink(stageId) {
  const linked = currentLinkedStageIds();
  linked.delete(stageId);
  refreshRoadStageLinker(linked, false);
}

// ---- Sticky live-preview -----------------------------------------------
/** Sticky live-preview: the actual My-roads card this road will render as. */
export function roadPreviewHtml(suffix = '') {
  const name = fieldValue(`v2-road-name${suffix}`) || 'Unnamed road';
  const from = fieldValue(`v2-road-from${suffix}`);
  const to = fieldValue(`v2-road-to${suffix}`);
  const notes = fieldValue(`v2-road-notes${suffix}`);
  const rating = Number(field(`v2-road-rating${suffix}`)?.value) || 0;
  const stars = [1, 2, 3, 4, 5].map((n) => `<span class="rf-star-mini ${n <= rating ? 'is-filled' : ''}">${starSvg()}</span>`).join('');
  return `<article class="rf-v2-road-card rf-v2-preview-card"><div class="rf-v2-road-card-head"><strong>${esc(name)}</strong><span class="rf-v2-road-stars">${stars}</span></div>${from || to ? `<div class="rf-v2-road-connects">${esc(from || 'Start')} <span class="rf-v2-route-arrow">→</span> ${esc(to || 'End')}</div>` : ''}${notes ? `<p class="rf-v2-road-notes">${esc(notes)}</p>` : ''}</article>`;
}

// ---- Wizard markup ------------------------------------------------------
export function roadCreateWizardHtml() {
  const sections = [
    narrativeSection('v2-road-section-name', 'Which road is it?', 'The route number or name.', row('v2-road-name', 'Road number or name', input('v2-road-name', '', 'placeholder="N-260"'))),
    narrativeSection('v2-road-section-connect', 'What does it connect?', 'Region to region.', connectedRouteRow('v2-road-from', 'v2-road-to', '', '', 'placeholder="Sort"', 'placeholder="Núria"')),
    narrativeSection('v2-road-section-notes', 'Anything worth noting?', '', row('v2-road-notes', 'Notes', textarea('v2-road-notes', '', 'placeholder="Hairpins, gravel patch after the tunnel..."'))),
    narrativeSection('v2-road-section-rating', 'How many stars?', 'Your own rating — pins it higher in your list.', starPickerHtml('v2-road-rating', 0)),
    narrativeSection('v2-road-section-stages', 'Rode it on a stage?', "Optional — link one or more stages you've ridden this road on. Dates fill in automatically.", stageLinkerHtml(new Set())),
  ];
  return narrativeShellHtml({
    id: 'rf-v2-road-create-title',
    kicker: 'New road',
    title: 'Log a road worth remembering',
    sub: 'Shared with everyone — your own stars decide where it sits in your list.',
    sections,
    previewLabel: 'My roads preview',
    previewHtml: roadPreviewHtml(),
    errorId: 'v2-road-create-error',
    saveAction: 'rf-v2-save-road',
    saveLabel: 'Save road',
  });
}

export function roadEditWizardHtml() {
  const road = selectedRoad();
  if (!road) return emptyWizard('No road selected.');
  const linkedStageIds = new Set(roadStageLinksForRoad(road.id).map((link) => link.stage_id));
  const rating = Number(road.my_rating) || 0;
  const sections = [
    narrativeSection('v2-road-edit-section-name', 'Which road is it?', 'The route number or name.', row('v2-road-name-edit', 'Road number or name', input('v2-road-name-edit', road.road_number_or_name || '', 'placeholder="N-260"'))),
    narrativeSection('v2-road-edit-section-connect', 'What does it connect?', 'Region to region.', connectedRouteRow('v2-road-from-edit', 'v2-road-to-edit', road.connection_from || '', road.connection_to || '')),
    narrativeSection('v2-road-edit-section-notes', 'Anything worth noting?', '', row('v2-road-notes-edit', 'Notes', textarea('v2-road-notes-edit', road.notes || ''))),
    narrativeSection('v2-road-edit-section-rating', 'How many stars?', 'Your own rating — pins it higher in your list.', starPickerHtml('v2-road-rating-edit', rating)),
    narrativeSection('v2-road-edit-section-stages', 'Rode it on a stage?', "Optional — link one or more stages you've ridden this road on. Dates fill in automatically.", stageLinkerHtml(linkedStageIds)),
  ];
  return narrativeShellHtml({
    id: 'rf-v2-road-title',
    kicker: 'Edit road',
    title: 'Update this road',
    sub: 'Changes to the road itself are visible to the whole group.',
    sections,
    previewLabel: 'My roads preview',
    previewHtml: roadPreviewHtml('-edit'),
    errorId: 'v2-road-error',
    saveAction: 'rf-v2-update-road',
    saveLabel: 'Save road',
  });
}

// ---- Write payload helpers (used by actions/road-actions.js) -----------
export function roadPayload(suffix = '') {
  return {
    road_number_or_name: fieldValue(`v2-road-name${suffix}`),
    connection_from: fieldValue(`v2-road-from${suffix}`) || null,
    connection_to: fieldValue(`v2-road-to${suffix}`) || null,
    notes: fieldValue(`v2-road-notes${suffix}`) || null,
  };
}

export function roadRatingValue(suffix = '') {
  return Number(field(`v2-road-rating${suffix}`)?.value) || 0;
}

export function selectedStageLinkIds() {
  return [...currentLinkedStageIds()];
}
