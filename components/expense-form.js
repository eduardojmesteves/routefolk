// ============================================================
 // routefolk — expense-form.js
 // Expense form rendering, reading, and validation helpers.
 // ============================================================

import { STATE } from '../state/app-state.js';
import { $, esc, attr, boolAttr } from '../utils/dom.js';
import { todayIsoDate } from '../utils/datetime.js';
import { parseAmount } from '../utils/format.js';
import { EXPENSE_CATEGORY_META } from '../constants/app-constants.js';
import { tripVisibility } from './trip-card.js';
import { stageLabelForExpense } from '../utils/trip-detail.js';
import { userDisplayName, userAvatarUrl } from '../utils/user.js';

export function stageOptionsHtml(trip, selectedStageId) {
  const stages = STATE.stagesByTrip[trip.id] || [];
  const selected = selectedStageId || '';
  const options = [`<option value="" ${!selected ? 'selected' : ''}>Whole trip / no specific stage</option>`];
  stages.forEach((stage, index) => {
    options.push(`<option value="${esc(stage.id)}" ${stage.id === selected ? 'selected' : ''}>${esc(stageLabelForExpense(stage, index))}</option>`);
  });
  return options.join('');
}

function expenseDateAttrs(trip) {
  return `${attr('min', trip.start_date || '')}${attr('max', trip.end_date || '')} required`;
}

function expenseDateDefault(trip, expense = {}) {
  if (expense.date) return expense.date;
  if (trip.start_date) return trip.start_date;
  return todayIsoDate();
}

function expenseDateHelpText(trip) {
  if (trip.start_date && trip.end_date) return `Required. Choose a date between ${trip.start_date} and ${trip.end_date}.`;
  if (trip.start_date) return `Required. Choose a date on or after ${trip.start_date}.`;
  if (trip.end_date) return `Required. Choose a date on or before ${trip.end_date}.`;
  return 'Required. Choose the date when this expense happened.';
}

function validateExpenseForTrip(trip, fields) {
  if (!fields.date) {
    throw new Error('Expense date is required. Choose a date within the trip date range.');
  }

  if (trip.start_date && fields.date < trip.start_date) throw new Error('Expense date must be on or after the trip start date.');
  if (trip.end_date && fields.date > trip.end_date) throw new Error('Expense date must be on or before the trip end date.');

  if (fields.stage_id) {
    const stages = STATE.stagesByTrip[trip.id] || [];
    if (!stages.some((stage) => stage.id === fields.stage_id)) throw new Error('Selected stage does not belong to this trip.');
  }
  return fields;
}

function selectedTripMemberEmails(trip) {
  const rows = STATE.tripMembersByTrip[trip.id];
  if (!Array.isArray(rows)) return new Set();
  return new Set(rows.map((row) => String(row.member_email || '').toLowerCase()).filter(Boolean));
}

function currentUserProfile() {
  return STATE.user ? {
    id: STATE.user.id,
    email: STATE.user.email,
    full_name: userDisplayName(STATE.user),
    avatar_url: userAvatarUrl(STATE.user),
  } : null;
}

function appMemberAsProfile(member) {
  if (!member?.user_id) return null;
  return {
    id: member.user_id,
    email: member.email,
    full_name: member.full_name || member.email,
    avatar_url: member.avatar_url || null,
  };
}

function uniqueProfiles(profiles) {
  const seen = new Set();
  return profiles.filter((profile) => {
    if (!profile?.id || seen.has(profile.id)) return false;
    seen.add(profile.id);
    return true;
  });
}

function payerProfilesForTrip(trip) {
  const visibility = tripVisibility(trip);
  const self = currentUserProfile();

  if (visibility === 'private') return self ? [self] : [];

  if (visibility === 'selected') {
    const selectedEmails = selectedTripMemberEmails(trip);
    const candidates = [
      self,
      ...STATE.selectableTripMembers
        .filter((member) => selectedEmails.has(member.email) || member.user_id === trip.created_by)
        .map(appMemberAsProfile),
      ...STATE.profiles.filter((profile) => profile.id === trip.created_by || selectedEmails.has(String(profile.email || '').toLowerCase())),
    ];
    return uniqueProfiles(candidates).sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
  }

  const profiles = [...STATE.profiles];
  if (self && !profiles.some((p) => p.id === self.id)) profiles.unshift(self);
  return uniqueProfiles(profiles);
}

function payerOptionsHtml(trip, selectedUserId) {
  const selected = selectedUserId || STATE.user?.id || '';
  const profiles = payerProfilesForTrip(trip);

  return profiles.map((profile) => {
    const label = profile.full_name || profile.email || 'Unknown';
    return `<option value="${esc(profile.id)}" ${profile.id === selected ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

export function expenseFormHtml(trip, expense = {}) {
  const visibility = tripVisibility(trip);
  const isPrivate = visibility === 'private';
  const amount = expense.amount != null ? String(expense.amount) : '';
  return `
    <div class="form-row">
      <label class="form-label" for="efPayer">Paid by</label>
      <select class="sel" id="efPayer"${boolAttr('disabled', isPrivate)}>
        ${payerOptionsHtml(trip, expense.user_id)}
      </select>
      ${isPrivate ? '<div class="form-help">Private trip expenses can only be paid by you.</div>' : ''}
      ${visibility === 'selected' ? '<div class="form-help">Selected trip expenses can only be paid by someone with access to this trip.</div>' : ''}
    </div>
    <div class="form-row">
      <label class="form-label" for="efCategory">Category</label>
      <select class="sel" id="efCategory">
        ${Object.entries(EXPENSE_CATEGORY_META).map(([key, meta]) => `<option value="${esc(key)}" ${(expense.category || 'food_drinks') === key ? 'selected' : ''}>${esc(meta.label)}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <label class="form-label" for="efStage">Applies to</label>
      <select class="sel" id="efStage">
        ${stageOptionsHtml(trip, expense.stage_id)}
      </select>
      <div class="form-help">Optional. Use “Whole trip” for costs that do not belong to a specific stage.</div>
    </div>
    <div class="form-row">
      <label class="form-label" for="efAmount">Amount (€)</label>
      <input class="inp" id="efAmount" type="text" inputmode="decimal" autocomplete="off" value="${esc(amount)}" placeholder="0.00">
      <div class="form-help">Use decimals for cents. The app stores all expenses in Euro.</div>
    </div>
    <div class="form-row">
      <label class="form-label" for="efDate">Date</label>
      <input class="inp" id="efDate" type="date" value="${esc(expenseDateDefault(trip, expense))}"${expenseDateAttrs(trip)}>
      <div class="form-help">${esc(expenseDateHelpText(trip))}</div>
    </div>
    <div class="form-row">
      <label class="form-label" for="efDesc">Description (optional)</label>
      <textarea class="txt" id="efDesc" maxlength="1000" placeholder="e.g. Dinner in Ávila">${esc(expense.description || '')}</textarea>
    </div>
  `;
}

export function readExpenseForm(trip) {
  const amount = parseAmount($('efAmount')?.value);
  const date = $('efDate')?.value || '';

  const fields = {
    user_id: tripVisibility(trip) === 'private' ? STATE.user?.id : ($('efPayer')?.value || STATE.user?.id),
    category: $('efCategory')?.value || 'food_drinks',
    stage_id: $('efStage')?.value || null,
    amount,
    date,
    description: $('efDesc')?.value.trim() || '',
    currency: 'EUR',
  };
  return validateExpenseForTrip(trip, fields);
}
