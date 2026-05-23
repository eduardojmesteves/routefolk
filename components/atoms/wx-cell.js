// ============================================================
// routefolk — wx-cell.js
// One Start/Mid/End weather cell for the shared weather panel.
// ============================================================

import { esc } from '../../utils/dom.js';
import { wxIcon } from './wx-icon.js';

const LABELS = { start: 'Start', mid: 'Mid', end: 'End' };
const ARROWS = ['down', 'down-left', 'left', 'up-left', 'up', 'up-right', 'right', 'down-right'];
const ARROW_SYMBOLS = {
  down: '↓',
  'down-left': '↙',
  left: '←',
  'up-left': '↖',
  up: '↑',
  'up-right': '↗',
  right: '→',
  'down-right': '↘',
};

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value) {
  const n = number(value);
  return n == null ? null : Math.round(n);
}

function tempText(tempC) {
  if (tempC && typeof tempC === 'object') {
    const lo = round(tempC.lo);
    const hi = round(tempC.hi);
    if (lo != null && hi != null) return `${lo}–${hi}°`;
    if (lo != null) return `${lo}°`;
    if (hi != null) return `${hi}°`;
    return '—';
  }
  const single = round(tempC);
  return single == null ? '—' : `${single}°`;
}

function relativeArrow(windDeg, headingDeg) {
  const wind = number(windDeg);
  const heading = number(headingDeg);
  if (wind == null || heading == null) return ARROW_SYMBOLS.up;
  const rel = ((wind - heading + 360) % 360);
  const index = Math.floor(((rel + 22.5) % 360) / 45);
  return ARROW_SYMBOLS[ARROWS[index]] || ARROW_SYMBOLS.up;
}

export function wxCellHtml(w, headingDeg, prefix = 'rf-m2') {
  if (!w || typeof w !== 'object') return '';
  const mark = String(w.mark || '').toLowerCase();
  const label = LABELS[mark] || 'Point';
  const wind = round(w.windKmh);
  const gust = round(w.gustKmh);
  const precip = round(w.precipPct);
  const warnClass = w.warn ? ' is-warn' : '';
  const windText = wind == null ? 'wind —' : `${relativeArrow(w.windDeg, headingDeg)} ${wind} km/h`;
  const gustLine = gust != null && gust >= 45 ? `<div class="${prefix}-wx-gust">gust ${gust} km/h</div>` : '';
  const precipLine = !w.warn && precip != null && precip >= 5 ? `<div class="${prefix}-wx-precip">rain ${precip}%</div>` : '';

  return `<article class="${prefix}-wx-cell${warnClass}">
    <div class="${prefix}-wx-loc"><b>${esc(label)}</b></div>
    <div class="${prefix}-wx-icon">${wxIcon(w.kind || 'cloud', 22)}</div>
    <div class="${prefix}-wx-temp">${esc(tempText(w.tempC))}</div>
    <div class="${prefix}-wx-wind">${esc(windText)}</div>
    ${gustLine}${precipLine}
  </article>`;
}
