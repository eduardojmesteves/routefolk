// ============================================================
// routefolk — gpx.js
// GPX upload, parsing, cached geometry, and storage helpers.
// GPX tracks are linked to individual stages.
// ============================================================

import { supabase } from './supabase.js';

const GPX_BUCKET = 'gpx-tracks';
const MAX_GPX_BYTES = 8 * 1024 * 1024; // keep it small for mobile/PWA use
const ROUTE_POINTS_LIMIT = 700;
const HEATMAP_SPACING_KM = 0.25;
const HEATMAP_POINTS_LIMIT = 2600;

export async function listGpxTracksForTrip(tripId) {
  const { data, error } = await supabase
    .from('gpx_tracks')
    .select('*')
    .eq('trip_id', tripId)
    .order('uploaded_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function uploadStageGpx({ tripId, stageId, file }) {
  if (!tripId) throw new Error('Trip is required.');
  if (!stageId) throw new Error('Stage is required.');
  if (!file) throw new Error('Choose a GPX file first.');
  if (file.size > MAX_GPX_BYTES) throw new Error('GPX file is too large. Keep files under 8 MB for now.');
  if (!/\.gpx$/i.test(file.name || '')) throw new Error('Only .gpx files are supported.');

  const text = await file.text();
  const geometry = parseGpxText(text);
  if (!geometry.points.length) throw new Error('No usable track points found in this GPX file.');

  const cachedGeometry = buildCachedGeometry(geometry.points);
  const safeName = safeFileName(file.name);
  const unique = `${Date.now()}-${cryptoRandomPart()}-${safeName}`;
  const filePath = `${tripId}/${stageId}/${unique}`;
  const blob = new Blob([text], { type: 'application/gpx+xml' });

  const { error: uploadError } = await supabase.storage
    .from(GPX_BUCKET)
    .upload(filePath, blob, {
      contentType: 'application/gpx+xml',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const payload = {
    trip_id: tripId,
    stage_id: stageId,
    file_path: filePath,
    distance_km: geometry.distance_km,
    duration_seconds: geometry.duration_seconds,
    point_count: geometry.points.length,
    bbox: geometry.bbox,
    simplified_points: cachedGeometry.simplified_points,
    heat_points: cachedGeometry.heat_points,
  };

  const { data, error } = await supabase
    .from('gpx_tracks')
    .insert(payload)
    .select()
    .single();

  if (error) {
    await supabase.storage.from(GPX_BUCKET).remove([filePath]).catch(() => {});
    throw error;
  }

  return { record: data, geometry: geometryFromGpxTrackRecord(data) || geometry };
}

export async function deleteGpxTrack(track) {
  if (!track?.id) throw new Error('Track is required.');

  const { error } = await supabase
    .from('gpx_tracks')
    .delete()
    .eq('id', track.id);
  if (error) throw error;

  if (track.file_path) {
    await supabase.storage.from(GPX_BUCKET).remove([track.file_path]).catch(() => {});
  }
}

export async function downloadAndParseGpxTrack(track) {
  const cached = geometryFromGpxTrackRecord(track);
  if (cached) return cached;

  if (!track?.file_path) throw new Error('Track file path is missing.');

  const { data, error } = await supabase.storage
    .from(GPX_BUCKET)
    .download(track.file_path);
  if (error) throw error;

  const text = await data.text();
  return parseGpxText(text);
}

export function geometryFromGpxTrackRecord(track) {
  const points = normalizeStoredPoints(track?.simplified_points);
  if (points.length < 2) return null;

  const heatPoints = normalizeStoredPoints(track?.heat_points);
  return {
    points,
    heatPoints: heatPoints.length >= 2 ? heatPoints : points,
    bbox: isValidBbox(track?.bbox) ? track.bbox : bboxForPoints(points),
    point_count: Number.isFinite(Number(track?.point_count)) ? Number(track.point_count) : points.length,
    distance_km: Number.isFinite(Number(track?.distance_km)) ? Number(track.distance_km) : null,
    duration_seconds: Number.isFinite(Number(track?.duration_seconds)) ? Number(track.duration_seconds) : null,
    cached: true,
  };
}

export function parseGpxText(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text || '', 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('This GPX file is not valid XML.');

  const nodes = [
    ...doc.querySelectorAll('trkpt'),
    ...doc.querySelectorAll('rtept'),
  ];

  const points = nodes.map((node) => {
    const lat = Number(node.getAttribute('lat'));
    const lng = Number(node.getAttribute('lon'));
    const timeText = node.querySelector('time')?.textContent?.trim() || '';
    const time = timeText ? new Date(timeText) : null;
    return {
      lat,
      lng,
      time: time && !Number.isNaN(time.getTime()) ? time.toISOString() : null,
    };
  }).filter(isValidGeoPoint);

  const distance_km = roundDistance(totalDistanceKm(points));
  const duration_seconds = durationSeconds(points);
  const bbox = bboxForPoints(points);

  return { points, bbox, distance_km, duration_seconds };
}

export function trackFileName(track) {
  const raw = String(track?.file_path || '').split('/').pop() || 'track.gpx';
  return raw.replace(/^\d+-[a-z0-9]+-/i, '') || raw;
}

function buildCachedGeometry(points) {
  const routePoints = simplifyTrackPoints(points, ROUTE_POINTS_LIMIT).map(pointForStorage);
  const heatPoints = resampleTrackPoints(points, HEATMAP_SPACING_KM, HEATMAP_POINTS_LIMIT).map(pointForStorage);
  return {
    simplified_points: routePoints,
    heat_points: heatPoints.length >= 2 ? heatPoints : routePoints,
  };
}

function normalizeStoredPoints(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => ({ lat: Number(point?.lat), lng: Number(point?.lng) }))
    .filter(isValidGeoPoint);
}

function pointForStorage(point) {
  return {
    lat: roundCoord(point.lat),
    lng: roundCoord(point.lng),
  };
}

function simplifyTrackPoints(points, maxPoints = ROUTE_POINTS_LIMIT) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  const step = Math.ceil(points.length / maxPoints);
  const reduced = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (last && reduced[reduced.length - 1] !== last) reduced.push(last);
  return reduced;
}

function resampleTrackPoints(points, spacingKm = HEATMAP_SPACING_KM, maxSamples = HEATMAP_POINTS_LIMIT) {
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

function bboxForPoints(points) {
  if (!Array.isArray(points) || !points.length) return null;
  const valid = points.filter(isValidGeoPoint);
  if (!valid.length) return null;
  return {
    minLat: roundCoord(Math.min(...valid.map((p) => p.lat))),
    maxLat: roundCoord(Math.max(...valid.map((p) => p.lat))),
    minLng: roundCoord(Math.min(...valid.map((p) => p.lng))),
    maxLng: roundCoord(Math.max(...valid.map((p) => p.lng))),
  };
}

function isValidBbox(value) {
  if (!value || typeof value !== 'object') return false;
  return ['minLat', 'maxLat', 'minLng', 'maxLng'].every((key) => Number.isFinite(Number(value[key])));
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
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 1e6) / 1e6 : null;
}

function safeFileName(name) {
  const fallback = 'track.gpx';
  const raw = String(name || fallback).trim() || fallback;
  return raw
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || fallback;
}

function cryptoRandomPart() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0].toString(36);
  }
  return Math.random().toString(36).slice(2, 10);
}
