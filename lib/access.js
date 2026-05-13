// ============================================================
// routefolk — access.js
// App membership/access diagnostics.
// ============================================================

import { supabase } from './supabase.js';

export async function getCurrentAppAccess() {
  const { data, error } = await supabase.rpc('get_current_app_access');
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}
