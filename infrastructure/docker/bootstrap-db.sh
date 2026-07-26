#!/bin/sh
set -eu

# The Supabase PostgreSQL image deliberately makes `postgres` a non-superuser
# and reserves its internal service roles. Use the image's `supabase_admin`
# superuser to align those roles with the operator-generated password before
# dependent services connect. psql safely quotes via :'db_password'.
psql -v ON_ERROR_STOP=1 \
  -v db_password="$POSTGRES_PASSWORD" \
  -h db -U supabase_admin -d postgres <<'SQL'
ALTER ROLE supabase_auth_admin WITH PASSWORD :'db_password';
ALTER ROLE authenticator WITH PASSWORD :'db_password';
ALTER ROLE supabase_storage_admin WITH PASSWORD :'db_password';
SQL

echo 'Supabase database service-role passwords are synchronized.'
