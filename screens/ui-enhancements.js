// ============================================================
// routefolk — screens/ui-enhancements.js
// Thin responsive UI orchestration layer.
// Heavy mobile markup lives in screens/render/mobile.js.
// Shared formatting helpers live in screens/render/shared.js.
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { fmtDate } from '../utils/datetime.js';
import { rememberArchiveContext, saveUiState } from '../state/ui-state.js';
import { renderMobileMarkup, mobileSignature } from './render/mobile.js';
import {
  currentTrip,
  isDesktop,
  isMobile,
  metricGrid,
  palettePanel,
  season,
  setPalette,
  stages,
  stats,
  subtitle,
  tripNo,
  fmtEuro,
} from './render/shared.js';

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

function desktopPalettePanel() {
  if (!STATE.user || !isDesktop() || STATE.tab !== 'account') return;
  const main = document.querySelector('.rf-d2-main.is-account');
  if (!main || main.querySelector('.rf-clean-desktop-pref')) return;
  const wrap = document.createElement('section');
  wrap.className = 'rf-clean-desktop-pref';
  wrap.innerHTML = palettePanel();
  main.insertBefore(wrap, main.querySelector('.rf-d2-version'));
}

function desktopArchiveDetail() {
  if (!STATE.user || !isDesktop() || STATE.tab !== 'archive' || !STATE.selectedArchiveTripId) return;
  const trip = currentTrip();
  const content = document.getElementById('content');
  if (!trip || !content || content.querySelector('.rf-clean-archive-detail')) return;
  const s = stats(trip);
  content.innerHTML = `<div class="rf-d2-app"><aside class="rf-d2-sidebar"><div class="rf-d2-sidebar-head"><div class="rf-d2-sidebar-kicker">Routefolk</div><div class="rf-d2-sidebar-title">Field journal</div></div></aside><main class="rf-d2-main is-wide rf-clean-archive-detail"><button class="rf-d2-back" data-action="rf-d2-back-to-archive">← Archive</button><div class="rf-d2-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1 class="rf-d2-hero-title">${esc(trip.title || 'Untitled')}</h1><p class="rf-d2-hero-sub">${esc(subtitle(trip))}</p>${metricGrid([['Distance', Math.round(s.distance).toLocaleString(), 'km'], ['Spent', fmtEuro(s.spent), 'lifetime'], ['Stages', String(s.stages), 'days'], ['Entries', String(s.entries), 'journal']])}<h2>Archive summary</h2>${desktopSummaryTable(trip)}</main></div>`;
}

function desktopSummaryTable(trip) {
  return `<div class="rf-clean-table"><div class="rf-clean-table-head"><span>Stage</span><span>Route</span><span>Date</span><span>Distance</span><span>Notes</span></div>${stages(trip.id).map((stage, index) => `<div class="rf-clean-table-row"><span>${index + 1}</span><strong>${esc(stage.start_location || 'Start')} to ${esc(stage.end_location || 'End')}</strong><span>${esc(fmtDate(stage.planned_date) || '—')}</span><span>${Math.round(Number(stage.distance_km) || 0)} km</span><span>${esc(stage.notes || '—')}</span></div>`).join('') || '<div class="rf-clean-empty">No stages.</div>'}</div>`;
}

function run() {
  if (!patchMobile()) {
    desktopArchiveDetail();
    desktopPalettePanel();
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
