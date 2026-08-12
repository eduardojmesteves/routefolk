// ============================================================
// routefolk — screens/render/account/account-desktop.js
// Desktop account / sign-in screen rendering.
// ============================================================

import { esc } from '../../../utils/dom.js';
import {
  avatarUrl,
  fmtEuro,
  initials,
  lifetime,
  memberSinceYear,
  myRoadsSectionHtml,
  userName,
} from '../shared.js';

function profileAvatar() {
  const url = avatarUrl();
  return url ? `<img src="${esc(url)}" alt="${esc(userName())}">` : esc(initials());
}

// Real Google avatar, member-since, sign out, lifetime mileage, and the
// "My roads" list (HANDOFF.md #16). The old palette-switcher section is
// gone for good (screens/render/shared.js palettePanel() — Ember Trail is
// the app's only palette; see PRODUCT.md).
export function renderAccount() {
  const l = lifetime();
  const year = memberSinceYear();
  return `<main class="rf-desktop-main is-account"><section class="rf-desktop-account-card"><div class="rf-desktop-account-avatar">${profileAvatar()}</div><div><h1>${esc(userName())}</h1><em>${year ? `Routefolk member since ${year}` : 'Routefolk member'}</em></div><button class="rf-desktop-btn is-danger" data-action="rf-desktop-sign-out">Sign out</button></section><section class="rf-desktop-mileage"><h2>Mileage to date</h2><div><strong>${l.trips}</strong><span>Trips</span></div><div><strong>${Math.round(l.distance).toLocaleString()}</strong><span>Distance</span></div><div><strong>${l.days}</strong><span>Days</span></div><div><strong>${fmtEuro(l.spent)}</strong><span>Spent</span></div></section>${myRoadsSectionHtml()}<div class="rf-desktop-version">routefolk · v0.6.2</div></main>`;
}

export function renderSignedOutMarkup() {
  return `<div class="rf-auth-shell"><section class="rf-auth-card"><div class="rf-eyebrow">ROUTEFOLK</div><h1>Plan it. Ride it. Log it. Settle it.</h1><p>A road journal for a small trusted group of riders.</p><button class="rf-desktop-btn is-primary" data-action="rf-desktop-sign-in" type="button">Continue with Google</button><small class="rf-auth-helper">New riders need approval from the group admin.</small></section></div>`;
}
