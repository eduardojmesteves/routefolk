#!/bin/sh
set -eu

usage() {
  echo "Usage: $0 SOURCE.dump OUTPUT.sql" >&2
}

case "${1:-}" in -h|--help) usage; exit 0;; '') usage; exit 1;; esac
test -n "${2:-}" || { usage; exit 1; }

source_dump=$1
output_sql=$2
test -f "$source_dump" || { echo "Archive not found: $source_dump" >&2; exit 1; }
test ! -e "$output_sql" || { echo "Refusing to overwrite: $output_sql" >&2; exit 1; }
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required" >&2; exit 1; }

umask 077
raw_sql="${output_sql}.unfiltered.$$"
removed="${output_sql}.removed.$$"
cleanup() { rm -f "$raw_sql" "$removed"; }
trap cleanup EXIT HUP INT TERM
: > "$removed"

pg_restore --file="$raw_sql" --single-transaction "$source_dump"

# PostgreSQL 17 pg_dump emits syntax that PostgreSQL 15 psql does not know.
# Match complete lines only so similarly named application SQL is untouched.
awk -v removed="$removed" '
  $0 == "SET transaction_timeout = 0;" ||
  $0 ~ /^\\(un)?restrict([[:space:]]|$)/ { print > removed; next }
  { print }
' "$raw_sql" > "$output_sql"

unexpected="$(awk '
  $0 != "SET transaction_timeout = 0;" && $0 !~ /^\\(un)?restrict([[:space:]]|$)/ { print }
' "$removed" 2>/dev/null || true)"
test -z "$unexpected" || { echo "Unexpected filtered SQL" >&2; exit 1; }

restrict_count="$(awk '$0 ~ /^\\restrict([[:space:]]|$)/ { n++ } END { print n+0 }' "$removed")"
unrestrict_count="$(awk '$0 ~ /^\\unrestrict([[:space:]]|$)/ { n++ } END { print n+0 }' "$removed")"
timeout_count="$(awk '$0 == "SET transaction_timeout = 0;" { n++ } END { print n+0 }' "$removed")"
test "$restrict_count" -eq "$unrestrict_count" || {
  echo "Unbalanced \\restrict/\\unrestrict commands" >&2; exit 1;
}
test "$timeout_count" -le 1 || { echo "Multiple transaction_timeout settings found" >&2; exit 1; }
grep -q '^BEGIN;$' "$output_sql" && grep -q '^COMMIT;$' "$output_sql" || {
  echo "Rendered SQL does not retain its transaction boundary" >&2; exit 1;
}

chmod 600 "$output_sql"
sha256sum "$output_sql" > "${output_sql}.sha256"
chmod 600 "${output_sql}.sha256"
printf 'Rendered %s (removed timeout=%s, restrict=%s, unrestrict=%s)\n' \
  "$output_sql" "$timeout_count" "$restrict_count" "$unrestrict_count"
