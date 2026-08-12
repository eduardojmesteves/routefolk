// ============================================================
// routefolk — screens/render/account/account-mobile.js
// Mobile account screen rendering.
// ============================================================

import { esc } from '../../../utils/dom.js';
import {
  avatarUrl,
  fmtEuro,
  initials,
  lifetime,
  memberSinceYear,
  metricGrid,
  myRoadsSectionHtml,
  userName,
} from '../shared.js';

// The old palette-switcher section is gone for good (Ember Trail is the
// app's only palette). "My roads" (HANDOFF.md #16) is shared markup with
// the desktop account screen — see screens/render/shared.js.
export function renderMobileAccount(screen) {
  const l = lifetime();
  const year = memberSinceYear();
  const avatar = avatarUrl() ? `<img src="${esc(avatarUrl())}" alt="${esc(userName())}">` : esc(initials());
  return screen(`<header class="rf-clean-trip-head"><div class="rf-clean-kicker">The bearer</div><h1>You</h1></header><main class="rf-clean-page"><section class="rf-clean-profile"><div>${avatar}</div><h2>${esc(userName())}</h2><p>${year ? `Routefolk member since ${year}` : 'Routefolk member'}</p><button data-action="rf-mobile-sign-out">Sign out</button></section><h2>Mileage to date</h2>${metricGrid([['Trips', String(l.trips), 'finished + planned'], ['Distance', Math.round(l.distance).toLocaleString(), 'km'], ['Days', String(l.days), 'on the road'], ['Spent', fmtEuro(l.spent), 'across trips']])}${myRoadsSectionHtml()}</main>`, 'account');
}
