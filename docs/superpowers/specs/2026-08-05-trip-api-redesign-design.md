# Trip API redesign and repository cleanup

## Background

Routefolk already has a self-hosted backend (Postgres, GoTrue, PostgREST,
Storage, Nginx gateway, and a Node/Express service currently named
`agent-api`) running behind Docker Compose, with production already cut over
to it. `agent-api` exposes generic CRUD over `trips`, `stages`,
`journal_entries`, `expenses`, `items`, and `item_categories`, intended to let
a chat client create and edit trip plans.

In practice, a real test against a ChatGPT Custom GPT Action failed
completely: the action connector was reported as disabled, and the prompt
called a `createTripPlan` operation that does not exist in the deployed API.
The generic CRUD design also doesn't fit the actual workflow — building a
multi-day trip from a document requires one call per trip, then one per
stage, then one per journal entry, with no atomicity and no domain
validation beyond raw Postgres constraint errors.

Separately, the repository has accumulated duplicate, dead work from
repeated overlapping attempts at this same backend migration: a duplicate
copy of the API service and its Docker scripts at the repository root
(unreferenced by `docker-compose.yml`), a duplicate deployment guide, unused
legacy stylesheets, a stale README section describing a cutover that has
already happened, and a dozen-plus stale branches (local and remote) left
over from the same effort.

This spec covers both: redesigning the API so a chat client can reliably
create and edit trip plans, and cleaning up the duplicate/stale material
that accumulated around it.

## Goals

- A chat client (any LLM chat that supports OpenAPI tool-calling) can create
  a full trip plan — trip, stages, and journal entries — from a document or
  free text it has already parsed, in one reliable call.
- The same API supports editing afterward: trip fields, stage fields and
  dates, stage order, journal entries, expenses, and packing items.
- The API's OpenAPI schema is generated from the same definitions that
  validate requests, so the schema served to a chat client can never drift
  from what the server actually accepts.
- The repository contains one copy of everything, with no AI/agent/assistant
  branding in product-facing code or docs.

## Non-goals

- Per-user API keys / acting as the specific person chatting. The shared
  "one API identity" model is kept as-is.
- An MCP server. The REST/OpenAPI surface is the source of truth; an MCP
  wrapper (thin tool definitions calling the same endpoints) is a candidate
  follow-up, not part of this work.
- Server-side document parsing. The chat client does the natural-language
  understanding; the API only accepts already-structured JSON.

## Design

### Naming

All "agent" branding is replaced with plain, professional naming:

| Before | After |
|---|---|
| `services/agent-api/` | `services/api/` |
| Gateway path `/agent/v1` | `/api/v1` |
| `AGENT_API_KEY` | `ROUTEFOLK_API_KEY` |
| `AGENT_USER_ID` | `ROUTEFOLK_API_USER_ID` |
| "Agent API" (docs) | "Routefolk API" / "the API" |

The root-level `agent-api/`, `docker/`, and `SELF_HOSTING.md` are deleted
outright — they are unreferenced duplicates, not renamed originals.

### API surface

**Batch trip creation** — the operation a chat client uses after parsing a
document or free text:

```
POST /trips/plan

{
  "trip": {
    "title": string, "description": string,
    "start_date": date, "end_date": date,
    "cover_photo_url"?: string, "visibility"?: "private" | "group"
  },
  "stages": [
    {
      "title": string, "start_location": string, "end_location": string,
      "planned_date": date,
      "start_lat"?: number, "start_lng"?: number,
      "end_lat"?: number, "end_lng"?: number,
      "gmaps_url"?: string, "distance_km"?: number, "notes"?: string,
      "journal_entries"?: [
        {
          "entry_type": "Stop" | "Meal" | "Lodging" | "Note" | "Drink" | "Other",
          "title": string, "description"?: string,
          "location"?: string, "timestamp"?: datetime
        }
      ]
    }
  ]
}
```

The whole request is written in a single database transaction. Stage order
follows array order. The response returns every created id:

```
{
  "data": {
    "trip_id": uuid,
    "stages": [
      { "stage_id": uuid, "journal_entry_ids": [uuid, ...] }
    ]
  }
}
```

If any row fails validation, nothing is written.

**Editing surface** stays granular — a single-field edit doesn't need
batching:

- `GET /trips`, `GET /trips/:id`, `PATCH /trips/:id`, `DELETE /trips/:id`
- `GET /stages?trip_id=`, `POST /stages`, `PATCH /stages/:id`, `DELETE /stages/:id`
- `POST /stages/reorder { trip_id, ordered_stage_ids }` — atomic, backed by
  the existing reorder function from migration `008_atomic_stage_reorder.sql`
- Equivalent `GET/POST/PATCH/DELETE` for `journal-entries`, `expenses`,
  `items`, and `item-categories`, filterable by `trip_id`/`stage_id`

The old generic `/resources/:name` listing endpoint is removed —
`/openapi.json` is the one real discovery mechanism.

### Validation and errors

Each resource has a hand-written JSON Schema (type, required/optional,
enums, date formats) defined once and shared by both the request validator
and the `/openapi.json` route, so they cannot drift. No new runtime
dependency is introduced; this stays consistent with the rest of the
codebase's minimal, no-build-step style.

Domain rules enforced before any write:
- `trip.start_date <= trip.end_date`
- every `stage.planned_date` falls within the trip's date range
- `journal_entries[].entry_type` restricted to its real enum
- required fields checked per resource

Errors are structured instead of raw Postgres passthrough:

```
{
  "error": {
    "code": "validation_error",
    "field": "stages[2].planned_date",
    "message": "must fall within trip start_date..end_date"
  }
}
```

### Auth

Unchanged model: a single bearer token (`ROUTEFOLK_API_KEY`) plus a fixed
`ROUTEFOLK_API_USER_ID`, impersonated per-request via
`SET LOCAL ROLE authenticated` and Postgres RLS, inside the same transaction
as the write. This part of the current implementation was sound; only the
surface above it was broken.

### Making sure it actually works this time

The most likely cause of the "action connector is currently disabled"
failure is an incomplete OpenAPI schema — ChatGPT Actions silently disables
a connector it cannot validate. To prevent a repeat:

- Every operation gets an explicit `operationId` and fully-typed request and
  response schemas (no bare `object` schemas).
- An automated test lints the generated `/openapi.json` for the specific
  constraints that caused this failure: every operation has an
  `operationId`, no bare `object` schemas, one `servers` entry, a defined
  security scheme. This runs alongside the rest of the test suite so a
  future change that breaks Actions-compatibility is caught immediately.
- Before this is considered shipped, the exact failing scenario is re-run
  end-to-end against a real ChatGPT Custom GPT Action: `list trips → create
  trip plan from a draft → report the created trip, stage, and journal entry
  ids`. This manual pass is the one thing the automated lint can't stand in
  for.

### Testing

Following the repository's existing convention (`node --test`, no test
framework, no root `package.json`), `services/api/` gets its own test file(s)
run the same way:

- Unit tests for the shared validation/schema module: date-range rules,
  enum checks, required-field checks, and the OpenAPI-schema completeness
  lint described above. Pure functions, no database or running server
  required.
- Integration-style tests against the running Express app: `/trips/plan`
  happy path, and one atomicity case where a bad stage partway through the
  array rolls back the entire trip.

### Repository cleanup

Verified-dead material to remove:

- `agent-api/`, `docker/`, `SELF_HOSTING.md` (root) — unreferenced
  duplicates; the real copies are `services/api/` (renamed from
  `services/agent-api/`), `infrastructure/docker/`, and
  `docs/deployment/self-hosting.md`
- `style.css`, `style-fidelity.css` — unused; `index.html` only loads
  `styles/index.css`
- `v3-refactor/` — design docs and prototype atoms for a UI migration that
  has already shipped; preserved in git history, not needed as a live
  directory
- The stale README self-hosting section, which still describes the Supabase
  URL as in place pending cutover even though `lib/config.js` shows the
  cutover already happened, and the stray "Final stability closure"
  paragraph

Branches to delete:

- Local, fully merged into `origin/main`: `claude/distracted-goldwasser-6a6af7`,
  `claude/goofy-lovelace-91474e`, `claude/heuristic-noyce-b6b7bc`,
  `code-clean`, `deep-refactor`, `feature/trip-level-visibility`,
  `mobile-ui`, `new-v3-refactor`, `redesign`, `weather`
- Local, stale and superseded (109 commits behind `main`): `improved-ui`,
  `new-improved-ui`, `pixel-faithful`
- Remote: the 20 merged `codex/*` PR branches, plus the 3 unmerged leftovers
  (`codex/replace-supabase-with-self-hosted-docker-project-6vug9o`, `-sl6v6s`,
  `-xhq6yr`) — abandoned duplicate attempts at the same, now-completed
  migration

All product-facing branding (README, deployment docs, service README, env
var names, code comments) is reviewed to remove "agent," "AI," "assistant,"
and model-name references. Historical planning documents under
`docs/superpowers/` (this design doc's own home) are left as-is — they are
internal process history, not product-facing documentation.

## Follow-ups (out of scope here)

- An MCP wrapper exposing the same `/trips/plan` and editing operations as
  MCP tools, once this REST surface is stable.
