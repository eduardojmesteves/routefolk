// ============================================================
// routefolk — screens/v2/v2-wizards.js
// Production v2 wizard layer for write workflows not yet owned by
// the pure renderer. Keeps legacy modals out of the redesign.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import { createTrip } from '../../lib/trips.js';
import { createExpense } from '../../lib/expenses.js';
import { EXPENSE_CATEGORY_META } from '../../constants/app-constants.js';

const isDesktop = () => window.matchMedia('(min-width:960px)').matches;
const byId = (id) => document.getElementById(id);
const activeTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || STATE.selectedTripId)) || null;
const stagesForTrip = (tripId) => Array.isArray(STATE.stagesByTrip[tripId]) ? STATE.stagesByTrip[tripId] : [];
const expensesForTrip = (tripId) => Array.isArray(STATE.expensesByTrip[tripId]) ? STATE.expensesByTrip[tripId] : [];

function api() {
  return window.routefolkData || {};
}

function renderAll() {
  api().renderAll?.();
  window.__routefolkV2Render?.();
  requestAnimationFrame(renderWizardLayer);
}

function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function removeExisting() {
  document.querySelectorAll('.rf-v2-wizard-host, .rf-v2-cost-cta').forEach((node) => node.remove());
}

function injectCostCta() {
  const trip = activeTrip();
  if (!trip || STATE.tab !== 'trips' || STATE.view !== 'costs' || STATE.wizard) return;
  const target = document.querySelector('.rf-d2-ledger-hero, .rf-m2-ledger-hero');
  if (!target || target.querySelector('.rf-v2-cost-cta')) return;
  const wrap = document.createElement('div');
  wrap.className = 'rf-v2-cost-cta';
  wrap.innerHTML = '<button class="rf-d2-btn rf-v2-add-expense-btn is-primary" data-action="rf-v2-add-expense" type="button">+ Log expense</button>';
  target.appendChild(wrap);
}

function renderWizardLayer() {
  removeExisting();
  injectCostCta();
  if (!STATE.user || !STATE.wizard) return;
  if (!['trip', 'expense'].includes(STATE.wizard)) return;

  const host = document.createElement('div');
  host.className = `rf-v2-wizard-host ${isDesktop() ? 'is-desktop' : 'is-mobile'}`;
  host.innerHTML = STATE.wizard === 'trip' ? tripWizardHtml() : expenseWizardHtml();
  document.body.appendChild(host);
  const first = host.querySelector('input, select, textarea, button');
  if (first instanceof HTMLElement) first.focus({ preventScroll: true });
}

function tripWizardHtml() {
  return `<aside class="rf-v2-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="rf-v2-trip-title">
    <div class="rf-v2-wizard-head">
      <div class="rf-d2-aside-kicker">New trip</div>
      <h2 class="rf-d2-aside-title" id="rf-v2-trip-title">Plan a road journal</h2>
      <p class="rf-d2-aside-sub">Create the trip first. Stages, costs, GPX and notes come next.</p>
    </div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-title">Title</label><input class="rf-d2-input" id="v2-trip-title" placeholder="e.g. Pyrenees Crossing"></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-desc">Subtitle / short description</label><input class="rf-d2-input" id="v2-trip-desc" placeholder="Bordeaux to Barcelona"></div>
    <div class="rf-d2-form-row-pair">
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-start">Start</label><input class="rf-d2-input" id="v2-trip-start" type="date"></div>
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-end">End</label><input class="rf-d2-input" id="v2-trip-end" type="date"></div>
    </div>
    <div class="rf-d2-form-row-pair">
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-status">Status</label><select class="rf-d2-input" id="v2-trip-status"><option value="planning">Planning</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-visibility">Visibility</label><select class="rf-d2-input" id="v2-trip-visibility"><option value="group">Group</option><option value="private">Private</option></select></div>
    </div>
    <div class="rf-v2-wizard-error" id="v2-trip-error" hidden></div>
    <div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-v2-cancel-wizard" type="button">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-v2-save-trip" type="button">Create trip</button></div>
  </aside>`;
}

function expenseWizardHtml() {
  const trip = activeTrip();
  const stages = trip ? stagesForTrip(trip.id) : [];
  const categoryOptions = Object.entries(EXPENSE_CATEGORY_META).map(([key, meta]) => `<option value="${esc(key)}">${esc(meta.label)}</option>`).join('');
  const stageOptions = ['<option value="">Whole trip</option>', ...stages.map((stage, index) => `<option value="${esc(stage.id)}">${index + 1}. ${esc(stage.start_location || 'Start')} → ${esc(stage.end_location || 'End')}</option>`)].join('');
  const payerOptions = [STATE.user, ...STATE.profiles.filter((profile) => profile.id !== STATE.user?.id)]
    .filter(Boolean)
    .map((profile) => `<option value="${esc(profile.id)}">${esc(profile.full_name || profile.email || 'Rider')}</option>`)
    .join('');
  return `<aside class="rf-v2-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="rf-v2-expense-title">
    <div class="rf-v2-wizard-head">
      <div class="rf-d2-aside-kicker">New expense</div>
      <h2 class="rf-d2-aside-title" id="rf-v2-expense-title">Log an expense</h2>
      <p class="rf-d2-aside-sub">Keep it simple: category, amount, payer, date and optional stage.</p>
    </div>
    <div class="rf-d2-form-row-pair">
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-category">Category</label><select class="rf-d2-input" id="v2-expense-category">${categoryOptions}</select></div>
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-amount">Amount</label><input class="rf-d2-input" id="v2-expense-amount" inputmode="decimal" placeholder="42.80"></div>
    </div>
    <div class="rf-d2-form-row-pair">
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-payer">Paid by</label><select class="rf-d2-input" id="v2-expense-payer">${payerOptions}</select></div>
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-date">Date</label><input class="rf-d2-input" id="v2-expense-date" type="date" value="${esc(new Date().toISOString().slice(0, 10))}"></div>
    </div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-stage">Stage</label><select class="rf-d2-input" id="v2-expense-stage">${stageOptions}</select></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-description">Description</label><input class="rf-d2-input" id="v2-expense-description" placeholder="e.g. Fuel, lunch, lodging"></div>
    <div class="rf-v2-wizard-error" id="v2-expense-error" hidden></div>
    <div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-v2-cancel-wizard" type="button">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-v2-save-expense" type="button">Save expense</button></div>
  </aside>`;
}

function showError(id, error) {
  const node = byId(id);
  if (!node) return;
  node.textContent = error?.message || String(error || 'Something went wrong.');
  node.hidden = false;
}

async function saveTrip(event) {
  claim(event);
  const title = byId('v2-trip-title')?.value?.trim() || '';
  try {
    const trip = await createTrip({
      title,
      description: byId('v2-trip-desc')?.value?.trim() || '',
      start_date: byId('v2-trip-start')?.value || null,
      end_date: byId('v2-trip-end')?.value || null,
      status: byId('v2-trip-status')?.value || 'planning',
      visibility: byId('v2-trip-visibility')?.value || 'group',
    });
    STATE.trips = [trip, ...STATE.trips.filter((item) => item.id !== trip.id)];
    STATE.wizard = null;
    STATE.tab = 'trips';
    STATE.view = 'detail';
    STATE.viewTripId = trip.id;
    STATE.selectedTripId = trip.id;
    await api().openTrip?.(trip.id, 'detail');
    renderAll();
  } catch (error) {
    showError('v2-trip-error', error);
  }
}

async function saveExpense(event) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  try {
    const expense = await createExpense(trip.id, {
      category: byId('v2-expense-category')?.value || 'other',
      amount: byId('v2-expense-amount')?.value || '',
      user_id: byId('v2-expense-payer')?.value || STATE.user?.id,
      date: byId('v2-expense-date')?.value || null,
      stage_id: byId('v2-expense-stage')?.value || null,
      description: byId('v2-expense-description')?.value?.trim() || '',
    });
    STATE.expensesByTrip[trip.id] = [expense, ...expensesForTrip(trip.id)];
    STATE.wizard = null;
    await api().loadExpensesForTrip?.(trip.id, { quiet: true });
    renderAll();
  } catch (error) {
    showError('v2-expense-error', error);
  }
}

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action || '';

  if (action.endsWith('new-trip')) {
    claim(event);
    STATE.wizard = 'trip';
    renderAll();
    return;
  }

  if (action === 'rf-v2-add-expense') {
    claim(event);
    STATE.wizard = 'expense';
    renderAll();
    return;
  }

  if (action === 'rf-v2-cancel-wizard') {
    claim(event);
    STATE.wizard = null;
    renderAll();
    return;
  }

  if (action === 'rf-v2-save-trip') {
    await saveTrip(event);
    return;
  }

  if (action === 'rf-v2-save-expense') {
    await saveExpense(event);
  }
}, true);

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(renderWizardLayer));
window.addEventListener('resize', () => requestAnimationFrame(renderWizardLayer));
requestAnimationFrame(renderWizardLayer);
