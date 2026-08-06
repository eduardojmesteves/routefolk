# Google sign-in for the MCP OAuth shim

## Background

The OAuth shim built in
[2026-08-06-mcp-oauth-design.md](2026-08-06-mcp-oauth-design.md) works —
verified live, Claude connects, logs in, and keeps the session alive across
conversations. Its login step asks the user to paste `ROUTEFOLK_API_KEY`
into a form, which assumed access to the value (SSH into the home server,
`grep` it out of `.env`). That's impractical while traveling with only a
phone.

The fix is to replace that login step with the same Google sign-in the
Routefolk PWA already uses, via the self-hosted GoTrue (`auth`) service
already running in `docker-compose.yml`. Whoever can complete that sign-in
is, by definition, already an approved group member — the same gate the PWA
itself relies on — so this reuses existing access control rather than
building new access control.

**This project is mid-migration from hosted Supabase to a self-hosted home
server, currently in a trial period before hosted Supabase is disconnected
for good.** Every piece of this design — GoTrue, Postgres, the API service,
the gateway — is the existing self-hosted stack already deployed at
`/opt/routefolk`. Nothing here touches, depends on, or reintroduces hosted
Supabase in any form.

## Goals

- Logging into the Claude connector from a phone requires nothing beyond a
  normal Google sign-in — no secret to retrieve, copy, or paste.
- The security guarantee doesn't weaken: only someone who can complete
  Google sign-in through the existing, already-approved-users-only GoTrue
  instance can obtain a Claude session.
- Everything after the login step is unchanged: same fixed OAuth client ID,
  same PKCE flow, same access/refresh token issuance, same in-memory
  storage, same `ROUTEFOLK_API_USER_ID` impersonation for the actual API
  calls.

## Non-goals

- Per-user identity in the API layer. Google sign-in is a gate ("is this
  person approved"), not a new identity system — every session still acts
  as the same shared `ROUTEFOLK_API_USER_ID`, unchanged from the existing
  design.
- Any interaction with hosted Supabase. This entire feature is self-hosted
  GoTrue talking to self-hosted Postgres, both already running on the home
  server.
- Keeping the API-key login path. Per an explicit decision, Google sign-in
  replaces it outright — the `/authorize` page never shows a key-paste
  form again.

## Design

### Flow

1. Claude sends the browser to our `GET /authorize?client_id=...&redirect_uri=...&code_challenge=...&state=...` (unchanged from before).
2. Instead of rendering a login form, `/authorize` generates an opaque
   `pending_id`, stores the four Claude-supplied parameters against it (5
   minute expiry, same TTL pattern as authorization codes), and redirects
   the browser to GoTrue's existing Google sign-in:
   `{issuer}/auth/v1/authorize?provider=google&redirect_to={issuer}/google-callback?pending={pending_id}`.
3. GoTrue and Google complete their existing sign-in flow (unchanged —
   this is the same path the PWA already uses) and redirect the browser to
   our `redirect_to` value. Per how GoTrue/Supabase auth works, the session
   token comes back in the URL **fragment**
   (`/google-callback?pending=X#access_token=...`), which is visible to
   browser JavaScript only, never sent to any server.
4. `GET /google-callback` serves a small, self-contained HTML page (inline
   `<script>`, no build step, no dependency) that reads
   `location.hash`, extracts `access_token`, and `fetch()`s it to
   `POST /google-verify` along with the `pending` id.
5. `POST /google-verify`: looks up the pending entry (400 `invalid_grant`-style
   error if missing/expired — reuses the same JSON error shape as `/token`);
   calls `GET {issuer}/auth/v1/user` with `Authorization: Bearer
   <access_token>` to confirm the token is real (GoTrue returns the user
   record on success, 401 on a bad/expired token); on success, generates
   the Claude authorization code exactly as the old flow did (using the
   pending entry's stored `redirect_uri`/`code_challenge`), deletes the
   pending entry, and responds with `{ "redirect": "<claude_redirect_uri>?code=...&state=..." }`.
6. The callback page's script does `window.location.href = <that redirect>`,
   completing the hop back to Claude exactly as before. `POST /token`
   (exchanging the code for access/refresh tokens) is completely unchanged.

### New state

A fourth in-memory `Map`, `pendingAuthorizations` (`pending_id ->
{ redirectUri, codeChallenge, state, expiresAt }`), same shape and TTL
convention as the existing `authorizationCodes` map.

### Infrastructure changes

- `docker-compose.yml`: `GOTRUE_URI_ALLOW_LIST` currently allows only
  `${SITE_URL}/*` (the PWA's own origin). It needs a second entry for the
  API's own origin, since GoTrue's post-Google redirect now needs to land
  on `/google-callback` there. GoTrue's allow-list supports multiple
  comma-separated patterns.
- `infrastructure/docker/nginx.conf`: two new proxied paths,
  `/google-callback` (GET) and `/google-verify` (POST), following the same
  pattern as the existing `/authorize`/`/token` blocks (rate-limited, since
  this is also an auth-adjacent surface).

Both of these are exactly the class of gap that caused two separate live
404s earlier today (missing `/mcp` and missing OAuth paths in `nginx.conf`).
Before writing the implementation plan, every new route this feature adds
is cross-checked against `nginx.conf`'s existing location blocks in one
pass, rather than discovering gaps one at a time against the live server
again.

### Error handling

- Missing/expired `pending_id` at `/google-verify`: 400,
  `{ "error": "invalid_grant" }` (consistent with `/token`'s existing shape).
- GoTrue rejects the access token (bad/expired): 401, plain error page —
  this shouldn't normally happen since the token was just minted by GoTrue
  seconds earlier, but is handled rather than crashing.
- The callback page itself: if `location.hash` has no `access_token` (the
  user denied Google consent, or GoTrue returned an error instead), show a
  plain "sign-in was not completed" message rather than a blank page or a
  broken fetch call.

### Testing

Following the established convention (`node --test`, tests never
committed): unit tests for pending-authorization storage/expiry, the
`/google-verify` success and failure paths (mocking the call to GoTrue's
`/auth/v1/user` endpoint the same way existing tests mock the database),
and that a successful verification produces the identical authorization
code shape the old flow produced (so `/token` needs no changes and its
existing tests keep covering it). The callback page's client-side JS
(reading the fragment, posting it, following the returned redirect) is
inherently only testable by a real browser completing a real Google
sign-in — that's Task 3's manual live verification, the same category of
check every other platform-facing piece of this project has needed.

## Follow-ups (out of scope here)

- None identified — this fully replaces the key-paste login step, which
  was the entire point.
