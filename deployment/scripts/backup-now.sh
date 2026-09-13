#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec bash "$repo_dir/deployment/scripts/compose.sh" run --rm backup /usr/local/bin/backup-db
