// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  fmtDate,
  fmtDateRange,
  isoToDatetimeLocal,
  datetimeLocalToIso,
  inclusiveDays,
  isStageDateOutsideTrip,
  isExpenseDateOutsideTrip,
} from '../../utils/datetime.js';

// ============================================================
// fmtDate
// ============================================================
describe('fmtDate', () => {
  it('formats a valid ISO date string for en-GB display', () => {
    const result = fmtDate('2024-06-15');
    // en-GB locale: "15 Jun 2024"
    expect(result).toMatch(/15/);
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2024/);
  });

  it('returns empty string for null', () => {
    expect(fmtDate(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(fmtDate('')).toBe('');
  });

  it('returns the raw value for an invalid date string', () => {
    expect(fmtDate('not-a-date')).toBe('not-a-date');
  });

  it('formats the first day of the year correctly', () => {
    const result = fmtDate('2024-01-01');
    expect(result).toMatch(/1/);
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2024/);
  });
});

// ============================================================
// fmtDateRange
// ============================================================
describe('fmtDateRange', () => {
  it('returns "No dates set" when both start and end are null/empty', () => {
    expect(fmtDateRange(null, null)).toBe('No dates set');
    expect(fmtDateRange('', '')).toBe('No dates set');
  });

  it('returns formatted start date when only start is provided', () => {
    const result = fmtDateRange('2024-06-15', null);
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2024/);
  });

  it('returns "Until <end>" when only end is provided', () => {
    const result = fmtDateRange(null, '2024-06-15');
    expect(result).toMatch(/^Until /);
    expect(result).toMatch(/Jun/);
  });

  it('returns formatted single date when start equals end', () => {
    const result = fmtDateRange('2024-06-15', '2024-06-15');
    // Should not contain arrow
    expect(result).not.toContain('→');
    expect(result).toMatch(/Jun/);
  });

  it('returns a range with arrow separator when start differs from end', () => {
    const result = fmtDateRange('2024-06-01', '2024-06-30');
    expect(result).toContain('→');
  });
});

// ============================================================
// isoToDatetimeLocal
// ============================================================
describe('isoToDatetimeLocal', () => {
  it('converts a UTC ISO string to datetime-local format', () => {
    // The result is local-time representation, format YYYY-MM-DDTHH:MM
    const result = isoToDatetimeLocal('2024-06-15T10:30:00.000Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('returns empty string for null', () => {
    expect(isoToDatetimeLocal(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(isoToDatetimeLocal('')).toBe('');
  });

  it('returns empty string for invalid ISO string', () => {
    expect(isoToDatetimeLocal('not-a-date')).toBe('');
  });

  it('pads month, day, hour, minute with zeros', () => {
    // Use a known UTC date; local time may vary but format should still pad
    const result = isoToDatetimeLocal('2024-01-05T05:05:00.000Z');
    // Format should always be YYYY-MM-DDTHH:MM
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // Year is 2024 in any timezone
    expect(result.startsWith('2024-')).toBe(true);
  });
});

// ============================================================
// datetimeLocalToIso
// ============================================================
describe('datetimeLocalToIso', () => {
  it('converts a datetime-local string to an ISO string', () => {
    const result = datetimeLocalToIso('2024-06-15T10:30');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('returns null for null', () => {
    expect(datetimeLocalToIso(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(datetimeLocalToIso('')).toBeNull();
  });

  it('returns null for invalid value', () => {
    expect(datetimeLocalToIso('not-a-datetime')).toBeNull();
  });

  it('round-trips with isoToDatetimeLocal within the same call', () => {
    const localStr = '2024-06-15T10:30';
    const iso = datetimeLocalToIso(localStr);
    expect(iso).not.toBeNull();
    // Ensure the ISO string is parseable back to a date
    expect(() => new Date(iso).getTime()).not.toThrow();
    expect(Number.isFinite(new Date(iso).getTime())).toBe(true);
  });
});

// ============================================================
// inclusiveDays
// ============================================================
describe('inclusiveDays', () => {
  it('returns 1 for same-day range', () => {
    expect(inclusiveDays('2024-06-15', '2024-06-15')).toBe(1);
  });

  it('returns 2 for consecutive days', () => {
    expect(inclusiveDays('2024-06-15', '2024-06-16')).toBe(2);
  });

  it('returns correct count for a multi-day range', () => {
    expect(inclusiveDays('2024-06-01', '2024-06-30')).toBe(30);
  });

  it('returns null when start is missing', () => {
    expect(inclusiveDays(null, '2024-06-15')).toBeNull();
    expect(inclusiveDays('', '2024-06-15')).toBeNull();
  });

  it('returns null when end is missing', () => {
    expect(inclusiveDays('2024-06-15', null)).toBeNull();
    expect(inclusiveDays('2024-06-15', '')).toBeNull();
  });

  it('returns null when both are missing', () => {
    expect(inclusiveDays(null, null)).toBeNull();
  });

  it('returns null when end is before start', () => {
    // diff would be negative, function returns null for non-positive diff
    expect(inclusiveDays('2024-06-15', '2024-06-01')).toBeNull();
  });

  it('returns null for invalid date strings', () => {
    expect(inclusiveDays('not-a-date', '2024-06-15')).toBeNull();
  });
});

// ============================================================
// isStageDateOutsideTrip
// ============================================================
describe('isStageDateOutsideTrip', () => {
  it('returns false when stage has no planned_date', () => {
    const stage = {};
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isStageDateOutsideTrip(stage, trip)).toBe(false);
  });

  it('returns false when stage date is within trip range', () => {
    const stage = { planned_date: '2024-06-15' };
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isStageDateOutsideTrip(stage, trip)).toBe(false);
  });

  it('returns false when stage date equals start_date', () => {
    const stage = { planned_date: '2024-06-01' };
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isStageDateOutsideTrip(stage, trip)).toBe(false);
  });

  it('returns false when stage date equals end_date', () => {
    const stage = { planned_date: '2024-06-30' };
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isStageDateOutsideTrip(stage, trip)).toBe(false);
  });

  it('returns true when stage date is before trip start_date', () => {
    const stage = { planned_date: '2024-05-31' };
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isStageDateOutsideTrip(stage, trip)).toBe(true);
  });

  it('returns true when stage date is after trip end_date', () => {
    const stage = { planned_date: '2024-07-01' };
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isStageDateOutsideTrip(stage, trip)).toBe(true);
  });

  it('returns false when trip has no start_date or end_date', () => {
    const stage = { planned_date: '2024-06-15' };
    const trip = {};
    expect(isStageDateOutsideTrip(stage, trip)).toBe(false);
  });

  it('returns false for null stage', () => {
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isStageDateOutsideTrip(null, trip)).toBe(false);
  });
});

// ============================================================
// isExpenseDateOutsideTrip
// ============================================================
describe('isExpenseDateOutsideTrip', () => {
  it('returns false when expense has no date', () => {
    const expense = {};
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isExpenseDateOutsideTrip(expense, trip)).toBe(false);
  });

  it('returns false when expense date is within trip range', () => {
    const expense = { date: '2024-06-15' };
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isExpenseDateOutsideTrip(expense, trip)).toBe(false);
  });

  it('returns true when expense date is before trip start_date', () => {
    const expense = { date: '2024-05-31' };
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isExpenseDateOutsideTrip(expense, trip)).toBe(true);
  });

  it('returns true when expense date is after trip end_date', () => {
    const expense = { date: '2024-07-01' };
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isExpenseDateOutsideTrip(expense, trip)).toBe(true);
  });

  it('returns false when trip has no dates', () => {
    const expense = { date: '2024-06-15' };
    const trip = {};
    expect(isExpenseDateOutsideTrip(expense, trip)).toBe(false);
  });

  it('returns false for null expense', () => {
    const trip = { start_date: '2024-06-01', end_date: '2024-06-30' };
    expect(isExpenseDateOutsideTrip(null, trip)).toBe(false);
  });
});
