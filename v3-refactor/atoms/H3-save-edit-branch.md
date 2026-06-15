# H3 · Save / update branch on edit mode

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| H3 | Save edit branch | ♊ shared | ✅ done | `actions/stage-actions.js` · `actions/journal-actions.js` | H1, H2 | R2 create/update fns |

**Intent.** Ensure "Save changes" on an edit wizard calls `update*` (not
`create*`). **Already satisfied** — the codebase uses **distinct actions and
distinct handlers** for create vs. edit rather than branching on
`STATE.wizard` inside one save function.

> **✅ Done — design differs from the README.** The README anticipated a
> single `saveStage`/`saveJournal` that branches on
> `STATE.wizard==='stage-edit'`. Reality: separate handlers, separate actions.

---

### 2 · Tokens & metrics

None (logic).

---

### 3 · Markup contract

The create/edit split (verification map):

| Mode | Wizard markup | Save action | Handler | Data fn |
|------|---------------|-------------|---------|---------|
| Stage create | `stageCreateWizardHtml()` (`stage-wizard.js:16`) | `rf-v2-save-stage` | `saveStageCreate` (`stage-actions.js:45`) | `createStage` |
| Stage edit | `stageEditWizardHtml()` (`stage-wizard.js:20`) | `rf-v2-update-stage` | `saveStageEdit` (`stage-actions.js:73`) | `updateStage` |
| Entry create | `journalCreateWizardHtml()` (`journal-wizard.js:19`) | `rf-v2-save-journal` | `saveEntryCreate` (`journal-actions.js:45`) | `createEntry` |
| Entry edit | `journalEditWizardHtml()` (`journal-wizard.js:23`) | `rf-v2-update-entry` | `saveEntryEdit` (`journal-actions.js:79`) | `updateEntry` |

The mode selector is `STATE.wizard`, switched in `wizard-host.js:101-104`.
Create wizards read non-suffixed field ids (`v2-stage-from`); edit wizards
read `-edit`-suffixed ids (`v2-stage-from-edit`) — so the two never collide.

---

### 4 · States

| State | Trigger | Behavior |
|-------|---------|----------|
| Create save | `STATE.wizard ∈ {stage, journal}` + save action | `create*` → append to `STATE` |
| Edit save | `STATE.wizard ∈ {stage-edit, journal-edit}` + update action | `update*` → replace in `STATE` by id |
| Validation error | empty entry / bad URL | `showError(...)` (`*-actions.js` catch) — wizard stays open |

---

### 5 · Interaction (Given/When/Then)

- **Edit save.** *Given* `stage-edit` open with changed "To", *when* Save,
  *then* `rf-v2-update-stage` → `saveStageEdit` → `updateStage(id, {…})`
  replaces the stage in `STATE.stagesByTrip` by id (not appended).
- **Create save.** *Given* `stage` open, *when* Save, *then* `rf-v2-save-stage`
  → `saveStageCreate` → `createStage` appends a new row.

---

### 6 · Data & persistence

`updateStage` / `updateEntry` write only allow-listed keys present in the
payload (`lib/stages.js:109`, `lib/journal.js:87`). Edit handlers map
`-edit` field values → those keys (`stage-actions.js:79-86`,
`journal-actions.js:87-94`).

---

### 7 · Acceptance

- [ ] **(verify)** Editing a stage and saving updates the existing row (count unchanged).
- [ ] **(verify)** Editing an entry and saving updates in place.
- [ ] **(verify)** Creating still appends (no regression).
- **GWT:** Given 3 stages, When the 2nd is edited and saved, Then there are
      still 3 stages and the 2nd reflects the change.

### 8 · Reference image

_No render — handler atom._
