// ============================================================
// routefolk — expenses.js
// Supabase CRUD for trip expenses.
// Phase 2B: total trip cost, optional stage assignment, EUR only.
// ============================================================

import { supabase } from './supabase.js';

const VALID_CATEGORIES = new Set([
  'fuel',
  'food_drinks',
  'lodging',
  'tolls',
  'parking',
  'other',
]);

function cleanCategory(value) {
  return VALID_CATEGORIES.has(value) ? value : 'other';
}

function cleanAmount(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number.');
  }
  return Math.round(amount * 100) / 100;
}

function cleanText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function cleanDate(value) {
  const text = cleanText(value);
  return text || null;
}

function requirePayer(value) {
  const id = cleanText(value);
  if (!id) throw new Error('Paid by is required.');
  return id;
}

function cleanStageId(value) {
  return cleanText(value);
}

/** List expenses for a trip, newest dated expenses first. */
export async function listExpensesForTrip(tripId) {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('trip_id', tripId)
    .order('date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Create an expense. user_id is the selected payer. created_by is set by trigger. */
export async function createExpense(tripId, fields) {
  const payload = {
    trip_id: tripId,
    user_id: requirePayer(fields.user_id),
    category: cleanCategory(fields.category),
    amount: cleanAmount(fields.amount),
    currency: 'EUR',
    description: cleanText(fields.description),
    date: cleanDate(fields.date),
    stage_id: cleanStageId(fields.stage_id),
  };

  const { data, error } = await supabase
    .from('expenses')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Update an expense. */
export async function updateExpense(id, fields) {
  const clean = {};

  if ('user_id' in fields) clean.user_id = requirePayer(fields.user_id);
  if ('category' in fields) clean.category = cleanCategory(fields.category);
  if ('amount' in fields) clean.amount = cleanAmount(fields.amount);
  if ('description' in fields) clean.description = cleanText(fields.description);
  if ('date' in fields) clean.date = cleanDate(fields.date);
  if ('stage_id' in fields) clean.stage_id = cleanStageId(fields.stage_id);
  clean.currency = 'EUR';

  const { data, error } = await supabase
    .from('expenses')
    .update(clean)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Delete an expense. */
export async function deleteExpense(id) {
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
