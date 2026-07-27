#!/bin/sh
set -eu

usage() {
  echo "Usage: infrastructure/backup/verify-backup.sh BACKUP_DIRECTORY" >&2
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

backup_dir="$(CDPATH= cd -- "$1" && pwd)"

for file in database.dump storage.tar.gz counts.tsv manifest.txt sha256sums.txt; do
  test -f "$backup_dir/$file" || {
    echo "Missing backup file: $file" >&2
    exit 1
  }
done

(
  cd "$backup_dir"
  sha256sum -c sha256sums.txt
)

if tar -tzf "$backup_dir/storage.tar.gz" | awk '
  /^\// { bad = 1 }
  /(^|\/)\.\.($|\/)/ { bad = 1 }
  END { exit bad ? 0 : 1 }
'; then
  echo "Storage archive contains an unsafe path." >&2
  exit 1
fi

docker run --rm -i postgres:15-alpine \
  pg_restore --list < "$backup_dir/database.dump" >/dev/null

grep -q '^format_version=2$' "$backup_dir/manifest.txt" || {
  echo "Unsupported or missing backup format version." >&2
  exit 1
}

echo "Backup verification passed: $backup_dir"
