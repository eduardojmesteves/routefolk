#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 SOURCE_WORKTREE DESTINATION" >&2
  exit 64
fi

source_dir=${1%/}
destination=${2%/}

if [ ! -f "$source_dir/index.html" ] || [ ! -f "$source_dir/lib/config.js" ]; then
  echo "Source does not look like a Routefolk frontend worktree: $source_dir" >&2
  exit 66
fi

if [ -e "$destination" ]; then
  echo "Destination already exists; remove it explicitly before rebuilding: $destination" >&2
  exit 73
fi

mkdir -p "$destination"

for path in \
  _headers \
  app.js \
  index.html \
  manifest.json \
  style.css \
  style-fidelity.css \
  sw.js \
  actions \
  components \
  constants \
  icons \
  lib \
  screens \
  state \
  styles \
  utils \
  vendor
do
  if [ ! -e "$source_dir/$path" ]; then
    echo "Required frontend path is missing: $source_dir/$path" >&2
    rm -rf "$destination"
    exit 66
  fi
  cp -R "$source_dir/$path" "$destination/$path"
done

if find "$destination" -name 'wrangler.*' -o -name '.env*' | grep -q .; then
  echo 'Refusing bundle containing Wrangler configuration or environment files.' >&2
  rm -rf "$destination"
  exit 65
fi

echo "Static Pages bundle created at $destination"
