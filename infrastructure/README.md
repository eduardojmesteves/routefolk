# Infrastructure

This directory contains deployment support files, not Routefolk application
modules.

## Docker

`docker/` contains the Nginx gateway configuration and lifecycle scripts used
by the root [`docker-compose.yml`](../docker-compose.yml):

- `setup-env.sh` creates a local, untracked `.env` with generated secrets;
- `bootstrap-db.sh` synchronizes Supabase's internal database-role passwords
  with the generated PostgreSQL password before services connect;
- `migrate.sh` applies the database schema snapshot and every newer numbered
  migration in order;
- `nginx.conf` exposes only the backend API gateway routes.

Run scripts from the repository root. Runtime data belongs in Docker volumes
and must never be committed here.
