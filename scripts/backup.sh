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
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"
TIMESTAMP="$(TZ="$TZ" date '+%Y%m%d-%H%M%S')"
BACKUP_NAME="radar-$TIMESTAMP.sqlite"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
LOG_FILE="$LOG_DIR/backup.log"

mkdir -p "$BACKUP_DIR" "$LOG_DIR" "$ROOT_DIR/data"

echo "[$(TZ="$TZ" date '+%Y-%m-%d %H:%M:%S %Z')] Starting SQLite backup" | tee -a "$LOG_FILE"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && [ -f "$ROOT_DIR/docker-compose.yml" ]; then
  if docker compose ps --services --filter "status=running" | grep -qx "radar"; then
    docker compose exec -T radar sh -c "sqlite3 \"\${DATABASE_PATH:-/app/data/radar.sqlite}\" \".backup '/app/backups/$BACKUP_NAME'\""
  else
    docker compose run --rm radar sh -c "sqlite3 \"\${DATABASE_PATH:-/app/data/radar.sqlite}\" \".backup '/app/backups/$BACKUP_NAME'\""
  fi
else
  SQLITE_PATH="${DATABASE_PATH:-$ROOT_DIR/data/radar.sqlite}"
  sqlite3 "$SQLITE_PATH" ".backup '$BACKUP_PATH'"
fi

gzip -f "$BACKUP_PATH"
find "$BACKUP_DIR" -type f -name "radar-*.sqlite.gz" -mtime +30 -delete

echo "[$(TZ="$TZ" date '+%Y-%m-%d %H:%M:%S %Z')] Backup saved to $BACKUP_PATH.gz" | tee -a "$LOG_FILE"
