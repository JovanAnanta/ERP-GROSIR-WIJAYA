#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app_port="$(sed -n 's/^APP_PORT=//p' "$repo_dir/.env" | tail -n 1)"
app_port="${app_port:-8080}"
frontend_health_url="http://127.0.0.1:${app_port}/health"
backend_health_url="http://127.0.0.1:${app_port}/api/v1/health/ready"
compose="$repo_dir/deployment/scripts/compose.sh"

check_required_container() {
  local service="$1"
  local container_id
  local health
  local state

  container_id="$(bash "$compose" ps -q "$service")"
  if [[ -z "$container_id" ]]; then
    echo "Container wajib tidak ditemukan: $service" >&2
    return 1
  fi

  state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
  if [[ "$state" != "running" ]]; then
    echo "Container $service tidak berjalan (status: $state)." >&2
    return 1
  fi

  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_id")"
  if [[ -n "$health" && "$health" != "healthy" ]]; then
    echo "Container $service belum sehat (health: $health)." >&2
    return 1
  fi
}

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 5 "$frontend_health_url" >/dev/null \
    && curl --fail --silent --show-error --max-time 5 "$backend_health_url" >/dev/null \
    && check_required_container postgres \
    && check_required_container backup \
    && check_required_container cloudflared; then
    echo "Frontend, backend, database, backup, dan Tunnel dalam kondisi sehat."
    exit 0
  fi
  echo "Menunggu aplikasi sehat (${attempt}/30)..."
  sleep 2
done

echo "Aplikasi belum sehat setelah 60 detik." >&2
exit 1
