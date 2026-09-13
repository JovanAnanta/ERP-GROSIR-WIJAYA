#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose="$repo_dir/deployment/scripts/compose.sh"
state_dir="$repo_dir/.deployment"
version="${1:-}"

if [[ -z "$version" || ! "$version" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "Pemakaian: ./deployment/scripts/deploy.sh v1.0.0" >&2
  exit 2
fi

required=(
  "$repo_dir/.env"
  "$repo_dir/secrets/cloudflare_tunnel_token.txt"
  "$repo_dir/secrets/restic_password.txt"
  "$repo_dir/secrets/r2_access_key_id.txt"
  "$repo_dir/secrets/r2_secret_access_key.txt"
)
for file in "${required[@]}"; do
  if [[ ! -s "$file" ]]; then
    echo "Konfigurasi wajib belum tersedia atau kosong: $file" >&2
    exit 1
  fi
done

mkdir -p "$state_dir"
current_version=""
if [[ -f "$state_dir/current-version" ]]; then
  current_version="$(<"$state_dir/current-version")"
fi

echo "Mengambil image rilis ${version}."
APP_VERSION="$version" bash "$compose" pull migrate backend frontend backup cloudflared

echo "Menjalankan database migration yang aman."
APP_VERSION="$version" bash "$compose" up -d postgres
echo "Membuat backup pengaman sebelum migration."
APP_VERSION="$version" bash "$compose" run --rm backup /usr/local/bin/backup-db
APP_VERSION="$version" bash "$compose" run --rm migrate

echo "Menjalankan aplikasi versi ${version}."
APP_VERSION="$version" bash "$compose" up -d --no-deps backend frontend cloudflared backup

if ! bash "$repo_dir/deployment/scripts/health-check.sh"; then
  echo "Deployment gagal health check. Periksa log sebelum memilih rollback." >&2
  exit 1
fi

if [[ -n "$current_version" && "$current_version" != "$version" ]]; then
  printf '%s\n' "$current_version" > "$state_dir/previous-version"
fi
printf '%s\n' "$version" > "$state_dir/current-version"
echo "Deployment ${version} berhasil."
