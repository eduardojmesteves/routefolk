# M2 · Stage action footer (mobile)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| M2 | Stage action footer | 📱 mobile | 🔴 missing | `screens/render/trip-detail/stages-mobile.js` · `styles/app-ui.css` | F0, F1, M1 | R2 (`swapStageOrder`, `deleteStage`), H1, M6 |

**Intent.** The 4-button row that sits under each stage card's tap-target
on the mobile **Stages** list: `↑ ↓ Edit Delete`. It exposes reorder +
edit + delete without leaving the list. M1 provides the card wrapper that
contains the tap-body and this footer; M2 is the footer itself.

> Today `renderMobileStages` renders a single
> `<button class="rf-clean-stage">` per stage with no actions. M1 splits
> that into `<article class="rf-clean-stage-card">` → `<button
> class="rf-clean-stage-tap">` + **this footer**.

---

### 2 · Tokens & metrics

| Property | Value |
|----------|-------|
| Layout | `display:grid; grid-template-columns:40px 40px 1fr 1fr` (↑, ↓, Edit, Delete) |
| Top edge | `border-top:1px solid var(--rf-m2-rule)` |
| Footer fill | `rgba(0,0,0,.025)` |
| Button font | `var(--rf-m2-font-ui)`, `12px`, `600`, `letter-spacing:.01em` |
| Button color | `var(--rf-m2-ink)` |
| Button padding | `9px 0` (text) · `8px 0` (`.icon`) |
| Separators | `border-right:1px dotted var(--rf-m2-rule)`, none on `:last-child` |
| Icon buttons (↑↓) | `.icon` → `13px`, color `var(--rf-m2-muted)` |
| Delete | `.danger` → color `var(--rf-m2-danger)` ⟵ **F0** |
| Hover (enabled) | `background:rgba(0,0,0,.04)` |
| Disabled | color `var(--rf-m2-rule-2)`; `.danger[disabled]` → `rgba(125,52,88,.35)`; `cursor:not-allowed` |

CSS block (append to `styles/app-ui.css`, namespaced `.rf-clean-*`):

```css
.rf-clean-stage-foot{display:grid;grid-template-columns:40px 40px 1fr 1fr;border-top:1px solid var(--rf-m2-rule);background:rgba(0,0,0,.025)}
.rf-clean-stage-foot button{appearance:none;border:0;background:transparent;font:600 12px var(--rf-m2-font-ui);color:var(--rf-m2-ink);padding:9px 0;border-right:1px dotted var(--rf-m2-rule);cursor:pointer;letter-spacing:.01em}
.rf-clean-stage-foot button:last-child{border-right:0}
.rf-clean-stage-foot button.icon{font-size:13px;color:var(--rf-m2-muted);padding:8px 0}
.rf-clean-stage-foot button.danger{color:var(--rf-m2-danger)}
.rf-clean-stage-foot button[disabled]{color:var(--rf-m2-rule-2);cursor:not-allowed}
.rf-clean-stage-foot button.danger[disabled]{color:rgba(125,52,88,.35)}
.rf-clean-stage-foot button:hover:not([disabled]){background:rgba(0,0,0,.04)}
```

---

### 3 · Markup contract

**Factory** (new; export from `stages-mobile.js` or an atom file imported
by it):

```js
// model: stage row; index: 0-based; total: stage count; trip: for guards
export function stageActionFooterHtml(stage, { index, total, trip }) {
  if (!showStageActions(trip)) return '';            // F1 — archived ⇒ no footer
  const w = writeDisabledAttr(trip);                 // F1 — '' or ' disabled'
  return `<div class="rf-clean-stage-foot">`
    + `<button class="icon" data-action="rf-m2-stage-up" data-stage-id="${esc(stage.id)}" ${index === 0 ? 'disabled' : w}>↑</button>`
    + `<button class="icon" data-action="rf-m2-stage-down" data-stage-id="${esc(stage.id)}" ${index === total - 1 ? 'disabled' : w}>↓</button>`
    + `<button data-action="rf-m2-edit-stage" data-stage-id="${esc(stage.id)}"${w}>Edit</button>`
    + `<button class="danger" data-action="rf-m2-delete-stage" data-stage-id="${esc(stage.id)}"${w}>Delete</button>`
  + `</div>`;
}
```

**DOM map**

```
div.rf-clean-stage-foot                (grid 40 40 1fr 1fr)
├─ button.icon         [rf-m2-stage-up]    "↑"   disabled if index===0
├─ button.icon         [rf-m2-stage-down]  "↓"   disabled if index===total-1
├─ button              [rf-m2-edit-stage]  "Edit"
└─ button.danger       [rf-m2-delete-stage]"Delete"
```

**Anchor.** Inside `renderMobileStages(trip,…)` in
`screens/render/trip-detail/stages-mobile.js`, M1 wraps each stage in
`<article class="rf-clean-stage-card">`; append
`${stageActionFooterHtml(stage,{index,total:st.length,trip})}` immediately
after the `.rf-clean-stage-tap` button, before closing `</article>`.

---

### 4 · States

| State | Trigger (predicate) | Visual / DOM delta |
|-------|---------------------|--------------------|
| Default | `showStageActions(trip)` true & online | All 4 buttons enabled |
| Hidden | `showStageActions(trip)` false → `trip.status ∈ {completed,cancelled}` | Factory returns `''` — **no footer node** |
| Offline-disabled | `STATE.isOnline === false` (via `writeDisabledAttr`) | All 4 buttons get `disabled`; tokens shift to `--rf-m2-rule-2`; Delete → `rgba(125,52,88,.35)` |
| First row | `index === 0` | `↑` `disabled` (even when online) |
| Last row | `index === total - 1` | `↓` `disabled` |
| Hover | pointer over an enabled button | `background:rgba(0,0,0,.04)` |
| Pressed→Edit | tap Edit | opens M6 edit wizard (see §5) |
| Pressed→Delete | tap Delete | native confirm (see §5/F2) |

Empty/loading/error are owned by the parent list (`renderMobileStages`),
not the footer.

---

### 5 · Interaction (Given/When/Then)

- **Reorder up.** *Given* an enabled `↑` on a non-first row, *when* tapped,
  *then* handler H1 (`rf-m2-stage-up`) optimistically swaps this stage with
  the previous in `STATE.stagesByTrip[trip.id]`, calls
  `swapStageOrder(prev, this)` (RPC), re-syncs via
  `appApi().loadStagesForTrip?.(trip.id,{quiet:true})`, and `renderSoon()`.
  On RPC error it restores the previous array and rethrows.
- **Reorder down.** Symmetric for `rf-m2-stage-down` (swap with next).
- **Edit.** *Given* an enabled `Edit`, *when* tapped, *then* H1 sets
  `STATE.selectedStageId = id`, `STATE.wizard = 'stage-edit'`,
  `STATE.editTargetId = id`, `renderSoon()` → M6 renders the prefilled
  wizard.
- **Delete.** *Given* an enabled `Delete`, *when* tapped, *then* H1 shows
  `window.confirm` with the **exact** F2 copy:
  `Delete stage "<start> to <end>"? This also deletes its journal entries.`
  *If confirmed*, call `deleteStage(id)`, remove from
  `STATE.stagesByTrip[trip.id]`, drop `STATE.entriesByStage[id]`, clear
  selection if it was selected, `renderSoon()`. *If cancelled*, no-op.
- **Disabled buttons** swallow taps (native `disabled`) — no handler fires.

---

### 6 · Data & persistence

| Action | Fn (R2) | Fields / args | Notes |
|--------|---------|---------------|-------|
| ↑ / ↓ | `swapStageOrder(stageA, stageB)` → RPC `swap_stage_order` | `{p_stage_a_id, p_stage_b_id}` | Atomic; locks both rows, checks same-trip. **Do not** hand-roll two `order_index` writes. |
| Edit | none here | — | M6 form → H3 `updateStage(id, fields)` on save |
| Delete | `deleteStage(id)` | `id` | `ON DELETE CASCADE` removes `journal_entries`. |

Optimistic update then `loadStagesForTrip` re-sync. Order source of truth:
`listStages` sorts by `order_index` then `created_at`.

---

### 7 · Acceptance

- [ ] Active + online trip: each stage card shows `↑ ↓ Edit Delete`.
- [ ] First card `↑` disabled; last card `↓` disabled.
- [ ] Offline (DevTools → Network → Offline, reload): all four render
      `disabled`; card tap-body still opens the journal.
- [ ] Archived trip (status completed/cancelled): **no footer** anywhere.
- [ ] Four palettes: Delete is danger-hued in each (no black/transparent →
      proves F0 landed).
- [ ] Footer never wraps to two rows at 320px width.
- **GWT — reorder:** Given stages `[A,B,C]`, When `↓` on A, Then list shows
      `[B,A,C]` instantly and persists after refresh.
- **GWT — delete:** Given stage "Porto to Braga", When Delete → confirm,
      Then dialog reads exactly
      `Delete stage "Porto to Braga"? This also deletes its journal entries.`
      and on OK the card disappears.

---

### 8 · Reference image

![M2 stage action footer](../refs/M2-stage-action-footer.jpg)

Palette `midnight`. Shows, top→bottom: **default** (all enabled, first row
with `↑` disabled), **offline-disabled** (all greyed), and the **archived**
case (card with no footer).
