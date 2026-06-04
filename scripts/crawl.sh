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
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"
LOG_FILE="$LOG_DIR/crawl.log"

mkdir -p "$LOG_DIR" "$ROOT_DIR/data" "$ROOT_DIR/backups"

echo "[$(TZ="$TZ" date '+%Y-%m-%d %H:%M:%S %Z')] Starting incremental crawl" | tee -a "$LOG_FILE"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && [ -f "$ROOT_DIR/docker-compose.yml" ]; then
  docker compose run --rm radar npm run crawl 2>&1 | tee -a "$LOG_FILE"
else
  DATABASE_PATH="${DATABASE_PATH:-$ROOT_DIR/data/radar.sqlite}" npm run crawl 2>&1 | tee -a "$LOG_FILE"
fi

echo "[$(TZ="$TZ" date '+%Y-%m-%d %H:%M:%S %Z')] Finished incremental crawl" | tee -a "$LOG_FILE"
