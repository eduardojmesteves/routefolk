// ============================================================
// routefolk — screens/wizards/expense-wizard.js
// Expense create wizard markup.
// ============================================================

import { STATE } from '../../state/app-state.js';
import { esc } from '../../utils/dom.js';
import { EXPENSE_CATEGORY_META } from '../../constants/app-constants.js';
import {
  activeTrip,
  selectedStage,
  stagesForTrip,
  panelHtml,
  row,
  pair,
  input,
  select,
} from './wizard-shared.js';

export function expenseWizardHtml() {
  const trip = activeTrip();
  const loadedStages = trip ? stagesForTrip(trip.id) : [];
  const requestedStageId = STATE.editTargetId || '';
  const fallbackStage = requestedStageId ? selectedStage() : null;
  const stageRows = [...loadedStages];
  if (fallbackStage && !stageRows.some((stage) => stage.id === fallbackStage.id)) stageRows.push(fallbackStage);
  const selectedStageId = requestedStageId && stageRows.some((stage) => stage.id === requestedStageId) ? requestedStageId : '';
  const categoryOptions = Object.entries(EXPENSE_CATEGORY_META).map(([key, meta]) => `<option value="${esc(key)}">${esc(meta.label)}</option>`).join('');
  const stageOptions = ['<option value="">Whole trip</option>', ...stageRows.map((stage, index) => `<option value="${esc(stage.id)}" ${selectedStageId === stage.id ? 'selected' : ''}>${index + 1}. ${esc(stage.start_location || 'Start')} → ${esc(stage.end_location || 'End')}</option>`)].join('');
  const payerOptions = [STATE.user, ...STATE.profiles.filter((profile) => profile.id !== STATE.user?.id)].filter(Boolean).map((profile) => `<option value="${esc(profile.id)}">${esc(profile.full_name || profile.email || 'Rider')}</option>`).join('');
  return panelHtml({ id: 'rf-v2-expense-title', kicker: 'New expense', title: 'Log an expense', sub: 'Keep it simple: category, amount, payer, date and optional stage.', errorId: 'v2-expense-error', saveAction: 'rf-v2-save-expense', saveLabel: 'Save expense', body: [pair(row('v2-expense-category', 'Category', select('v2-expense-category', categoryOptions)), row('v2-expense-amount', 'Amount', input('v2-expense-amount', '', 'inputmode="decimal" placeholder="42.80"'))), pair(row('v2-expense-payer', 'Paid by', select('v2-expense-payer', payerOptions)), row('v2-expense-date', 'Date', input('v2-expense-date', new Date().toISOString().slice(0, 10), 'type="date"'))), row('v2-expense-stage', 'Stage', select('v2-expense-stage', stageOptions)), row('v2-expense-description', 'Description', input('v2-expense-description', '', 'placeholder="e.g. Fuel, lunch, lodging"'))].join('') });
}
