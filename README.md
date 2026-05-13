# routefolk

routefolk is a Progressive Web App for planning, journaling, and archiving motorcycle trips with friends.

It is built for a fixed riding group: plan the route, ride the trip, record what happened, track costs, import GPX tracks, and keep a useful archive afterwards.

---

## What routefolk is for

routefolk helps small motorcycle groups manage the full lifecycle of a trip:

- plan upcoming rides;
- organise each trip into stages;
- keep route notes and useful links together;
- add journal entries during or after the ride;
- track trip expenses in euros;
- upload stage-level GPX files;
- archive completed trips with list and map views.

It is not intended to be a public social network or a commercial trip-planning platform.

---

## Current features

### Trips

- Create, edit, view, and delete trips.
- Trip statuses: Planning, Active, Completed, and Cancelled.
- Separate active trips and archived trips.
- Private/group visibility model.
- Trip summary metrics for days, stages, distance, entries, authors, average distance, and cost.

### Stages

- Add, edit, delete, and reorder stages.
- Store start/end locations, planned dates, notes, distance, and route links.
- Use generated Google Maps links or custom route URLs.
- Show weather context through Open-Meteo.
- Upload and manage GPX files per stage.
- Database-level checks keep stage dates inside the trip date range.

### Journal

- Add, edit, and delete journal entries per stage.
- Entry types: Stop, Meal, Lodging, Note, Drink, and Other.
- Optional location, Google Maps URL, website URL, and external photo-album URL.
- Author labels, with optional time when the exact time matters.

### Expenses

- Add, edit, and delete trip expenses.
- EUR-only expense tracking.
- Categories: fuel, food & drinks, lodging, tolls, parking, and other.
- Payer selection for group trips.
- Category and payer breakdowns.
- Optional stage assignment.
- Database-level checks keep expense dates inside the trip date range.

### Archive

- Completed and cancelled trips are separated from active planning work.
- Archive list view with trip metrics.
- Archive map view powered by uploaded GPX tracks.
- Heatmap, Hybrid, and Routes map modes.
- No fake straight-line route rendering.

### Date and time behaviour

- Date formatting uses `en-GB` conventions, keeping the app aligned with Monday-first week expectations.
- Native browser date pickers are used. Most browsers follow the browser/OS locale for the calendar layout; a guaranteed custom Monday-first picker would require replacing native date inputs.
- Journal entry time is optional. Entries belong to their stage date by default, and a specific time can be added only when useful.

### PWA

- Installable on mobile and desktop.
- Hand-written service worker.
- Online-only writes; offline editing is deliberately not implemented yet.

---

## How to use it

1. Sign in with Google.
2. Create a trip and choose whether it is private or group-visible.
3. Add stages for each riding day or route segment.
4. Add notes, route links, planned dates, and optional distance information.
5. During or after the trip, add journal entries and expenses.
6. Upload GPX files to stages after riding.
7. Mark the trip as completed to move it into the archive.

---

## Feedback, bugs, and feature requests

Feature requests and bug reports are welcome through the GitHub repository Issues page.

When opening an issue, use the appropriate label:

- `bug` for broken or unexpected behaviour;
- `enhancement` for feature requests or improvements.

Please include enough context to reproduce the problem or understand the requested feature.

---

## Technology

| Layer | Choice |
|---|---|
| Frontend | Plain HTML, CSS, and JavaScript with native ES modules |
| Hosting | Cloudflare Pages |
| Backend | Supabase Auth, Postgres, and Storage |
| Authentication | Google sign-in through Supabase |
| Weather/geocoding | Open-Meteo |
| Archive map | In-app SVG geography/heatmap from GPX data |
| PWA | Custom service worker and manifest |

The project intentionally avoids React, Vue, Svelte, Tailwind, TypeScript, and build tools for now.

---

## Local development

Run a local static server from the repository root:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

Do not use `https://localhost:8000` unless you are running a local HTTPS server.

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
├── LICENSE
└── README.md
```

`migrations/` contains database schema changes. These files are part of the project history and should not contain private user data.

Private operational notes, local tests, and developer helper scripts should not be committed to this public repository.

---

## Planned features

### Near term

- Finish splitting the large `app.js` file into smaller screen/component modules.
- Store simplified GPX geometry at upload time.
- Cache archive heatmap calculations by track IDs and viewport.

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

---

## Licence

Routefolk is released under the **Routefolk Source-Available License v1.0**.

See [`LICENSE`](./LICENSE) for the full licence terms.
