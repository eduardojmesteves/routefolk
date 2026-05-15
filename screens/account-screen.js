// ============================================================
// routefolk — screens/account-screen.js
// Account and PWA install helper rendering.
// Claude Design UI reset — Phase 22 stabilisation.
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
  if (platform === 'ios') return { title: 'iPhone / iPad', note: 'Use Safari.', steps: ['Open routefolk in Safari.', 'Tap Share.', 'Choose Add to Home Screen.', 'Tap Add.'] };
  if (platform === 'android') return { title: 'Android', note: 'Chrome gives the most reliable install flow.', steps: ['Open routefolk in Chrome.', 'Tap the three-dot menu.', 'Choose Install app or Add to Home screen.', 'Confirm the install.'] };
  return { title: 'Desktop', note: 'Chrome and Edge usually show an install icon in the address bar.', steps: ['Open routefolk in Chrome or Edge.', 'Click the install icon in the address bar.', 'Confirm the install.'] };
}

function installStepsHtml(config) {
  return `
    <div class="install-helper-block rf-install-helper-block">
      <div class="install-helper-title rf-install-helper-title">${esc(config.title)}</div>
      <ol class="install-steps rf-install-steps">${config.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>
      <div class="form-help rf-install-note">${esc(config.note)}</div>
    </div>
  `;
}

function pwaInstallHelperHtml() {
  const primary = installStepsForPlatform(detectedInstallPlatform());
  return `
    <details class="rf-collapsible-section rf-install-card">
      <summary class="rf-collapsible-summary">
        <span class="rf-kicker">PWA field kit</span>
        <span class="rf-collapsible-title">Install routefolk</span>
      </summary>
      <div class="rf-collapsible-body">
        <div class="rf-account-copy">Add routefolk to your home screen so it opens like a normal app during the trip.</div>
        ${installStepsHtml(primary)}
      </div>
    </details>
  `;
}

function peopleListHtml() {
  if (STATE.profilesLoading && !STATE.profiles.length) return `<div class="empty-sub">Loading people…</div>`;
  if (STATE.profilesError) return `<div class="stage-warn">${esc(STATE.profilesError)}</div>`;
  if (!STATE.profiles.length) return `<div class="empty-sub">No profiles yet. People appear here after their first sign-in.</div>`;

  return `
    <div class="people-list rf-people-list">
      ${STATE.profiles.map((profile) => {
        const initials = initialsFromName(profile.full_name || profile.email);
        const isYou = STATE.user?.id === profile.id;
        return `
          <div class="people-row rf-people-row">
            <div class="account-avatar people-avatar rf-people-avatar">
              ${profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="" referrerpolicy="no-referrer">` : esc(initials)}
            </div>
            <div class="account-info rf-people-info">
              <div class="account-name rf-people-name">${esc(profile.full_name || profile.email || 'Unknown')}${isYou ? ' <span class="people-you rf-people-you">You</span>' : ''}</div>
              <div class="account-email rf-people-email">${esc(profile.email || '')}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function lifetimeStats() {
  const completed = STATE.trips.filter((trip) => trip.status === 'completed');
  let totalKm = 0;
  let totalDays = 0;

  completed.forEach((trip) => {
    const stages = STATE.stagesByTrip[trip.id];
    if (Array.isArray(stages)) {
      totalKm += stages.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0);
      totalDays += stages.length || daysBetween(trip.start_date, trip.end_date);
    } else {
      totalKm += Number(trip.distance_km) || 0;
      totalDays += daysBetween(trip.start_date, trip.end_date);
    }
  });

  return { tripCount: completed.length, totalKm, totalDays };
}

function lifetimeHtml() {
  const stats = lifetimeStats();
  return `
    <section class="rf-lifetime-card">
      <div class="rf-kicker">Mileage to date</div>
      <div class="rf-collapsible-title">Completed roads</div>
      <div class="rf-lifetime">
        <div class="rf-lifetime__cell"><div class="rf-lifetime__v">${esc(stats.tripCount)}</div><div class="rf-lifetime__l">Completed trips</div></div>
        <div class="rf-lifetime__cell"><div class="rf-lifetime__v">${esc(Math.round(stats.totalKm).toLocaleString())} km</div><div class="rf-lifetime__l">Total distance</div></div>
        <div class="rf-lifetime__cell"><div class="rf-lifetime__v">${esc(stats.totalDays)}</div><div class="rf-lifetime__l">Days on the road</div></div>
      </div>
    </section>
  `;
}

export function renderAccount() {
  if (!STATE.user) {
    return `
      <div class="rf-account-shell">
        <section class="rf-passport rf-account-signed-out rf-auth-card">
          <div class="rf-kicker">Passport required</div>
          <h1 class="rf-account-title">Account</h1>
          <div class="rf-account-copy">Sign in with Google to access shared trips and keep your route ledger synced.</div>
          <button class="btn-google rf-google-btn" id="accountSignInBtn">Sign in with Google</button>
        </section>
        ${pwaInstallHelperHtml()}
      </div>
    `;
  }

  const avatar = userAvatarUrl(STATE.user);
  return `
    <div class="rf-account-shell rf-account-grid">
      <section class="rf-passport rf-account-passport">
        <div class="rf-kicker">Routefolk passport</div>
        <div class="rf-passport__identity">
          <div class="rf-passport__photo rf-account-avatar">
            ${avatar ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : esc(userInitials(STATE.user))}
          </div>
          <div>
            <div class="rf-account-stamp">Active</div>
            <div class="rf-account-name">${esc(userDisplayName(STATE.user))}</div>
            <div class="rf-account-email">${esc(STATE.user.email || '')}</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-block rf-signout-btn" id="signOutBtn">Sign out</button>
      </section>

      ${lifetimeHtml()}

      <details class="rf-collapsible-section">
        <summary class="rf-collapsible-summary">
          <span class="rf-kicker">Access ledger</span>
          <span class="rf-collapsible-title">People with access</span>
        </summary>
        <div class="rf-collapsible-body">
          ${peopleListHtml()}
          <div class="form-help rf-account-help">This list shows users who have signed in at least once. Membership is controlled through the app allowlist.</div>
        </div>
      </details>

      ${pwaInstallHelperHtml()}
    </div>
  `;
}
