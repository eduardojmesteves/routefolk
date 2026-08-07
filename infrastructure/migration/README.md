# Hosted-to-self-hosted migration rehearsal

These tools reproduce the validated Routefolk database, Auth, and private GPX
Storage migration in a new isolated Compose project, run against an unused
`routefolk-migrate-rehearsal-final-*` project name. They do **not** perform a
production cutover and never touch the real `routefolk` project — see the
gates in the [self-hosting guide](../../docs/deployment/self-hosting.md).

The production cutover this toolkit rehearsed has since completed (see
"Current state" in that guide); it is kept here for re-validating the
migration process if it's ever needed again during the current operator
trial period, not as a description of the live system's present state.

## Safety contract

- Keep source dumps, GPX files, evidence, and environment files outside Git.
- Environment files must have mode `600`; evidence directories must not exist
  before a run and are created with mode `700`.
- The orchestrator accepts only a new project beginning with
  `routefolk-migrate-rehearsal-final-`. It refuses existing containers,
  existing volumes, and an occupied configured port.
- It never calls `down`, removes volumes, edits DNS/OAuth/Pages, or deletes an
  existing project. A failed run is left available for inspection.
- Do not render `docker compose config` without `--quiet`; it can expose
  secrets. Do not include the environment file in ordinary evidence archives.

## Required source layout

```text
SOURCE_EVIDENCE/
  hosted-migration-data.pg15.sql
  hosted-counts.tsv
  hosted-gpx-sha256sums.txt
  hosted-gpx-version-map.tsv
  hosted-gpx-xattr-map.tsv
  hosted-gpx-expected-sizes.tsv
  pg15-restore-retained-sha256sums.txt
  hosted-gpx-files/<trip>/<stage>/<file.gpx>
```

Maps are pipe-delimited without headers:

```text
# path|Storage version|Storage object ID
trip/stage/file.gpx|version-uuid|object-id-uuid

# path|Storage version|cache control|content type
trip/stage/file.gpx|version-uuid|max-age=3600|application/gpx+xml

# path|expected bytes
trip/stage/file.gpx|12345
```

The **second** version-map column is the physical filename. Files are installed
at `stub/stub/gpx-tracks/<path>/<version>` as `0:0`, mode `644`, under mode-755
parents. Both `user.supabase.cache-control` and
`user.supabase.content-type` are mandatory.

## Prepare a final rehearsal

Create a protected project-specific environment file outside the checkout.
Use a new loopback port and the migrated approved `ROUTEFOLK_API_USER_ID`.
Example non-secret values:

```dotenv
BIND_ADDRESS=127.0.0.1
PORT=18085
API_EXTERNAL_URL=http://127.0.0.1:18085
SITE_URL=https://routefolk-selfhost-test.pages.dev
ROUTEFOLK_API_USER_ID=<migrated-active-user-uuid>
```

Validate inputs independently:

```sh
./infrastructure/migration/validate-inputs.sh \
  "$HOME/routefolk-migration-rehearsal"
```

Run once against an unused project, port, and evidence path:

```sh
./infrastructure/migration/run-rehearsal.sh \
  /opt/routefolk-environments/rehearsal-final.env \
  routefolk-migrate-rehearsal-final-1 \
  "$HOME/routefolk-migration-rehearsal" \
  "$HOME/routefolk-migration-rehearsal-final-1"
```

The runner initializes the current schema, stops only target application
services, clears the 16 data targets, restores as `supabase_admin`, compares all
counts, installs and hashes six GPX objects, repairs levels, validates
relationships, starts services, downloads/hashes every GPX through Storage,
tests the API user's trip-list access, records duration, and checksums
evidence.

Success ends with `rehearsal_status=passed`. Review `rehearsal-run.txt`, both
empty diff files, validation output, API response semantics, and the checksum
manifest before accepting the run. OAuth, browser acceptance, backup/restore,
write-freeze planning, production deployment, and rollback remain separate
operator gates.

## Compatibility rendering

`render-compatible-sql.sh` uses the same PostgreSQL client generation as the
source archive, renders data with trigger guards, removes only exact
PostgreSQL-17 `transaction_timeout`, `\restrict`, and `\unrestrict` lines,
checks balanced restrictions, trigger guards, and the transaction boundary,
refuses overwrite, and creates a portable mode-600 checksum manifest.

## Cleanup after evidence approval

Manually verify the exact project name, then remove only that rehearsal:

```sh
docker compose \
  --env-file /opt/routefolk-environments/rehearsal-final.env \
  -p routefolk-migrate-rehearsal-final-1 \
  down --volumes
```

Never use this cleanup command for `routefolk`, production, or a project whose
name was not copied directly from accepted evidence.
