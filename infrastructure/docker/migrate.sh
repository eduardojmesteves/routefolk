#!/bin/sh
set -eu
until psql -h db -U postgres -d postgres -tAc "select to_regclass('auth.users') is not null and to_regclass('storage.buckets') is not null" | grep -q t; do
  echo "Waiting for Auth and Storage database migrations..."
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
