#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose="$repo_dir/deployment/scripts/compose.sh"
snapshot="${1:-latest}"

echo "PERINGATAN: restore akan mengganti isi database aktif dengan snapshot '${snapshot}'."
read -r -p "Ketik RESTORE untuk melanjutkan: " confirmation
if [[ "$confirmation" != "RESTORE" ]]; then
  echo "Restore dibatalkan."
  exit 2
fi

echo "Membuat backup pengaman sebelum restore."
bash "$repo_dir/deployment/scripts/backup-now.sh"

echo "Menghentikan akses aplikasi selama restore."
bash "$compose" stop cloudflared frontend backend backup
CONFIRM_DATABASE_RESTORE=RESTORE_ERP_DATABASE \
  bash "$compose" run --rm -e CONFIRM_DATABASE_RESTORE backup /usr/local/bin/restore-db "$snapshot"
bash "$compose" run --rm migrate
bash "$compose" up -d --no-deps backend frontend cloudflared backup
bash "$repo_dir/deployment/scripts/health-check.sh"
echo "Restore selesai dan aplikasi kembali sehat."
