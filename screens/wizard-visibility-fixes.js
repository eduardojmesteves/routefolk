// ============================================================
// routefolk — wizard-visibility-fixes.js
// Small guard layer for the v2 trip wizard visibility control.
//
// The v2 wizard can fully re-render while active members load. For
// new trips there is no persisted trip row yet, so the inline wizard
// renderer may fall back to `group` and lose the user's in-progress
// visibility choice. This module preserves the current dropdown value
// across those re-renders and keeps the selected-users section hidden
// unless the chosen visibility is `selected`.
// ============================================================

let draftTripVisibility = null;
let restoring = false;

function visibilitySelect() {
  return document.getElementById('v2-trip-visibility');
}

function selectedUsersRow() {
  return document.getElementById('v2-trip-selected-users-row');
}

function activeTripWizardHost() {
  const host = document.querySelector('.rf-v2-wizard-host');
  if (!host) return null;
  return host.dataset.wizard === 'trip' || host.dataset.wizard === 'trip-edit' ? host : null;
}

function syncSelectedUsersRow() {
  const select = visibilitySelect();
  const row = selectedUsersRow();
  if (!select || !row) return;
  row.hidden = select.value !== 'selected';
}

function rememberVisibility(value) {
  if (value === 'private' || value === 'selected' || value === 'group') {
    draftTripVisibility = value;
  }
}

function restoreVisibilityIfNeeded() {
  if (restoring || !activeTripWizardHost()) return;
  const select = visibilitySelect();
  if (!select) return;

  if (draftTripVisibility && select.value !== draftTripVisibility) {
    restoring = true;
    select.value = draftTripVisibility;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    restoring = false;
  }

  syncSelectedUsersRow();
}

document.addEventListener('change', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.id !== 'v2-trip-visibility') return;
  rememberVisibility(target.value);
  syncSelectedUsersRow();
}, true);

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const action = target?.closest('[data-action]')?.dataset?.action || '';
  if (action === 'rf-v2-save-trip' || action === 'rf-v2-update-trip' || action === 'rf-v2-cancel-wizard') {
    draftTripVisibility = null;
  }
}, true);

document.addEventListener('routefolk:v2-render', () => requestAnimationFrame(restoreVisibilityIfNeeded));

const observer = new MutationObserver(() => restoreVisibilityIfNeeded());
observer.observe(document.body, { childList: true, subtree: true });
requestAnimationFrame(restoreVisibilityIfNeeded);
