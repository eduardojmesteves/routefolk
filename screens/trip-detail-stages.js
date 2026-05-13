// ============================================================
// routefolk — screens/trip-detail-stages.js
// Trip Detail stage, journal, weather, and GPX rendering.
//
// This module is still UI-only. Data loading and write handlers stay in app.js
// until the Trip Detail area is split into smaller controller modules.
// ============================================================

import { trackFileName } from '../lib/gpx.js';
import { STATE } from '../state/app-state.js';
import { ENTRY_TYPE_META } from '../constants/app-constants.js';
import { esc } from '../utils/dom.js';
import { linkHostBadgeHtml } from '../utils/url.js';
import { fmtDate, fmtDateTime, isStageDateOutsideTrip } from '../utils/datetime.js';
import { fmtDuration, fmtKm } from '../utils/format.js';
import { displayNameForUserId, authorInitials, authorLabel } from '../utils/user.js';
import { errorCard } from '../components/feedback.js';

function canWrite() {
  return STATE.isOnline !== false;
}

function writeDisabledAttr() {
  return canWrite() ? '' : ' disabled';
}

function auditLineHtml(record, label = 'Last edited') {
  if (!record?.updated_by || !record?.updated_at) return '';
  const who = displayNameForUserId(record.updated_by);
  return `<div class="audit-line">${esc(label)} by ${esc(who)} · ${esc(fmtDateTime(record.updated_at))}</div>`;
}

function weatherStripHtml(stage) {
  const result = STATE.forecastsByStage[stage.id];
  const hasAnyCoords =
    (typeof stage.start_lat === 'number' && typeof stage.start_lng === 'number') ||
    (typeof stage.end_lat === 'number' && typeof stage.end_lng === 'number');

  if (!hasAnyCoords) {
    const hasLocationText = Boolean(stage.start_location || stage.end_location);
    return hasLocationText && stage.planned_date
      ? `<div class="weather-strip muted">Weather unavailable. Check the stage location names or try again later.</div>`
      : '';
  }
  if (!stage.planned_date) return `<div class="weather-strip muted">Set a planned date to see the weather forecast.</div>`;
  if (result === 'loading' || result === undefined) return `<div class="weather-strip muted">Loading weather…</div>`;
  if (!result.length) return `<div class="weather-strip muted">Weather unavailable for this stage. Check the location names or try again later.</div>`;

  const usable = result.filter((p) => p.forecast);
  if (!usable.length) return `<div class="weather-strip muted">No forecast available for this date (max 16 days ahead).</div>`;

  const points = usable.map((p) => {
    const f = p.forecast;
    const tempRange = (f.tempMin != null && f.tempMax != null)
      ? `${Math.round(f.tempMin)}–${Math.round(f.tempMax)}°`
      : '—';
    const precip = (f.precipProb != null)
      ? `${Math.round(f.precipProb)}%`
      : (f.precipMm != null ? `${f.precipMm} mm` : '—');
    const wind = f.windKmh != null ? `${Math.round(f.windKmh)} km/h` : '—';
    return `
      <div class="wx-point">
        <div class="wx-label">${esc(p.label)}</div>
        <div class="wx-icon" title="${esc(f.label)}">${f.icon}</div>
        <div class="wx-temp">${esc(tempRange)}</div>
        <div class="wx-meta">💧 ${esc(precip)} · 💨 ${esc(wind)}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="weather-strip">
      <div class="wx-points">${points}</div>
      <div class="wx-attribution">Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></div>
    </div>
  `;
}

function entryCardHtml(entry) {
  const meta = ENTRY_TYPE_META[entry.entry_type] || ENTRY_TYPE_META.note;
  const location = entry.location_url
    ? `<a class="entry-meta-link" href="${esc(entry.location_url)}" target="_blank" rel="noopener">📍 ${esc(entry.location || 'Location')}${linkHostBadgeHtml(entry.location_url)}</a>`
    : (entry.location ? `<span>📍 ${esc(entry.location)}</span>` : '');

  return `
    <div class="entry-card">
      <div class="entry-head">
        <div class="entry-type-icon" title="${esc(meta.label)}">${meta.icon}</div>
        <div class="entry-head-text">
          ${entry.title ? `<div class="entry-title">${esc(entry.title)}</div>` : `<div class="entry-title entry-title-muted">${esc(meta.label)}</div>`}
          <div class="entry-meta">
            <span class="entry-author" title="${esc(authorLabel(entry.author_id))}">${esc(authorInitials(entry.author_id))}</span>
            ${entry.timestamp ? `<span>${esc(fmtDateTime(entry.timestamp))}</span>` : ''}
            ${location}
          </div>
        </div>
        <div class="entry-actions">
          <button class="entry-icon-btn" data-entry-action="edit" data-id="${esc(entry.id)}" title="Edit"${writeDisabledAttr()}>✎</button>
          <button class="entry-icon-btn entry-icon-danger" data-entry-action="delete" data-id="${esc(entry.id)}" title="Delete"${writeDisabledAttr()}>✕</button>
        </div>
      </div>
      ${entry.description ? `<div class="entry-desc">${esc(entry.description)}</div>` : ''}
      ${entryLinksHtml(entry)}
    </div>
  `;
}

function entryLinksHtml(entry) {
  const links = [];
  if (entry.info_url) links.push(`<a class="entry-link" href="${esc(entry.info_url)}" target="_blank" rel="noopener">🔗 Website ${linkHostBadgeHtml(entry.info_url)}</a>`);
  if (entry.photo_album_url) links.push(`<a class="entry-link" href="${esc(entry.photo_album_url)}" target="_blank" rel="noopener">📷 Photo album ${linkHostBadgeHtml(entry.photo_album_url)}</a>`);
  return links.length ? `<div class="entry-links">${links.join('')}</div>` : '';
}

function journalSectionHtml(stage) {
  const expanded = STATE.expandedStages.has(stage.id);
  const entries = STATE.entriesByStage[stage.id];
  const count = Array.isArray(entries) ? entries.length : null;

  const summary = `
    <button class="journal-toggle" data-stage-id="${esc(stage.id)}">
      <span>${expanded ? '▾' : '▸'} Journal${count !== null ? ` (${count})` : ''}</span>
    </button>
  `;

  if (!expanded) return summary;

  let body;
  if (entries === 'loading' || entries === undefined) {
    body = `<div class="empty-sub" style="padding:8px 0;">Loading entries…</div>`;
  } else if (!entries.length) {
    body = `<div class="empty-sub" style="padding:8px 0;">No entries yet.</div>`;
  } else {
    body = `<div class="entry-list">${entries.map(entryCardHtml).join('')}</div>`;
  }

  return `
    ${summary}
    <div class="journal-body">
      ${body}
      <button class="btn btn-secondary btn-sm btn-block" data-stage-add-entry="${esc(stage.id)}" style="margin-top:8px;"${writeDisabledAttr()}>+ Add entry</button>
    </div>
  `;
}

function gpxTracksForTrip(tripId) {
  const tracks = STATE.gpxByTrip[tripId];
  return Array.isArray(tracks) ? tracks : [];
}

function gpxTracksForStage(trip, stage) {
  return gpxTracksForTrip(trip.id).filter((track) => track.stage_id === stage.id);
}

function gpxTrackMeta(track) {
  const parts = [];
  if (track.distance_km != null) parts.push(fmtKm(track.distance_km));
  if (track.duration_seconds != null) parts.push(fmtDuration(track.duration_seconds));
  return parts.join(' · ');
}

function gpxUploadButtonHtml(stage, label = 'Upload GPX') {
  return `
    <button class="btn btn-secondary btn-sm gpx-upload-btn" data-stage-gpx-upload="${esc(stage.id)}"${writeDisabledAttr()}>
      ${esc(label)}
    </button>
  `;
}

function gpxStageSectionHtml(stage, trip) {
  const tracksRaw = STATE.gpxByTrip[trip.id];
  const tracks = gpxTracksForStage(trip, stage);
  const expanded = STATE.expandedGpxStages.has(stage.id);
  const totalDistance = tracks.reduce((sum, track) => sum + (Number(track.distance_km) || 0), 0);
  const summary = tracksRaw === 'loading' || STATE.gpxLoading
    ? 'Loading…'
    : tracks.length
      ? `${tracks.length} track${tracks.length === 1 ? '' : 's'}${totalDistance ? ` · ${fmtKm(totalDistance)}` : ''}`
      : 'No track yet';

  let body = '';
  if (expanded) {
    if (tracksRaw === 'loading' || STATE.gpxLoading) {
      body = `<div class="empty-sub gpx-section-body">Loading GPX tracks…</div>`;
    } else if (!tracks.length) {
      body = `
        <div class="gpx-section-body">
          <div class="empty-sub">Upload one or more GPX files for this stage. Multiple files are expected when GPS recording was stopped during breaks.</div>
          <div class="gpx-actions-row">${gpxUploadButtonHtml(stage, 'Upload GPX')}</div>
        </div>
      `;
    } else {
      body = `
        <div class="gpx-track-list gpx-section-body">
          ${tracks.map((track) => `
            <div class="gpx-track-row">
              <div class="gpx-track-main">
                <div class="gpx-track-name">${esc(trackFileName(track))}</div>
                <div class="gpx-track-meta">${esc(gpxTrackMeta(track) || 'GPX track')}</div>
              </div>
              <button class="entry-icon-btn entry-icon-danger" data-gpx-action="delete" data-id="${esc(track.id)}" title="Delete GPX"${writeDisabledAttr()}>✕</button>
            </div>
          `).join('')}
        </div>
        <div class="gpx-actions-row">${gpxUploadButtonHtml(stage, 'Upload another GPX')}</div>
      `;
    }
  }

  return `
    <div class="gpx-section ${expanded ? 'open' : ''}">
      <div class="gpx-section-head">
        <button class="gpx-summary-toggle" data-gpx-toggle="${esc(stage.id)}" aria-expanded="${expanded ? 'true' : 'false'}">
          <span class="gpx-caret">${expanded ? '▾' : '▸'}</span>
          <span class="gpx-summary-copy">
            <span class="gpx-section-title">GPX</span>
            <span class="gpx-summary-text">${esc(summary)}</span>
          </span>
        </button>
      </div>
      ${STATE.gpxError ? `<div class="stage-warn">${esc(STATE.gpxError)}</div>` : ''}
      ${body}
    </div>
  `;
}

function stageNavigateUrl(stage) {
  return stage.custom_route_url || stage.gmaps_url || null;
}

function stageRouteLabel(stage, index = 0) {
  return [stage.start_location, stage.end_location].filter(Boolean).join(' → ') || stage.title || `Stage ${index + 1}`;
}

function stageDateWarningHtml(stage, trip) {
  if (!isStageDateOutsideTrip(stage, trip)) return '';
  return `<div class="stage-warn">Planned date is outside the trip date range.</div>`;
}

function stageCardHtml(stage, trip, index, total) {
  const route = stageRouteLabel(stage, index);
  const meta = [];
  if (stage.planned_date) meta.push(fmtDate(stage.planned_date));
  if (stage.distance_km != null) meta.push(`${stage.distance_km} km`);
  const hasCoords = stage.start_lat != null && stage.start_lng != null;
  const navUrl = stageNavigateUrl(stage);

  return `
    <div class="stage-card">
      <div class="stage-card-row">
        <div class="stage-order">
          <button class="stage-order-btn" data-stage-action="up" data-id="${esc(stage.id)}" ${index === 0 || !canWrite() ? 'disabled' : ''} title="Move up">↑</button>
          <button class="stage-order-btn" data-stage-action="down" data-id="${esc(stage.id)}" ${index === total - 1 || !canWrite() ? 'disabled' : ''} title="Move down">↓</button>
        </div>
        <div class="stage-body">
          <div class="stage-title">${esc(route)}</div>
          ${meta.length ? `<div class="stage-meta">${esc(meta.join(' · '))}</div>` : ''}
          ${stage.notes ? `<div class="stage-notes">${esc(stage.notes)}</div>` : ''}
          ${auditLineHtml(stage, 'Edited')}
          ${stageDateWarningHtml(stage, trip)}
          ${!hasCoords ? `<div class="stage-warn">No coordinates — type a city name and we'll look it up automatically.</div>` : ''}
        </div>
      </div>
      ${weatherStripHtml(stage)}
      ${gpxStageSectionHtml(stage, trip)}
      <div class="stage-actions">
        ${navUrl ? `<a class="btn btn-secondary btn-sm" href="${esc(navUrl)}" target="_blank" rel="noopener">Navigate</a>` : ''}
        <button class="btn btn-secondary btn-sm" data-stage-action="edit" data-id="${esc(stage.id)}"${writeDisabledAttr()}>Edit</button>
        <button class="btn btn-danger btn-sm" data-stage-action="delete" data-id="${esc(stage.id)}"${writeDisabledAttr()}>Delete</button>
      </div>
      <div class="journal-section">
        ${journalSectionHtml(stage)}
      </div>
    </div>
  `;
}

export function renderStagesSection(trip) {
  const stages = STATE.stagesByTrip[trip.id];

  if (STATE.stagesLoading && !stages) return `<div class="empty-sub">Loading stages…</div>`;
  if (STATE.stagesError) return errorCard(STATE.stagesError, 'retryStagesBtn');

  if (!stages || !stages.length) {
    return `
      <div class="empty-sub" style="margin-bottom:12px;">No stages yet. Add one to start planning the route.</div>
      <button class="btn btn-primary btn-block" id="addStageBtn"${writeDisabledAttr()}>+ Add stage</button>
    `;
  }

  return `
    <div class="stage-list">
      ${stages.map((s, i) => stageCardHtml(s, trip, i, stages.length)).join('')}
    </div>
    <button class="btn btn-primary btn-block" style="margin-top:12px;" id="addStageBtn"${writeDisabledAttr()}>+ Add stage</button>
  `;
}
