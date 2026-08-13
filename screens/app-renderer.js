// ============================================================
// routefolk — screens/app-renderer.js
// Render orchestrator only.
// Desktop markup lives in screens/render/desktop.js.
// Mobile markup lives in screens/render/mobile.js.
// ============================================================

import { STATE } from '../state/app-state.js';
import { renderDesktopMarkup, renderSignedOutMarkup } from './render/desktop.js';
import { renderMobileMarkup, mobileChrome } from './render/mobile.js';
import { isDesktop } from './render/shared.js';

let lastMarkup = '';
let lastChromeMarkup = '';

function loadingMarkup() {
  return isDesktop()
    ? '<div class="rf-desktop-app"><main class="rf-desktop-main"><div class="rf-desktop-empty is-loading">Loading…</div></main></div>'
    : '<div class="rf-clean-mobile"><div class="rf-clean-scroll"><main class="rf-clean-page"><div class="rf-clean-empty">Loading…</div></main></div></div>';
}

export function renderRoutefolk() {
  const app = document.getElementById('app');
  const content = document.getElementById('content');
  const chrome = document.getElementById('rf-mobile-chrome');
  if (!app || !content) return;

  app.classList.add('is-redesigned');

  let html = '';
  let chromeHtml = '';
  if (!STATE.user) html = renderSignedOutMarkup();
  else if (isDesktop()) html = renderDesktopMarkup();
  else {
    html = renderMobileMarkup() || loadingMarkup();
    chromeHtml = mobileChrome();
  }

  const next = `<div class="rf-root-host">${html}</div>`;
  if (next !== lastMarkup) {
    content.innerHTML = next;
    lastMarkup = next;
    if (STATE.tab === 'archive') requestAnimationFrame(() => document.dispatchEvent(new Event('routefolk:archive-map-refresh')));
  }
  if (chrome && chromeHtml !== lastChromeMarkup) {
    chrome.innerHTML = chromeHtml;
    lastChromeMarkup = chromeHtml;
  }
}

window.__routefolkRender = renderRoutefolk;
window.__routefolkWizardRender = renderRoutefolk;
document.addEventListener('routefolk:render', renderRoutefolk);
document.addEventListener('routefolk:wizard-render', renderRoutefolk);
window.addEventListener('resize', renderRoutefolk);
renderRoutefolk();
