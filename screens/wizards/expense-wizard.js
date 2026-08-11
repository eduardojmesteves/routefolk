// ============================================================
// routefolk — screens/wizards/expense-wizard.js
// Expense create wizard markup (Route Atlas narrative pattern).
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import { EXPENSE_CATEGORY_META } from '../../constants/app-constants.js';
import { fmtDate } from '../../utils/datetime.js';
import { fmtEuro } from '../../utils/format.js';
import {
  activeTrip,
  selectedStage,
  stagesForTrip,
  field,
  fieldValue,
  row,
  input,
  select,
  option,
  choiceCards,
  narrativeShellHtml,
  narrativeSection,
} from './wizard-shared.js';

// Full-width tappable category cards (HANDOFF.md Expense wizard "What
// was it for?"). Tones cycle across the app's four accent tones.
const CATEGORY_DESCRIPTIONS = {
  fuel: 'Petrol, diesel, charging',
  food_drinks: 'Meals, snacks, drinks',
  lodging: 'Hotels, campsites, stays',
  tolls: 'Motorway and bridge tolls',
  parking: 'Parking fees',
  other: 'Anything else',
};
const CATEGORY_TONES = ['primary', 'accent', 'muted', 'info', 'accent', 'muted'];
export const CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORY_META).map(([key, meta], i) => ({
  value: key,
  label: meta.label,
  description: CATEGORY_DESCRIPTIONS[key] || '',
  tone: CATEGORY_TONES[i % CATEGORY_TONES.length],
}));

function payerOptionsHtml(selectedId) {
  return [STATE.user, ...STATE.profiles.filter((profile) => profile.id !== STATE.user?.id)]
    .filter(Boolean)
    .map((profile) => option(profile.id, profile.full_name || profile.email || 'Rider', selectedId))
    .join('');
}

function stageOptionsHtml(trip, selectedStageId) {
  const requestedStageId = STATE.editTargetId || '';
  const fallbackStage = requestedStageId ? selectedStage() : null;
  const stageRows = [...stagesForTrip(trip.id)];
  if (fallbackStage && !stageRows.some((stage) => stage.id === fallbackStage.id)) stageRows.push(fallbackStage);
  return ['<option value="">Whole trip</option>', ...stageRows.map((stage, index) => option(stage.id, `${index + 1}. ${stage.start_location || 'Start'} → ${stage.end_location || 'End'}`, selectedStageId))].join('');
}

/** Sticky live-preview: the actual ledger row this expense will render as. */
export function expensePreviewHtml() {
  const category = field('v2-expense-category')?.value || 'other';
  const amount = field('v2-expense-amount')?.value || '';
  const date = field('v2-expense-date')?.value || '';
  const payerId = field('v2-expense-payer')?.value || STATE.user?.id;
  const payer = [STATE.user, ...STATE.profiles].find((profile) => profile?.id === payerId);
  const payerLabel = payer?.full_name || payer?.email || 'Rider';
  return `<div class="rf-d2-table-row rf-v2-preview-card"><div>${esc(EXPENSE_CATEGORY_META[category]?.label || 'Other')}</div><div>${esc(payerLabel)}</div><div>${esc(fmtDate(date) || 'No date yet')}</div><div>${fmtEuro(Number(amount) || 0)}</div></div>`;
}

export function expenseWizardHtml() {
  const trip = activeTrip();
  const requestedStageId = STATE.editTargetId || '';
  const sections = [
    narrativeSection('v2-expense-section-category', 'What was it for?', '', choiceCards('v2-expense-category', CATEGORY_OPTIONS, 'fuel')),
    narrativeSection('v2-expense-section-who', 'Who paid, and how much?', '', [
      `<div class="rf-d2-form-row-pair">${row('v2-expense-payer', 'Paid by', select('v2-expense-payer', payerOptionsHtml(STATE.user?.id)))}${row('v2-expense-amount', 'Amount EUR', input('v2-expense-amount', '', 'inputmode="decimal" placeholder="42.80"'))}</div>`,
      `<div class="rf-d2-form-row-pair">${row('v2-expense-date', 'Date', input('v2-expense-date', new Date().toISOString().slice(0, 10), 'type="date"'))}${row('v2-expense-stage', 'Stage', select('v2-expense-stage', stageOptionsHtml(trip, requestedStageId)))}</div>`,
      row('v2-expense-description', 'Description', input('v2-expense-description', '', 'placeholder="e.g. Fuel, lunch, lodging"')),
    ].join('')),
  ];
  return narrativeShellHtml({
    id: 'rf-v2-expense-title',
    kicker: 'New expense',
    title: 'Log an expense',
    sub: 'Keep it simple: category, amount, payer, date and optional stage.',
    sections,
    previewLabel: 'Ledger preview',
    previewHtml: expensePreviewHtml(),
    errorId: 'v2-expense-error',
    saveAction: 'rf-v2-save-expense',
    saveLabel: 'Save expense',
  });
}
