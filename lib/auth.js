// ============================================================
// routefolk — auth.js
// Sign in with Google, sign out, get current user,
// subscribe to auth state changes.
// ============================================================

import { supabase } from './supabase.js';

/** Start the Google OAuth flow. Browser will redirect to Google,
 *  then back to the current page after consent. */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) {
    console.error('Sign-in failed:', error);
    throw error;
  }
}

/** Clear the local session. */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Sign-out failed:', error);
    throw error;
  }
}

/** Get the current user (or null if not signed in). */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // Common: "Auth session missing!" — not an error, just signed out.
    return null;
  }
  return data?.user || null;
}

/** Get the current session (or null). */
export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return () => data?.subscription?.unsubscribe();
}
