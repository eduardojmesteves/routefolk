// ============================================================
// routefolk — journal.js
// Supabase CRUD for the `journal_entries` table.
// author_id is set automatically by a database trigger.
// ============================================================

import { supabase } from './supabase.js';

const VALID_TYPES = new Set(['stop', 'meal', 'lodging', 'note', 'drink', 'other']);

// Hostnames we trust for Maps/location URLs.
const ALLOWED_MAPS_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'goo.gl',
  'maps.app.goo.gl',
]);

/** Validate an optional photo album URL.
 *  Returns the trimmed URL string if valid, null if empty,
 *  throws an Error with a friendly message if invalid. */
export function validatePhotoAlbumUrl(value) {
  const parsed = parseOptionalHttpsUrl(value, 'Photo album URL must start with https://');
  return parsed ? parsed.toString() : null;
}

/** Validate an optional Maps/location URL.
 *  Returns the normalised URL string if valid, null if empty,
 *  throws an Error with a friendly message if invalid. */
export function validateLocationUrl(value) {
  const parsed = parseOptionalHttpsUrl(value, 'Maps URL must start with https://');
  if (!parsed) return null;
  if (!ALLOWED_MAPS_HOSTS.has(parsed.hostname)) {
    throw new Error('Only Google Maps URLs are allowed for the Maps URL field (google.com or maps.app.goo.gl).');
  }
  return parsed.toString();
}

/** Validate an optional generic info/website URL.
 *  Booking.com, restaurant sites, TripAdvisor, blogs, etc. are all allowed.
 *  The only rule is HTTPS. */
export function validateInfoUrl(value) {
  const parsed = parseOptionalHttpsUrl(value, 'Website URL must start with https://');
  return parsed ? parsed.toString() : null;
}

/** List journal entries for a stage, sorted by timestamp ascending
 *  (oldest first — so the journal reads chronologically). */
export async function listEntriesForStage(stageId) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('stage_id', stageId)
    .order('timestamp', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Create a journal entry. author_id is set by trigger. */
export async function createEntry(stageId, fields) {
  const entryType = VALID_TYPES.has(fields.entry_type) ? fields.entry_type : 'note';
  const payload = {
    stage_id: stageId,
    entry_type: entryType,
    title: fields.title?.trim() || null,
    description: fields.description?.trim() || null,
    location: fields.location?.trim() || null,
    location_url: validateLocationUrl(fields.location_url),
    info_url: validateInfoUrl(fields.info_url),
    timestamp: fields.timestamp || null,
    photo_album_url: validatePhotoAlbumUrl(fields.photo_album_url),
  };

  const { data, error } = await supabase
    .from('journal_entries')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Update a journal entry. */
export async function updateEntry(id, fields) {
  const allowed = [
    'entry_type',
    'title',
    'description',
    'location',
    'location_url',
    'info_url',
    'timestamp',
    'photo_album_url',
  ];
  const clean = {};

  for (const key of allowed) {
    if (!(key in fields)) continue;

    const v = fields[key];
    if (key === 'entry_type') {
      clean[key] = VALID_TYPES.has(v) ? v : 'note';
    } else if (key === 'timestamp') {
      clean[key] = v || null;
    } else if (key === 'location_url') {
      clean[key] = validateLocationUrl(v); // throws if invalid
    } else if (key === 'info_url') {
      clean[key] = validateInfoUrl(v); // throws if invalid
    } else if (key === 'photo_album_url') {
      clean[key] = validatePhotoAlbumUrl(v); // throws if invalid
    } else {
      clean[key] = (typeof v === 'string' ? v.trim() : v) || null;
    }
  }

  const { data, error } = await supabase
    .from('journal_entries')
    .update(clean)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Delete a journal entry. */
export async function deleteEntry(id) {
  const { error } = await supabase.from('journal_entries').delete().eq('id', id);
  if (error) throw error;
}

function parseOptionalHttpsUrl(value, protocolErrorMessage) {
  const raw = (value || '').trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('That doesn\'t look like a valid URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(protocolErrorMessage);
  }

  return parsed;
}
