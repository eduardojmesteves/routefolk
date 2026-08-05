# Infrastructure

This directory contains deployment support files, not Routefolk application
modules.

## Docker

`docker/` contains the Nginx gateway configuration and lifecycle scripts used
by the root [`docker-compose.yml`](../docker-compose.yml):

- `setup-env.sh` creates a local, untracked `.env` with generated secrets;
- `bootstrap-db.sh` synchronizes Supabase's internal database-role passwords
  with the generated PostgreSQL password before services connect;
- `migrate.sh` applies the base schema snapshot only to a new database, then
  applies every numbered migration newer than the installed marker in order;
- `nginx.conf` exposes only the backend API gateway routes and applies
  Agent API-specific request logging and rate limiting.

Run scripts from the repository root. Runtime data belongs in Docker volumes
and must never be committed here.

## Backup and restore

`backup/` contains the write-freeze backup, integrity verification, and
isolated restore-rehearsal scripts. See [`backup/README.md`](backup/README.md)
before operating on server volumes.

`migration/` contains the hosted PostgreSQL compatibility renderer, private
Storage installer, restored-data validation, tests, and the clean migration
rehearsal runbook. See [`migration/README.md`](migration/README.md); these tools
are for an isolated rehearsal and do not perform a production cutover.
