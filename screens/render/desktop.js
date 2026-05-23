// ============================================================
// routefolk — screens/render/desktop.js
// Full desktop renderer for the production redesign.
// No mobile rendering, no post-render patching.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import { writeDisabledAttr } from '../../utils/write-guards.js';
import { STATUS_META } from '../../constants/app-constants.js';
import {
  DETAIL_TABS,
  currentTrip,
  fmtEuro,
  initials,
  lifetime,
  season,
  stats,
  subtitle,
  tripNo,
  userName,
} from './shared.js';
import { renderAccount, renderSignedOutMarkup } from './account/account-desktop.js';
import { renderCosts as renderCostsImpl } from './trip-detail/costs-desktop.js';
import { renderItems as renderItemsImpl } from './trip-detail/packing-desktop.js';
import { renderArchive as renderArchiveImpl } from './archive/archive-list-desktop.js';
import {
  renderTripList as renderTripListImpl,
  renderLanding as renderLandingImpl,
  activeTrips as activeTripsImpl,
} from './trips/trips-desktop.js';
import { renderStages as renderStagesImpl } from './trip-detail/stages-desktop.js';
import { renderSummary as renderSummaryImpl, summaryTable } from './trip-detail/summary-desktop.js';

export { renderSignedOutMarkup };

function tripView() { if (STATE.view === 'summary') return 'summary'; if (STATE.view === 'costs') return 'costs'; if (STATE.view === 'packing') return 'items'; if (STATE.view === 'journal') return 'journal'; return 'stages'; }
function statusName(status) { return STATUS_META[status]?.label || String(status || 'Planning'); }
function loadingHtml(label = 'Loading…') { return `<div class="rf-d2-empty is-loading">${esc(label)}</div>`; }
function errorHtml(error) { return error ? `<div class="rf-d2-empty is-error">${esc(error)}</div>` : ''; }
function statePill(status) { return `<span class="rf-d2-state-pill is-${esc(status || 'planning')}"><span class="rf-d2-state-dot"></span>${esc(statusName(status))}</span>`; }
function stamp(text, kind = 'primary') { return `<span class="rf-d2-stamp is-${esc(kind)}">${esc(text)}</span>`; }
const activeTrips = activeTripsImpl;
function filters(options, active, action = 'status-filter') { return `<div class="rf-d2-pills">${options.map(([key, label]) => `<button class="rf-d2-pill ${active === key ? 'is-active' : ''}" data-action="rf-d2-${action}" data-value="${esc(key)}" type="button">${esc(label)}</button>`).join('')}</div>`; }
function search(open, value) { return open ? `<div class="rf-d2-search"><input type="search" data-action="rf-d2-search-input" value="${esc(value || '')}" placeholder="Search by name"><button class="rf-d2-search-close" data-action="rf-d2-search-toggle" type="button">×</button></div>` : `<button class="rf-d2-search-btn" data-action="rf-d2-search-toggle" type="button" aria-label="Search">⌕</button>`; }
function tabs(active) { return `<nav class="rf-d2-selector-tabs">${DETAIL_TABS.map(([key, label]) => `<button class="rf-d2-selector-tab ${active === key ? 'is-active' : ''}" data-action="rf-d2-tab" data-value="${key}" type="button">${esc(label)}</button>`).join('')}</nav>`; }
function heroActions(trip) {
  if (!trip || STATE.viewTripId !== trip.id) return '';
  const dis = writeDisabledAttr();
  return `<div class="rf-v2-hero-actions"><button class="rf-d2-btn" data-action="rf-v2-edit-trip" type="button"${dis}>Edit trip</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-trip" type="button"${dis}>Delete</button></div>`;
}
function hero(trip, opts = {}) { const { withStats = false, backAction = 'rf-d2-back-to-trips' } = opts; const s = stats(trip); const visibility = trip.visibility === 'private' ? 'Private' : 'Group'; return `<header class="rf-d2-hero"><div class="rf-d2-hero-top"><div><button class="rf-d2-back" data-action="${backAction}" type="button">← ${backAction.includes('archive') ? 'Archive' : 'Trips'}</button><div class="rf-d2-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1 class="rf-d2-hero-title">${esc(trip.title || 'Untitled trip')}</h1><div class="rf-d2-hero-sub">${esc(subtitle(trip))}</div></div><div class="rf-d2-hero-stamps">${statePill(trip.status)}${stamp(visibility,'accent')}</div>${heroActions(trip)}</div>${withStats ? `<div class="rf-d2-stat-grid"><div><span>Distance</span><strong>${Math.round(s.distance).toLocaleString()}</strong><small>km recorded</small></div><div><span>Spent</span><strong>${fmtEuro(s.spent)}</strong><small>so far</small></div><div><span>Stages</span><strong>${s.stages}</strong><small>days</small></div><div><span>Entries</span><strong>${s.entries}</strong><small>journal</small></div></div>` : ''}</header>`; }

export function renderDesktopMarkup() { if (STATE.tripsLoading && !STATE.trips.length) return `<div class="rf-d2-app"><main class="rf-d2-main">${loadingHtml('Loading trips…')}</main></div>`; if (STATE.tripsError) return `<div class="rf-d2-app"><main class="rf-d2-main">${errorHtml(STATE.tripsError)}</main></div>`; const trip = currentTrip(); const thirdPane = STATE.tab === 'trips' && !!trip; let body = ''; if (STATE.tab === 'archive') body = renderArchive(); else if (STATE.tab === 'account') body = renderAccount(); else if (!trip) body = renderTripList(null) + renderLanding(); else body = renderTripList(trip.id) + renderTripView(trip); return `<div class="rf-d2-app ${thirdPane ? 'is-3-pane' : ''}">${renderSidebar(thirdPane)}${body}</div>`; }
function renderSidebar(collapsed) { const l = lifetime(); return `<aside class="rf-d2-sidebar ${collapsed ? 'is-collapsed' : ''}"><div class="rf-d2-sidebar-head">${collapsed ? '<div class="rf-d2-sidebar-mark">r</div><div class="rf-d2-sidebar-mark-sub">routefolk</div>' : '<div class="rf-d2-sidebar-kicker">Routefolk</div><div class="rf-d2-sidebar-title">Field journal</div>'}</div><nav class="rf-d2-rail">${[['trips','T','Trips'],['archive','A','Archive'],['account','Y','You']].map(([key,glyph,label])=>`<button class="rf-d2-rail-item ${STATE.tab===key?'is-active':''}" data-action="rf-d2-nav" data-tab="${key}" type="button"><span class="rf-d2-rail-glyph">${glyph}</span><span class="rf-d2-rail-label">${label}</span></button>`).join('')}</nav><div class="rf-d2-sidebar-spacer"></div><div class="rf-d2-lifetime"><div class="rf-d2-lifetime-kicker">Lifetime</div><div class="rf-d2-lifetime-row"><span>${l.trips}</span><span>${Math.round(l.distance).toLocaleString()}</span></div><div class="rf-d2-lifetime-labels"><span>Trips</span><span>km</span></div></div><div class="rf-d2-user"><span class="rf-d2-user-avatar">${esc(initials())}</span><span class="rf-d2-user-meta"><strong>${esc(userName())}</strong></span></div></aside>`; }
function renderTripList(selected) { return renderTripListImpl(selected, { filters, search, statePill }); }
function renderLanding() { return renderLandingImpl({ hero }); }
function renderTripView(trip) { const view = tripView(); if (view === 'summary') return renderSummary(trip); if (view === 'costs') return renderCosts(trip); if (view === 'items') return renderItems(trip); return renderStages(trip); }
function renderStages(trip) { return renderStagesImpl(trip, { hero, tabs, loadingHtml }); }
function renderSummary(trip) { return renderSummaryImpl(trip, { hero, tabs }); }
function renderCosts(trip) { return renderCostsImpl(trip, { hero, tabs, stamp }); }
function renderItems(trip) { return renderItemsImpl(trip, { hero, tabs, stamp, filters, loadingHtml }); }
function renderArchive() { return renderArchiveImpl({ hero, summaryTable, filters, search, stamp, loadingHtml }); }
