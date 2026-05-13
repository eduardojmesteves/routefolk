// ============================================================
// routefolk — utils/datetime.js
// Date/time formatting and date-range helpers.
// ============================================================

const APP_LOCALE = 'en-GB';

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateRange(start, end) {
  if (!start && !end) return 'No dates set';
  if (start && !end) return fmtDate(start);
  if (!start && end) return `Until ${fmtDate(end)}`;
  if (start === end) return fmtDate(start);
  return `${fmtDate(start)} → ${fmtDate(end)}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(APP_LOCALE, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(APP_LOCALE, { hour: '2-digit', minute: '2-digit' });
}

export function fmtJournalWhen(iso) {
  return iso ? fmtTime(iso) : '';
}


export function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function nowAsDatetimeLocal() {
  return isoToDatetimeLocal(new Date().toISOString());
}


export function todayIsoDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currentLocalTimeHHMM() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function journalDefaultTimeLocal(entry = {}) {
  if (entry?.timestamp) return isoToDatetimeLocal(entry.timestamp).slice(11, 16);
  return currentLocalTimeHHMM();
}

export function inclusiveDays(start, end) {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const diff = Math.round((b - a) / 86400000) + 1;
  return diff > 0 ? diff : null;
}

export function isStageDateOutsideTrip(stage, trip) {
  if (!stage?.planned_date) return false;
  if (trip.start_date && stage.planned_date < trip.start_date) return true;
  if (trip.end_date && stage.planned_date > trip.end_date) return true;
  return false;
}

export function isExpenseDateOutsideTrip(expense, trip) {
  if (!expense?.date) return false;
  if (trip.start_date && expense.date < trip.start_date) return true;
  if (trip.end_date && expense.date > trip.end_date) return true;
  return false;
}
