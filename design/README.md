# Routefolk PWA — Direction D, vanilla HTML/CSS/JS

A drop-in vanilla port of the "Almanac × Topographic" design. No build step,
no framework — just `index.html`, `style.css`, `app.js`, `mock.js`, and a
`manifest.webmanifest`.

## Files

```
routefolk-pwa/
├── index.html             — shell + tab bar + palette FAB
├── style.css              — all design tokens + components
├── app.js                 — hash router + screen renderers + palette switcher
├── mock.js                — sample data (replace with your API)
└── manifest.webmanifest   — minimal PWA manifest
```

## Palette system

All four palettes are defined as CSS custom-property sets in `style.css`:

```css
:root,
[data-palette="forest"]   { --bg: …; --primary: …; --accent: …; --contour: url(…); }
[data-palette="midnight"] { … }
[data-palette="oxblood"]  { … }
[data-palette="alpine"]   { … }
```

To change palettes at runtime, set the attribute on `<html>`:

```js
document.documentElement.setAttribute('data-palette', 'midnight');
```

The built-in FAB (bottom-right) lets the user pick — the choice is persisted
in `localStorage` under `rf.palette`.

## Routing

Vanilla hash routes — wire them up to whatever router you're already using:

| Hash                             | Screen          |
|----------------------------------|-----------------|
| `#/trips`                        | Trips list      |
| `#/trips/:id`                    | Trip detail (Stages tab) |
| `#/trips/:id/journal`            | Stage journal   |
| `#/trips/:id/expenses`           | Trip ledger     |
| `#/archive`                      | Archive         |
| `#/account`                      | Account / You   |

## Responsive

Mobile-first. Two breakpoints in `style.css`:

- **≥768px (tablet):** bottom tab bar moves to a vertical left rail (200px).
- **≥1180px (desktop):** content widens, type scales up, archive stat-grid
  becomes 4 columns.

## Replacing the mock data

`mock.js` sets `window.RF_DATA`. Swap that file for an API loader that exposes
the same shape, and the rendering code in `app.js` works unchanged.
