# M4 · Journal entry row + ✎ ✕ (mobile)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| M4 | Journal entry icons | 📱 mobile | 🟠 build (row exists) | `screens/render/trip-detail/stages-mobile.js` · `styles/app-ui.css` | F0, F1, F2 | H2 (`rf-v2-edit-entry`/`rf-v2-delete-entry`) |

**Intent.** Add `✎` (edit) and `✕` (delete) icon-buttons to each mobile
journal entry row, so notes can be edited/deleted from the list.

> **🟠 Build.** `renderMobileJournal` (`stages-mobile.js:58`) renders
> `<article class="rf-clean-note"><span>${i+1}</span><div>…</div></article>`
> with grid `30px 1fr` (`interface-polish.css:29`). M4 adds a third column
> for the icons: `30px 1fr auto`.

---

### 2 · Tokens & metrics

| Property | Value |
|----------|-------|
| Grid | `30px 1fr auto` (was `30px 1fr`) |
| Icon button | `26×26`, radius `999px`, ui, `var(--rf-m2-muted)` |
| Icon hover | `background:var(--rf-m2-surface-2)` ⟵ **F0** |
| ✕ (delete) | `color:var(--rf-m2-danger)` ⟵ **F0** |
| Disabled | `opacity:.45; cursor:not-allowed` |

CSS (append to `styles/app-ui.css`):

```css
.rf-clean-note{grid-template-columns:30px 1fr auto}
.rf-clean-note-acts{display:flex;gap:4px;align-items:start}
.rf-clean-note-acts button{width:26px;height:26px;border:0;border-radius:999px;background:transparent;color:var(--rf-m2-muted);font:14px var(--rf-m2-font-ui);cursor:pointer}
.rf-clean-note-acts button:hover:not([disabled]){background:var(--rf-m2-surface-2)}
.rf-clean-note-acts button.danger{color:var(--rf-m2-danger)}
.rf-clean-note-acts button[disabled]{opacity:.45;cursor:not-allowed}
```

> `.rf-clean-note` already sets `display:grid` — this rule only overrides
> `grid-template-columns`.

---

### 3 · Markup contract

**Factory** (extend the `entries.map(...)` body):

```js
entries.map((entry, i) => {
  const acts = showStageActions(trip)                      // F1
    ? `<div class="rf-clean-note-acts">`
      + `<button data-action="rf-v2-edit-entry" data-entry-id="${esc(entry.id)}"${writeDisabledAttr(trip)} aria-label="Edit entry">✎</button>`
      + `<button class="danger" data-action="rf-v2-delete-entry" data-entry-id="${esc(entry.id)}"${writeDisabledAttr(trip)} aria-label="Delete entry">✕</button>`
      + `</div>`
    : '';
  return `<article class="rf-clean-note"><span>${i + 1}</span>`
    + `<div><small>A ${esc(entry.entry_type || 'note')}</small><strong>${esc(entry.title || 'Untitled')}</strong>`
    + `${entry.location ? `<em>at ${esc(entry.location)}</em>` : ''}</div>`
    + `${acts}</article>`;
}).join('')
```

**Anchor.** `renderMobileJournal` (`stages-mobile.js:58`), the
`entries.map(...)` block; keep the `|| '<div class="rf-clean-empty">No entries yet.</div>'`
fallback.

> Exact actions `rf-v2-edit-entry` / `rf-v2-delete-entry`
> (`journal-actions.js:34`); `data-entry-id` read at `journal-actions.js:152,157`.

---

### 4 · States

| State | Trigger | Visual / DOM delta |
|-------|---------|--------------------|
| Default | active + online | row shows `✎ ✕` |
| Archived | `showStageActions(trip)` false | no icons (view-only) |
| Offline | `STATE.isOnline===false` | `✎ ✕` disabled |
| Empty | no entries | `.rf-clean-empty` (unchanged) |

---

### 5 · Interaction (Given/When/Then)

- **Edit.** *Given* `✎`, *when* tapped, *then* H2 (`rf-v2-edit-entry`) sets
  `STATE.wizard='journal-edit'`, `editTargetId=entry.id`, re-renders → M7
  prefilled wizard (`journal-actions.js:149-154`).
- **Delete.** *Given* `✕`, *when* tapped, *then* H2 (`rf-v2-delete-entry` →
  `removeEntry`) confirms with the F2 string `Delete "<title>" from the journal?`
  then `deleteEntry` (`journal-actions.js:110-121`, copy updated per F2).

---

### 6 · Data & persistence

None added — delegates to H2 (R2 `updateEntry`/`deleteEntry`).

---

### 7 · Acceptance

- [ ] Each entry row shows `✎ ✕` (active+online); grid is `30px 1fr auto`.
- [ ] `✎` opens the prefilled entry wizard; `✕` confirms then removes.
- [ ] Archived: no icons. Offline: icons disabled.
- [ ] `✕` is danger-hued, hover fill resolves (proves F0 `surface-2`/`danger`).
- **GWT:** Given entry "Lunch at the pass", When `✕` → confirm OK, Then the
      row disappears.

### 8 · Reference image

_No dedicated render. Icon treatment matches D2's `✎ ✕` (desktop) and the
danger token shown in `../refs/M2-stage-action-footer.jpg`._
