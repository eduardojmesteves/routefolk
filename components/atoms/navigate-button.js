// ============================================================
// routefolk — navigate-button.js
// State-aware Navigate button for mobile and desktop stage detail.
// ============================================================

import { esc } from '../../utils/dom.js';
import { stageRouteUrl } from '../../utils/navigation-url.js';

function hasCoords(stage) {
  return stage?.start_lat != null || stage?.end_lat != null || stage?.start_location || stage?.end_location;
}

export function navigateButtonHtml(stage, {
  online,
  kind = 'desktop',
  archived = false,
} = {}) {
  if (archived) return '';

  const url = stageRouteUrl(stage);
  if (!url && !hasCoords(stage)) {
    return `<button class="rf-nav-btn rf-nav-add" data-action="rf-mobile-add-route" data-stage-id="${esc(stage?.id || '')}" type="button">+ Add route</button>`;
  }

  if (online === false) {
    return `<button class="rf-nav-btn rf-nav-disabled" type="button" disabled title="Navigation needs a network connection.">Navigate ↗</button><small class="rf-nav-explainer">Navigation needs a network connection.</small>`;
  }

  if (kind === 'desktop') {
    return `<a class="rf-nav-btn rf-nav-default" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Navigate ↗</a>`;
  }

  const remembered = (() => {
    try { return localStorage.getItem('rf_nav_default'); } catch { return null; }
  })();
  const action = remembered ? 'rf-mobile-nav-direct' : 'rf-mobile-open-nav-sheet';
  const defaultAttr = remembered ? ` data-target="${esc(remembered)}"` : '';
  return `<button class="rf-nav-btn rf-nav-default" data-action="${action}" data-stage-id="${esc(stage?.id || '')}"${defaultAttr} type="button">Navigate ↗</button>`;
}
