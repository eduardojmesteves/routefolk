# Minimal OAuth shim for the MCP connector

## Background

The MCP server built in
[2026-08-06-mcp-server-design.md](2026-08-06-mcp-server-design.md) works —
`list_trips` was verified live against the deployed `/mcp` endpoint via
`curl`. Adding it as a Claude custom connector failed at the very first
step, though: Claude's remote-connector UI has no plain bearer-token field,
only optional OAuth Client ID/Secret. Leaving those blank makes Claude
attempt OAuth 2.0 Dynamic Client Registration against the server, which has
no OAuth support at all, producing "Couldn't register with Routefolk's
sign-in service."

This was verified against Anthropic's actual current developer
documentation (`claude.com/docs/connectors/building/authentication`), not
assumed — the same discipline that caught ChatGPT's undocumented
operation-count cap and `components.schemas` requirement. The documentation
confirms a materially smaller scope than "full OAuth with dynamic
registration": a custom connector's OAuth Client ID field accepts a
**pre-registered static client ID chosen by the server operator**, which
"avoids dynamic client registration entirely." Dynamic Client Registration
(a `/register` endpoint) is not required for this use case.

## Goals

- Adding the Routefolk connector in Claude requires logging in once (pasting
  the existing `ROUTEFOLK_API_KEY` into a plain form), the same one-time
  pattern as Google Drive or any other Claude connector — not a repeated
  prompt per conversation.
- Once connected, Claude keeps the session alive by silently refreshing
  tokens in the background, for as long as the `api` process has been
  running continuously.
- REST and direct `curl` access continue to work unchanged with the raw
  `ROUTEFOLK_API_KEY` bearer token — this shim adds a second, OAuth-based
  way to reach `/mcp`, it doesn't replace the existing one.
- Every RFC/spec detail Anthropic's docs call out as a real failure mode is
  implemented correctly the first time (PKCE S256, `invalid_grant` error
  code on failed refresh, form-urlencoded `/token` body, the `401` +
  `WWW-Authenticate` challenge shape) — these were the exact kind of
  "discovered live" gaps that made the ChatGPT and initial MCP rollouts
  slow, and this time the requirements are already known up front.

## Non-goals

- Dynamic Client Registration (`/register`). Not required for a custom
  connector using a pre-registered static client ID; skipping it removes an
  entire RFC 7591 surface from scope.
- Per-user accounts or real login. The "login" step is a single shared
  secret (the existing `ROUTEFOLK_API_KEY`), exactly matching the existing
  trust model (one shared API identity, already an explicit decision in the
  original trip-API redesign).
- Session persistence across `api` restarts. Sessions live in the process's
  memory, consistent with the earlier decision — one re-login after a
  restart is an accepted tradeoff, not a bug to engineer around.
- `static_headers` beta auth (a simpler, admin-configured bearer-token
  option Anthropic's docs mention) — not visible in the user's current
  connector dialog (likely gated to Team/Enterprise plans), so not a
  currently viable path. Worth revisiting if it becomes available.

## Design

### Architecture

New module `services/api/oauth.js`, mounted into the existing `server.js`
Express app (no new service, consistent with how MCP itself was added).
All state (authorization codes, access tokens, refresh tokens) lives in
three in-memory `Map`s inside this module — no new dependency, no new
database table. Tokens are opaque random strings (`crypto.randomBytes`),
not JWTs — simpler to implement correctly than signature verification, and
appropriate for a single-process deployment that doesn't need to verify
tokens without a lookup.

### Endpoints

**`GET /.well-known/oauth-protected-resource`** — static JSON:
```json
{
  "resource": "https://<host>/mcp",
  "authorization_servers": ["https://<host>"]
}
```

**`GET /.well-known/oauth-authorization-server`** — static JSON:
```json
{
  "issuer": "https://<host>",
  "authorization_endpoint": "https://<host>/authorize",
  "token_endpoint": "https://<host>/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["mcp"]
}
```
No `registration_endpoint` (no DCR) and no `client_id_metadata_document_supported`
(no CIMD) — Claude uses the static client ID entered in its connector
dialog instead.

**`GET /authorize`** — validates `client_id` matches the one fixed value
this server accepts (`routefolk-mcp` — the value to paste into Claude's
"OAuth Client ID" field), stores
`redirect_uri`/`code_challenge`/`state` for the pending request, and serves
a minimal HTML form: one password-type input, "Enter your Routefolk API
key," a submit button. On submit (`POST /authorize`), the supplied value is
compared to `ROUTEFOLK_API_KEY`; a mismatch redisplays the form with an
error, a match generates an authorization code (5-minute expiry) and
redirects to `redirect_uri?code=...&state=...`.

**`POST /token`** (`application/x-www-form-urlencoded` — Claude sends both
grant types this way; the existing `express.json()` body parser does not
parse this, so this route needs its own `express.urlencoded()` parser):
- `grant_type=authorization_code`: validates the code, verifies
  `code_verifier` against the stored `code_challenge` (SHA-256, base64url,
  per PKCE S256), issues an access token (1 hour) and refresh token (30
  days), deletes the used code.
- `grant_type=refresh_token`: validates the refresh token, issues a new
  access token AND a new refresh token (rotation — required for public
  clients per the MCP spec), invalidates the old refresh token. An unknown
  or expired refresh token returns HTTP 400 with JSON body
  `{ "error": "invalid_grant" }` — this exact RFC 6749 error code is what
  tells Claude the session is truly dead rather than retryable.

### `/mcp` auth changes

The existing auth middleware's bearer check is extended to accept either
the raw `ROUTEFOLK_API_KEY` (unchanged, for REST/`curl`) or a valid
in-memory access token. On failure, the response changes from a bare JSON
401 to:
```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource"
```
This header is how Claude discovers that OAuth is available at all — its
docs are explicit that a 401 without it means Claude "never learns where
your authorization server is."

### Error handling

- Unknown `client_id` at `/authorize`: 400, plain text.
- Expired/unknown authorization code at `/token`: 400,
  `{ "error": "invalid_grant" }`.
- PKCE verifier mismatch: 400, `{ "error": "invalid_grant" }`.
- Wrong content-type at `/token`: this is exactly the "some frameworks
  default to JSON-only parsing" gotcha the docs call out — the route uses
  `express.urlencoded()` specifically so this can't happen.

### Testing

Following the established convention (`node --test`, tests never
committed): unit tests for authorization-code issuance and validation,
PKCE verification (a correct verifier passes, an incorrect one is
rejected), refresh-token rotation (old token invalidated, new one usable,
reused-old-token returns `invalid_grant`), and the two discovery documents'
exact shape. An integration test confirms `/mcp` accepts a token minted
through the full `/authorize` → `/token` flow, and that a request with
neither a valid token nor the raw API key gets the `WWW-Authenticate`
challenge header. Real platform verification — Claude actually completing
the flow — is manual, the same as every other live-client check in this
project; no automated substitute exists for a third-party client's actual
behavior.

## Follow-ups (out of scope here)

- Revisit `static_headers` beta auth if it becomes available on the user's
  Claude plan — would let this whole shim be deleted in favor of a plain
  bearer header, the same as the REST API already uses.
