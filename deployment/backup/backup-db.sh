#!/bin/sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="/backup-work/erp-grosir-wijaya-${timestamp}.dump"

cleanup() {
  rm -f "$dump_file"
}
trap cleanup EXIT INT TERM

echo "Membuat backup database ${timestamp}."
pg_dump --format=custom --compress=9 --no-owner --no-acl --file="$dump_file"
restic backup "$dump_file" --tag postgres --tag erp-grosir-wijaya
restic forget --prune \
  --keep-daily "${BACKUP_KEEP_DAILY:-7}" \
  --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" \
  --keep-monthly "${BACKUP_KEEP_MONTHLY:-12}" \
  --tag postgres
restic check
echo "Backup database selesai dan terverifikasi."
