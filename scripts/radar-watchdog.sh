#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi

TZ="${TZ:-Asia/Shanghai}"
PORT="${PORT:-3002}"
HEALTH_URL="${RADAR_HEALTH_URL:-http://127.0.0.1:$PORT}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"
LOG_FILE="${RADAR_WATCHDOG_LOG:-$LOG_DIR/watchdog.log}"
GRACE_SECONDS="${RADAR_WATCHDOG_GRACE_SECONDS:-8}"

mkdir -p "$LOG_DIR"

log() {
  echo "[$(TZ="$TZ" date '+%Y-%m-%d %H:%M:%S %Z')] $*" | tee -a "$LOG_FILE"
}

has_compose() {
  docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

health_ok() {
  local status
  status="$(curl -fsS -o /dev/null -w "%{http_code}" --max-time 6 "$HEALTH_URL" 2>/dev/null || true)"
  [ "$status" = "200" ] || [ "$status" = "401" ]
}

container_state() {
  docker inspect -f '{{.State.Status}}' game-seo-radar 2>/dev/null || true
}

start_radar() {
  if compose up -d radar; then
    return 0
  fi

  local state
  state="$(container_state)"
  if [ -n "$state" ] && [ "$state" != "running" ]; then
    log "compose up failed; removing stale Docker container game-seo-radar in state: $state"
    docker rm -f game-seo-radar >/dev/null 2>&1 || true
  fi

  compose up -d radar
}

if health_ok; then
  if [ "${RADAR_WATCHDOG_VERBOSE:-0}" = "1" ]; then
    log "healthy: $HEALTH_URL"
  fi
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  log "docker is not installed or not in PATH"
  exit 1
fi

if ! has_compose; then
  log "docker compose / docker-compose is not installed or not in PATH"
  exit 1
fi

state="$(container_state)"
log "health check failed at $HEALTH_URL; container state: ${state:-missing}; recovering"

if [ "$state" = "running" ]; then
  compose restart radar || start_radar
else
  start_radar
fi

sleep "$GRACE_SECONDS"

if health_ok; then
  log "recovered: $HEALTH_URL"
  exit 0
fi

log "recovery attempted but health check still failed"
compose ps >> "$LOG_FILE" 2>&1 || true
compose logs --tail=80 radar >> "$LOG_FILE" 2>&1 || true
exit 1
