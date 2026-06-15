# M7 · Journal wizard — edit variant (prefill, mobile)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| M7 | Journal edit wizard | 📱 mobile | ✅ done | `screens/wizards/journal-wizard.js` · `wizard-host.js` | F1, H2, H3 | `selectedEntry`, `panelHtml`/`select` (`wizard-shared.js`) |

**Intent.** The prefilled "edit entry" form opened from M4's `✎`.
**Already shipped** — verification spec.

> **✅ Done.** `journalEditWizardHtml()` (`journal-wizard.js:23-29`);
> `wizard-host.js:104` renders it for `STATE.wizard==='journal-edit'`.

---

### 2 · Tokens & metrics

Shared wizard panel chrome (`wizard-shared.js`). No new styling.

---

### 3 · Markup contract

**Factory (shipped):** `export function journalEditWizardHtml()` — calls
`selectedEntry()`; `emptyWizard('No journal entry selected.')` if none.
Prefilled fields (`journal-wizard.js:28`):

| Field id | Prefill | Maps to |
|----------|---------|---------|
| `v2-entry-type-edit` | `entry.entry_type` (select) | `entry_type` |
| `v2-entry-title-edit` | `entry.title` | `title` |
| `v2-entry-place-edit` | `entry.location` | `location` |
| `v2-entry-time-edit` | derived `HH:MM` from `entry.timestamp` | `timestamp` (recombined w/ stage date) |
| `v2-entry-note-edit` | `entry.description` | `description` |
| `v2-entry-location-url-edit` | `entry.location_url` | `location_url` |

Kicker "Edit entry", title "Refine the note", save action `rf-v2-update-entry`,
label "Save entry", errorId `v2-entry-error`.

**Mount.** `wizard-host.js:104`. Opened by H2 `rf-v2-edit-entry`
(`journal-actions.js:149-154`).

---

### 4 · States

| State | Trigger | Visual |
|-------|---------|--------|
| Prefilled | `journal-edit` + selected entry | form populated; type select shows current type |
| No selection | none | `emptyWizard('No journal entry selected.')` |
| Error | bad Maps URL | `showError('v2-entry-error', …)` (`lib/journal.js:107`) |

---

### 5 · Interaction (Given/When/Then)

- **Open.** *Given* M4 `✎`, *when* tapped, *then* the prefilled wizard renders
  with the entry's type, title, place, time, note, Maps URL.
- **Save.** *Given* an edit, *when* "Save entry", *then* H3
  `rf-v2-update-entry` → `saveEntryEdit` → `updateEntry`; closes.

---

### 6 · Data & persistence

Reads `selectedEntry()`. Time is recombined as `${stage.planned_date}T${HH:MM}:00`
(`journal-actions.js:85-93`). Save → `updateEntry` (R2).

---

### 7 · Acceptance

- [ ] **(verify)** `✎` opens with entry_type/title/place/time/description/URL prefilled.
- [ ] **(verify)** Invalid Maps URL blocks save with inline error.
- [ ] **(verify)** Save updates the entry in place.
- **GWT:** Given an entry of type "meal", When `✎` opens, Then the Type select
      shows "Meal" selected.

### 8 · Reference image

_No pinned render — shared wizard panel chrome._
