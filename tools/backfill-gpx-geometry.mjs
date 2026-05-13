#!/usr/bin/env node

/*
  routefolk — GPX cached geometry backfill

  Local-only maintenance script.

  Usage:
    node tools/backfill-gpx-geometry.mjs --dry-run
    node tools/backfill-gpx-geometry.mjs --apply

  Required .env.local:
    SUPABASE_URL="https://your-project.supabase.co"
    SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

  Notes:
    - Uses Supabase REST and Storage APIs directly; no npm packages required.
    - Requires Node 18+ for fetch.
    - Keep this script and .env.local out of Git if the repo should remain static-app-only.
*/

import fs from 'node:fs/promises';
import path from 'node:path';

const GPX_BUCKET = 'gpx-tracks';
const MAX_ROUTE_POINTS = 420;
const HEAT_SPACING_KM = 0.25;
const MAX_HEAT_POINTS = 2600;

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const DRY_RUN = args.has('--dry-run') || !APPLY;

async function loadDotEnvLocal() {
  try {
    const text = await fs.readFile('.env.local', 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local is optional if environment variables are already set.
  }
}

await loadDotEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment/.env.local.');
  process.exit(1);
}

const apiHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

const jsonHeaders = {
  ...apiHeaders,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'apply'}`);

const rows = await fetchRowsMissingGeometry();
console.log(`Found ${rows.length} GPX row(s) missing cached geometry.`);

let ok = 0;
let failed = 0;

for (const row of rows) {
  try {
    const text = await downloadGpx(row.file_path);
    const geometry = parseGpxText(text);

    if (!geometry.points.length) {
      console.warn(`skip ${row.id}: no usable points in ${row.file_path}`);
      continue;
    }

    const payload = buildCachedGeometryPayload(geometry);

    console.log(`${DRY_RUN ? 'would update' : 'updating'} ${row.id}: ${path.basename(row.file_path || '')} (${payload.point_count} point(s))`);

    if (APPLY) {
      await updateTrack(row.id, payload);
    }

    ok += 1;
  } catch (err) {
    failed += 1;
    console.error(`failed ${row.id}: ${err.message}`);
  }
}

console.log(`Done. Successful: ${ok}. Failed: ${failed}.`);

async function fetchRowsMissingGeometry() {
  const url = new URL('/rest/v1/gpx_tracks', SUPABASE_URL);
  url.searchParams.set('select', 'id,file_path');
  url.searchParams.set('or', '(point_count.is.null,bbox.is.null,simplified_points.is.null,heat_points.is.null)');
  url.searchParams.set('order', 'uploaded_at.desc.nullslast,created_at.desc');

  const res = await fetch(url, { headers: apiHeaders });
  if (!res.ok) throw new Error(`Failed to query gpx_tracks: ${res.status} ${await res.text()}`);
  return res.json();
}

async function downloadGpx(filePath) {
  if (!filePath) throw new Error('missing file_path');
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const url = `${SUPABASE_URL}/storage/v1/object/${GPX_BUCKET}/${encodedPath}`;
  const res = await fetch(url, { headers: apiHeaders });
  if (!res.ok) throw new Error(`Failed to download ${filePath}: ${res.status} ${await res.text()}`);
  return res.text();
}

async function updateTrack(id, payload) {
  const url = new URL('/rest/v1/gpx_tracks', SUPABASE_URL);
  url.searchParams.set('id', `eq.${id}`);

  const res = await fetch(url, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Failed to update ${id}: ${res.status} ${await res.text()}`);
}

function parseGpxText(text) {
  const trkptRe = /<(?:\w+:)?(?:trkpt|rtept)\b[^>]*\blat=["']([^"']+)["'][^>]*\blon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:\w+:)?(?:trkpt|rtept)>/gi;
  const points = [];
  let match;

  while ((match = trkptRe.exec(text || ''))) {
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    const inner = match[3] || '';
    const timeMatch = inner.match(/<(?:\w+:)?time>([^<]+)<\/(?:\w+:)?time>/i);
    const timeText = timeMatch?.[1]?.trim() || '';
    const time = timeText ? new Date(timeText) : null;
    const point = {
      lat,
      lng,
      time: time && !Number.isNaN(time.getTime()) ? time.toISOString() : null,
    };
    if (isValidGeoPoint(point)) points.push(point);
  }

  const distance_km = roundDistance(totalDistanceKm(points));
  const duration_seconds = durationSeconds(points);
  return { points, distance_km, duration_seconds };
}

function buildCachedGeometryPayload(geometry) {
  const simplified = simplifyTrackPoints(geometry.points, MAX_ROUTE_POINTS).map(pointForJson);
  const heat = resampleTrackForHeatmap(geometry.points, HEAT_SPACING_KM, MAX_HEAT_POINTS).map(pointForJson);
  return {
    point_count: geometry.points.length,
    bbox: bboxForPoints(geometry.points),
    simplified_points: simplified,
    heat_points: heat,
  };
}

function pointForJson(p) {
  return {
    lat: roundCoord(p.lat),
    lng: roundCoord(p.lng),
  };
}

function bboxForPoints(points) {
  const lats = points.map((p) => p.lat).filter(Number.isFinite);
  const lngs = points.map((p) => p.lng).filter(Number.isFinite);
  if (!lats.length || !lngs.length) return null;
  return {
    min_lat: roundCoord(Math.min(...lats)),
    max_lat: roundCoord(Math.max(...lats)),
    min_lng: roundCoord(Math.min(...lngs)),
    max_lng: roundCoord(Math.max(...lngs)),
  };
}

function simplifyTrackPoints(points, maxPoints = MAX_ROUTE_POINTS) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  const step = Math.ceil(points.length / maxPoints);
  const reduced = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (last && reduced[reduced.length - 1] !== last) reduced.push(last);
  return reduced;
}

function resampleTrackForHeatmap(points, spacingKm = HEAT_SPACING_KM, maxSamples = MAX_HEAT_POINTS) {
  if (!Array.isArray(points) || points.length < 2) return points || [];
  const samples = [points[0]];
  let carried = 0;

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const segmentKm = haversineKm(prev, current);
    if (!Number.isFinite(segmentKm) || segmentKm <= 0) continue;

    let remaining = segmentKm;
    let anchor = prev;

    while (carried + remaining >= spacingKm && samples.length < maxSamples) {
      const need = spacingKm - carried;
      const ratio = Math.max(0, Math.min(1, need / remaining));
      const sample = interpolateGeoPoint(anchor, current, ratio);
      samples.push(sample);
      anchor = sample;
      remaining = haversineKm(anchor, current);
      carried = 0;
      if (!Number.isFinite(remaining) || remaining <= 0.00001) break;
    }

    carried += remaining;
    if (samples.length >= maxSamples) break;
  }

  const finalPoint = points[points.length - 1];
  if (samples[samples.length - 1] !== finalPoint && samples.length < maxSamples) samples.push(finalPoint);
  return samples;
}

function isValidGeoPoint(point) {
  return Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && point.lat >= -90
    && point.lat <= 90
    && point.lng >= -180
    && point.lng <= 180;
}

function totalDistanceKm(points) {
  if (!points.length) return null;
  let km = 0;
  for (let i = 1; i < points.length; i += 1) {
    const segmentKm = haversineKm(points[i - 1], points[i]);
    if (Number.isFinite(segmentKm)) km += segmentKm;
  }
  return Number.isFinite(km) ? km : null;
}

function durationSeconds(points) {
  const timed = points.filter((p) => p.time).map((p) => new Date(p.time).getTime()).filter(Number.isFinite);
  if (timed.length < 2) return null;
  const diff = Math.round((timed[timed.length - 1] - timed[0]) / 1000);
  return diff > 0 ? diff : null;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function interpolateGeoPoint(a, b, t) {
  return {
    lat: Number(a.lat) + (Number(b.lat) - Number(a.lat)) * t,
    lng: Number(a.lng) + (Number(b.lng) - Number(a.lng)) * t,
  };
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

function roundDistance(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function roundCoord(value) {
  return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : null;
}
