// ============================================================
// routefolk — screens/render/mobile.js
// Clean mobile renderer used while the full base renderer is being
// consolidated. It owns mobile-only markup; no desktop concerns here.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import {
  DETAIL_TABS,
  currentPalette,
  currentTrip,
  expenses,
  items,
  season,
  stages,
  subtitle,
  tripNo,
} from './shared.js';
import { renderMobileAccount } from './account/account-mobile.js';
import { renderMobileCosts } from './trip-detail/costs-mobile.js';
import { renderMobileItems } from './trip-detail/packing-mobile.js';
import { renderMobileArchive } from './archive/archive-list-mobile.js';
import { renderMobileTrips } from './trips/trips-mobile.js';
import { renderMobileStages, renderMobileJournal } from './trip-detail/stages-mobile.js';
import { renderMobileSummary, renderMobileArchiveSummary } from './trip-detail/summary-mobile.js';


function bottomNav(active) {
  return `<nav class="rf-clean-bottom"><button class="${active === 'trips' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="trips">Trips</button><button class="${active === 'archive' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="archive">Archive</button><button class="${active === 'account' ? 'is-active' : ''}" data-action="rf-m2-nav" data-tab="account">You</button></nav>`;
}

function screen(inner, active = 'trips') {
  return `<div class="rf-clean-mobile"><div class="rf-clean-scroll">${inner}</div>${bottomNav(active)}</div>`;
}

function tripHeader(trip, active, backTo = 'trips', summaryOnly = false) {
  const backAction = backTo === 'archive' ? 'rf-m2-back-to-archive' : 'rf-m2-back-to-trips';
  const backLabel = backTo === 'archive' ? 'Archive' : 'Trips';
  const tabs = summaryOnly ? [['summary', 'Summary']] : DETAIL_TABS;
  return `<header class="rf-clean-trip-head"><button class="rf-clean-back" data-action="${backAction}">← ${backLabel}</button><div class="rf-clean-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1>${esc(trip.title || 'Untitled trip')}</h1><p>${esc(subtitle(trip))}</p><div class="rf-m2-detail-stamps">${statePillHtml(trip.status)}${stampHtml(trip.visibility || 'group', 'accent')}</div></header><nav class="rf-clean-tabs">${tabs.map(([key, label]) => `<button class="${active === key ? 'is-active' : ''}" data-action="rf-m2-tab" data-value="${key}">${label}</button>`).join('')}</nav>`;
}

function statusLabel(status) {
  if (status === 'active') return 'In progress';
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return 'Planning';
}

function stateKey(status) {
  if (status === 'active') return 'active';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'planning';
}

function statePillHtml(status) {
  return `<span class="rf-m2-state-pill is-state-${stateKey(status)}"><span class="rf-m2-state-pill-dot"></span>${esc(statusLabel(status))}</span>`;
}

function stampHtml(value, tone = '') {
  return `<span class="rf-m2-stamp ${tone ? `is-${tone}` : ''}">${esc(value)}</span>`;
}

function mobileTrips() {
  return renderMobileTrips(screen);
}

function mobileStages(trip) {
  return renderMobileStages(trip, { screen, tripHeader });
}

function mobileSummary(trip) {
  return renderMobileSummary(trip, { screen, tripHeader });
}

function mobileArchiveSummary(trip) {
  return renderMobileArchiveSummary(trip, { screen, tripHeader });
}

function mobileCosts(trip) {
  return renderMobileCosts(trip, { screen, tripHeader });
}

function mobileItems(trip) {
  return renderMobileItems(trip, { screen, tripHeader });
}

function mobileJournal(trip) {
  return renderMobileJournal(trip, { screen });
}

function mobileArchive() {
  return renderMobileArchive(screen);
}

function mobileAccount() {
  return renderMobileAccount(screen);
}

export function renderMobileMarkup() {
  const trip = currentTrip();
  if (STATE.tab === 'account') return mobileAccount();
  if (STATE.tab === 'archive') {
    if (trip) return mobileArchiveSummary(trip);
    return mobileArchive();
  }
  if (trip && STATE.view === 'journal') return mobileJournal(trip);
  if (trip && STATE.view === 'summary') return mobileSummary(trip);
  if (trip && STATE.view === 'costs') return mobileCosts(trip);
  if (trip && STATE.view === 'packing') return mobileItems(trip);
  if (trip) return mobileStages(trip);
  return mobileTrips();
}

export function mobileSignature() {
  const trip = currentTrip();
  return `${STATE.tab}:${STATE.view}:${trip?.id || ''}:${STATE.wizard || ''}:${STATE.tripSearch || ''}:${STATE.tripStatusFilter || ''}:${STATE.selectedCategoryKey || ''}:${STATE.itemStatusFilter || ''}:${STATE.itemViewMode || ''}:${STATE.archiveSearch || ''}:${STATE.archiveStatusFilter || ''}:${currentPalette()}:${JSON.stringify([STATE.trips.length, stages(trip?.id || '').length, expenses(trip?.id || '').length, items(trip?.id || '').length])}`;
}
