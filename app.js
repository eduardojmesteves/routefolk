// ============================================================
// routefolk — app.js
// Phase 1, step 3: app shell with Google sign-in.
// ============================================================

import { signInWithGoogle, signOut, getCurrentUser, onAuthChange } from './lib/auth.js';

const STATE = {
  tab: 'trips',
  user: null, // null = not signed in; object = Supabase user
};

// ---------- DOM helpers ----------
function $(id) { return document.getElementById(id); }

function esc(v) {
  return String(v ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[ch]));
}

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- User helpers ----------
function userInitials(user) {
  const name = user?.user_metadata?.full_name || user?.email || '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
}

function userDisplayName(user) {
  return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Unknown';
}

function userAvatarUrl(user) {
  return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';
}

// ---------- Header ----------
function renderHeader() {
  const right = $('hdrRight');
  if (!right) return;

  if (!STATE.user) {
    right.innerHTML = `<button class="btn btn-secondary btn-sm" id="signInBtn">Sign in</button>`;
    $('signInBtn')?.addEventListener('click', handleSignIn);
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
  $('hdrAvatarBtn')?.addEventListener('click', () => setTab('account'));
}

// ---------- Screens ----------
function renderTrips() {
  if (!STATE.user) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 6h18M3 12h18M3 18h12"/>
        </svg>
        <div class="empty-title">No trips yet</div>
        <div class="empty-sub">Sign in to plan your first trip.</div>
      </div>
    `;
  }
  return `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 6h18M3 12h18M3 18h12"/>
      </svg>
      <div class="empty-title">No trips yet</div>
      <div class="empty-sub">Trip creation comes in the next step.</div>
    </div>
  `;
}

function renderArchive() {
  return `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="9"/>
        <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>
      </svg>
      <div class="empty-title">Archive</div>
      <div class="empty-sub">Past trips will appear here.</div>
    </div>
  `;
}

function renderAccount() {
  if (!STATE.user) {
    return `
      <div class="card">
        <div class="card-title">Sign in</div>
        <div style="color:#6b7a93;font-size:14px;line-height:1.5;margin-bottom:16px;">
          routefolk is for a fixed group of friends. Sign in with the Google
          account whose email has been added to the test users list.
        </div>
        <button class="btn-google" id="googleSignInBtn">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
          </svg>
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
          ${avatar
            ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">`
            : esc(userInitials(STATE.user))}
        </div>
        <div class="account-info">
          <div class="account-name">${esc(userDisplayName(STATE.user))}</div>
          <div class="account-email">${esc(STATE.user.email || '')}</div>
        </div>
      </div>
      <div style="margin-top:16px;">
        <button class="btn btn-danger btn-block" id="signOutBtn">Sign out</button>
      </div>
    </div>
  `;
}

const SCREENS = {
  trips: renderTrips,
  archive: renderArchive,
  account: renderAccount,
};

function renderTab() {
  const content = $('content');
  const fn = SCREENS[STATE.tab] || renderTrips;
  content.innerHTML = fn();

  // Wire up screen-specific buttons after innerHTML replaces the DOM.
  $('googleSignInBtn')?.addEventListener('click', handleSignIn);
  $('signOutBtn')?.addEventListener('click', handleSignOut);
}

function setTab(tab) {
  if (!SCREENS[tab]) return;
  STATE.tab = tab;
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  renderTab();
}

// ---------- Auth handlers ----------
async function handleSignIn() {
  try {
    await signInWithGoogle();
    // Browser redirects to Google; nothing to do here.
  } catch (err) {
    toast('Sign-in failed. Check console for details.');
  }
}

async function handleSignOut() {
  try {
    await signOut();
    toast('Signed out.');
  } catch (err) {
    toast('Sign-out failed. Check console.');
  }
}

// ---------- Init ----------
async function init() {
  // Wire up nav
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  });

  // Set the header subtitle to today's date
  const d = new Date();
  $('hdrSub').textContent = d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Get initial user (may be null if not signed in)
  STATE.user = await getCurrentUser();

  // Subscribe to future changes
  onAuthChange((user) => {
    const wasSignedIn = !!STATE.user;
    STATE.user = user;
    renderHeader();
    renderTab();
    if (!wasSignedIn && user) toast(`Welcome, ${userDisplayName(user).split(' ')[0]}!`);
  });

  renderHeader();
  renderTab();

  // Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

init();
