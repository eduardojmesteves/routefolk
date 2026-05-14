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
| Backend | Supabase Auth, Postgres, and Storage |
| Auth | Google sign-in through Supabase |
| Maps/navigation | Google Maps links |
| Weather/geocoding | Open-Meteo |
| PWA | Hand-written service worker |

---

## Project structure

```text
routefolk/
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

`docs/`, `tools/`, and `local-tests/` are intended for local/private development or administration and should not be committed to the public production repo unless that decision changes.

---

## Planned features

Near-term:

- Continue reducing `app.js` into smaller stable modules.
- Improve GPX handling after more real ride data is available.
- Add safer local-only smoke-test tooling for development.
- Add more archive polish after the current performance work settles.

Later:

- Offline write queue.
- Realtime collaboration.
- Multiple groups and richer roles.
- Photo storage.
- PDF/shareable trip export.
- Custom date picker if native browser date pickers become a real limitation.

---

## Feature requests and bug reports

Feature requests and bug reports are welcome through GitHub Issues.

Please use the appropriate label:

- `bug` for broken behaviour, crashes, confusing errors, or incorrect results.
- `enhancement` for new features, UX improvements, or workflow ideas.

Include enough detail to reproduce the problem or understand the proposed improvement.

---

## Contact

Maintained by **Eduardo Esteves**.

For questions, feature requests, or bug reports, use the repository Issues page.

---

## Licence

This project uses the **Routefolk Source-Available License v1.0**.

Personal and non-commercial use, study, and modification are allowed. Commercial use, redistribution, sublicensing, publication of modified versions, hosted/SaaS use, and selling copies require prior written permission from the copyright holder.

See [`LICENSE`](./LICENSE) for the full terms.
