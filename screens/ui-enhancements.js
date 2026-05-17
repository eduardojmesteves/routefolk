// ============================================================
// routefolk — screens/ui-enhancements.js
// Thin responsive UI coordinator.
// Mobile markup lives in screens/render/mobile.js.
// Desktop overrides live in screens/render/desktop.js.
// Shared helpers live in screens/render/shared.js.
// ============================================================

import { STATE } from '../state/app-state.js';
import { rememberArchiveContext, saveUiState } from '../state/ui-state.js';
import { renderDesktopArchiveDetail, renderDesktopPalettePanel } from './render/desktop.js';
import { renderMobileMarkup, mobileSignature } from './render/mobile.js';
import { isMobile, setPalette } from './render/shared.js';

function api() { return window.routefolkData || {}; }
function renderAll() { saveUiState(); api().renderAll?.(); }

function patchMobile() {
  if (!STATE.user || !isMobile()) return false;
  const content = document.getElementById('content');
  if (!content) return false;
  const html = renderMobileMarkup();
  if (!html) return false;
  const signature = mobileSignature();
  if (content.dataset.rfCleanMobile === signature) return true;
  content.innerHTML = html;
  content.dataset.rfCleanMobile = signature;
  if (STATE.tab === 'archive') {
    requestAnimationFrame(() => document.dispatchEvent(new Event('routefolk:archive-map-refresh')));
  }
  return true;
}

function run() {
  if (!patchMobile()) {
    renderDesktopArchiveDetail();
    renderDesktopPalettePanel();
  }
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const palette = target?.closest('[data-action="rf-palette-select"]');
  if (palette) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setPalette(palette.dataset.palette || 'midnight');
    document.getElementById('content')?.removeAttribute('data-rf-clean-mobile');
    renderAll();
    run();
    return;
  }

  const back = target?.closest('[data-action="rf-d2-back-to-archive"], [data-action="rf-m2-back-to-archive"]');
  if (back) {
    event.preventDefault();
    event.stopImmediatePropagation();
    rememberArchiveContext(null, 'list');
    api().ensureArchiveData?.().finally(() => renderAll());
  }
}, true);

document.addEventListener('routefolk:render', () => requestAnimationFrame(run));
document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(run));
window.addEventListener('resize', () => requestAnimationFrame(run));
requestAnimationFrame(run);
