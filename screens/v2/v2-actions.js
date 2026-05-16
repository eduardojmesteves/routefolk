// ============================================================
// routefolk — screens/v2/v2-actions.js
// Small bridge actions for controls that cannot rely on the
// legacy hidden DOM after the v2 render takeover.
// ============================================================

import { signInWithGoogle, signOut } from '../../lib/auth.js';
import { createTrip } from '../../lib/trips.js';
import { STATE } from '../../state/app-state.js';

function refreshSoon() {
  setTimeout(() => window.location.reload(), 250);
}

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action || '';

  if (action.endsWith('sign-in')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await signInWithGoogle();
    return;
  }

  if (action.endsWith('sign-out')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await signOut();
    refreshSoon();
    return;
  }

  if (action.endsWith('new-trip')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const title = window.prompt('Trip title');
    if (!title?.trim()) return;
    const trip = await createTrip({
      title: title.trim(),
      description: '',
      start_date: null,
      end_date: null,
      status: 'planning',
      visibility: 'group',
    });
    STATE.trips = [trip, ...STATE.trips.filter((item) => item.id !== trip.id)];
    STATE.tab = 'trips';
    STATE.view = 'detail';
    STATE.viewTripId = trip.id;
    STATE.selectedTripId = trip.id;
  }
}, true);
