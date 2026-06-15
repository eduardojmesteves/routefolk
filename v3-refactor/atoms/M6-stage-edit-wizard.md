# M6 · Stage wizard — edit variant (prefill, mobile)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| M6 | Stage edit wizard | 📱 mobile | ✅ done | `screens/wizards/stage-wizard.js` · `wizard-host.js` | F1, H1, H3 | `selectedStage`, `panelHtml` (`wizard-shared.js`) |

**Intent.** The prefilled "edit stage" form opened from M3's Edit pill (and
M1/M2 footer Edit). **Already shipped** — verification spec.

> **✅ Done.** `stageEditWizardHtml()` (`stage-wizard.js:20-24`) builds the
> prefilled form; `wizard-host.js:102` renders it for `STATE.wizard==='stage-edit'`.

---

### 2 · Tokens & metrics

Inherits the shared wizard panel (`panelHtml`/`row`/`input`/`textarea` from
`wizard-shared.js`) — same tokens as the create wizard. No new styling.

---

### 3 · Markup contract

**Factory (shipped):** `export function stageEditWizardHtml()` — calls
`selectedStage()`; returns `emptyWizard('No stage selected.')` if none.
Prefilled fields (`stage-wizard.js:23`):

| Field id | Prefill | Maps to |
|----------|---------|---------|
| `v2-stage-from-edit` | `stage.start_location` | `start_location` |
| `v2-stage-to-edit` | `stage.end_location` | `end_location` |
| `v2-stage-date-edit` | `stage.planned_date` | `planned_date` |
| `v2-stage-km-edit` | `stage.distance_km` | `distance_km` |
| `v2-stage-route-edit` | `stage.custom_route_url` | `custom_route_url` |
| `v2-stage-notes-edit` | `stage.notes` | `notes` |

Kicker "Edit stage", title "Adjust the route leg", save action
`rf-v2-update-stage`, label "Save stage", errorId `v2-stage-error`.

**Mount.** `wizard-host.js:102`. Opened by H1 `rf-v2-edit-stage` setting
`STATE.wizard='stage-edit'` + `editTargetId` (`stage-actions.js:143-148`).

---

### 4 · States

| State | Trigger | Visual |
|-------|---------|--------|
| Prefilled | `stage-edit` + a selected stage | form populated from `selectedStage()` |
| No selection | none selected | `emptyWizard('No stage selected.')` |
| Error | bad `custom_route_url` | `showError('v2-stage-error', …)` (validation throws, `lib/stages.js:121`) |

---

### 5 · Interaction (Given/When/Then)

- **Open.** *Given* M3 Edit on the open stage, *when* tapped, *then* this
  wizard renders with current values.
- **Save.** *Given* a changed field, *when* "Save stage", *then* H3
  `rf-v2-update-stage` → `saveStageEdit` → `updateStage`; wizard closes.

---

### 6 · Data & persistence

Reads `selectedStage()`. Save path → `updateStage` (R2). M6 itself is markup.

---

### 7 · Acceptance

- [ ] **(verify)** Edit opens with all fields prefilled from the stage.
- [ ] **(verify)** Invalid Custom Maps URL shows the inline error and blocks save.
- [ ] **(verify)** Saving updates the stage in place (see H3).
- **GWT:** Given a stage with notes "Mountain pass", When Edit is opened,
      Then the notes textarea contains "Mountain pass".

### 8 · Reference image

_No pinned render — shared wizard panel chrome._
