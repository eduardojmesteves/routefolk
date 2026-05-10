// ============================================================
// routefolk — supabase.js
// Initialises the Supabase client and exports a single instance.
// Loaded from CDN — no build step.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT-ID')) {
  console.error('Supabase URL is not configured. Edit lib/config.js.');
}
if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'YOUR-ANON-KEY') {
  console.error('Supabase anon key is not configured. Edit lib/config.js.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
