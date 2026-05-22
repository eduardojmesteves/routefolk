// @vitest-environment jsdom
/**
 * Tests for URL validator functions from lib/stages.js and lib/journal.js.
 *
 * Both modules import from lib/supabase.js which uses a CDN URL not available
 * in Node test environment. We mock both supabase.js and lib/config.js
 * so the validators (which are pure functions) can be imported cleanly.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the CDN-based supabase import so stages.js and journal.js can load.
vi.mock('../../lib/supabase.js', () => ({ supabase: {} }));
// geocoding.js is also imported by stages.js
vi.mock('../../lib/geocoding.js', () => ({ geocode: vi.fn() }));

const { validateCustomMapsUrl } = await import('../../lib/stages.js');
const {
  validatePhotoAlbumUrl,
  validateLocationUrl,
  validateInfoUrl,
} = await import('../../lib/journal.js');

// ============================================================
// validateCustomMapsUrl (from lib/stages.js)
// Allowed hosts: google.com, www.google.com, maps.google.com, maps.app.goo.gl
// ============================================================
describe('validateCustomMapsUrl', () => {
  it('returns null for empty string', () => {
    expect(validateCustomMapsUrl('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(validateCustomMapsUrl(null)).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(validateCustomMapsUrl('   ')).toBeNull();
  });

  it('throws for an invalid URL', () => {
    expect(() => validateCustomMapsUrl('not a url')).toThrow("That doesn't look like a valid URL.");
  });

  it('throws for an http:// URL (not https)', () => {
    expect(() => validateCustomMapsUrl('http://maps.google.com/maps?q=test'))
      .toThrow('Custom Maps URL must start with https://');
  });

  it('accepts https://maps.google.com URL', () => {
    const url = 'https://maps.google.com/maps?q=Lisbon';
    const result = validateCustomMapsUrl(url);
    expect(result).toBe(url);
  });

  it('accepts https://www.google.com/maps URL', () => {
    const url = 'https://www.google.com/maps/dir/?api=1&origin=Porto&destination=Lisbon';
    const result = validateCustomMapsUrl(url);
    expect(result).toBe(url);
  });

  it('accepts https://google.com/maps URL', () => {
    const url = 'https://google.com/maps?q=test';
    const result = validateCustomMapsUrl(url);
    expect(result).toBe(url);
  });

  it('accepts https://maps.app.goo.gl short link', () => {
    const url = 'https://maps.app.goo.gl/abc123';
    const result = validateCustomMapsUrl(url);
    expect(result).toBe(url);
  });

  it('throws for a generic shortener (goo.gl)', () => {
    expect(() => validateCustomMapsUrl('https://goo.gl/maps/abc'))
      .toThrow('Only Google Maps URLs are allowed');
  });

  it('throws for a random https URL (not a maps host)', () => {
    expect(() => validateCustomMapsUrl('https://bit.ly/somemap'))
      .toThrow('Only Google Maps URLs are allowed');
  });

  it('throws for https://tinyurl.com', () => {
    expect(() => validateCustomMapsUrl('https://tinyurl.com/abc'))
      .toThrow('Only Google Maps URLs are allowed');
  });

  it('returns a normalised URL string (toString of URL object)', () => {
    const url = 'https://maps.google.com/maps?q=Porto';
    const result = validateCustomMapsUrl(url);
    expect(typeof result).toBe('string');
    expect(result).toContain('maps.google.com');
  });
});

// ============================================================
// validateLocationUrl (from lib/journal.js)
// Same allowed hosts as validateCustomMapsUrl.
// ============================================================
describe('validateLocationUrl', () => {
  it('returns null for empty string', () => {
    expect(validateLocationUrl('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(validateLocationUrl(null)).toBeNull();
  });

  it('throws for an invalid URL', () => {
    expect(() => validateLocationUrl('not a url')).toThrow("That doesn't look like a valid URL.");
  });

  it('throws for an http:// URL', () => {
    expect(() => validateLocationUrl('http://maps.google.com/maps?q=test'))
      .toThrow('Maps URL must start with https://');
  });

  it('accepts https://maps.google.com', () => {
    const url = 'https://maps.google.com/maps?q=Lisbon';
    expect(validateLocationUrl(url)).toBe(url);
  });

  it('accepts https://maps.app.goo.gl', () => {
    const url = 'https://maps.app.goo.gl/abc123';
    expect(validateLocationUrl(url)).toBe(url);
  });

  it('throws for random shortener', () => {
    expect(() => validateLocationUrl('https://bit.ly/somemap'))
      .toThrow('Only Google Maps URLs are allowed');
  });

  it('throws for goo.gl (not maps.app.goo.gl)', () => {
    expect(() => validateLocationUrl('https://goo.gl/maps/abc'))
      .toThrow('Only Google Maps URLs are allowed');
  });
});

// ============================================================
// validateInfoUrl (from lib/journal.js)
// Any https URL is allowed — generic websites, booking sites, etc.
// ============================================================
describe('validateInfoUrl', () => {
  it('returns null for empty string', () => {
    expect(validateInfoUrl('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(validateInfoUrl(null)).toBeNull();
  });

  it('throws for an invalid URL', () => {
    expect(() => validateInfoUrl('not a url')).toThrow("That doesn't look like a valid URL.");
  });

  it('throws for an http:// URL', () => {
    expect(() => validateInfoUrl('http://booking.com/hotel'))
      .toThrow('Website URL must start with https://');
  });

  it('accepts a generic https URL (booking.com)', () => {
    const url = 'https://booking.com/hotel/abc';
    expect(validateInfoUrl(url)).toBe(url);
  });

  it('accepts a tripadvisor https URL', () => {
    const url = 'https://www.tripadvisor.com/Restaurant_Review-abc';
    expect(validateInfoUrl(url)).toBe(url);
  });

  it('accepts maps.google.com (not restricted for info URL)', () => {
    const url = 'https://maps.google.com/maps?q=test';
    expect(validateInfoUrl(url)).toBe(url);
  });

  it('accepts any random shortener over https', () => {
    const url = 'https://bit.ly/somearticle';
    expect(validateInfoUrl(url)).toBe(url);
  });
});

// ============================================================
// validatePhotoAlbumUrl (from lib/journal.js)
// Same as validateInfoUrl — any https URL is allowed.
// ============================================================
describe('validatePhotoAlbumUrl', () => {
  it('returns null for empty string', () => {
    expect(validatePhotoAlbumUrl('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(validatePhotoAlbumUrl(null)).toBeNull();
  });

  it('throws for an invalid URL', () => {
    expect(() => validatePhotoAlbumUrl('not a url')).toThrow("That doesn't look like a valid URL.");
  });

  it('throws for an http:// URL', () => {
    expect(() => validatePhotoAlbumUrl('http://photos.google.com/album'))
      .toThrow('Photo album URL must start with https://');
  });

  it('accepts a Google Photos https URL', () => {
    const url = 'https://photos.google.com/album/abc123';
    expect(validatePhotoAlbumUrl(url)).toBe(url);
  });

  it('accepts an iCloud Photos https URL', () => {
    const url = 'https://www.icloud.com/photos/abc';
    expect(validatePhotoAlbumUrl(url)).toBe(url);
  });
});
