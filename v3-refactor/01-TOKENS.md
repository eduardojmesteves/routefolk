# 01 · Design tokens

Single source of truth for color, type, and the structural primitives the
v3 atoms consume. **Atoms reference tokens only — never raw hex** — so the
four `[data-palette]` themes keep working.

---

## 1 · Where tokens live

| Layer | File | Role |
|-------|------|------|
| Base `:root` defaults | `styles/shell.css` | Defines every `--rf-d2-*`; `--rf-m2-*` **alias** the `--rf-d2-*` values. |
| Theme overrides | `styles/interface-polish.css` | `[data-palette="midnight|forest|oxblood|alpine"]` re-declares the palette. `midnight` = default and matches the v3 mockups. |
| Runtime switch | `screens/render/shared.js` | `setPalette(key)` sets `document.documentElement.dataset.palette` + persists to `localStorage['rf.palette']`. |

**Aliasing model:** mobile tokens point at desktop tokens
(`--rf-m2-primary: var(--rf-d2-primary)`), so one palette drives both
surfaces. When you add a token (F0), add the `--rf-d2-*` value **and** the
`--rf-m2-*` alias, in `:root` *and* every `[data-palette]` block.

---

## 2 · Color — default palette `midnight`

| Token (desktop / mobile alias) | Value | Used for |
|--------------------------------|-------|----------|
| `--rf-d2-bg` / `--rf-m2-bg` | `#e7e4d8` | App background (warm cream) |
| `--rf-d2-surface` / `--rf-m2-surface` | `#f3f0e4` | Cards, sheets |
| `--rf-d2-surface-2` / `--rf-m2-surface-2` ⚠️ | `#e1ddd0` | Hover/elevated fill (⚠️ m2 alias **missing — F0**) |
| `--rf-d2-ink` / `--rf-m2-ink` | `#171a26` | Primary text |
| `--rf-d2-ink-2` / `--rf-m2-ink-2` | `#3b405a` | Secondary text |
| `--rf-d2-muted` / `--rf-m2-muted` | `#787a8a` | Tertiary / labels |
| `--rf-d2-rule` / `--rf-m2-rule` | `rgba(23,26,38,.10)` | Hairline borders |
| `--rf-d2-rule-2` / `--rf-m2-rule-2` | `rgba(23,26,38,.20)` | Stronger borders |
| `--rf-d2-primary` / `--rf-m2-primary` | `#26345e` | Brand indigo · nav accent |
| `--rf-d2-primary-soft` / `--rf-m2-primary-soft` | `#ccd3e4` | Primary chip fills |
| `--rf-d2-accent` / `--rf-m2-accent` | `#b85a2e` | Rust · stage numerals |
| `--rf-d2-accent-soft` / `--rf-m2-accent-soft` | `#edcdb8` | Accent fills · payer bar |
| `--rf-d2-danger` / `--rf-m2-danger` ⚠️ | `#7d3458` | Delete/destructive (⚠️ m2 alias **missing — F0**) |
| `--rf-d2-danger-soft` / `--rf-m2-danger-soft` ⚠️ | `rgba(125,52,88,.16)` | Delete pill bg (⚠️ **both missing — F0**) |

### Per-palette source values (for F0 derivations)

| Palette | primary | accent | danger | → danger-soft (add) |
|---------|---------|--------|--------|----------------------|
| midnight | `#26345e` | `#b85a2e` | `#7d3458` | `rgba(125,52,88,.16)` |
| forest | `#355d3f` | `#b3823a` | `#a14b3e` | `rgba(161,75,62,.16)` |
| oxblood | `#566970` | `#8a4554` | `#a05442` | `rgba(160,84,66,.16)` |
| alpine | `#2c3133` | `#c69842` | `#9c5b3b` | `rgba(156,91,59,.16)` |

> `surface-2` per palette already exists on `--rf-d2-*`: midnight `#e1ddd0`,
> forest `#ede5cf`, oxblood `#e4dfd5`, alpine `#dedacf`. F0 only adds the
> **`--rf-m2-surface-2` alias**.

---

## 3 · Type

| Token | Stack | Role |
|-------|-------|------|
| `--rf-*-font-serif` | `'Newsreader', Georgia, serif` | Titles, stage names, breakdown rows. Italic = emphasis ("to", labels). |
| `--rf-*-font-ui` | `'Inter Tight', -apple-system, system-ui, sans-serif` | Buttons, nav, small UI. |
| `--rf-*-font-mono` | `'IBM Plex Mono', ui-monospace, monospace` | Kickers, meta, uppercase tracked labels. |

**Editorial type rules observed in the codebase** (apply in atoms):
- Kicker / label = mono, `10px`, `letter-spacing:.12–.2em`, `uppercase`,
  color `--rf-*-primary` or `--rf-*-muted`.
- Stage / entry title = serif, `13.5px` (mobile card) → `20px` (desktop row).
- "to" connector, place lines, breakdown values = serif italic.
- Button labels = ui, `11.5–13px`, `font-weight:600–800`.

---

## 4 · Structural primitives (measured from production CSS + v3 patches)

| Token (doc-only — use literals in CSS) | Value | Notes |
|---|---|---|
| radius · card | `6px` (mobile `.rf-clean-*`) · `4px` (desktop `.rf-d2-*`) | Match the surface's existing family. |
| radius · pill | `999px` | All chips/pills/icon-buttons. |
| border · hairline | `1px solid var(--rf-*-rule)` | Card edges, footers. |
| border · dotted divider | `1px dotted var(--rf-*-rule)` | Footer button separators, entry rows. |
| footer button row height | `~38px` (`padding:9px 0`) | M2 footer. ≥44px tap target met by full card. |
| icon-button | `26×26`, radius `999px` | M4/D2 `✎ ✕`. |
| bar (breakdown) | height `4px` (mobile) / `3px` (desktop), radius `999px` | S1. Fill = `--rf-*-primary` (category) / `--rf-*-accent` (payer). |
| disabled | `opacity:.45; cursor:not-allowed` (pills) · token swap to `--rf-*-rule-2` (footer/icons) | See F1 for the trigger rule. |

---

## 5 · Hard rules

1. **No literal colors in atom CSS.** Only `var(--rf-*-…)`. A grep for
   `#[0-9a-f]{3,6}` in new CSS must return nothing (except inside token
   *definitions* in F0).
2. **Pick the prefix per surface:** `--rf-m2-*` under `.rf-clean-*` /
   `.rf-m2-*` markup; `--rf-d2-*` under `.rf-d2-*` markup. A shared atom
   takes `prefix` and interpolates the class stem, but **CSS is authored
   once per surface** (mobile rules + desktop rules), each using its own
   token namespace.
3. **Theme-test every atom** in all four palettes (toggle
   `data-palette` on `<html>`). Danger and accent hues shift per theme —
   that is the point of F0.
