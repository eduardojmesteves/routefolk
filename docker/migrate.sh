#!/bin/sh
set -eu
until psql -h db -U postgres -d postgres -tAc "select to_regclass('auth.users') is not null and to_regclass('storage.buckets') is not null" | grep -q t; do
  echo "Waiting for Auth and Storage database migrations..."
  sleep 2
done
psql -v ON_ERROR_STOP=1 -h db -U postgres -d postgres -f /schema.sql
psql -v ON_ERROR_STOP=1 -h db -U postgres -d postgres -f /migrations/014_items.sql
psql -v ON_ERROR_STOP=1 -h db -U postgres -d postgres -f /migrations/015_trip_level_visibility.sql
