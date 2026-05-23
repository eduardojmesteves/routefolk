# routefolk · agent guide

Short rules a coding agent needs to keep this codebase consistent.
Add to this file only when a rule has been broken at least once.

## Renderer-first write actions

Every user-facing write button — trip Edit/Delete, stage Edit/Delete/
Reorder, journal-entry Edit/Delete, and the cost `+ Log expense` CTA —
is **emitted by a renderer module** under `screens/render/`. The button
carries its own `data-action="rf-v2-*"` and any `data-*-id` attributes,
and respects archive/offline state via the helpers in
`utils/write-guards.js`:

- `isArchivedTrip(trip)` — return `''` (omit the button) when true.
- `writeDisabledAttr()` — append to the button when the user is offline.

The wizard host in `screens/wizards/wizard-host.js` does **not** inject
write buttons via DOM mutation. Its only responsibility is the wizard
overlay (`.rf-v2-wizard-host`) and dispatching the two cancel actions.

If you find yourself reaching for `document.querySelector(...).appendChild(...)`
to add a button: stop and put it in the renderer instead.

### Why

The previous inject pattern had three bugs by design:

1. Selectors went stale silently. `injectEntryActions` searched for
   `.rf-m2-entry`, which the mobile renderer never emitted (it uses
   `.rf-clean-note`). The affordance was effectively desktop-only with
   no compile-time or runtime hint that mobile was missing it.
2. Entry identity used `textContent` matching, which is fragile for
   duplicate titles.
3. `removeExisting()` ran every render cycle and would strip the
   renderer's output if it happened to share a class with the inject.

Renderer-first eliminates all three.

## Atomic commits

Match the cadence of the weather PR (commits `9465c3d` → `a5e7b47`):
**one file, one logical change, one commit.** No drive-by formatting,
no JSDoc rewrites, no copy changes outside the stated scope.

Use `git add <path>` by name. Never `git add .` or `git add -A` — the
working tree can carry untracked files (`.eslintrc.cjs`, `.prettierrc`,
local `.claude/` overrides) that must not be committed.

## Visual ground truth

When the design conflicts with implementation, the design wins. The
canonical design source is the Mobile_redesign_v3 HTML mockup the
designer shipped — preserved at
`~/Desktop/routefolk-v3-handoff/design-package/routefolk/project/`
on the maintainer's machine (`Mobile_redesign_v3/index.html` for the
v3 mobile scenes; `Desktop_redesign_v2/` for desktop reference since
the v3 round did not redo desktop hero or section head).

## PWA cache

Whenever you change anything in `styles/` or any file listed under
`SHELL_ASSETS` in `sw.js`, bump the `CACHE` constant and the version
query string on the changed file. Skipping this leaves users on stale
markup until a hard refresh.
