// ============================================================
// routefolk — gpx.js
// GPX upload, parsing, and storage helpers.
// GPX tracks are linked to individual stages.
// ============================================================

import { supabase } from './supabase.js';

const GPX_BUCKET = 'gpx-tracks';
const MAX_GPX_BYTES = 8 * 1024 * 1024; // keep it small for mobile/PWA use

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

  return { record: data, geometry };
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
  if (!track?.file_path) throw new Error('Track file path is missing.');

  const { data, error } = await supabase.storage
    .from(GPX_BUCKET)
    .download(track.file_path);
  if (error) throw error;

  const text = await data.text();
  return parseGpxText(text);
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
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  const distance_km = roundDistance(totalDistanceKm(points));
  const duration_seconds = durationSeconds(points);

  return { points, distance_km, duration_seconds };
}

export function trackFileName(track) {
  const raw = String(track?.file_path || '').split('/').pop() || 'track.gpx';
  return raw.replace(/^\d+-[a-z0-9]+-/i, '') || raw;
}

function totalDistanceKm(points) {
  if (!points.length) return null;
  let km = 0;
  for (let i = 1; i < points.length; i += 1) {
    km += haversineKm(points[i - 1], points[i]);
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
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

function roundDistance(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
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
