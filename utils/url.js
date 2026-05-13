// ============================================================
// routefolk — utils/url.js
// URL parsing, host display, and journal/stage URL validation helpers.
// ============================================================

import { esc } from './dom.js';

export function canonicalHost(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    let host = url.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
  } catch {
    return '';
  }
}

export function linkHostBadgeHtml(value) {
  const host = canonicalHost(value);
  return host ? `<span class="link-host">· ${esc(host)}</span>` : '';
}

export function isHttpsUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isGoogleMapsUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(String(value).trim());
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (host === 'maps.app.goo.gl') return url.protocol === 'https:';
    const isGoogleHost = host === 'google.com'
      || host === 'www.google.com'
      || host.startsWith('maps.google.')
      || /^www\.google\.[a-z.]+$/.test(host)
      || /^google\.[a-z.]+$/.test(host);
    return url.protocol === 'https:' && isGoogleHost && (path.startsWith('/maps') || path.includes('/maps/'));
  } catch {
    return false;
  }
}

export function validateEntryUrls(fields) {
  if (fields.location_url && !isGoogleMapsUrl(fields.location_url)) {
    throw new Error('Use a valid HTTPS Google Maps link for the Maps URL.');
  }
  if (fields.info_url && !isHttpsUrl(fields.info_url)) {
    throw new Error('Use a valid HTTPS website link.');
  }
  if (fields.photo_album_url && !isHttpsUrl(fields.photo_album_url)) {
    throw new Error('Photo album links must start with https://.');
  }
}
