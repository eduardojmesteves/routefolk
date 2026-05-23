// ============================================================
// routefolk — screens/render/trip-detail/stages-desktop.js
// Desktop stage list + per-stage aside (journal/costs/GPX) rendering.
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

const rawStages = (tripId) => STATE.stagesByTrip[tripId];

function stageTracks(tripId, stageId) {
  const raw = STATE.gpxByTrip[tripId];
  return Array.isArray(raw) ? raw.filter((track) => track.stage_id === stageId) : [];
}

function entryHtml(entry, index) {
  const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="rf-d2-entry"><div class="rf-d2-entry-bullet">${index + 1}</div><div><div class="rf-d2-entry-head"><div class="rf-d2-entry-type">A ${esc(entry.entry_type || 'note')}</div><div class="rf-d2-entry-when">${esc(time)}</div></div><div class="rf-d2-entry-title">${esc(entry.title || 'Untitled')}</div><div class="rf-d2-entry-loc">${entry.location ? `at ${esc(entry.location)}` : ''}</div></div></div>`;
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
    archived: isArchivedTrip(trip),
  });
}

function renderStageRow(stage, index, selectedId) {
  return `<button class="rf-d2-stage-row ${selectedId === stage.id ? 'is-selected' : ''}" data-action="rf-d2-select-stage" data-stage-id="${esc(stage.id)}" type="button"><div class="rf-d2-stage-no-col"><div class="rf-d2-stage-no">${index + 1}</div><div class="rf-d2-stage-rule"></div><div class="rf-d2-stage-day">${esc(day(stage.planned_date))}</div></div><div class="rf-d2-stage-body"><div class="rf-d2-stage-row-head"><div class="rf-d2-stage-title">${esc(stage.start_location || 'Start')} <span class="rf-d2-stage-to">to</span> ${esc(stage.end_location || 'End')}</div></div><div class="rf-d2-stage-high">${esc(stage.notes || '')}</div><div class="rf-d2-stage-mono"><span><span class="rf-d2-stage-mono-label">dist</span> ${Math.round(Number(stage.distance_km) || 0)}km</span><span>${esc(fmtDate(stage.planned_date) || '')}</span></div></div></button>`;
}

function renderStageWizard(trip) {
  return `<aside class="rf-d2-aside"><div class="rf-d2-aside-head"><div class="rf-d2-aside-kicker">New stage</div><h2 class="rf-d2-aside-title">Add a stage</h2></div><input class="rf-d2-input" id="v2-stage-from" placeholder="From"><input class="rf-d2-input" id="v2-stage-to" placeholder="To"><input class="rf-d2-input" id="v2-stage-date" type="date" value="${esc(trip.start_date || '')}"><input class="rf-d2-input" id="v2-stage-km" inputmode="decimal" placeholder="Distance km"><textarea class="rf-d2-textarea" id="v2-stage-notes" placeholder="Notes"></textarea><div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-d2-cancel-wizard">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-d2-save-stage">Save stage</button></div></aside>`;
}

function renderJournalWizard() {
  return `<aside class="rf-d2-aside"><div class="rf-d2-aside-head"><div class="rf-d2-aside-kicker">New entry</div><h2 class="rf-d2-aside-title">A note from the road</h2></div><input class="rf-d2-input" id="v2-entry-title" placeholder="Title"><input class="rf-d2-input" id="v2-entry-place" placeholder="Place"><input class="rf-d2-input" id="v2-entry-time" type="time"><textarea class="rf-d2-textarea" id="v2-entry-note" placeholder="What happened here?"></textarea><div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-d2-cancel-wizard">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-d2-save-journal">Save entry</button></div></aside>`;
}

function desktopReorderHtml(trip, stage) {
  if (isArchivedTrip(trip)) return '';
  const st = stages(trip.id);
  const i = st.findIndex((candidate) => candidate.id === stage.id);
  if (i < 0) return '';
  const dis = writeDisabledAttr();
  const upDisabled = i === 0 ? ' disabled' : dis;
  const downDisabled = i === st.length - 1 ? ' disabled' : dis;
  return `<button class="rf-v2-stage-reorder" data-action="rf-v2-reorder-stage" data-stage-id="${esc(stage.id)}" data-direction="up" type="button" title="Move up"${upDisabled}>↑</button><button class="rf-v2-stage-reorder" data-action="rf-v2-reorder-stage" data-stage-id="${esc(stage.id)}" data-direction="down" type="button" title="Move down"${downDisabled}>↓</button>`;
}

function desktopWriteActionsHtml(trip, stage) {
  if (isArchivedTrip(trip)) return '';
  const dis = writeDisabledAttr();
  return `<button class="rf-d2-btn" data-action="rf-v2-edit-stage" data-stage-id="${esc(stage.id)}" type="button"${dis}>Edit</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-stage" data-stage-id="${esc(stage.id)}" type="button"${dis}>Delete</button>`;
}

function desktopStageActionsHtml(trip, stage) {
  const html = `${desktopNavigateHtml(trip, stage)}${desktopReorderHtml(trip, stage)}${desktopWriteActionsHtml(trip, stage)}`;
  return html ? `<div class="rf-d2-stage-actions">${html}</div>` : '';
}

function renderAside(trip, stage, { loadingHtml }) {
  if (STATE.wizard === 'stage') return renderStageWizard(trip);
  if (STATE.wizard === 'journal') return renderJournalWizard();
  if (!stage) return '<aside class="rf-d2-aside"><div class="rf-d2-empty">Select a stage.</div></aside>';
  const rawEntries = STATE.entriesByStage[stage.id];
  const entries = arr(rawEntries);
  const stageExpenses = expenses(trip.id).filter((e) => e.stage_id === stage.id);
  const tracks = stageTracks(trip.id, stage.id);
  return `<aside class="rf-d2-aside"><div class="rf-d2-aside-head"><div class="rf-d2-aside-kicker">Stage ${esc(stage.order_index || '')} · ${esc(fmtDate(stage.planned_date) || '')}</div><h2 class="rf-d2-aside-title">${esc(stage.start_location || 'Start')} <span style="font-style:italic;color:var(--rf-d2-muted)">to</span> ${esc(stage.end_location || 'End')}</h2><div class="rf-d2-aside-sub">${esc(stage.notes || '')}</div>${desktopStageActionsHtml(trip, stage)}</div>${desktopWeatherHtml(stage)}<div class="rf-d2-section-head"><div class="rf-d2-section-title">The day's notes</div><button class="rf-d2-btn is-primary" data-action="rf-d2-add-journal" type="button">+ Add</button></div>${rawEntries === 'loading' ? loadingHtml('Loading notes…') : entries.map(entryHtml).join('') || '<div class="rf-d2-mini-table">No entries yet.</div>'}<div class="rf-d2-section-head"><div class="rf-d2-section-title">Stage costs</div><button class="rf-d2-btn is-primary" data-action="rf-v2-add-stage-expense" data-stage-id="${esc(stage.id)}" type="button">+ Add</button></div><div class="rf-d2-mini-table">${stageExpenses.map(expenseMini).join('') || 'No costs assigned to this stage.'}</div><section class="rf-v2-gpx-section">${gpxPanelHtml(trip, stage, tracks)}</section></aside>`;
}

export function renderStages(trip, { hero, tabs, loadingHtml }) {
  const raw = rawStages(trip.id);
  if (raw === 'loading' || STATE.stagesLoading) {
    return `<main class="rf-d2-main">${hero(trip, { withStats: true })}${tabs('stages')}${loadingHtml('Loading stages…')}</main><aside class="rf-d2-aside">${loadingHtml('Loading detail…')}</aside>`;
  }
  const st = stages(trip.id);
  const selected = st.find((stage) => stage.id === STATE.selectedStageId) || st[0];
  return `<main class="rf-d2-main">${hero(trip, { withStats: true })}${tabs('stages')}<div class="rf-d2-section-head"><div class="rf-d2-section-title">${st.length} stages</div><button class="rf-d2-btn is-primary" data-action="rf-d2-add-stage" type="button">+ Add stage</button></div><div class="rf-d2-stage-list">${st.map((stage, i) => renderStageRow(stage, i, selected?.id)).join('')}<button class="rf-d2-btn is-dashed" data-action="rf-d2-add-stage" type="button">+ Add another stage</button></div></main>${renderAside(trip, selected, { loadingHtml })}`;
}
