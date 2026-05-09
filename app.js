// ============================================================
// routefolk — app.js
// Phase 1, step 2: app shell with nav and placeholder screens.
// No data, no auth yet — just structure.
// ============================================================

const STATE = {
  tab: 'trips',
};

// ---------- DOM helpers ----------
function $(id) {
  return document.getElementById(id);
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
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

// ---------- Screens ----------
function renderTrips() {
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
  return `
    <div class="card">
      <div class="card-title">Account</div>
      <div style="color:#6b7a93;font-size:14px;line-height:1.5;">
        Sign-in is not wired up yet. This is the app shell —
        the next step adds Google sign-in.
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
}

function setTab(tab) {
  if (!SCREENS[tab]) return;
  STATE.tab = tab;
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  renderTab();
}

// ---------- Init ----------
function init() {
  // Wire up nav
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  });

  // Wire up sign-in placeholder
  $('signInBtn')?.addEventListener('click', () => {
    toast('Sign-in coming next step.');
  });

  // Set the header subtitle to today's date
  const d = new Date();
  $('hdrSub').textContent = d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

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
