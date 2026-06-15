# 02 · Atom contract template

Every atom is one Markdown file in [`atoms/`](./atoms/) named
`<ID>-<slug>.md`. It has **exactly these 8 sections**, in this order. Copy
the skeleton at the bottom to start a new one. Worked references:
[`atoms/M2-stage-action-footer.md`](./atoms/M2-stage-action-footer.md),
[`atoms/S1-costs-breakdown.md`](./atoms/S1-costs-breakdown.md).

The 8 sections map 1:1 to what an implementer needs and to the
[evaluation criteria](./03-EVALUATION-CRITERIA.md):

| # | Section | Answers | Eval criterion |
|---|---------|---------|----------------|
| 1 | **Identity & dependencies** | What is it, which surface, what must exist first | Atomicity, Traceability |
| 2 | **Tokens & metrics** | Exact tokens + px/weights/radii | Visual precision |
| 3 | **Markup contract** | Factory signature + the exact HTML string + classes + `data-*` | Buildability, No-invention |
| 4 | **States** | Every state, its trigger, its visual delta | State-completeness |
| 5 | **Interaction (Given/When/Then)** | Behavior + exact copy strings | Behavioral precision |
| 6 | **Data & persistence** | Supabase fields touched, sanitisation, fns called | Data precision |
| 7 | **Acceptance** | Checklist + GWT the implementer self-verifies | Verifiability |
| 8 | **Reference image** | The pinned visual in `refs/` | Visual precision |

---

## Section-by-section rules

**1 · Identity & dependencies.**
A header table: `ID`, `Title`, `Surface` (📱/🖥/♊), `State` (✅/🟠/🔴),
`Builds in` (exact file path[s]), `Depends on` (atom IDs), `Reuses`
(R1/R2 or existing fns). One sentence of intent. If 🟠, name precisely
what already exists and what changes.

**2 · Tokens & metrics.**
Only the tokens this atom uses, from [`01-TOKENS.md`](./01-TOKENS.md), with
the literal px / weight / radius / gap values. No raw hex.

**3 · Markup contract.**
- The **factory signature** in the project convention:
  `export function fooHtml(model, { prefix, … }) → string`.
- The **exact output HTML** as a template literal, every class and
  `data-action` / `data-*` attribute shown, `esc()` on every interpolation.
- A short **DOM map** (tree) if nesting is non-obvious.
- Cite the **anchor** in the host renderer where the string is inserted
  (function name + the adjacent existing line).

**4 · States.**
A table: `State | Trigger (precise predicate) | Visual / DOM delta`.
Must cover, where applicable: `default, hover, pressed/active, focus,
disabled (offline), archived (view-only), empty, loading, error,
first/last (reorder bounds)`. Triggers reference F1 guards or `STATE`.

**5 · Interaction (Given/When/Then).**
One GWT block per behavior. **Quote exact copy strings** (confirm dialogs,
button labels, titles) — they are contractual. If no interaction, write
"Presentational — no handlers" and say which atom/handler owns the action.

**6 · Data & persistence.**
Which `lib/*` function is called, the **exact field set** and sanitisation
(cite the allow-list in `lib/stages.js` / `lib/journal.js`), the optimistic
`STATE` mutation, and the reload call (`appApi().load…`). "None
(presentational)" is a valid answer.

**7 · Acceptance.**
A checkbox list (fast manual/automated checks) **plus** Given/When/Then for
the behavioral cases. Each item must be independently checkable by the
implementer without reading another atom.

**8 · Reference image.**
`![…](../refs/<ID>-<slug>.png)` — the pinned render of the atom in its key
states. Note the palette and any state shown.

---

## Skeleton — copy to start a new atom

```markdown
# <ID> · <Title>

### 1 · Identity & dependencies
| ID | Surface | State | Builds in | Depends on | Reuses |
|----|---------|-------|-----------|------------|--------|
| <ID> | 📱/🖥/♊ | ✅/🟠/🔴 | `path` | F0,F1,… | R1/R2/fn |

<one-sentence intent>

### 2 · Tokens & metrics
- …

### 3 · Markup contract
**Factory:** `export function …Html(…) → string`
**Output:**
\`\`\`js
`…`
\`\`\`
**Anchor:** insert in `<fn>()` in `<file>`, between `<line>` and `<line>`.

### 4 · States
| State | Trigger | Visual / DOM delta |
|-------|---------|--------------------|
| … | … | … |

### 5 · Interaction (Given/When/Then)
- **Given** … **When** … **Then** … (copy: "…")

### 6 · Data & persistence
- …

### 7 · Acceptance
- [ ] …
- **GWT:** Given … When … Then …

### 8 · Reference image
![<ID>](../refs/<ID>-<slug>.png) — palette `midnight`, states: …
```
