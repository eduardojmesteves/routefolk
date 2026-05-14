// ============================================================
// routefolk — app-shell.js
// Header, navigation, and offline banner rendering.
// ============================================================

import { STATE } from '../state/app-state.js';
import { $, esc } from '../utils/dom.js';
import { userInitials, userDisplayName, userAvatarUrl } from '../utils/user.js';

export function offlineBannerHtml() {
  if (STATE.isOnline !== false) return '';
  return `
    <div class="offline-banner" role="status">
      You are offline. You can view cached content, but changes are disabled until you reconnect.
    </div>
  `;
}

export function renderHeader({ onSignIn, onAccountClick } = {}) {
  const right = $('hdrRight');
  const sub = $('hdrSub');
  if (sub) sub.textContent = headerSubtitle();
  if (!right) return;

  if (!STATE.user) {
    right.innerHTML = `<button class="btn btn-secondary btn-sm" id="signInBtn">Sign in</button>`;
    $('signInBtn')?.addEventListener('click', () => onSignIn?.());
    return;
  }

  const avatar = userAvatarUrl(STATE.user);
  right.innerHTML = `
    <button class="account-avatar" id="hdrAvatarBtn" title="${esc(userDisplayName(STATE.user))}" style="cursor:pointer;">
      ${avatar
        ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">`
        : esc(userInitials(STATE.user))}
    </button>
  `;
  $('hdrAvatarBtn')?.addEventListener('click', () => onAccountClick?.());
}

export function renderNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === STATE.tab);
  });
}

export function bindNav(onNavigate) {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => onNavigate?.(btn.dataset.tab));
  });
}

function headerSubtitle() {
  if (!STATE.user) return 'Sign in to plan trips';
  if (STATE.tab === 'account') return 'Account';
  if (STATE.view === 'summary') return 'Trip summary review';
  if (STATE.view === 'detail') return 'Trip detail';
  if (STATE.tab === 'archive') return 'Archive';
  return 'Trips';
}
