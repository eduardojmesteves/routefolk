// ============================================================
// routefolk — audit.js
// Shared audit-line rendering helpers.
// ============================================================

import { esc } from '../utils/dom.js';
import { fmtDateTime } from '../utils/datetime.js';
import { displayNameForUserId } from '../utils/user.js';

export function auditLineHtml(record, label = 'Last edited') {
  if (!record?.updated_by || !record?.updated_at) return '';
  const who = displayNameForUserId(record.updated_by);
  return `<div class="audit-line">${esc(label)} by ${esc(who)} · ${esc(fmtDateTime(record.updated_at))}</div>`;
}
