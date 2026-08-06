# MCP server for Claude

## Background

The trip-planning API rebuilt in
[2026-08-05-trip-api-redesign-design.md](2026-08-05-trip-api-redesign-design.md)
works: proven end-to-end with a real trip and stage created against the
production database, and again via a direct `curl` against the public
domain returning `200`. Getting it working through ChatGPT's Custom GPT
Actions, however, surfaced a string of undocumented platform-specific
constraints one at a time, live, each requiring a fix-redeploy-retest
cycle: a 30-operation cap on the OpenAPI document, a required (but
spec-optional) `components.schemas` key, and finally an unpublished
Authentication change in the GPT builder UI. Each was real, but discovering
them one at a time in production was slow and frustrating.

Claude does not use OpenAPI-based "Actions." It connects to external tools
through MCP (Model Context Protocol), a different, simpler protocol with no
known operation-count cap. This spec covers adding an MCP interface to the
same API, reusing all of its existing validation, transaction, and
database logic — no new business logic, only a new way to expose the parts
of it already proven correct.

## Goals

- Claude (via a remote MCP custom connector) can list trips, create a full
  trip plan from a document it has parsed, and edit stages/journal entries
  — the same capability ChatGPT was meant to have.
- No duplicated logic: MCP tool handlers call the exact same
  `validate.js`/`db.js` functions the REST routes already use.
- Avoid repeating the previous rollout's failure mode: platform-specific
  quirks discovered only after building everything. The first implementation
  task is the smallest possible working slice (one tool), verified live
  against real Claude before the rest are built.

## Non-goals

- OAuth. Claude's remote MCP connectors support a static bearer token via a
  custom header, the same mechanism REST already uses — implementing a full
  OAuth authorization server for a small trusted-group app would be a large
  scope increase for no real security benefit here.
- Exposing `expenses`, `items`, or `item-categories` as MCP tools. Same
  scope decision as the REST OpenAPI document: these resources aren't
  central to "plan a trip from a document, edit the journey," and adding
  them can happen later without touching anything built here.
- A separate deployable service. MCP handling is additional routes in the
  existing `services/api` process — same pool, same auth middleware, no new
  Docker Compose entry or port.

## Design

### Architecture

`services/api/mcp.js` is a new module implementing MCP's `initialize`,
`tools/list`, and `tools/call` methods using the official
`@modelcontextprotocol/sdk` package (the one new dependency this work adds
— MCP's JSON-RPC/session wire protocol is a real spec, not something worth
hand-rolling). It is mounted in `server.js` as `POST /mcp`, behind the same
bearer-token auth middleware already protecting every other route (no
longer exempted like `/health` and `/openapi.json`).

Each tool handler is a thin adapter: parse the MCP tool-call arguments,
call the same `cleanAndValidate`/`validateTripPlan`/`inApiTransaction`
functions the REST routes already call, translate the result back into an
MCP tool response. No new validation rules, no new SQL, no new transaction
logic.

Tool input schemas are built from the same `RESOURCES` definitions in
`resources.js` that both `validate.js` and `openapi.js` already use.
`resourceRequestSchema`/`resourceResponseSchema` (currently private to
`openapi.js`) are exported so `mcp.js` can reuse them — one schema
definition per resource field, shared by validation, the REST OpenAPI
document, and now MCP tool schemas. No drift between any of the three.

### Tools

Twelve tools, mirroring the same three resources already exposed to
ChatGPT (`trips`, `stages`, `journal-entries`):

| Tool | Maps to |
|---|---|
| `list_trips` | `GET /trips` |
| `get_trip` | `GET /trips/:id` |
| `update_trip` | `PATCH /trips/:id` |
| `create_trip_plan` | `POST /trips/plan` |
| `list_stages` | `GET /stages?trip_id=` |
| `update_stage` | `PATCH /stages/:id` |
| `reorder_stages` | `POST /stages/reorder` |
| `delete_stage` | `DELETE /stages/:id` |
| `list_journal_entries` | `GET /journal-entries?stage_id=` |
| `create_journal_entry` | `POST /journal-entries` |
| `update_journal_entry` | `PATCH /journal-entries/:id` |
| `delete_journal_entry` | `DELETE /journal-entries/:id` |

Standalone single-record creation (`create_trip`, `create_stage`) and
per-record reads (`get_stage`, `get_journal_entry`) are left out: a chat
client mostly needs to list for context, create a whole plan in one batch,
and edit or remove individual pieces afterward — list responses already
carry full records, so individual gets add tools without adding capability.

### Auth

Identical model to REST: a single `ROUTEFOLK_API_KEY` bearer token,
impersonating `ROUTEFOLK_API_USER_ID` via the same `inApiTransaction`
helper, so PostgreSQL RLS stays authoritative exactly as it does today.
Claude's remote-connector setup is expected to accept a custom
Authorization header on the connection, the same mechanism already proven
to work for REST — but this is exactly the kind of platform-specific detail
that bit the ChatGPT rollout, so it is not assumed without proof. It's the
first thing the smallest-slice verification step below confirms, before
any further tools are built on top of it.

### Error handling

MCP tool calls return errors through MCP's own error-result shape rather
than HTTP status codes. `ValidationError` (from `validate.js`) and database
constraint errors are caught the same way `server.js`'s REST handlers
already catch them, and translated into an MCP tool error result carrying
the same `code`/`field`/`message` structure already used in REST responses
— consistent error shape for a human or model reading either surface.

### Verification strategy (the actual point of this spec)

Building all twelve tools and then discovering a Claude-connector-specific
quirk at the end would repeat exactly what just happened with ChatGPT. So
implementation is split in two:

1. **Smallest possible working slice first**: the MCP `initialize` handshake
   plus exactly one read-only tool, `list_trips`. Deployed to the real
   home-server backend and added as a real custom connector in Claude,
   tested live, before writing anything else.
2. **Only after that's confirmed working**, the remaining eleven tools are
   built in one pass, reusing the same request/response plumbing the first
   tool already proved out.

### Testing

Following the same repo convention as the REST work (`node --test`, no
framework, tests never committed — local-only per the repo's existing
policy): unit tests for each tool handler's argument-parsing and
error-translation logic, plus an integration test using the same fake-pool
pattern `server.js`'s tests already use, verifying `initialize` and
`tools/list` respond correctly and `tools/call` for `list_trips` and
`create_trip_plan` behave identically to their REST counterparts. Real
platform verification (Claude actually calling the tools) is manual, the
same way Task 11 was for ChatGPT — no way to automate testing against a
third-party chat client's actual behavior.

## Follow-ups (out of scope here)

- Exposing `expenses`/`items`/`item-categories` as MCP tools, if useful
  later.
- Revisiting the ChatGPT Custom GPT Action now that the REST API and its
  OpenAPI document are proven correct — the remaining failure there was
  configuration (an unpublished Authentication update), not a code defect.
