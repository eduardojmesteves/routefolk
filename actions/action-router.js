// ============================================================
// routefolk — actions/action-router.js
// Unified document-level action router (Task 4.1 scaffold).
//
// This is the single global click router going forward.
// Domain logic currently lives in the sibling files listed below;
// Tasks 4.2-4.8 will move each domain into a dedicated module here.
//
// Existing domain listeners (app-actions.js, wizards.js,
// extra-writes.js, gpx-panel.js) remain registered in parallel
// until Task 4.9 removes them.
// ============================================================

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
// Domain ownership map (populated by Tasks 4.2-4.8)
//
// Each entry maps an action suffix or exact action name to the module
// responsible for handling it. During the Task 4.1 scaffold phase every
// action falls through to the existing capture-phase listeners registered
// in:
//   screens/app-actions.js   — navigation, trips list, stages, journal, items
//   screens/wizards.js       — wizard save/edit/delete workflows
//   screens/extra-writes.js  — expense & item edit/delete overlays
//   screens/gpx-panel.js     — GPX track deletion
// ---------------------------------------------------------------------------

// Placeholder for future domain handler imports, e.g.:
//   import { handle as handleTrips }   from './trips.js';
//   import { handle as handleStages }  from './stages.js';
//   import { handle as handleJournal } from './journal.js';
//   import { handle as handleItems }   from './items.js';
//   import { handle as handleExpenses } from './expenses.js';
//   import { handle as handleGpx }     from './gpx.js';
//   import { handle as handleNav }     from './navigation.js';

/**
 * Route a click event to the appropriate domain handler.
 *
 * Returns true if the router fully handled the event (claimed it),
 * false if it should fall through to the existing legacy listeners.
 *
 * @param {MouseEvent} event
 * @param {Element}    btn   — the closest [data-action] ancestor
 * @param {string}     action — btn.dataset.action value
 * @returns {boolean}
 */
function route(event, btn, action) { // eslint-disable-line no-unused-vars
  // Tasks 4.2-4.8 will add routing branches here, e.g.:
  //
  //   if (action.endsWith('new-trip') || action.endsWith('list-edit-trip') || ...) {
  //     return handleTrips(event, btn, action);
  //   }
  //
  // For now all actions fall through to the legacy listeners.
  return false;
}

/**
 * Attach the single unified document-level click listener.
 * Called automatically at module load time so the router is registered
 * before the legacy per-domain listeners (which are loaded after this
 * module in index.html).
 *
 * Tasks 4.2-4.8 will progressively move domain logic here and call
 * claim(event) to stop the legacy listeners from seeing claimed events.
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

      // Attempt to route to a domain module.
      // Currently always returns false (Task 4.1 scaffold).
      // Tasks 4.2-4.8 will progressively take ownership here.
      route(event, btn, action);
    },
    true, // capture phase — mirrors the existing listeners
  );
}

// Self-initialize: register the listener as soon as this module loads.
// This ensures the unified router is the first capture-phase click handler
// on the document, ahead of the legacy per-file listeners.
initActionRouter();
