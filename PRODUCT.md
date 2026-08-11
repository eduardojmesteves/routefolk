# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single small, trusted group of friends who ride motorcycles together (referred to in-app as "the group" / "Routefolk members"). Access is invite-only: new riders must be approved by the app administrator. Every member plans, journals, and archives trips using the same shared app instance — there is no multi-tenant or public-facing audience.

## Product Purpose

routefolk is a mobile-first PWA for planning, journaling, and archiving group motorcycle trips end to end: plan a trip and its daily stages, navigate stages via Google Maps links, keep a lightweight travel journal (stops, meals, lodging, notes, drinks), track shared expenses by payer and category, upload GPX tracks per stage, and review completed trips in an archive with route maps and lifetime stats. Success is a group that reliably uses the app across a trip's full lifecycle instead of falling back to scattered chat threads, spreadsheets, and screenshots.

## Positioning

Deliberately narrow and single-purpose: it is not trying to replace Google Maps (navigation), Splitwise (general expense splitting), a photo album, or a full travel blog. Its mechanism is the trip → stage → journal-entry hierarchy tying navigation, journaling, and cost-tracking to the same real ride data (real GPX tracks, real stage distances/dates), rather than being a generic notes or planning app repurposed for trips.

## Operating Context

- Self-hosted backend (Postgres + GoTrue Auth + PostgREST + Storage, fronted by Nginx) on an operator-controlled home server; frontend is plain HTML/CSS/JS (no build step) deployed on Cloudflare Pages.
- Auth is Google sign-in only, via self-hosted GoTrue.
- Online-only writes: write actions are disabled while offline; the PWA app shell still works offline (installed, cached).
- Real trips involve real GPX uploads, real Google Maps links, and real EUR expense splitting among named group members — content shown in the app is real ride data, not demo content.
- Currently mid-redesign: a full visual and structural overhaul ("Route Atlas" direction, dark "Ember Trail" palette) is being implemented screen-by-screen against the existing production app, replacing (not patching) the current implementation per screen as each is rebuilt. See design_handoff docs synced from the Claude Design project for the full spec.

## Capabilities and Constraints

- Trip lifecycle: Planning → Active → Completed / Cancelled; only one trip can be Active at a time (confirmed business rule driving the Trips-list hero state machine).
- Trip visibility: Private (creator only) or Group (all active members); a "selected users" visibility tier also exists in the current schema (migration 015).
- Stages: ordered, dated within the trip's date range, with distance, notes, and a Google Maps link (auto or custom URL).
- Journal entries are per-stage: type (Stop/Meal/Lodging/Note/Drink/Other), optional location/time/URLs/description.
- Expenses are EUR-only, per-trip with optional per-stage assignment, categorized (Fuel, Food & drinks, Lodging, Tolls, Parking, Other).
- GPX tracks are uploaded per stage, stored in Storage, with cached lightweight geometry for fast Archive map rendering; Archive map plots only trips with real GPX coverage (never fabricated routes).
- New feature in progress: "Roads" — a shared, group-wide entity (not trip-scoped, no private visibility) that can be linked to multiple stages across multiple trips, with independent per-user 1–5 star ratings; a user's "My roads" list is personal (their own starred roads, sorted by their own rating).
- Packing/items list exists per trip (added migration 014).
- Schema version is tracked in `app_meta` and checked against `EXPECTED_SCHEMA_VERSION` in app.js; every schema change ships as a new file in `migrations/`.

## Brand Commitments

- Name: routefolk (lowercase in prose/wordmark).
- Typefaces already in production use and reused by the new design direction: Inter Tight (UI/sans) and IBM Plex Mono (data/mono — amounts, dates, IDs, micro-labels).
- New visual direction ("Route Atlas" / "Ember Trail") is a confirmed, high-fidelity, already-approved design: dark charcoal ground (`#1B1F23`/`#14171A`), amber-orange accent (`#FF6A3D`), teal/green secondary accent (`#2FD5A6`). It is the only palette this redesign ships with — no light-mode variant.

## Evidence on Hand

- Full existing production codebase (screens/render, screens/wizards, actions, state, schema.sql, migrations) is the incumbent implementation and source of truth for real data shapes.
- A complete, already-decided design handoff exists (synced via the claude_design MCP project "Routefolk PWA design revamp"): `Routefolk - Route Atlas.html` (every screen/wizard frame, mobile+desktop), `shared/routefolk-shared.css`, `shared/routefolk-ember-trail.css`, base design-system tokens, and an exhaustive `HANDOFF.md`/`README.md` spec covering non-obvious behavior (hidden-until-selected stage controls, trips-list hero state machine, GPX-gated Archive map, wizard narrative pattern, Roads feature spec). Treat that handoff as the authoritative visual/behavioral spec for this redesign — do not re-run direction selection or concept exploration for it.
- No real user testimonials, pricing, or commercial claims exist or are needed; this is a private group tool, not a marketed product.

## Product Principles

1. Every screen and field maps 1:1 to real data the group actually enters — no invented stats, fabricated routes, or computed values without a real field behind them (e.g. no "pace" estimate with no data source).
2. Data over decoration: mono typography and GPX-driven visuals mark "this is a real fact," and decorative-but-fake elements (e.g. a non-GPX-backed route line) are treated as bugs, not style.
3. Redesign work replaces the incumbent screen-by-screen rather than leaving old and new implementations coexisting, per the explicit product-owner direction in HANDOFF.md.
4. Small-group trust model: the app optimizes for a handful of known riders, not scale, multi-tenancy, or anonymous users.
5. Write actions require being online; offline is a read/cache state, never a silent-queue state (no offline write queue exists yet).

## Accessibility & Inclusion

No product-specific accessibility requirement has been established beyond standard web accessibility practice (semantic markup, focus handling, contrast). The Route Atlas redesign's dark palette must maintain real contrast for body/data text against its dark grounds (per the handoff's own note: near-white text, never pure white, kept off `--paper-50` literal reuse to avoid text/surface token collisions).
