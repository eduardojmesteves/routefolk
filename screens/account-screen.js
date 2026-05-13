// ============================================================
// routefolk — screens/account-screen.js
// Account and PWA install helper rendering.
// ============================================================

import { STATE } from '../state/app-state.js';
import { esc } from '../utils/dom.js';
import { userInitials, userDisplayName, userAvatarUrl, initialsFromName } from '../utils/user.js';

function detectedInstallPlatform() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return 'desktop';
}

function installStepsForPlatform(platform) {
  if (platform === 'ios') {
    return {
      title: 'iPhone / iPad',
      note: 'Use Safari. Other iOS browsers usually cannot add the PWA properly.',
      steps: ['Open routefolk in Safari.', 'Tap the Share button.', 'Choose Add to Home Screen.', 'Tap Add.'],
    };
  }
  if (platform === 'android') {
    return {
      title: 'Android',
      note: 'Chrome gives the most reliable install flow.',
      steps: ['Open routefolk in Chrome.', 'Tap the three-dot menu.', 'Choose Install app or Add to Home screen.', 'Confirm the install.'],
    };
  }
  return {
    title: 'Desktop',
    note: 'Chrome and Edge usually show an install icon in the address bar when the app is installable.',
    steps: ['Open routefolk in Chrome or Edge.', 'Click the install icon in the address bar, when available.', 'Confirm the install.', 'Open routefolk from your app launcher or dock.'],
  };
}

function installStepsHtml(config) {
  return `
    <div class="install-helper-block">
      <div class="install-helper-title">${esc(config.title)}</div>
      <ol class="install-steps">
        ${config.steps.map((step) => `<li>${esc(step)}</li>`).join('')}
      </ol>
      <div class="form-help">${esc(config.note)}</div>
    </div>
  `;
}

function pwaInstallHelperHtml() {
  const platform = detectedInstallPlatform();
  const primary = installStepsForPlatform(platform);
  const others = ['ios', 'android', 'desktop'].filter((p) => p !== platform).map(installStepsForPlatform);
  return `
    <div class="card">
      <div class="card-title">Install routefolk</div>
      <div style="font-size:14px;color:#c5d0e0;line-height:1.5;margin-bottom:12px;">
        Add routefolk to your home screen so it opens like a normal app.
      </div>
      ${installStepsHtml(primary)}
      <details class="form-details install-helper-details">
        <summary>Instructions for other devices</summary>
        <div class="install-helper-extra">
          ${others.map(installStepsHtml).join('')}
        </div>
      </details>
    </div>
  `;
}

function peopleListHtml() {
  if (STATE.profilesLoading && !STATE.profiles.length) return `<div class="empty-sub">Loading people…</div>`;
  if (STATE.profilesError) return `<div class="stage-warn">${esc(STATE.profilesError)}</div>`;
  if (!STATE.profiles.length) return `<div class="empty-sub">No profiles yet. People appear here after their first sign-in.</div>`;

  return `
    <div class="people-list">
      ${STATE.profiles.map((profile) => {
        const initials = initialsFromName(profile.full_name || profile.email);
        const isYou = STATE.user?.id === profile.id;
        return `
          <div class="people-row">
            <div class="account-avatar people-avatar">
              ${profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="" referrerpolicy="no-referrer">` : esc(initials)}
            </div>
            <div class="account-info">
              <div class="account-name">${esc(profile.full_name || profile.email || 'Unknown')}${isYou ? ' <span class="people-you">You</span>' : ''}</div>
              <div class="account-email">${esc(profile.email || '')}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function renderAccount() {
  if (!STATE.user) {
    return `
      <div class="card">
        <div class="card-title">Account</div>
        <div style="font-size:14px;color:#c5d0e0;line-height:1.5;margin-bottom:14px;">
          Sign in with Google to access shared trips.
        </div>
        <button class="btn-google" id="accountSignInBtn">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"/></svg>
          Sign in with Google
        </button>
      </div>
    `;
  }

  const avatar = userAvatarUrl(STATE.user);
  return `
    <div class="card">
      <div class="card-title">Account</div>
      <div class="account-row">
        <div class="account-avatar">
          ${avatar ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : esc(userInitials(STATE.user))}
        </div>
        <div class="account-info">
          <div class="account-name">${esc(userDisplayName(STATE.user))}</div>
          <div class="account-email">${esc(STATE.user.email || '')}</div>
        </div>
      </div>
      <button class="btn btn-secondary btn-block" id="signOutBtn" style="margin-top:12px;">Sign out</button>
    </div>

    <div class="card">
      <div class="card-title">People with access</div>
      ${peopleListHtml()}
      <div class="form-help" style="margin-top:10px;">
        This list shows users who have signed in at least once. Add or remove access in the Google OAuth Test users list.
      </div>
    </div>

    ${pwaInstallHelperHtml()}
  `;
}
