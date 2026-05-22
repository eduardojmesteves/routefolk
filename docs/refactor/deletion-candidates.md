# Deletion Candidates — Routefolk
Date: 2026-05-22

Decision key:
- `REMOVE` — confirmed orphan, not in SHELL_ASSETS, safe to delete now
- `REMOVE_AFTER_SW_CLEANUP` — orphan but still in SHELL_ASSETS; remove from SHELL_ASSETS first (Phase 2, Task 2.1)
- `KEEP` — still used or needed by current runtime
- `KEEP_AS_REFERENCE` — not currently used but contains logic that should be read before / during later refactor tasks
- `UNKNOWN` — not yet safe to decide

---

## Old Write Pipeline (9 files)

---

## handlers/write-handlers.js
- **File:** `handlers/write-handlers.js`
- **Reason:** Pre-v2 write handler factory. The v2 write pipeline lives entirely in `screens/wizards.js` and `screens/extra-writes.js`. No current entrypoint imports this file.
- **Currently imported by:** nothing — confirmed orphan (only imported by the now-dead legacy stack)
- **Currently cached by service worker:** yes (`./handlers/write-handlers.js` in SHELL_ASSETS)
- **Replacement:** `screens/wizards.js` + `screens/extra-writes.js` (v2 write pipeline)
- **Tests protecting removal:** none yet — the v2 wizard write paths have no dedicated unit tests
- **Valuable logic to migrate before deletion:** The GPX upload pre-validation logic (file extension, size ≤ 8 MB, non-empty check in `handleUploadStageGpx`) and the `assertSelectedVisibilityHasMembers` guard are both worth verifying are present in the v2 wizard equivalents before deleting. The `friendlyError` / `friendlyGpxError` helpers live in `utils/write-guards.js` (see below) and are preserved there.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/modal.js
- **File:** `components/modal.js`
- **Reason:** Old modal helper used exclusively by the pre-v2 write pipeline (`handlers/write-handlers.js`, `components/action-modals.js`). No current entrypoint imports it.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./components/modal.js` in SHELL_ASSETS)
- **Replacement:** v2 wizard-based write flow renders inline — no global modal helper is used
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `showModal` / `closeModal` are generic and simple; no novel logic beyond what the v2 stack already supersedes.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/stage-form.js
- **File:** `components/stage-form.js`
- **Reason:** Pre-v2 stage form renderer and reader. Only imported by `components/action-modals.js` (legacy). Not reachable from any current entrypoint.
- **Currently imported by:** nothing — confirmed orphan via legacy chain only
- **Currently cached by service worker:** yes (`./components/stage-form.js` in SHELL_ASSETS)
- **Replacement:** Stage wizard in `screens/wizards.js`
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `validateStageFormAgainstTrip` contains date-bounds validation (planned date must be within trip start/end). Confirm the v2 stage wizard enforces the same constraint before deleting.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/journal-form.js
- **File:** `components/journal-form.js`
- **Reason:** Pre-v2 journal entry form. Only imported by `components/action-modals.js` and `handlers/write-handlers.js` (both legacy). Not reachable from any current entrypoint.
- **Currently imported by:** nothing — confirmed orphan via legacy chain only
- **Currently cached by service worker:** yes (`./components/journal-form.js` in SHELL_ASSETS)
- **Replacement:** Journal entry wizard in `screens/wizards.js`
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `bindEntryTimeToggle` (UX: shows/hides time input based on checkbox state) and the timestamp construction logic in `readEntryForm` (`datetimeLocalToIso` + stage planned date). Confirm v2 journal wizard handles these edge cases.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/expense-form.js
- **File:** `components/expense-form.js`
- **Reason:** Pre-v2 expense form. Only imported by `components/action-modals.js` and `handlers/write-handlers.js` (both legacy).
- **Currently imported by:** nothing — confirmed orphan via legacy chain only
- **Currently cached by service worker:** yes (`./components/expense-form.js` in SHELL_ASSETS)
- **Replacement:** Expense wizard in `screens/wizards.js`
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `payerProfilesForTrip` — nuanced payer resolution based on trip visibility (`private` → only self, `selected` → members with access, `group` → all profiles). Contains `uniqueProfiles` dedup logic. Confirm v2 expense wizard handles payer selection correctly for all three visibility modes. Also `validateExpenseForTrip` date-bounds and stage-ownership checks.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/gpx-form.js
- **File:** `components/gpx-form.js`
- **Reason:** Pre-v2 GPX upload form renderer. Only imported by `components/action-modals.js` (legacy).
- **Currently imported by:** nothing — confirmed orphan via legacy chain only
- **Currently cached by service worker:** yes (`./components/gpx-form.js` in SHELL_ASSETS)
- **Replacement:** GPX panel / wizard in `screens/gpx-panel.js` and `screens/wizards.js`
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** The form HTML is trivial. Note the file references `esc(stageRouteLabel(stage))` but `esc` and `stageRouteLabel` are NOT imported in this file — this is a pre-existing bug in the legacy code confirming it was already broken before v2.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/trip-form.js
- **File:** `components/trip-form.js`
- **Reason:** Pre-v2 trip form. Only imported by `components/action-modals.js` and `handlers/write-handlers.js` (both legacy).
- **Currently imported by:** nothing — confirmed orphan via legacy chain only
- **Currently cached by service worker:** yes (`./components/trip-form.js` in SHELL_ASSETS)
- **Replacement:** Trip create/edit wizard in `screens/wizards.js`
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** Member checkbox rendering (`selectedMembersHtml`) and the live visibility toggle (`change` listener on `tfVisibility` at module level — this fires a side effect on import). Confirm v2 trip wizard handles member selection for `selected` visibility. The module-level `document.addEventListener` is a hidden side effect and was likely causing confusion; it is gone in v2.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/action-modals.js
- **File:** `components/action-modals.js`
- **Reason:** Modal orchestration layer for the pre-v2 write pipeline. No current entrypoint imports it.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./components/action-modals.js` in SHELL_ASSETS)
- **Replacement:** `screens/wizards.js` and `screens/extra-writes.js` (v2 write pipeline)
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `preloadTripVisibilityData` (calls `loadSelectableTripMembers` and `loadTripMembersForTrip` before opening trip forms). Confirm the v2 wizard path preloads visibility data before rendering trip forms. Otherwise members list may be empty.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/forms.js
- **File:** `components/forms.js`
- **Reason:** Self-described "deprecated compatibility shim" — every export throws an error referencing the old release. No import found anywhere in the codebase.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./components/forms.js` in SHELL_ASSETS)
- **Replacement:** no replacement needed (shim with no live callers)
- **Tests protecting removal:** none
- **Valuable logic to migrate before deletion:** none — all exports intentionally throw errors
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## Old Component Helpers (7 files)

---

## components/app-shell.js
- **File:** `components/app-shell.js`
- **Reason:** Old shell/nav helpers (`offlineBannerHtml`, `renderHeader`, `renderNav`, `bindNav`). No current entrypoint imports it. The v2 renderer manages nav directly.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./components/app-shell.js` in SHELL_ASSETS)
- **Replacement:** Nav rendered inline in `screens/render/desktop.js` and `screens/render/mobile.js`
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `bindNav` event delegation pattern (data-tab click → callback) is a clean pattern. The v2 renderers already do equivalent binding. `NAV_ITEMS` list is embedded in the renderers now.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/content-events.js
- **File:** `components/content-events.js`
- **Reason:** Old event binding layer (`createContentEvents`) for the pre-v2 screen stack. Imports legacy screens (`trips-screen`, `archive-screen`, `trip-detail-expenses`). No current entrypoint imports it.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./components/content-events.js` in SHELL_ASSETS)
- **Replacement:** Event handling is now embedded in `screens/app-actions.js` and the v2 wizard/renderer stack
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `bindSearchCollapse` (Escape key + blur-if-empty UX for search drawers). `toggleStageJournal` / `toggleSummaryStage` / `toggleStageGpx` accordion logic. These interaction patterns should be confirmed present in the v2 renderers before deleting.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/trip-card.js
- **File:** `components/trip-card.js`
- **Reason:** Shared trip card renderer (`tripCardHtml`, `visibilityPillHtml`, `tripVisibility`). Imported only by legacy screens (`trips-screen`, `archive-screen`, `trip-detail-screen`, `summary-screen`) and legacy forms (`trip-form`, `expense-form`). Not reachable from any current entrypoint.
- **Currently imported by:** nothing reachable — all callers are themselves legacy orphans
- **Currently cached by service worker:** yes (`./components/trip-card.js` in SHELL_ASSETS)
- **Replacement:** Trip card rendering is handled inline in `screens/render/desktop.js` and `screens/render/mobile.js`
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `tripVisibility(trip)` helper (normalises trip visibility to `'private' | 'selected' | 'group'`) is used across forms and is semantically important. Confirm the v2 renderers have an equivalent or inline this logic. `visibilityPillHtml` is also used by multiple legacy screens.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/feedback.js
- **File:** `components/feedback.js`
- **Reason:** Shared empty/error state helpers (`signedOutState`, `errorCard`). Only imported by legacy screens (`archive-screen`, `account-screen`, `trips-screen`, `trip-detail-stages`). Not reachable from any current entrypoint.
- **Currently imported by:** nothing reachable — all callers are legacy orphans
- **Currently cached by service worker:** yes (`./components/feedback.js` in SHELL_ASSETS)
- **Replacement:** Error and empty state HTML is rendered inline in the v2 renderer stack
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `signedOutState` and `errorCard` are simple HTML helpers. The v2 renderers inline their own equivalents. No novel logic.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/audit.js
- **File:** `components/audit.js`
- **Reason:** Single helper `auditLineHtml`. No import found anywhere in the codebase. Complete orphan.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./components/audit.js` in SHELL_ASSETS)
- **Replacement:** `auditLineHtml` is reimplemented inline in `screens/trip-detail-stages.js` (legacy, also being deleted) and inlined in the v2 renderers where needed
- **Tests protecting removal:** none
- **Valuable logic to migrate before deletion:** Trivial one-liner. No novel logic. The v2 renderers handle audit lines inline.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/access-schema-cards.js
- **File:** `components/access-schema-cards.js`
- **Reason:** Access/schema error card renderers (`accessErrorHtml`, `schemaErrorHtml`). No import found anywhere in entrypoint-reachable code. Orphan.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./components/access-schema-cards.js` in SHELL_ASSETS)
- **Replacement:** Access and schema error states are rendered inline in the v2 renderer stack
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** The `schemaErrorHtml` output includes the `expectedSchemaVersion` badge, which is useful for debugging. Confirm v2 session-controller renders an equivalent schema-mismatch error state.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## components/trip-not-found.js
- **File:** `components/trip-not-found.js`
- **Reason:** Single helper `tripNotFoundHtml`. No import found anywhere in entrypoint-reachable code. Orphan.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./components/trip-not-found.js` in SHELL_ASSETS)
- **Replacement:** Trip-not-found state is rendered inline in v2 renderers
- **Tests protecting removal:** none
- **Valuable logic to migrate before deletion:** Trivial fragment. No novel logic.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## Old Pre-v2 Screen Modules (8 files)

---

## screens/trips-screen.js
- **File:** `screens/trips-screen.js`
- **Reason:** Pre-v2 trips list renderer. Only imported by `components/content-events.js` (legacy). Not reachable from any current entrypoint.
- **Currently imported by:** nothing — confirmed orphan via legacy chain only
- **Currently cached by service worker:** yes (`./screens/trips-screen.js` in SHELL_ASSETS)
- **Replacement:** `screens/render/desktop.js` + `screens/render/mobile.js`
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `filteredTripsForTripsScreen` (status + search filter combining `tripStatusFilter` and `tripSearch`) and `tripFiltersHtml` (chip + search drawer markup). Confirm the v2 desktop/mobile renderers implement equivalent filter logic before deleting. The filter state (`STATE.tripSearch`, `STATE.tripStatusFilter`) is preserved in `state/app-state.js`.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## screens/account-screen.js
- **File:** `screens/account-screen.js`
- **Reason:** Pre-v2 account screen renderer. No import found anywhere in entrypoint-reachable code. Orphan.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./screens/account-screen.js` in SHELL_ASSETS)
- **Replacement:** Account section rendered inline in `screens/render/desktop.js` + `screens/render/mobile.js`
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `lifetimeStats` (computes tripCount, totalKm, totalDays, spent from `STATE.trips`, `STATE.stagesByTrip`, `STATE.expensesByTrip`). Also `pwaInstallHelperHtml` with platform detection (`detectedInstallPlatform`). Confirm these are present in the v2 account section before deleting. Note: the hardcoded `"Routefolk member since 2023"` string and `v0.6.2 · build 20260516` version label are stale and should not be carried forward.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## screens/archive-screen.js
- **File:** `screens/archive-screen.js`
- **Reason:** Pre-v2 archive screen renderer (also contains the entire SVG heatmap/route-map rendering pipeline). Only imported by `components/content-events.js` (legacy). Not reachable from any current entrypoint.
- **Currently imported by:** nothing — confirmed orphan via legacy chain only
- **Currently cached by service worker:** yes (`./screens/archive-screen.js` in SHELL_ASSETS)
- **Replacement:** `screens/archive-geo-map.js` (current Leaflet-based archive map, loaded directly by index.html)
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** This file contains a large, sophisticated SVG map rendering pipeline: `resampleTrackForHeatmap`, `haversineKm`, `interpolateGeoPoint`, `addArchiveHeat`, `archiveHeatColor`, `archiveMapExtent`, `projectArchivePoint`, `archiveHeatmapSvg`, `archiveGeoMapSvg`. These algorithms largely duplicate logic already present in `screens/archive-geo-map.js` (the live replacement). Before deleting, verify `archive-geo-map.js` has equivalent heatmap/route rendering. Also `archiveMetrics` (distance/cost/entries totals for completed trips) is a useful stats aggregation function — confirm v2 archive section has this.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## screens/summary-screen.js
- **File:** `screens/summary-screen.js`
- **Reason:** Pre-v2 trip summary renderer. No import found anywhere in entrypoint-reachable code. Orphan.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./screens/summary-screen.js` in SHELL_ASSETS)
- **Replacement:** Summary tab rendered inline in v2 renderer stack
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `summaryTableHtml` (tabular stage/entry/expense review layout) and `bindSummaryEvents` (expand/collapse stage rows with lazy entry loading). This is feature-rich UI. Confirm the v2 renderers implement an equivalent trip summary view before deleting.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## screens/trip-detail-screen.js
- **File:** `screens/trip-detail-screen.js`
- **Reason:** Pre-v2 trip detail shell (4-tab layout). No import found anywhere in entrypoint-reachable code. Orphan.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./screens/trip-detail-screen.js` in SHELL_ASSETS)
- **Replacement:** Trip detail shell rendered inline in v2 renderer stack
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `routeSketchSvg` — inline SVG route sketch from stage coordinates (start_lat/lng, end_lat/lng). This is a nice touch not clearly present in the v2 renderer; worth checking if the v2 detail view has this or if it should be ported. Also `seasonKicker` (No. 01 · Spring 2026 stamp from trip start date).
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## screens/trip-detail-stages.js
- **File:** `screens/trip-detail-stages.js`
- **Reason:** Pre-v2 stage list, journal, weather, and GPX renderer. No import found anywhere in entrypoint-reachable code. Orphan.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./screens/trip-detail-stages.js` in SHELL_ASSETS)
- **Replacement:** Stage/journal/weather/GPX rendering handled in v2 renderer stack
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `weatherStripHtml` (renders Open-Meteo forecast for a stage, handles missing coords, missing date, loading/error states). `gpxStageSectionHtml` (accordion for stage GPX tracks). `renderStagePaneHtml` (desktop stage pane with weather/journal/GPX/costs). These are rich UI sections — confirm v2 desktop renderer includes equivalent stage detail pane before deleting.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## screens/trip-detail-expenses.js
- **File:** `screens/trip-detail-expenses.js`
- **Reason:** Pre-v2 expense list renderer. Only imported by `components/content-events.js` (legacy). Not reachable from any current entrypoint.
- **Currently imported by:** nothing — confirmed orphan via legacy chain only
- **Currently cached by service worker:** yes (`./screens/trip-detail-expenses.js` in SHELL_ASSETS)
- **Replacement:** Expenses section rendered inline in v2 renderer stack
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `expenseTotals` and `expenseTotalsHtml` (category + payer breakdown with bar chart). `expensesForTrip` simple accessor. These are functional helpers — confirm v2 renderer includes category/payer breakdown before deleting.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## screens/packing-screen.js
- **File:** `screens/packing-screen.js`
- **Reason:** Pre-v2 packing list renderer. No import found anywhere in entrypoint-reachable code. Orphan.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** yes (`./screens/packing-screen.js` in SHELL_ASSETS)
- **Replacement:** Packing list rendered inline in v2 renderer stack
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `categoryStats` (per-category packed/planned/optional counts + progress %). `packingHeroHtml` (summary bar: X of Y packed). `groupedItemsHtml` (items grouped by category). Confirm v2 packing section implements all of these before deleting.
- **Decision:** `REMOVE_AFTER_SW_CLEANUP`

---

## Superseded Archive Map (1 file)

---

## screens/archive-map.js
- **File:** `screens/archive-map.js`
- **Reason:** Old Leaflet-based archive map renderer with SVG fallback. Superseded by `screens/archive-geo-map.js` (minified, self-contained, loaded directly by index.html). Not in SHELL_ASSETS. Not in index.html. Not imported anywhere. Complete orphan on disk.
- **Currently imported by:** nothing — confirmed orphan
- **Currently cached by service worker:** no (not in SHELL_ASSETS)
- **Replacement:** `screens/archive-geo-map.js`
- **Tests protecting removal:** none
- **Valuable logic to migrate before deletion:** `pointsFromGeometry` handles multiple geometry shapes (array, `{points}`, `{coordinates}`, GeoJSON LineString, GeoJSON Feature). More defensive than the v2 equivalent. Also `drawSvgFallback` (SVG route sketch when Leaflet tiles fail) — worth checking if `archive-geo-map.js` has an equivalent offline/tile-fail fallback. `latLngFromPoint` handles both `{lat,lng}` and `[lat,lng]` array forms.
- **Decision:** `REMOVE`

---

## Utility Files in SHELL_ASSETS but Not Runtime-Reachable (4 files)

---

## utils/url.js
- **File:** `utils/url.js`
- **Reason:** URL parsing and validation helpers. Only imported by legacy screens (`archive-screen.js` via `linkHostBadgeHtml` and `summary-screen.js`, `trip-detail-stages.js`). Not reachable from any current entrypoint.
- **Currently imported by:** nothing reachable — all callers are legacy orphans
- **Currently cached by service worker:** yes (`./utils/url.js` in SHELL_ASSETS)
- **Replacement:** No direct replacement in v2 — URL validation logic (`validateEntryUrls`, `isGoogleMapsUrl`, `isHttpsUrl`) is not currently called by any v2 code, though it was used by `journal-form.js` (also legacy). `linkHostBadgeHtml` is used by legacy screens for displaying URL host badges.
- **Tests protecting removal:** `tests/unit/validators.test.js` covers `isGoogleMapsUrl` and URL validation functions in `lib/stages.js` / `lib/journal.js` — NOT this file directly. Need to check if `lib/journal.js` reimplements the same validation or delegates to `utils/url.js`.
- **Valuable logic to migrate before deletion:** `validateEntryUrls` is important user-facing validation (Google Maps URL check, HTTPS-only for info/album URLs). If the v2 journal wizard does not call this, journal entries could be saved with invalid URLs. **Confirm v2 journal wizard validates URLs before deleting this file.** `linkHostBadgeHtml` + `canonicalHost` are display helpers; confirm not needed in v2 entry rendering.
- **Decision:** `KEEP_AS_REFERENCE`

---

## utils/trip-stats.js
- **File:** `utils/trip-stats.js`
- **Reason:** Trip statistics helpers (`tripStats`, `tripStatsStripHtml`). Imported only by legacy component chain. Not reachable from any current entrypoint.
- **Currently imported by:** nothing reachable — only imported by `utils/trip-stats.js` → `components/stats.js` chain (which is itself reached via `utils/trip-detail.js`, but `trip-stats.js` imports `stats.js`, not the other way around)
- **Currently cached by service worker:** yes (`./utils/trip-stats.js` in SHELL_ASSETS)
- **Replacement:** Trip stats rendering is handled inline in v2 renderer stack
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `tripStats` aggregates: days, stages, distance, entries, authors, avg/stage, total cost — all from current STATE. `tripStatsStripHtml` renders the stat strip. Confirm the v2 desktop/mobile renderers include an equivalent trip stats section (the "trip strip" visible on trip detail). This logic is moderately complex and worth preserving as reference.
- **Decision:** `KEEP_AS_REFERENCE`

---

## utils/state-selectors.js
- **File:** `utils/state-selectors.js`
- **Reason:** Shared STATE lookup helpers (`currentTrip`, `findStageById`, `findEntry`). Only imported by legacy write stack and event layer. Not reachable from any current entrypoint.
- **Currently imported by:** nothing reachable — only by `handlers/write-handlers.js` and `components/action-modals.js` and `components/content-events.js` (all legacy)
- **Currently cached by service worker:** yes (`./utils/state-selectors.js` in SHELL_ASSETS)
- **Replacement:** The v2 screens access STATE directly. `findStageById` and `findEntry` traversal logic is not centralized in v2.
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `findStageById` (linear scan across all `STATE.stagesByTrip`) and `findEntry` (scan across all `STATE.entriesByStage`) are useful lookups for the upcoming Phase 4 (action router). Consider moving these into `state/app-state.js` or a new `utils/state-helpers.js` rather than deleting outright, since Phase 4 will need them again.
- **Decision:** `KEEP_AS_REFERENCE`

---

## utils/write-guards.js
- **File:** `utils/write-guards.js`
- **Reason:** Write-permission and user-facing error helpers. Only imported by `handlers/write-handlers.js` (legacy). Not reachable from any current entrypoint.
- **Currently imported by:** nothing reachable — only by `handlers/write-handlers.js` (legacy)
- **Currently cached by service worker:** yes (`./utils/write-guards.js` in SHELL_ASSETS)
- **Replacement:** Online/offline guards are handled inline in `screens/wizards.js` and `screens/extra-writes.js`
- **Tests protecting removal:** none yet
- **Valuable logic to migrate before deletion:** `friendlyError` and `friendlyGpxError` (map raw Supabase/network errors to user-facing messages). `ensureOnline` (toast-on-offline guard). `canDeleteTrip` (creator-only delete guard). These are all needed in the upcoming Phase 4 action refactor. **Do not delete before Phase 4 action router is in place** — or port these helpers into the new `actions/` module layer first.
- **Decision:** `KEEP_AS_REFERENCE`

---

## Additional Files Evaluated

---

## components/stats.js
- **File:** `components/stats.js`
- **Reason:** Evaluated as part of this audit. Single export `statItemHtml(label, value)` — renders a stat box div.
- **Currently imported by:** `utils/trip-detail.js` → `components/stats.js` — **IS runtime-reachable** via the entrypoint graph (`state/data-loaders.js` → `utils/trip-detail.js` → `components/stats.js`)
- **Currently cached by service worker:** yes (`./components/stats.js` in SHELL_ASSETS — correct to cache)
- **Replacement:** N/A — currently used
- **Tests protecting removal:** N/A
- **Decision:** `KEEP` — runtime-reachable, correctly cached, in active use via `utils/trip-detail.js`

---

## tools/backfill-gpx-geometry.mjs
- **File:** `tools/backfill-gpx-geometry.mjs`
- **Reason:** Local-only Node.js maintenance script. Not imported by any app code. Not in SHELL_ASSETS. Not loaded by index.html.
- **Currently imported by:** nothing — standalone script
- **Currently cached by service worker:** no (not in SHELL_ASSETS)
- **Replacement:** no replacement needed
- **Tests protecting removal:** none
- **Valuable logic to migrate before deletion:** `parseGpxText` (regex-based GPX trkpt/rtept parser with time extraction), `buildCachedGeometryPayload`, `resampleTrackForHeatmap`, `haversineKm`, `simplifyTrackPoints` — these are fully self-contained Node implementations of the same algorithms used in `lib/gpx.js` and `screens/archive-screen.js`. The script is operationally useful for backfilling the `gpx_tracks.simplified_points` / `heat_points` / `bbox` / `point_count` columns in Supabase. **Keep this script** — it is a useful admin tool, not dead code.
- **Decision:** `KEEP` — operational maintenance script, not dead code

---

## Summary

| Decision | Count | Files |
|----------|-------|-------|
| `REMOVE` | 1 | `screens/archive-map.js` |
| `REMOVE_AFTER_SW_CLEANUP` | 24 | all legacy components, forms, handlers, and old screen modules in SHELL_ASSETS |
| `KEEP_AS_REFERENCE` | 4 | `utils/url.js`, `utils/trip-stats.js`, `utils/state-selectors.js`, `utils/write-guards.js` |
| `KEEP` | 2 | `components/stats.js`, `tools/backfill-gpx-geometry.mjs` |

### REMOVE_AFTER_SW_CLEANUP (24 files — require Phase 2.1 SW cleanup first)

**Old write pipeline:**
1. `handlers/write-handlers.js`
2. `components/modal.js`
3. `components/stage-form.js`
4. `components/journal-form.js`
5. `components/expense-form.js`
6. `components/gpx-form.js`
7. `components/trip-form.js`
8. `components/action-modals.js`
9. `components/forms.js`

**Old component helpers:**
10. `components/app-shell.js`
11. `components/content-events.js`
12. `components/trip-card.js`
13. `components/feedback.js`
14. `components/audit.js`
15. `components/access-schema-cards.js`
16. `components/trip-not-found.js`

**Old pre-v2 screen modules:**
17. `screens/trips-screen.js`
18. `screens/account-screen.js`
19. `screens/archive-screen.js`
20. `screens/summary-screen.js`
21. `screens/trip-detail-screen.js`
22. `screens/trip-detail-stages.js`
23. `screens/trip-detail-expenses.js`
24. `screens/packing-screen.js`

### Critical pre-deletion checks

Before running Phase 3 (actual file deletion), verify the following in the v2 codebase:

1. **URL validation** — `utils/url.js` `validateEntryUrls` / `isGoogleMapsUrl` called in the v2 journal wizard
2. **Expense payer resolution** — `payerProfilesForTrip` logic from `components/expense-form.js` present in v2 expense wizard
3. **Stage date validation** — `validateStageFormAgainstTrip` present in v2 stage wizard
4. **Journal time toggle** — `bindEntryTimeToggle` equivalent in v2 journal wizard
5. **Trip visibility preload** — `preloadTripVisibilityData` equivalent called before rendering trip form in v2
6. **Archive metrics** — `archiveMetrics` (distance/cost/entries totals) present in v2 archive section
7. **Write guards** — `friendlyError` / `friendlyGpxError` / `ensureOnline` present in v2 write layer before deleting `utils/write-guards.js`
8. **State selectors** — `findStageById` / `findEntry` available to Phase 4 action router before deleting `utils/state-selectors.js`
