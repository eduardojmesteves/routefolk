# routefolk

A Progressive Web App for planning, journaling, and archiving motorcycle trips taken with friends.

This document is the source of truth for the project: what it is, what it isn't, how it's built, and what comes next. It will be updated as the project advances.

---

## What this is

A small, personal-use app for a fixed group of friends who ride motorcycles together. It covers the full lifecycle of a trip: planning the route together, journaling the experience as it happens, tracking per-person costs, importing GPS tracks after the ride, and archiving past trips on a world map.

Not a commercial product. Not a startup. Built for ourselves.

---

## Core principles

1. **Simple stack, no build step.** Plain HTML, CSS, and JavaScript. No framework, no bundler, no transpiler. Push files, deploy. Inspired by the SwimCoach PWA approach.
2. **Mobile-first, tablet- and desktop-friendly.** Designed for a phone screen at the side of the road, but expands gracefully on bigger displays.
3. **Cheap to run.** Free tiers only. No paid services for as long as possible.
4. **Open the door, don't walk through it.** Realtime collaboration, offline queueing, photo hosting, advanced features — all *possible* in this architecture, but not built until needed.
5. **Honesty about scope.** When something can be deferred, defer it. When something can be replaced by an external tool (Splitwise for cost splitting, Google Maps for navigation), use the external tool.

---

## Access model

The app is for a fixed, trusted group of friends. Anyone who signs in with Google sees all trips. There are no per-trip permissions, no invites, no roles.

Access to the app is controlled the same way access to a private group chat is: by who knows it exists and who has been told to sign in. Currently this is enforced via the Google OAuth consent screen's **Test users** list — only emails on that list can complete sign-in.

If that ever becomes the wrong model (someone joins who shouldn't see everything, a private trip needs to be planned), per-trip membership can be added later as a non-breaking change.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Plain HTML + CSS + JS, native ES modules | No build step, low cognitive overhead, fast to iterate |
| Hosting | Cloudflare Pages, deployed from GitHub | Free, fast, deploy on push |
| Backend | Supabase (Auth + Postgres + Storage) | Free tier generous enough for personal use |
| Auth | Google sign-in via Supabase | No passwords, no friction |
| Maps (archive) | Leaflet + OpenStreetMap | Free, no API key |
| Maps (navigation) | Google Maps intent links | Hand off to the user's existing maps app |
| Weather | Open-Meteo API | Free, no key, generous limits |
| Photos | External album links (Google Photos, iCloud, Nextcloud later) | Defers the complexity of photo storage entirely |
| PWA | Hand-written service worker (~80 lines) | No plugin needed |
| Icons | Inline SVGs (Lucide-style) | No icon library dependency |

### Stack things deliberately not used

- **No SvelteKit / React / Vue.** Plain JS keeps the learning surface small and matches the SwimCoach pattern that worked.
- **No Tailwind / shadcn / component library.** Hand-written CSS, ~400-500 lines total expected.
- **No TypeScript.** Acceptable trade-off for app size; revisit if the codebase grows.
- **No build tools (Vite, Webpack, etc.).** Native ES modules are enough.
- **No realtime subscriptions in v1.** Refresh-to-see is fine for trip planning. The free tier supports realtime; we'll add it when the value is clear.

---

## Data model

Tables live in Supabase Postgres. All tables have `id` (UUID) and `created_at` unless noted.

### `users`
Managed by Supabase Auth. We don't write to this directly. Used as a reference for `created_by` / `author_id` fields and for displaying who wrote what.

### `trips`
| Field | Type | Notes |
|---|---|---|
| created_by | uuid | references auth.users; auto-set by trigger |
| title | text | NOT NULL |
| description | text | |
| start_date | date | |
| end_date | date | |
| cover_photo_url | text | external link |
| status | text | `planning` / `active` / `completed` / `cancelled` |

All signed-in users can read and edit all trips.

### `stages`
One stage = one route segment, not strictly one day. A trip can have many stages.

| Field | Type | Notes |
|---|---|---|
| trip_id | uuid | ON DELETE CASCADE |
| order_index | int | for ordering |
| title | text | |
| start_location | text | human-readable, e.g. "Lisbon" |
| start_lat / start_lng | double precision | for weather and map |
| end_location | text | |
| end_lat / end_lng | double precision | |
| planned_date | date | |
| gmaps_url | text | Google Maps intent link |
| distance_km | double precision | |
| notes | text | |

**Decision logged:** Stages are point-to-point in v1. Intermediate weather points are computed from start/end coordinates, not stored separately. If we later want named waypoints, we add a `stage_waypoints` table.

### `journal_entries`
| Field | Type | Notes |
|---|---|---|
| stage_id | uuid | ON DELETE CASCADE |
| author_id | uuid | auto-set by trigger |
| entry_type | text | `stop` / `meal` / `lodging` / `note` / `drink` / `other` |
| title | text | |
| description | text | |
| location | text | optional |
| timestamp | timestamptz | when it happened, not when entered |
| photo_album_url | text | external link to photo album for this entry |

### `expenses`
Per-user, no splits.

| Field | Type | Notes |
|---|---|---|
| trip_id | uuid | ON DELETE CASCADE |
| user_id | uuid | auto-set by trigger |
| category | text | `fuel` / `food` / `lodging` / `tolls` / `other` |
| amount | numeric(12, 2) | exact, never float |
| currency | text | ISO code, default EUR |
| description | text | |
| date | date | |

### `video_notes`
One row per trip, enforced by `UNIQUE(trip_id)`.

| Field | Type | Notes |
|---|---|---|
| trip_id | uuid | UNIQUE, ON DELETE CASCADE |
| content | text | freeform notes |
| song_title | text | |
| song_artist | text | |
| song_url | text | |
| updated_at | timestamptz | auto-touched on update |

### `gpx_tracks`
| Field | Type | Notes |
|---|---|---|
| trip_id | uuid | ON DELETE CASCADE |
| stage_id | uuid | nullable; ON DELETE SET NULL |
| file_path | text | Supabase Storage path |
| distance_km | double precision | |
| duration_seconds | int | |
| uploaded_at | timestamptz | |

**Decision logged:** GPX tracks link to either a stage or a whole trip, since real rides don't always match planned stages.

---

## Roadmap

Each phase produces a working, deployable app. Tasks within a phase can be reordered, but the phases themselves are sequential.

### Phase 1 — MVP: plan + journal

Goal: usable for the next real trip. Plan a trip, see weather, write journal entries during the ride.

**Foundation**
- [x] Repo created, deployed to Cloudflare Pages on push
- [x] Supabase project set up, Google OAuth configured
- [x] Database schema created (all tables above)
- [x] Row-Level Security policies: any signed-in user can read/write all rows
- [x] App shell: HTML, CSS, service worker, manifest
- [x] PWA installable on iOS and Android
- [x] Auth flow: sign in with Google, sign out

**Trips**
- [ ] Create a trip (title, dates, description)
- [ ] List all trips (visible to everyone signed in)
- [ ] View a single trip
- [ ] Edit trip details
- [ ] Delete a trip (with confirmation)

**Stages**
- [ ] Add a stage to a trip
- [ ] Reorder stages
- [ ] Edit a stage (start, end, date, distance, notes)
- [ ] Delete a stage
- [ ] Show Google Maps intent link to navigate the stage

**Weather**
- [ ] Show weather forecast for stage start, midpoint, end on the planned date
- [ ] Handle Open-Meteo failures gracefully (show "weather unavailable")

**Journal**
- [ ] Add a journal entry to a stage (type, title, description, timestamp, location, optional photo album link)
- [ ] List entries for a stage, sorted by timestamp
- [ ] Show who wrote each entry
- [ ] Edit a journal entry
- [ ] Delete a journal entry

**Polish**
- [ ] Bottom nav (mobile) / sidebar (desktop) responsive — done in shell
- [ ] Loading states and error messages
- [ ] Online-only with clear "you're offline" message when applicable

### Phase 2 — Money

Goal: track per-person trip costs.

- [ ] Add an expense to a trip (category, amount, currency, description, date)
- [ ] List my expenses for a trip
- [ ] Trip total per user
- [ ] Trip total per category
- [ ] Edit and delete expenses
- [ ] Currency display (no conversion in v1; show as entered)

### Phase 3 — Archive + tracks

Goal: see past trips visually, import GPS data.

**World map archive**
- [ ] Leaflet map rendering completed trips as markers/lines
- [ ] Drill-down: world view → country → trip → stage → journal entries
- [ ] Past trips list view as alternative to map
- [ ] Basic stats per trip (total distance, days, journal entries, photos linked)

**GPX**
- [ ] Upload a GPX file (linked to trip or stage)
- [ ] Parse GPX, extract distance and duration
- [ ] Display GPX track as a line on the trip's map view
- [ ] Show actual vs planned route comparison

### Phase 4 — Polish

Goal: make the app pleasant to use, add finishing touches.

- [ ] Video planning noteblock per trip (notes + song info)
- [ ] PWA install prompts at the right moments
- [ ] Offline app shell (already works; refine cache strategy)
- [ ] Offline write queue: edits saved locally, synced when online
- [ ] Realtime updates: changes from friends appear without refresh
- [ ] Mobile UX refinements based on real-trip use
- [ ] Export trip to PDF or shareable read-only view
- [ ] Packing list per trip (simple checklist)

### Phase 5+ — Later

Things on the radar but not committed to. Considered when there's a clear reason.

- Per-trip membership and roles (if the open-access model ever burns us)
- Bike profiles (which bike per trip, per rider)
- Maintenance log
- Gear inventory
- Photo upload + storage (when NAS + Nextcloud is ready)
- Pre-ride essentials (fuel range estimation, checks)
- Voice notes for journal entries

---

## Working model

This project is a partnership.

**Human (10–20%):** scoping, decisions, testing, real-world feedback, surfacing requirements as they emerge from real trips, reviewing output.

**AI assistant (80–90%):** writing code, explaining what it does, debugging support, suggesting architecture, anticipating issues, translating between the human's Python/R intuition and JavaScript/web idioms.

The human is a capable engineer new to this specific stack — explanations should cover the *why* alongside the *what*, especially for frontend concepts. Anti-patterns should be flagged, not silently worked around. Push back on ideas that will cause pain later.

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
│   └── auth.js             # Sign-in / sign-out / current user
├── sw.js                   # Service worker (bump CACHE version on shell changes)
├── manifest.json           # PWA manifest
├── icons/                  # PWA icons
│   ├── icon-192.png
│   └── icon-512.png
├── schema.sql              # Database schema (run once in Supabase SQL Editor)
└── README.md               # This file
```

`lib/` will grow as Phase 1 progresses (`trips.js`, `stages.js`, `journal.js`, `weather.js`).

---

## Decisions log

A running list of decisions made and why. New entries go at the top.

- **2026-05: Service worker cache versioning.** The `CACHE` constant in `sw.js` must be bumped when shell assets change (e.g. `v1` → `v2`). The activate handler deletes old caches. Without bumping, devices keep serving stale files.
- **2026-05: Supabase URL and anon key live in `lib/config.js`, committed to the repo.** They're public by design; the anon key only allows what RLS policies allow, which is why RLS was set up first.
- **2026-05: Trips have four statuses: `planning`, `active`, `completed`, `cancelled`.** `cancelled` exists so we can record a planned-but-not-taken trip without deleting it.
- **2026-05: Hard delete with confirmation, no soft-delete or archive table.** Past trips are `status='completed'`; that's the archive. Hard delete is reserved for real mistakes (typos, duplicates).
- **2026-05: `created_by` / `author_id` / `user_id` are auto-set by database triggers from `auth.uid()`.** Clients cannot spoof these even if they try.
- **2026-05: No invites, no per-trip membership.** Anyone who signs in sees all trips. Access controlled by Google OAuth Test users list. Reversible: per-trip membership can be added later as an additive change.
- **2026-05: Photos as external links in v1.** Defers all photo storage complexity. Will be revisited when NAS + Nextcloud is set up.
- **2026-05: World map archive moved from Phase 2 to Phase 3.** Nothing to archive until a few trips are completed.
- **2026-05: No realtime in v1.** Refresh-to-see is sufficient for trip planning. Free tier supports it; adding later is straightforward.
- **2026-05: No offline queueing in v1.** Online-only with clear error states. Phase 4 adds write-through cache.
- **2026-05: Plain HTML/JS/CSS, no framework.** SwimCoach proved this works for an app of this size. Migration to a framework remains an option if the app grows.
- **2026-05: Stages are point-to-point.** Intermediate weather points computed, not stored. Add `stage_waypoints` table later if needed.
- **2026-05: GPX tracks can link to stage *or* trip.** Real rides don't always follow planned stages.

---

## License

To be decided. Likely MIT or CC0 for personal-use simplicity.
