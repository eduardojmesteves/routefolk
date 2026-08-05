#!/bin/sh
set -eu

usage() {
  cat >&2 <<'EOF'
Usage: install-storage-objects.sh SOURCE VERSION_MAP XATTR_MAP SIZE_MAP DESTINATION

Maps are pipe-delimited, without headers:
  VERSION_MAP: object-path|storage-version|storage-object-id
  XATTR_MAP:   object-path|storage-version|cache-control|content-type
  SIZE_MAP:    object-path|byte-size
EOF
}

test "$#" -eq 5 || { usage; exit 1; }
source_dir=$1 version_map=$2 xattr_map=$3 size_map=$4 destination=$5

for directory in "$source_dir" "$destination"; do
  test -d "$directory" || { echo "Directory not found: $directory" >&2; exit 1; }
done
for file in "$version_map" "$xattr_map" "$size_map"; do
  test -f "$file" || { echo "Map not found: $file" >&2; exit 1; }
done
for command in setfattr getfattr sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "$command is required" >&2; exit 1; }
done

valid_path() {
  case "$1" in ''|/*|*'//'*) return 1;; esac
  old_ifs=$IFS; IFS=/; set -- $1; IFS=$old_ifs
  for component do
    test -n "$component" && test "$component" != . && test "$component" != .. || return 1
    case "$component" in *[!A-Za-z0-9._-]*) return 1;; esac
  done
}
valid_uuid() {
  printf '%s\n' "$1" | grep -Eq '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
}
map_value() {
  file=$1 wanted=$2 column=$3
  awk -F '|' -v wanted="$wanted" -v column="$column" '
    $1 == wanted { count++; value = $column }
    END { if (count != 1) exit 1; print value }
  ' "$file"
}

# Validate the complete input set before making the first write.
count=0
seen_file="${TMPDIR:-/tmp}/routefolk-storage-seen.$$"
: > "$seen_file"
trap 'rm -f "$seen_file"' EXIT HUP INT TERM
while IFS='|' read -r path version object_id extra; do
  test -z "${extra:-}" && valid_path "$path" && valid_uuid "$version" && valid_uuid "$object_id" || {
    echo "Invalid version-map row: $path" >&2; exit 1;
  }
  grep -Fqx "$path" "$seen_file" && { echo "Duplicate object path: $path" >&2; exit 1; }
  printf '%s\n' "$path" >> "$seen_file"
  source_file="$source_dir/$path"
  target="$destination/stub/stub/gpx-tracks/$path/$version"
  test -f "$source_file" || { echo "Missing source object: $path" >&2; exit 1; }
  test ! -e "$target" || { echo "Target already exists: $path" >&2; exit 1; }
  expected_size=$(map_value "$size_map" "$path" 2) || { echo "Incomplete size map: $path" >&2; exit 1; }
  test "$(stat -c '%s' "$source_file")" = "$expected_size" || { echo "Size mismatch: $path" >&2; exit 1; }
  xattr_version=$(map_value "$xattr_map" "$path" 2) || { echo "Incomplete xattr map: $path" >&2; exit 1; }
  test "$xattr_version" = "$version" || { echo "Version/xattr map mismatch: $path" >&2; exit 1; }
  count=$((count + 1))
done < "$version_map"
test "$count" -eq 6 || { echo "Expected 6 Storage mappings, found $count" >&2; exit 1; }
test "$(awk -F '|' 'NF { if (NF != 4) exit 2; n++ } END { print n+0 }' "$xattr_map")" -eq 6
test "$(awk -F '|' 'NF { if (NF != 2) exit 2; n++ } END { print n+0 }' "$size_map")" -eq 6

installed=0
while IFS='|' read -r path version object_id; do
  source_file="$source_dir/$path"
  target="$destination/stub/stub/gpx-tracks/$path/$version"
  cache_control=$(map_value "$xattr_map" "$path" 3)
  content_type=$(map_value "$xattr_map" "$path" 4)
  mkdir -p "${target%/*}"
  chmod 755 "${target%/*}"
  cp "$source_file" "$target"
  chown 0:0 "$target"
  chmod 644 "$target"
  setfattr -n user.supabase.cache-control -v "$cache_control" "$target"
  setfattr -n user.supabase.content-type -v "$content_type" "$target"
  test "$(getfattr --only-values -n user.supabase.cache-control "$target" 2>/dev/null)" = "$cache_control"
  test "$(getfattr --only-values -n user.supabase.content-type "$target" 2>/dev/null)" = "$content_type"
  installed=$((installed + 1))
  printf 'installed|%s|%s|%s\n' "$path" "$version" "$(stat -c '%s' "$target")"
done < "$version_map"

test "$installed" -eq 6
printf 'storage_installation=passed installed=%s\n' "$installed"
