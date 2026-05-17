// ============================================================
// routefolk — app.js
// Production bootstrap.
// Owns auth/session/data loading and starts the active application shell.
// ============================================================

import { getCurrentUser, onAuthChange } from './lib/auth.js';
import { STATE } from './state/app-state.js';
import { resetSessionState } from './state/session-reset.js';
import { createDataLoaders } from './state/data-loaders.js';
import { createSessionController } from './state/session-controller.js';
import { restoreUiState, saveUiState, validateUiSelection } from './state/ui-state.js';
import { toast } from './components/toast.js';

const EXPECTED_SCHEMA_VERSION = '014';
const PALETTE_KEY = 'rf.palette';
const PALETTES = ['forest', 'midnight', 'oxblood', 'alpine'];
let lastAuthUserId = null;

function renderAll() {
  if (STATE.user) saveUiState();
  document.dispatchEvent(new CustomEvent('routefolk:render'));
  document.dispatchEvent(new CustomEvent('routefolk:v2-render'));
  if (typeof window.__routefolkRender === 'function') window.__routefolkRender();
  if (typeof window.__routefolkV2Render === 'function') window.__routefolkV2Render();
}

const {
  loadTrips,
  loadProfiles,
  loadStagesForTrip,
  loadEntriesForStage,
  loadExpensesForTrip,
  loadItemsForTrip,
  loadGpxForTrip,
  ensureArchiveGpxGeometries,
  ensureArchiveData,
  openTrip,
} = createDataLoaders({ renderAll });

const { loadSignedInData, handleSignIn, handleSignOut } = createSessionController({
  expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
  renderAll,
  loadProfiles,
  loadTrips,
});

window.routefolkData = {
  renderAll,
  loadTrips,
  loadProfiles,
  loadStagesForTrip,
  loadEntriesForStage,
  loadExpensesForTrip,
  loadItemsForTrip,
  loadGpxForTrip,
  ensureArchiveGpxGeometries,
  ensureArchiveData,
  openTrip,
  loadSignedInData,
  handleSignIn,
  handleSignOut,
};

function setPalette(palette) {
  const next = PALETTES.includes(palette) ? palette : 'midnight';
  document.documentElement.dataset.palette = next;
  try { localStorage.setItem(PALETTE_KEY, next); } catch {}
  document.querySelectorAll('[data-palette]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.palette === next));
}

function initPaletteSwitcher() {
  let stored = 'midnight';
  try { stored = localStorage.getItem(PALETTE_KEY) || localStorage.getItem('routefolk.palette') || 'midnight'; } catch {}
  setPalette(stored);

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const btn = target?.closest('[data-action="rf-palette-select"], [data-palette]');
    if (!btn) return;
    const palette = btn.dataset.palette;
    if (!palette) return;
    setPalette(palette);
    renderAll();
  }, true);
}

async function hydrateSelectedTripAfterTripsLoad() {
  if (!STATE.user || !STATE.trips.length) return;
  validateUiSelection();
  const id = STATE.viewTripId || (STATE.tab === 'archive' ? STATE.selectedArchiveTripId : STATE.selectedTripId);
  if (!id || STATE.tab === 'account') return;
  await openTrip(id, STATE.view || 'detail');
  validateUiSelection();
}

function initPersistenceGuards() {
  window.addEventListener('pagehide', () => saveUiState());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveUiState();
    if (document.visibilityState === 'visible') {
      restoreUiState();
      validateUiSelection();
      renderAll();
    }
  });
}

async function init() {
  STATE.user = await getCurrentUser();
  lastAuthUserId = STATE.user?.id || null;
  STATE.isOnline = navigator.onLine !== false;
  initPaletteSwitcher();
  initPersistenceGuards();
  if (STATE.user) restoreUiState(STATE.user);

  window.addEventListener('online', () => {
    STATE.isOnline = true;
    renderAll();
    toast('Back online.');
  });
  window.addEventListener('offline', () => {
    STATE.isOnline = false;
    renderAll();
    toast('You are offline. Changes are disabled.');
  });

  renderAll();
  if (STATE.user) {
    await loadSignedInData();
    validateUiSelection();
    await hydrateSelectedTripAfterTripsLoad();
  }

  onAuthChange(async (user) => {
    const nextUserId = user?.id || null;
    if (nextUserId === lastAuthUserId) {
      STATE.user = user;
      renderAll();
      return;
    }
    if (STATE.user) saveUiState(STATE.user);
    lastAuthUserId = nextUserId;
    resetSessionState(user);
    if (user) restoreUiState(user);
    renderAll();
    if (STATE.user) {
      await loadSignedInData();
      validateUiSelection();
      await hydrateSelectedTripAfterTripsLoad();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker registration failed:', err));
  }
}

init().catch((err) => {
  console.error(err);
  toast(err.message || 'App failed to start.');
});
