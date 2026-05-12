// ============================================================
// routefolk — meta.js
// Lightweight app/database metadata helpers.
// ============================================================

import { supabase } from './supabase.js';

export async function getSchemaVersion() {
  const { data, error } = await supabase
    .from('app_meta')
    .select('value')
    .eq('key', 'schema_version')
    .maybeSingle();

  if (error) throw error;
  return data?.value || null;
}
