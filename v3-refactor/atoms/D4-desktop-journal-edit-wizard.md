# D4 · Journal wizard — edit variant (desktop)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| D4 | Desktop journal edit | 🖥 desktop | ✅ done (shared overlay) | `screens/wizards/wizard-host.js` (+ note on `stages-desktop.js`) | F1, H2, H3, M7 | `journalEditWizardHtml()` |

**Intent.** Desktop "edit entry" experience. **Already shipped** via the
surface-agnostic `wizard-host` overlay — verification spec, twin of D3.

> **✅ Done.** `wizard-host.js:104` renders `journal-edit →
> journalEditWizardHtml()` for both surfaces. D2's `✎` (`rf-v2-edit-entry`)
> opens the same M7 form, desktop-styled by the host `is-desktop` class.
>
> **Legacy.** Inline `renderJournalWizard()` (`stages-desktop.js:59-61`) is
> create-only (switches on `STATE.wizard==='journal'`, `:65`); no edit branch.
> Superseded for editing by the overlay — do not add a parallel one.

---

### 2 · Tokens & metrics

Desktop chrome via host `is-desktop` over the shared panel — no new tokens.

---

### 3 · Markup contract

No new factory. Verified path:

```
D2 ✎ (rf-v2-edit-entry) → STATE.wizard='journal-edit' (journal-actions.js:149-154)
  → wizard-host renderWizardLayer() modeClass 'is-desktop'
  → wizardHtml() → journalEditWizardHtml()  (wizard-host.js:104)
```

Save action `rf-v2-update-entry` → H2/H3 `saveEntryEdit` → `updateEntry`.

---

### 4 · States

| State | Trigger | Visual |
|-------|---------|--------|
| Desktop edit | `journal-edit` + `isDesktop()` | M7 form in the desktop-styled overlay |
| No selection | none | `emptyWizard('No journal entry selected.')` |

---

### 5 · Interaction (Given/When/Then)

- **Open.** *Given* desktop D2 `✎`, *when* clicked, *then* the desktop overlay
  shows the prefilled entry form.
- **Save.** As M7/H3 — `rf-v2-update-entry` → `updateEntry`.

---

### 6 · Data & persistence

Same as M7 (`updateEntry`, R2).

---

### 7 · Acceptance

- [ ] **(verify)** Desktop D2 `✎` opens the prefilled entry wizard in the
      `is-desktop` host.
- [ ] **(verify)** No duplicate legacy edit wizard fires for `journal-edit`.
- **GWT:** Given a desktop entry, When `✎` is clicked, Then one prefilled
      edit form appears.

### 8 · Reference image

_No pinned render — shared desktop wizard chrome._
