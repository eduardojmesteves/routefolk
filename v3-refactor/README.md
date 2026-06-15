# routefolk · v3 Handover — Atomic Component Contracts

**Audience:** the engineer (or Claude Code) implementing routefolk v3 against
`eduardojmesteves/routefolk@main`.
**Form:** a small set of *atomic component contracts*. Each atom is one
self-contained spec that builds and verifies on its own.
**Status of this package:** 🟡 *Template + structure for your review.* Two
example atoms are fully worked (`atoms/M2-…`, `atoms/S1-…`). The rest are
**stubs awaiting your sign-off on the format** (see the checkpoint at the
bottom).

---

## 0 · Read these first, in order

| # | File | Why |
|---|------|-----|
| 1 | [`00-RECONCILIATION.md`](./00-RECONCILIATION.md) | What `main` **already ships** vs. the v3 gaps. Read before writing a single line — half of the old `IMPLEMENTATION.md` is now obsolete. |
| 2 | [`01-TOKENS.md`](./01-TOKENS.md) | The canonical design tokens, where they live, and the **5 missing tokens** you must add before any danger-styled atom. |
| 3 | [`02-ATOM-TEMPLATE.md`](./02-ATOM-TEMPLATE.md) | The 8-section contract every atom follows. Copy it to start a new atom. |
| 4 | [`03-EVALUATION-CRITERIA.md`](./03-EVALUATION-CRITERIA.md) | The bar each atom must clear before it is "done". |
| 5 | [`atoms/`](./atoms/) | The component contracts themselves. |
| 6 | [`INDEX.html`](./INDEX.html) | Visual home — open in a browser to review the package and the reference images. |

---

## 1 · The one-paragraph brief

routefolk v3 adds **edit / delete / reorder affordances** to stages and
journal entries, and **cost breakdowns**, across both the mobile
(`.rf-clean-*` / `.rf-m2-*`) and desktop (`.rf-d2-*`) render paths. The
**data layer is already done** (`lib/stages.js`, `lib/journal.js`). The
**Navigate atom is already done** (`components/atoms/navigate-button.js`).
v3 is therefore a **render + handler + token** job, factored into shared
atoms — *not* a data job and *not* a rebuild.

> **Out of scope — do not touch:** the archive interactive map
> (`screens/render/archive/*`, `archive-geo-map.js`). It is complete and
> frozen. No atom in this package references it.

---

## 2 · The atom inventory

IDs are stable handles. `Surface`: 📱 mobile · 🖥 desktop · ♊ shared.
`State`: ✅ done in main · 🟠 partial · 🔴 missing.

### Foundation (build first — everything depends on these)

| ID | Atom | Surface | State | Builds in |
|----|------|---------|-------|-----------|
| **F0** | Token additions (`danger`, `danger-soft`, `m2-surface-2`) | ♊ | 🔴 | `styles/shell.css`, `styles/interface-polish.css` |
| **F1** | Write/visibility guards (`canWriteToTrip` · `writeDisabledAttr` · `showStageActions`) | ♊ | 🔴 | `screens/render/shared.js` |
| **F2** | Confirm-dialog copy contract (stage + entry deletes) | ♊ | 🔴 | `screens/app-actions.js` |

### Mobile renderer atoms (`screens/render/trip-detail/stages-mobile.js`, `costs-mobile.js`)

| ID | Atom | State |
|----|------|-------|
| **M1** | Stage card — split tap-target + footer wrapper | 🔴 |
| **M2** | Stage action footer (`↑ ↓ Edit Delete`) — **worked example** | 🔴 |
| **M3** | Stage drill-in action pills (`Edit · Delete · Navigate`) | 🟠 (Navigate only) |
| **M4** | Journal entry row + `✎ ✕` | 🟠 (row exists, no icons) |
| **M6** | Stage wizard — edit variant (prefill) | 🔴 |
| **M7** | Journal wizard — edit variant (prefill) | 🔴 |

### Desktop renderer atoms (`screens/render/trip-detail/stages-desktop.js`)

| ID | Atom | State |
|----|------|-------|
| **D1** | Stage aside actions (`Edit stage · Delete · ↑ · ↓ · Navigate`) | 🟠 (Navigate only) |
| **D2** | Desktop journal entry + `✎ ✕` (3-col grid) | 🟠 (row exists, no icons) |
| **D3** | Stage wizard — edit variant (prefill) | 🔴 |
| **D4** | Journal wizard — edit variant (prefill) | 🔴 |

### Shared atoms

| ID | Atom | State |
|----|------|-------|
| **S1** | Costs breakdown card (by-category / by-payer, proportional bar) — **worked example** | 🟠 (desktop bar-less; mobile missing) |

### Handler wiring (capture-phase, matched by `action.endsWith()`)

| ID | Atom | State |
|----|------|-------|
| **H1** | Stage handlers: `*-edit-stage`, `*-delete-stage`, `*-stage-up/down` | 🔴 |
| **H2** | Journal handlers: `*-edit-entry`, `*-delete-entry` | 🔴 |
| **H3** | `saveStage` / `saveJournal` branch on edit mode | 🔴 |

### Reused — document & call, never rebuild

| ID | Asset | Where |
|----|-------|-------|
| **R1** | `navigateButtonHtml(stage,{online,kind,archived})` | `components/atoms/navigate-button.js` |
| **R2** | `updateStage` · `deleteStage` · `swapStageOrder` · `updateEntry` · `deleteEntry` | `lib/stages.js`, `lib/journal.js` |

---

## 3 · Build order (dependency-correct)

```
F0 ─┬─ F1 ─┬─ M1 ─ M2 ─ M3 ──┐
    │      ├─ M4              ├─ H1 ─ H3 ─ M6/D3
    │      ├─ D1 ─ D2 ────────┤
    │      └─ S1              └─ H2 ─ M7/D4
    └─ F2 ──────────────────────────────┘
```

One atom = one commit. Each atom's spec ends with a self-verifiable
acceptance checklist; do not open a PR until every atom in scope is green.

---

## 4 · Conventions every atom obeys (lifted from the real codebase)

1. **Atoms are string factories.** Follow `components/atoms/navigate-button.js`:
   `export function fooHtml(model, { prefix, online, archived, … }) → string`.
   No DOM construction, no framework.
2. **`prefix` switches surface.** `'rf-m2'` (mobile) or `'rf-d2'` (desktop).
   See `weatherPanelHtml(stage, wx, { prefix })`. One atom, two surfaces.
3. **Actions are namespaced + suffix-routed.** Emit `data-action="rf-m2-…"`
   or `data-action="rf-d2-…"`; the router in `screens/app-actions.js`
   (`dispatchAppAction`) matches with `action.endsWith('…')`, so **one handler
   serves both surfaces** — that is why H1/H2 are surface-agnostic.
4. **Escape everything interpolated** with `esc()` from `utils/dom.js`.
5. **Never hardcode color.** Use tokens only (so the 4 `[data-palette]`
   themes keep working). See `01-TOKENS.md`.
6. **State is read from `STATE`** (`state/app-state.js`): `STATE.isOnline`,
   `STATE.wizard`, `STATE.editTargetId`, `STATE.selectedStageId`, trip
   `status`. The guards in **F1** centralize the rules.

---

## 5 · ✋ Checkpoint — verify before mass-production

This package deliberately stops here. Before the remaining ~15 atom stubs
are filled in, confirm:

- [ ] The **8-section atom template** (`02-ATOM-TEMPLATE.md`) captures
      everything you need.
- [ ] The two **worked examples** (`M2`, `S1`) are at the right depth —
      not too thin, not bloated.
- [ ] The **atom inventory + IDs** above match the scope you want.
- [ ] **Folder organization** (foundation / mobile / desktop / shared /
      handlers, one `.md` per atom + pinned `refs/`) is how you want it.
- [ ] **F0 token additions** are an acceptable prerequisite (vs. inlining
      values).

Once you sign off, every stub gets filled to the depth of M2/S1, each with
its own pinned reference image.
