# H1 · Stage handlers (edit · delete · reorder)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| H1 | Stage handlers | ♊ shared | ✅ edit/delete done · 🔴 **reorder build** | `actions/stage-actions.js` | F1, F2 | R2 `updateStage`/`deleteStage`/`swapStageOrder` |

**Intent.** The capture-phase handlers behind the stage action affordances.
Edit/delete/update **already ship**; this atom (a) documents them as a
verification contract and (b) **adds the missing reorder handler**.

> **Mixed state.** `rf-v2-edit-stage`/`-delete-stage`/`-update-stage` exist
> (`stage-actions.js:134-155`). `rf-v2-stage-up`/`-stage-down` and any call to
> `swapStageOrder` **do not exist anywhere** — that is the build half.

---

### 2 · Tokens & metrics

None (logic). Visual deltas are owned by M1/M2/M3/D1.

---

### 3 · Markup contract

Handlers, not markup. **Action routing** (exact match via `Set.has`):

**Already shipped** (`stage-actions.js`):

```
rf-v2-edit-stage   → STATE.wizard='stage-edit'; editTargetId=btn.dataset.stageId; renderAll()   (:143-148)
rf-v2-delete-stage → removeStage(event, btn.dataset.stageId)                                     (:150-152)
rf-v2-update-stage → saveStageEdit(event) → updateStage(...)                                     (:139-141, :73-96)
```

**To add — reorder.** Register the two actions and a handler:

```js
// 1) add to STAGE_WIZARD_ACTIONS (stage-actions.js:34-39)
'rf-v2-stage-up', 'rf-v2-stage-down',

// 2) add to handle() (after the delete branch, ~:153)
if (action === 'rf-v2-stage-up' || action === 'rf-v2-stage-down') {
  await reorderStage(event, btn.dataset.stageId, action === 'rf-v2-stage-up' ? -1 : 1);
  return true;
}

// 3) new function
export async function reorderStage(event, stageId, dir) {
  claim(event);
  const trip = activeTrip();
  const list = stagesForTrip(trip?.id);
  const i = list.findIndex((s) => s.id === stageId);
  const j = i + dir;
  if (!trip || i < 0 || j < 0 || j >= list.length) return;
  const a = list[i], b = list[j];
  const next = list.slice();                          // optimistic swap
  next[i] = b; next[j] = a;
  STATE.stagesByTrip[trip.id] = next;
  renderAll();
  try {
    await swapStageOrder(a, b);                        // R2 — atomic RPC
    await api().loadStagesForTrip?.(trip.id, { quiet: true });
  } catch (error) {
    STATE.stagesByTrip[trip.id] = list;               // restore on failure
    renderAll();
    throw error;
  }
}
```

> Import `swapStageOrder` from `../lib/stages.js` (extend the existing import
> at `stage-actions.js:11`). **Do not** hand-roll two `order_index` writes —
> anti-criterion (`03-EVALUATION §E`).

**Copy change (F2 alignment).** `removeStage` currently confirms
`Delete stage “${start} to ${end}”?` (`stage-actions.js:108`, curly quotes,
no cascade clause). Replace with the canonical F2 string:

```js
if (!window.confirm(`Delete stage "${stage.start_location || 'Start'} to ${stage.end_location || 'End'}"? This also deletes its journal entries.`)) return;
```

---

### 4 · States

| State | Trigger | Behavior |
|-------|---------|----------|
| Edit | `rf-v2-edit-stage` | open `stage-edit` wizard (M6/D3) |
| Delete (confirm) | `rf-v2-delete-stage` | F2 confirm → `deleteStage` → optimistic remove → select first |
| Delete (cancel) | confirm false | no-op |
| Reorder ok | `rf-v2-stage-up/down`, in-bounds | optimistic swap → `swapStageOrder` → re-sync |
| Reorder bound | first+`↑` / last+`↓` | button `disabled` (M2/D1); handler also guards `j` bounds |
| Reorder error | RPC throws | restore prior array, re-render, rethrow |

---

### 5 · Interaction (Given/When/Then)

- **Reorder.** *Given* stages `[A,B,C]`, *when* `↓` on A, *then*
  `STATE.stagesByTrip` shows `[B,A,C]` immediately, `swapStageOrder(A,B)`
  persists it, and a quiet reload confirms order from `listStages`
  (`order_index` then `created_at`).
- **Delete.** *Given* Delete on "Porto to Braga", *then* the confirm reads
  exactly `Delete stage "Porto to Braga"? This also deletes its journal entries.`

---

### 6 · Data & persistence

| Action | Fn (R2) | Notes |
|--------|---------|-------|
| edit/update | `updateStage(id, fields)` | allow-list `lib/stages.js:109-111`; only keys present are written |
| delete | `deleteStage(id)` | `ON DELETE CASCADE` (`lib/stages.js:168-172`) |
| reorder | `swapStageOrder(a, b)` | RPC `swap_stage_order` (`lib/stages.js:177-188`) |

---

### 7 · Acceptance

- [ ] **(verify)** `rf-v2-edit-stage` opens the prefilled wizard; `rf-v2-update-stage` saves edits; `rf-v2-delete-stage` removes after confirm.
- [ ] **(build)** `↑`/`↓` reorder persists across reload; first/last bounds respected.
- [ ] **(build)** reorder uses `swapStageOrder` (grep: exactly one call site, in `stage-actions.js`).
- [ ] **(copy)** stage delete confirm matches the F2 string character-for-character.
- **GWT — reorder failure:** Given `swapStageOrder` rejects, When `↓` clicked,
      Then the list snaps back to its prior order.

### 8 · Reference image

_No render — handler atom. Reorder bounds (`↑` disabled on first row) are
visible in `../refs/M2-stage-action-footer.jpg`._
