#!/bin/sh
set -eu

umask 077

usage() {
  cat <<'EOF'
Usage: infrastructure/backup/backup.sh [BACKUP_ROOT]

Creates a consistent Routefolk database and Storage backup while briefly
stopping the public application services. BACKUP_ROOT defaults to ./backups.
EOF
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
esac

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$repo_root"

command -v docker >/dev/null 2>&1 || {
  echo "docker is required" >&2
  exit 1
}

test -f .env || {
  echo "Run this from a configured Routefolk checkout containing .env." >&2
  exit 1
}

backup_root="${1:-$repo_root/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$backup_root/routefolk-backup-$timestamp"

test ! -e "$backup_dir" || {
  echo "Backup destination already exists: $backup_dir" >&2
  exit 1
}

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

services_stopped=false
resume_services() {
  if "$services_stopped"; then
    echo "Restarting Routefolk services..." >&2
    docker compose up -d >/dev/null
  fi
}
trap resume_services EXIT HUP INT TERM

docker compose config --quiet
docker compose exec -T db pg_isready -U postgres >/dev/null

echo "Entering the backup write-freeze..." >&2
services_stopped=true
docker compose stop gateway agent-api auth rest storage >/dev/null

storage_container="$(docker compose ps -aq storage)"
test -n "$storage_container" || {
  echo "Could not find the Routefolk Storage container." >&2
  exit 1
}

storage_volume="$(
  docker inspect "$storage_container" \
    --format '{{range .Mounts}}{{if eq .Destination "/var/lib/storage"}}{{.Name}}{{end}}{{end}}'
)"
test -n "$storage_volume" || {
  echo "Could not identify the Routefolk Storage volume." >&2
  exit 1
}

echo "Dumping PostgreSQL schemas..." >&2
docker compose exec -T db pg_dump \
  -U postgres \
  -d postgres \
  --format=custom \
  --schema=public \
  --schema=auth \
  --schema=storage \
  > "$backup_dir/database.dump"

echo "Recording validation counts..." >&2
docker compose exec -T db psql \
  -U postgres \
  -d postgres \
  -X \
  -v ON_ERROR_STOP=1 \
  -A -F '|' <<'SQL' > "$backup_dir/counts.tsv"
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

echo "Archiving the private Storage volume..." >&2
docker run --rm \
  -v "$storage_volume:/source:ro" \
  postgres:15-alpine \
  tar -C /source -czf - . \
  > "$backup_dir/storage.tar.gz"

git_commit="$(git rev-parse HEAD 2>/dev/null || printf unknown)"
compose_version="$(docker compose version --short 2>/dev/null || printf unknown)"
cat > "$backup_dir/manifest.txt" <<EOF
format_version=2
created_at_utc=$timestamp
git_commit=$git_commit
compose_version=$compose_version
database=postgres
database_schemas=public,auth,storage
storage_volume=$storage_volume
environment_included=false
ownership_preserved=true
EOF

(
  cd "$backup_dir"
  sha256sum database.dump storage.tar.gz counts.tsv manifest.txt > sha256sums.txt
)

services_stopped=false
trap - EXIT HUP INT TERM
docker compose up -d >/dev/null

printf 'Backup created at %s\n' "$backup_dir"
printf 'The .env file is intentionally excluded; escrow it separately using encryption.\n'
