// ============================================================
// routefolk — write-guards.js
// Shared write-permission and user-facing error helpers.
// ============================================================

import { STATE } from '../state/app-state.js';
import { toast } from '../components/toast.js';

export function canDeleteTrip(trip) {
  return Boolean(STATE.user?.id && trip?.created_by === STATE.user.id);
}

export function canWrite() {
  return STATE.isOnline !== false;
}

export function writeDisabledAttr() {
  return canWrite() ? '' : ' disabled';
}

export function ensureOnline(message = 'You are offline. Reconnect before making changes.') {
  if (canWrite()) return true;
  toast(message);
  return false;
}

export function friendlyError(action, err) {
  const msg = String(err?.message || '').toLowerCase();
  if (!canWrite()) return 'You are offline. Reconnect and try again.';
  if (msg.includes('permission') || msg.includes('policy') || msg.includes('rls') || msg.includes('not allowed')) {
    return `Could not ${action}. You may not have permission.`;
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) {
    return `Could not ${action}. Check your connection and try again.`;
  }
  return `Could not ${action}. Please try again.`;
}

export function friendlyGpxError(action, err) {
  const msg = String(err?.message || '').toLowerCase();
  if (!canWrite()) return 'You are offline. Reconnect before changing GPX files.';
  if (msg.includes('file type') || msg.includes('extension') || msg.includes('.gpx')) {
    return 'Choose a valid .gpx file.';
  }
  if (msg.includes('too large') || msg.includes('size')) {
    return 'This GPX file is too large. Keep GPX files under 8 MB for now.';
  }
  if (msg.includes('empty') || msg.includes('no route') || msg.includes('no track') || msg.includes('track points') || msg.includes('usable')) {
    return 'Could not read this GPX file. It does not contain usable track points.';
  }
  if (msg.includes('storage') || msg.includes('bucket') || msg.includes('object')) {
    return `Could not ${action}. The GPX storage operation failed. Try again.`;
  }
  return friendlyError(action, err);
}
