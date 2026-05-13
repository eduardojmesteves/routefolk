# routefolk

A Progressive Web App for planning, journaling, and archiving motorcycle trips taken with friends.

This README is updated for the current modularisation step. The app remains a no-build, plain HTML/CSS/JavaScript PWA using native ES modules.

---

## Current step

**Phase 3.9F — Trip Detail screen shell extraction**

Implemented in this package:

- Extracted the Trip Detail screen shell to `screens/trip-detail-screen.js`.
- Kept the tightly-coupled stage, journal, GPX, expense, modal, and write-handler logic in `app.js` for now.
- Added `.gitignore` entry for `/docs/` so operational docs stay local/private while the GitHub repository remains public.
- Rebuilt local operational docs under `docs/` as practical guides only.
- Updated `index.html` and `sw.js` release strings for PWA cache refresh.
- Updated `sw.js` shell assets so the new ES module is cached for installed-PWA use.

This is intentionally conservative. Trip Detail is the dependency-heavy screen; extracting its shell first reduces risk before splitting the internal stage/journal/expense/GPX sections.

---

## Documentation privacy

The GitHub repository is public. A subdirectory inside a public repository cannot be made private.

Operational docs under `docs/` are intentionally ignored by Git via `.gitignore`:

```text
/docs/
```

That means the docs are useful locally but should not be committed to GitHub. Do not store real member email lists, credentials, Supabase screenshots, or secrets in the public repository.

If you already committed `docs/` before adding this ignore rule, remove it from Git tracking while keeping local files:

```bash
git rm -r --cached docs
git commit -m "chore(docs): keep operational docs local"
```

---

## Updated recommended implementation order

### Done / effectively handled

- Add DB-level `app_members` allowlist — handled in the hardening package, assuming migration `010_app_membership_hardening.sql` has been applied.
- Update RLS policies to require `is_app_member()` — handled in the hardening package, assuming migration `010_app_membership_hardening.sql` has been applied.
- Add Cloudflare `_headers` with CSP/security headers — handled in the hardening package.
- Remove `goo.gl` from allowed Maps hosts — handled in the hardening package and URL modules.
- Add GPX coordinate range filtering — handled in the hardening package.
- Split `app.js` into screens/components — in progress. State, constants, utilities, shared components, Trips, Account, Archive, Trip Summary, and the Trip Detail shell are now extracted.

### Do now

- Confirm Supabase production Site URL and redirect URLs are set for the deployed domain.
- Smoke test DB membership hardening with one allowed user and one non-member account.
- Continue reducing Trip Detail internals in small slices: stage section, journal section, expense section, GPX section.

### Do next

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

## Project structure

```text
routefolk/
├── index.html
├── style.css
├── app.js                      # Coordinator, loaders, handlers, modal/write flows, detail internals for now
├── .gitignore                  # Keeps local/private docs out of Git
├── components/
│   ├── feedback.js
│   ├── modal.js
│   ├── stats.js
│   ├── toast.js
│   └── trip-card.js
├── constants/
│   └── app-constants.js
├── screens/
│   ├── account-screen.js
│   ├── archive-screen.js
│   ├── summary-screen.js
│   ├── trip-detail-screen.js
│   └── trips-screen.js
├── state/
│   └── app-state.js
├── utils/
│   ├── datetime.js
│   ├── dom.js
│   ├── format.js
│   ├── url.js
│   └── user.js
├── lib/
│   ├── config.js
│   ├── supabase.js
│   ├── auth.js
│   ├── meta.js
│   ├── trips.js
│   ├── stages.js
│   ├── geocoding.js
│   ├── weather.js
│   ├── journal.js
│   ├── profiles.js
│   ├── expenses.js
│   └── gpx.js
├── sw.js
├── manifest.json
├── schema.sql
├── migrations/
└── docs/                       # Local-only operational docs, ignored by Git
```

---

## Deployment notes

For this step there is no database migration.

After applying the files:

1. Run syntax checks.
2. Run a manual browser smoke test.
3. Confirm Trips, Archive, Account, Trip Detail, and Trip Summary still load.
4. Confirm stage/journal/expense/GPX actions still work.
5. Commit the change.
6. Deploy normally through Cloudflare Pages.
7. Close and reopen installed PWA versions after deploy.

---

## Suggested commit

```bash
git commit -m "refactor(detail): extract trip detail screen shell"
```
