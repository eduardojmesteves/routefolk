// ============================================================
// routefolk — screens/production-fixes.js
// Production behaviour hardening for edge interactions and
// final UI refinement hooks.
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { fmtDate, fmtDateRange } from '../utils/datetime.js';
import { fmtEuro } from '../utils/format.js';

const arr = (value) => Array.isArray(value) ? value : [];
const currentTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || STATE.selectedTripId)) || null;
const stages = (tripId) => arr(STATE.stagesByTrip[tripId]);
const expenses = (tripId) => arr(STATE.expensesByTrip[tripId]);
const isDesktop = () => window.matchMedia('(min-width:960px)').matches;

function tripNo(trip) { return `No. ${String(Math.max(0, STATE.trips.findIndex((candidate) => candidate.id === trip?.id)) + 1).padStart(2, '0')}`; }
function subtitle(trip) { return trip?.description || fmtDateRange(trip?.start_date, trip?.end_date) || 'A road journal'; }
function season(trip) {
  const date = trip?.start_date ? new Date(`${trip.start_date}T00:00:00Z`) : null;
  const year = date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : new Date().getFullYear();
  const month = date && !Number.isNaN(date.getTime()) ? date.getUTCMonth() : 2;
  const name = month <= 1 || month === 11 ? 'Winter' : month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Autumn';
  return `${name} ${year}`;
}
function stats(trip) {
  const st = stages(trip.id);
  const ex = expenses(trip.id);
  const entries = st.reduce((sum, stage) => sum + arr(STATE.entriesByStage[stage.id]).length, 0);
  const distance = st.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0) || Number(trip.distance_km) || 0;
  const spent = ex.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  return { stages: st.length, entries, distance, spent };
}

function signedOutLanding() {
  if (STATE.user) return;
  const content = document.getElementById('content');
  if (!content || content.querySelector('.rf-v2-auth')) return;
  content.innerHTML = `<div class="rf-v2-auth"><section class="rf-v2-auth-card"><div class="rf-v2-auth-kicker">Routefolk</div><h1>Field journal for the road</h1><p>Plan routes, record stages, keep notes, costs, packing lists and GPX tracks in one road journal.</p><button class="rf-d2-btn is-primary rf-v2-auth-button" data-action="rf-d2-sign-in" type="button">Sign in with Google</button></section></div>`;
}

function entryRowsForStage(stage, ns) {
  const entries = arr(STATE.entriesByStage[stage.id]);
  if (!entries.length) return '';
  return entries.map((entry, entryIndex) => `<div class="rf-v2-summary-entry ${ns}-summary-entry"><span></span><span><em>${entryIndex + 1}. ${esc(entry.entry_type || 'note')}</em><strong>${esc(entry.title || 'Untitled entry')}</strong>${entry.location ? `<small>at ${esc(entry.location)}</small>` : ''}</span><span>${entry.timestamp ? esc(new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '—'}</span><span>Journal</span><span>${esc(entry.description || '—')}</span></div>`).join('');
}

function summaryTable(trip, ns = 'rf-d2') {
  const rows = stages(trip.id).map((stage, index) => `<div class="rf-v2-summary-row"><span>${index + 1}</span><span><strong>${esc(stage.start_location || 'Start')} to ${esc(stage.end_location || 'End')}</strong></span><span>${esc(fmtDate(stage.planned_date) || '—')}</span><span>${Math.round(Number(stage.distance_km) || 0)} km</span><span>${esc(stage.notes || '—')}</span></div>${entryRowsForStage(stage, ns)}`).join('');
  return `<div class="${ns}-table rf-v2-summary-table"><div class="rf-v2-summary-head"><span>Stage</span><span>Route / journal</span><span>Date / time</span><span>Distance / type</span><span>Status / notes</span></div>${rows || `<div class="${ns}-empty">No stages yet.</div>`}</div>`;
}

function patchSummary() {
  if (!STATE.user || STATE.view !== 'summary') return;
  const trip = currentTrip();
  if (!trip) return;
  const table = document.querySelector('.rf-d2-table:not(.rf-v2-summary-table), .rf-m2-table:not(.rf-v2-summary-table)');
  if (!table) return;
  const ns = table.className.includes('rf-m2') ? 'rf-m2' : 'rf-d2';
  const wrap = document.createElement('div');
  wrap.innerHTML = summaryTable(trip, ns);
  table.replaceWith(wrap.firstElementChild);
}

function sideNav() {
  return `<aside class="rf-d2-sidebar"><div class="rf-d2-sidebar-head"><div class="rf-d2-sidebar-kicker">Routefolk</div><div class="rf-d2-sidebar-title">Field journal</div></div><nav class="rf-d2-rail"><button class="rf-d2-rail-item" data-action="rf-d2-nav" data-tab="trips" type="button"><span class="rf-d2-rail-glyph">T</span><span class="rf-d2-rail-label">Trips</span></button><button class="rf-d2-rail-item is-active" data-action="rf-d2-nav" data-tab="archive" type="button"><span class="rf-d2-rail-glyph">A</span><span class="rf-d2-rail-label">Archive</span></button><button class="rf-d2-rail-item" data-action="rf-d2-nav" data-tab="account" type="button"><span class="rf-d2-rail-glyph">Y</span><span class="rf-d2-rail-label">You</span></button></nav></aside>`;
}
function archiveDetail(trip) {
  const s = stats(trip);
  return `<main class="rf-d2-main is-wide rf-v2-archive-detail"><button class="rf-d2-back" data-action="rf-d2-nav" data-tab="archive" type="button">← Archive</button><header class="rf-d2-hero"><div class="rf-d2-hero-top"><div><div class="rf-d2-kicker">${esc(tripNo(trip))} · ${esc(season(trip))}</div><h1 class="rf-d2-hero-title">${esc(trip.title || 'Untitled trip')}</h1><div class="rf-d2-hero-sub">${esc(subtitle(trip))}</div></div><div class="rf-d2-hero-stamps"><span class="rf-d2-state-pill is-${esc(trip.status || 'completed')}">${esc(trip.status || 'completed')}</span><div class="rf-v2-hero-actions"><button class="rf-d2-btn" data-action="rf-v2-edit-trip" type="button">Edit trip</button><button class="rf-d2-btn is-danger" data-action="rf-v2-delete-trip" type="button">Delete</button></div></div></div><div class="rf-d2-stat-grid"><div><span>Distance</span><strong>${Math.round(s.distance).toLocaleString()}</strong><small>km recorded</small></div><div><span>Spent</span><strong>${fmtEuro(s.spent)}</strong><small>lifetime</small></div><div><span>Stages</span><strong>${s.stages}</strong><small>days</small></div><div><span>Entries</span><strong>${s.entries}</strong><small>journal</small></div></div></header><div class="rf-d2-section-title">Archive summary</div>${summaryTable(trip)}</main>`;
}
function patchArchiveOpen() {
  const trip = currentTrip();
  if (!STATE.user || STATE.tab !== 'archive' || !trip) return;
  const content = document.getElementById('content');
  if (!content || content.querySelector('.rf-v2-archive-detail')) return;
  content.innerHTML = isDesktop() ? `<div class="rf-d2-app">${sideNav()}${archiveDetail(trip)}</div>` : `<div class="rf-m2-screen"><div class="rf-m2-body">${archiveDetail(trip).replaceAll('rf-d2', 'rf-m2').replace(/<main[^>]*>/, '').replace('</main>', '')}</div></div>`;
}

function patchHeroActions() {
  document.querySelectorAll('.rf-v2-hero-actions').forEach((node) => {
    const target = document.querySelector('.rf-d2-hero-stamps, .rf-m2-detail-stamps');
    if (target && !target.querySelector('.rf-v2-hero-actions')) target.appendChild(node);
  });
}

function parseUiDate(text) {
  if (!text) return null;
  const parsed = new Date(`${text} 00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function isSameLocalDate(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function patchTodayLabels() {
  const today = new Date();
  document.querySelectorAll('.rf-d2-stage-row, .rf-m2-stage').forEach((row) => {
    const stampNode = [...row.querySelectorAll('.rf-d2-stamp, .rf-m2-stamp')].find((node) => node.textContent.trim().toLowerCase() === 'today');
    if (!stampNode) return;
    const dateText = [...row.querySelectorAll('.rf-d2-stage-mono span, .rf-m2-stage-mono')].map((node) => node.textContent.trim()).find((value) => /\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/.test(value));
    const stageDate = parseUiDate(dateText);
    if (!isSameLocalDate(stageDate, today)) stampNode.remove();
  });
}

function patchStageCostsAdd() {
  const trip = currentTrip();
  const stageId = STATE.selectedStageId || stages(trip?.id || '')[0]?.id || '';
  document.querySelectorAll('.rf-d2-section-head, .rf-m2-section-head').forEach((head) => {
    const title = head.querySelector('.rf-d2-section-title, .rf-m2-section-title');
    if (!title || title.textContent.trim().toLowerCase() !== 'stage costs' || head.querySelector('[data-action="rf-v2-add-stage-expense"]')) return;
    const btn = document.createElement('button');
    btn.className = 'rf-d2-btn is-primary';
    btn.dataset.action = 'rf-v2-add-stage-expense';
    btn.dataset.stageId = stageId;
    btn.type = 'button';
    btn.textContent = '+ Add';
    head.appendChild(btn);
  });
}

function patchExpenseStageSelection() {
  if (STATE.wizard !== 'expense' || !STATE.editTargetId) return;
  const select = document.getElementById('v2-expense-stage');
  if (select && select.value !== STATE.editTargetId) select.value = STATE.editTargetId;
}

function memberSinceYear() {
  const profile = STATE.user?.id ? STATE.profilesById?.[STATE.user.id] : null;
  const date = STATE.user?.created_at || profile?.created_at || profile?.inserted_at || '';
  const year = date ? new Date(date).getFullYear() : null;
  return Number.isFinite(year) ? year : null;
}
function avatarUrl() {
  return STATE.user?.user_metadata?.avatar_url || STATE.user?.user_metadata?.picture || STATE.profilesById?.[STATE.user?.id]?.avatar_url || '';
}
function patchAccount() {
  if (!STATE.user || STATE.tab !== 'account') return;
  const accountCard = document.querySelector('.rf-d2-account-card, .rf-m2-account-card');
  if (!accountCard) return;
  const manage = accountCard.querySelector('[data-action="rf-d2-manage-google"], [data-action="rf-m2-manage-google"]');
  if (manage) {
    manage.textContent = 'Sign out';
    manage.dataset.action = manage.dataset.action?.startsWith('rf-m2') ? 'rf-m2-sign-out' : 'rf-d2-sign-out';
    manage.classList.add('is-signout');
  }
  document.querySelectorAll('.rf-d2-main.is-account > .rf-d2-btn[data-action$="sign-out"], .rf-m2-body > .rf-m2-btn[data-action$="sign-out"]').forEach((node) => node.remove());
  const avatar = accountCard.querySelector('.rf-d2-account-avatar, .rf-m2-account-avatar');
  const src = avatarUrl();
  if (avatar && src && !avatar.querySelector('img')) avatar.innerHTML = `<img src="${esc(src)}" alt="${esc(STATE.user?.user_metadata?.full_name || STATE.user?.email || 'User photo')}">`;
  const em = accountCard.querySelector('em');
  const year = memberSinceYear();
  if (em) em.textContent = year ? `Routefolk member since ${year}` : 'Routefolk member';
}

function patchPaletteControls() {
  const fab = document.getElementById('rf-paletteFab');
  const sheet = document.getElementById('rf-paletteSheet');
  if (!fab || !sheet || fab.dataset.rfFixed === '1') return;
  fab.dataset.rfFixed = '1';
  fab.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    sheet.hidden = !sheet.hidden;
  });
}

function run() {
  signedOutLanding();
  patchArchiveOpen();
  patchSummary();
  patchHeroActions();
  patchTodayLabels();
  patchStageCostsAdd();
  patchExpenseStageSelection();
  patchAccount();
  patchPaletteControls();
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-action="rf-v2-add-stage-expense"]');
  if (!btn) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  STATE.wizard = 'expense';
  STATE.editTargetId = btn.dataset.stageId || STATE.selectedStageId || null;
  window.routefolkData?.renderAll?.();
}, true);

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(run));
document.addEventListener('routefolk:render', () => requestAnimationFrame(run));
window.addEventListener('resize', () => requestAnimationFrame(run));
requestAnimationFrame(run);
