#!/bin/sh
set -eu
umask 077

usage() {
  cat >&2 <<'EOF'
Usage: run-rehearsal.sh ENV_FILE PROJECT SOURCE_EVIDENCE EVIDENCE_OUTPUT

PROJECT must begin with routefolk-migrate-rehearsal-final-. The target project,
its volumes, EVIDENCE_OUTPUT, and the configured loopback port must be unused.
The script never removes Docker resources and never performs production cutover.
EOF
}
test "$#" -eq 4 || { usage; exit 1; }

env_file=$1 project=$2 source=$3 evidence=$4
case "$project" in
  routefolk-migrate-rehearsal-final-*) ;;
  *) echo 'Refusing non-final-rehearsal project name.' >&2; exit 1;;
esac
case "$project" in *[!A-Za-z0-9_-]*) echo 'Project name contains unsafe characters.' >&2; exit 1;; esac
test -f "$env_file" || { echo "Environment file not found: $env_file" >&2; exit 1; }
test "$(stat -c '%a' "$env_file")" = 600 || { echo 'Environment file must have mode 600.' >&2; exit 1; }
test ! -e "$evidence" || { echo "Evidence output already exists: $evidence" >&2; exit 1; }

repo=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo"
for command in docker curl sha256sum python3 ss; do command -v "$command" >/dev/null 2>&1 || { echo "$command is required" >&2; exit 1; }; done
docker compose --env-file "$env_file" -p "$project" config --quiet
"$repo/infrastructure/migration/validate-inputs.sh" "$source"

test -z "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" || { echo 'Target project already has containers.' >&2; exit 1; }
test -z "$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" || { echo 'Target project already has volumes.' >&2; exit 1; }
port=$(sed -n 's/^PORT=//p' "$env_file" | tail -n 1)
case "$port" in ''|*[!0-9]*) echo 'Invalid PORT in environment file.' >&2; exit 1;; esac
test -z "$(ss -ltn | awk -v port=":$port" '$4 ~ (port "$") { print }')" || { echo "Port $port is already in use." >&2; exit 1; }

install -d -m 700 "$evidence"
run_file=$evidence/rehearsal-run.txt
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf 'status=running\nstarted_at_utc=%s\ngit_commit=%s\nproject=%s\nport=%s\n' \
  "$started" "$(git rev-parse HEAD 2>/dev/null || printf unknown)" "$project" "$port" > "$run_file"
{
  docker ps --filter 'label=com.docker.compose.project=routefolk' --format 'routefolk|{{.Names}}|{{.ID}}'
  docker ps --filter 'label=com.docker.compose.project=routefolk-migrate-rehearsal' --format 'routefolk-migrate-rehearsal|{{.Names}}|{{.ID}}'
} | sort > "$evidence/existing-container-ids-before.txt"
finished=false
finish() {
  status=$?
  test -z "${curl_config:-}" || rm -f "$curl_config"
  test -z "${agent_config:-}" || rm -f "$agent_config"
  if ! "$finished"; then
    printf 'status=failed\nexit_status=%s\nfinished_at_utc=%s\n' "$status" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$run_file"
  fi
}
trap finish EXIT HUP INT TERM

compose() { docker compose --env-file "$env_file" -p "$project" "$@"; }

compose up -d
sleep 20
curl --silent --show-error --fail "http://127.0.0.1:$port/health" >/dev/null
compose stop gateway agent-api auth rest storage >/dev/null
compose exec -T db pg_isready -U postgres -d postgres >/dev/null

compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h 127.0.0.1 -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1' \
  < "$repo/infrastructure/migration/clear-targets.sql" > "$evidence/database-clear.log" 2>&1
compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h 127.0.0.1 -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1' \
  < "$source/hosted-migration-data.pg15.sql" > "$evidence/database-restore.log" 2>&1

{
  printf 'object|row_count\n'
  compose exec -T db psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -A -t -P footer=off -F '|' \
    < "$repo/infrastructure/migration/counts.sql"
  printf '(16 rows)\n'
} > "$evidence/restored-counts.tsv"
diff -u "$source/hosted-counts.tsv" "$evidence/restored-counts.tsv" > "$evidence/counts.diff"

storage_container=$(compose ps -aq storage)
storage_volume=$(docker inspect "$storage_container" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/storage"}}{{.Name}}{{end}}{{end}}')
test "$storage_volume" = "${project}_routefolk-storage" || { echo "Unexpected Storage volume: $storage_volume" >&2; exit 1; }

docker run --rm \
  -v "$storage_volume:/storage" \
  -v "$source/hosted-gpx-files:/source:ro" \
  -v "$source/hosted-gpx-version-map.tsv:/maps/version-map:ro" \
  -v "$source/hosted-gpx-xattr-map.tsv:/maps/xattr-map:ro" \
  -v "$source/hosted-gpx-expected-sizes.tsv:/maps/size-map:ro" \
  -v "$repo/infrastructure/migration/install-storage-objects.sh:/tool:ro" \
  alpine:3.20 sh -c 'apk add --no-cache attr >/dev/null && /tool /source /maps/version-map /maps/xattr-map /maps/size-map /storage' \
  > "$evidence/storage-install.log" 2>&1

docker run --rm -v "$storage_volume:/storage:ro" -v "$source/hosted-gpx-version-map.tsv:/map:ro" alpine:3.20 sh -c '
  set -eu
  while IFS="|" read -r path version object_id; do
    hash=$(sha256sum "/storage/stub/stub/gpx-tracks/$path/$version" | cut -d " " -f 1)
    printf "%s  ./%s\n" "$hash" "$path"
  done < /map
' > "$evidence/volume-gpx-sha256sums.txt"
diff -u "$source/hosted-gpx-sha256sums.txt" "$evidence/volume-gpx-sha256sums.txt" > "$evidence/volume-hashes.diff"

compose exec -T db psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 <<'SQL' > "$evidence/level-repair.log"
UPDATE storage.objects SET level = storage.get_level(name)
WHERE bucket_id = 'gpx-tracks' AND level IS DISTINCT FROM storage.get_level(name);
SQL
compose exec -T db psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 \
  < "$repo/infrastructure/migration/validate-restored-data.sql" > "$evidence/relationship-validation.txt"

compose up -d auth rest storage agent-api gateway
sleep 20
curl --silent --show-error --fail "http://127.0.0.1:$port/health" >/dev/null

downloads=$evidence/api-gpx-downloads
install -d -m 700 "$downloads"
curl_config=$evidence/.storage-curl.conf
service_key=$(sed -n 's/^SERVICE_ROLE_KEY=//p' "$env_file" | tail -n 1)
printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' "$service_key" "$service_key" > "$curl_config"
unset service_key
while IFS='|' read -r path version object_id; do
  destination=$downloads/$path
  mkdir -p "${destination%/*}"; chmod 700 "${destination%/*}"
  curl --silent --show-error --fail-with-body --config "$curl_config" --output "$destination" \
    "http://127.0.0.1:$port/storage/v1/object/authenticated/gpx-tracks/$path"
  chmod 600 "$destination"
done < "$source/hosted-gpx-version-map.tsv"
rm -f "$curl_config"
(cd "$downloads" && sha256sum --quiet -c "$source/hosted-gpx-sha256sums.txt")
(cd "$downloads" && find . -type f -name '*.gpx' -print0 | sort -z | xargs -0 sha256sum) > "$evidence/api-gpx-sha256sums.txt"
diff -u "$source/hosted-gpx-sha256sums.txt" "$evidence/api-gpx-sha256sums.txt" > "$evidence/api-hashes.diff"

agent_config=$evidence/.agent-curl.conf
agent_key=$(sed -n 's/^AGENT_API_KEY=//p' "$env_file" | tail -n 1)
printf 'header = "Authorization: Bearer %s"\n' "$agent_key" > "$agent_config"; unset agent_key
agent_status=$(curl --silent --show-error --config "$agent_config" --output "$evidence/agent-list.json" --write-out '%{http_code}' \
  "http://127.0.0.1:$port/agent/v1/resources/trips?limit=10")
rm -f "$agent_config"
test "$agent_status" = 200 || { echo "Agent API returned $agent_status" >&2; exit 1; }
agent_id=$(sed -n 's/^AGENT_USER_ID=//p' "$env_file" | tail -n 1)
valid_uuid=$(printf '%s\n' "$agent_id" | grep -Ec '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
test "$valid_uuid" -eq 1 || { echo 'Invalid AGENT_USER_ID.' >&2; exit 1; }
expected_agent_rows=$(compose exec -T db psql -U postgres -d postgres -X -A -t -P footer=off \
  -c "SELECT count(*) FROM public.trips WHERE public.user_has_trip_access(id, '$agent_id'::uuid);")
python3 -c 'import json,sys; rows=json.load(open(sys.argv[1]))["data"]; assert isinstance(rows,list) and len(rows)==int(sys.argv[2])' \
  "$evidence/agent-list.json" "$expected_agent_rows"

{
  docker ps --filter 'label=com.docker.compose.project=routefolk' --format 'routefolk|{{.Names}}|{{.ID}}'
  docker ps --filter 'label=com.docker.compose.project=routefolk-migrate-rehearsal' --format 'routefolk-migrate-rehearsal|{{.Names}}|{{.ID}}'
} | sort > "$evidence/existing-container-ids-after.txt"
diff -u "$evidence/existing-container-ids-before.txt" "$evidence/existing-container-ids-after.txt" \
  > "$evidence/existing-container-ids.diff"

finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
duration=$(python3 -c 'from datetime import datetime; import sys; a=datetime.strptime(sys.argv[1],"%Y-%m-%dT%H:%M:%SZ"); b=datetime.strptime(sys.argv[2],"%Y-%m-%dT%H:%M:%SZ"); print(int((b-a).total_seconds()))' "$started" "$finished_at")
printf 'status=passed\nfinished_at_utc=%s\nduration_seconds=%s\n' "$finished_at" "$duration" >> "$run_file"
find "$evidence" -type f ! -name evidence-sha256sums.txt -print0 | sort -z | xargs -0 sha256sum > "$evidence/evidence-sha256sums.txt"
finished=true
trap - EXIT HUP INT TERM
printf 'rehearsal_status=passed duration_seconds=%s project=%s\n' "$duration" "$project"
