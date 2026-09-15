#!/bin/sh
set -eu

export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/run/secrets/restic_password}"
export AWS_ACCESS_KEY_ID="$(cat "${BACKUP_ACCESS_KEY_ID_FILE:-/run/secrets/backup_access_key_id}")"
export AWS_SECRET_ACCESS_KEY="$(cat "${BACKUP_SECRET_ACCESS_KEY_FILE:-/run/secrets/backup_secret_access_key}")"

if ! restic snapshots >/dev/null 2>&1; then
  echo "Repository backup belum ada; membuat repository terenkripsi."
  restic init
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ "${BACKUP_ON_START:-true}" = "true" ]; then
  /usr/local/bin/backup-db
fi

exec crond -f -l 2
