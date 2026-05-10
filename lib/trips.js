// ============================================================
// routefolk — trips.js
// Supabase CRUD for the `trips` table.
// Each function does one operation, throws on failure,
// returns plain data on success.
// ============================================================

import { supabase } from './supabase.js';

/** List all trips, newest start_date first.
 *  Trips with no start_date go to the bottom. */
export async function listTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Get a single trip by id. */
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
export async function createTrip({ title, description, start_date, end_date, status }) {
  const payload = {
    title: (title || '').trim(),
    description: description || null,
    start_date: start_date || null,
    end_date: end_date || null,
    status: status || 'planning',
  };
  if (!payload.title) throw new Error('Title is required.');

  const { data, error } = await supabase
    .from('trips')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Update an existing trip. Pass only the fields you want changed. */
export async function updateTrip(id, patch) {
  const allowed = ['title', 'description', 'start_date', 'end_date', 'status', 'cover_photo_url'];
  const clean = {};
  for (const key of allowed) {
    if (key in patch) clean[key] = patch[key] === '' ? null : patch[key];
  }
  if (clean.title !== undefined && !clean.title?.trim()) {
    throw new Error('Title cannot be empty.');
  }

  const { data, error } = await supabase
    .from('trips')
    .update(clean)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Delete a trip. Cascade removes its stages, journal entries, expenses, etc. */
export async function deleteTrip(id) {
  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
