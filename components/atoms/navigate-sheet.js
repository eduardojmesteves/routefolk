// ============================================================
// routefolk — navigate-sheet.js
// Mobile bottom sheet for choosing a navigation target.
// ============================================================

import { esc } from '../../utils/dom.js';

export function navigateSheetHtml(stage, sheetState) {
  if (!stage || !sheetState || sheetState.stageId !== stage.id) return '';
  const remember = sheetState.remember ? 'checked' : '';
  const waze = sheetState.wazeInstalled
    ? `<button class="rf-mobile-sheet-opt" data-action="rf-mobile-nav-open" data-stage-id="${esc(stage.id)}" data-target="waze" type="button"><strong>Waze</strong><span>Navigate to the destination</span></button>`
    : '';
  return `<div class="rf-mobile-sheet-backdrop" data-action="rf-mobile-close-nav-sheet">
    <section class="rf-mobile-sheet" role="dialog" aria-modal="true" aria-label="Choose navigation app" onclick="event.stopPropagation()">
      <div class="rf-mobile-sheet-grabber" aria-hidden="true"></div>
      <div class="rf-mobile-sheet-kicker">Navigate</div>
      <h2>Open route with</h2>
      <button class="rf-mobile-sheet-opt" data-action="rf-mobile-nav-open" data-stage-id="${esc(stage.id)}" data-target="google" type="button"><strong>Google Maps</strong><span>Open the route URL</span></button>
      ${waze}
      <button class="rf-mobile-sheet-opt" data-action="rf-mobile-nav-open" data-stage-id="${esc(stage.id)}" data-target="copy" type="button"><strong>Copy route URL</strong><span>Copy the Google Maps route</span></button>
      <label class="rf-mobile-sheet-check"><input type="checkbox" data-action="rf-mobile-toggle-nav-remember" ${remember}> Remember my choice</label>
      <button class="rf-mobile-sheet-row" data-action="rf-mobile-close-nav-sheet" type="button">Cancel</button>
    </section>
  </div>`;
}
