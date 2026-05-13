// ============================================================
// routefolk — utils/format.js
// Numeric, currency, duration, and amount parsing helpers.
// ============================================================

export function fmtEuro(value, options = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return options.empty || '—';
  const maximumFractionDigits = options.compact ? 0 : 2;
  const minimumFractionDigits = options.compact ? 0 : 2;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(n);
}

export function fmtDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const hours = Math.floor(n / 3600);
  const minutes = Math.round((n % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

export function fmtKm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n * 10) / 10} km`;
}

export function parseAmount(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
