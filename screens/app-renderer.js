// ============================================================
// routefolk — screens/app-renderer.js
// Render orchestrator only.
// Desktop markup lives in screens/render/desktop.js.
// Mobile markup lives in screens/render/mobile.js.
// ============================================================

import { STATE } from '../state/app-state.js';
import { renderDesktopMarkup, renderSignedOutMarkup } from './render/desktop.js';
import { renderMobileMarkup } from './render/mobile.js';
import { isDesktop } from './render/shared.js';

let lastMarkup = '';

function loadingMarkup() {
  return isDesktop()
    ? '<div class="rf-d2-app"><main class="rf-d2-main"><div class="rf-d2-empty is-loading">Loading…</div></main></div>'
    : '<div class="rf-clean-mobile"><div class="rf-clean-scroll"><main class="rf-clean-page"><div class="rf-clean-empty">Loading…</div></main></div></div>';
}

export function renderRoutefolk() {
  const app = document.getElementById('app');
  const content = document.getElementById('content');
  if (!app || !content) return;

  app.classList.add('is-v2');

  let html = '';
  if (!STATE.user) html = renderSignedOutMarkup();
  else if (isDesktop()) html = renderDesktopMarkup();
  else html = renderMobileMarkup() || loadingMarkup();

  const next = `<div class="rf-v2-root-host">${html}</div>`;
  if (next !== lastMarkup) {
    content.innerHTML = next;
    lastMarkup = next;
    if (STATE.tab === 'archive') requestAnimationFrame(() => document.dispatchEvent(new Event('routefolk:archive-map-refresh')));
  }
}

window.__routefolkRender = renderRoutefolk;
window.__routefolkV2Render = renderRoutefolk;
document.addEventListener('routefolk:render', renderRoutefolk);
document.addEventListener('routefolk:v2-render', renderRoutefolk);
window.addEventListener('resize', renderRoutefolk);
renderRoutefolk();
