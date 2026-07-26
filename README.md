# routefolk

**routefolk** is a mobile-first Progressive Web App for planning, journaling, and archiving motorcycle trips with friends.

It is built for a small trusted group: plan the trip, organise stages, keep a lightweight travel journal, track shared costs, upload GPX files, and review completed trips in the archive.

---

## What the app does

routefolk helps a riding group manage the full lifecycle of a trip:

1. **Plan** the trip and its daily stages.
2. **Navigate** stages using Google Maps links.
3. **Journal** stops, meals, lodgings, notes, drinks, and other memories.
4. **Track expenses** by payer and category.
5. **Upload GPX tracks** per stage after or during the ride.
6. **Archive completed trips** with statistics, GPX route views, and a heatmap.

The app is intentionally simple. It is not trying to replace Google Maps, Splitwise, a photo album, or a full travel blog.

---

## Current features

### Trips

- Create, edit, list, and delete trips.
- Trip status: Planning, Active, Completed, Cancelled.
- Active trips and archived trips are separated.
- Trip visibility:
  - Private: visible only to the creator.
  - Group: visible to active app members.

### Stages

- Add, edit, reorder, and delete trip stages.
- Store start/end locations, distance, planned date, notes, and Google Maps links.
- Use a custom Google Maps route URL when needed.
- Stage dates are constrained by the trip date range.

### Journal

- Add entries per stage.
- Entry types: Stop, Meal, Lodging, Note, Drink, Other.
- Optional location, Google Maps URL, website URL, photo-album URL, and description.
- Journal time is optional; entries can be date-only unless a specific time matters.

### Expenses

- Add expenses per trip.
- Optional stage assignment.
- EUR-only tracking.
- Categories: Fuel, Food & drinks, Lodging, Tolls, Parking, Other.
- Trip totals, category totals, and payer totals.

### GPX and Archive

- Upload GPX files per stage.
- Store original GPX files in Supabase Storage.
- Cache lightweight GPX geometry for faster archive rendering.
- Archive map supports Heatmap, Hybrid, and Routes modes.
- Cancelled trips remain listed but are not plotted.

### PWA

- Installable app shell.
- Works as a mobile-first web app.
- Online-only writes; write actions are disabled while offline.
- Cloudflare Pages security headers are defined in `_headers`.

---

## How to use it

1. Sign in with Google.
2. Create a trip.
3. Add stages with planned dates and start/end locations.
4. Add journal entries while travelling.
5. Add expenses during or after the trip.
6. Upload GPX tracks to the matching stages.
7. Mark the trip as completed when finished.
8. Review it later in the Archive.

Access is limited to the intended group. New users must be approved by the app administrator.

---

## Technology

| Layer | Choice |
|---|---|
| Frontend | Plain HTML, CSS, and JavaScript |
| App style | Native ES modules, no build step |
| Hosting | Cloudflare Pages |
| Security headers | Cloudflare Pages `_headers` |
| Backend | Supabase Auth, Postgres, and Storage |
| Auth | Google sign-in through Supabase |
| Maps/navigation | Google Maps links |
| Weather/geocoding | Open-Meteo |
| PWA | Hand-written service worker |

---

## Project structure

```text
routefolk/
├── docs/                  # Indexed architecture and operator documentation
├── infrastructure/       # Deployment support, including Docker assets
├── services/             # Independently deployable server-side services
├── docker-compose.yml     # Self-hosted backend stack entry point
├── .env.example           # Non-secret backend configuration template
├── _headers
├── index.html
├── style.css
├── app.js
├── components/
├── constants/
├── lib/
├── migrations/
├── screens/
├── state/
├── utils/
├── sw.js
├── manifest.json
├── icons/
├── schema.sql
├── LICENSE
└── README.md
```

Application code, deployable services, infrastructure definitions, and operator documentation are kept in separate top-level areas. `tools/`, tests, generated environment files, and runtime data remain untracked.

---

## Planned features

Near-term:

- Maintain the small `app.js` controller and continue improving focused modules around it.
- Improve GPX handling after more real ride data is available.
- Keep local-only smoke-test tooling available without committing npm/test files.
- Add more archive polish after the current performance work settles.
- Design the trip packing/item list feature.
- Refresh the app colour palette after the functional refactor is stable.

Later:

- Offline write queue.
- Realtime collaboration.
- Multiple groups and richer roles.
- Image attachments for trips and journal entries.
- PDF/shareable trip export.
- Custom date picker if native browser date pickers become a real limitation.

---

## Feature requests and bug reports

Feature requests and bug reports are welcome through GitHub Issues.

Use the issue templates when opening a new issue:

- **Bug report** — for broken behaviour, crashes, confusing errors, or incorrect results. Use the `bug` label.
- **Feature request** — for new features, UX improvements, or workflow ideas. Use the `enhancement` label.

Useful reports include:

- what happened;
- what you expected;
- steps to reproduce;
- screenshots, if relevant;
- device/browser/PWA context;
- whether the problem happens locally, in production, or both.

---

## Contact

Maintained by **Eduardo Esteves**.

For questions, feature requests, or bug reports, use the repository Issues page.

---

## Licence

This project uses the **Routefolk Source-Available License v1.0**.

Personal and non-commercial use, study, and modification are allowed. Commercial use, redistribution, sublicensing, publication of modified versions, hosted/SaaS use, and selling copies require prior written permission from the copyright holder.

See [`LICENSE`](./LICENSE) for the full terms.

## Final stability closure

The app has been split into focused modules while keeping `app.js` as the controller. Stage handlers and the direct stage fallback intentionally remain in `app.js` because that path is sensitive and has been stabilised there.

## Self-hosted backend for the Cloudflare Pages PWA

The PWA remains deployed on Cloudflare Pages. Docker Compose is only for replacing the hosted Supabase backend on an operator-controlled home server; it runs PostgreSQL, Auth, PostgREST, Storage, the Agent API, and an Nginx API gateway. It does **not** containerise or replace the Cloudflare Pages frontend.

Nothing is deployed automatically. Read the [staged backend migration plan](./SELF_HOSTING.md) before running the stack or changing the production frontend configuration. The existing hosted Supabase URL remains in `lib/config.js` until the new backend has passed local testing, a data-migration rehearsal, and a controlled cutover.

For a disposable backend test:

```sh
./docker/setup-env.sh
docker compose up --build
```

The backend gateway then listens at <http://127.0.0.1:18080>. The PWA must be served separately (as it is in production by Cloudflare Pages) and configured to use that backend during testing. Production requires an HTTPS hostname that securely reaches the home-server gateway; PostgreSQL and internal services must not be exposed directly.

The Agent API is available through the backend origin at `/agent/v1`, with its OpenAPI document at `/agent/v1/openapi.json`. Configure a real approved Routefolk UUID as `AGENT_USER_ID` and keep `AGENT_API_KEY` in the agent's secret store before enabling writes.
