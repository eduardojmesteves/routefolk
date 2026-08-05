#!/bin/sh
set -eu

test "$#" -eq 1 || { echo "Usage: $0 SOURCE_EVIDENCE_DIRECTORY" >&2; exit 1; }
root=$1
required='hosted-migration-data.pg15.sql hosted-counts.tsv hosted-gpx-sha256sums.txt hosted-gpx-version-map.tsv hosted-gpx-xattr-map.tsv hosted-gpx-expected-sizes.tsv pg15-restore-retained-sha256sums.txt'
for name in $required; do test -f "$root/$name" || { echo "Missing input: $name" >&2; exit 1; }; done
test -d "$root/hosted-gpx-files" || { echo "Missing hosted-gpx-files" >&2; exit 1; }

sql=$root/hosted-migration-data.pg15.sql
test "$(grep -c '^BEGIN;$' "$sql")" -eq 1
test "$(grep -c '^COMMIT;$' "$sql")" -eq 1
test "$(grep -c '^COPY ' "$sql")" -eq 16
test "$(grep -c 'DISABLE TRIGGER ALL;' "$sql")" -eq 16
test "$(grep -c 'ENABLE TRIGGER ALL;' "$sql")" -eq 16
if grep -Eq '^SET transaction_timeout = 0;$|^\\(un)?restrict([[:space:]]|$)' "$sql"; then
  echo 'SQL contains unsupported PostgreSQL 17 commands.' >&2
  exit 1
fi

test "$(awk -F '|' 'NF { if (NF != 3) exit 2; n++ } END { print n+0 }' "$root/hosted-gpx-version-map.tsv")" -eq 6
test "$(awk -F '|' 'NF { if (NF != 4) exit 2; n++ } END { print n+0 }' "$root/hosted-gpx-xattr-map.tsv")" -eq 6
test "$(awk -F '|' 'NF { if (NF != 2) exit 2; n++ } END { print n+0 }' "$root/hosted-gpx-expected-sizes.tsv")" -eq 6

(cd "$root/hosted-gpx-files" && sha256sum --quiet -c ../hosted-gpx-sha256sums.txt)
(cd "$root" && sha256sum --quiet -c pg15-restore-retained-sha256sums.txt)
test "$(find "$root/hosted-gpx-files" -type f -name '*.gpx' | wc -l | tr -d ' ')" -eq 6

awk -F '|' 'NR == 1 { next } /^\([0-9]+ rows\)$/ { next } NF == 2 { n++ } END { exit n == 16 ? 0 : 1 }' "$root/hosted-counts.tsv"
echo 'migration_inputs=passed'
