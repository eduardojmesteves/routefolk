#!/bin/sh
set -eu

# The Supabase PostgreSQL image creates these service roles with image defaults.
# Align them with the operator-generated password before dependent services
# connect. psql performs safe literal quoting via :'db_password'.
psql -v ON_ERROR_STOP=1 \
  -v db_password="$POSTGRES_PASSWORD" \
  -h db -U postgres -d postgres <<'SQL'
ALTER ROLE supabase_auth_admin WITH PASSWORD :'db_password';
ALTER ROLE authenticator WITH PASSWORD :'db_password';
ALTER ROLE supabase_storage_admin WITH PASSWORD :'db_password';
SQL

echo 'Supabase database service-role passwords are synchronized.'
