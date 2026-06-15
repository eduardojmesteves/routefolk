# F2 · Confirm-dialog copy contract (stage + entry deletes)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| F2 | Confirm-dialog copy contract | ♊ shared | 🟠 differs (align code→package) | `actions/stage-actions.js` · `actions/journal-actions.js` | — | existing `window.confirm` voice (`app-actions.js:118`, `:197`) |

**Intent.** Fix the **exact, character-for-character** destructive-confirm
strings for stage and journal-entry deletes so H1/H2 quote one canonical
source and the copy stays consistent with the house voice already shipping
for trips and packing-list items.

> **🟠 Exists but differs — decision: align code → package** (see
> `00b-STATUS-AUDIT.md §C`). Stage/entry delete confirms already ship, but
> with different wording, and live in the **domain modules**, not
> `app-actions.js`:
> - shipped stage: `Delete stage "<start> to <end>"?` — curly quotes, **no**
>   cascade clause (`stage-actions.js:108`). **Change to** the F2 string below.
> - shipped entry: `Delete journal entry "<title>"?` (`journal-actions.js:115`).
>   **Change to** the F2 string below.
>
> House-voice anchors F2 stays consistent with:
> - trip: `Delete trip "${trip.title || 'Untitled'}"? This cannot be undone.` (`app-actions.js:118`)
> - item: `Delete "${item.name || 'this item'}" from the packing list?` (`app-actions.js:197`)

---

### 2 · Tokens & metrics

None (copy atom). House voice rules, lifted from the shipping strings:
- Verb-first: **Delete** … `?`
- Quote the subject's display name in straight double quotes.
- One trailing consequence clause when deletion cascades.

---

### 3 · Markup contract

The contractual strings (these are the values H1/H2 pass to `window.confirm`):

**Stage delete** — the stage's label is `"<start> to <end>"`, matching the
card title (M2 uses the same "to" connector):

```js
`Delete stage "${esc_or_raw(start)} to ${esc_or_raw(end)}"? This also deletes its journal entries.`
```
> `window.confirm` renders plain text, so no `esc()` is required for the
> dialog itself; use the raw stage start/end fields. (`esc()` still applies
> anywhere the same label is interpolated into HTML.)

Concrete example (the M2 acceptance case):
`Delete stage "Porto to Braga"? This also deletes its journal entries.`

**Journal entry delete** — entry has a `title`; fall back to a generic noun:

```js
`Delete "${entry.title || 'this entry'}" from the journal?`
```

Concrete example:
`Delete "Lunch at the pass" from the journal?`

**Anchor.** Replace the `window.confirm(...)` literals in `removeStage`
(`actions/stage-actions.js:108`) and `removeEntry`
(`actions/journal-actions.js:115`). One handler serves both surfaces (the
render affordances on mobile and desktop emit the same exact `rf-v2-delete-stage`
/ `rf-v2-delete-entry`), so a single literal per handler keeps the surfaces
from drifting — no per-surface copy.

---

### 4 · States

| State | Trigger | Copy emitted |
|-------|---------|--------------|
| Stage has a name | `start`/`end` present | `Delete stage "<start> to <end>"? This also deletes its journal entries.` |
| Entry has a title | `entry.title` truthy | `Delete "<title>" from the journal?` |
| Entry untitled | `entry.title` falsy | `Delete "this entry" from the journal?` |
| Cancelled | user clicks Cancel | no-op (handler returns before any `delete*` call) |

---

### 5 · Interaction (Given/When/Then)

- **Stage delete.** *Given* a Delete affordance (M2/M3/D1), *when* tapped,
  *then* the handler calls `window.confirm` with the **stage** string above;
  on OK it proceeds to `deleteStage(id)` (see M2 §6 / H1), on Cancel it is a
  no-op. (copy: `Delete stage "Porto to Braga"? This also deletes its journal entries.`)
- **Entry delete.** *Given* a `✕` affordance (M4/D2), *when* tapped, *then*
  the handler calls `window.confirm` with the **entry** string; on OK
  `deleteEntry(id)` (H2), on Cancel no-op.
  (copy: `Delete "Lunch at the pass" from the journal?`)

---

### 6 · Data & persistence

None directly — F2 only fixes the strings. The actual deletes
(`deleteStage` / `deleteEntry`, R2) belong to H1/H2; cascade behavior
(`ON DELETE CASCADE` removing `journal_entries`) is why the stage copy warns
about journal entries.

---

### 7 · Acceptance

- [ ] Stage delete dialog reads **exactly**
      `Delete stage "<start> to <end>"? This also deletes its journal entries.`
- [ ] Entry delete dialog reads **exactly**
      `Delete "<title>" from the journal?` (or `"this entry"` when untitled).
- [ ] Tone/quoting matches the shipping trip/item confirms (verb-first,
      double-quoted subject, single consequence clause).
- [ ] One canonical definition per string — mobile and desktop deletes show
      identical text (same handler via `action.endsWith()`).
- **GWT:** Given stage "Porto to Braga", When Delete → the browser confirm,
      Then the message is character-for-character the stage string above, and
      Cancel performs no deletion.

### 8 · Reference image

_No render — copy atom. The Delete affordance that triggers this dialog is
shown in `refs/M2-stage-action-footer.jpg`._
