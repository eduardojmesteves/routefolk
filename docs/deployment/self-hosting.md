# Cloudflare Pages + self-hosted backend rollout

## Intended architecture

The Routefolk PWA **stays on Cloudflare Pages**. Only the services currently supplied by hosted Supabase—and the new Agent API—run with Docker on the home server.

```text
Browser ──HTTPS──> Cloudflare Pages (HTML/CSS/JavaScript PWA)
   │
   └──────HTTPS──> Home-server backend hostname
                    ├── Auth
                    ├── PostgREST
                    ├── Storage
                    ├── Agent API
                    └── PostgreSQL (internal only)
```

The repository does not deploy to a home server by itself. `docker compose up` starts the backend on whichever Docker host executes it. A public HTTPS hostname or secure tunnel must route to the `gateway` container on that home server. Only the gateway port is published; PostgreSQL and the internal services remain on the Docker network.

## Repository impact

```text
routefolk/
├── docs/deployment/       # Operator runbooks
├── infrastructure/docker/ # Container configuration and lifecycle scripts
├── services/agent-api/    # Independently containerised Agent API
├── docker-compose.yml     # Backend stack entry point
├── actions/, lib/, …      # Existing Cloudflare Pages PWA
└── migrations/            # Existing database migrations
```

Merging these definitions does not move or rebuild the existing PWA. Generated
secrets, database contents, GPX objects, and container state stay outside Git;
Docker stores runtime data in the named volumes declared by Compose.

## Current state: no cutover

An Ubuntu 22.04 home server and Cloudflare Tunnel have been selected, and the
local Compose preflight has passed. No tunnel route, production DNS, Cloudflare
Pages setting, or Google OAuth callback has changed, and no hosted Supabase data
has been copied. The committed PWA configuration still points at the existing
hosted Supabase project, so deploying the current Cloudflare Pages source does
not switch production unexpectedly.

The Docker stack is therefore an unvalidated candidate backend. It must not become authoritative until the stages below pass.

## Preflight safeguards

The stack intentionally refuses to render without generated database, JWT,
Storage, and Agent API secrets. Run `setup-env.sh` rather than relying on sample
credentials. The migration container applies every numbered migration newer
than the schema snapshot, in order. The Agent API establishes the configured
user's JWT claims and changes to the `authenticated` database role before any
application query, so normal row-level security remains authoritative.

## What runs on the home server

| Compose service | Responsibility | Exposure/data |
|---|---|---|
| `gateway` | One public entry point for `/auth/v1`, `/rest/v1`, `/storage/v1`, and `/agent/v1` | Loopback port 18080 by default; put HTTPS/tunnel in front |
| `db` | PostgreSQL for Routefolk, Auth, and Storage metadata | Internal; `routefolk-db` volume |
| `bootstrap` | Synchronizes internal Supabase role passwords | One-shot, internal process |
| `auth` | Supabase GoTrue and Google OAuth callbacks | Internal via gateway |
| `rest` | PostgREST used by the existing browser client | Internal via gateway |
| `storage` | Private GPX object service | Internal; `routefolk-storage` volume |
| `migrate` | One-shot Routefolk schema application | Internal, no persistent process |
| `agent-api` | Key-protected automation API | Internal via gateway |

There is deliberately no PWA/web container. Cloudflare Pages continues to serve the frontend.

## Generated secrets

`setup-env.sh` creates the untracked, mode-600 `.env` file. It generates the
PostgreSQL password, JWT signing secret, anonymous and service-role JWTs, and
Agent API key. Do not print or share that file. Google OAuth credentials remain
blank until the later OAuth stage, and `AGENT_USER_ID` remains a non-secret
placeholder until an approved Auth user exists.

The PostgreSQL image creates internal roles for Auth, PostgREST, and Storage.
The one-shot `bootstrap` service uses the image's `supabase_admin` superuser to
change those reserved roles to the generated `POSTGRES_PASSWORD` before the
services connect. The regular `postgres` role cannot perform this operation in
the hardened Supabase image. This synchronization is required because setting
the main password does not automatically change the passwords of the three
existing service roles.

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
docker compose build agent-api
docker compose up -d
sleep 30
docker compose ps -a
docker compose logs migrate
curl --fail-with-body http://127.0.0.1:18080/health
```

The gateway health endpoint checks the Agent API and its database connection;
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

Test sign-in/out, trip/stage/journal/expense/item CRUD, GPX upload/download, archive rendering, session refresh, and Agent API operations with throwaway data.

**Gate:** all workflows pass and container restarts preserve test data. Production still calls hosted Supabase.

## Stage 2 — install the parallel home-server backend

1. Clone a pinned commit onto the home server.
2. Generate `.env`; set `API_EXTERNAL_URL` to the backend HTTPS origin and `SITE_URL` to the Cloudflare Pages origin.
3. Configure Google OAuth with `${API_EXTERNAL_URL}/auth/v1/callback` while allowing the Pages origin as the application redirect.
4. Start the stack behind the chosen HTTPS proxy/tunnel.
5. Restrict it to administrators while testing.
6. Automate backups of `routefolk-db` and `routefolk-storage`, then perform a restore rehearsal.

Do not change `lib/config.js` or the Pages Content Security Policy yet.

**Gate:** HTTPS, OAuth, health checks, restarts, backup, and restore succeed while hosted Supabase remains production.

## Stage 3 — build and rehearse data migration

The repository does **not yet provide an automated cloud-to-home-server migration**. Application rows, Auth identities, and private Storage objects require a rehearsed migration that preserves UUIDs and ownership.

On a disposable copy:

1. export and restore Auth plus Routefolk database data using a procedure compatible with both PostgreSQL environments;
2. copy private GPX objects and preserve their paths/Storage metadata;
3. verify Google sign-in resolves to the original user UUIDs;
4. compare every application-table row count and GPX object count/checksum;
5. run the complete PWA and Agent API smoke tests;
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

The anonymous key is designed to be public; authorization still depends on JWTs and database RLS. The database password, JWT secret, service-role key, and Agent API key must never enter the Pages repository or browser bundle.

**Gate:** Pages successfully uses the home-server backend and monitoring/backups are healthy. Keep the old Supabase project intact and read-only through the rollback window.

## Stage 5 — enable the Agent API separately

After the PWA cutover succeeds:

1. use a dedicated approved Routefolk account and set its UUID as `AGENT_USER_ID`;
2. store `AGENT_API_KEY` only in the agent platform's secret manager;
3. add network restrictions, request logging, rate limiting, and a rotation procedure;
4. test list/read first, then create/edit/delete a disposable private route;
5. verify attribution and key revocation before allowing production writes.

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
- whether the Agent API should be tunnel/VPN-only or internet-reachable.
