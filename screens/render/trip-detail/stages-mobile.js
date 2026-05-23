// ============================================================
// routefolk — screens/render/trip-detail/stages-mobile.js
// Mobile stage list + per-stage journal pane rendering.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import { fmtDate } from '../../../utils/datetime.js';
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

function selectedStage(trip) {
  const st = stages(trip.id);
  return st.find((stage) => stage.id === STATE.selectedStageId) || st[0] || null;
}

function mobileStageTracks(tripId, stageId) {
  const raw = STATE.gpxByTrip[tripId];
  return Array.isArray(raw) ? raw.filter((track) => track.stage_id === stageId) : [];
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stageHasCoords(stage) {
  return (numeric(stage?.start_lat) !== null && numeric(stage?.start_lng) !== null)
    || (numeric(stage?.end_lat) !== null && numeric(stage?.end_lng) !== null);
}

function forecastTempRange(forecast) {
  if (forecast?.tempMin != null && forecast?.tempMax != null) return `${Math.round(forecast.tempMin)}–${Math.round(forecast.tempMax)}°`;
  return '—';
}

function forecastMeta(forecast) {
  const precip = forecast?.precipProb != null
    ? `${Math.round(forecast.precipProb)}% rain`
    : forecast?.precipMm != null ? `${forecast.precipMm} mm rain` : 'rain —';
  const wind = forecast?.windKmh != null ? `${Math.round(forecast.windKmh)} km/h wind` : 'wind —';
  return `${precip} · ${wind}`;
}

function skyPointHtml(point) {
  const forecast = point.forecast;
  return `<span><strong>${esc(point.label)}</strong><br>${esc(forecast.icon || '·')}<br>${esc(forecastTempRange(forecast))}<small>${esc(forecastMeta(forecast))}</small></span>`;
}

function mobileSkyHtml(stage) {
  const result = STATE.forecastsByStage[stage.id];
  if (!stage?.planned_date) {
    return `<section class="rf-clean-sky"><strong>Sky advisory</strong><p>Set a planned date to see the weather forecast.</p></section>`;
  }
  if (!stageHasCoords(stage)) {
    return `<section class="rf-clean-sky"><strong>Sky advisory</strong><p>Weather unavailable. Edit the stage location so routefolk can store coordinates.</p></section>`;
  }
  if (result === 'loading' || result === undefined) {
    return `<section class="rf-clean-sky"><strong>Sky advisory</strong><p>Loading weather…</p></section>`;
  }
  if (!Array.isArray(result) || !result.length) {
    return `<section class="rf-clean-sky"><strong>Sky advisory</strong><p>Weather unavailable for this stage.</p></section>`;
  }
  const usable = result.filter((point) => point.forecast);
  if (!usable.length) {
    return `<section class="rf-clean-sky"><strong>Sky advisory</strong><p>No forecast available for this date.</p></section>`;
  }
  return `<section class="rf-clean-sky"><strong>Sky advisory</strong><div>${usable.map(skyPointHtml).join('')}</div><em>Weather by Open-Meteo</em></section>`;
}

export function renderMobileStages(trip, { screen, tripHeader }) {
  const st = stages(trip.id);
  return screen(`${tripHeader(trip, 'stages')}<main class="rf-clean-page">${st.map((stage, index) => `<button class="rf-clean-stage" data-action="rf-m2-open-stage" data-stage-id="${esc(stage.id)}"><span>${index + 1}</span><div><strong>${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</strong><small>${esc(day(stage.planned_date))} · ${Math.round(Number(stage.distance_km) || 0)} km · ${esc(fmtDate(stage.planned_date) || '')}</small>${stage.notes ? `<p>${esc(stage.notes)}</p>` : ''}</div></button>`).join('') || '<div class="rf-clean-empty">No stages yet.</div>'}<button class="rf-m2-btn is-dashed" data-action="rf-m2-add-stage">+ Add another stage</button></main>`);
}

export function renderMobileJournal(trip, { screen }) {
  const stage = selectedStage(trip);
  if (!stage) return screen('<main class="rf-clean-page"><div class="rf-clean-empty">No stage selected.</div></main>');
  const entries = arr(STATE.entriesByStage[stage.id]);
  const stageExpenses = expenses(trip.id).filter((expense) => expense.stage_id === stage.id);
  const tracks = mobileStageTracks(trip.id, stage.id);
  return screen(`<main class="rf-clean-page"><button class="rf-clean-back" data-action="rf-m2-back-to-stages">← ${esc(trip.title || 'Trip')}</button><div class="rf-clean-kicker">Stage · ${esc(fmtDate(stage.planned_date) || '')}</div><h1 class="rf-clean-title">${esc(stage.start_location || 'Start')} <em>to</em> ${esc(stage.end_location || 'End')}</h1><p>${esc(stage.notes || '')}</p>${mobileSkyHtml(stage)}<div class="rf-clean-section-head"><h2>The day's notes</h2><button data-action="rf-m2-add-journal">+ Add</button></div>${entries.map((entry, i) => `<article class="rf-clean-note"><span>${i + 1}</span><div><small>A ${esc(entry.entry_type || 'note')}</small><strong>${esc(entry.title || 'Untitled')}</strong>${entry.location ? `<em>at ${esc(entry.location)}</em>` : ''}</div></article>`).join('') || '<div class="rf-clean-empty">No entries yet.</div>'}<div class="rf-clean-section-head"><h2>Stage costs</h2><button data-action="rf-v2-add-stage-expense" data-stage-id="${esc(stage.id)}">+ Add</button></div>${stageExpenses.map((expense) => `<article class="rf-clean-expense"><div><strong>${esc(categoryLabel(expense.category))}</strong><small>${esc(payerName(expense.user_id))}</small></div><b>${fmtEuro(expense.amount || 0)}</b></article>`).join('') || '<div class="rf-clean-empty">No costs assigned to this stage.</div>'}<section class="rf-v2-gpx-section">${gpxPanelHtml(trip, stage, tracks)}</section></main>`);
}
