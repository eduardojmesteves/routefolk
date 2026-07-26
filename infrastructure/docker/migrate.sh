#!/bin/sh
set -eu

# Auth and Storage create their schemas asynchronously. Seeing the tables is
# not sufficient: PostgreSQL can expose a table while a service is still adding
# the columns used by Routefolk's schema snapshot. Wait for the actual contract
# needed below, and fail after two minutes instead of hanging forever.
attempt=1
while ! psql -h db -U postgres -d postgres -tAc "
  select
    to_regclass('auth.users') is not null
    and to_regclass('storage.buckets') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = 'email'
    )
    and not exists (
      select required.column_name
      from (values ('public'), ('file_size_limit'), ('allowed_mime_types')) required(column_name)
      where not exists (
        select 1 from information_schema.columns actual
        where actual.table_schema = 'storage'
          and actual.table_name = 'buckets'
          and actual.column_name = required.column_name
      )
    );
" | grep -q t; do
  if [ "$attempt" -ge 60 ]; then
    echo "Auth/Storage schemas did not become ready within 120 seconds." >&2
    exit 1
  fi
  echo "Waiting for complete Auth and Storage database migrations ($attempt/60)..."
  attempt=$((attempt + 1))
  sleep 2
done
psql -v ON_ERROR_STOP=1 -h db -U postgres -d postgres -f /schema.sql

# schema.sql is currently a snapshot through the version recorded in app_meta.
# Apply every newer migration in filename order so a fresh self-hosted database
# cannot silently miss migrations when new files are added.
current=$(psql -h db -U postgres -d postgres -tAc \
  "select value from public.app_meta where key = 'schema_version'" | tr -d '[:space:]')
current=$(printf '%s' "$current" | sed 's/^0*//')
current=${current:-0}

for migration in /migrations/[0-9][0-9][0-9]_*.sql; do
  [ -e "$migration" ] || continue
  version=${migration##*/}
  version=${version%%_*}
  version=$(printf '%s' "$version" | sed 's/^0*//')
  version=${version:-0}
  if [ "$version" -gt "$current" ]; then
    echo "Applying ${migration##*/}..."
    psql -v ON_ERROR_STOP=1 -h db -U postgres -d postgres -f "$migration"
  fi
done
