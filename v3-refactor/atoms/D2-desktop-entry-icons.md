# D2 · Desktop journal entry + ✎ ✕ (3-col grid)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| D2 | Desktop entry icons | 🖥 desktop | 🟠 build (row exists) | `screens/render/trip-detail/stages-desktop.js` · `styles/app-ui.css` | F0, F1, F2 | H2 (`rf-v2-edit-entry`/`rf-v2-delete-entry`) |

**Intent.** Add `✎` / `✕` icon-buttons to each desktop journal entry,
expanding the row grid from `28px 1fr` to `28px 1fr auto`.

> **🟠 Build.** `entryHtml(entry, index)` (`stages-desktop.js:29-32`) renders
> `<div class="rf-d2-entry"><div class="rf-d2-entry-bullet">…</div><div>…</div></div>`
> (grid `28px 1fr`, `shell.css:11`). D2 adds the icon column. `entryHtml`
> currently takes no `trip` — thread it through for the F1 guard.

---

### 2 · Tokens & metrics

| Property | Value |
|----------|-------|
| Grid | `28px 1fr auto` (was `28px 1fr`) |
| Icon button | `26×26`, radius `999px`, `var(--rf-d2-muted)` |
| Icon hover | `background:var(--rf-d2-surface-2)` (exists) |
| ✕ (delete) | `color:var(--rf-d2-danger)` |
| Disabled | `opacity:.45; cursor:not-allowed` |

CSS (append to `styles/app-ui.css`):

```css
.rf-d2-entry{grid-template-columns:28px 1fr auto}
.rf-d2-entry-acts{display:flex;gap:4px;align-items:start}
.rf-d2-entry-acts button{width:26px;height:26px;border:0;border-radius:999px;background:transparent;color:var(--rf-d2-muted);font:14px var(--rf-d2-font-ui);cursor:pointer}
.rf-d2-entry-acts button:hover:not([disabled]){background:var(--rf-d2-surface-2)}
.rf-d2-entry-acts button.danger{color:var(--rf-d2-danger)}
.rf-d2-entry-acts button[disabled]{opacity:.45;cursor:not-allowed}
```

---

### 3 · Markup contract

**Factory** (extend `entryHtml`, add `trip` param):

```js
function entryHtml(entry, index, trip) {
  const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const acts = showStageActions(trip)                         // F1
    ? `<div class="rf-d2-entry-acts">`
      + `<button data-action="rf-v2-edit-entry" data-entry-id="${esc(entry.id)}" type="button"${writeDisabledAttr(trip)} aria-label="Edit entry">✎</button>`
      + `<button class="danger" data-action="rf-v2-delete-entry" data-entry-id="${esc(entry.id)}" type="button"${writeDisabledAttr(trip)} aria-label="Delete entry">✕</button>`
      + `</div>`
    : '';
  return `<div class="rf-d2-entry"><div class="rf-d2-entry-bullet">${index + 1}</div>`
    + `<div><div class="rf-d2-entry-head"><div class="rf-d2-entry-type">A ${esc(entry.entry_type || 'note')}</div><div class="rf-d2-entry-when">${esc(time)}</div></div>`
    + `<div class="rf-d2-entry-title">${esc(entry.title || 'Untitled')}</div>`
    + `<div class="rf-d2-entry-loc">${entry.location ? `at ${esc(entry.location)}` : ''}</div></div>`
    + `${acts}</div>`;
}
```

**Anchor.** `entryHtml` (`stages-desktop.js:29`) + its call site in
`renderAside` (`stages-desktop.js:71`): `entries.map(entryHtml)` →
`entries.map((e, i) => entryHtml(e, i, trip))`.

> Exact actions `rf-v2-edit-entry`/`rf-v2-delete-entry`; `data-entry-id` read
> at `journal-actions.js:152,157`.

---

### 4 · States

| State | Trigger | Visual / DOM delta |
|-------|---------|--------------------|
| Default | active + online | row shows `✎ ✕` |
| Archived | `showStageActions(trip)` false | no icons |
| Offline | `STATE.isOnline===false` | `✎ ✕` disabled |
| Loading | `rawEntries === 'loading'` | loading state (unchanged, owned by renderAside) |

---

### 5 · Interaction (Given/When/Then)

- **Edit.** *Given* `✎`, *when* clicked, *then* H2 (`rf-v2-edit-entry`) sets
  `journal-edit` + `editTargetId`; the surface-agnostic `wizard-host` (D4)
  renders the prefilled wizard.
- **Delete.** *Given* `✕`, *when* clicked, *then* H2 (`rf-v2-delete-entry` →
  `removeEntry`) confirms `Delete "<title>" from the journal?` (F2) then
  `deleteEntry`.

---

### 6 · Data & persistence

None added — H2 (R2 `updateEntry`/`deleteEntry`).

---

### 7 · Acceptance

- [ ] Each desktop entry shows `✎ ✕`; grid is `28px 1fr auto`.
- [ ] `✎` opens prefilled edit wizard; `✕` confirms then removes.
- [ ] Archived: no icons. Offline: disabled.
- **GWT:** Given a desktop entry, When `✕` → confirm OK, Then the row
      disappears and the aside re-renders.

### 8 · Reference image

_No dedicated render — `✎ ✕` treatment is the desktop twin of M4._
