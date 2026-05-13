// ============================================================
// routefolk — utils/user.js
// User/profile display helpers shared by app screens.
// ============================================================

import { STATE } from '../state/app-state.js';

export function userInitials(user) {
  const name = user?.user_metadata?.full_name || user?.email || '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
}

export function userDisplayName(user) {
  return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Unknown';
}

export function userAvatarUrl(user) {
  return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';
}

export function initialsFromName(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';
}

export function profileForUserId(userId) {
  return userId ? STATE.profilesById[userId] || null : null;
}

export function displayNameForUserId(userId) {
  if (STATE.user && userId === STATE.user.id) return userDisplayName(STATE.user);
  const profile = profileForUserId(userId);
  return profile?.full_name || profile?.email || 'Friend';
}

export function authorInitials(authorId) {
  return initialsFromName(displayNameForUserId(authorId));
}

export function authorLabel(authorId) {
  if (STATE.user && authorId === STATE.user.id) return `You — ${userDisplayName(STATE.user)}`;
  return displayNameForUserId(authorId);
}
