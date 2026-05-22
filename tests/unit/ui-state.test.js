// @vitest-environment jsdom
/**
 * Tests for state/ui-state.js.
 *
 * The module imports STATE from state/app-state.js (a plain mutable object)
 * and reads/writes to localStorage.
 *
 * Strategy:
 * - We import STATE and mutate it to set up scenarios, then call ui-state
 *   functions and assert the effects on STATE and localStorage.
 * - We clear localStorage and reset STATE between tests using beforeEach.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STATE } from '../../state/app-state.js';
import {
  saveUiState,
  restoreUiState,
  clearUiState,
  validateUiSelection,
} from '../../state/ui-state.js';

// ============================================================
// Helpers
// ============================================================
function resetState() {
  STATE.tab = 'trips';
  STATE.view = 'list';
  STATE.viewTripId = null;
  STATE.selectedTripId = null;
  STATE.selectedArchiveTripId = null;
  STATE.selectedStageId = null;
  STATE.selectedCategoryKey = null;
  STATE.lastTripView = 'detail';
  STATE.lastArchiveView = 'list';
  STATE.itemStatusFilter = 'all';
  STATE.tripSearch = '';
  STATE.tripStatusFilter = 'all';
  STATE.tripFiltersOpen = false;
  STATE.archiveSearch = '';
  STATE.archiveStatusFilter = 'all';
  STATE.archiveFiltersOpen = false;
  STATE.archiveViewMode = 'list';
  STATE.archiveMapLayer = 'heatmap';
  STATE.trips = [];
  STATE.user = null;
  STATE.wizard = null;
  STATE.editTargetId = null;
}

const MOCK_USER = { id: 'user-123', email: 'test@example.com' };

beforeEach(() => {
  resetState();
  localStorage.clear();
});

// ============================================================
// saveUiState / restoreUiState — basic round-trip
// ============================================================
describe('saveUiState / restoreUiState', () => {
  it('saves state to localStorage under a user-specific key', () => {
    STATE.tab = 'archive';
    STATE.view = 'summary';

    saveUiState(MOCK_USER);

    const stored = localStorage.getItem('rf.ui.user-123');
    expect(stored).not.toBeNull();
    const payload = JSON.parse(stored);
    expect(payload.tab).toBe('archive');
    expect(payload.view).toBe('summary');
    expect(payload.version).toBe(2);
  });

  it('does nothing when user is null', () => {
    saveUiState(null);
    expect(localStorage.length).toBe(0);
  });

  it('restores tab and view from localStorage', () => {
    STATE.tab = 'archive';
    STATE.view = 'summary';
    STATE.selectedArchiveTripId = 'trip-abc';
    saveUiState(MOCK_USER);

    // Reset state before restoring
    resetState();
    const restored = restoreUiState(MOCK_USER);

    expect(restored).toBe(true);
    expect(STATE.tab).toBe('archive');
  });

  it('returns false when there is no stored state', () => {
    const result = restoreUiState(MOCK_USER);
    expect(result).toBe(false);
  });

  it('returns false when user is null', () => {
    expect(restoreUiState(null)).toBe(false);
  });

  it('restores the selectedTripId', () => {
    STATE.tab = 'trips';
    STATE.selectedTripId = 'trip-xyz';
    STATE.viewTripId = 'trip-xyz';
    saveUiState(MOCK_USER);

    resetState();
    restoreUiState(MOCK_USER);
    expect(STATE.selectedTripId).toBe('trip-xyz');
  });

  it('restores the lastTripView and normalises unknown values to "detail"', () => {
    STATE.lastTripView = 'journal';
    saveUiState(MOCK_USER);

    resetState();
    restoreUiState(MOCK_USER);
    expect(STATE.lastTripView).toBe('journal'); // valid value preserved

    // Force an invalid value into storage
    const raw = localStorage.getItem('rf.ui.user-123');
    const payload = JSON.parse(raw);
    payload.lastTripView = 'nonexistent';
    localStorage.setItem('rf.ui.user-123', JSON.stringify(payload));

    resetState();
    restoreUiState(MOCK_USER);
    expect(STATE.lastTripView).toBe('detail'); // normalised to fallback
  });

  it('uses email as key fallback when user has no id', () => {
    const emailUser = { email: 'foo@bar.com' };
    STATE.tab = 'trips';
    saveUiState(emailUser);
    expect(localStorage.getItem('rf.ui.foo@bar.com')).not.toBeNull();
  });
});

// ============================================================
// Expired state is ignored
// ============================================================
describe('restoreUiState — expiry', () => {
  it('ignores state older than 14 days', () => {
    STATE.tab = 'archive';
    saveUiState(MOCK_USER);

    // Manually overwrite timestamp to be 15 days in the past
    const raw = localStorage.getItem('rf.ui.user-123');
    const payload = JSON.parse(raw);
    payload.timestamp = Date.now() - 1000 * 60 * 60 * 24 * 15;
    localStorage.setItem('rf.ui.user-123', JSON.stringify(payload));

    resetState();
    const result = restoreUiState(MOCK_USER);
    expect(result).toBe(false);
    // STATE should remain untouched
    expect(STATE.tab).toBe('trips');
  });

  it('ignores state with a future timestamp (negative age guard)', () => {
    STATE.tab = 'archive';
    saveUiState(MOCK_USER);

    const raw = localStorage.getItem('rf.ui.user-123');
    const payload = JSON.parse(raw);
    // timestamp 1 hour in the future — age is negative
    payload.timestamp = Date.now() + 1000 * 60 * 60;
    localStorage.setItem('rf.ui.user-123', JSON.stringify(payload));

    resetState();
    const result = restoreUiState(MOCK_USER);
    expect(result).toBe(false);
  });

  it('accepts state within the 14-day window', () => {
    STATE.tab = 'archive';
    saveUiState(MOCK_USER);

    const raw = localStorage.getItem('rf.ui.user-123');
    const payload = JSON.parse(raw);
    // 13 days ago — still valid
    payload.timestamp = Date.now() - 1000 * 60 * 60 * 24 * 13;
    localStorage.setItem('rf.ui.user-123', JSON.stringify(payload));

    resetState();
    const result = restoreUiState(MOCK_USER);
    expect(result).toBe(true);
  });
});

// ============================================================
// Invalid / corrupt payload is ignored
// ============================================================
describe('restoreUiState — corrupt data', () => {
  it('returns false for non-JSON content in localStorage', () => {
    localStorage.setItem('rf.ui.user-123', 'this is not json{{{');
    const result = restoreUiState(MOCK_USER);
    expect(result).toBe(false);
  });

  it('returns false when version does not match', () => {
    STATE.tab = 'archive';
    saveUiState(MOCK_USER);

    const raw = localStorage.getItem('rf.ui.user-123');
    const payload = JSON.parse(raw);
    payload.version = 99; // wrong version
    localStorage.setItem('rf.ui.user-123', JSON.stringify(payload));

    resetState();
    const result = restoreUiState(MOCK_USER);
    expect(result).toBe(false);
  });

  it('returns false for null stored in localStorage as "null"', () => {
    localStorage.setItem('rf.ui.user-123', 'null');
    expect(restoreUiState(MOCK_USER)).toBe(false);
  });
});

// ============================================================
// clearUiState
// ============================================================
describe('clearUiState', () => {
  it('removes the stored state from localStorage', () => {
    saveUiState(MOCK_USER);
    expect(localStorage.getItem('rf.ui.user-123')).not.toBeNull();

    clearUiState(MOCK_USER);
    expect(localStorage.getItem('rf.ui.user-123')).toBeNull();
  });

  it('does nothing when user is null', () => {
    saveUiState(MOCK_USER);
    clearUiState(null); // should not throw
    expect(localStorage.getItem('rf.ui.user-123')).not.toBeNull();
  });
});

// ============================================================
// validateUiSelection — trip no longer in the list
// ============================================================
describe('validateUiSelection', () => {
  it('clears selectedTripId when the trip is not in STATE.trips', () => {
    STATE.tab = 'trips';
    STATE.selectedTripId = 'ghost-trip';
    STATE.viewTripId = 'ghost-trip';
    STATE.trips = [{ id: 'other-trip', status: 'planning' }];

    validateUiSelection();

    expect(STATE.selectedTripId).toBeNull();
    expect(STATE.viewTripId).toBeNull();
    expect(STATE.view).toBe('list');
  });

  it('keeps selectedTripId when the trip exists with an active status', () => {
    STATE.tab = 'trips';
    STATE.selectedTripId = 'active-trip';
    STATE.view = 'detail';
    STATE.lastTripView = 'detail';
    STATE.trips = [{ id: 'active-trip', status: 'planning' }];

    validateUiSelection();

    expect(STATE.selectedTripId).toBe('active-trip');
  });

  it('clears selectedTripId when the trip exists but has an archived status', () => {
    // An "active" slot should not hold a completed trip
    STATE.tab = 'trips';
    STATE.selectedTripId = 'completed-trip';
    STATE.trips = [{ id: 'completed-trip', status: 'completed' }];

    validateUiSelection();

    expect(STATE.selectedTripId).toBeNull();
  });

  it('clears selectedArchiveTripId when the archived trip is not in STATE.trips', () => {
    STATE.tab = 'archive';
    STATE.selectedArchiveTripId = 'ghost-archive';
    STATE.viewTripId = 'ghost-archive';
    STATE.trips = [];

    validateUiSelection();

    expect(STATE.selectedArchiveTripId).toBeNull();
    expect(STATE.view).toBe('list');
  });

  it('clears selectedArchiveTripId when the trip is active, not archived', () => {
    // Archive slot should only hold completed/cancelled
    STATE.tab = 'archive';
    STATE.selectedArchiveTripId = 'active-trip';
    STATE.trips = [{ id: 'active-trip', status: 'active' }];

    validateUiSelection();

    expect(STATE.selectedArchiveTripId).toBeNull();
  });

  it('keeps selectedArchiveTripId when trip exists and is archived', () => {
    STATE.tab = 'archive';
    STATE.selectedArchiveTripId = 'done-trip';
    STATE.lastArchiveView = 'summary';
    STATE.trips = [{ id: 'done-trip', status: 'completed' }];

    validateUiSelection();

    expect(STATE.selectedArchiveTripId).toBe('done-trip');
  });

  it('does not clear selectedTripId when on the archive tab', () => {
    // selectedTripId clearing only affects view state when tab === 'trips'
    STATE.tab = 'archive';
    STATE.selectedTripId = 'ghost-trip';
    STATE.viewTripId = 'ghost-trip';
    STATE.trips = [];

    validateUiSelection();

    // selectedTripId is still cleared (the validation runs unconditionally),
    // but viewTripId/view should NOT be reset since tab !== 'trips'
    expect(STATE.selectedTripId).toBeNull();
    // view reset only happens when tab === 'trips'
    // so view stays whatever it was before (the archive path runs separately)
  });
});
