// ============================================================
// routefolk — components/stats.js
// Small reusable statistic item renderers.
// Phase 3: adds reusable ledger-stat class.
// ============================================================

import { esc } from '../utils/dom.js';

export function statItemHtml(label, value) {
  return `
    <div class="trip-stat rf-stat">
      <div class="trip-stat-value">${esc(value)}</div>
      <div class="trip-stat-label">${esc(label)}</div>
    </div>
  `;
}
