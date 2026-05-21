// ============================================================
// routefolk — trips.js
// Phase 1.5 visibility hotfix: persist and verify trip visibility.
// Supabase CRUD for the `trips` table.
// Each function does one operation, throws on failure,
// returns plain data on success.
// ============================================================

import { supabase } from './supabase.js';

const VALID_VISIBILITIES = new Set(['private', 'selected', 'group']);

function cleanVisibility(value) {
  return VALID_VISIBILITIES.has(value) ? value : 'group';
}

/** List all trips visible to the current user, newest start_date first.
 *  RLS filters private/group visibility in the database. */
export async function listTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Get a single visible trip by id. */
export async function getTrip(id) {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/** Create a new trip. created_by is set by a database trigger. */
export async function createTrip({ title, description, start_date, end_date, status, visibility }) {
  const requestedVisibility = cleanVisibility(visibility);
  const payload = {
    title: (title || '').trim(),
    description: description || null,
    start_date: start_date || null,
    end_date: end_date || null,
    status: status || 'planning',
    visibility: requestedVisibility,
  };
  if (!payload.title) throw new Error('Title is required.');

  const { data, error } = await supabase
    .from('trips')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  assertVisibilityPersisted(data, requestedVisibility, 'create');
  return data;
}

/** Update an existing trip. Pass only the fields you want changed.
 *  RLS blocks non-creators from making a group trip private. */
export async function updateTrip(id, patch) {
  const allowed = ['title', 'description', 'start_date', 'end_date', 'status', 'cover_photo_url', 'visibility'];
  const clean = {};
  let requestedVisibility = null;

  for (const key of allowed) {
    if (key in patch) {
      if (key === 'visibility') {
        requestedVisibility = cleanVisibility(patch[key]);
        clean[key] = requestedVisibility;
      } else {
        clean[key] = patch[key] === '' ? null : patch[key];
      }
    }
  }

  if (clean.title !== undefined && !clean.title?.trim()) {
    throw new Error('Title cannot be empty.');
  }

  const { data, error } = await supabase
    .from('trips')
    .update(clean)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  if (requestedVisibility) assertVisibilityPersisted(data, requestedVisibility, 'update');
  return data;
}

function assertVisibilityPersisted(row, expected, operation) {
  if (!row) return;
  if (row.visibility !== expected) {
    console.error('Trip visibility did not persist', { operation, expected, returned: row.visibility, row });
    throw new Error(`Trip visibility was not saved as ${expected}. This usually means stale app files are still being served or the visibility migration/policies are not current.`);
  }
}

/** Delete a trip. RLS allows only the creator to delete. */
export async function deleteTrip(id) {
  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
