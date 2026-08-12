// ============================================================
// routefolk — actions/journal-actions.js
// Journal domain: add entry, choose entry type, save, edit and
// delete stage journal entries.
//
// Wizard journal save/edit/delete handler logic lives here (migrated
// out of screens/wizards.js). Shell-level journal actions still
// delegate to screens/app-actions.js.
// ============================================================

import { STATE } from '../state/app-state.js';
import { createEntry, updateEntry, deleteEntry, initEntriesSortOrder, swapEntryOrder } from '../lib/journal.js';
import { setJournalOrderMode } from '../lib/stages.js';
import { dispatchAppAction } from '../screens/app-actions.js';
import { orderedEntries } from '../screens/render/shared.js';
import {
  claim,
  beginBusy,
  renderAll,
  api,
  selectedStage,
  selectedEntry,
  entriesForStage,
  field,
  fieldValue,
  showError,
} from '../screens/wizards.js';

/** Shell-level journal actions (suffix-matched) sourced from app-actions.js. */
const JOURNAL_APP_SUFFIXES = [
  'add-journal',
  'save-journal',
  'journal-type',
];

/** Wizard journal actions (exact match) owned by this module. */
const JOURNAL_WIZARD_ACTIONS = new Set([
  'rf-v2-save-journal',
  'rf-v2-edit-entry',
  'rf-v2-delete-entry',
  'rf-v2-update-entry',
]);

/** Entry-ordering actions (exact match) owned by this module — the
 *  Auto/Override toggle and manual-mode ↑/↓ reorder. */
const JOURNAL_ORDER_ACTIONS = new Set([
  'rf-v2-journal-order-auto',
  'rf-v2-journal-order-manual',
  'rf-v2-journal-entry-up',
  'rf-v2-journal-entry-down',
]);

/**
 * Create a journal entry on the selected stage from the wizard form.
 * @param {Event} event
 */
export async function saveEntryCreate(event) {
  claim(event);
  const stage = selectedStage();
  if (!stage) return;
  const endBusy = beginBusy(event);
  if (!endBusy) return;
  try {
    const time = field('v2-entry-time')?.value || '';
    const date = stage.planned_date || new Date().toISOString().slice(0, 10);
    const payload = {
      entry_type: field('v2-entry-type')?.value || STATE.journalType || 'note',
      title: fieldValue('v2-entry-title'),
      location: fieldValue('v2-entry-place'),
      description: fieldValue('v2-entry-note'),
      location_url: fieldValue('v2-entry-location-url') || null,
      info_url: fieldValue('v2-entry-info-url') || null,
      photo_album_url: fieldValue('v2-entry-photo-url') || null,
      timestamp: time ? `${date}T${time}:00` : null,
    };
    if (!payload.title && !payload.location && !payload.description) {
      throw new Error('Write a title, place, or description before saving the note.');
    }
    const entry = await createEntry(stage.id, payload);
    const existing = STATE.entriesByStage[stage.id];
    STATE.entriesByStage[stage.id] = Array.isArray(existing) ? [...existing, entry] : [entry];
    STATE.journalType = payload.entry_type;
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadEntriesForStage?.(stage.id, { quiet: true });
    renderAll();
  } catch (error) {
    showError('v2-entry-create-error', error);
  } finally {
    endBusy();
  }
}

/**
 * Update the selected journal entry from the edit wizard form.
 * @param {Event} event
 */
export async function saveEntryEdit(event) {
  claim(event);
  const entry = selectedEntry();
  const stage = selectedStage();
  if (!entry || !stage) return;
  const endBusy = beginBusy(event);
  if (!endBusy) return;
  try {
    const time = field('v2-entry-time-edit')?.value || '';
    const date = stage.planned_date || new Date().toISOString().slice(0, 10);
    const updated = await updateEntry(entry.id, {
      entry_type: field('v2-entry-type-edit')?.value || 'note',
      title: fieldValue('v2-entry-title-edit'),
      location: fieldValue('v2-entry-place-edit'),
      description: fieldValue('v2-entry-note-edit'),
      location_url: fieldValue('v2-entry-location-url-edit') || null,
      info_url: fieldValue('v2-entry-info-url-edit') || null,
      photo_album_url: fieldValue('v2-entry-photo-url-edit') || null,
      timestamp: time ? `${date}T${time}:00` : null,
    });
    STATE.entriesByStage[stage.id] = entriesForStage(stage.id).map((candidate) => candidate.id === updated.id ? updated : candidate);
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadEntriesForStage?.(stage.id, { quiet: true });
    renderAll();
  } catch (error) {
    showError('v2-entry-error', error);
  } finally {
    endBusy();
  }
}

/**
 * Delete a journal entry by id after a confirmation prompt.
 * @param {Event} event
 * @param {string} entryId
 */
export async function removeEntry(event, entryId) {
  claim(event);
  const stage = selectedStage();
  const entry = entriesForStage(stage?.id).find((candidate) => candidate.id === entryId);
  if (!stage || !entry) return;
  if (!window.confirm(`Delete "${entry.title || 'this entry'}" from the journal?`)) return;
  await deleteEntry(entry.id);
  STATE.entriesByStage[stage.id] = entriesForStage(stage.id).filter((candidate) => candidate.id !== entry.id);
  STATE.wizard = null;
  STATE.editTargetId = null;
  renderAll();
}

/**
 * Flip the Auto/Override toggle for the open stage's journal. Switching
 * into manual mode stamps sort_order from the entries' current
 * chronological order first, so the override starts where Auto left off
 * rather than from an undefined order.
 * @param {Event} event
 * @param {boolean} manual
 */
export async function setJournalOrder(event, manual) {
  claim(event);
  const stage = selectedStage();
  if (!stage || stage.journal_manual_order === manual) return;
  try {
    if (manual) {
      const ids = orderedEntries(stage).map((entry) => entry.id);
      await initEntriesSortOrder(ids);
      STATE.entriesByStage[stage.id] = entriesForStage(stage.id).map((entry) => ({
        ...entry,
        sort_order: ids.indexOf(entry.id),
      }));
    }
    await setJournalOrderMode(stage.id, manual);
    stage.journal_manual_order = manual;
    renderAll();
  } catch (error) {
    console.error(error);
  }
}

/**
 * Swap two adjacent journal entries' sort_order (manual mode only).
 * @param {Event} event
 * @param {string} entryId
 * @param {number} dir -1 (up) or +1 (down)
 */
export async function reorderEntry(event, entryId, dir) {
  claim(event);
  const stage = selectedStage();
  if (!stage?.journal_manual_order) return;
  const list = orderedEntries(stage);
  const i = list.findIndex((entry) => entry.id === entryId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const a = list[i];
  const b = list[j];
  const swapped = [a.sort_order ?? i, b.sort_order ?? j];
  STATE.entriesByStage[stage.id] = entriesForStage(stage.id).map((entry) => {
    if (entry.id === a.id) return { ...entry, sort_order: swapped[1] };
    if (entry.id === b.id) return { ...entry, sort_order: swapped[0] };
    return entry;
  });
  renderAll();
  try {
    await swapEntryOrder(a, b);
  } catch (error) {
    console.error(error);
    await api().loadEntriesForStage?.(stage.id, { quiet: true });
    renderAll();
  }
}

/**
 * @param {string} action
 * @returns {boolean} true if this action belongs to the journal domain
 */
export function owns(action) {
  return JOURNAL_APP_SUFFIXES.some((suffix) => action.endsWith(suffix))
    || JOURNAL_WIZARD_ACTIONS.has(action)
    || JOURNAL_ORDER_ACTIONS.has(action);
}

/**
 * Handle a journal action.
 *
 * @param {Event} event
 * @param {Element} btn
 * @param {string} action
 * @returns {Promise<boolean>} true if handled
 */
export async function handle(event, btn, action) {
  if (action === 'rf-v2-save-journal') {
    await saveEntryCreate(event);
    return true;
  }
  if (action === 'rf-v2-update-entry') {
    await saveEntryEdit(event);
    return true;
  }
  if (action === 'rf-v2-edit-entry') {
    claim(event);
    STATE.wizard = 'journal-edit';
    STATE.editTargetId = btn.dataset.entryId;
    renderAll();
    return true;
  }
  if (action === 'rf-v2-delete-entry') {
    await removeEntry(event, btn.dataset.entryId);
    return true;
  }
  if (action === 'rf-v2-journal-order-auto') {
    await setJournalOrder(event, false);
    return true;
  }
  if (action === 'rf-v2-journal-order-manual') {
    await setJournalOrder(event, true);
    return true;
  }
  if (action === 'rf-v2-journal-entry-up' || action === 'rf-v2-journal-entry-down') {
    await reorderEntry(event, btn.dataset.entryId, action === 'rf-v2-journal-entry-up' ? -1 : 1);
    return true;
  }
  return dispatchAppAction(event, btn, action);
}
