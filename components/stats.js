// ============================================================
// routefolk — components/stats.js
// Small reusable statistic item renderers.
// ============================================================

import { esc } from '../utils/dom.js';

export function statItemHtml(label, value) {
  return `
    <div class="trip-stat">
      <div class="trip-stat-value">${esc(value)}</div>
      <div class="trip-stat-label">${esc(label)}</div>
    </div>
  `;
}
