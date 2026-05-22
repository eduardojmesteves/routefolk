# Runtime Dependency Report — Routefolk
Date: 2026-05-22

---

## Runtime Entrypoints (loaded by index.html)

These 7 files are loaded via `<script src="..." type="module">` tags in `index.html`:

| File | Version tag in index.html |
|------|--------------------------|
| `screens/app-renderer.js` | v20260520-desktop-weather-02 |
| `screens/wizards.js` | v20260522-journal-gpx-02 |
| `screens/extra-writes.js` | v20260520-mobile-fields-02 |
| `screens/gpx-panel.js` | v20260522-stable-upload-01 |
| `screens/archive-geo-map.js` | v20260519-local-map-01 |
| `screens/app-actions.js` | v20260520-wizard-loop-04 |
| `app.js` | v20260520-desktop-weather-02 |

---

## Runtime Reachable Files

Files imported (directly or transitively) by the 7 entrypoints above.

### From `app.js`
- `lib/auth.js` — direct import
- `state/app-state.js` — direct import
- `state/session-reset.js` — direct import
- `state/data-loaders.js` — direct import
- `state/session-controller.js` — direct import
- `state/ui-state.js` — direct import
- `components/toast.js` — direct import

### From `screens/app-renderer.js`
- `state/app-state.js` — direct import (already listed)
- `screens/render/desktop.js` — direct import
- `screens/render/mobile.js` — direct import
- `screens/render/shared.js` — direct import

### From `screens/wizards.js`
- `state/app-state.js` — direct import
- `utils/dom.js` — direct import
- `lib/trips.js` — direct import
- `lib/trip-members.js` — direct import
- `lib/stages.js` — direct import
- `lib/journal.js` — direct import
- `lib/expenses.js` — direct import
- `lib/gpx.js` — direct import
- `lib/items.js` — direct import
- `constants/app-constants.js` — direct import
- `state/ui-state.js` — direct import (already listed)

### From `screens/extra-writes.js`
- `state/app-state.js` — direct import
- `utils/dom.js` — direct import (already listed)
- `lib/expenses.js` — direct import (already listed)
- `lib/items.js` — direct import (already listed)
- `constants/app-constants.js` — direct import (already listed)

### From `screens/gpx-panel.js`
- `state/app-state.js` — direct import
- `utils/dom.js` — direct import
- `utils/format.js` — direct import
- `lib/gpx.js` — direct import

### From `screens/archive-geo-map.js`
- `state/app-state.js` — direct import
- *(no other ES module imports; Leaflet consumed via `window.L` at runtime)*

### From `screens/app-actions.js`
- `lib/stages.js` — direct import
- `lib/journal.js` — direct import
- `lib/trips.js` — direct import
- `lib/items.js` — direct import
- `state/app-state.js` — direct import
- `state/ui-state.js` — direct import
- `screens/render/shared.js` — direct import (already listed)

### Transitive — `state/data-loaders.js`
- `lib/trips.js` — direct import
- `lib/expenses.js` — direct import
- `lib/stages.js` — direct import
- `lib/weather.js` — direct import
- `lib/journal.js` — direct import
- `lib/profiles.js` — direct import
- `lib/trip-members.js` — direct import
- `lib/items.js` — direct import
- `lib/gpx.js` — direct import
- `state/app-state.js` — direct import
- `components/toast.js` — direct import
- `utils/trip-detail.js` — direct import

### Transitive — `state/session-controller.js`
- `lib/auth.js` — direct import
- `lib/profiles.js` — direct import
- `lib/meta.js` — direct import
- `lib/access.js` — direct import
- `state/app-state.js` — direct import
- `components/toast.js` — direct import

### Transitive — `screens/render/desktop.js`
- `state/app-state.js` — direct import
- `utils/dom.js` — direct import
- `utils/datetime.js` — direct import
- `constants/app-constants.js` — direct import
- `screens/render/shared.js` — direct import

### Transitive — `screens/render/mobile.js`
- `state/app-state.js` — direct import
- `utils/dom.js` — direct import
- `utils/datetime.js` — direct import
- `screens/render/shared.js` — direct import

### Transitive — `screens/render/shared.js`
- `state/app-state.js` — direct import
- `utils/dom.js` — direct import
- `utils/datetime.js` — direct import
- `utils/format.js` — direct import
- `constants/app-constants.js` — direct import
- `utils/user.js` — direct import

### Transitive — `lib/auth.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/trips.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/stages.js`
- `lib/supabase.js` — direct import
- `lib/geocoding.js` — direct import

### Transitive — `lib/journal.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/expenses.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/items.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/gpx.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/profiles.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/meta.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/access.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/weather.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/geocoding.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/trip-members.js`
- `lib/supabase.js` — direct import

### Transitive — `lib/supabase.js`
- `lib/config.js` — direct import
- *(external CDN: `https://esm.sh/@supabase/supabase-js@2`)*

### Transitive — `utils/trip-detail.js`
- `state/app-state.js` — direct import
- `utils/datetime.js` — direct import (already listed)
- `utils/format.js` — direct import (already listed)
- `components/stats.js` — direct import (**NOTE:** `components/stats.js` is in SHELL_ASSETS and is reachable via this path)

### Transitive — `utils/state-selectors.js`
- `state/app-state.js` — direct import

### Full deduplicated list of RUNTIME_REACHABLE files

- `app.js` *(also an entrypoint)*
- `constants/app-constants.js`
- `lib/access.js`
- `lib/auth.js`
- `lib/config.js`
- `lib/expenses.js`
- `lib/geocoding.js`
- `lib/gpx.js`
- `lib/items.js`
- `lib/journal.js`
- `lib/meta.js`
- `lib/profiles.js`
- `lib/stages.js`
- `lib/supabase.js`
- `lib/trip-members.js`
- `lib/trips.js`
- `lib/weather.js`
- `screens/render/desktop.js`
- `screens/render/mobile.js`
- `screens/render/shared.js`
- `state/app-state.js`
- `state/data-loaders.js`
- `state/session-controller.js`
- `state/session-reset.js`
- `state/ui-state.js`
- `components/stats.js` *(imported by `utils/trip-detail.js`)*
- `components/toast.js`
- `utils/datetime.js`
- `utils/dom.js`
- `utils/format.js`
- `utils/trip-detail.js`
- `utils/user.js`

**Not reachable from entrypoints (despite being in SHELL_ASSETS):**
- `utils/state-selectors.js` — imported only by legacy component stack (see Legacy Candidates)
- `utils/url.js` — imported only by legacy component/screen stack
- `utils/trip-stats.js` — imported only by legacy component stack
- `utils/write-guards.js` — imported only by `handlers/write-handlers.js` (legacy)
- `components/stats.js` — **IS reachable** via `utils/trip-detail.js` → `components/stats.js`

---

## Service Worker SHELL_ASSETS (additional, not entrypoints)

Assets listed in `sw.js` SHELL_ASSETS that are NOT direct `index.html` entrypoints. Includes files that ARE runtime reachable and files that are NOT.

**CSS / HTML / manifest / icons (SW_ONLY — not JS modules):**
- `./` (root, resolves to index.html)
- `./index.html`
- `./manifest.json`
- `./icons/icon-192.png`
- `./icons/icon-512.png`
- `./style.css`
- `./style-fidelity.css`
- `./styles/shell.css`
- `./styles/app-ui.css`
- `./styles/wizards.css`
- `./styles/interface-polish.css`
- `./styles/renderer-integration.css`
- `./styles/packing-list.css`
- `./styles/production-overrides.css`
- `./vendor/leaflet/leaflet.css`
- `./vendor/leaflet/leaflet.js`

**JS modules in SHELL_ASSETS that ARE runtime reachable** (correct to cache):
- `./constants/app-constants.js`
- `./state/app-state.js`
- `./state/ui-state.js`
- `./state/session-reset.js`
- `./state/session-controller.js`
- `./state/data-loaders.js`
- `./utils/dom.js`
- `./utils/url.js` — *(in SHELL_ASSETS but NOT reachable from current entrypoints; see Legacy Candidates)*
- `./utils/datetime.js`
- `./utils/format.js`
- `./utils/user.js`
- `./utils/trip-detail.js`
- `./utils/trip-stats.js` — *(in SHELL_ASSETS but NOT reachable from current entrypoints; see Legacy Candidates)*
- `./utils/state-selectors.js` — *(in SHELL_ASSETS but NOT reachable from current entrypoints; see Legacy Candidates)*
- `./utils/write-guards.js` — *(in SHELL_ASSETS but NOT reachable from current entrypoints; see Legacy Candidates)*
- `./components/toast.js`
- `./components/modal.js` — *(in SHELL_ASSETS but NOT reachable from current entrypoints; see Legacy Candidates)*
- `./components/stage-form.js` — *(see Legacy Candidates)*
- `./components/journal-form.js` — *(see Legacy Candidates)*
- `./components/expense-form.js` — *(see Legacy Candidates)*
- `./components/gpx-form.js` — *(see Legacy Candidates)*
- `./components/trip-form.js` — *(see Legacy Candidates)*
- `./components/feedback.js` — *(see Legacy Candidates)*
- `./components/access-schema-cards.js` — *(see Legacy Candidates)*
- `./components/trip-not-found.js` — *(see Legacy Candidates)*
- `./components/app-shell.js` — *(see Legacy Candidates)*
- `./components/audit.js` — *(see Legacy Candidates)*
- `./components/trip-card.js` — *(see Legacy Candidates)*
- `./components/stats.js` — IS reachable via `utils/trip-detail.js`
- `./components/forms.js` — *(see Legacy Candidates)*
- `./components/action-modals.js` — *(see Legacy Candidates)*
- `./components/content-events.js` — *(see Legacy Candidates)*
- `./screens/trips-screen.js` — *(see Legacy Candidates)*
- `./screens/account-screen.js` — *(see Legacy Candidates)*
- `./screens/archive-screen.js` — *(see Legacy Candidates)*
- `./screens/summary-screen.js` — *(see Legacy Candidates)*
- `./screens/trip-detail-screen.js` — *(see Legacy Candidates)*
- `./screens/trip-detail-stages.js` — *(see Legacy Candidates)*
- `./screens/trip-detail-expenses.js` — *(see Legacy Candidates)*
- `./screens/packing-screen.js` — *(see Legacy Candidates)*
- `./lib/config.js`
- `./lib/supabase.js`
- `./lib/auth.js`
- `./lib/meta.js`
- `./lib/access.js`
- `./lib/trips.js`
- `./lib/stages.js`
- `./lib/geocoding.js`
- `./lib/weather.js`
- `./lib/journal.js`
- `./lib/profiles.js`
- `./lib/expenses.js`
- `./lib/items.js`
- `./lib/gpx.js`

**Note on version mismatch:** `sw.js` caches `./screens/wizards.js?v=20260520-expense-stage-06` but `index.html` loads `./screens/wizards.js?v=20260522-journal-gpx-02`. These version strings differ — the service worker is stale for this file.

---

## Legacy Candidates

Files on disk that are NOT reachable from any `index.html` entrypoint (not directly imported, not transitively imported). Most are in SHELL_ASSETS but unused by the current entrypoint graph.

### Old component/form/modal stack (legacy write pipeline)

These components implement a pre-v2 modal-based write workflow. The v2 write pipeline lives entirely in `screens/wizards.js` and `screens/extra-writes.js`. Nothing in the current entrypoint graph imports these.

| File | Reason |
|------|--------|
| `components/modal.js` | In SHELL_ASSETS. No current entrypoint imports it. Used only by `handlers/write-handlers.js` and `components/action-modals.js` (both legacy). |
| `components/stage-form.js` | In SHELL_ASSETS. Only imported by `components/action-modals.js` (legacy). |
| `components/journal-form.js` | In SHELL_ASSETS. Only imported by `components/action-modals.js` and `handlers/write-handlers.js` (both legacy). |
| `components/expense-form.js` | In SHELL_ASSETS. Only imported by `components/action-modals.js` and `handlers/write-handlers.js` (both legacy). |
| `components/gpx-form.js` | In SHELL_ASSETS. Only imported by `components/action-modals.js` (legacy). |
| `components/trip-form.js` | In SHELL_ASSETS. Only imported by `components/action-modals.js` and `handlers/write-handlers.js` (both legacy). |
| `components/forms.js` | In SHELL_ASSETS. No import found anywhere in the codebase. Orphan. |
| `components/action-modals.js` | In SHELL_ASSETS. No current entrypoint imports it. Entire old modal write layer. |
| `handlers/write-handlers.js` | In SHELL_ASSETS. No current entrypoint imports it. Old event-delegation write handler. |

### Old component helpers (rendering support for old screen stack)

| File | Reason |
|------|--------|
| `components/feedback.js` | In SHELL_ASSETS. Only imported by legacy screens (`archive-screen.js`, `account-screen.js`). Not reachable from current entrypoints. |
| `components/access-schema-cards.js` | In SHELL_ASSETS. No import found anywhere in entrypoint-reachable code. Orphan. |
| `components/trip-not-found.js` | In SHELL_ASSETS. No import found anywhere in entrypoint-reachable code. Orphan. |
| `components/app-shell.js` | In SHELL_ASSETS. No current entrypoint imports it. Old shell component. |
| `components/audit.js` | In SHELL_ASSETS. No import found anywhere — complete orphan. |
| `components/trip-card.js` | In SHELL_ASSETS. Only imported by legacy screen files (trips-screen, archive-screen, trip-detail-screen, summary-screen, trip-form, expense-form) which are themselves unreachable. |
| `components/content-events.js` | In SHELL_ASSETS. No current entrypoint imports it. Imports legacy screens (`trips-screen`, `archive-screen`, `trip-detail-expenses`). Entire old event-binding layer. |

### Old pre-v2 screen renderers

All of these are in SHELL_ASSETS but are NOT imported by any current entrypoint. The current rendering is done by `screens/render/desktop.js`, `screens/render/mobile.js`, and `screens/render/shared.js`.

| File | Reason |
|------|--------|
| `screens/trips-screen.js` | In SHELL_ASSETS. Only imported by `components/content-events.js` (legacy). Not reachable from entrypoints. |
| `screens/account-screen.js` | In SHELL_ASSETS. No import found anywhere in entrypoint-reachable code. Orphan. |
| `screens/archive-screen.js` | In SHELL_ASSETS. Only imported by `components/content-events.js` (legacy). Not reachable from entrypoints. |
| `screens/summary-screen.js` | In SHELL_ASSETS. No import found anywhere in entrypoint-reachable code. Orphan. |
| `screens/trip-detail-screen.js` | In SHELL_ASSETS. No import found anywhere in entrypoint-reachable code. Orphan. |
| `screens/trip-detail-stages.js` | In SHELL_ASSETS. No import found anywhere in entrypoint-reachable code. Orphan. |
| `screens/trip-detail-expenses.js` | In SHELL_ASSETS. Only imported by `components/content-events.js` (legacy). Not reachable from entrypoints. |
| `screens/packing-screen.js` | In SHELL_ASSETS. No import found anywhere in entrypoint-reachable code. Orphan. |

### screens/archive-map.js — special case

| File | Reason |
|------|--------|
| `screens/archive-map.js` | NOT in SHELL_ASSETS. NOT in index.html. NOT imported anywhere. This is the old SVG+Leaflet archive map renderer — superseded by `screens/archive-geo-map.js` (which is a minified, self-contained replacement loaded directly by index.html). Complete orphan. Strong legacy candidate. |

### Utility files in SHELL_ASSETS but not reachable from entrypoints

| File | Reason |
|------|--------|
| `utils/url.js` | In SHELL_ASSETS. Only imported by legacy screens (`archive-screen.js`, `trip-detail-stages.js`). Not reachable from current entrypoints. |
| `utils/trip-stats.js` | In SHELL_ASSETS. No import found in any entrypoint-reachable file. (`components/stats.js` imports it — but `stats.js` is only reached via `utils/trip-detail.js`. **See note below.**) |
| `utils/state-selectors.js` | In SHELL_ASSETS. Only imported by `handlers/write-handlers.js` (legacy) and `components/content-events.js` (legacy) and `components/action-modals.js` (legacy). Not reachable from current entrypoints. |
| `utils/write-guards.js` | In SHELL_ASSETS. Only imported by `handlers/write-handlers.js` (legacy). Not reachable from current entrypoints. |

**Note on `utils/trip-stats.js`:** `components/stats.js` IS reachable (via `utils/trip-detail.js`). Check whether `components/stats.js` imports `utils/trip-stats.js`:

```
utils/trip-detail.js → components/stats.js → utils/trip-stats.js  (if imported)
```

Verified: `utils/trip-stats.js` imports `components/stats.js` (for `statItemHtml`), NOT the other way around. `components/stats.js` does NOT import `utils/trip-stats.js`. So `utils/trip-stats.js` remains unreachable from any entrypoint.

---

## Vendor Files

| File | Classification |
|------|---------------|
| `vendor/leaflet/leaflet.css` | `VENDOR` — loaded by index.html `<link>`, cached in SHELL_ASSETS |
| `vendor/leaflet/leaflet.js` | `VENDOR` — loaded by index.html `<script defer>`, cached in SHELL_ASSETS; consumed at runtime as `window.L` by `screens/archive-geo-map.js` |

---

## Static Assets

| File | Classification |
|------|---------------|
| `index.html` | `STATIC_ASSET` — app shell |
| `manifest.json` | `STATIC_ASSET` — PWA manifest |
| `style.css` | `STATIC_ASSET` — main stylesheet |
| `style-fidelity.css` | `STATIC_ASSET` — design fidelity layer |
| `styles/app-ui.css` | `STATIC_ASSET` |
| `styles/interface-polish.css` | `STATIC_ASSET` |
| `styles/packing-list.css` | `STATIC_ASSET` |
| `styles/production-overrides.css` | `STATIC_ASSET` |
| `styles/renderer-integration.css` | `STATIC_ASSET` |
| `styles/shell.css` | `STATIC_ASSET` |
| `styles/wizards.css` | `STATIC_ASSET` |
| `_headers` | `STATIC_ASSET` — Cloudflare Pages HTTP headers |
| `README.md` | `STATIC_ASSET` — project documentation |
| `LICENSE` | `STATIC_ASSET` |
| `icons/icon-192.png` | `STATIC_ASSET` — PWA icon |
| `icons/icon-512.png` | `STATIC_ASSET` — PWA icon |
| `icons/.DS_Store` | `STATIC_ASSET` — macOS metadata (should be gitignored) |
| `migrations/.DS_Store` | `STATIC_ASSET` — macOS metadata (should be gitignored) |

---

## Database / Migrations

| File | Classification |
|------|---------------|
| `migrations/001_custom_route_url.sql` | `MIGRATION` |
| `migrations/002_journal_links.sql` | `MIGRATION` |
| `migrations/003_profiles_trip_visibility.sql` | `MIGRATION` |
| `migrations/004_visibility_rls_hardening.sql` | `MIGRATION` |
| `migrations/005_expenses_phase2.sql` | `MIGRATION` |
| `migrations/006_expense_stage_assignment.sql` | `MIGRATION` |
| `migrations/007_schema_safety_pack.sql` | `MIGRATION` |
| `migrations/008_atomic_stage_reorder.sql` | `MIGRATION` |
| `migrations/009_stage_gpx_upload.sql` | `MIGRATION` |
| `migrations/010_app_membership_hardening.sql` | `MIGRATION` |
| `migrations/011_app_access_state.sql` | `MIGRATION` |
| `migrations/012_date_consistency_triggers.sql` | `MIGRATION` |
| `migrations/013_gpx_cached_geometry.sql` | `MIGRATION` |
| `migrations/014_items.sql` | `MIGRATION` |
| `migrations/015_trip_level_visibility.sql` | `MIGRATION` |
| `migrations/schema.sql` | `MIGRATION` — full schema snapshot |
| `schema.sql` | `MIGRATION` — root-level schema copy (possible duplicate of migrations/schema.sql) |

---

## Test Files

| File | Classification |
|------|---------------|
| `tests/e2e/smoke.spec.js` | `TEST` — Playwright e2e smoke test |
| `tests/e2e/test-results/.last-run.json` | `TEST` — Playwright last run artifact |
| `tests/static/service-worker-assets.test.js` | `TEST` — Vitest static asset test (verifies SHELL_ASSETS files exist on disk) |
| `tests/unit/datetime.test.js` | `TEST` — Vitest unit test for `utils/datetime.js` |
| `tests/unit/format.test.js` | `TEST` — Vitest unit test for `utils/format.js` |
| `tests/unit/gpx.test.js` | `TEST` — Vitest unit test for `lib/gpx.js` |
| `tests/unit/ui-state.test.js` | `TEST` — Vitest unit test for `state/ui-state.js` |
| `tests/unit/validators.test.js` | `TEST` — Vitest unit test for URL validators in `lib/stages.js` / `lib/journal.js` |
| `tests/sql/015_trip_level_visibility_rls.test.sql` | `TEST` — SQL RLS policy test for migration 015 |
| `playwright.config.js` | `TOOLING` — Playwright config (also see Tooling below) |

---

## Tooling

| File | Classification |
|------|---------------|
| `package.json` | `TOOLING` |
| `package-lock.json` | `TOOLING` |
| `vitest.config.js` | `TOOLING` |
| `playwright.config.js` | `TOOLING` |
| `.eslintrc.cjs` | `TOOLING` |
| `.prettierrc` | `TOOLING` |
| `.gitignore` | `TOOLING` |
| `wrangler.jsonc` | `TOOLING` — Cloudflare Workers / Pages config |
| `tools/backfill-gpx-geometry.mjs` | `TOOLING` — local-only maintenance script; runs with Node, not the browser; not imported by any app code |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | `TOOLING` — GitHub issue template |
| `.github/ISSUE_TEMPLATE/config.yml` | `TOOLING` — GitHub issue template config |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | `TOOLING` — GitHub issue template |

---

## Unknown

No files were classified as truly unknown. All files have been identified.

---

## Summary

| Category | Count |
|----------|-------|
| RUNTIME_ENTRYPOINT | 7 |
| RUNTIME_REACHABLE | 32 |
| VENDOR | 2 |
| SW_ONLY (CSS/HTML/icons/manifest) | 16 |
| LEGACY_CANDIDATE (in SHELL_ASSETS, not entrypoint-reachable) | 24 |
| LEGACY_CANDIDATE (on disk, not in SHELL_ASSETS, not reachable) | 1 (`screens/archive-map.js`) |
| STATIC_ASSET | 18 |
| MIGRATION | 17 |
| TEST | 9 |
| TOOLING | 13 |
| **Total files classified** | **139** |

**Total files classified: 139**
**Runtime reachable: 32**
**Legacy candidates: 25**

---

## Appendix — Legacy Candidates Quick Reference (for Task 1.2)

These 25 files are confirmed legacy candidates. They are either:
- In SHELL_ASSETS but NOT importable from any current `index.html` entrypoint, OR
- On disk, not in SHELL_ASSETS, and not reachable from any entrypoint.

### Old write pipeline (9 files)
1. `components/modal.js`
2. `components/stage-form.js`
3. `components/journal-form.js`
4. `components/expense-form.js`
5. `components/gpx-form.js`
6. `components/trip-form.js`
7. `components/forms.js`
8. `components/action-modals.js`
9. `handlers/write-handlers.js`

### Old rendering / component stack (8 files)
10. `components/feedback.js`
11. `components/access-schema-cards.js`
12. `components/trip-not-found.js`
13. `components/app-shell.js`
14. `components/audit.js`
15. `components/trip-card.js`
16. `components/content-events.js`

### Old pre-v2 screen modules (8 files)
17. `screens/trips-screen.js`
18. `screens/account-screen.js`
19. `screens/archive-screen.js`
20. `screens/summary-screen.js`
21. `screens/trip-detail-screen.js`
22. `screens/trip-detail-stages.js`
23. `screens/trip-detail-expenses.js`
24. `screens/packing-screen.js`

### Superseded archive map (1 file)
25. `screens/archive-map.js` *(NOT in SHELL_ASSETS, NOT in index.html)*

### Unreachable utility files in SHELL_ASSETS (4 files — may be deletable or may be needed after refactor)
26. `utils/url.js` — only used by legacy screens
27. `utils/trip-stats.js` — only used by legacy component chain
28. `utils/state-selectors.js` — only used by legacy write/event stack
29. `utils/write-guards.js` — only used by `handlers/write-handlers.js` (legacy)

> **Note:** The 4 utility files above (`utils/url.js`, `utils/trip-stats.js`, `utils/state-selectors.js`, `utils/write-guards.js`) contain potentially useful logic. Before deleting them, confirm whether any refactored code will need them. They are safe to remove from SHELL_ASSETS immediately (Task 2.1) since they add cache cost without being loaded, but the source files themselves may be useful to keep as references during the refactor (Tasks 3–8).
