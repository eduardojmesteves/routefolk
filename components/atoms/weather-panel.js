// ============================================================
// routefolk — weather-panel.js
// Shared mobile/desktop v3 weather panel.
// ============================================================

import { esc } from '../../utils/dom.js';
import { fmtTime } from '../../utils/datetime.js';
import { wxCellHtml } from './wx-cell.js';
import { weatherHeadline } from '../../lib/weather-headline.js';

function fallbackMessage(stage, wx, prefix) {
  if (!stage?.planned_date) return `<section class="${prefix}-wx"><div class="${prefix}-wx-tag">Along the day</div><p>Set a planned date to see the weather forecast.</p></section>`;
  const hasCoords = stage?.start_lat != null || stage?.end_lat != null;
  if (!hasCoords) return `<section class="${prefix}-wx"><div class="${prefix}-wx-tag">Along the day</div><p>Weather unavailable. Edit the stage location so routefolk can store coordinates.</p></section>`;
  if (wx === 'loading' || wx === undefined) return `<section class="${prefix}-wx"><div class="${prefix}-wx-tag">Along the day</div><p>Loading weather…</p></section>`;
  return `<section class="${prefix}-wx"><div class="${prefix}-wx-tag">Along the day</div><p>Weather unavailable for this stage.</p></section>`;
}

export function weatherPanelHtml(stage, wx, { prefix = 'rf-m2' } = {}) {
  if (!wx || wx === 'loading' || !Array.isArray(wx?.waypoints) || !wx.waypoints.length) {
    return fallbackMessage(stage, wx, prefix);
  }

  const cells = wx.waypoints.map((w) => wxCellHtml(w, wx.headingDeg, prefix)).join('');
  if (!cells) return '';

  const headline = weatherHeadline(wx);
  const warnLine = headline
    ? `<div class="${prefix}-wx-warn-line"><b>Heads-up</b>${esc(headline)}</div>`
    : '';
  const start = wx.rideWindow?.start || '09:30';
  const end = wx.rideWindow?.end || '17:00';
  const fetched = fmtTime(wx.fetchedAt);

  return `<section class="${prefix}-wx">
    <div class="${prefix}-wx-tag">Along the day</div>
    <div class="${prefix}-wx-strip">${cells}</div>
    ${warnLine}
    <footer class="${prefix}-wx-foot">
      <span class="${prefix}-wx-window">day plan ${esc(start)} – ${esc(end)}</span>
      <span>Open-Meteo${fetched ? ` · ${esc(fetched)}` : ''}</span>
    </footer>
  </section>`;
}
