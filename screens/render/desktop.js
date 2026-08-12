// ============================================================
// routefolk — screens/render/desktop.js
// Full desktop renderer for the production redesign.
// No mobile rendering, no post-render patching.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import { STATUS_META } from '../../constants/app-constants.js';
import {
  DETAIL_TABS,
  currentTrip,
  fmtEuro,
  initials,
  lifetime,
  offlineBannerHtml,
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
function loadingHtml(label = 'Loading…') { return `<div class="rf-desktop-empty is-loading">${esc(label)}</div>`; }
function errorHtml(error) { return error ? `<div class="rf-desktop-empty is-error">${esc(error)}</div>` : ''; }
function statePill(status) { return `<span class="rf-desktop-state-pill is-${esc(status || 'planning')}"><span class="rf-desktop-state-dot"></span>${esc(statusName(status))}</span>`; }
function stamp(text, kind = 'primary') { return `<span class="rf-desktop-stamp is-${esc(kind)}">${esc(text)}</span>`; }
const activeTrips = activeTripsImpl;
function filters(options, active, action = 'status-filter') { return `<div class="rf-desktop-pills">${options.map(([key, label]) => `<button class="rf-desktop-pill ${active === key ? 'is-active' : ''}" data-action="rf-desktop-${action}" data-value="${esc(key)}" type="button">${esc(label)}</button>`).join('')}</div>`; }
function search(open, value) { return open ? `<div class="rf-desktop-search"><input type="search" data-action="rf-desktop-search-input" value="${esc(value || '')}" placeholder="Search by name"><button class="rf-desktop-search-close" data-action="rf-desktop-search-toggle" type="button">×</button></div>` : `<button class="rf-desktop-search-btn" data-action="rf-desktop-search-toggle" type="button" aria-label="Search">⌕</button>`; }
function tabs(active) { return `<nav class="rf-desktop-selector-tabs">${DETAIL_TABS.map(([key, label]) => `<button class="rf-desktop-selector-tab ${active === key ? 'is-active' : ''}" data-action="rf-desktop-tab" data-value="${key}" type="button">${esc(label)}</button>`).join('')}</nav>`; }
function hero(trip, opts = {}) { const { withStats = false, backAction = 'rf-desktop-back-to-trips' } = opts; const s = stats(trip); const visibility = trip.visibility === 'private' ? 'Private' : 'Group'; return `<header class="rf-desktop-hero"><div class="rf-desktop-hero-top"><div><button class="rf-desktop-back" data-action="${backAction}" type="button">← ${backAction.includes('archive') ? 'Archive' : 'Trips'}</button><div class="rf-desktop-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1 class="rf-desktop-hero-title">${esc(trip.title || 'Untitled trip')}</h1><div class="rf-desktop-hero-sub">${esc(subtitle(trip))}</div></div><div class="rf-desktop-hero-stamps">${statePill(trip.status)}${stamp(visibility,'accent')}</div></div>${withStats ? `<div class="rf-desktop-stat-grid"><div><span>Distance</span><strong>${Math.round(s.distance).toLocaleString()}</strong><small>km recorded</small></div><div><span>Spent</span><strong>${fmtEuro(s.spent)}</strong><small>so far</small></div><div><span>Stages</span><strong>${s.stages}</strong><small>days</small></div><div><span>Entries</span><strong>${s.entries}</strong><small>journal</small></div></div>` : ''}</header>`; }

export function renderDesktopMarkup() { if (STATE.tripsLoading && !STATE.trips.length) return `<div class="rf-desktop-app"><main class="rf-desktop-main">${loadingHtml('Loading trips…')}</main></div>`; if (STATE.tripsError) return `<div class="rf-desktop-app"><main class="rf-desktop-main">${errorHtml(STATE.tripsError)}</main></div>`; const trip = currentTrip(); const thirdPane = STATE.tab === 'trips' && !!trip; let body = ''; if (STATE.tab === 'archive') body = renderArchive(); else if (STATE.tab === 'account') body = renderAccount(); else if (!trip) body = renderTripList(null) + renderLanding(); else body = renderTripList(trip.id) + renderTripView(trip); return `${offlineBannerHtml()}<div class="rf-desktop-app ${thirdPane ? 'is-3-pane' : ''}">${renderSidebar()}${body}</div>`; }
// Nav shell (Route Atlas): the rail always starts collapsed to a 64px
// icon strip and expands to 220px on hover via CSS only (see
// .rf-desktop-sidebar.is-collapsed:hover in shell.css) — it no longer
// collapses/expands based on whether a 3rd pane (trip detail) is open.
function renderSidebar() { const l = lifetime(); return `<aside class="rf-desktop-sidebar is-collapsed"><div class="rf-desktop-sidebar-head"><div class="rf-desktop-sidebar-mark">r</div><div class="rf-desktop-sidebar-mark-sub">routefolk</div></div><nav class="rf-desktop-rail">${[['trips','T','Trips'],['archive','A','Archive'],['account','Y','You']].map(([key,glyph,label])=>`<button class="rf-desktop-rail-item ${STATE.tab===key?'is-active':''}" data-action="rf-desktop-nav" data-tab="${key}" type="button"><span class="rf-desktop-rail-glyph">${glyph}</span><span class="rf-desktop-rail-label">${label}</span></button>`).join('')}</nav><div class="rf-desktop-sidebar-spacer"></div><div class="rf-desktop-lifetime"><div class="rf-desktop-lifetime-kicker">Lifetime</div><div class="rf-desktop-lifetime-row"><span>${l.trips}</span><span>${Math.round(l.distance).toLocaleString()}</span></div><div class="rf-desktop-lifetime-labels"><span>Trips</span><span>km</span></div></div><div class="rf-desktop-user"><span class="rf-desktop-user-avatar">${esc(initials())}</span><span class="rf-desktop-user-meta"><strong>${esc(userName())}</strong></span></div></aside>`; }
function renderTripList(selected) { return renderTripListImpl(selected, { filters, search, statePill }); }
function renderLanding() { return renderLandingImpl({ hero }); }
function renderTripView(trip) { const view = tripView(); if (view === 'summary') return renderSummary(trip); if (view === 'costs') return renderCosts(trip); if (view === 'items') return renderItems(trip); return renderStages(trip); }
function renderStages(trip) { return renderStagesImpl(trip, { hero, tabs, loadingHtml }); }
function renderSummary(trip) { return renderSummaryImpl(trip, { hero, tabs }); }
function renderCosts(trip) { return renderCostsImpl(trip, { hero, tabs, stamp }); }
function renderItems(trip) { return renderItemsImpl(trip, { hero, tabs, stamp, filters, loadingHtml }); }
function renderArchive() { return renderArchiveImpl({ hero, summaryTable, filters, search, stamp, loadingHtml }); }
