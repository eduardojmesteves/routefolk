// ============================================================
// routefolk — screens/wizards.js
// Production wizard layer for write workflows not yet owned by the
// pure renderer. Keeps legacy modals out of the redesigned UI.
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { createTrip, updateTrip, deleteTrip } from '../lib/trips.js';
import { createStage, updateStage, deleteStage } from '../lib/stages.js';
import { createEntry, updateEntry, deleteEntry } from '../lib/journal.js';
import { createExpense } from '../lib/expenses.js';
import { EXPENSE_CATEGORY_META } from '../constants/app-constants.js';

const isDesktop = () => window.matchMedia('(min-width:960px)').matches;
const byId = (id) => document.getElementById(id);
const activeTrip = () => STATE.trips.find((trip) => trip.id === (STATE.viewTripId || STATE.selectedTripId)) || null;
const stagesForTrip = (tripId) => Array.isArray(STATE.stagesByTrip[tripId]) ? STATE.stagesByTrip[tripId] : [];
const expensesForTrip = (tripId) => Array.isArray(STATE.expensesByTrip[tripId]) ? STATE.expensesByTrip[tripId] : [];
const selectedStage = () => {
  const trip = activeTrip();
  if (!trip) return null;
  return stagesForTrip(trip.id).find((stage) => stage.id === (STATE.editTargetId || STATE.selectedStageId)) || stagesForTrip(trip.id)[0] || null;
};
const entriesForStage = (stageId) => Array.isArray(STATE.entriesByStage[stageId]) ? STATE.entriesByStage[stageId] : [];
const selectedEntry = () => {
  const stage = selectedStage();
  if (!stage) return null;
  return entriesForStage(stage.id).find((entry) => entry.id === STATE.editTargetId) || null;
};

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
  document.querySelectorAll('.rf-v2-wizard-host, .rf-v2-cost-cta, .rf-v2-hero-actions, .rf-v2-stage-actions, .rf-v2-entry-actions').forEach((node) => node.remove());
}

function injectTripActions() {
  const trip = activeTrip();
  if (!trip || STATE.tab !== 'trips' || !STATE.viewTripId || STATE.wizard) return;
  const target = document.querySelector('.rf-d2-hero .rf-d2-hero-top, .rf-m2-detail-hero');
  if (!target || target.querySelector('.rf-v2-hero-actions')) return;
  const wrap = document.createElement('div');
  wrap.className = 'rf-v2-hero-actions';
  wrap.innerHTML = `
    <button class="rf-d2-btn" data-action="rf-v2-edit-trip" type="button">Edit trip</button>
    <button class="rf-d2-btn is-danger" data-action="rf-v2-delete-trip" type="button">Delete</button>
  `;
  target.appendChild(wrap);
}

function injectStageActions() {
  const stage = selectedStage();
  if (!stage || STATE.wizard || STATE.view !== 'detail') return;
  const target = document.querySelector('.rf-d2-aside-head, .rf-m2-aside-head');
  if (!target || target.querySelector('.rf-v2-stage-actions')) return;
  const wrap = document.createElement('div');
  wrap.className = 'rf-v2-stage-actions';
  wrap.innerHTML = `
    <button class="rf-d2-btn" data-action="rf-v2-edit-stage" data-stage-id="${esc(stage.id)}" type="button">Edit stage</button>
    <button class="rf-d2-btn is-danger" data-action="rf-v2-delete-stage" data-stage-id="${esc(stage.id)}" type="button">Delete</button>
  `;
  target.appendChild(wrap);
}

function injectEntryActions() {
  if (STATE.wizard) return;
  document.querySelectorAll('.rf-d2-entry, .rf-m2-entry').forEach((entryNode) => {
    if (entryNode.querySelector('.rf-v2-entry-actions')) return;
    const title = entryNode.querySelector('.rf-d2-entry-title, .rf-m2-entry-title')?.textContent?.trim();
    const stage = selectedStage();
    const entry = stage ? entriesForStage(stage.id).find((candidate) => (candidate.title || 'Untitled') === title) : null;
    if (!entry) return;
    const wrap = document.createElement('div');
    wrap.className = 'rf-v2-entry-actions';
    wrap.innerHTML = `
      <button class="rf-d2-btn" data-action="rf-v2-edit-entry" data-entry-id="${esc(entry.id)}" type="button">Edit</button>
      <button class="rf-d2-btn is-danger" data-action="rf-v2-delete-entry" data-entry-id="${esc(entry.id)}" type="button">Delete</button>
    `;
    entryNode.appendChild(wrap);
  });
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
  injectTripActions();
  injectStageActions();
  injectEntryActions();
  injectCostCta();
  if (!STATE.user || !STATE.wizard) return;
  if (!['trip', 'trip-edit', 'stage-edit', 'journal-edit', 'expense'].includes(STATE.wizard)) return;

  const host = document.createElement('div');
  host.className = `rf-v2-wizard-host ${isDesktop() ? 'is-desktop' : 'is-mobile'}`;
  host.innerHTML = wizardHtml();
  document.body.appendChild(host);
  const first = host.querySelector('input, select, textarea, button');
  if (first instanceof HTMLElement) first.focus({ preventScroll: true });
}

function wizardHtml() {
  if (STATE.wizard === 'trip' || STATE.wizard === 'trip-edit') return tripWizardHtml(STATE.wizard === 'trip-edit');
  if (STATE.wizard === 'stage-edit') return stageEditWizardHtml();
  if (STATE.wizard === 'journal-edit') return journalEditWizardHtml();
  return expenseWizardHtml();
}

function tripWizardHtml(editing = false) {
  const trip = editing ? activeTrip() : null;
  const saveAction = editing ? 'rf-v2-update-trip' : 'rf-v2-save-trip';
  const title = editing ? 'Edit road journal' : 'Plan a road journal';
  const kicker = editing ? 'Edit trip' : 'New trip';
  return `<aside class="rf-v2-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="rf-v2-trip-title">
    <div class="rf-v2-wizard-head">
      <div class="rf-d2-aside-kicker">${kicker}</div>
      <h2 class="rf-d2-aside-title" id="rf-v2-trip-title">${title}</h2>
      <p class="rf-d2-aside-sub">Stages, costs, GPX and notes stay attached to this trip.</p>
    </div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-title">Title</label><input class="rf-d2-input" id="v2-trip-title" value="${esc(trip?.title || '')}" placeholder="e.g. Pyrenees Crossing"></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-desc">Subtitle / short description</label><input class="rf-d2-input" id="v2-trip-desc" value="${esc(trip?.description || '')}" placeholder="Bordeaux to Barcelona"></div>
    <div class="rf-d2-form-row-pair">
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-start">Start</label><input class="rf-d2-input" id="v2-trip-start" type="date" value="${esc(trip?.start_date || '')}"></div>
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-end">End</label><input class="rf-d2-input" id="v2-trip-end" type="date" value="${esc(trip?.end_date || '')}"></div>
    </div>
    <div class="rf-d2-form-row-pair">
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-status">Status</label><select class="rf-d2-input" id="v2-trip-status">${option('planning', 'Planning', trip?.status)}${option('active', 'Active', trip?.status)}${option('completed', 'Completed', trip?.status)}${option('cancelled', 'Cancelled', trip?.status)}</select></div>
      <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-trip-visibility">Visibility</label><select class="rf-d2-input" id="v2-trip-visibility">${option('group', 'Group', trip?.visibility || 'group')}${option('private', 'Private', trip?.visibility)}</select></div>
    </div>
    <div class="rf-v2-wizard-error" id="v2-trip-error" hidden></div>
    <div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-v2-cancel-wizard" type="button">Cancel</button><button class="rf-d2-btn is-primary" data-action="${saveAction}" type="button">${editing ? 'Save changes' : 'Create trip'}</button></div>
  </aside>`;
}

function stageEditWizardHtml() {
  const stage = selectedStage();
  if (!stage) return emptyWizard('No stage selected.');
  return `<aside class="rf-v2-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="rf-v2-stage-title">
    <div class="rf-v2-wizard-head"><div class="rf-d2-aside-kicker">Edit stage</div><h2 class="rf-d2-aside-title" id="rf-v2-stage-title">Adjust the route leg</h2></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-stage-from-edit">From</label><input class="rf-d2-input" id="v2-stage-from-edit" value="${esc(stage.start_location || '')}"></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-stage-to-edit">To</label><input class="rf-d2-input" id="v2-stage-to-edit" value="${esc(stage.end_location || '')}"></div>
    <div class="rf-d2-form-row-pair"><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-stage-date-edit">Date</label><input class="rf-d2-input" id="v2-stage-date-edit" type="date" value="${esc(stage.planned_date || '')}"></div><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-stage-km-edit">Distance km</label><input class="rf-d2-input" id="v2-stage-km-edit" inputmode="decimal" value="${esc(stage.distance_km ?? '')}"></div></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-stage-route-edit">Custom Google Maps URL</label><input class="rf-d2-input" id="v2-stage-route-edit" value="${esc(stage.custom_route_url || '')}" placeholder="https://www.google.com/maps/..."></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-stage-notes-edit">Notes</label><textarea class="rf-d2-textarea" id="v2-stage-notes-edit">${esc(stage.notes || '')}</textarea></div>
    <div class="rf-v2-wizard-error" id="v2-stage-error" hidden></div>
    <div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-v2-cancel-wizard" type="button">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-v2-update-stage" type="button">Save stage</button></div>
  </aside>`;
}

function journalEditWizardHtml() {
  const entry = selectedEntry();
  if (!entry) return emptyWizard('No journal entry selected.');
  const local = entry.timestamp ? new Date(entry.timestamp) : null;
  const time = local && !Number.isNaN(local.getTime()) ? String(local.getHours()).padStart(2, '0') + ':' + String(local.getMinutes()).padStart(2, '0') : '';
  return `<aside class="rf-v2-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="rf-v2-entry-title">
    <div class="rf-v2-wizard-head"><div class="rf-d2-aside-kicker">Edit entry</div><h2 class="rf-d2-aside-title" id="rf-v2-entry-title">Refine the note</h2></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-entry-type-edit">Type</label><select class="rf-d2-input" id="v2-entry-type-edit">${option('note', 'Note', entry.entry_type)}${option('stop', 'Stop', entry.entry_type)}${option('meal', 'Meal', entry.entry_type)}${option('drink', 'Drink', entry.entry_type)}${option('lodging', 'Lodging', entry.entry_type)}${option('other', 'Other', entry.entry_type)}</select></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-entry-title-edit">Title</label><input class="rf-d2-input" id="v2-entry-title-edit" value="${esc(entry.title || '')}"></div>
    <div class="rf-d2-form-row-pair"><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-entry-place-edit">Place</label><input class="rf-d2-input" id="v2-entry-place-edit" value="${esc(entry.location || '')}"></div><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-entry-time-edit">Time</label><input class="rf-d2-input" id="v2-entry-time-edit" type="time" value="${esc(time)}"></div></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-entry-note-edit">Description</label><textarea class="rf-d2-textarea" id="v2-entry-note-edit">${esc(entry.description || '')}</textarea></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-entry-location-url-edit">Maps URL</label><input class="rf-d2-input" id="v2-entry-location-url-edit" value="${esc(entry.location_url || '')}" placeholder="https://www.google.com/maps/..."></div>
    <div class="rf-v2-wizard-error" id="v2-entry-error" hidden></div>
    <div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-v2-cancel-wizard" type="button">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-v2-update-entry" type="button">Save entry</button></div>
  </aside>`;
}

function expenseWizardHtml() {
  const trip = activeTrip();
  const stages = trip ? stagesForTrip(trip.id) : [];
  const categoryOptions = Object.entries(EXPENSE_CATEGORY_META).map(([key, meta]) => `<option value="${esc(key)}">${esc(meta.label)}</option>`).join('');
  const stageOptions = ['<option value="">Whole trip</option>', ...stages.map((stage, index) => `<option value="${esc(stage.id)}">${index + 1}. ${esc(stage.start_location || 'Start')} → ${esc(stage.end_location || 'End')}</option>`)].join('');
  const payerOptions = [STATE.user, ...STATE.profiles.filter((profile) => profile.id !== STATE.user?.id)].filter(Boolean).map((profile) => `<option value="${esc(profile.id)}">${esc(profile.full_name || profile.email || 'Rider')}</option>`).join('');
  return `<aside class="rf-v2-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="rf-v2-expense-title">
    <div class="rf-v2-wizard-head"><div class="rf-d2-aside-kicker">New expense</div><h2 class="rf-d2-aside-title" id="rf-v2-expense-title">Log an expense</h2><p class="rf-d2-aside-sub">Keep it simple: category, amount, payer, date and optional stage.</p></div>
    <div class="rf-d2-form-row-pair"><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-category">Category</label><select class="rf-d2-input" id="v2-expense-category">${categoryOptions}</select></div><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-amount">Amount</label><input class="rf-d2-input" id="v2-expense-amount" inputmode="decimal" placeholder="42.80"></div></div>
    <div class="rf-d2-form-row-pair"><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-payer">Paid by</label><select class="rf-d2-input" id="v2-expense-payer">${payerOptions}</select></div><div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-date">Date</label><input class="rf-d2-input" id="v2-expense-date" type="date" value="${esc(new Date().toISOString().slice(0, 10))}"></div></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-stage">Stage</label><select class="rf-d2-input" id="v2-expense-stage">${stageOptions}</select></div>
    <div class="rf-d2-form-row"><label class="rf-d2-form-label" for="v2-expense-description">Description</label><input class="rf-d2-input" id="v2-expense-description" placeholder="e.g. Fuel, lunch, lodging"></div>
    <div class="rf-v2-wizard-error" id="v2-expense-error" hidden></div>
    <div class="rf-d2-form-actions"><button class="rf-d2-btn" data-action="rf-v2-cancel-wizard" type="button">Cancel</button><button class="rf-d2-btn is-primary" data-action="rf-v2-save-expense" type="button">Save expense</button></div>
  </aside>`;
}

function emptyWizard(message) {
  return `<aside class="rf-v2-wizard-panel"><div class="rf-v2-wizard-head"><h2 class="rf-d2-aside-title">Nothing selected</h2><p>${esc(message)}</p></div><button class="rf-d2-btn" data-action="rf-v2-cancel-wizard" type="button">Close</button></aside>`;
}

function option(value, label, selected) {
  return `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`;
}

function showError(id, error) {
  const node = byId(id);
  if (!node) return;
  node.textContent = error?.message || String(error || 'Something went wrong.');
  node.hidden = false;
}

function tripPayload() {
  return {
    title: byId('v2-trip-title')?.value?.trim() || '',
    description: byId('v2-trip-desc')?.value?.trim() || '',
    start_date: byId('v2-trip-start')?.value || null,
    end_date: byId('v2-trip-end')?.value || null,
    status: byId('v2-trip-status')?.value || 'planning',
    visibility: byId('v2-trip-visibility')?.value || 'group',
  };
}

async function saveTrip(event) {
  claim(event);
  try {
    const trip = await createTrip(tripPayload());
    STATE.trips = [trip, ...STATE.trips.filter((item) => item.id !== trip.id)];
    STATE.wizard = null;
    STATE.editTargetId = null;
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

async function saveTripEdit(event) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  try {
    const updated = await updateTrip(trip.id, tripPayload());
    STATE.trips = STATE.trips.map((item) => item.id === updated.id ? updated : item);
    STATE.wizard = null;
    STATE.editTargetId = null;
    renderAll();
  } catch (error) {
    showError('v2-trip-error', error);
  }
}

async function removeTrip(event) {
  claim(event);
  const trip = activeTrip();
  if (!trip) return;
  if (!window.confirm(`Delete trip “${trip.title}”? This cannot be undone.`)) return;
  try {
    await deleteTrip(trip.id);
    STATE.trips = STATE.trips.filter((item) => item.id !== trip.id);
    STATE.viewTripId = null;
    STATE.selectedTripId = null;
    STATE.selectedStageId = null;
    STATE.wizard = null;
    STATE.view = 'list';
    renderAll();
  } catch (error) {
    window.alert(error?.message || 'Could not delete trip.');
  }
}

async function saveStageEdit(event) {
  claim(event);
  const trip = activeTrip();
  const stage = selectedStage();
  if (!trip || !stage) return;
  try {
    const updated = await updateStage(stage.id, {
      start_location: byId('v2-stage-from-edit')?.value?.trim() || '',
      end_location: byId('v2-stage-to-edit')?.value?.trim() || '',
      planned_date: byId('v2-stage-date-edit')?.value || '',
      distance_km: byId('v2-stage-km-edit')?.value?.trim() || '',
      custom_route_url: byId('v2-stage-route-edit')?.value?.trim() || '',
      notes: byId('v2-stage-notes-edit')?.value?.trim() || '',
    });
    STATE.stagesByTrip[trip.id] = stagesForTrip(trip.id).map((item) => item.id === updated.id ? updated : item);
    STATE.selectedStageId = updated.id;
    STATE.wizard = null;
    STATE.editTargetId = null;
    renderAll();
  } catch (error) {
    showError('v2-stage-error', error);
  }
}

async function removeStage(event, stageId) {
  claim(event);
  const trip = activeTrip();
  const stage = stagesForTrip(trip?.id).find((item) => item.id === stageId);
  if (!trip || !stage) return;
  if (!window.confirm(`Delete this stage? Journal entries attached to it may also be removed.`)) return;
  try {
    await deleteStage(stage.id);
    STATE.stagesByTrip[trip.id] = stagesForTrip(trip.id).filter((item) => item.id !== stage.id);
    STATE.selectedStageId = STATE.stagesByTrip[trip.id][0]?.id || null;
    STATE.wizard = null;
    STATE.editTargetId = null;
    renderAll();
  } catch (error) {
    window.alert(error?.message || 'Could not delete stage.');
  }
}

async function saveEntryEdit(event) {
  claim(event);
  const stage = selectedStage();
  const entry = selectedEntry();
  if (!stage || !entry) return;
  const time = byId('v2-entry-time-edit')?.value || '';
  const date = stage.planned_date || new Date().toISOString().slice(0, 10);
  try {
    const updated = await updateEntry(entry.id, {
      entry_type: byId('v2-entry-type-edit')?.value || 'note',
      title: byId('v2-entry-title-edit')?.value?.trim() || '',
      location: byId('v2-entry-place-edit')?.value?.trim() || '',
      description: byId('v2-entry-note-edit')?.value?.trim() || '',
      location_url: byId('v2-entry-location-url-edit')?.value?.trim() || '',
      timestamp: time ? `${date}T${time}:00` : null,
    });
    STATE.entriesByStage[stage.id] = entriesForStage(stage.id).map((item) => item.id === updated.id ? updated : item);
    STATE.wizard = null;
    STATE.editTargetId = null;
    renderAll();
  } catch (error) {
    showError('v2-entry-error', error);
  }
}

async function removeEntry(event, entryId) {
  claim(event);
  const stage = selectedStage();
  if (!stage) return;
  const entry = entriesForStage(stage.id).find((item) => item.id === entryId);
  if (!entry) return;
  if (!window.confirm(`Delete journal entry “${entry.title || 'Untitled'}”?`)) return;
  try {
    await deleteEntry(entry.id);
    STATE.entriesByStage[stage.id] = entriesForStage(stage.id).filter((item) => item.id !== entry.id);
    STATE.wizard = null;
    STATE.editTargetId = null;
    renderAll();
  } catch (error) {
    window.alert(error?.message || 'Could not delete journal entry.');
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

  if (action.endsWith('new-trip')) { claim(event); STATE.wizard = 'trip'; STATE.editTargetId = null; renderAll(); return; }
  if (action === 'rf-v2-edit-trip') { claim(event); STATE.wizard = 'trip-edit'; STATE.editTargetId = activeTrip()?.id || null; renderAll(); return; }
  if (action === 'rf-v2-delete-trip') { await removeTrip(event); return; }
  if (action === 'rf-v2-add-expense') { claim(event); STATE.wizard = 'expense'; STATE.editTargetId = null; renderAll(); return; }
  if (action === 'rf-v2-edit-stage') { claim(event); STATE.wizard = 'stage-edit'; STATE.editTargetId = btn.dataset.stageId; renderAll(); return; }
  if (action === 'rf-v2-delete-stage') { await removeStage(event, btn.dataset.stageId); return; }
  if (action === 'rf-v2-edit-entry') { claim(event); STATE.wizard = 'journal-edit'; STATE.editTargetId = btn.dataset.entryId; renderAll(); return; }
  if (action === 'rf-v2-delete-entry') { await removeEntry(event, btn.dataset.entryId); return; }
  if (action === 'rf-v2-cancel-wizard') { claim(event); STATE.wizard = null; STATE.editTargetId = null; renderAll(); return; }
  if (action === 'rf-v2-save-trip') { await saveTrip(event); return; }
  if (action === 'rf-v2-update-trip') { await saveTripEdit(event); return; }
  if (action === 'rf-v2-update-stage') { await saveStageEdit(event); return; }
  if (action === 'rf-v2-update-entry') { await saveEntryEdit(event); return; }
  if (action === 'rf-v2-save-expense') { await saveExpense(event); }
}, true);

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(renderWizardLayer));
window.addEventListener('resize', () => requestAnimationFrame(renderWizardLayer));
requestAnimationFrame(renderWizardLayer);
