// ============================================================
// routefolk — screens/render/trip-detail/stages-mobile.js
// Mobile stage list + per-stage journal pane rendering.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import { fmtDate } from '../../../utils/datetime.js';
import { isArchivedTrip, writeDisabledAttr } from '../../../utils/write-guards.js';
import {
  arr,
  categoryLabel,
  day,
  expenses,
  fmtEuro,
  payerName,
  stages,
} from '../shared.js';
import { gpxPanelHtml } from './gpx-panel.js';
import { weatherPanelHtml } from '../../../components/atoms/weather-panel.js';
import { navigateButtonHtml } from '../../../components/atoms/navigate-button.js';
import { navigateSheetHtml } from '../../../components/atoms/navigate-sheet.js';

function selectedStage(trip) {
  const st = stages(trip.id);
  return st.find((stage) => stage.id === STATE.selectedStageId) || st[0] || null;
}

function mobileStageTracks(tripId, stageId) {
  const raw = STATE.gpxByTrip[tripId];
  return Array.isArray(raw) ? raw.filter((track) => track.stage_id === stageId) : [];
}

function mobileWeatherHtml(stage) {
  const wx = STATE.forecastsByStage[stage.id];
  return weatherPanelHtml(stage, wx, { prefix: 'rf-m2' });
}

function mobileNavigateHtml(trip, stage) {
  return navigateButtonHtml(stage, {
    online: STATE.isOnline !== false,
    kind: 'mobile',
    archived: isArchivedTrip(trip),
  });
}

/** 4-button footer (↑ ↓ Edit Delete) for an active-trip stage card.
 *  Returns '' when the trip is archived so the .rf-clean-stage-card
 *  collapses to just the tap target — matching Scene C of the v3
 *  mobile mockup. */
function stageFootHtml(trip, stage, index, total) {
  if (isArchivedTrip(trip)) return '';
  const dis = writeDisabledAttr();
  const upDisabled = index === 0 ? ' disabled' : dis;
  const downDisabled = index === total - 1 ? ' disabled' : dis;
  return `<div class="rf-clean-stage-foot"><button class="icon" data-action="rf-v2-reorder-stage" data-stage-id="${esc(stage.id)}" data-direction="up" type="button" title="Move up"${upDisabled}>↑</button><button class="icon" data-action="rf-v2-reorder-stage" data-stage-id="${esc(stage.id)}" data-direction="down" type="button" title="Move down"${downDisabled}>↓</button><button data-action="rf-v2-edit-stage" data-stage-id="${esc(stage.id)}" type="button"${dis}>Edit</button><button class="danger" data-action="rf-v2-delete-stage" data-stage-id="${esc(stage.id)}" type="button"${dis}>Delete</button></div>`;
}

export function renderMobileStages(trip, { screen, tripHeader }) {
  const st = stages(trip.id);
  const archived = isArchivedTrip(trip);
  const dis = writeDisabledAttr();
  const cards = st.map((stage, index) => `<article class="rf-clean-stage-card"><button class="rf-clean-stage-tap" data-action="rf-m2-open-stage" data-stage-id="${esc(stage.id)}" type="button"><span>${index + 1}</span><div><strong>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</strong><small>${esc(day(stage.planned_date))} · ${Math.round(Number(stage.distance_km) || 0)} km · ${esc(fmtDate(stage.planned_date) || '')}</small>${stage.notes ? `<p>${esc(stage.notes)}</p>` : ''}</div></button>${stageFootHtml(trip, stage, index, st.length)}</article>`).join('') || '<div class="rf-clean-empty">No stages yet.</div>';
  const addBtn = archived ? '' : `<button class="rf-m2-btn is-dashed" data-action="rf-m2-add-stage" type="button"${dis}>+ Add another stage</button>`;
  return screen(`${tripHeader(trip, 'stages')}<main class="rf-clean-page">${cards}${addBtn}</main>`);
}

export function renderMobileJournal(trip, { screen }) {
  const stage = selectedStage(trip);
  if (!stage) return screen('<main class="rf-clean-page"><div class="rf-clean-empty">No stage selected.</div></main>');
  const entries = arr(STATE.entriesByStage[stage.id]);
  const stageExpenses = expenses(trip.id).filter((expense) => expense.stage_id === stage.id);
  const tracks = mobileStageTracks(trip.id, stage.id);
  const sheetStage = STATE.navSheet ? selectedStage(trip) : null;
  return screen(`<main class="rf-clean-page"><button class="rf-clean-back" data-action="rf-m2-back-to-stages">← ${esc(trip.title || 'Trip')}</button><div class="rf-clean-kicker">Stage · ${esc(fmtDate(stage.planned_date) || '')}</div><h1 class="rf-clean-title">${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</h1><div class="rf-m2-stage-actions">${mobileNavigateHtml(trip, stage)}</div><p>${esc(stage.notes || '')}</p>${mobileWeatherHtml(stage)}<div class="rf-clean-section-head"><h2>The day's notes</h2><button data-action="rf-m2-add-journal">+ Add</button></div>${entries.map((entry, i) => `<article class="rf-clean-note"><span>${i + 1}</span><div><small>A ${esc(entry.entry_type || 'note')}</small><strong>${esc(entry.title || 'Untitled')}</strong>${entry.location ? `<em>at ${esc(entry.location)}</em>` : ''}</div></article>`).join('') || '<div class="rf-clean-empty">No entries yet.</div>'}<div class="rf-clean-section-head"><h2>Stage costs</h2><button data-action="rf-v2-add-stage-expense" data-stage-id="${esc(stage.id)}">+ Add</button></div>${stageExpenses.map((expense) => `<article class="rf-clean-expense"><div><strong>${esc(categoryLabel(expense.category))}</strong><small>${esc(payerName(expense.user_id))}</small></div><b>${fmtEuro(expense.amount || 0)}</b></article>`).join('') || '<div class="rf-clean-empty">No costs assigned to this stage.</div>'}<section class="rf-v2-gpx-section">${gpxPanelHtml(trip, stage, tracks)}</section></main>${STATE.navSheet && sheetStage ? navigateSheetHtml(sheetStage, STATE.navSheet) : ''}`);
}
