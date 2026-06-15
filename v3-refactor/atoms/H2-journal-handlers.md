# H2 · Journal handlers (edit · delete)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| H2 | Journal handlers | ♊ shared | ✅ done · 🟠 copy change | `actions/journal-actions.js` | F1, F2 | R2 `updateEntry`/`deleteEntry` |

**Intent.** Capture-phase handlers behind the entry `✎ ✕` affordances (M4/D2).
**Already shipped** — this atom verifies the contract and aligns the delete
copy to F2.

> **✅ Done.** `rf-v2-edit-entry`/`-delete-entry`/`-update-entry` all handled
> at `journal-actions.js:140-160`. Only the confirm copy changes.

---

### 2 · Tokens & metrics

None (logic).

---

### 3 · Markup contract

Action routing (exact match, `journal-actions.js`):

```
rf-v2-edit-entry   → STATE.wizard='journal-edit'; editTargetId=btn.dataset.entryId; renderAll()   (:149-154)
rf-v2-delete-entry → removeEntry(event, btn.dataset.entryId)                                       (:156-158)
rf-v2-update-entry → saveEntryEdit(event) → updateEntry(...)                                       (:145-147, :79-103)
```

**Copy change (F2 alignment).** `removeEntry` currently confirms
`Delete journal entry “${title}”?` (`journal-actions.js:115`, curly quotes).
Replace with the canonical F2 string:

```js
if (!window.confirm(`Delete "${entry.title || 'this entry'}" from the journal?`)) return;
```

---

### 4 · States

| State | Trigger | Behavior |
|-------|---------|----------|
| Edit | `rf-v2-edit-entry` | open `journal-edit` wizard (M7/D4) |
| Delete (confirm) | `rf-v2-delete-entry` | F2 confirm → `deleteEntry` → optimistic remove |
| Delete (cancel) | confirm false | no-op |
| Update | `rf-v2-update-entry` | `updateEntry` with edit-field values |

---

### 5 · Interaction (Given/When/Then)

- **Delete.** *Given* entry "Lunch at the pass", *when* `✕` → confirm, *then*
  dialog reads exactly `Delete "Lunch at the pass" from the journal?`; on OK
  `deleteEntry(id)` runs and the row disappears.
- **Edit.** *Given* `✎`, *then* `journal-edit` wizard opens prefilled (M7),
  Save → `rf-v2-update-entry` → `updateEntry`.

---

### 6 · Data & persistence

| Action | Fn (R2) | Notes |
|--------|---------|-------|
| edit/update | `updateEntry(id, fields)` | allow-list `lib/journal.js:87-96`; URL/type validation applied |
| delete | `deleteEntry(id)` | `lib/journal.js:128-132` |

Optimistic `STATE.entriesByStage[stage.id]` mutation then quiet reload
(`journal-actions.js:95-98,117`).

---

### 7 · Acceptance

- [ ] **(verify)** `✎` opens prefilled entry wizard; Save persists; `✕` removes after confirm.
- [ ] **(copy)** entry delete confirm matches the F2 string exactly.
- [ ] Untitled entry → confirm reads `Delete "this entry" from the journal?`.
- **GWT:** Given entry "Lunch at the pass", When `✕` → confirm OK, Then it is
      deleted and the list re-renders.

### 8 · Reference image

_No render — handler atom._
