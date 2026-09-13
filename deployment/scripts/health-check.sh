#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app_port="$(sed -n 's/^APP_PORT=//p' "$repo_dir/.env" | tail -n 1)"
app_port="${app_port:-8080}"
frontend_health_url="http://127.0.0.1:${app_port}/health"
backend_health_url="http://127.0.0.1:${app_port}/api/v1/health/ready"

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 5 "$frontend_health_url" >/dev/null \
    && curl --fail --silent --show-error --max-time 5 "$backend_health_url" >/dev/null; then
    echo "Frontend, backend, dan database dalam kondisi sehat."
    exit 0
  fi
  echo "Menunggu aplikasi sehat (${attempt}/30)..."
  sleep 2
done

echo "Aplikasi belum sehat setelah 60 detik." >&2
exit 1
