// ============================================================
// routefolk — session-controller.js
// Sign-in, access, schema, and signed-in data flow.
// ============================================================

import { signInWithGoogle, signOut } from '../lib/auth.js';
import { upsertCurrentProfile } from '../lib/profiles.js';
import { getSchemaVersion } from '../lib/meta.js';
import { getCurrentAppAccess } from '../lib/access.js';
import { STATE } from './app-state.js';
import { toast } from '../components/toast.js';

export function createSessionController({
  expectedSchemaVersion,
  renderAll,
  loadProfiles,
  loadTrips,
}) {
  async function ensureAppAccess() {
    if (!STATE.user) return false;

    STATE.accessLoading = true;
    STATE.accessError = null;
    renderAll();

    try {
      const access = await getCurrentAppAccess();
      STATE.appAccess = access;

      if (!access?.is_allowed) {
        const email = access?.email || STATE.user?.email || 'this Google account';
        STATE.accessError = `This Google account (${email}) is signed in, but it is not an active routefolk app member. Ask the app admin to add this email to public.app_members.`;
        return false;
      }

      return true;
    } catch (err) {
      console.error(err);
      STATE.accessError = 'Could not verify app access. Confirm migration 011 has been applied in Supabase, then try again.';
      return false;
    } finally {
      STATE.accessLoading = false;
      renderAll();
    }
  }

  async function ensureSchemaCompatible() {
    if (!STATE.user) return false;

    STATE.schemaLoading = true;
    STATE.schemaError = null;
    renderAll();

    try {
      const version = await getSchemaVersion();
      STATE.schemaVersion = version;

      if (version !== expectedSchemaVersion) {
        STATE.schemaError = `Database migration required. Expected schema version ${expectedSchemaVersion}, but found ${version || 'none'}.`;
        return false;
      }

      return true;
    } catch (err) {
      console.error(err);
      STATE.schemaError = 'Could not verify database schema version. Check the connection and confirm migrations are applied.';
      return false;
    } finally {
      STATE.schemaLoading = false;
      renderAll();
    }
  }

  async function loadSignedInData() {
    if (!STATE.user) return;

    const accessOk = await ensureAppAccess();
    if (!accessOk) return;

    const schemaOk = await ensureSchemaCompatible();
    if (!schemaOk) return;

    try {
      await upsertCurrentProfile(STATE.user);
    } catch (err) {
      console.warn('Profile upsert failed:', err);
      toast('Signed in, but profile sync failed.');
    }

    await loadProfiles();
    await loadTrips();
  }

  async function handleSignIn() {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Sign-in failed.');
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Sign-out failed.');
    }
  }

  return {
    ensureAppAccess,
    ensureSchemaCompatible,
    loadSignedInData,
    handleSignIn,
    handleSignOut,
  };
}
