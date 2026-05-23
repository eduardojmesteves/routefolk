// ============================================================
// routefolk — navigation-url.js
// URL helpers for stage navigation targets.
// ============================================================

import { toast } from '../components/toast.js';

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function coordPair(lat, lng) {
  const a = numeric(lat);
  const b = numeric(lng);
  return a == null || b == null ? null : `${a},${b}`;
}

export function stageRouteUrl(stage) {
  const custom = String(stage?.custom_route_url || '').trim();
  if (custom) return custom;
  const maps = String(stage?.gmaps_url || '').trim();
  if (maps) return maps;
  return googleMapsUrl(stage);
}

export function googleMapsUrl(stage) {
  const existing = String(stage?.custom_route_url || stage?.gmaps_url || '').trim();
  if (existing) return existing;

  const origin = coordPair(stage?.start_lat, stage?.start_lng) || String(stage?.start_location || '').trim();
  const destination = coordPair(stage?.end_lat, stage?.end_lng) || String(stage?.end_location || '').trim();
  if (!origin && !destination) return '';

  const params = new URLSearchParams({ api: '1', travelmode: 'driving' });
  if (origin) params.set('origin', origin);
  if (destination) params.set('destination', destination);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function wazeUrl(stage) {
  const destination = coordPair(stage?.end_lat, stage?.end_lng);
  if (!destination) return '';
  const params = new URLSearchParams({ ll: destination, navigate: 'yes' });
  return `https://waze.com/ul?${params.toString()}`;
}

export async function copyRouteUrl(stage) {
  const url = googleMapsUrl(stage);
  if (!url) throw new Error('No route URL is available to copy.');
  try {
    await navigator.clipboard.writeText(url);
    toast?.('Route URL copied.');
    return true;
  } catch (error) {
    toast?.('Could not copy the route URL.');
    throw error;
  }
}

export async function probeWaze() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

export async function openNavTarget(target, stage) {
  if (target === 'copy') return copyRouteUrl(stage);
  const url = target === 'waze' ? wazeUrl(stage) : googleMapsUrl(stage);
  if (!url) throw new Error('No navigation URL is available for this stage.');
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
