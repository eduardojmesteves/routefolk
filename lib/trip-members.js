// ============================================================
// routefolk — trip-members.js
// Trip-level selected visibility helpers.
// This is visibility, not a trip-role system.
// ============================================================

import { supabase } from './supabase.js';

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueEmails(values = []) {
  return [...new Set(values.map(cleanEmail).filter(Boolean))];
}

/** List active Routefolk app members available for selected-trip visibility. */
export async function listActiveTripMembers() {
  const { data, error } = await supabase.rpc('list_active_app_members');
  if (error) throw error;
  return (data || []).map((row) => ({
    email: cleanEmail(row.email),
    user_id: row.user_id || null,
    full_name: row.full_name || row.email || null,
    avatar_url: row.avatar_url || null,
  })).filter((row) => row.email);
}

/** List selected members for one trip. */
export async function listTripMembersForTrip(tripId) {
  const { data, error } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', tripId)
    .order('member_email', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    member_email: cleanEmail(row.member_email),
  }));
}

/** Replace the selected-member list for a trip. Creator-only by RLS. */
export async function replaceTripMembers(tripId, memberEmails = []) {
  const emails = uniqueEmails(memberEmails);

  const { error: deleteError } = await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId);
  if (deleteError) throw deleteError;

  if (!emails.length) return [];

  const rows = emails.map((email) => ({
    trip_id: tripId,
    member_email: email,
  }));

  const { data, error } = await supabase
    .from('trip_members')
    .insert(rows)
    .select('*')
    .order('member_email', { ascending: true });
  if (error) throw error;
  return data || [];
}
