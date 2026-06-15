# 00 · Reconciliation — `main` today vs. v3 target

> Snapshot: `eduardojmesteves/routefolk@main` (commit `a5e7b47`).
> Purpose: stop you from re-building things that already ship, and point
> each v3 gap at the **real** file (the repo was refactored after the
> original `IMPLEMENTATION.md` was written — those file paths are stale).

---

## A · The headline corrections

| The old `IMPLEMENTATION.md` says… | Reality in `main` |
|---|---|
| "Add `updateStage`, `deleteStage`, `reorderStage` to `lib/stages.js` (T-M01)." | **Already there.** `updateStage`, `deleteStage`, and an **atomic** `swapStageOrder` (Postgres RPC `swap_stage_order`) all exist. The non-atomic two-write reorder in the old guide is **superseded** — call the RPC. |
| "Add `updateEntry`, `deleteEntry` to `lib/journal.js` (T-M02)." | **Already there.** Plus URL-validation helpers. |
| "Edit `screens/render/mobile.js` → `mobileStages()` / `mobileJournal()` / `mobileCosts()`." | **Files moved.** Rendering now lives in `screens/render/trip-detail/stages-mobile.js` (`renderMobileStages`, `renderMobileJournal`), `costs-mobile.js` (`renderMobileCosts`). `screens/render/mobile.js` is now just a router. |
| "Edit `screens/render/desktop.js` → `renderAside()` / `entryHtml()`." | **Moved** to `screens/render/trip-detail/stages-desktop.js`. |
| "Edit `screens/wizards.js`." | **Moved.** `screens/wizards.js` is a 447-byte re-export; real wizards live in `screens/wizards/*`. The *transitional* desktop wizards are inline in `stages-desktop.js` (`renderStageWizard`, `renderJournalWizard`). |
| "Add `.rf-clean-*` CSS with `--rf-rule`, `--rf-ink`, `--rf-serif`…" | Token names are **`--rf-m2-*` (mobile)** and **`--rf-d2-*` (desktop)**, defined in `styles/shell.css`. The bare `--rf-*` names are only fallbacks. See `01-TOKENS.md`. |
| "Navigate = inline `<a class="nav">…Navigate ↗</a>`." | **Superseded by an atom.** `navigateButtonHtml(stage,{online,kind,archived})` already handles archived/offline/no-coords/desktop-vs-mobile. **Call it; don't inline a link.** |

---

## B · What is DONE — do not rebuild (R1 / R2)

- **Stage data** — `lib/stages.js`: `listStages`, `createStage`, `updateStage`,
  `deleteStage`, `swapStageOrder` (RPC), `validateCustomMapsUrl`.
- **Journal data** — `lib/journal.js`: `listEntriesForStage`, `createEntry`,
  `updateEntry`, `deleteEntry`, `validateLocationUrl/InfoUrl/PhotoAlbumUrl`.
- **Navigate** — `components/atoms/navigate-button.js` (+ `navigate-sheet.js`).
- **Weather** — `components/atoms/weather-panel.js` (`{prefix}` pattern to copy).
- **Expense edit/delete** — `rf-v2-edit-expense` / `rf-v2-delete-expense`
  already wired on both surfaces.
- **Trip edit/delete** — `rf-m2-list-edit-trip` / `…-delete-trip`.
- **Desktop cost breakdowns (partial)** — `costs-desktop.js` renders
  `breakdown(agg.cat)` / `breakdown(agg.payer)` as `.rf-d2-breakdown` rows
  **without bars**.
- **Palette system** — 4 themes (`midnight` default, `forest`, `oxblood`,
  `alpine`) via `[data-palette]`; `setPalette()` in `shared.js`.
- **Archive map** — complete. **Frozen. Out of scope.**

---

## C · The gaps — what v3 actually adds

| Gap | Surface · file | Today | v3 target | Atom |
|-----|----------------|-------|-----------|------|
| Stage card has no actions | 📱 `stages-mobile.js` `renderMobileStages` | single `<button class="rf-clean-stage">` | split card: tap-body + `↑ ↓ Edit Delete` footer | M1, M2 |
| Drill-in has Navigate only | 📱 `stages-mobile.js` `renderMobileJournal` | `.rf-m2-stage-actions` = Navigate | add `Edit stage` / `Delete` pills | M3 |
| Journal entry not editable | 📱 `stages-mobile.js` (`.rf-clean-note`) | `№ · type · title · loc` | add `✎ ✕`; grid → `18px 1fr auto` | M4 |
| No cost breakdowns | 📱 `costs-mobile.js` `renderMobileCosts` | ledger + All entries | add By-category + By-payer cards with bars | S1 |
| Aside has Navigate only | 🖥 `stages-desktop.js` `renderAside` | `.rf-d2-stage-actions` = Navigate | add `Edit stage · Delete · ↑ · ↓` | D1 |
| Desktop entry not editable | 🖥 `stages-desktop.js` `entryHtml` | 2-col `.rf-d2-entry` | add `✎ ✕`; grid → `28px 1fr auto` | D2 |
| Breakdown bars missing | 🖥 `costs-desktop.js` `breakdown()` | label + amount rows | add proportional `.bar > i` | S1 |
| Wizards are create-only | ♊ `stages-desktop.js` + mobile wizard | `New stage` / `A note from the road` | `isEdit` → prefill + "Save changes" | M6, M7, D3, D4 |
| No edit/delete/reorder handlers | ♊ `app-actions.js` `dispatchAppAction` | only `add-*`, `save-*` | add `*-edit/delete-stage`, `*-stage-up/down`, `*-edit/delete-entry` | H1, H2 |
| Save is create-only | ♊ `app-actions.js` `saveStage`/`saveJournal` | always `createStage`/`createEntry` | branch on `STATE.wizard==='stage-edit'`/`'entry-edit'` | H3 |

---

## D · The token drift (becomes atom F0)

The v3 mockup styles danger affordances (`Delete`) with
`--rf-*-danger` / `--rf-*-danger-soft`, and a hover with `--rf-m2-surface-2`.
Auditing `styles/shell.css` + `styles/interface-polish.css`:

| Token | Defined? | Needed by |
|-------|----------|-----------|
| `--rf-d2-danger` | ✅ all 4 palettes | D1, S-row danger |
| `--rf-d2-danger-soft` | 🔴 **missing** | D1 Delete pill bg |
| `--rf-m2-danger` | 🔴 **missing** (m2 never aliases danger) | M2/M3/M4 Delete |
| `--rf-m2-danger-soft` | 🔴 **missing** | M3 Delete pill bg |
| `--rf-m2-surface-2` | 🔴 **missing** | M4 icon hover |

**F0 must add these to `:root` in `shell.css` AND to all four
`[data-palette]` blocks in `interface-polish.css`**, using the existing
per-palette `--rf-d2-danger` as the source hue:

| Palette | `--rf-d2-danger` (exists) | derive `--rf-*-danger-soft` |
|---------|---------------------------|------------------------------|
| midnight | `#7d3458` | `rgba(125,52,88,.16)` |
| forest | `#a14b3e` | `rgba(161,75,62,.16)` |
| oxblood | `#a05442` | `rgba(160,84,66,.16)` |
| alpine | `#9c5b3b` | `rgba(156,91,59,.16)` |

`--rf-m2-danger` aliases `--rf-d2-danger`; `--rf-m2-danger-soft` aliases
`--rf-d2-danger-soft`; `--rf-m2-surface-2` aliases `--rf-d2-surface-2`.
F0's full spec carries the exact diff.

---

## E · Validation status against the LIVE app

The production site is behind Google OAuth and cannot be driven
headlessly. This reconciliation is derived from **source at `a5e7b47`**,
which is authoritative for structure and behavior. Open items to confirm
against your live screenshots/recording:

- [ ] Live `main` matches `a5e7b47` (no unpushed renderer work).
- [ ] Default palette in production is `midnight` (matches the mockups).
- [ ] Offline behavior: `STATE.isOnline === false` is actually set by the
      service worker / network listener at runtime (F1 depends on it).
