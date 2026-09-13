#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
previous_file="$repo_dir/.deployment/previous-version"

if [[ ! -s "$previous_file" ]]; then
  echo "Versi sebelumnya belum tercatat; rollback otomatis tidak tersedia." >&2
  exit 1
fi

previous_version="$(<"$previous_file")"
echo "Rollback aplikasi ke ${previous_version}. Migration database tidak diturunkan secara destruktif."
exec bash "$repo_dir/deployment/scripts/deploy.sh" "$previous_version"
