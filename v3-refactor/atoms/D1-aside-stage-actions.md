# D1 · Stage aside actions (desktop)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| D1 | Aside stage actions | 🖥 desktop | 🟠 build (Navigate exists) | `screens/render/trip-detail/stages-desktop.js` · `styles/app-ui.css` | F0, F1, F2 | R1 `navigateButtonHtml`, H1 (`rf-v2-edit-stage`/`-delete-stage`/`-stage-up`/`-stage-down`) |

**Intent.** Add `Edit stage`, `Delete`, `↑`, `↓` to the desktop stage aside
header, next to the existing **Navigate**.

> **🟠 Build.** `renderAside` (`stages-desktop.js:71`) renders
> `<div class="rf-d2-stage-actions">${desktopNavigateHtml(trip, stage)}</div>`.
> D1 appends the four affordances. Reorder (`↑ ↓`) depends on the **new**
> `rf-v2-stage-up`/`rf-v2-stage-down` handler specced in **H1**.

---

### 2 · Tokens & metrics

| Property | Value |
|----------|-------|
| Button | reuse `.rf-d2-btn` (radius `999px`, `1px solid var(--rf-d2-rule-2)`, `padding:8px 16px`, ui `800 13px`) — use a compact variant `padding:6px 12px` |
| Row | `display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px` |
| Delete | `color:var(--rf-d2-danger)`; bg `var(--rf-d2-danger-soft)` ⟵ **F0**; `border-color:transparent` |
| Reorder ↑↓ | `.icon` compact, `color:var(--rf-d2-muted)` |
| Disabled | `opacity:.45; cursor:not-allowed` |

CSS (append to `styles/app-ui.css`):

```css
.rf-d2-stage-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.rf-d2-stage-actions .rf-d2-act{border:1px solid var(--rf-d2-rule-2);background:transparent;border-radius:999px;padding:6px 12px;font:800 13px var(--rf-d2-font-ui);color:var(--rf-d2-ink);cursor:pointer}
.rf-d2-stage-actions .rf-d2-act.icon{padding:6px 10px;color:var(--rf-d2-muted)}
.rf-d2-stage-actions .rf-d2-act.danger{color:var(--rf-d2-danger);background:var(--rf-d2-danger-soft);border-color:transparent}
.rf-d2-stage-actions .rf-d2-act[disabled]{opacity:.45;cursor:not-allowed}
```

---

### 3 · Markup contract

**Factory:**

```js
function desktopStageActionsHtml(trip, stage, { index, total }) {
  let html = desktopNavigateHtml(trip, stage);            // R1
  if (showStageActions(trip)) {                            // F1
    const w = writeDisabledAttr(trip);                     // F1
    html += `<button class="rf-d2-act" data-action="rf-v2-edit-stage" data-stage-id="${esc(stage.id)}" type="button"${w}>Edit stage</button>`
          + `<button class="rf-d2-act danger" data-action="rf-v2-delete-stage" data-stage-id="${esc(stage.id)}" type="button"${w}>Delete</button>`
          + `<button class="rf-d2-act icon" data-action="rf-v2-stage-up" data-stage-id="${esc(stage.id)}" type="button" ${index === 0 ? 'disabled' : w} aria-label="Move up">↑</button>`
          + `<button class="rf-d2-act icon" data-action="rf-v2-stage-down" data-stage-id="${esc(stage.id)}" type="button" ${index === total - 1 ? 'disabled' : w} aria-label="Move down">↓</button>`;
  }
  return `<div class="rf-d2-stage-actions">${html}</div>`;
}
```

**Anchor.** `renderAside(trip, stage, …)` (`stages-desktop.js:63-72`) —
replace the inline `.rf-d2-stage-actions` div. `index`/`total` come from the
selected stage's position in `stages(trip.id)` (computed in `renderStages`,
`stages-desktop.js:79-81`; thread it into `renderAside`).

> Exact actions `rf-v2-*`; `data-stage-id` read at `stage-actions.js:146,151`
> and (new) reorder handler. See `00b-STATUS-AUDIT.md §B/C`.

---

### 4 · States

| State | Trigger | Visual / DOM delta |
|-------|---------|--------------------|
| Default | active + online | Navigate + Edit + Delete + ↑ + ↓ |
| Archived | `showStageActions(trip)` false | Navigate only |
| Offline | `STATE.isOnline===false` | Edit/Delete/↑/↓ disabled |
| First stage | `index===0` | `↑` disabled |
| Last stage | `index===total-1` | `↓` disabled |

---

### 5 · Interaction (Given/When/Then)

- **Edit / Delete.** As M3 but desktop — H1 `rf-v2-edit-stage` → `stage-edit`
  wizard (served by the surface-agnostic `wizard-host`, D3); `rf-v2-delete-stage`
  → F2 confirm + `deleteStage`.
- **Reorder.** *Given* an enabled `↑`/`↓`, *when* clicked, *then* the new H1
  reorder handler swaps with the neighbor via `swapStageOrder` (R2 RPC) and
  re-syncs.

---

### 6 · Data & persistence

None added — H1 (R2 `updateStage`/`deleteStage`/`swapStageOrder`).

---

### 7 · Acceptance

- [ ] Aside header shows Navigate + Edit stage + Delete + ↑ + ↓ (active+online).
- [ ] First/last selected stage disables ↑/↓ respectively.
- [ ] Archived: Navigate only. Offline: write actions disabled.
- [ ] Delete uses `--rf-d2-danger` + `--rf-d2-danger-soft` (proves F0) in all palettes.
- **GWT:** Given stages `[A,B,C]` with B selected, When `↑`, Then order
      becomes `[B,A,C]` and persists after reload.

### 8 · Reference image

_No dedicated render. Danger Delete + reorder mirror the desktop side of
`../refs/S1-costs-breakdown.jpg` palette context (`midnight`)._
