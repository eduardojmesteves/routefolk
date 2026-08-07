#!/bin/sh
set -eu

umask 077

usage() {
  cat <<'EOF' >&2
Usage: infrastructure/backup/restore-rehearsal.sh BACKUP_DIRECTORY [PROJECT] [PORT]

Restores into an isolated Compose project. PROJECT defaults to a unique name
beginning with routefolk-restore-, and PORT defaults to 18081. The working
routefolk project is never modified.
EOF
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  '')
    usage
    exit 1
    ;;
esac

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
backup_dir="$(CDPATH= cd -- "$1" && pwd)"
project="${2:-routefolk-restore-$(date -u +%Y%m%d%H%M%S)}"
port="${3:-18081}"

case "$project" in
  routefolk-restore-[a-zA-Z0-9_-]*) ;;
  *)
    echo "PROJECT must begin with routefolk-restore-." >&2
    exit 1
    ;;
esac

case "$port" in
  ''|*[!0-9]*)
    echo "PORT must be numeric." >&2
    exit 1
    ;;
esac

cd "$repo_root"
test -f .env || {
  echo "The checkout .env is required for compatible service secrets." >&2
  exit 1
}

"$repo_root/infrastructure/backup/verify-backup.sh" "$backup_dir"

compose() {
  BIND_ADDRESS=127.0.0.1 \
  PORT="$port" \
  API_EXTERNAL_URL="http://127.0.0.1:$port" \
  SITE_URL="http://127.0.0.1:$port" \
  docker compose -p "$project" "$@"
}

if compose ps -aq | grep -q .; then
  echo "The rehearsal project already has containers: $project" >&2
  echo "Choose another project name or remove that rehearsal explicitly." >&2
  exit 1
fi

echo "Initializing the isolated application project $project..." >&2
# pg_restore --clean emits DROP POLICY statements before recreating the dumped
# tables. Start the full stack once so every current Auth, Storage, and Routefolk
# relation exists as a valid cleanup target in the otherwise empty database.
compose up -d

echo "Entering the isolated restore write-freeze..." >&2
compose stop gateway api auth rest storage >/dev/null

echo "Restoring PostgreSQL schemas and ownership..." >&2
# The Supabase image deliberately makes `postgres` a non-superuser. Restore as
# the image's `supabase_admin` role so owned Auth/Storage schemas can be cleaned
# and the dump can restore their original service-role ownership.
compose exec -T db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_restore \
    -h 127.0.0.1 \
    -U supabase_admin \
    -d postgres \
    --clean \
    --if-exists \
    --exit-on-error' \
  < "$backup_dir/database.dump"

echo "Restoring the isolated Storage volume..." >&2
storage_container="$(compose ps -aq storage)"
storage_volume="$(
  docker inspect "$storage_container" \
    --format '{{range .Mounts}}{{if eq .Destination "/var/lib/storage"}}{{.Name}}{{end}}{{end}}'
)"
test -n "$storage_volume" || {
  echo "Could not identify the rehearsal Storage volume." >&2
  exit 1
}

# The initialized Storage service may have created local scaffolding. Empty only
# the isolated rehearsal volume before extracting the authoritative archive.
docker run --rm \
  -v "$storage_volume:/restore" \
  postgres:15-alpine \
  sh -c 'find /restore -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'

docker run --rm \
  -v "$storage_volume:/restore" \
  -v "$backup_dir:/backup:ro" \
  postgres:15-alpine \
  tar -C /restore -xzf /backup/storage.tar.gz

echo "Starting the restored application..." >&2
compose up -d
sleep 30
compose ps -a

compose exec -T db psql \
  -U postgres \
  -d postgres \
  -X \
  -v ON_ERROR_STOP=1 \
  -A -F '|' <<'SQL' > "$backup_dir/counts.restored.tsv"
SELECT 'object', 'row_count'
UNION ALL SELECT 'auth.users', count(*)::text FROM auth.users
UNION ALL SELECT 'auth.identities', count(*)::text FROM auth.identities
UNION ALL SELECT 'app_members', count(*)::text FROM public.app_members
UNION ALL SELECT 'profiles', count(*)::text FROM public.profiles
UNION ALL SELECT 'trips', count(*)::text FROM public.trips
UNION ALL SELECT 'stages', count(*)::text FROM public.stages
UNION ALL SELECT 'journal_entries', count(*)::text FROM public.journal_entries
UNION ALL SELECT 'expenses', count(*)::text FROM public.expenses
UNION ALL SELECT 'trip_items', count(*)::text FROM public.trip_items
UNION ALL SELECT 'gpx_tracks', count(*)::text FROM public.gpx_tracks
UNION ALL SELECT 'storage.objects', count(*)::text FROM storage.objects
ORDER BY 1;
SQL

diff -u "$backup_dir/counts.tsv" "$backup_dir/counts.restored.tsv"
curl --silent --show-error --fail-with-body "http://127.0.0.1:$port/health"

cat <<EOF

Restore rehearsal passed.
Project: $project
URL: http://127.0.0.1:$port

Inspect the restored data and GPX download, then remove only this rehearsal:
  docker compose -p $project down --volumes
EOF
