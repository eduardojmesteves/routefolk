# routefolk

routefolk is a small Progressive Web App for planning, journaling, and archiving motorcycle trips with friends.

It is designed for a fixed riding group, not as a public social network or commercial trip-planning platform. The goal is simple: plan the route, ride the trip, record the memories, track shared costs, import GPS tracks, and keep a useful archive afterwards.

---

## What the app does

routefolk covers the full trip lifecycle:

1. **Plan** a motorcycle trip with dates, stages, route links, notes, and weather context.
2. **Ride** the trip while adding journal entries for stops, meals, lodging, drinks, and other notes.
3. **Track costs** in euros, including payer, category, optional stage assignment, and total trip spend.
4. **Import GPX tracks** per stage after the ride.
5. **Archive completed trips** with list and map views, including a GPX-derived heatmap.

---

## Current features

### Trips

- Create, edit, view, and delete trips.
- Trip statuses: Planning, Active, Completed, Cancelled.
- Active trips and archived trips are shown separately.
- Private/group visibility model.
- Trip summary metrics: days, stages, distance, entries, authors, average distance, and cost.

### Stages

- Add, edit, delete, and reorder stages.
- Store start/end locations, planned date, notes, distance, and Google Maps links.
- Custom route URL support.
- Weather forecast strip using Open-Meteo.
- Stage-level GPX upload and management.

### Journal

- Add, edit, and delete journal entries per stage.
- Entry types: Stop, Meal, Lodging, Note, Drink, Other.
- Optional location, Google Maps URL, website URL, and external photo-album URL.
- Author labels and timestamps.

### Expenses

- Add, edit, and delete trip expenses.
- EUR-only expense tracking.
- Categories: fuel, food & drinks, lodging, tolls, parking, other.
- Payer selection for group trips.
- Category and payer breakdowns.
- Optional stage assignment.

### Archive

- Completed and cancelled trips are separated from active planning work.
- Archive list view with trip metrics.
- Archive map view powered by uploaded GPX tracks.
- Heatmap, Hybrid, and Routes map modes.
- No fake straight-line route rendering.

### PWA

- Installable on mobile and desktop.
- Hand-written service worker.
- Online-only writes; offline editing is deliberately not implemented yet.

---

## How to use it

1. Sign in with Google.
2. Create a trip and choose whether it is private or group-visible.
3. Add stages for each riding day or route segment.
4. Add notes, route links, and planned dates.
5. During or after the trip, add journal entries and expenses.
6. Upload GPX files to stages after riding.
7. Mark the trip as completed to make it part of the archive.

---

## Technology

| Layer | Choice |
|---|---|
| Frontend | Plain HTML, CSS, and JavaScript with native ES modules |
| Hosting | Cloudflare Pages |
| Backend | Supabase Auth, Postgres, and Storage |
| Authentication | Google sign-in through Supabase |
| Weather/geocoding | Open-Meteo |
| Map archive | In-app SVG geography/heatmap from GPX data |
| PWA | Custom service worker and manifest |

The project intentionally avoids React, Vue, Svelte, Tailwind, TypeScript, and build tools for now.

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
├── screens/
├── state/
├── utils/
├── migrations/
├── sw.js
├── manifest.json
├── icons/
└── README.md
```

`migrations/` contains database schema changes. These files are part of the project history and should not contain private user data.

`docs/` is intentionally ignored by Git and should be used only for local/private operational notes.

---

## Planned features

### Near term

- Finish splitting the large `app.js` file into smaller screen/component modules.
- Store simplified GPX geometry at upload time.
- Cache archive heatmap calculations by track IDs and viewport.
- Add Playwright smoke tests.
- Add stronger database date-consistency checks.

### Later

- Offline write queue.
- Realtime collaboration.
- Multiple groups and richer roles.
- Photo storage.
- PDF or shareable trip export.

---

## Project status

routefolk is under active development. It is suitable for personal testing and controlled group use, but not a general public product.

---

## Contact

Maintained by Eduardo Esteves.

GitHub: [@eduardojmesteves](https://github.com/eduardojmesteves)
