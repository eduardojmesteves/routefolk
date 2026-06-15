# D3 · Stage wizard — edit variant (desktop)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| D3 | Desktop stage edit | 🖥 desktop | ✅ done (shared overlay) | `screens/wizards/wizard-host.js` (+ note on `stages-desktop.js`) | F1, H1, H3, M6 | `stageEditWizardHtml()` |

**Intent.** Desktop "edit stage" experience. **Already shipped** via the
**surface-agnostic** `wizard-host` overlay — D3 documents that and flags the
legacy inline desktop wizard.

> **✅ Done — no separate desktop edit wizard needed.** `wizard-host.js`
> renders with `modeClass = isDesktop() ? 'is-desktop' : 'is-mobile'` and
> dispatches `stage-edit → stageEditWizardHtml()` for **both** surfaces
> (`wizard-host.js:101-104`). So D1's Edit (`rf-v2-edit-stage`) opens the same
> M6 form, styled for desktop by the host's `is-desktop` class.
>
> **Legacy.** `renderStageWizard(trip)` inline in `stages-desktop.js:55-57`
> is **create-only** and switches only on `STATE.wizard==='stage'`
> (`stages-desktop.js:64`). It has **no** `stage-edit` branch and is
> superseded for editing by the overlay. Recommendation: leave create as-is or
> migrate it to the host too; do **not** add a parallel desktop edit wizard.

---

### 2 · Tokens & metrics

Desktop styling comes from the host's `is-desktop` modeClass over the shared
panel — no new tokens.

---

### 3 · Markup contract

No new factory. Verification of the existing path:

```
D1 Edit (rf-v2-edit-stage) → STATE.wizard='stage-edit' (stage-actions.js:143-148)
  → wizard-host renderWizardLayer() with modeClass 'is-desktop'
  → wizardHtml() → stageEditWizardHtml()  (wizard-host.js:102)
```

Save action `rf-v2-update-stage` → H1/H3 `saveStageEdit` → `updateStage`.

---

### 4 · States

| State | Trigger | Visual |
|-------|---------|--------|
| Desktop edit | `stage-edit` + `isDesktop()` | M6 form in the desktop-styled host overlay |
| No selection | none | `emptyWizard('No stage selected.')` |

---

### 5 · Interaction (Given/When/Then)

- **Open.** *Given* the desktop aside Edit stage (D1), *when* clicked, *then*
  the desktop overlay shows the prefilled stage form.
- **Save.** As M6/H3 — `rf-v2-update-stage` → `updateStage`.

---

### 6 · Data & persistence

Same as M6 (`updateStage`, R2). No desktop-specific persistence.

---

### 7 · Acceptance

- [ ] **(verify)** Desktop D1 Edit opens the prefilled wizard in the
      `is-desktop` host (not the mobile sheet).
- [ ] **(verify)** No second desktop edit-wizard renders simultaneously
      (the legacy inline aside wizard does not fire for `stage-edit`).
- **GWT:** Given a desktop trip, When a stage's Edit is clicked, Then one
      prefilled edit form appears in the aside/overlay.

### 8 · Reference image

_No pinned render — shared desktop wizard chrome._
