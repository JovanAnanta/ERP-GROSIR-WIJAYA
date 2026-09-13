#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_dir"

if [[ ! -f .env ]]; then
  echo "File .env production belum tersedia di $repo_dir." >&2
  exit 1
fi

if [[ -z "${APP_VERSION:-}" && -s .deployment/current-version ]]; then
  export APP_VERSION="$(<.deployment/current-version)"
fi

exec docker compose --env-file .env -f docker-compose.production.yml "$@"
