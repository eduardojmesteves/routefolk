// ============================================================
// routefolk — profiles.js
// Lightweight public profile records for signed-in users.
// Used for names/avatars in journal entries and future expenses.
// ============================================================

import { supabase } from './supabase.js';

function profilePayloadFromUser(user) {
  return {
    id: user.id,
    email: user.email || null,
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || null,
    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
  };
}

/** Create or refresh the current user's profile after sign-in. */
export async function upsertCurrentProfile(user) {
  if (!user?.id) return null;
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profilePayloadFromUser(user), { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** List profiles for users who have signed in at least once. */
export async function listProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('email', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}
