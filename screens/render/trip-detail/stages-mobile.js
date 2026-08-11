// ============================================================
// routefolk — screens/render/trip-detail/stages-mobile.js
// Mobile stage list + per-stage journal pane rendering.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import { fmtDate } from '../../../utils/datetime.js';
import {
  categoryLabel,
  day,
  expenses,
  fmtEuro,
  gripHtml,
  journalOrderBarHtml,
  orderedEntries,
  payerName,
  showStageActions,
  stageNodeStatus,
  stages,
  writeDisabledAttr,
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
    archived: ['completed', 'cancelled'].includes(trip.status),
  });
}

// M2 — stage action footer (Journal ↑ ↓ Edit Delete). Hidden by default;
// only rendered for the currently selected card (see renderMobileStages) —
// HANDOFF.md: reveal is per-card and exclusive, never all cards at once.
// Hidden entirely on archived trips (F1); reorder bounds disable ↑ on
// first / ↓ on last; offline disables all (F1).
function stageActionFooterHtml(stage, { index, total, trip }) {
  if (!showStageActions(trip)) return '';
  const w = writeDisabledAttr(trip);
  return `<div class="rf-clean-stage-foot is-quint">`
    + `<button class="icon" data-action="rf-v2-stage-up" data-stage-id="${esc(stage.id)}" ${index === 0 ? 'disabled' : w}>↑</button>`
    + `<button class="icon" data-action="rf-v2-stage-down" data-stage-id="${esc(stage.id)}" ${index === total - 1 ? 'disabled' : w}>↓</button>`
    + `<button data-action="rf-m2-open-stage" data-stage-id="${esc(stage.id)}">Journal</button>`
    + `<button data-action="rf-v2-edit-stage" data-stage-id="${esc(stage.id)}"${w}>Edit</button>`
    + `<button class="danger" data-action="rf-v2-delete-stage" data-stage-id="${esc(stage.id)}"${w}>Delete</button>`
    + `</div>`;
}

export function renderMobileStages(trip, { screen, tripHeader }) {
  const st = stages(trip.id);
  const total = st.length;
  const revealedId = STATE.stageListSelectedId;
  const cards = st.map((stage, index) => `<article class="rf-clean-stage-card is-split ${revealedId === stage.id ? 'is-selected' : ''}"><button class="rf-clean-stage-tap" data-action="rf-m2-select-stage-card" data-stage-id="${esc(stage.id)}"><span class="is-${stageNodeStatus(stage)}">${index + 1}</span><div><strong>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</strong><small>${esc(day(stage.planned_date))} · ${Math.round(Number(stage.distance_km) || 0)} km · ${esc(fmtDate(stage.planned_date) || '')}</small>${stage.notes ? `<p>${esc(stage.notes)}</p>` : ''}</div></button>${revealedId === stage.id ? stageActionFooterHtml(stage, { index, total, trip }) : ''}</article>`).join('');
  // HANDOFF.md generic empty state: centered icon-less message + a
  // "+ Add a stage" CTA, not a special-cased hero variant.
  const emptyState = `<div class="rf-d2-empty-state"><p>No stages yet.</p><p class="rf-d2-empty-hint">Add the first leg of this trip to start the route.</p><button class="rf-m2-btn is-primary" data-action="rf-m2-add-stage" type="button">+ Add a stage</button></div>`;
  return screen(`${tripHeader(trip, 'stages')}<main class="rf-clean-page">${st.length ? `<div class="rf-clean-stage-rail">${cards}</div><button class="rf-m2-btn is-dashed" data-action="rf-m2-add-stage">+ Add another stage</button>` : emptyState}</main>`);
}

// M3 — drill-in stage action pills (Edit stage · Delete) next to Navigate.
function mobileStageActionsHtml(trip, stage) {
  let html = mobileNavigateHtml(trip, stage);
  if (showStageActions(trip)) {
    const w = writeDisabledAttr(trip);
    html += `<button class="rf-m2-pill-action" data-action="rf-v2-edit-stage" data-stage-id="${esc(stage.id)}"${w}>Edit stage</button>`
          + `<button class="rf-m2-pill-action danger" data-action="rf-v2-delete-stage" data-stage-id="${esc(stage.id)}"${w}>Delete</button>`;
  }
  return `<div class="rf-m2-stage-actions">${html}</div>`;
}

// M4 — journal entry row with ✎ ✕ icon actions (hidden on archived trips)
// plus the ordering grip and (manual mode only) ↑ ↓ reorder buttons.
function mobileNoteHtml(entry, index, total, manual, trip) {
  const acts = showStageActions(trip)
    ? `<div class="rf-clean-note-acts">${manual ? `<button data-action="rf-v2-journal-entry-up" data-entry-id="${esc(entry.id)}" ${index === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button data-action="rf-v2-journal-entry-down" data-entry-id="${esc(entry.id)}" ${index === total - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>` : ''}<button data-action="rf-v2-edit-entry" data-entry-id="${esc(entry.id)}"${writeDisabledAttr(trip)} aria-label="Edit entry">✎</button><button class="danger" data-action="rf-v2-delete-entry" data-entry-id="${esc(entry.id)}"${writeDisabledAttr(trip)} aria-label="Delete entry">✕</button></div>`
    : '';
  return `<article class="rf-clean-note">${gripHtml(manual)}<div><small>A ${esc(entry.entry_type || 'note')}</small><strong>${esc(entry.title || 'Untitled')}</strong>${entry.location ? `<em>at ${esc(entry.location)}</em>` : ''}</div>${acts}</article>`;
}

export function renderMobileJournal(trip, { screen }) {
  const stage = selectedStage(trip);
  if (!stage) return screen('<main class="rf-clean-page"><div class="rf-clean-empty">No stage selected.</div></main>');
  const entries = orderedEntries(stage);
  const manual = !!stage.journal_manual_order;
  const stageExpenses = expenses(trip.id).filter((expense) => expense.stage_id === stage.id);
  const tracks = mobileStageTracks(trip.id, stage.id);
  const sheetStage = STATE.navSheet ? selectedStage(trip) : null;
  return screen(`<main class="rf-clean-page"><button class="rf-clean-back" data-action="rf-m2-back-to-stages">← ${esc(trip.title || 'Trip')}</button><div class="rf-clean-kicker">Stage · ${esc(fmtDate(stage.planned_date) || '')}</div><h1 class="rf-clean-title">${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</h1>${mobileStageActionsHtml(trip, stage)}<p>${esc(stage.notes || '')}</p>${mobileWeatherHtml(stage)}<div class="rf-clean-section-head"><h2>The day's notes</h2><button data-action="rf-m2-add-journal">+ Add</button></div>${entries.length ? journalOrderBarHtml(stage) : ''}${entries.map((entry, i) => mobileNoteHtml(entry, i, entries.length, manual, trip)).join('') || '<div class="rf-clean-empty">No entries yet.</div>'}<div class="rf-clean-section-head"><h2>Stage costs</h2><button data-action="rf-v2-add-stage-expense" data-stage-id="${esc(stage.id)}">+ Add</button></div>${stageExpenses.map((expense) => `<article class="rf-clean-expense"><div><strong>${esc(categoryLabel(expense.category))}</strong><small>${esc(payerName(expense.user_id))}</small></div><b>${fmtEuro(expense.amount || 0)}</b></article>`).join('') || '<div class="rf-clean-empty">No costs assigned to this stage.</div>'}<section class="rf-v2-gpx-section">${gpxPanelHtml(trip, stage, tracks)}</section></main>${STATE.navSheet && sheetStage ? navigateSheetHtml(sheetStage, STATE.navSheet) : ''}`);
}
