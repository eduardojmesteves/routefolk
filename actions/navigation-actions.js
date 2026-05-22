// ============================================================
// routefolk — actions/navigation-actions.js
// Navigation domain: primary tab switching, trip selection,
// archived trip selection, and back navigation.
//
// Task 4.2 wrapper: delegates to the shared dispatcher exported by
// screens/app-actions.js. Task 4.9 will move the underlying logic
// here and retire the legacy sidecar.
// ============================================================

import { dispatchAppAction } from '../screens/app-actions.js';

/** Action names (suffix-matched) owned by the navigation domain. */
const NAVIGATION_SUFFIXES = [
  'nav',
  'select-trip',
  'select-archived',
  'back-to-trips',
  'back-to-archive',
  'back-to-stages',
  'tab',
  // Account / palette actions — not in a dedicated domain, routed here.
  'sign-in',
  'sign-out',
  'status-filter',
  'search-toggle',
];

/** Exact-match actions owned by the navigation domain. */
const NAVIGATION_EXACT = new Set(['rf-palette-select']);

/**
 * @param {string} action
 * @returns {boolean} true if this action belongs to the navigation domain
 */
export function owns(action) {
  return NAVIGATION_EXACT.has(action)
    || NAVIGATION_SUFFIXES.some((suffix) => action.endsWith(suffix));
}

/**
 * Handle a navigation action.
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>} true if handled
 */
export async function handle(event, btn, action) {
  return dispatchAppAction(event, btn, action);
}
