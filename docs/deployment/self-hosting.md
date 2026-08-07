# Cloudflare Pages + self-hosted backend rollout

## Intended architecture

The Routefolk PWA **stays on Cloudflare Pages**. Only the services currently supplied by hosted Supabase—and the new API—run with Docker on the home server.

```text
Browser ──HTTPS──> Cloudflare Pages (HTML/CSS/JavaScript PWA)
   │
   └──────HTTPS──> Home-server backend hostname
                    ├── Auth
                    ├── PostgREST
                    ├── Storage
                    ├── API
                    └── PostgreSQL (internal only)
```

The repository does not deploy to a home server by itself. `docker compose up` starts the backend on whichever Docker host executes it. A public HTTPS hostname or secure tunnel must route to the `gateway` container on that home server. Only the gateway port is published; PostgreSQL and the internal services remain on the Docker network.

## Repository impact

```text
routefolk/
├── docs/deployment/       # Operator runbooks
├── infrastructure/docker/ # Container configuration and lifecycle scripts
├── services/api/    # Independently containerised API
├── docker-compose.yml     # Backend stack entry point
├── actions/, lib/, …      # Existing Cloudflare Pages PWA
└── migrations/            # Existing database migrations
```

Merging these definitions does not move or rebuild the existing PWA. Generated
secrets, database contents, GPX objects, and container state stay outside Git;
Docker stores runtime data in the named volumes declared by Compose.

## Current state: cutover complete, trial period

The frontend cutover described in Stage 4 has been completed: `lib/config.js`
points production at the self-hosted backend
(`https://routefolk-api.homelab-cloud.pt`), and the home server is
authoritative for Auth, PostgREST, Storage, and the API.

The original hosted Supabase project has **not** been deleted. It stays
available, unused, as a rollback path while the self-hosted stack runs through
an operator trial period. It will be disconnected for good once the home
server has proven reliable over time.

## Preflight safeguards

The stack intentionally refuses to render without generated database, JWT,
Storage, and API secrets. Run `setup-env.sh` rather than relying on sample
credentials. The migration container applies every numbered migration newer
than the installed schema marker, in order. It applies the base snapshot only
to an uninitialized database; replaying that older snapshot over an upgraded
database would regress its RLS policies. The API establishes the configured
user's JWT claims and changes to the `authenticated` database role before any
application query, so normal row-level security remains authoritative.

## What runs on the home server

| Compose service | Responsibility | Exposure/data |
|---|---|---|
| `gateway` | One public entry point for `/auth/v1`, `/rest/v1`, `/storage/v1`, and `/api/v1` | Loopback port 18080 by default; put HTTPS/tunnel in front |
| `db` | PostgreSQL for Routefolk, Auth, and Storage metadata | Internal; `routefolk-db` volume |
| `bootstrap` | Synchronizes internal Supabase role passwords | One-shot, internal process |
| `auth` | Supabase GoTrue and Google OAuth callbacks | Internal via gateway |
| `rest` | PostgREST used by the existing browser client | Internal via gateway |
| `storage` | Private GPX object service | Internal; `routefolk-storage` volume |
| `migrate` | One-shot Routefolk schema application | Internal, no persistent process |
| `api` | Key-protected automation API | Internal via gateway |

There is deliberately no PWA/web container. Cloudflare Pages continues to serve the frontend.

The API serves a REST endpoint at `/api/v1` for clients making direct HTTP requests
with the configured `ROUTEFOLK_API_KEY` bearer token. The API also serves an MCP (Model Context Protocol)
endpoint at `/mcp` for clients that speak MCP instead of REST/OpenAPI (Claude, for example,
connects to external tools this way rather than through OpenAPI Actions), exposing trip,
stage, and journal-entry operations as named tools (`list_trips`, `create_trip_plan`,
`update_stage`, and so on). `/mcp` accepts `ROUTEFOLK_API_KEY` as a fallback credential,
but Claude itself authenticates via Google sign-in instead (see Stage 5 below) — no key
ever needs to reach the chat client.

## Generated secrets

`setup-env.sh` creates the untracked, mode-600 `.env` file. It generates the
PostgreSQL password, JWT signing secret, anonymous and service-role JWTs, and
API key. Do not print or share that file. Google OAuth credentials remain
blank until the later OAuth stage, and `ROUTEFOLK_API_USER_ID` remains a non-secret
placeholder until an approved Auth user exists.

The PostgreSQL image creates internal roles for Auth, PostgREST, and Storage.
The one-shot `bootstrap` service uses the image's `supabase_admin` superuser to
change those reserved roles to the generated `POSTGRES_PASSWORD` before the
services connect. The regular `postgres` role cannot perform this operation in
the hardened Supabase image. This synchronization is required because setting
the main password does not automatically change the passwords of the three
existing service roles.

GoTrue is configured to issue normal user access tokens with audience and role
`authenticated`; PostgREST uses that role claim to select the PostgreSQL role
that enforces Routefolk RLS. After changing Auth JWT settings, obtain a new
access token—tokens issued before the change retain their old claims.

## Stage 0 — decide the home-server boundary

Before changing code or production:

1. Choose how the home server is reached: preferably a secure tunnel or a tightly configured HTTPS reverse proxy, not raw router port forwarding.
2. Choose the backend hostname, for example `api.routes.example.com`.
3. Confirm the home server has persistent storage, patching, monitoring, and sufficient uptime.
4. Choose an encrypted off-device backup destination for both Docker volumes.
5. Decide the acceptable write-freeze and rollback windows.
6. Preserve a fresh hosted Supabase database backup and inventory the private `gpx-tracks` bucket.

**Gate:** the existing Pages/Supabase production remains unchanged, backups are restorable, and the host/network/backup owners are known.

## Stage 1 — validate only the backend locally

Generate the environment and validate the Docker backend definition first:

```sh
./infrastructure/docker/setup-env.sh
docker compose config --quiet
docker compose config --services
```

This is the **next step after merging the backend files**. Stop if Compose
reports a missing variable or configuration error; do not add the tunnel or
change Cloudflare Pages to work around a failed preflight.

After that preflight succeeds, pull/build and start the private backend:

```sh
docker compose pull
docker compose build api
docker compose up -d
sleep 30
docker compose ps -a
docker compose logs migrate
curl --fail-with-body http://127.0.0.1:18080/health
```

The gateway health endpoint checks the API and its database connection;
it is not a static Nginx success response. The expected `bootstrap` and
`migrate` states are `Exited (0)`, while the six long-running services should
be healthy or running.
Do not configure the public tunnel yet. Stop and inspect logs if migration exits
non-zero, a service restarts, or the health request fails.

If the first launch fails, keep the volumes and collect all relevant service
logs before retrying:

```sh
docker compose logs --tail=200 migrate auth rest storage
docker compose down
```

`docker compose down` removes containers and the private Compose network but
preserves the named database and Storage volumes. Never add `--volumes` unless
you have explicitly decided to destroy the disposable database and GPX data.

Serve a separate local copy of the PWA and temporarily point that copy—not `main` and not Cloudflare Pages—at the generated backend URL/key. Configure a separate Google OAuth test client with the backend callback `http://127.0.0.1:18080/auth/v1/callback` and the local PWA as its site/redirect origin.

Test sign-in/out, trip/stage/journal/expense/item CRUD, GPX upload/download, archive rendering, session refresh, and API operations with throwaway data.

**Gate:** all workflows pass and container restarts preserve test data. Production still calls hosted Supabase.

## Stage 2 — install the parallel home-server backend

1. Clone a pinned commit onto the home server.
2. Generate `.env`; set `API_EXTERNAL_URL` to the backend HTTPS origin and `SITE_URL` to the Cloudflare Pages origin.
3. Configure Google OAuth with `${API_EXTERNAL_URL}/auth/v1/callback` while allowing the Pages origin as the application redirect.
4. Start the stack behind the chosen HTTPS proxy/tunnel.
5. Restrict it to administrators while testing.
6. Automate backups of `routefolk-db` and `routefolk-storage`, then perform a restore rehearsal.

### Back up and rehearse disaster recovery

Routefolk provides operator scripts under `infrastructure/backup`. A backup
briefly stops the externally writable services, creates a custom-format dump of
the `public`, `auth`, and `storage` schemas, archives the private Storage volume,
preserves database object ownership, and records checksums and validation
counts:

```sh
./infrastructure/backup/backup.sh /encrypted/offsite/staging
./infrastructure/backup/verify-backup.sh \
  /encrypted/offsite/staging/routefolk-backup-YYYYMMDDTHHMMSSZ
```

The archive deliberately excludes `.env`. Escrow that file separately in an
encrypted secret store because its JWT secret and keys are required for a real
recovery. Never copy it into the backup directory or commit it.

Restore only into a separately named rehearsal project and unused loopback
port:

```sh
./infrastructure/backup/restore-rehearsal.sh \
  /encrypted/offsite/staging/routefolk-backup-YYYYMMDDTHHMMSSZ \
  routefolk-restore-manual \
  18081
```

The rehearsal verifies checksums, restores separate database and Storage
volumes, compares row counts, and checks the isolated gateway. Inspect Auth user
UUIDs, trip ownership, and a GPX download before removing only the rehearsal:

```sh
docker compose -p routefolk-restore-manual down --volumes
```

Never use that cleanup command with the working `routefolk` project. Copy a
verified backup to the chosen encrypted off-device destination and record the
restore date, duration, and operator before passing the Stage 2 gate.

Do not change `lib/config.js` or the Pages Content Security Policy yet.

### Enter Google OAuth credentials safely

Create a separate Google OAuth **Web application** client for the parallel
backend. Add the Pages origin as an authorized JavaScript origin and add the
exact `${API_EXTERNAL_URL}/auth/v1/callback` URL as an authorized redirect URI.
Do not reuse the hosted Supabase client during the parallel test.

If an OAuth client secret is printed in a terminal transcript, screenshot,
chat, issue, or log, delete or rotate that secret in Google Cloud before using
it. Treat the replacement as the only valid secret.

The text passed to `read -p` is only the prompt. Never put a credential inside
that prompt. Read the values, export them for the child Python process, and
then update `.env` without echoing either value:

```bash
read -r -p 'Google client ID: ' ROUTEFOLK_GOOGLE_CLIENT_ID
read -r -s -p 'Google client secret: ' ROUTEFOLK_GOOGLE_CLIENT_SECRET
printf '\n'

test -n "$ROUTEFOLK_GOOGLE_CLIENT_ID"
test -n "$ROUTEFOLK_GOOGLE_CLIENT_SECRET"
export ROUTEFOLK_GOOGLE_CLIENT_ID ROUTEFOLK_GOOGLE_CLIENT_SECRET

python3 - <<'PY'
import os
from pathlib import Path

updates = {
    "GOOGLE_ENABLED": "true",
    "GOOGLE_CLIENT_ID": os.environ["ROUTEFOLK_GOOGLE_CLIENT_ID"],
    "GOOGLE_CLIENT_SECRET": os.environ["ROUTEFOLK_GOOGLE_CLIENT_SECRET"],
}

path = Path(".env")
lines = path.read_text().splitlines()
found = set()
result = []

for line in lines:
    key = line.split("=", 1)[0] if "=" in line else None
    if key in updates:
        result.append(f"{key}={updates[key]}")
        found.add(key)
    else:
        result.append(line)

missing = set(updates) - found
if missing:
    raise SystemExit(f"Missing variables in .env: {sorted(missing)}")

temporary = path.with_name(".env.tmp")
temporary.write_text("\n".join(result) + "\n")
temporary.chmod(0o600)
temporary.replace(path)
PY

unset ROUTEFOLK_GOOGLE_CLIENT_ID ROUTEFOLK_GOOGLE_CLIENT_SECRET
```

Confirm only presence and lengths—never values—then recreate Auth and inspect
its public provider settings:

```bash
awk -F= '
  /^GOOGLE_ENABLED=/ { print $1 "=" $2 }
  /^GOOGLE_CLIENT_ID=/ { print $1 "=<redacted; length " length($2) ">" }
  /^GOOGLE_CLIENT_SECRET=/ { print $1 "=<redacted; length " length($2) ">" }
' .env
stat -c '%a %n' .env

unset GOOGLE_ENABLED GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
docker compose config --quiet
docker compose up -d --force-recreate auth

ROUTEFOLK_API_EXTERNAL_URL="$(sed -n 's/^API_EXTERNAL_URL=//p' .env)"
test -n "$ROUTEFOLK_API_EXTERNAL_URL"
curl --silent --show-error --fail-with-body \
  --output /tmp/routefolk-auth-settings.json \
  "${ROUTEFOLK_API_EXTERNAL_URL}/auth/v1/settings"

python3 - <<'PY'
import json

settings = json.load(open("/tmp/routefolk-auth-settings.json"))
assert settings.get("external", {}).get("google") is True
print("Google provider enabled")
PY

rm -f /tmp/routefolk-auth-settings.json
unset ROUTEFOLK_API_EXTERNAL_URL
```

Keep the production PWA pointed at hosted Supabase until the separate frontend
rehearsal is ready.

### Prepare an isolated frontend rehearsal

Do not edit `lib/config.js` in the server checkout. First create a disposable
worktree in a directory owned by the operator. `/opt` is commonly root-owned,
so a sibling of `/opt/routefolk` may not be writable:

```bash
cd /opt/routefolk
test -z "$(git status --porcelain -- lib/config.js _headers)" || {
  echo 'Stop: restore or move existing frontend edits before continuing.' >&2
  exit 1
}

test ! -e "$HOME/routefolk-selfhost-test"
git worktree add --detach "$HOME/routefolk-selfhost-test" HEAD
cd "$HOME/routefolk-selfhost-test"
test "$PWD" != /opt/routefolk
```

Every subsequent test-only edit to `lib/config.js` and `_headers` must be made
from that worktree. Chain `cd` with `&&`, or stop immediately when a command
fails, so a failed worktree creation cannot fall through to editing the server
checkout. Before editing, use `pwd` and `git status --short` to confirm the
location.

The backend gateway intentionally serves API paths rather than a website, so
opening `${API_EXTERNAL_URL}/` returns Nginx `404 Not Found`. Use `/health` to
test the gateway. The rehearsal PWA must be deployed at its own frontend origin.

`ripgrep` is optional on the server. If `rg` is unavailable, inspect the CSP
with the standard tool available on Ubuntu:

```bash
grep -nE 'connect-src|form-action' _headers
```

If the isolated worktree setup fails after the Auth `SITE_URL` was changed,
restore the saved environment before doing anything else:

```bash
cd /opt/routefolk
cp --preserve=mode .env.before-frontend-rehearsal .env
chmod 600 .env
unset SITE_URL
docker compose config --quiet
docker compose up -d --force-recreate auth
git restore --worktree -- lib/config.js _headers
git status --short
```

The final `git restore` is appropriate only when those files contain disposable
rehearsal edits and no intentional uncommitted operator changes.

### Create the disposable Cloudflare Pages project

Use a separate **Direct Upload** Pages project. Do not connect the production
Git repository: its committed `lib/config.js` still targets hosted Supabase.
Direct Upload lets the operator deploy the modified isolated worktree without
committing its anonymous key or CSP changes.

From the isolated worktree, prepare the test-only frontend configuration:

```bash
cd "$HOME/routefolk-selfhost-test"
test "$PWD" != /opt/routefolk

ROUTEFOLK_ANON_KEY="$(sed -n 's/^ANON_KEY=//p' /opt/routefolk/.env)"
test -n "$ROUTEFOLK_ANON_KEY"
export ROUTEFOLK_ANON_KEY

python3 - <<'PY'
import os
from pathlib import Path

path = Path("lib/config.js")
lines = []
for line in path.read_text().splitlines():
    if line.startswith("export const SUPABASE_URL = "):
        lines.append("export const SUPABASE_URL = 'https://routefolk-api.homelab-cloud.pt';")
    elif line.startswith("export const SUPABASE_ANON_KEY = "):
        lines.append(f"export const SUPABASE_ANON_KEY = '{os.environ['ROUTEFOLK_ANON_KEY']}';")
    else:
        lines.append(line)
path.write_text("\n".join(lines) + "\n")

headers = Path("_headers")
text = headers.read_text()
origin = "https://routefolk-api.homelab-cloud.pt"
if origin not in text:
    text = text.replace(
        "connect-src 'self' ",
        f"connect-src 'self' {origin} ",
    ).replace(
        "form-action 'self' ",
        f"form-action 'self' {origin} ",
    )
headers.write_text(text)
PY

unset ROUTEFOLK_ANON_KEY
grep -nE 'SUPABASE_URL|SUPABASE_ANON_KEY' lib/config.js | sed -E 's#(SUPABASE_ANON_KEY = ).*#\1<redacted>#'
grep -nE 'connect-src|form-action' _headers
git status --short -- lib/config.js _headers
```

On the home server, install no global package. Use a temporary current Wrangler
CLI, authenticate the intended Cloudflare account, create a uniquely named
project, and deploy the worktree:

```bash
node --version
npm --version
npx wrangler@latest login
npx wrangler@latest pages project create routefolk-selfhost-test --production-branch main
npx wrangler@latest pages deploy . --project-name routefolk-selfhost-test --branch main
```

The login command may print a URL that must be opened on another device when
the server has no desktop browser. Select the account that owns the Pages
domain. If the requested project name is unavailable, choose another unique
name and use that same name in the deploy command. Record the exact stable
`https://<project>.pages.dev` URL reported by Cloudflare; do not assume it in
advance.

The Cloudflare dashboard alternative must use the dedicated **Pages** flow. In
the current combined uploader, click **Looking to deploy Pages? Get started**;
do not continue on a screen labelled **Create a Worker** or showing a
`workers.dev` suffix. Then choose **Direct Upload**. Never select the existing
production Pages project.

Do not upload the repository or worktree directory directly. It contains
`wrangler.jsonc`, backend files, and operator documentation, which makes the
combined uploader treat it as a Worker/build project. Build an allow-listed
static bundle instead:

```bash
rm -rf "$HOME/routefolk-selfhost-upload"
/opt/routefolk/infrastructure/docker/build-pages-bundle.sh \
  "$HOME/routefolk-selfhost-test" \
  "$HOME/routefolk-selfhost-upload"

find "$HOME/routefolk-selfhost-upload" -maxdepth 1 -printf '%f\n' | sort
test ! -e "$HOME/routefolk-selfhost-upload/wrangler.jsonc"
test ! -e "$HOME/routefolk-selfhost-upload/.env"
```

Upload the **contents** of `routefolk-selfhost-upload`. Its root must contain
`index.html`, `_headers`, `app.js`, and the frontend asset directories. When the
browser runs on another computer, archive only this bundle, copy it to that
computer, extract it, and upload the extracted contents:

```bash
tar -C "$HOME" -czf "$HOME/routefolk-selfhost-upload.tar.gz" \
  routefolk-selfhost-upload
```

The Pages uploader must no longer show `wrangler.jsonc`, `docker-compose.yml`,
or `.gitignore` in its file list. If it still says **Worker name** rather than
**Project name**, go back and enter the Pages flow before deploying.

After the first deployment succeeds:

1. open the exact Pages URL and confirm the PWA shell loads;
2. add that exact origin to the Google OAuth client's authorized JavaScript
   origins while retaining `${API_EXTERNAL_URL}/auth/v1/callback` as the
   authorized redirect URI;
3. change `SITE_URL` in `/opt/routefolk/.env` to that exact Pages origin;
4. recreate `auth` and verify `GOTRUE_SITE_URL` inside the container;
5. redeploy with the same Wrangler `pages deploy` command after later test-only
   frontend edits.

The Direct Upload project is disposable. The production Pages project and the
committed hosted-Supabase configuration remain unchanged throughout this test.

### Redeploy after CSP or gateway changes

OAuth returns access tokens in the browser URL fragment. Never include that URL
in screenshots or logs. If a token is exposed, delete the corresponding Auth
session, temporarily deactivate its `app_members` row, and wait at least the
configured JWT lifetime before reactivating it. Closing the tab alone does not
invalidate an already issued access token.

The committed frontend CSP permits Google Fonts and uses an external palette
initializer so it does not require `unsafe-inline` scripts. The gateway owns
CORS for the single configured `SITE_URL`, including preflight requests. After
pulling either change on the server:

```bash
cd /opt/routefolk
git pull --ff-only origin main
unset SITE_URL
docker compose config --quiet
docker compose up -d --force-recreate gateway
```

Recreate the isolated worktree from the updated commit, reapply its test-only
backend URL/key and CSP origin, rebuild the clean bundle, and create a new Pages
deployment. A stale bundle still contains the old CSP and inline script.

Validate CORS before retrying OAuth:

```bash
curl --silent --show-error --dump-header - --output /dev/null \
  --request OPTIONS \
  --header 'Origin: https://routefolk-selfhost-test.pages.dev' \
  --header 'Access-Control-Request-Method: GET' \
  --header 'Access-Control-Request-Headers: authorization,apikey,x-client-info' \
  'https://routefolk-api.homelab-cloud.pt/auth/v1/user'
```

The response must be HTTP 204 and include exactly one
`Access-Control-Allow-Origin` header matching the Pages origin. Requests with a
different Origin must not receive that header.

**Gate:** HTTPS, OAuth, health checks, restarts, backup, and restore succeed while hosted Supabase remains production.

## Stage 3 — build and rehearse data migration

The repository does **not yet provide an automated cloud-to-home-server migration**. Application rows, Auth identities, and private Storage objects require a rehearsed migration that preserves UUIDs and ownership.

On a disposable copy:

1. export and restore Auth plus Routefolk database data using a procedure compatible with both PostgreSQL environments;
2. copy private GPX objects and preserve their paths/Storage metadata;
3. verify Google sign-in resolves to the original user UUIDs;
4. compare every application-table row count and GPX object count/checksum;
5. run the complete PWA and API smoke tests;
6. record exact commands, duration, validation queries, and rollback steps.

**Gate:** the rehearsal is repeatable and users, ownership, records, and GPX downloads are intact. Hosted Supabase stays authoritative until then.

## Stage 4 — controlled frontend cutover

During an announced write freeze:

1. take final hosted database and Storage backups;
2. repeat the rehearsed migration on the home-server backend;
3. validate before accepting writes;
4. update `lib/config.js` with the new public backend HTTPS URL and its anonymous key;
5. add the exact backend HTTPS origin to `connect-src` and `form-action` in `_headers`;
6. deploy that small frontend configuration change to Cloudflare Pages;
7. test OAuth, reads, writes, uploads, downloads, and refreshes from the production Pages URL.

The anonymous key is designed to be public; authorization still depends on JWTs and database RLS. The database password, JWT secret, service-role key, and API key must never enter the Pages repository or browser bundle.

**Gate:** Pages successfully uses the home-server backend and monitoring/backups are healthy. Keep the old Supabase project intact and read-only through the rollback window.

## Stage 5 — enable the API separately

After the PWA cutover succeeds:

1. use a dedicated approved Routefolk account and set its UUID as `ROUTEFOLK_API_USER_ID`;
2. store `ROUTEFOLK_API_KEY` only in a secret manager — it's needed for direct REST/`curl` access and as `/mcp`'s fallback credential, but Claude itself never needs it (see below);
3. add network restrictions, request logging, rate limiting, and a rotation procedure;
4. test list/read first, then create/edit/delete a disposable private route;
5. verify attribution and key revocation before allowing production writes.

Connecting Claude's remote MCP connector requires OAuth (Claude's connector
UI has no plain bearer-token field), so it does not use `ROUTEFOLK_API_KEY`
at all. When adding the connector in Claude, enter `routefolk-mcp` as the
OAuth Client ID (leave the Client Secret blank). Clicking through takes you
to the same Google sign-in the Routefolk PWA itself uses — no separate
credential to retrieve or paste, and it works from a phone with nothing but
a Google account already approved for the group. This issues Claude a
short-lived session that refreshes itself automatically; restarting the
`api` container invalidates active sessions, requiring one more Google
sign-in.

## Stage 6 — rollback or retire hosted Supabase

If critical validation fails, restore the previous `lib/config.js` and `_headers`, redeploy Pages, and return to hosted Supabase. Stop writes on the failed backend before reconciling changes; never allow independent writes to both systems.

Retire hosted Supabase only after the rollback period, a successful home-server disaster-restore test, and confirmation that no client calls the old endpoint.

## Decisions needed from the operator

Before Stage 2, confirm:

- the home-server OS and Docker availability;
- tunnel/reverse-proxy choice and backend hostname;
- the actual Cloudflare Pages production origin;
- off-device backup destination and retention;
- whether all existing Auth identities and GPX files must migrate;
- acceptable downtime/write freeze;
- whether the API should be tunnel/VPN-only or internet-reachable.
