// ============================================================
// routefolk — screens/render/account/account-desktop.js
// Desktop account / sign-in screen rendering.
// ============================================================

import { STATE } from '../../../state/app-state.js';
import { esc } from '../../../utils/dom.js';
import {
  avatarUrl,
  fmtEuro,
  initials,
  lifetime,
  memberSinceYear,
  palettePanel,
  userName,
} from '../shared.js';

function profileAvatar() {
  const url = avatarUrl();
  return url ? `<img src="${esc(url)}" alt="${esc(userName())}">` : esc(initials());
}

export function renderAccount() {
  const l = lifetime();
  const year = memberSinceYear();
  return `<main class="rf-d2-main is-account"><section class="rf-d2-account-card"><div class="rf-d2-account-avatar">${profileAvatar()}</div><div><h1>${esc(userName())}</h1><em>${year ? `Routefolk member since ${year}` : 'Routefolk member'}</em></div><button class="rf-d2-btn is-danger" data-action="rf-d2-sign-out">Sign out</button></section><section class="rf-d2-riders-card"><h2>Other riders</h2><p>${Math.max(0, STATE.profiles.length - 1)} people you've ridden with</p></section><section class="rf-d2-mileage"><h2>Mileage to date</h2><div><strong>${l.trips}</strong><span>Trips</span></div><div><strong>${Math.round(l.distance).toLocaleString()}</strong><span>Distance</span></div><div><strong>${l.days}</strong><span>Days</span></div><div><strong>${fmtEuro(l.spent)}</strong><span>Spent</span></div></section><section class="rf-clean-desktop-pref">${palettePanel()}</section><div class="rf-d2-version">routefolk · v0.6.2</div></main>`;
}

export function renderSignedOutMarkup() {
  return `<div class="rf-auth-shell"><section class="rf-auth-card"><div class="rf-d2-kicker">Routefolk</div><h1>Field journal for the road</h1><p>Plan routes, record stages, keep notes, costs, packing lists and GPX tracks in one road journal.</p><button class="rf-d2-btn is-primary" data-action="rf-d2-sign-in" type="button">Sign in with Google</button></section></div>`;
}
