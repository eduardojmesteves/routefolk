# 00b · Status audit — shipped code vs. the README inventory

> Derived from a full source read at branch `new-v3-refactor` (base `a5e7b47`).
> The original `00-RECONCILIATION.md` understated how much already ships:
> the **entire handler layer and all edit wizards are already implemented**.
> This audit corrects each atom's State and pins the evidence. Atoms are
> specced to their **real** state (build spec for true gaps, verification
> spec for shipped behavior).

---

## A · Corrected per-atom state

| Atom | README | **Actual** | Evidence |
|------|--------|-----------|----------|
| F0 tokens | 🔴 | 🔴 build | `shell.css:3-4`, `interface-polish.css:7-10` — 4 tokens absent |
| F1 guards | 🔴 | 🔴 build | grep: `canWriteToTrip`/`showStageActions`/`writeDisabledAttr` absent in `shared.js` |
| F2 copy | 🔴 | 🟠 differs | exists at `stage-actions.js:108`, `journal-actions.js:115` — different wording |
| M1 stage card split | 🔴 | 🔴 build | `stages-mobile.js:48` — single `.rf-clean-stage` button, no footer |
| M2 stage footer | 🔴 | 🔴 build | render missing; **worked example uses wrong action names** (see §B) |
| M3 drill-in pills | 🟠 | 🟠 build | `stages-mobile.js:58` — `.rf-m2-stage-actions` = Navigate only |
| M4 entry ✎✕ | 🟠 | 🟠 build | `stages-mobile.js:58` — `.rf-clean-note` has no icons |
| D1 aside actions | 🟠 | 🟠 build | `stages-desktop.js:71` — `.rf-d2-stage-actions` = Navigate only |
| D2 entry ✎✕ | 🟠 | 🟠 build | `stages-desktop.js:31` — `.rf-d2-entry` 2-col, no icons |
| **H1 stage handlers** | 🔴 | **✅ done** (edit/delete/update) · 🔴 **reorder missing** | `stage-actions.js:134-155`; no `stage-up/down`, `swapStageOrder` called nowhere |
| **H2 journal handlers** | 🔴 | **✅ done** | `journal-actions.js:140-160` |
| **H3 save edit branch** | 🔴 | **✅ done** | split handlers `saveStageCreate`/`saveStageEdit` (`stage-actions.js:45,73`), `saveEntryCreate`/`saveEntryEdit` (`journal-actions.js:45,79`) |
| **M6 stage edit wizard** | 🔴 | **✅ done** | `stage-wizard.js:20` `stageEditWizardHtml()` + `wizard-host.js:102` |
| **M7 journal edit wizard** | 🔴 | **✅ done** | `journal-wizard.js:23` `journalEditWizardHtml()` + `wizard-host.js:104` |
| **D3 desktop stage edit** | 🔴 | **✅ done** (shared overlay) | `wizard-host.js` is surface-agnostic (`is-desktop`/`is-mobile`); inline `renderStageWizard` (`stages-desktop.js:55`) is legacy create-only |
| **D4 desktop journal edit** | 🔴 | **✅ done** (shared overlay) | as D3, via `wizard-host.js:104` |
| S1 breakdown bars | 🟠 | 🟠 build | desktop bar-less, mobile absent |

---

## B · Critical convention correction

**README convention #3 ("actions are suffix-routed via `endsWith()`") is FALSE
for the stage/journal edit/delete/update actions.** The action-router
delegates to domain modules; stage/journal wizard actions are matched by
**exact name** via a `Set.has(action)` check:

- `STAGE_WIZARD_ACTIONS` = `{rf-v2-save-stage, rf-v2-edit-stage, rf-v2-delete-stage, rf-v2-update-stage}` — `stage-actions.js:34-39`, tested in `owns()` at `:121-124`.
- `JOURNAL_WIZARD_ACTIONS` = analogous — `journal-actions.js:34-39`.
- Only the **shell-level** suffixes (`add-stage`, `select-stage`, `open-stage`, `save-stage`, …) are `endsWith()`-matched (`STAGE_APP_SUFFIXES`).

**Consequence:** render affordances must emit the **exact** `rf-v2-edit-stage`
/ `rf-v2-delete-stage` / `rf-v2-edit-entry` / `rf-v2-delete-entry` — **not**
surface-prefixed `rf-m2-*` / `rf-d2-*`. The M2 worked example's
`rf-m2-edit-stage` / `rf-m2-delete-stage` / `rf-m2-stage-up/down` would be
**unrouted**. M2 §3 is patched accordingly.

Handler data attributes the router reads: `btn.dataset.stageId`
(`stage-actions.js:146,151`), `btn.dataset.entryId` (`journal-actions.js:152,157`).

---

## C · The genuinely-new work

1. **F0** tokens · **F1** guards.
2. **Render affordances** (M1/M2, M3, M4, D1, D2) emitting the existing
   `rf-v2-*` edit/delete actions, guarded by F1.
3. **Reorder** — the one missing handler: add `rf-v2-stage-up` /
   `rf-v2-stage-down` to `STAGE_WIZARD_ACTIONS` + `handle()`, calling
   `swapStageOrder` (R2), plus the ↑↓ buttons (M2/D1). Specced in **H1**.
4. **Confirm copy** — decision: **align code → package** (F2 copy is
   canonical). `stage-actions.js:108` and `journal-actions.js:115` change to
   the F2 strings. Specced in **H1/H2/F2**.
5. **S1** breakdown bars.

Everything else (H1 edit/delete, H2, H3, M6, M7, D3, D4) is a **verification
spec**: documents the shipped contract and gives checks to confirm it still
holds — no rebuild.
