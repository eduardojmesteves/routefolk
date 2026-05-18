// ============================================================
// routefolk — items.js
// Supabase-backed trip packing and item list MVP.
// ============================================================

import { supabase } from './supabase.js';

export const DEFAULT_ITEM_CATEGORIES = [
  'Clothing',
  'Luggage',
  'Tools',
  'Gear',
  'Documents',
  'First-Aid',
  'Other',
];

const ITEM_STATUSES = ['planned', 'packed', 'optional'];

function normalizeName(value) {
  return String(value || '').trim();
}

function normalizeStatus(value) {
  return ITEM_STATUSES.includes(value) ? value : 'planned';
}

export async function listItemCategoriesForTrip(tripId) {
  const { data, error } = await supabase
    .from('item_categories')
    .select('*')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function ensureDefaultItemCategories(tripId) {
  const existing = await listItemCategoriesForTrip(tripId);
  if (existing.length) return existing;

  const rows = DEFAULT_ITEM_CATEGORIES.map((name, index) => ({
    trip_id: tripId,
    name,
    sort_order: index,
  }));

  const { data, error } = await supabase
    .from('item_categories')
    .insert(rows)
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function listItemsForTrip(tripId) {
  const { data, error } = await supabase
    .from('trip_items')
    .select('*, category:item_categories(id,name,sort_order)')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createTripItem(tripId, fields = {}) {
  const name = normalizeName(fields.name || fields.text);
  if (!name) throw new Error('Item name is required.');

  const row = {
    trip_id: tripId,
    category_id: fields.category_id || null,
    name,
    status: normalizeStatus(fields.status),
    assigned_to: fields.assigned_to || fields.assignedTo || null,
    notes: normalizeName(fields.notes) || null,
  };

  const { data, error } = await supabase
    .from('trip_items')
    .insert(row)
    .select('*, category:item_categories(id,name,sort_order)')
    .single();

  if (error) throw error;
  return data;
}

export async function updateTripItem(itemId, fields = {}) {
  const patch = {};
  if ('name' in fields || 'text' in fields) {
    const name = normalizeName(fields.name || fields.text);
    if (!name) throw new Error('Item name is required.');
    patch.name = name;
  }
  if ('category_id' in fields) patch.category_id = fields.category_id || null;
  if ('status' in fields) patch.status = normalizeStatus(fields.status);
  if ('assigned_to' in fields || 'assignedTo' in fields) patch.assigned_to = fields.assigned_to || fields.assignedTo || null;
  if ('notes' in fields) patch.notes = normalizeName(fields.notes) || null;

  const { data, error } = await supabase
    .from('trip_items')
    .update(patch)
    .eq('id', itemId)
    .select('*, category:item_categories(id,name,sort_order)')
    .single();

  if (error) throw error;
  return data;
}

export async function toggleTripItemPacked(item) {
  const nextStatus = item?.status === 'packed' ? 'planned' : 'packed';
  return updateTripItem(item.id, { status: nextStatus });
}

export async function deleteTripItem(itemId) {
  const { error } = await supabase.from('trip_items').delete().eq('id', itemId);
  if (error) throw error;
}
