// ============================================================
// routefolk — app-shell.js
// Header, navigation, and offline banner rendering.
// Phase 2: Ink & Rust app shell treatment.
// ============================================================

import { STATE } from '../state/app-state.js';
import { $, esc } from '../utils/dom.js';
import { userInitials, userDisplayName, userAvatarUrl } from '../utils/user.js';

export function offlineBannerHtml() {
  if (STATE.isOnline !== false) return '';
  return `
    <div class="offline-banner rf-offline-banner" role="status">
      <span class="rf-offline-stamp">Offline</span>
      <span>You can view cached content, but changes are disabled until you reconnect.</span>
    </div>
  `;
}

export function renderHeader({ onSignIn, onAccountClick } = {}) {
  const right = $('hdrRight');
  const sub = $('hdrSub');
  const title = $('hdrTitle');
  const kicker = $('hdrKicker');

  if (kicker) kicker.textContent = 'routefolk';
  if (title) title.textContent = headerTitle();
  if (sub) sub.textContent = headerSubtitle();
  if (!right) return;

  if (!STATE.user) {
    right.innerHTML = `
      <button class="btn btn-secondary btn-sm rf-shell-signin" id="signInBtn">
        Sign in
      </button>
    `;
    $('signInBtn')?.addEventListener('click', () => onSignIn?.());
    return;
  }

  const avatar = userAvatarUrl(STATE.user);
  const displayName = userDisplayName(STATE.user);
  right.innerHTML = `
    <button class="account-avatar rf-shell-avatar" id="hdrAvatarBtn" title="${esc(displayName)}" aria-label="Open account">
      ${avatar
        ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">`
        : esc(userInitials(STATE.user))}
    </button>
  `;
  $('hdrAvatarBtn')?.addEventListener('click', () => onAccountClick?.());
}

export function renderNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const isActive = btn.dataset.tab === STATE.tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

export function bindNav(onNavigate) {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => onNavigate?.(btn.dataset.tab));
  });
}

function headerTitle() {
  if (!STATE.user) return 'Field journal';
  if (STATE.tab === 'account') return 'Passport';
  if (STATE.tab === 'archive') return 'Archive';
  if (STATE.view === 'summary') return 'Trip ledger';
  if (STATE.view === 'detail') return 'Route notes';
  return 'Trips';
}

function headerSubtitle() {
  if (!STATE.user) return 'Plan · ride · remember';
  if (STATE.tab === 'account') return 'Profile · access · session';
  if (STATE.view === 'summary') return 'Review before the road';
  if (STATE.view === 'detail') return 'Stages · journal · expenses';
  if (STATE.tab === 'archive') return 'Past routes and traces';
  return 'Almanac index';
}
