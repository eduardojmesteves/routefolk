
// ============================================================
// routefolk — journal-form.js
// Journal entry form rendering, time toggle, and form reading.
// ============================================================

import { $, esc } from '../utils/dom.js';
import { validateEntryUrls } from '../utils/url.js';
import {
  fmtDate,
  datetimeLocalToIso,
  journalDefaultTimeLocal,
} from '../utils/datetime.js';
import { ENTRY_TYPE_META } from '../constants/app-constants.js';

export function entryFormHtml(entry = {}, stage = null) {
  const selectedType = entry.entry_type || 'stop';
  const hasStageDate = Boolean(stage?.planned_date);
  const hasTime = Boolean(entry.timestamp);
  const timeValue = hasStageDate ? journalDefaultTimeLocal(entry) : '';
  const dateHelp = hasStageDate
    ? `This entry belongs to ${esc(fmtDate(stage.planned_date))}. Add a time only if it matters.`
    : 'This stage has no planned date, so no journal time can be added yet.';

  return `
    <div class="form-row">
      <label class="form-label" for="jfType">Type</label>
      <select class="sel" id="jfType">
        ${Object.entries(ENTRY_TYPE_META).map(([key, m]) =>
          `<option value="${esc(key)}" ${selectedType === key ? 'selected' : ''}>${esc(m.icon)} ${esc(m.label)}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-row">
      <label class="form-label" for="jfTitle">Title</label>
      <input class="inp" id="jfTitle" maxlength="120" value="${esc(entry.title || '')}" placeholder="e.g. Coffee stop, Hotel, Viewpoint">
    </div>
    <div class="form-row">
      <label class="form-label" for="jfDesc">Description</label>
      <textarea class="txt" id="jfDesc" maxlength="4000" placeholder="What happened here?">${esc(entry.description || '')}</textarea>
    </div>
    <div class="form-row">
      <label class="form-label" for="jfLocation">Location name</label>
      <input class="inp" id="jfLocation" maxlength="160" value="${esc(entry.location || '')}" placeholder="e.g. Hotel Lisboa, The old pub, Miradouro">
    </div>
    <div class="form-row">
      <label class="form-label" for="jfLocationUrl">Maps URL (optional)</label>
      <input class="inp" id="jfLocationUrl" value="${esc(entry.location_url || '')}" placeholder="https://maps.app.goo.gl/...">
      <div class="form-help">Google Maps link for where this entry happened.</div>
    </div>
    <div class="form-row">
      <label class="form-label" for="jfInfoUrl">Website URL (optional)</label>
      <input class="inp" id="jfInfoUrl" value="${esc(entry.info_url || '')}" placeholder="https://example.com/...">
      <div class="form-help">Booking.com, restaurant website, pub page, TripAdvisor, or any useful HTTPS link.</div>
    </div>
    <div class="form-row">
      <label class="form-label">When</label>
      <div class="form-help">${dateHelp}</div>
      <label class="choice-option" style="margin-top:8px;">
        <input type="checkbox" id="jfUseTime" ${hasTime ? 'checked' : ''}${hasStageDate ? '' : ' disabled'}>
        <span>
          <strong>Add a specific time</strong>
          <small>Leave this off unless the exact time matters.</small>
        </span>
      </label>
      <div id="jfTimeWrap" style="margin-top:8px;${hasTime && hasStageDate ? '' : 'display:none;'}">
        <input class="inp" id="jfTime" type="time" value="${esc(timeValue)}"${hasStageDate ? '' : ' disabled'}>
      </div>
    </div>
    <div class="form-row">
      <label class="form-label" for="jfAlbum">Photo album URL (optional)</label>
      <input class="inp" id="jfAlbum" value="${esc(entry.photo_album_url || '')}" placeholder="https://photos.app.goo.gl/...">
      <div class="form-help">External album link. Must start with https://.</div>
    </div>
  `;
}


export function bindEntryTimeToggle() {
  const checkbox = $('jfUseTime');
  const timeWrap = $('jfTimeWrap');
  const timeInput = $('jfTime');
  if (!checkbox || !timeWrap || !timeInput) return;

  const sync = () => {
    const enabled = checkbox.checked && !checkbox.disabled;
    timeWrap.style.display = enabled ? 'block' : 'none';
    timeInput.disabled = !enabled;
    if (enabled && !timeInput.value) timeInput.value = journalDefaultTimeLocal();
  };

  checkbox.addEventListener('change', sync);
  sync();
}


export function readEntryForm(stage = null) {
  const useTime = Boolean($('jfUseTime')?.checked);
  const rawTime = $('jfTime')?.value || '';
  let timestamp = null;

  if (stage?.planned_date && useTime) {
    if (!rawTime) throw new Error('Enter a journal entry time or turn off the time option.');
    timestamp = datetimeLocalToIso(`${stage.planned_date}T${rawTime}`);
  }

  const fields = {
    entry_type: $('jfType')?.value || 'stop',
    title: $('jfTitle')?.value.trim() || '',
    description: $('jfDesc')?.value.trim() || '',
    location: $('jfLocation')?.value.trim() || '',
    location_url: $('jfLocationUrl')?.value.trim() || '',
    info_url: $('jfInfoUrl')?.value.trim() || '',
    timestamp,
    photo_album_url: $('jfAlbum')?.value.trim() || '',
  };

  validateEntryUrls(fields);
  return fields;
}

