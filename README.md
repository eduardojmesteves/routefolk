# routefolk

A Progressive Web App for planning, journaling, and archiving motorcycle trips taken with friends.

This document is the source of truth for the project: what it is, what it isn't, how it's built, and what comes next. It will be updated as the project advances.

---

## What this is

A small, personal-use app for a fixed group of friends who ride motorcycles together. It covers the full lifecycle of a trip: planning the route together, journaling the experience as it happens, tracking per-person costs, importing GPS tracks after the ride, and archiving past trips on a world map.

Not a commercial product. Not a startup. Built for ourselves.

---

## Core principles

1. **Simple stack, no build step.** Plain HTML, CSS, and JavaScript. No framework, no bundler, no transpiler. Push files, deploy.
2. **Mobile-first, tablet- and desktop-friendly.** Designed for a phone screen at the side of the road, but expands gracefully on bigger displays.
3. **Cheap to run.** Free tiers only.
4. **Open the door, don't walk through it.** Realtime, offline queueing, photo hosting — possible in this architecture, not built until needed.
5. **Honesty about scope.** Defer what can be deferred. Use external tools (Splitwise, Google Maps) when they exist.

---

## Access model

The app is for a fixed, trusted group of friends. Anyone who signs in with Google sees all trips. There are no per-trip permissions, no invites, no roles.

Access is enforced via the Google OAuth consent screen's **Test users** list — only emails on that list can complete sign-in.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Plain HTML + CSS + JS, native ES modules | No build step, low cognitive overhead |
| Hosting | Cloudflare Pages, deployed from GitHub | Free, fast, deploy on push |
| Backend | Supabase (Auth + Postgres + Storage) | Free tier generous enough |
| Auth | Google sign-in via Supabase | No passwords |
| Maps (archive) | Leaflet + OpenStreetMap | Free, no API key — Phase 3 |
| Maps (navigation) | Google Maps intent links + user-pasted custom URLs | Hand off to user's existing maps app |
| Geocoding | Open-Meteo geocoding API | Free, no key |
| Weather | Open-Meteo forecast API | Free, no key, 16-day forecast |
| Photos | External album links | Defers photo storage entirely |
| PWA | Hand-written service worker | No plugin |
| Icons | Inline SVGs | No icon library |

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

### `trips`
| Field | Type | Notes |
|---|---|---|
| created_by | uuid | auto-set on INSERT |
| title | text | NOT NULL |
| description | text | |
| start_date / end_date | date | |
| cover_photo_url | text | external link |
| status | text | `planning` / `active` / `completed` / `cancelled` |
| updated_by | uuid | auto-set on UPDATE |
| updated_at | timestamptz | auto-set on UPDATE |

### `stages`
| Field | Type | Notes |
|---|---|---|
| trip_id | uuid | ON DELETE CASCADE |
| order_index | int | for ordering |
| title | text | |
| start_location / end_location | text | human-readable city names |
| start_lat / start_lng / end_lat / end_lng | double precision | auto-filled via geocoding |
| planned_date | date | |
| gmaps_url | text | auto-built from start/end |
| custom_route_url | text | optional user-pasted Maps URL; takes priority for Navigate button |
| distance_km | double precision | |
| notes | text | |
| updated_by | uuid | auto-set on UPDATE |
| updated_at | timestamptz | auto-set on UPDATE |

### `journal_entries`
| Field | Type | Notes |
|---|---|---|
| stage_id | uuid | ON DELETE CASCADE |
| author_id | uuid | auto-set on INSERT |
| entry_type | text | `stop` / `meal` / `lodging` / `note` / `drink` / `other` |
| title / description / location | text | |
| timestamp | timestamptz | when it happened |
| photo_album_url | text | external link |

### `expenses`
Per-user, no splits.

| Field | Type | Notes |
|---|---|---|
| trip_id | uuid | ON DELETE CASCADE |
| user_id | uuid | auto-set on INSERT |
| category | text | `fuel` / `food` / `lodging` / `tolls` / `other` |
| amount | numeric(12, 2) | exact |
| currency | text | ISO code, default EUR |
| description | text | |
| date | date | |

### `video_notes`
One row per trip, enforced by `UNIQUE(trip_id)`.

### `gpx_tracks`
A track may belong to a stage OR to a whole trip.

---

## External APIs

### Open-Meteo (CC BY-NC 4.0)

- **Geocoding**: `GET https://geocoding-api.open-meteo.com/v1/search` — fuzzy place-name search. Cached 7 days in localStorage.
- **Forecast**: `GET https://api.open-meteo.com/v1/forecast` — daily forecast, max 16 days ahead. Cached 1 hour in localStorage.

Forecast strategy per stage: fetch start, midpoint, and end. Skip midpoint if start/end < 50 km apart.

### Google Maps (intent links + user-pasted)

The Navigate button on each stage opens a Google Maps URL. Two sources, in priority order:

1. **`custom_route_url`** — if the user has pasted a Google Maps share link (e.g. `https://maps.app.goo.gl/...`). Validated to be `https` and point to a Google Maps host.
2. **`gmaps_url`** — auto-generated from start/end locations.

The custom URL is preserved across edits — it's never silently overwritten when start/end locations change.

---

## Database migrations

The full current schema is in `schema.sql` (idempotent, safe to re-run for fresh setups). Incremental changes are tracked as numbered files in `migrations/`. Each migration is idempotent and meant to be pasted into Supabase's SQL Editor.

| Migration | Description |
|---|---|
| `001_custom_route_url.sql` | Adds `custom_route_url` to stages, plus `updated_by`/`updated_at` audit columns + triggers on trips and stages |

---

## Roadmap

Each phase produces a working, deployable app.

### Phase 1 — MVP: plan + journal

**Foundation**
- [x] Repo created, deployed to Cloudflare Pages on push
- [x] Supabase project set up, Google OAuth configured
- [x] Database schema created
- [x] Row-Level Security policies
- [x] App shell: HTML, CSS, service worker, manifest
- [x] PWA installable on iOS and Android
- [x] Auth flow: sign in with Google, sign out

**Trips**
- [x] Create / list / view / edit / delete trips
- [x] Archive tab shows completed and cancelled trips

**Stages**
- [x] Add / edit / reorder / delete stages
- [x] Show Google Maps intent link to navigate the stage
- [x] Custom Maps URL override for hand-tuned routes

**Weather**
- [x] Auto-geocode city names on save
- [x] Show weather forecast for stage start, midpoint, end on the planned date
- [x] Handle Open-Meteo failures gracefully

**Journal**
- [ ] Add a journal entry to a stage
- [ ] List entries for a stage, sorted by timestamp
- [ ] Show who wrote each entry
- [ ] Edit a journal entry
- [ ] Delete a journal entry

**Polish**
- [x] Bottom nav (mobile) / sidebar (desktop) responsive
- [ ] Loading states and error messages — partially done; refine as features land
- [ ] Online-only with clear "you're offline" message when applicable

### Phase 2 — Money

- [ ] Add / list / edit / delete expenses
- [ ] Trip total per user / per category

### Phase 3 — Archive + tracks

- [ ] Leaflet world map with completed trips
- [ ] Drill-down: world → country → trip → stage → journal entries
- [ ] Past trips list view as alternative to map
- [ ] Basic stats per trip
- [ ] Upload + parse GPX files
- [ ] Display GPX track on the trip's map view

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

Lower-priority items captured so they're not forgotten. These will be picked up when there's a natural moment, or when one of them becomes blocking.

- **Display "last edited by … at …" on trips and stages.** The data is being captured in `updated_by` / `updated_at` columns from step 6.5 onwards. Display requires a `profiles` table mirroring user names, which we'll add when we tackle journal entries (so trips, stages, and entries all use the same display path).
- **Geocoder ambiguity hints.** When a city name has multiple matches (e.g. Springfield), show the country in the result so the user can decide whether to override.
- **Long-range weather outlook** beyond the 16-day Open-Meteo forecast — useful for early-stage trip planning.

---

## Things to revisit

Small known issues and refinements that aren't blocking.

- **iOS bottom nav padding feels too tall.** Worth tuning visual balance later.
- **Site URL in Supabase is currently `http://localhost:8000`** for development convenience. Change to production Cloudflare Pages URL once daily development slows down.
- **Weather attribution** is a small line on each weather strip. If it ever feels noisy, move to Account screen as a global "Data sources" list.

---

## Working model

This project is a partnership.

**Human (10–20%):** scoping, decisions, testing, real-world feedback, surfacing requirements as they emerge from real trips, reviewing output.

**AI assistant (80–90%):** writing code, explaining what it does, debugging support, suggesting architecture, anticipating issues.

The human is a capable engineer new to this specific stack — explanations should cover the *why* alongside the *what*. Anti-patterns flagged, not silently worked around. Push back on ideas that will cause pain later.

---

## Project structure

```
routefolk/
├── index.html              # App shell
├── style.css               # All styles
├── app.js                  # Main app logic and state
├── lib/
│   ├── config.js           # Supabase URL + anon key
│   ├── supabase.js         # Supabase client setup
│   ├── auth.js             # Sign-in / sign-out / current user
│   ├── trips.js            # Trip CRUD
│   ├── stages.js           # Stage CRUD with auto-geocoding & custom-URL validation
│   ├── geocoding.js        # Open-Meteo geocoding wrapper + cache
│   └── weather.js          # Open-Meteo forecast wrapper + cache
├── sw.js                   # Service worker (bump CACHE on shell changes)
├── manifest.json           # PWA manifest
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── schema.sql              # Full current database schema (idempotent)
├── migrations/             # Incremental schema changes, run in order
│   └── 001_custom_route_url.sql
└── README.md               # This file
```

---

## Decisions log

A running list of decisions made and why. New entries go at the top.

- **2026-05: Audit columns captured now, displayed later.** `updated_by` / `updated_at` on trips and stages are populated by triggers from step 6.5 onwards. Display deferred until a `profiles` table exists for user-name lookups.
- **2026-05: Custom Maps URL is a separate column, never auto-overwritten.** Two URL fields on stages: auto-generated `gmaps_url` and user-pasted `custom_route_url`. Navigate button uses custom if present, else auto. Editing start/end locations does NOT clobber the custom URL.
- **2026-05: Custom URL validation: https only, allowlisted Google Maps hosts.** Allowed: `google.com`, `www.google.com`, `maps.google.com`, `goo.gl`, `maps.app.goo.gl`. Anything else throws on save.
- **2026-05: Migrations folder for incremental schema changes.** `schema.sql` always reflects current state. Incremental changes go in `migrations/NNN_name.sql`, idempotent, manually run in Supabase SQL Editor.
- **2026-05: Geocoding via Open-Meteo, weather inline.** GPX-during-planning rejected — GPX exists post-ride, doesn't solve the planning-time weather problem.
- **2026-05: Weather cached 1 hour, geocoding cached 7 days.** Forecasts move; place coordinates don't.
- **2026-05: Skip midpoint forecast when start/end < 50 km apart.**
- **2026-05: Trips list sorted by start_date DESC, nulls last.**
- **2026-05: Active list = `planning` + `active`. Archive list = `completed` + `cancelled`.**
- **2026-05: Hard delete for trips, with confirmation suggesting `cancelled` instead.**
- **2026-05: Service worker cache versioning.** Bump on shell changes.
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
- **2026-05: GPX tracks can link to stage or trip.**

---

## License

To be decided. Likely MIT or CC0 for personal-use simplicity.
