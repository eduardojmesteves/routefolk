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

The app is for a fixed, trusted group of friends. Anyone who signs in with Google sees all trips. There are no per-trip permissions, no invites, no roles.

Access is enforced via the Google OAuth consent screen's **Test users** list — only emails on that list can complete sign-in.

Within the app, all signed-in users can edit and delete each other's trips, stages, and journal entries. The journal entries always show the original author, so credit is preserved.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Plain HTML + CSS + JS, native ES modules | No build step |
| Hosting | Cloudflare Pages, deployed from GitHub | Free, deploy on push |
| Backend | Supabase (Auth + Postgres + Storage) | Free tier generous |
| Auth | Google sign-in via Supabase | No passwords |
| Maps (archive) | Leaflet + OpenStreetMap | Free — Phase 3 |
| Maps (navigation) | Google Maps intent links + user-pasted custom URLs | |
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
| updated_by / updated_at | | auto-set on UPDATE |

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
| custom_route_url | text | optional user-pasted Maps URL |
| distance_km | double precision | |
| notes | text | |
| updated_by / updated_at | | auto-set on UPDATE |

### `journal_entries`
| Field | Type | Notes |
|---|---|---|
| stage_id | uuid | ON DELETE CASCADE |
| author_id | uuid | auto-set on INSERT; preserved on UPDATE |
| entry_type | text | `stop` / `meal` / `lodging` / `note` / `drink` / `other` |
| title / description / location | text | |
| timestamp | timestamptz | when it happened (not when entered) |
| photo_album_url | text | optional, https-only |

### `expenses`
Per-user, no splits.

### `video_notes`
One row per trip.

### `gpx_tracks`
A track may belong to a stage OR a whole trip.

---

## External APIs

### Open-Meteo (CC BY-NC 4.0)

- **Geocoding**: `GET https://geocoding-api.open-meteo.com/v1/search` — fuzzy place-name search. Cached 7 days.
- **Forecast**: `GET https://api.open-meteo.com/v1/forecast` — daily forecast, max 16 days ahead. Cached 1 hour.

### Google Maps (intent links + user-pasted)

Custom URLs take priority over auto-generated ones. Validated `https` + allowlisted hosts.

---

## Database migrations

Full current schema in `schema.sql` (idempotent). Incremental changes are tracked as numbered files in `migrations/`. Each migration is idempotent and pasted into Supabase's SQL Editor.

**⚠️ Important:** migrations must be run manually in Supabase **before** deploying the code that uses them, otherwise PostgREST returns "Could not find the X column" errors.

| Migration | Description |
|---|---|
| `001_custom_route_url.sql` | Adds `custom_route_url` to stages, plus `updated_by`/`updated_at` audit columns + triggers on trips and stages |

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

**Stages**
- [x] Add / edit / reorder / delete
- [x] Google Maps Navigate button
- [x] Custom Maps URL override

**Weather**
- [x] Auto-geocode city names
- [x] Forecast for start / midpoint / end on planned date
- [x] Graceful failure handling

**Journal**
- [x] Add / list / edit / delete entries
- [x] Entry types with icons
- [x] Author shown on each entry
- [x] Optional external photo album link

**Polish**
- [x] Bottom nav (mobile) / sidebar (desktop) responsive
- [ ] Loading states and error messages — refined as features land
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

Lower-priority items captured so they're not forgotten.

- **Display "last edited by … at …" on trips and stages.** Data is being captured in `updated_by` / `updated_at`. Display requires a `profiles` table mirroring user names. Same table will let journal entries show the author's real name instead of just initials/"Friend."
- **Geocoder ambiguity hints.** Show country alongside ambiguous city names.
- **Long-range weather outlook** beyond the 16-day Open-Meteo forecast.

---

## Things to revisit

- **iOS bottom nav padding feels too tall.** Visual balance tuning.
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
├── app.js                  # Main app logic and state
├── lib/
│   ├── config.js           # Supabase URL + anon key
│   ├── supabase.js         # Supabase client setup
│   ├── auth.js             # Sign-in / sign-out / current user
│   ├── trips.js            # Trip CRUD
│   ├── stages.js           # Stage CRUD with auto-geocoding & custom-URL validation
│   ├── geocoding.js        # Open-Meteo geocoding wrapper + cache
│   ├── weather.js          # Open-Meteo forecast wrapper + cache
│   └── journal.js          # Journal entry CRUD
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
- **2026-05: Hard delete for trips, with confirmation suggesting `cancelled` instead.**
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
- **2026-05: GPX tracks can link to stage or trip.**

---

## License

To be decided. Likely MIT or CC0 for personal-use simplicity.
