# M3 · Stage drill-in action pills (mobile)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| M3 | Drill-in action pills | 📱 mobile | 🟠 build (Navigate exists) | `screens/render/trip-detail/stages-mobile.js` · `styles/app-ui.css` | F0, F1, F2 | R1 `navigateButtonHtml`, H1 (`rf-v2-edit-stage`/`rf-v2-delete-stage`) |

**Intent.** Add `Edit stage` and `Delete` pills next to the existing
**Navigate** pill in the per-stage journal drill-in header, so the open stage
can be edited/deleted in place.

> **🟠 Build.** `renderMobileJournal` (`stages-mobile.js:58`) already renders
> `<div class="rf-m2-stage-actions">${mobileNavigateHtml(trip, stage)}</div>`.
> M3 appends two pills inside that row. Navigate is **reused** (R1) — do not
> inline a link.

---

### 2 · Tokens & metrics

| Property | Value |
|----------|-------|
| Pill | radius `999px`, `1px solid var(--rf-m2-rule-2)`, `padding:6px 12px`, ui `800 12px` (matches `.rf-clean-actions button`, `interface-polish.css:29`) |
| Row | `display:flex; gap:7px; flex-wrap:wrap` |
| Edit | `color:var(--rf-m2-ink)` |
| Delete | `.danger` → `color:var(--rf-m2-danger)` ⟵ **F0**; bg `var(--rf-m2-danger-soft)` ⟵ **F0** |
| Disabled | `opacity:.45; cursor:not-allowed` (via `writeDisabledAttr`) |

CSS (append to `styles/app-ui.css`):

```css
.rf-m2-stage-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:10px 0}
.rf-m2-stage-actions .rf-m2-pill-action{border:1px solid var(--rf-m2-rule-2);background:transparent;border-radius:999px;padding:6px 12px;font:800 12px var(--rf-m2-font-ui);color:var(--rf-m2-ink)}
.rf-m2-stage-actions .rf-m2-pill-action.danger{color:var(--rf-m2-danger);background:var(--rf-m2-danger-soft);border-color:transparent}
.rf-m2-stage-actions .rf-m2-pill-action[disabled]{opacity:.45;cursor:not-allowed}
```

---

### 3 · Markup contract

**Factory** (extend the existing actions row):

```js
function mobileStageActionsHtml(trip, stage) {
  let html = mobileNavigateHtml(trip, stage);          // R1, unchanged
  if (showStageActions(trip)) {                         // F1
    const w = writeDisabledAttr(trip);                  // F1 — '' | ' disabled'
    html += `<button class="rf-m2-pill-action" data-action="rf-v2-edit-stage" data-stage-id="${esc(stage.id)}"${w}>Edit stage</button>`
          + `<button class="rf-m2-pill-action danger" data-action="rf-v2-delete-stage" data-stage-id="${esc(stage.id)}"${w}>Delete</button>`;
  }
  return `<div class="rf-m2-stage-actions">${html}</div>`;
}
```

**Anchor.** `renderMobileJournal` (`stages-mobile.js:58`) — replace the inline
`<div class="rf-m2-stage-actions">${mobileNavigateHtml(trip, stage)}</div>`
with `${mobileStageActionsHtml(trip, stage)}`.

> **Action names are exact** (`rf-v2-edit-stage` / `rf-v2-delete-stage`) —
> matched by `STAGE_WIZARD_ACTIONS.has()` (`stage-actions.js:34`). `data-stage-id`
> is read at `stage-actions.js:146,151`. See `00b-STATUS-AUDIT.md §B`.

---

### 4 · States

| State | Trigger | Visual / DOM delta |
|-------|---------|--------------------|
| Default | active + online | Navigate + Edit + Delete pills |
| Archived | `showStageActions(trip)` false | Navigate only (Edit/Delete omitted) |
| Offline | `STATE.isOnline===false` | Edit/Delete `disabled`; Navigate handles its own offline state (R1) |

---

### 5 · Interaction (Given/When/Then)

- **Edit.** *Given* Edit stage, *when* tapped, *then* H1 (`rf-v2-edit-stage`)
  sets `STATE.wizard='stage-edit'`, `editTargetId=stage.id`, re-renders → M6
  prefilled wizard (`stage-actions.js:143-148`).
- **Delete.** *Given* Delete, *when* tapped, *then* H1 (`rf-v2-delete-stage`
  → `removeStage`) shows the F2 confirm
  `Delete stage "<start> to <end>"? This also deletes its journal entries.`
  then `deleteStage` (`stage-actions.js:103-115`, copy updated per F2).

---

### 6 · Data & persistence

None added — delegates to the existing H1 handlers (R2 `updateStage`/`deleteStage`).

---

### 7 · Acceptance

- [ ] Drill-in header shows Navigate + Edit stage + Delete (active+online).
- [ ] Edit opens the prefilled stage edit wizard; Delete confirms then removes.
- [ ] Archived: only Navigate shows.
- [ ] Delete pill is danger-hued in all 4 palettes (proves F0).
- **GWT:** Given the open stage "Porto to Braga", When Delete → confirm OK,
      Then the stage is removed and the list returns to first stage.

### 8 · Reference image

_No dedicated render — pills mirror the M2 footer styling (danger Delete) at
`../refs/M2-stage-action-footer.jpg`._
