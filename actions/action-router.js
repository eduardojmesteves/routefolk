// ============================================================
// routefolk — actions/action-router.js
// Unified document-level action router.
//
// This is the single global click router going forward. Each click on
// a [data-action] element is routed to the domain module that owns it.
//
// Tasks 4.2-4.8 introduced seven domain modules under actions/. They
// currently act as thin wrappers that delegate to the dispatcher
// functions still exported by the legacy sidecars (screens/app-actions
// .js, screens/wizards.js, screens/extra-writes.js, screens/gpx-panel
// .js). Task 4.9 will move the underlying logic into these modules and
// remove the legacy sidecars entirely.
//
// Because this listener is registered first (this module loads ahead
// of the legacy sidecars in index.html) and runs in the capture phase,
// claiming a routed event with claim() stops the legacy capture-phase
// listeners from also handling it — preventing double execution.
// ============================================================

import * as navigation from './navigation-actions.js';
import * as trip from './trip-actions.js';
import * as stage from './stage-actions.js';
import { dispatchWizardAction } from '../screens/wizards.js';

/**
 * Prevent the event from bubbling further and stop any other
 * listeners from seeing it. Call this at the top of each handler
 * that fully owns its action.
 *
 * @param {Event} event
 */
export function claim(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

// ---------------------------------------------------------------------------
// Domain ownership map.
//
// Domain modules are probed in priority order. Several actions are
// recognised by more than one domain (e.g. wizard cancel) — the order
// below mirrors the legacy capture-phase registration order so behaviour
// is preserved exactly:
//   screens/wizards.js  >  screens/extra-writes.js  >  screens/app-actions.js
// ---------------------------------------------------------------------------
const DOMAINS = [trip, stage, navigation];

/**
 * Route a click event to the appropriate domain handler.
 *
 * Returns true if the router fully handled the event (claimed it),
 * false if it should fall through to the legacy listeners.
 *
 * @param {MouseEvent} event
 * @param {Element}    btn    — the closest [data-action] ancestor
 * @param {string}     action — btn.dataset.action value
 * @returns {Promise<boolean>}
 */
async function route(event, btn, action) {
  // Shared wizard-cancel action is owned by wizards.js in the legacy
  // capture-phase registration order.
  if (action === 'rf-v2-cancel-wizard' || action === 'rf-v2-cancel-gpx-upload') {
    await dispatchWizardAction(event, btn, action);
    return true;
  }

  for (const domain of DOMAINS) {
    if (domain.owns(action)) {
      const handled = await domain.handle(event, btn, action);
      if (handled) return true;
    }
  }
  return false;
}

/**
 * Attach the single unified document-level click listener.
 * Called automatically at module load time so the router is registered
 * before the legacy per-domain listeners (which are loaded after this
 * module in index.html).
 *
 * Each delegated dispatcher calls claim() internally when it owns an
 * action, which stops the legacy capture-phase listeners on `document`
 * from also handling the event.
 */
export function initActionRouter() {
  document.addEventListener(
    'click',
    async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const btn = target?.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action || '';
      if (!action) return;

      // Route to a domain module. Unhandled actions fall through to the
      // legacy listeners untouched (route() leaves the event unclaimed).
      await route(event, btn, action);
    },
    true, // capture phase — mirrors the existing listeners
  );
}

// Self-initialize: register the listener as soon as this module loads.
// This ensures the unified router is the first capture-phase click handler
// on the document, ahead of the legacy per-file listeners.
initActionRouter();
