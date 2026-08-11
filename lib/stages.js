// ============================================================
// routefolk — stages.js
// Supabase CRUD for the `stages` table.
// - Geocodes locations on save when coords are missing.
// - Validates and persists an optional custom Maps URL that
//   overrides the auto-generated gmaps_url on the Navigate button.
// - Reorders stages through an atomic database RPC.
// ============================================================

import { supabase } from './supabase.js';
import { geocode } from './geocoding.js';

// Hostnames we trust for the user-pasted Custom Maps URL.
// Do not allow generic shorteners such as goo.gl.
const ALLOWED_MAPS_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'maps.app.goo.gl',
]);

/** Validate a pasted Maps URL.
 *  Returns the normalised URL string if valid, null if empty,
 *  throws an Error with a friendly message if invalid. */
export function validateCustomMapsUrl(value) {
  const raw = (value || '').trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('That doesn\'t look like a valid URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Custom Maps URL must start with https://');
  }
  if (!ALLOWED_MAPS_HOSTS.has(parsed.hostname)) {
    throw new Error('Only Google Maps URLs are allowed (google.com, maps.google.com, or maps.app.goo.gl).');
  }
  return parsed.toString();
}

/** List stages for a trip, ordered. */
export async function listStages(tripId) {
  const { data, error } = await supabase
    .from('stages')
    .select('*')
    .eq('trip_id', tripId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Create a stage. Geocodes locations if no coordinates provided.
 *  Validates an optional custom_route_url. */
export async function createStage(tripId, fields) {
  const { data: existing, error: countErr } = await supabase
    .from('stages')
    .select('order_index')
    .eq('trip_id', tripId)
    .order('order_index', { ascending: false })
    .limit(1);
  if (countErr) throw countErr;
  const nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

  const startLat = parseNumOrNull(fields.start_lat);
  const startLng = parseNumOrNull(fields.start_lng);
  const endLat   = parseNumOrNull(fields.end_lat);
  const endLng   = parseNumOrNull(fields.end_lng);

  const [autoStart, autoEnd] = await Promise.all([
    (startLat == null || startLng == null) && fields.start_location ? geocode(fields.start_location) : null,
    (endLat   == null || endLng   == null) && fields.end_location   ? geocode(fields.end_location)   : null,
  ]);

  const customRouteUrl = validateCustomMapsUrl(fields.custom_route_url);

  const payload = {
    trip_id: tripId,
    order_index: nextOrder,
    title: fields.title?.trim() || null,
    start_location: fields.start_location?.trim() || null,
    end_location: fields.end_location?.trim() || null,
    start_lat: startLat ?? autoStart?.latitude ?? null,
    start_lng: startLng ?? autoStart?.longitude ?? null,
    end_lat:   endLat   ?? autoEnd?.latitude   ?? null,
    end_lng:   endLng   ?? autoEnd?.longitude  ?? null,
    planned_date: fields.planned_date || null,
    distance_km: parseNumOrNull(fields.distance_km),
    notes: fields.notes?.trim() || null,
    gmaps_url: buildGmapsUrl(fields.start_location, fields.end_location),
    custom_route_url: customRouteUrl,
  };

  const { data, error } = await supabase
    .from('stages')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Update a stage. The auto-generated gmaps_url is regenerated when
 *  start/end locations change. The custom_route_url is preserved unless
 *  the form explicitly sets it (including clearing it to empty string). */
export async function updateStage(id, fields) {
  const allowed = ['title', 'start_location', 'end_location', 'start_lat', 'start_lng',
                   'end_lat', 'end_lng', 'planned_date', 'distance_km', 'notes',
                   'gmaps_url', 'custom_route_url'];
  const clean = {};
  for (const key of allowed) {
    if (key in fields) {
      const v = fields[key];
      if (key.endsWith('_lat') || key.endsWith('_lng') || key === 'distance_km') {
        clean[key] = parseNumOrNull(v);
      } else if (key === 'planned_date') {
        clean[key] = v || null;
      } else if (key === 'custom_route_url') {
        clean[key] = validateCustomMapsUrl(v); // throws if invalid
      } else {
        clean[key] = (typeof v === 'string' ? v.trim() : v) || null;
      }
    }
  }

  // Geocode missing coords if location text changed and user didn't type coords.
  const needStart = 'start_location' in fields
    && clean.start_location
    && !('start_lat' in fields && clean.start_lat != null)
    && !('start_lng' in fields && clean.start_lng != null);
  const needEnd = 'end_location' in fields
    && clean.end_location
    && !('end_lat' in fields && clean.end_lat != null)
    && !('end_lng' in fields && clean.end_lng != null);

  const [autoStart, autoEnd] = await Promise.all([
    needStart ? geocode(clean.start_location) : null,
    needEnd   ? geocode(clean.end_location)   : null,
  ]);
  if (autoStart) {
    if (clean.start_lat == null) clean.start_lat = autoStart.latitude;
    if (clean.start_lng == null) clean.start_lng = autoStart.longitude;
  }
  if (autoEnd) {
    if (clean.end_lat == null) clean.end_lat = autoEnd.latitude;
    if (clean.end_lng == null) clean.end_lng = autoEnd.longitude;
  }

  if ('start_location' in fields || 'end_location' in fields) {
    clean.gmaps_url = buildGmapsUrl(
      'start_location' in fields ? fields.start_location : undefined,
      'end_location' in fields ? fields.end_location : undefined,
    );
  }

  const { data, error } = await supabase
    .from('stages')
    .update(clean)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Delete a stage. ON DELETE CASCADE handles its journal entries. */
export async function deleteStage(id) {
  const { error } = await supabase.from('stages').delete().eq('id', id);
  if (error) throw error;
}

/** Set a stage's journal ordering mode: false = auto (sort by
 *  timestamp), true = manual override (sort by each entry's sort_order). */
export async function setJournalOrderMode(stageId, manual) {
  const { error } = await supabase
    .from('stages')
    .update({ journal_manual_order: !!manual })
    .eq('id', stageId);
  if (error) throw error;
}

/** Swap two stages' order_index values atomically through the database.
 *  The RPC locks both stage rows, checks same-trip access, and performs
 *  the swap in one transaction. */
export async function swapStageOrder(stageA, stageB) {
  if (!stageA?.id || !stageB?.id) {
    throw new Error('Both stages are required to reorder.');
  }
  if (stageA.id === stageB.id) return;

  const { error } = await supabase.rpc('swap_stage_order', {
    p_stage_a_id: stageA.id,
    p_stage_b_id: stageB.id,
  });
  if (error) throw error;
}

// ---------- Helpers ----------
function parseNumOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildGmapsUrl(origin, destination) {
  const o = (origin || '').trim();
  const d = (destination || '').trim();
  if (!o && !d) return null;
  const params = new URLSearchParams({ api: '1' });
  if (o) params.set('origin', o);
  if (d) params.set('destination', d);
  params.set('travelmode', 'driving');
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
