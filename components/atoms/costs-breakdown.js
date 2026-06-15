// ============================================================
// routefolk — components/atoms/costs-breakdown.js
// S1 — shared "breakdown" card: label → amount rows with a
// proportional bar under each, scaled to the largest amount.
// Rendered twice per Costs tab (by category, by payer) on both
// the mobile (rf-m2) and desktop (rf-d2) surfaces.
// ============================================================

import { esc } from '../../utils/dom.js';
import { fmtEuro } from '../../utils/format.js';

/**
 * @param {Map<string, number>} map  label → amount (agg.cat / agg.payer)
 * @param {{kind:'category'|'payer', prefix:'rf-m2'|'rf-d2', heading?:string}} opts
 * @returns {string} HTML, or '' when the map is empty
 */
export function costsBreakdownHtml(map, { kind, prefix, heading } = {}) {
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '';
  const max = rows[0][1] || 1;
  const isM2 = prefix === 'rf-m2';
  const cls = isM2 ? 'rf-clean-breakdown' : 'rf-d2-breakdown';
  const payer = kind === 'payer' ? ' is-payer' : '';
  const head = isM2 && heading ? `<strong>${esc(heading)}</strong>` : '';
  return `<section class="${cls}${payer}">${head}`
    + rows.map(([label, amount]) => {
      const pct = Math.round((amount / max) * 100);
      return `<div class="br-row"><span>${esc(label)}</span><b>${fmtEuro(amount)}</b></div>`
        + `<div class="bar"><i style="width:${pct}%"></i></div>`;
    }).join('')
    + `</section>`;
}
