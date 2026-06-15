# F1 · Write / visibility guards

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| F1 | Write/visibility guards | ♊ shared | 🔴 missing | `screens/render/shared.js` | — | `STATE.isOnline` (`app-state.js:74`), `trip.status` |

**Intent.** Three pure helper functions that centralize the
archived-view-only and offline-disabled rules so every action atom
(M2/M3/M4/D1/D2) reads them from one place instead of re-deriving
`['completed','cancelled'].includes(trip.status)` inline.

> **🔴 Missing.** None of `canWriteToTrip`, `writeDisabledAttr`,
> `showStageActions` exist in `shared.js` today (verified by grep). The
> archived predicate is currently inlined at `stages-mobile.js:42` and
> `stages-desktop.js:47` as `archived: ['completed','cancelled'].includes(trip.status)`.
> F1 lifts that single source of truth into `shared.js`; the renderers will
> call the guard instead (M1/D1 do the swap).

---

### 2 · Tokens & metrics

None (logic atom). Downstream visual deltas the guards trigger live in the
consuming atoms (e.g. M2 disabled → `--rf-m2-rule-2`; see `01-TOKENS.md §4`).

---

### 3 · Markup contract

**Factories** (add to `screens/render/shared.js`, alongside the other
`export function` helpers — e.g. after `currentTrip()` at line 40):

```js
// True when the trip is editable (not archived). Archived = completed/cancelled.
export function canWriteToTrip(trip) {
  return !!trip && !['completed', 'cancelled'].includes(trip.status);
}

// True when stage/entry action affordances should render at all.
// Same predicate as canWriteToTrip today, but a distinct name so a future
// "view-only but online" case can diverge without touching every atom.
export function showStageActions(trip) {
  return canWriteToTrip(trip);
}

// Returns the disabled attribute fragment for write actions when offline.
// '' (enabled) or ' disabled' (note the leading space) — append directly
// into a tag: `<button ...${writeDisabledAttr(trip)}>`.
export function writeDisabledAttr(trip) {
  return (canWriteToTrip(trip) && STATE.isOnline) ? '' : ' disabled';
}
```

**DOM map.** N/A — string/boolean helpers.

**Anchor.** `screens/render/shared.js`, top-level exports near `currentTrip()`
(line 37-40). `STATE` is already imported in `shared.js`.

> **Precedence note.** `showStageActions` decides *whether the footer/aside
> renders* (archived ⇒ omit). `writeDisabledAttr` decides *whether the
> already-rendered buttons are clickable* (offline ⇒ `disabled`). An atom
> uses `showStageActions` to early-return `''`, then `writeDisabledAttr` on
> each button — exactly as M2's factory does.

---

### 4 · States

| State | Predicate | Guard result |
|-------|-----------|--------------|
| Active + online | `trip.status ∉ {completed,cancelled}` & `STATE.isOnline` | `showStageActions`→true · `writeDisabledAttr`→`''` |
| Active + offline | active & `STATE.isOnline===false` | `showStageActions`→true · `writeDisabledAttr`→`' disabled'` |
| Archived | `trip.status ∈ {completed,cancelled}` | `showStageActions`→false · `writeDisabledAttr`→`' disabled'` |
| No trip | `trip` null/undefined | all → false / `' disabled'` (safe default) |

---

### 5 · Interaction (Given/When/Then)

Presentational — no handlers. The guards are read by action atoms (M2 §3/§4,
M3, M4, D1, D2) and by the H1/H2 handlers as a defensive check.

---

### 6 · Data & persistence

None. Pure reads of `trip.status` and `STATE.isOnline`. No mutation, no
Supabase call.

---

### 7 · Acceptance

- [ ] `canWriteToTrip`, `showStageActions`, `writeDisabledAttr` are exported
      from `shared.js` and importable by the renderers.
- [ ] `writeDisabledAttr` returns `' disabled'` (leading space) when offline
      or archived, `''` otherwise.
- [ ] `showStageActions(archivedTrip) === false`; `=== true` for an active trip.
- [ ] Renderers no longer inline `['completed','cancelled'].includes(...)`
      for the actions case (M1/D1 swap to the guard).
- **GWT — offline:** Given an active trip and `STATE.isOnline=false`, When a
      renderer builds a write button with `${writeDisabledAttr(trip)}`, Then
      the emitted HTML contains `disabled`.
- **GWT — archived:** Given `trip.status='completed'`, When
      `showStageActions(trip)` is called, Then it returns `false` and the
      footer/aside factory returns `''`.

### 8 · Reference image

_No render — logic atom. Its effect is visible in
`refs/M2-stage-action-footer.jpg`: row 2 (offline → all disabled) and row 3
(archived → no footer)._
