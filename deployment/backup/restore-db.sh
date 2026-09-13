#!/bin/sh
set -eu

if [ "${CONFIRM_DATABASE_RESTORE:-}" != "RESTORE_ERP_DATABASE" ]; then
  echo "Restore dibatalkan: konfirmasi eksplisit tidak tersedia." >&2
  exit 2
fi

snapshot="${1:-latest}"
restore_dir="$(mktemp -d /backup-work/restore.XXXXXX)"

cleanup() {
  rm -rf "$restore_dir"
}
trap cleanup EXIT INT TERM

echo "Mengambil snapshot ${snapshot} dari penyimpanan backup."
restic restore "$snapshot" --target "$restore_dir" --tag postgres
dump_file="$(find "$restore_dir" -type f -name '*.dump' | sort | tail -n 1)"

if [ -z "$dump_file" ]; then
  echo "File database tidak ditemukan pada snapshot." >&2
  exit 1
fi

echo "Memulihkan database. Isi database target akan diganti oleh snapshot terpilih."
pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname="$PGDATABASE" "$dump_file"
echo "Restore database selesai."
