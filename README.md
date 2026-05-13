# routefolk

A Progressive Web App for planning, journaling, and archiving motorcycle trips taken with friends.

This README is updated for the current modularisation step. The app remains a no-build, plain HTML/CSS/JavaScript PWA using native ES modules.

---

## Current step

**Phase 3.9D — Archive screen extraction**

This step continues the controlled `app.js` modularisation.

Implemented in this package:

- Extracted Account screen rendering to `screens/account-screen.js`.
- Extracted user/profile display helpers to `utils/user.js`.
- Kept event binding, auth handlers, data loading, Archive, Trip Detail, and Trip Summary inside `app.js` for now.
- Updated `index.html` and `sw.js` release strings for PWA cache refresh.
- Updated `sw.js` shell assets so the new ES modules are cached for installed-PWA use.

This is still intentionally conservative. Account is a low-risk screen. Trip Detail remains the risky dependency-heavy screen and should stay until later.

---

## Updated recommended implementation order

### Done / effectively handled

- Add DB-level `app_members` allowlist — handled in the hardening package, assuming migration `010_app_membership_hardening.sql` has been applied.
- Update RLS policies to require `is_app_member()` — handled in the hardening package, assuming migration `010_app_membership_hardening.sql` has been applied.
- Add Cloudflare `_headers` with CSP/security headers — handled in the hardening package.
- Remove `goo.gl` from allowed Maps hosts — handled in the hardening package and related URL modules.
- Add GPX coordinate range filtering — handled in the hardening package.
- Split `app.js` into screens/components — in progress. Constants, state, utilities, modal/toast, Trips screen, and Account screen are now extracted.

### Do now

- Confirm Supabase production Site URL and redirect URLs are set for the deployed domain.
- Smoke test the DB membership hardening with one allowed user and one non-member account.
- Continue the screen split with the Archive screen next.

### Do next

- Extract `screens/archive-screen.js`.
- Extract Trip Summary after Archive.
- Extract Trip Detail last.
- Store simplified GPX geometry at upload time.
- Cache archive heatmap calculations by track IDs + viewport.
- Add Playwright smoke tests.
- Add DB triggers for date consistency.

### Defer

- Offline write queue.
- Realtime collaboration.
- Full role/membership system with multiple groups.
- Photo storage.
- PDF export.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Plain HTML, CSS, JavaScript, native ES modules |
| Hosting | Cloudflare Pages |
| Backend | Supabase Auth, Postgres, Storage |
| Auth | Google sign-in via Supabase |
| Weather/geocoding | Open-Meteo APIs |
| PWA | Hand-written service worker |
| Maps/archive | GPX-first geography overview and heatmap |

---

## Project structure

```text
routefolk/
├── index.html                  # App shell
├── style.css                   # All styles
├── app.js                      # Main coordinator, loaders, event binding, archive/detail/summary screens for now
├── components/
│   ├── feedback.js             # Shared signed-out/error state helpers
│   ├── modal.js                # Modal helper
│   ├── toast.js                # Toast helper
│   └── trip-card.js            # Shared trip card and visibility-pill rendering
├── constants/
│   └── app-constants.js        # Status, visibility, entry, expense, and archive boundary constants
├── screens/
│   ├── account-screen.js       # Account screen and PWA install helper rendering
│   └── trips-screen.js         # Trips screen rendering and filtering
├── state/
│   └── app-state.js            # Shared app state object
├── utils/
│   ├── datetime.js             # Date/time formatting and validation helpers
│   ├── dom.js                  # DOM and escaping helpers
│   ├── format.js               # Currency/distance/duration/amount formatting helpers
│   ├── url.js                  # URL validation and host display helpers
│   └── user.js                 # User/profile display helpers
├── lib/
│   ├── config.js               # Supabase URL + anon key
│   ├── supabase.js             # Supabase client setup
│   ├── auth.js                 # Auth helpers
│   ├── meta.js                 # Schema-version helper
│   ├── trips.js                # Trip CRUD
│   ├── stages.js               # Stage CRUD + reorder RPC
│   ├── geocoding.js            # Open-Meteo geocoding wrapper
│   ├── weather.js              # Open-Meteo weather wrapper
│   ├── journal.js              # Journal CRUD
│   ├── profiles.js             # Profile upsert/list
│   ├── expenses.js             # Expense CRUD
│   └── gpx.js                  # GPX upload/parsing/storage helpers
├── sw.js                       # Service worker
├── manifest.json               # PWA manifest
├── schema.sql                  # Full schema snapshot
├── migrations/                 # Supabase SQL migrations
└── README.md
```

---

## Refactor strategy

The modularisation order is intentionally conservative:

1. Shared constants/state/utils/components — done in Phase 3.9A.
2. Trips screen — done in Phase 3.9B.
3. Account screen — done in Phase 3.9C.
4. Archive screen — next.
5. Trip Summary.
6. Trip Detail — last, because it touches stages, journal, expenses, GPX, weather, modals, summary rendering, and event binding.

Do not start with Trip Detail. It is still the dependency swamp.

---

## Deployment notes

For this step there is no database migration.

After applying the files:

1. Run a local smoke test.
2. Confirm Account loads signed out and signed in.
3. Confirm People with access still renders.
4. Confirm Sign out still works.
5. Confirm Trips and Archive still load.
6. Commit the change.
7. Deploy normally through Cloudflare Pages.
8. For installed PWAs, close and reopen the app after deploy.

---

## Suggested commit

```bash
git commit -m "refactor(account): extract account screen rendering"
```
