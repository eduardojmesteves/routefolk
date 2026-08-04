#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
pass=0
expect_failure() {
  if "$@" >/dev/null 2>&1; then echo "Expected failure: $*" >&2; exit 1; fi
  pass=$((pass + 1))
}

mkdir -p "$tmp/bin" "$tmp/source" "$tmp/dest"
cat > "$tmp/bin/setfattr" <<'EOF'
#!/bin/sh
while test "$#" -gt 1; do case "$1" in -n) name=$2; shift 2;; -v) value=$2; shift 2;; *) break;; esac; done
printf '%s' "$value" > "$1.attr.${name##*.}"
EOF
cat > "$tmp/bin/getfattr" <<'EOF'
#!/bin/sh
while test "$#" -gt 1; do case "$1" in --only-values) shift;; -n) name=$2; shift 2;; *) break;; esac; done
cat "$1.attr.${name##*.}"
EOF
cat > "$tmp/bin/chown" <<'EOF'
#!/bin/sh
# The production installer runs as root in a helper container. The test suite
# runs as the invoking user, so verify the requested ownership without trying
# to perform a privileged ownership change on the fixture.
test "$#" -eq 2
test "$1" = '0:0'
test -f "$2"
EOF
chmod +x "$tmp/bin/setfattr" "$tmp/bin/getfattr" "$tmp/bin/chown"
PATH="$tmp/bin:$PATH"; export PATH

: > "$tmp/version"; : > "$tmp/xattr"; : > "$tmp/size"
i=1
while test "$i" -le 6; do
  path="trip/stage/file-$i.gpx"; version="123e4567-e89b-12d3-a456-42661417400$i"; object="223e4567-e89b-12d3-a456-42661417400$i"
  mkdir -p "$tmp/source/${path%/*}"; printf '<gpx>%s</gpx>\n' "$i" > "$tmp/source/$path"
  printf '%s|%s|%s\n' "$path" "$version" "$object" >> "$tmp/version"
  printf '%s|%s|max-age=3600|application/gpx+xml\n' "$path" "$version" >> "$tmp/xattr"
  printf '%s|%s\n' "$path" "$(stat -c '%s' "$tmp/source/$path")" >> "$tmp/size"
  i=$((i + 1))
done
"$root/infrastructure/migration/install-storage-objects.sh" "$tmp/source" "$tmp/version" "$tmp/xattr" "$tmp/size" "$tmp/dest" >/dev/null
test "$(find "$tmp/dest" -type f ! -name '*.attr.*' | wc -l)" -eq 6; pass=$((pass + 1))

mkdir -p "$tmp/empty"
cp "$tmp/version" "$tmp/bad"; sed -i '1s|trip/stage|../escape|' "$tmp/bad"
expect_failure "$root/infrastructure/migration/install-storage-objects.sh" "$tmp/source" "$tmp/bad" "$tmp/xattr" "$tmp/size" "$tmp/empty"
cp "$tmp/version" "$tmp/bad"; sed -i '1s/123e4567/not-a-uuid/' "$tmp/bad"
expect_failure "$root/infrastructure/migration/install-storage-objects.sh" "$tmp/source" "$tmp/bad" "$tmp/xattr" "$tmp/size" "$tmp/empty"
cp "$tmp/version" "$tmp/bad"; sed -i '2s@.*@trip/stage/file-1.gpx|223e4567-e89b-12d3-a456-426614174002|323e4567-e89b-12d3-a456-426614174002@' "$tmp/bad"
expect_failure "$root/infrastructure/migration/install-storage-objects.sh" "$tmp/source" "$tmp/bad" "$tmp/xattr" "$tmp/size" "$tmp/empty"
cp "$tmp/size" "$tmp/bad-size"; sed -i '1s/|[0-9]*$/|999/' "$tmp/bad-size"
expect_failure "$root/infrastructure/migration/install-storage-objects.sh" "$tmp/source" "$tmp/version" "$tmp/xattr" "$tmp/bad-size" "$tmp/empty"
expect_failure "$root/infrastructure/migration/install-storage-objects.sh" "$tmp/source" "$tmp/version" "$tmp/xattr" "$tmp/size" "$tmp/dest"
head -n 5 "$tmp/xattr" > "$tmp/incomplete-xattr"
expect_failure "$root/infrastructure/migration/install-storage-objects.sh" "$tmp/source" "$tmp/version" "$tmp/incomplete-xattr" "$tmp/size" "$tmp/empty"
cp "$tmp/xattr" "$tmp/wrong-version-xattr"; sed -i '1s/123e4567/323e4567/' "$tmp/wrong-version-xattr"
expect_failure "$root/infrastructure/migration/install-storage-objects.sh" "$tmp/source" "$tmp/version" "$tmp/wrong-version-xattr" "$tmp/size" "$tmp/empty"

# Exact compatibility filtering with a deterministic pg_restore.
cat > "$tmp/bin/pg_restore" <<'EOF'
#!/bin/sh
for arg do case "$arg" in --file=*) output=${arg#--file=};; esac; done
printf '%s\n' '\restrict key' 'BEGIN;' 'SET transaction_timeout = 0;' "SELECT 'SET transaction_timeout = 0;';" 'COMMIT;' '\unrestrict key' > "$output"
EOF
chmod +x "$tmp/bin/pg_restore"; : > "$tmp/archive"
"$root/infrastructure/migration/render-compatible-sql.sh" "$tmp/archive" "$tmp/output.sql" >/dev/null
test "$(cat "$tmp/output.sql")" = "$(printf "BEGIN;\nSELECT 'SET transaction_timeout = 0;';\nCOMMIT;")"; pass=$((pass + 1))

# Complete retained-input fixture and forbidden SQL rejection.
inputs="$tmp/inputs"; mkdir -p "$inputs/hosted-gpx-files/trip/stage"
cp "$tmp/version" "$inputs/hosted-gpx-version-map.tsv"
cp "$tmp/xattr" "$inputs/hosted-gpx-xattr-map.tsv"
cp "$tmp/size" "$inputs/hosted-gpx-expected-sizes.tsv"
cp "$tmp/source/trip/stage/"*.gpx "$inputs/hosted-gpx-files/trip/stage/"
(cd "$inputs/hosted-gpx-files" && sha256sum ./trip/stage/*.gpx) > "$inputs/hosted-gpx-sha256sums.txt"
{
  printf 'BEGIN;\n'
  i=1; while test "$i" -le 16; do
    printf 'ALTER TABLE public.table_%s DISABLE TRIGGER ALL;\n' "$i"
    printf 'COPY public.table_%s (id) FROM stdin;\n' "$i"
    printf 'ALTER TABLE public.table_%s ENABLE TRIGGER ALL;\n' "$i"
    i=$((i + 1))
  done
  printf 'COMMIT;\n'
} > "$inputs/hosted-migration-data.pg15.sql"
{
  printf 'object|row_count\n'
  i=1; while test "$i" -le 16; do printf 'table_%s|0\n' "$i"; i=$((i + 1)); done
  printf '(16 rows)\n'
} > "$inputs/hosted-counts.tsv"
(cd "$inputs" && sha256sum hosted-migration-data.pg15.sql) > "$inputs/pg15-restore-retained-sha256sums.txt"
"$root/infrastructure/migration/validate-inputs.sh" "$inputs" >/dev/null; pass=$((pass + 1))
printf '\\restrict forbidden\n' >> "$inputs/hosted-migration-data.pg15.sql"
expect_failure "$root/infrastructure/migration/validate-inputs.sh" "$inputs"

echo "Migration tests passed: $pass"
