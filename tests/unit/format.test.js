import { describe, it, expect } from 'vitest';
import { fmtEuro, fmtDuration, fmtKm, parseAmount } from '../../utils/format.js';

// ============================================================
// fmtEuro
// ============================================================
describe('fmtEuro', () => {
  it('formats a positive number as euro currency', () => {
    const result = fmtEuro(10);
    // Should contain the euro sign and the number
    expect(result).toMatch(/10/);
    // EUR currency symbol or "EUR" text
    expect(result).toMatch(/€|EUR/);
  });

  it('formats zero correctly', () => {
    const result = fmtEuro(0);
    expect(result).toMatch(/0/);
    expect(result).toMatch(/€|EUR/);
  });

  it('returns the em-dash fallback for undefined', () => {
    expect(fmtEuro(undefined)).toBe('—');
  });

  it('returns the em-dash fallback for NaN', () => {
    expect(fmtEuro(NaN)).toBe('—');
  });

  it('returns the em-dash fallback for a non-numeric string', () => {
    expect(fmtEuro('abc')).toBe('—');
  });

  it('returns the em-dash fallback for null', () => {
    expect(fmtEuro(null)).toBe('—');
  });

  it('returns the custom empty option for null', () => {
    expect(fmtEuro(null, { empty: 'N/A' })).toBe('N/A');
  });

  it('formats with 2 decimal places by default', () => {
    const result = fmtEuro(10.5);
    expect(result).toMatch(/10[.,]50/);
  });

  it('compact option removes fractional digits', () => {
    const result = fmtEuro(10.9, { compact: true });
    // Should show whole number (10 or 11 depending on rounding, but no .xx)
    expect(result).not.toMatch(/[.,]\d{2}/);
  });

  it('formats a negative number', () => {
    const result = fmtEuro(-5.25);
    expect(result).toMatch(/-|5/);
  });
});

// ============================================================
// fmtDuration
// ============================================================
describe('fmtDuration', () => {
  it('formats seconds less than an hour as minutes', () => {
    expect(fmtDuration(1800)).toBe('30m');
  });

  it('formats exactly one hour', () => {
    expect(fmtDuration(3600)).toBe('1h');
  });

  it('formats hours and minutes', () => {
    expect(fmtDuration(5400)).toBe('1h 30m');
  });

  it('formats multiple hours', () => {
    expect(fmtDuration(7200)).toBe('2h');
  });

  it('formats hours with partial minutes', () => {
    expect(fmtDuration(3660)).toBe('1h 1m');
  });

  it('returns em-dash for zero', () => {
    expect(fmtDuration(0)).toBe('—');
  });

  it('returns em-dash for negative values', () => {
    expect(fmtDuration(-100)).toBe('—');
  });

  it('returns em-dash for null', () => {
    expect(fmtDuration(null)).toBe('—');
  });

  it('returns em-dash for non-numeric string', () => {
    expect(fmtDuration('abc')).toBe('—');
  });

  it('formats 59 seconds as 1m (rounds)', () => {
    expect(fmtDuration(59)).toBe('1m');
  });

  it('accepts numeric strings', () => {
    expect(fmtDuration('3600')).toBe('1h');
  });
});

// ============================================================
// fmtKm
// ============================================================
describe('fmtKm', () => {
  it('formats a whole number distance', () => {
    expect(fmtKm(10)).toBe('10 km');
  });

  it('formats with one decimal place', () => {
    expect(fmtKm(10.55)).toBe('10.6 km');
  });

  it('formats zero', () => {
    expect(fmtKm(0)).toBe('0 km');
  });

  it('returns em-dash for null', () => {
    expect(fmtKm(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(fmtKm(undefined)).toBe('—');
  });

  it('returns em-dash for non-numeric string', () => {
    expect(fmtKm('abc')).toBe('—');
  });

  it('rounds to one decimal place', () => {
    expect(fmtKm(10.14)).toBe('10.1 km');
    expect(fmtKm(10.15)).toBe('10.2 km');
  });

  it('accepts numeric strings', () => {
    expect(fmtKm('5.5')).toBe('5.5 km');
  });
});

// ============================================================
// parseAmount
// ============================================================
describe('parseAmount', () => {
  it('parses an integer string', () => {
    expect(parseAmount('10')).toBe(10);
  });

  it('parses a decimal string with dot separator', () => {
    expect(parseAmount('10.50')).toBe(10.5);
  });

  it('parses a decimal string with comma separator', () => {
    expect(parseAmount('10,50')).toBe(10.5);
  });

  it('parses a number directly', () => {
    expect(parseAmount(42)).toBe(42);
  });

  it('returns null for empty string', () => {
    expect(parseAmount('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(parseAmount(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseAmount(undefined)).toBeNull();
  });

  it('returns null for a non-numeric string', () => {
    expect(parseAmount('abc')).toBeNull();
  });

  it('parses zero', () => {
    expect(parseAmount('0')).toBe(0);
  });

  it('parses negative amounts', () => {
    expect(parseAmount('-5.00')).toBe(-5);
  });

  it('trims surrounding whitespace', () => {
    expect(parseAmount('  12.5  ')).toBe(12.5);
  });
});
