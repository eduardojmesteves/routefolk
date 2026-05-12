# routefolk

A Progressive Web App for planning, journaling, and archiving motorcycle trips taken with friends.

This document is the source of truth for the project: what it is, what it isn't, how it's built, and what comes next. It will be updated as the project advances.

---

## What this is

A small, personal-use app for a fixed group of friends who ride motorcycles together. It covers the full lifecycle of a trip: planning the route together, journaling the experience as it happens, tracking per-person costs, importing GPS tracks after the ride, and archiving past trips on a world map.

Not a commercial product. Not a startup. Built for ourselves.

---

## Core principles

1. **Simple stack, no build step.** Plain HTML, CSS, and JavaScript.
2. **Mobile-first, tablet- and desktop-friendly.**
3. **Cheap to run.** Free tiers only.
4. **Open the door, don't walk through it.** Realtime, offline queueing, photo hosting — possible, not built until needed.
5. **Honesty about scope.** Defer what can be deferred. Use external tools (Splitwise, Google Maps) when they exist.

---

## Access model

The app is for a fixed, trusted group of friends. Access is still enforced outside the app through the Google OAuth consent screen's **Test users** list — only emails on that list can complete sign-in.

Trips now have simple visibility:

| Visibility | Meaning |
|---|---|
| `private` | Visible/editable only by the trip creator |
| `group` | Visible/editable by everyone who can sign in to the app |

There are still no per-trip invites, no roles, no selected-user sharing, and no multiple groups in the active implementation. That keeps the app simple and aligned with the fixed trusted-group model.

Within group trips, signed-in users can collaborate on trips, stages, journal entries, and future expenses. Trip deletion is intentionally creator-only because deleting an entire trip is too destructive for casual group editing.

User display names come from lightweight `profiles` records created/refreshed after Google sign-in. The People list shows users who have signed in at least once; it does not manage access.

---


## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Plain HTML + CSS + JS, native ES modules | No build step |
| Hosting | Cloudflare Pages, deployed from GitHub | Free, deploy on push |
| Backend | Supabase (Auth + Postgres + Storage) | Free tier generous |
| Auth | Google sign-in via Supabase | No passwords |
| Maps (archive) | GPX-first geography overview | No road tiles; route lines require stage-level GPX tracks |
| Maps (navigation) | Google Maps intent links + user-pasted custom URLs | |
| Geocoding | Open-Meteo geocoding API | Free, no key |
| Weather | Open-Meteo forecast API | Free, no key, 16-day forecast |
| Photos | External album links | Defers photo storage entirely |
| PWA | Hand-written service worker | No plugin |
| GPX storage | Supabase Storage private bucket `gpx-tracks` | Stage-level GPX files — Phase 3C |
| Icons | Inline SVGs + emoji labels | No icon library |

### Stack things deliberately not used

- No SvelteKit / React / Vue
- No Tailwind / shadcn / component library
- No TypeScript
- No build tools
- No realtime subscriptions in v1

---

## Data model

Tables live in Supabase Postgres. All tables have `id` (UUID) and `created_at` unless noted.

### `users`
Managed by Supabase Auth.

### `app_meta`
Small schema/app metadata table.

| Field | Type | Notes |
|---|---|---|
| key | text | primary key, e.g. `schema_version` |
| value | text | current value, e.g. `007` |
| updated_at | timestamptz | refreshed when metadata changes |

### `profiles`
| Field | Type | Notes |
|---|---|---|
| id | uuid | same as `auth.users.id` |
| email | text | from Google sign-in |
| full_name | text | from Google sign-in |
| avatar_url | text | from Google sign-in |
| updated_at | timestamptz | refreshed on profile update |

### `trips`
| Field | Type | Notes |
|---|---|---|
| created_by | uuid | auto-set on INSERT; NOT NULL; auth user deletion restricted while they own trips |
| title | text | NOT NULL |
| description | text | |
| start_date / end_date | date | |
| cover_photo_url | text | external link |
| status | text | `planning` / `active` / `completed` / `cancelled` |
| visibility | text | `private` / `group`; existing trips default to `group` |
| updated_by / updated_at | | auto-set on UPDATE |

### `stages`
| Field | Type | Notes |
|---|---|---|
| trip_id | uuid | ON DELETE CASCADE |
| order_index | int | for ordering; non-negative; unique per trip |
| title | text | |
| start_location / end_location | text | human-readable city names |
| start_lat / start_lng / end_lat / end_lng | double precision | auto-filled via geocoding |
| planned_date | date | constrained in the UI by trip start/end dates |
| gmaps_url | text | auto-built from start/end |
| custom_route_url | text | optional user-pasted Maps URL |
| distance_km | double precision | optional; non-negative when set |
| notes | text | |
| updated_by / updated_at | | auto-set on UPDATE |

Stage reordering is handled by the transactional `swap_stage_order(stage_a_id, stage_b_id)` RPC, not by two separate client-side updates.

### `journal_entries`
| Field | Type | Notes |
|---|---|---|
| stage_id | uuid | ON DELETE CASCADE |
| author_id | uuid | auto-set on INSERT; preserved on UPDATE; nullable if auth user is removed |
| entry_type | text | `stop` / `meal` / `lodging` / `note` / `drink` / `other` |
| title / description / location | text | |
| location_url | text | optional Google Maps URL; `https` + Google Maps host allowlist |
| info_url | text | optional generic website URL; `https` only |
| timestamp | timestamptz | when it happened; in the UI it follows the stage planned date |
| photo_album_url | text | optional external album URL; `https` only |

### `expenses`
Phase 2A trip cost tracking. Expenses are EUR-only and record the payer, not split/debt settlement.

| Field | Type | Notes |
|---|---|---|
| trip_id | uuid | ON DELETE CASCADE |
| stage_id | uuid | optional stage assignment; ON DELETE SET NULL |
| user_id | uuid | payer; selectable for group trips, current user only for private trips; NOT NULL; auth user deletion restricted while referenced |
| created_by | uuid | user who entered the record |
| category | text | `fuel` / `food_drinks` / `lodging` / `tolls` / `parking` / `other` |
| amount | numeric | positive EUR amount |
| currency | text | always `EUR` |
| description | text | optional |
| date | date | defaults to today in the UI/database |
| updated_by / updated_at | | auto-set on UPDATE |

### `video_notes`
One row per trip.

### `gpx_tracks`
Stage-level GPX track records. Each GPX file belongs to one stage; trip-level/archive maps combine the stage tracks.

| Field | Type | Notes |
|---|---|---|
| trip_id | uuid | parent trip, retained for access/querying |
| stage_id | uuid | required; GPX files are linked to individual stages |
| file_path | text | path inside private Supabase Storage bucket `gpx-tracks` |
| distance_km | double precision | parsed from GPX points when uploaded |
| duration_seconds | int | parsed from GPX timestamps when available |
| uploaded_at / created_at | timestamptz | upload timing |

Storage path convention:

```text
{trip_id}/{stage_id}/{filename}.gpx
```

---

## External APIs

### Open-Meteo (CC BY-NC 4.0)

- **Geocoding**: `GET https://geocoding-api.open-meteo.com/v1/search` — fuzzy place-name search. Cached 7 days.
- **Forecast**: `GET https://api.open-meteo.com/v1/forecast` — daily forecast, max 16 days ahead. Cached 1 hour.

### Google Maps (intent links + user-pasted)

Custom stage URLs take priority over auto-generated route URLs. Stage custom URLs and journal location URLs are validated with `https` + allowlisted Google Maps hosts.

Journal `info_url` is deliberately looser: any `https` URL is accepted because it can point to Booking.com, a restaurant website, a pub page, TripAdvisor, Instagram, a blog post, or any other useful reference.

### Archive geography overview

The Archive map is a boundary-style overview, not a street map. Phase 3B deliberately does not draw fake straight-line routes from stage start/end coordinates. Route lines require GPX files uploaded to individual stages. Cancelled trips remain visible in the Archive list but are not plotted. Google Maps links remain navigation links and are not parsed as route geometry. From Phase 3C onward, uploaded stage GPX tracks feed the archive geography view.

---

## Database migrations

Full current schema in `schema.sql` (idempotent). Incremental changes are tracked as numbered files in `migrations/`. Each migration is idempotent and pasted into Supabase's SQL Editor.

**⚠️ Important:** migrations must be run manually in Supabase **before** deploying the code that uses them, otherwise PostgREST returns "Could not find the X column" errors.

| Migration | Description |
|---|---|
| `001_custom_route_url.sql` | Adds `custom_route_url` to stages, plus `updated_by`/`updated_at` audit columns + triggers on trips and stages |
| `002_journal_links.sql` | Adds `location_url` and `info_url` to journal entries |
| `003_profiles_trip_visibility.sql` | Adds profiles, private/group trip visibility, creator-only trip deletion, and visibility-aware RLS policies |
| `004_visibility_rls_hardening.sql` | Re-applies/hardens visibility RLS and cache-related troubleshooting support |
| `005_expenses_phase2.sql` | Adds Phase 2A expenses: selectable payer, EUR-only costs, categories, audit fields, and expense RLS hardening |
| `006_expense_stage_assignment.sql` | Adds optional expense stage assignment with same-trip validation |
| `007_schema_safety_pack.sql` | Fixes FK/nullability consistency, adds core DB constraints, normalizes/protects stage ordering, and sets `app_meta.schema_version = 007` |
| `008_atomic_stage_reorder.sql` | Adds transactional `swap_stage_order` RPC and sets `app_meta.schema_version = 008` |
| `009_stage_gpx_upload.sql` | Adds private GPX Storage bucket, enforces stage-level GPX records, and sets `app_meta.schema_version = 009` |

---

## Roadmap

### Phase 1 — MVP: plan + journal ✅

**Foundation**
- [x] Repo, Cloudflare Pages, Supabase, Google OAuth
- [x] Database schema and RLS
- [x] App shell, service worker, manifest, PWA install
- [x] Auth flow

**Trips**
- [x] Create / list / view / edit / delete
- [x] Archive tab for completed and cancelled trips
- [x] Trip metrics strip: days, stages, distance, entries, authors, average distance per stage
- [x] Trip summary table with expandable stage rows

**Stages**
- [x] Add / edit / reorder / delete
- [x] Google Maps Navigate button
- [x] Custom Maps URL override
- [x] Planned date constrained by trip start/end dates in the UI
- [x] Soft warning when an existing stage date falls outside the trip range

**Weather**
- [x] Auto-geocode city names
- [x] Forecast for start / midpoint / end on planned date
- [x] Graceful failure handling

**Journal**
- [x] Add / list / edit / delete entries
- [x] Entry types with icons
- [x] Author shown on each entry
- [x] Optional external photo album link
- [x] Optional Google Maps location link
- [x] Optional generic website link

**Polish**
- [x] Dark-mode date picker icon visibility fix
- [x] Bottom nav (mobile) / sidebar (desktop) responsive
- [x] Loading states and error messages — refined as features land
- [x] Online-only with clear "you're offline" message when applicable

### Phase 1.5 — People + simple visibility ✅

- [x] Lightweight `profiles` table for names and avatars
- [x] Profile upsert on sign-in
- [x] People with access section on Account screen
- [x] Real profile names for journal authors when available
- [x] Trip visibility: Private / Friends group
- [x] Visibility-aware RLS for trips, stages, journal entries, expenses, video notes, and GPX tracks
- [x] Creator-only trip deletion

### Phase 2 — Trip costs ✅

**Phase 2A — Basic expenses**
- [x] Add / list / edit / delete expenses inside trip detail
- [x] Select payer from People with access for group trips
- [x] Private trips use the current user as payer
- [x] EUR-only expense tracking
- [x] Categories: fuel, food & drinks, lodging, tolls, parking, other
- [x] Trip total cost
- [x] Breakdown by category, showing only categories with money
- [x] Breakdown by payer
- [x] Compact Cost metric in the trip metrics strip

**Phase 2B — Trip Summary Review**
- [x] Add expenses to the trip summary table/review view
- [x] Add optional stage assignment to expenses
- [x] Show assigned expenses under each stage in Summary Review
- [x] Show unassigned expenses as trip-level expenses
- [x] Constrain expense date inputs by trip date range
- [x] Keep Summary Review read-only for expenses

### Phase 2.5 — Reliability and usability polish ✅

- [x] Offline banner for installed PWA / browser use
- [x] Disable write actions while offline
- [x] Action-specific error messages for common save/delete failures
- [x] Simple loading states kept consistent across major sections
- [x] Show last edited by / at on trip detail and stage cards
- [x] Hide whole-trip delete action for non-creators
- [x] Trip title search on the Trips screen
- [x] Trip status filter: All active / Planning / Active

### Phase 2.6 — Safety and operational hardening

**Phase 2.6A — Schema safety pack ✅**
- [x] Fix FK/nullability consistency for core auth-user references
- [x] Restrict auth-user deletion while a user owns trips or is referenced as an expense payer
- [x] Allow journal authorship to degrade to unknown/null if an auth user is removed
- [x] Add DB-level trip date, stage distance/order/coordinate, and GPX distance/duration constraints
- [x] Normalize existing stage order values per trip
- [x] Add deferrable uniqueness for `stages(trip_id, order_index)`
- [x] Add lightweight `app_meta.schema_version = 007` marker

**Phase 2.6B — Atomic stage reorder ✅**
- [x] Replace the two-client-update stage swap with a transactional Supabase RPC
- [x] Lock both stage rows before swapping order values
- [x] Validate both stages belong to the same trip
- [x] Reuse private/group trip access rules inside the RPC
- [x] Set `app_meta.schema_version = 008`

**Phase 2.6C — Release/cache hardening ✅**
- [x] Standardize app-shell/module cache invalidation with versioned app shell URLs
- [x] Use network-first service worker handling for JavaScript and CSS
- [x] Add schema-version startup sanity check against `app_meta.schema_version = 008`
- [x] Add compact mobile Trips filters behind a Filters button

### Phase 3 — Archive + tracks

**Phase 3A — Archive baseline ✅**
- [x] Archive header metrics: completed trips, total distance, total cost, journal entries
- [x] Cancelled trips remain listed but do not count toward archive totals
- [x] Archive search by trip title
- [x] Archive status filter: All / Completed / Cancelled
- [x] Compact mobile Archive filters behind a Filters button
- [x] Archived trip cards show stages, distance, cost, and journal entry count when loaded
- [x] Account-screen PWA install helper with iOS, Android, and desktop instructions

**Phase 3B — Archive geography overview ✅**
- [x] Add List / Map toggle to Archive
- [x] Use a boundary-style geography placeholder instead of road tiles
- [x] Do not draw fake straight-line routes from stage start/end coordinates
- [x] Show a clear GPX-required state until stage GPX files exist
- [x] Keep cancelled trips listed but not mapped
- [x] Document that archive route lines are GPX-powered

**Phase 3C — Stage GPX upload + archive geography ✅**
- [x] Upload + parse GPX files per stage
- [x] Store each GPX file against one stage, with trip_id retained for access/querying
- [x] Save GPX files in private Supabase Storage bucket `gpx-tracks`
- [x] Parse distance and duration from GPX where possible
- [x] Show GPX track metadata on stage cards
- [x] Feed completed-stage GPX tracks into the archive geography view
- [x] Keep archive geography GPX-based; no fake straight-line fallback

**Phase 3C.1 — Archive GPX presentation ✅**
- [x] Add a simplified Europe boundary layer
- [x] Show country outlines only; no road tiles and no map labels
- [x] Remove latitude/longitude grid labels from the archive geography view
- [x] Keep one consistent GPX route style for now
- [x] Open trip detail when a route or point is clicked

**Phase 3.5 — Screen clarity and stage-card usability ✅**
- [x] Trips screen shows only Planning and Active trips
- [x] Trips status filter is limited to All active / Planning / Active
- [x] Archive remains the home for Completed and Cancelled trips
- [x] New journal entries default to Stop
- [x] Journal entry timestamp defaults to the stage planned date; if the stage has no date, the timestamp is empty
- [x] Journal entry timestamp is constrained to the stage planned date
- [x] GPX stage section is compact by default and expands only when needed

**Phase 3.6 — GPX track management polish ✅**
- [x] Stage GPX sections support multiple uploaded files visibly
- [x] Upload GPX action appears inside the expanded GPX section only
- [x] Each GPX file row shows filename, distance, and duration when available
- [x] Each GPX file row has its own delete action
- [x] Wrong GPX files are replaced by deleting the bad file and uploading the correct one

**Phase 3D — Stage/trip GPX maps**
- [ ] Display GPX track on the stage map view
- [ ] Combine stage GPX tracks into a full trip map view
- [ ] Decide whether the stage/trip map should use road tiles or a minimal map style

**Phase 3E — Archive drill-down**
- [ ] Drill-down: world → country → trip → stage → journal entries
- [ ] Past trips list remains the non-map fallback

### Phase 4 — Polish

- [ ] Video planning noteblock per trip
- [ ] PWA install prompts at the right moments
- [ ] Offline write queue
- [ ] Realtime updates
- [ ] Mobile UX refinements based on real-trip use
- [ ] Export trip to PDF or shareable read-only view
- [ ] Packing list per trip

### Phase 5+ — Later

- Per-trip membership and roles
- Bike profiles, maintenance log, gear inventory
- Photo upload + storage (when NAS + Nextcloud is ready)
- Pre-ride essentials
- Voice notes for journal entries

---

## Nice to do

Lower-priority items captured so they're not forgotten.

- **Multiple groups / selected group visibility.** Future Option B: replace the single Friends group with user-defined groups such as "Motorcycle friends" and "Family", using `groups` and `group_members`. Defer until there is a real need for separate groups.
- **Expense receipt URL.** Optional external receipt/photo link per expense. Deferred because the Phase 2 goal is total trip cost, not receipt management.
- **Expense settlement hints.** Who owes whom, reimbursements, settled status, and split logic are deliberately deferred. This app tracks trip cost, not debts.
- **Expense export/charts.** Useful later after real trip use proves which summaries matter.
- **Automatic expense-to-stage suggestions.** Possible later, but Phase 2B keeps assignment explicit and optional to avoid wrong guesses.
- **Geocoder ambiguity hints.** Show country alongside ambiguous city names.
- **Long-range weather outlook** beyond the 16-day Open-Meteo forecast.
- **Smarter PWA install prompt timing.** A simple Account helper exists; defer automatic prompts until real use shows where they are helpful rather than annoying.

---

## Design ideas parked

Visual directions considered but intentionally deferred. The current palette stays in place for now.

| Direction | Notes | Risk |
|---|---|---|
| Warm dusk | Sunset oranges and warm browns; more travel-memory feeling | Could become too lifestyle/blog-like |
| Forest | Greens and earth tones; outdoorsy and calm | Could feel more like a hiking app than a motorcycle trip app |
| Pure neutral | Greys with subtle accents only on status | Timeless, but less distinctive |

---

## Visibility troubleshooting

If the visibility selector appears but private trips still save as group trips, the most likely cause is stale PWA/service-worker cache serving an old `lib/trips.js`. The app imports `trips.js` with a cache-busting query string from Phase 1.5.1 onward, and `lib/trips.js` also verifies that Supabase returned the requested visibility.

---

## Deployment checklist

For every release that includes a database migration:

1. Run the new migration in the Supabase SQL Editor.
2. Confirm the migration completes without errors.
3. Confirm `public.app_meta` has the expected `schema_version` value when the migration changes the schema marker.
4. Deploy the code from GitHub / Cloudflare Pages.
5. Open the app in a browser and run a short smoke test: sign in, list trips, open a trip, save one harmless edit if appropriate, then undo it.
6. For installed PWAs, close and reopen the app; on iOS, refresh the site once in Safari if the Home Screen app appears stale.

---

## PWA update notes

The app shell uses a manual release query string for `app.js` and `style.css`, and the service worker uses network-first handling for JavaScript and CSS. The Account screen includes a simple install helper for iOS, Android, and desktop. After deploying changes that touch `app.js`, `style.css`, or `sw.js`, close and reopen the installed PWA. On iOS, if the Home Screen app remains stale, open the site in Safari, refresh it, then close and reopen the Home Screen app. The last-resort fix is removing and reinstalling the Home Screen app.

---

## Things to revisit

- **Site URL in Supabase is currently `http://localhost:8000`** for dev convenience. Move to production URL once daily development slows down.
- **Weather attribution** is a small per-strip line; could move to a global "Data sources" entry on Account screen.

---

## Working model

This project is a partnership.

**Human (10–20%):** scoping, decisions, testing, real-world feedback, surfacing requirements as they emerge from real trips, reviewing output.

**AI assistant (80–90%):** writing code, explaining what it does, debugging support, suggesting architecture, anticipating issues.

The human is a capable engineer new to this specific stack — explanations should cover the *why* alongside the *what*. Anti-patterns flagged. Push back on ideas that will cause pain later.

---

## Project structure

```
routefolk/
├── index.html              # App shell
├── style.css               # All styles
├── app.js                  # Main app logic, state, active/archive split, GPX upload/management, archive geography, schema check, and offline-aware UI
├── lib/
│   ├── config.js           # Supabase URL + anon key
│   ├── supabase.js         # Supabase client setup
│   ├── auth.js             # Sign-in / sign-out / current user
│   ├── meta.js             # App metadata helpers, including schema version check
│   ├── trips.js            # Trip CRUD + visibility handling
│   ├── stages.js           # Stage CRUD with auto-geocoding, custom-URL validation, and atomic reorder RPC
│   ├── geocoding.js        # Open-Meteo geocoding wrapper + cache
│   ├── weather.js          # Open-Meteo forecast wrapper + cache
│   ├── journal.js          # Journal entry CRUD + journal URL validation
│   ├── profiles.js         # Profile upsert/list for names and avatars
│   ├── expenses.js         # Expense CRUD + Phase 2B stage assignment validation
│   └── gpx.js              # GPX upload, parsing, storage, and track helpers
├── sw.js                   # Service worker with network-first handling for app code
├── manifest.json           # PWA manifest
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── schema.sql              # Full current database schema (idempotent)
├── migrations/             # Incremental schema changes, run in order
│   ├── 001_custom_route_url.sql
│   ├── 002_journal_links.sql
│   ├── 003_profiles_trip_visibility.sql
│   ├── 004_visibility_rls_hardening.sql
│   ├── 005_expenses_phase2.sql
│   ├── 006_expense_stage_assignment.sql
│   ├── 007_schema_safety_pack.sql
│   ├── 008_atomic_stage_reorder.sql
│   └── 009_stage_gpx_upload.sql
└── README.md               # This file
```

---

## Decisions log

- **2026-05: Phase 3.6 treats multiple GPX files per stage as normal.** A stage can have several GPX files because GPS recording may be stopped during breaks. The compact GPX row expands into a management section with one row per file, per-file delete actions, and an upload-another action. Wrong files are replaced by deleting them and uploading the correct file, not by a special replace workflow.
- **2026-05: Phase 3.5 separates active work from archive history.** The Trips screen now shows only planning and active trips. Completed and cancelled trips live in Archive, making the app workflow clearer: plan, ride, complete, archive.
- **2026-05: Journal dates follow stage dates.** New journal entries default to Stop and use the stage planned date for their timestamp. If a stage has no planned date, the journal timestamp stays empty instead of inventing a date.
- **2026-05: Stage GPX UI is compact by default.** GPX tracks are still linked to stages, but the stage card shows a one-line GPX summary until expanded so route files do not dominate the planning view.

- **2026-05: Phase 3C.1 improves Archive GPX presentation.** Archive geography now uses a simple Europe boundary view with country outlines only. Latitude/longitude labels and road tiles are avoided because this view is for ride history, not turn-by-turn navigation.
- **2026-05: Archive geography uses only real GPX geometry.** Stage start/end coordinates and Google Maps links are not used to draw routes because they would misrepresent the actual ride.

A running list of decisions made and why. New entries go at the top.

- **2026-05: Phase 3.6.1 fixes GPX expansion.** The compact GPX stage row now expands/collapses correctly and keeps upload/delete management inside the expanded section.


- **2026-05: Phase 3B is GPX-first, not fake-route-first.** Archive geography does not draw straight lines from stage start/end coordinates because those lines misrepresent the real ride. Route lines require GPX files linked to individual stages.
- **2026-05: Archive geography separates overview from route review.** The Archive map is a high-level geography/heatmap surface, not a street navigation map. Trip and stage route maps belong later, once GPX tracks provide real route geometry.
- **2026-05: Archive geography avoids road tiles.** The map uses a lightweight boundary-style placeholder rather than OpenStreetMap street tiles, because street detail is visual noise for the archive overview and caused brittle rendering in the PWA.
- **2026-05: Google Maps links are not parsed as geometry.** Custom Google Maps links remain navigation references. GPX tracks, not Google Maps URLs, will feed trip/stage route maps and archive geography.

- **2026-05: Phase 3A starts with archive baseline, not maps/GPX.** Archive gets useful list review, metrics, and filters before adding map/GPX complexity. Completed trips count toward totals; cancelled trips remain visible but are excluded from totals.
- **2026-05: PWA install help lives in Account.** Friends can see simple device-specific install instructions without needing a full onboarding flow or intrusive prompt.

- **2026-05: Phase 2.6C standardizes app cache invalidation.** Top-level app shell files use an explicit release query string and the service worker uses network-first handling for JavaScript and CSS, reducing stale installed-PWA bugs.
- **2026-05: App startup checks schema version.** Signed-in users now get a clear migration-required message if `public.app_meta.schema_version` does not match the version expected by the app.
- **2026-05: Mobile Trips filters are collapsed.** Search and status filters remain visible on tablet/desktop, but mobile shows a compact Filters button to avoid wasting vertical space.

- **2026-05: Phase 2.6B moves stage reorder into the database.** Stage order swaps now use a transactional `swap_stage_order` RPC that locks both rows, checks same-trip access, and updates both `order_index` values atomically. The previous two-client-update approach was too fragile once stage order uniqueness was enforced.

- **2026-05: Phase 2.6A hardens schema invariants before Phase 3.** Foreign-key/nullability mismatches are fixed, core date/distance/order/coordinate constraints are added, and stage order is protected with a deferrable unique constraint.
- **2026-05: Auth-user deletion is restricted for ownership and payer fields.** `trips.created_by` and `expenses.user_id` are semantically important and must not silently become null. Journal authorship is less critical, so `journal_entries.author_id` may become null if an auth user is removed.
- **2026-05: Schema compatibility marker starts at version 007.** `public.app_meta` stores `schema_version` so future code can detect database/code drift instead of failing later with missing-column or missing-function errors.

- **2026-05: Phase 2.5 keeps polish practical.** The app shows a clear offline banner, disables write actions while offline, improves common error messages, and avoids implementing an offline write queue until there is a real need.
- **2026-05: Trips screen uses search + status filter, not Kanban.** Title search and a status filter solve the immediate navigation problem without adding a second view mode or mobile Kanban complexity.
- **2026-05: Last edited display is limited to trip detail and stage cards.** This gives useful audit context without cluttering trip lists or Summary Review.

- **2026-05: Phase 2B adds optional expense stage assignment.** Expenses always belong to a trip and may optionally be assigned to one stage. Stage assignment is explicit, not guessed from date. Deleting a stage keeps the expense and clears the assignment.
- **2026-05: Summary remains a review surface.** Trip Summary Review shows stage journal entries and expenses, but expense editing stays in the trip detail Expenses section.
- **2026-05: Phase 2 tracks trip cost, not debt settlement.** The goal is total trip cost with payer/category breakdowns. Settlement, reimbursements, receipt URLs, exports, charts, and multi-currency support are deferred.
- **2026-05: Expenses are EUR-only.** The app stores `currency = 'EUR'` and does not expose a currency field in the UI.
- **2026-05: Expense payer is selectable for group trips.** `expenses.user_id` means payer. `created_by` records who entered the record. Private trips force the current user as payer.
- **2026-05: Expense categories are deliberately short.** Fuel, Food & drinks, Lodging, Tolls, Parking, and Other are enough for Phase 2A. Empty categories are hidden in breakdowns.

- **2026-05: Phase 1.5 uses simple trip visibility, not full sharing.** Trips are either private to the creator or shared with the whole approved friends group. No per-user sharing, no roles, no invite links, and no multiple groups in the active implementation.
- **2026-05: Profiles are lightweight display records.** The app upserts the signed-in user's email, name, and avatar after Google sign-in so journal entries and future expenses can show real names. Access is still controlled through Google OAuth Test users.
- **2026-05: Trip deletion is creator-only.** Group members can collaborate on shared trip content, but deleting the whole trip is restricted to the creator because it is too destructive.
- **2026-05: Multiple groups are parked as a future Option B.** Feasible with `groups` and `group_members`, but deliberately deferred until there is a concrete need for separate groups.

- **2026-05: Journal entries use two optional URL fields beyond photo albums.** `location_url` is for Google Maps links; `info_url` is for generic HTTPS websites such as Booking.com, restaurants, pubs, TripAdvisor, blogs, or other useful references. This avoids type-specific fields and keeps the form simple.
- **2026-05: Stage planned dates are constrained by trip dates in the UI.** If a trip has date bounds, stage date inputs receive `min` / `max`. If the trip has no dates, the stage date field is disabled with explanatory help text.
- **2026-05: Existing out-of-range stage dates use soft warnings, not hard blocking.** Changing trip dates should not trap the user mid-edit. The app warns and lets the group fix stage dates later.
- **2026-05: Trip summary uses expandable stage rows.** One row per stage keeps the summary scannable; journal entries are revealed only when needed.
- **2026-05: Current colour palette stays.** Alternative palettes are parked, not implemented.
- **2026-05: Journal entries are editable by anyone, but `author_id` is preserved.** Small trusted group; ability to fix someone else's typo outweighs the "protect against malicious edits" angle. The original author is always displayed.
- **2026-05: Journal section collapsed by default per stage.** Reduces visual noise on the trip detail page; one tap to expand.
- **2026-05: Photo album URL: `https` only, no host allowlist.** Photos can come from Google Photos, iCloud, Nextcloud, Flickr, etc. — we just enforce shape, not provider.
- **2026-05: Audit columns captured now, displayed later.** `updated_by` / `updated_at` populated by triggers. Display deferred until a `profiles` table exists.
- **2026-05: Custom Maps URL is a separate column, never auto-overwritten.**
- **2026-05: Custom URL validation: https only, allowlisted Google Maps hosts.**
- **2026-05: Migrations folder for incremental schema changes.** `schema.sql` always reflects current state; migrations run manually in Supabase before deploying dependent code.
- **2026-05: Geocoding via Open-Meteo, weather inline.**
- **2026-05: Weather cached 1 hour, geocoding cached 7 days.**
- **2026-05: Skip midpoint forecast when start/end < 50 km apart.**
- **2026-05: Trips list sorted by start_date DESC, nulls last.**
- **2026-05: Active list = `planning` + `active`. Archive list = `completed` + `cancelled`.**
- **2026-05: Hard delete for trips, with confirmation suggesting `cancelled` instead.** From Phase 1.5 onward, only the trip creator can delete the whole trip.
- **2026-05: Service worker cache versioning.**
- **2026-05: Supabase URL and anon key in committed code.** Public by design.
- **2026-05: Trips have four statuses: `planning`, `active`, `completed`, `cancelled`.**
- **2026-05: `created_by` / `author_id` / `user_id` auto-set by triggers.**
- **2026-05: No invites, no per-trip membership.**
- **2026-05: Photos as external links in v1.**
- **2026-05: World map archive in Phase 3.**
- **2026-05: No realtime in v1.**
- **2026-05: No offline queueing in v1.**
- **2026-05: Plain HTML/JS/CSS, no framework.**
- **2026-05: Stages are point-to-point.**
- **2026-05: GPX uploads will be stage-level.** Each GPX file should be linked to one stage; trip-level route/archive views will be built by combining stage tracks.

---

## License

The repository currently uses `LICENSE`: **Routefolk Source-Available License v1.0**.

This is **not** an open-source licence in the OSI sense. It allows personal and non-commercial use, study, and modification, but prohibits commercial use, redistribution, sublicensing, publication of modified versions, hosted/SaaS use, and selling copies or derivatives without prior written permission.

This licence matches the current intent of the project: a personal-use app built for a small trusted group, not a reusable commercial product or community open-source package.

If the intent changes later and the project should become truly open source, replace the custom licence with a standard licence such as MIT or Apache-2.0. Until then, keep the current source-available licence.
