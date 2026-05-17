// ============================================================
// routefolk — screens/render/desktop.js
// Desktop-only render overrides used by the production redesign.
// Keeps ui-enhancements.js as orchestration only.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import { fmtDate } from '../../utils/datetime.js';
import {
  currentTrip,
  fmtEuro,
  isDesktop,
  metricGrid,
  palettePanel,
  season,
  stages,
  stats,
  subtitle,
  tripNo,
} from './shared.js';

export function renderDesktopPalettePanel() {
  if (!STATE.user || !isDesktop() || STATE.tab !== 'account') return false;
  const main = document.querySelector('.rf-d2-main.is-account');
  if (!main || main.querySelector('.rf-clean-desktop-pref')) return false;
  const wrap = document.createElement('section');
  wrap.className = 'rf-clean-desktop-pref';
  wrap.innerHTML = palettePanel();
  main.insertBefore(wrap, main.querySelector('.rf-d2-version'));
  return true;
}

export function renderDesktopArchiveDetail() {
  if (!STATE.user || !isDesktop() || STATE.tab !== 'archive' || !STATE.selectedArchiveTripId) return false;
  const trip = currentTrip();
  const content = document.getElementById('content');
  if (!trip || !content || content.querySelector('.rf-clean-archive-detail')) return false;
  const s = stats(trip);
  content.innerHTML = `<div class="rf-d2-app"><aside class="rf-d2-sidebar"><div class="rf-d2-sidebar-head"><div class="rf-d2-sidebar-kicker">Routefolk</div><div class="rf-d2-sidebar-title">Field journal</div></div></aside><main class="rf-d2-main is-wide rf-clean-archive-detail"><button class="rf-d2-back" data-action="rf-d2-back-to-archive">← Archive</button><div class="rf-d2-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1 class="rf-d2-hero-title">${esc(trip.title || 'Untitled')}</h1><p class="rf-d2-hero-sub">${esc(subtitle(trip))}</p>${metricGrid([['Distance', Math.round(s.distance).toLocaleString(), 'km'], ['Spent', fmtEuro(s.spent), 'lifetime'], ['Stages', String(s.stages), 'days'], ['Entries', String(s.entries), 'journal']])}<h2>Archive summary</h2>${desktopSummaryTable(trip)}</main></div>`;
  return true;
}

function desktopSummaryTable(trip) {
  return `<div class="rf-clean-table"><div class="rf-clean-table-head"><span>Stage</span><span>Route</span><span>Date</span><span>Distance</span><span>Notes</span></div>${stages(trip.id).map((stage, index) => `<div class="rf-clean-table-row"><span>${index + 1}</span><strong>${esc(stage.start_location || 'Start')} to ${esc(stage.end_location || 'End')}</strong><span>${esc(fmtDate(stage.planned_date) || '—')}</span><span>${Math.round(Number(stage.distance_km) || 0)} km</span><span>${esc(stage.notes || '—')}</span></div>`).join('') || '<div class="rf-clean-empty">No stages.</div>'}</div>`;
}
