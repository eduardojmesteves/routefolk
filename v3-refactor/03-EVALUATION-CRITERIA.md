# 03 · Evaluation criteria

The bar every atom — and the package as a whole — must clear. Use this as
the review rubric and as the definition of done.

---

## A · Per-atom gates (all must pass)

1. **Atomicity.** The atom builds and verifies **without** any sibling atom
   being finished. Its only dependencies are listed in §1 and are earlier
   in the build order.
2. **Traceability.** Every claim points at a real artifact: exact file
   path, function name, CSS class, or token. No "somewhere in the
   renderer." A reviewer can `grep` each reference and find it.
3. **State-completeness.** §4 enumerates *every* state the atom can be in,
   each with a **precise trigger predicate** (not "when archived" but
   `trip.status ∈ {completed,cancelled}` via `showStageActions`). Missing
   states = fail.
4. **Visual precision.** §2 gives exact tokens + literal px / weight /
   radius / gap. No "looks about right", no raw hex outside F0.
5. **Behavioral precision.** §5 uses Given/When/Then and **quotes exact
   copy strings**. Confirm-dialog text is character-for-character.
6. **No invention / reuse-first.** Where `main` already ships the behavior
   (R1 navigate, R2 data fns, expense edit/delete, desktop breakdown rows),
   the atom **calls it** and says so — it does not re-implement.
7. **Verifiability.** §7 checklist items are each independently checkable
   by the implementer; the GWT cases are runnable in the live PWA.
8. **Buildability by Claude Code.** §3 is copy-pasteable: a complete factory
   signature, the full HTML string, and a named insertion anchor. One atom
   ⇒ one coherent commit.
9. **Pinned reference image.** §8 exists and shows the atom's key states in
   the default palette.

---

## B · Cross-cutting gates (the package)

1. **Theme integrity.** Toggle all four `[data-palette]` themes — no atom
   shows an undefined-token fallback (white/black/transparent). This is why
   F0 ships first.
2. **Surface parity.** A behavior present on one surface is specified for
   the other (or explicitly scoped out with a reason), since one handler
   serves both via `action.endsWith()`.
3. **Guard centralization.** Archived-view-only and offline-disabled rules
   come from F1 (`canWriteToTrip` / `writeDisabledAttr` / `showStageActions`)
   — not re-derived inside each atom.
4. **No scope bleed.** Nothing references or modifies the archive map
   (`screens/render/archive/*`). 
5. **Copy consistency.** Destructive confirms follow the house voice already
   in `app-actions.js`:
   - trip: `Delete trip "<title>"? This cannot be undone.`
   - item: `Delete "<name>" from the packing list?`
   v3 stage/entry copy (F2) is consistent with these in tone and quoting.

---

## C · Definition of done (per atom)

> ✅ Done when: it builds in isolation · all §4 states reproduce on screen ·
> all §7 checks pass in the running PWA · it survives all four palettes ·
> the reference image matches the build · the diff is one commit touching
> only the files named in §1.

## D · Definition of done (release)

> ✅ Done when: every in-scope atom is individually done · F0/F1/F2 landed
> first · the cross-cutting gates pass · the original `IMPLEMENTATION.md`
> QA passes (mobile §1–10, desktop §1–10) re-run against the **real** file
> paths · zero changes to the archive map.

---

## E · Anti-criteria (automatic reject)

- Re-adds `updateStage`/`deleteStage`/`updateEntry`/`deleteEntry` (already
  exist).
- Re-implements the reorder as two non-atomic writes instead of
  `swapStageOrder` (RPC).
- Inlines a `Navigate ↗` link instead of `navigateButtonHtml`.
- Hardcodes a hex color in an atom.
- Uses bare `--rf-*` token names (e.g. `--rf-rule`) instead of the
  surface-prefixed `--rf-m2-*` / `--rf-d2-*`.
- Adds an action handler per surface instead of relying on
  `action.endsWith()`.
