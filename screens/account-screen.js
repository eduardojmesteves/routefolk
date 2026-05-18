// ============================================================
// routefolk — screens/account-screen.js
// Account and PWA install helper rendering.
// Screenshot fidelity pass.
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
        <div class="install-helper-block rf-install-helper-block">
          <div class="install-helper-title rf-install-helper-title">${esc(primary.title)}</div>
          <ol class="install-steps rf-install-steps">${primary.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>
          <div class="form-help rf-install-note">${esc(primary.note)}</div>
        </div>
      </div>
    </details>
  `;
}

function riderAvatarsHtml() {
  const others = STATE.profiles.filter((profile) => profile.id !== STATE.user?.id).slice(0, 3);
  if (!others.length) return '<span class="rf-rider-avatar">RF</span>';
  return others.map((profile) => `<span class="rf-rider-avatar">${esc(initialsFromName(profile.full_name || profile.email))}</span>`).join('');
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
  let spent = 0;

  completed.forEach((trip) => {
    const stages = STATE.stagesByTrip[trip.id];
    const expenses = STATE.expensesByTrip[trip.id];
    if (Array.isArray(stages)) {
      totalKm += stages.reduce((sum, stage) => sum + (Number(stage.distance_km) || 0), 0);
      totalDays += stages.length || daysBetween(trip.start_date, trip.end_date);
    } else {
      totalKm += Number(trip.distance_km) || 0;
      totalDays += daysBetween(trip.start_date, trip.end_date);
    }
    if (Array.isArray(expenses)) spent += expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  });

  return { tripCount: completed.length || STATE.trips.length, totalKm, totalDays, spent };
}

function mileageHtml() {
  const stats = lifetimeStats();
  return `
    <section class="rf-mileage-card">
      <h2 class="rf-account-section-title">Mileage to date</h2>
      <div class="rf-mileage-grid">
        <div><div class="rf-mileage-v">${esc(stats.tripCount)}</div><div class="rf-mileage-i">Trips</div><div class="rf-mileage-l">Finished + planned</div></div>
        <div><div class="rf-mileage-v">${esc(Math.round(stats.totalKm).toLocaleString())}</div><div class="rf-mileage-i">Distance</div><div class="rf-mileage-l">Kilometres</div></div>
        <div><div class="rf-mileage-v">${esc(stats.totalDays)}</div><div class="rf-mileage-i">Days</div><div class="rf-mileage-l">On the road</div></div>
        <div><div class="rf-mileage-v">€${esc(Math.round(stats.spent).toLocaleString())}</div><div class="rf-mileage-i">Spent</div><div class="rf-mileage-l">Across trips</div></div>
      </div>
    </section>
  `;
}

export function renderAccount() {
  if (!STATE.user) {
    return `
      <div class="rf-account-shell">
        <div class="rf-mobile-brand" aria-hidden="true"></div>
        <header class="rf-header rf-account-header">
          <div class="rf-header__kicker">The bearer</div>
          <h1 class="rf-page-title">You</h1>
        </header>
        <section class="rf-passport rf-account-card rf-auth-card">
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
      <div class="rf-mobile-brand" aria-hidden="true"></div>
      <header class="rf-header rf-account-header">
        <div class="rf-header__kicker">The bearer</div>
        <h1 class="rf-page-title">You</h1>
      </header>

      <section class="rf-passport rf-account-card rf-account-passport">
        <div class="rf-account-avatar-xl">
          ${avatar ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : esc(userInitials(STATE.user))}
        </div>
        <div class="rf-account-name">${esc(userDisplayName(STATE.user))}</div>
        <div class="rf-account-email">${esc(STATE.user.email || '')}</div>
        <div class="rf-account-copy">Routefolk member since 2023</div>
        <button class="btn btn-secondary btn-block rf-manage-account" type="button">Manage Google account</button>
      </section>

      <section class="rf-other-riders-card">
        <div>
          <div class="rf-other-title">Other riders</div>
          <div class="rf-account-copy">${esc(Math.max(0, STATE.profiles.length - 1))} people you’ve ridden with</div>
        </div>
        <div class="rf-rider-stack">${riderAvatarsHtml()}<span class="rf-rider-chevron">›</span></div>
      </section>

      ${mileageHtml()}

      <button class="btn btn-secondary rf-signout-btn" id="signOutBtn">Sign out</button>
      <div class="rf-account-version">routefolk · v0.6.2 · build 20260516</div>
      ${pwaInstallHelperHtml()}
    </div>
  `;
}
