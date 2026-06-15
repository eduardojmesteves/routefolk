# F0 · Token additions (danger-soft + m2 aliases)

### 1 · Identity & dependencies

| ID | Title | Surface | State | Builds in | Depends on | Reuses |
|----|-------|---------|-------|-----------|------------|--------|
| F0 | Token additions | ♊ shared | 🔴 missing | `styles/shell.css` · `styles/interface-polish.css` | — (root of the build order) | existing per-palette `--rf-d2-danger`, `--rf-d2-surface-2` |

**Intent.** Add the four design tokens every danger-styled and hover-elevated
atom needs (`--rf-d2-danger-soft`, `--rf-m2-danger`, `--rf-m2-danger-soft`,
`--rf-m2-surface-2`) so that M2/M3/M4/D1 render correctly in all four
palettes instead of falling back to white/black/transparent.

> **🔴 Missing.** Auditing the real source (`shell.css:3-4`,
> `interface-polish.css:7-10`): `--rf-d2-danger` and `--rf-d2-surface-2`
> exist per palette; the four tokens below do **not**. Nothing else changes.
>
> **Doc nit:** the README/01-TOKENS headline says "5 missing tokens" but the
> enumerated set (01-TOKENS §1 ⚠️ markers + 00-RECONCILIATION table D) is
> **4 distinct token names**. This atom ships those 4; treat "5" as a typo.

---

### 2 · Tokens & metrics

The tokens to introduce, with their authored values:

| Token | Kind | Value (midnight) | Source |
|-------|------|------------------|--------|
| `--rf-d2-danger-soft` | new real value (per palette) | `rgba(125,52,88,.16)` | `--rf-d2-danger` hue @ 16% alpha |
| `--rf-m2-danger` | alias | `var(--rf-d2-danger)` | existing `--rf-d2-danger` |
| `--rf-m2-danger-soft` | alias | `var(--rf-d2-danger-soft)` | new token above |
| `--rf-m2-surface-2` | alias | `var(--rf-d2-surface-2)` | existing `--rf-d2-surface-2` |

**Per-palette `--rf-d2-danger-soft`** (derive from the existing `--rf-d2-danger`
hue at `.16` alpha — confirmed hues in `interface-polish.css:7-10`):

| Palette | `--rf-d2-danger` (exists) | `--rf-d2-danger-soft` (add) |
|---------|---------------------------|------------------------------|
| midnight | `#7d3458` | `rgba(125,52,88,.16)` |
| forest | `#a14b3e` | `rgba(161,75,62,.16)` |
| oxblood | `#a05442` | `rgba(160,84,66,.16)` |
| alpine | `#9c5b3b` | `rgba(156,91,59,.16)` |

The three `--rf-m2-*` tokens are pure aliases — identical in every palette.

---

### 3 · Markup contract

Presentational (CSS only) — no factory, no HTML. The diff:

**A · `styles/shell.css` `:root` (line 2).**
- Append to the `--rf-d2-*` declaration list (line 3, after `--rf-d2-danger:#7d3458;`):
  ```css
  --rf-d2-danger-soft:rgba(125,52,88,.16);
  ```
- Append to the `--rf-m2-*` alias list (line 4, after `--rf-m2-accent-soft:…;`):
  ```css
  --rf-m2-surface-2:var(--rf-d2-surface-2);--rf-m2-danger:var(--rf-d2-danger);--rf-m2-danger-soft:var(--rf-d2-danger-soft);
  ```

**B · `styles/interface-polish.css` — each `[data-palette]` block (lines 7-10).**
For every palette, add the palette's `--rf-d2-danger-soft` into the `--rf-d2-*`
group, and the three m2 aliases into the `--rf-m2-*` group:

```css
/* midnight (line 8): after --rf-d2-danger:#7d3458; add */
--rf-d2-danger-soft:rgba(125,52,88,.16);
/* …and in its --rf-m2-* group add */
--rf-m2-surface-2:var(--rf-d2-surface-2);--rf-m2-danger:var(--rf-d2-danger);--rf-m2-danger-soft:var(--rf-d2-danger-soft);

/* forest (line 7):   --rf-d2-danger-soft:rgba(161,75,62,.16); + same 3 m2 aliases */
/* oxblood (line 9):  --rf-d2-danger-soft:rgba(160,84,66,.16); + same 3 m2 aliases */
/* alpine (line 10):  --rf-d2-danger-soft:rgba(156,91,59,.16); + same 3 m2 aliases */
```

**Anchor.** `:root{…}` at `shell.css:2`; the four `[data-palette="…"]{…}`
blocks at `interface-polish.css:7-10`. No selector is added or removed —
only declarations appended inside existing blocks.

---

### 4 · States

| State | Trigger | Visual / DOM delta |
|-------|---------|--------------------|
| Default | any `[data-palette]` active | `var(--rf-*-danger-soft)` / `--rf-m2-*` resolve to a real color |
| Theme switch | `setPalette()` flips `[data-palette]` | danger/soft hue shifts per the table above |

No interactive states — these are token definitions.

---

### 5 · Interaction (Given/When/Then)

Presentational — no handlers. Consumed by M2/M3/M4 (mobile danger) and D1
(desktop Delete pill bg). Theme switching is owned by `setPalette()`
(`shared.js:46`), unchanged here.

---

### 6 · Data & persistence

None. CSS custom-property definitions only. No Supabase, no `STATE`.

---

### 7 · Acceptance

- [ ] `grep -c -- '--rf-d2-danger-soft' styles/interface-polish.css` returns
      `4` (one per palette) and `1` in `styles/shell.css :root`.
- [ ] `--rf-m2-danger`, `--rf-m2-danger-soft`, `--rf-m2-surface-2` each
      resolve (DevTools → Computed) to a non-empty color in all 4 palettes.
- [ ] No bare `--rf-danger*` / `--rf-surface-2` (un-prefixed) names introduced.
- [ ] No existing token value changed — diff is **additive only**.
- **GWT — theme integrity:** Given an element styled
      `color:var(--rf-m2-danger)`, When `[data-palette]` cycles
      midnight→forest→oxblood→alpine, Then the computed color is
      `#7d3458 → #a14b3e → #a05442 → #9c5b3b` (never transparent/black).

### 8 · Reference image

_No render — token-only atom. Verification is the §7 grep + DevTools
Computed-style check. Its visual effect is shown in `refs/M2-stage-action-footer.jpg`
(the danger-hued **Delete**) and `refs/S1-costs-breakdown.jpg`._
