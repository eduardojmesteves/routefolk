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
import { createEntry, updateEntry, deleteEntry } from '../lib/journal.js';
import { dispatchAppAction } from '../screens/app-actions.js';
import {
  claim,
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

/**
 * Create a journal entry on the selected stage from the wizard form.
 * @param {Event} event
 */
export async function saveEntryCreate(event) {
  claim(event);
  const stage = selectedStage();
  if (!stage) return;
  try {
    const time = field('v2-entry-time')?.value || '';
    const date = stage.planned_date || new Date().toISOString().slice(0, 10);
    const payload = {
      entry_type: field('v2-entry-type')?.value || STATE.journalType || 'note',
      title: fieldValue('v2-entry-title'),
      location: fieldValue('v2-entry-place'),
      description: fieldValue('v2-entry-note'),
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
  try {
    const time = field('v2-entry-time-edit')?.value || '';
    const date = stage.planned_date || new Date().toISOString().slice(0, 10);
    const updated = await updateEntry(entry.id, {
      entry_type: field('v2-entry-type-edit')?.value || 'note',
      title: fieldValue('v2-entry-title-edit'),
      location: fieldValue('v2-entry-place-edit'),
      description: fieldValue('v2-entry-note-edit'),
      location_url: fieldValue('v2-entry-location-url-edit') || null,
      timestamp: time ? `${date}T${time}:00` : null,
    });
    STATE.entriesByStage[stage.id] = entriesForStage(stage.id).map((candidate) => candidate.id === updated.id ? updated : candidate);
    STATE.wizard = null;
    STATE.editTargetId = null;
    await api().loadEntriesForStage?.(stage.id, { quiet: true });
    renderAll();
  } catch (error) {
    showError('v2-entry-error', error);
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
 * @param {string} action
 * @returns {boolean} true if this action belongs to the journal domain
 */
export function owns(action) {
  return JOURNAL_APP_SUFFIXES.some((suffix) => action.endsWith(suffix))
    || JOURNAL_WIZARD_ACTIONS.has(action);
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
  return dispatchAppAction(event, btn, action);
}
