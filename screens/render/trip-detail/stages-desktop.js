// ============================================================
// routefolk — screens/render/trip-detail/stages-desktop.js
// Desktop stage list + per-stage aside (journal/costs/GPX) rendering.
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

const rawStages = (tripId) => STATE.stagesByTrip[tripId];

function stageTracks(tripId, stageId) {
  const raw = STATE.gpxByTrip[tripId];
  return Array.isArray(raw) ? raw.filter((track) => track.stage_id === stageId) : [];
}

// D2 — desktop journal entry with ✎ ✕ icon actions (hidden on archived
// trips), plus the ordering grip and (manual mode only) ↑ ↓ buttons.
function entryHtml(entry, index, total, manual, trip) {
  const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const acts = showStageActions(trip)
    ? `<div class="rf-d2-entry-acts">${manual ? `<button data-action="rf-v2-journal-entry-up" data-entry-id="${esc(entry.id)}" type="button" ${index === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button data-action="rf-v2-journal-entry-down" data-entry-id="${esc(entry.id)}" type="button" ${index === total - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>` : ''}<button data-action="rf-v2-edit-entry" data-entry-id="${esc(entry.id)}" type="button"${writeDisabledAttr(trip)} aria-label="Edit entry">✎</button><button class="danger" data-action="rf-v2-delete-entry" data-entry-id="${esc(entry.id)}" type="button"${writeDisabledAttr(trip)} aria-label="Delete entry">✕</button></div>`
    : '';
  return `<div class="rf-d2-entry">${gripHtml(manual)}<div><div class="rf-d2-entry-head"><div class="rf-d2-entry-type">A ${esc(entry.entry_type || 'note')}</div><div class="rf-d2-entry-when">${esc(time)}</div></div><div class="rf-d2-entry-title">${esc(entry.title || 'Untitled')}</div><div class="rf-d2-entry-loc">${entry.location ? `at ${esc(entry.location)}` : ''}</div></div>${acts}</div>`;
}

// D1 — desktop aside stage actions (Edit · Delete · ↑ · ↓) beside Navigate.
function desktopStageActionsHtml(trip, stage, { index, total }) {
  let html = desktopNavigateHtml(trip, stage);
  if (showStageActions(trip)) {
    const w = writeDisabledAttr(trip);
    html += `<button class="rf-d2-act" data-action="rf-v2-edit-stage" data-stage-id="${esc(stage.id)}" type="button"${w}>Edit stage</button>`
          + `<button class="rf-d2-act danger" data-action="rf-v2-delete-stage" data-stage-id="${esc(stage.id)}" type="button"${w}>Delete</button>`
          + `<button class="rf-d2-act icon" data-action="rf-v2-stage-up" data-stage-id="${esc(stage.id)}" type="button" ${index === 0 ? 'disabled' : w} aria-label="Move up">↑</button>`
          + `<button class="rf-d2-act icon" data-action="rf-v2-stage-down" data-stage-id="${esc(stage.id)}" type="button" ${index === total - 1 ? 'disabled' : w} aria-label="Move down">↓</button>`;
  }
  return `<div class="rf-d2-stage-actions">${html}</div>`;
}

function expenseMini(expense) {
  return `<div class="rf-d2-mini-table-row"><div><div class="rf-d2-mini-cat">${esc(categoryLabel(expense.category))}</div><div class="rf-d2-mini-meta">${esc(payerName(expense.user_id))}</div></div><div>${esc(fmtEuro(expense.amount || 0))}</div></div>`;
}

function desktopWeatherHtml(stage) {
  const wx = STATE.forecastsByStage[stage.id];
  return weatherPanelHtml(stage, wx, { prefix: 'rf-d2' });
}

function desktopNavigateHtml(trip, stage) {
  return navigateButtonHtml(stage, {
    online: STATE.isOnline !== false,
    kind: 'desktop',
    archived: ['completed', 'cancelled'].includes(trip.status),
  });
}

// Rail node color is real: HANDOFF.md "orange=upcoming, green=done",
// computed from planned_date vs today (screens/render/shared.js
// stageNodeStatus), never toggled by hand.
function renderStageRow(stage, index, selectedId) {
  const nodeStatus = stageNodeStatus(stage);
  return `<button class="rf-d2-stage-row ${selectedId === stage.id ? 'is-selected' : ''}" data-action="rf-d2-select-stage" data-stage-id="${esc(stage.id)}" type="button"><div class="rf-d2-stage-no-col"><div class="rf-d2-stage-no is-${nodeStatus}">${index + 1}</div><div class="rf-d2-stage-rule"></div><div class="rf-d2-stage-day">${esc(day(stage.planned_date))}</div></div><div class="rf-d2-stage-body"><div class="rf-d2-stage-row-head"><div class="rf-d2-stage-title">${esc(stage.start_location || 'Start')} <span class="rf-d2-stage-to">to</span> ${esc(stage.end_location || 'End')}</div></div><div class="rf-d2-stage-high">${esc(stage.notes || '')}</div><div class="rf-d2-stage-mono"><span><span class="rf-d2-stage-mono-label">dist</span> ${Math.round(Number(stage.distance_km) || 0)}km</span><span>${esc(fmtDate(stage.planned_date) || '')}</span></div></div></button>`;
}

function renderStageWizard(trip) {
  return `<aside class="rf-d2-aside"><div class="rf-d2-aside-head"><div class="rf-d2-aside-kicker">New stage</div><h2 class="rf-d2-aside-title">Add a stage</h2></div><input class="rf-d2-input" id="v2-stage-from" placeholder="From"><input class="rf-d2-input" id="v2-stage-to" placeholder="To"><input class="rf-d2-input" id="v2-stage-date" type="date" value="${esc(trip.start_date || '')}"><input class="rf-d2-input" id="v2-stage-km" inputmode="decimal" placeholder="Distance km"><textarea class="rf-d2-textarea" id="v2-stage-notes" placeholder="Notes"></textarea><div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-d2-cancel-wizard">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-d2-save-stage">Save stage</button></div></aside>`;
}

function renderJournalWizard() {
  return `<aside class="rf-d2-aside"><div class="rf-d2-aside-head"><div class="rf-d2-aside-kicker">New entry</div><h2 class="rf-d2-aside-title">A note from the road</h2></div><input class="rf-d2-input" id="v2-entry-title" placeholder="Title"><input class="rf-d2-input" id="v2-entry-place" placeholder="Place"><input class="rf-d2-input" id="v2-entry-time" type="time"><textarea class="rf-d2-textarea" id="v2-entry-note" placeholder="What happened here?"></textarea><div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-d2-cancel-wizard">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-d2-save-journal">Save entry</button></div></aside>`;
}

function renderAside(trip, stage, { loadingHtml }) {
  if (STATE.wizard === 'stage') return renderStageWizard(trip);
  if (STATE.wizard === 'journal') return renderJournalWizard();
  if (!stage) return '<aside class="rf-d2-aside"><div class="rf-d2-empty">Select a stage.</div></aside>';
  const rawEntries = STATE.entriesByStage[stage.id];
  const entries = orderedEntries(stage);
  const manual = !!stage.journal_manual_order;
  const stageExpenses = expenses(trip.id).filter((e) => e.stage_id === stage.id);
  const tracks = stageTracks(trip.id, stage.id);
  const allStages = stages(trip.id);
  const stageIndex = allStages.findIndex((s) => s.id === stage.id);
  const stageTotal = allStages.length;
  return `<aside class="rf-d2-aside"><div class="rf-d2-aside-head"><div class="rf-d2-aside-kicker">Stage ${esc(stage.order_index || '')} · ${esc(fmtDate(stage.planned_date) || '')}</div><h2 class="rf-d2-aside-title">${esc(stage.start_location || 'Start')} <span style="font-style:italic;color:var(--rf-d2-muted)">to</span> ${esc(stage.end_location || 'End')}</h2><div class="rf-d2-aside-sub">${esc(stage.notes || '')}</div>${desktopStageActionsHtml(trip, stage, { index: stageIndex, total: stageTotal })}</div>${desktopWeatherHtml(stage)}<div class="rf-d2-section-head"><div class="rf-d2-section-title">The day's notes</div><button class="rf-d2-btn is-primary" data-action="rf-d2-add-journal" type="button">+ Add</button></div>${entries.length ? journalOrderBarHtml(stage) : ''}${rawEntries === 'loading' ? loadingHtml('Loading notes…') : entries.map((e, i) => entryHtml(e, i, entries.length, manual, trip)).join('') || '<div class="rf-d2-mini-table">No entries yet.</div>'}<div class="rf-d2-section-head"><div class="rf-d2-section-title">Stage costs</div><button class="rf-d2-btn is-primary" data-action="rf-v2-add-stage-expense" data-stage-id="${esc(stage.id)}" type="button">+ Add</button></div><div class="rf-d2-mini-table">${stageExpenses.map(expenseMini).join('') || 'No costs assigned to this stage.'}</div><section class="rf-v2-gpx-section">${gpxPanelHtml(trip, stage, tracks)}</section></aside>`;
}

export function renderStages(trip, { hero, tabs, loadingHtml }) {
  const raw = rawStages(trip.id);
  if (raw === 'loading' || STATE.stagesLoading) {
    return `<main class="rf-d2-main">${hero(trip, { withStats: true })}${tabs('stages')}${loadingHtml('Loading stages…')}</main><aside class="rf-d2-aside">${loadingHtml('Loading detail…')}</aside>`;
  }
  const st = stages(trip.id);
  const selected = st.find((stage) => stage.id === STATE.selectedStageId) || st[0];
  // HANDOFF.md generic empty state: centered icon-less message + a
  // "+ Add a stage" CTA, not a special-cased hero variant.
  const listOrEmpty = st.length
    ? `<div class="rf-d2-stage-list">${st.map((stage, i) => renderStageRow(stage, i, selected?.id)).join('')}<button class="rf-d2-btn is-dashed" data-action="rf-d2-add-stage" type="button">+ Add another stage</button></div>`
    : `<div class="rf-d2-empty-state"><p>No stages yet.</p><button class="rf-d2-btn is-primary" data-action="rf-d2-add-stage" type="button">+ Add a stage</button></div>`;
  return `<main class="rf-d2-main">${hero(trip, { withStats: true })}${tabs('stages')}<div class="rf-d2-section-head"><div class="rf-d2-section-title">${st.length} stages</div><button class="rf-d2-btn is-primary" data-action="rf-d2-add-stage" type="button">+ Add stage</button></div>${listOrEmpty}</main>${renderAside(trip, selected, { loadingHtml })}`;
}
