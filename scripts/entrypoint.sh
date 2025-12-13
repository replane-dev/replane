#!/bin/bash
set -e

# Find PostgreSQL bin directory (Debian installs to /usr/lib/postgresql/<version>/bin)
PG_BIN=$(find /usr/lib/postgresql -name bin -type d 2>/dev/null | head -n1)
if [ -z "$PG_BIN" ]; then
  # Fallback: check if pg_ctl is already in PATH
  if command -v pg_ctl >/dev/null 2>&1; then
    PG_BIN=$(dirname "$(command -v pg_ctl)")
  else
    echo "[entrypoint] ERROR: PostgreSQL binaries not found"
    exit 1
  fi
fi
export PATH="$PG_BIN:$PATH"
echo "[entrypoint] Using PostgreSQL binaries from: $PG_BIN"

: "${PGDATA:=/var/lib/postgresql/data}"
: "${PG_LOG:=$PGDATA/server.log}"

# Decide whether to use internal PostgreSQL
use_internal_pg=0
if [ -z "${DATABASE_URL}${DATABASE_USER}${DATABASE_PASSWORD}${DATABASE_HOST}${DATABASE_PORT}${DATABASE_NAME}" ]; then
  use_internal_pg=1
fi

stop_postgres() {
  if [ "$use_internal_pg" -eq 1 ]; then
    echo "[entrypoint] Stopping PostgreSQL..."
    runuser -u postgres -- pg_ctl -D "$PGDATA" -m fast stop || true
  fi
}

# ---------- INIT & START POSTGRES (IF INTERNAL) ----------
if [ "$use_internal_pg" -eq 1 ]; then
  echo "[entrypoint] No external DB env detected, using internal PostgreSQL"

  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "[entrypoint] Initializing PostgreSQL data dir in $PGDATA"
    runuser -u postgres -- initdb -D "$PGDATA"
  fi

  echo "[entrypoint] Starting PostgreSQL..."
  runuser -u postgres -- pg_ctl -D "$PGDATA" -l "$PG_LOG" -w start

  # Create role if not exists
  if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'replane'" | grep -q 1; then
    echo "[entrypoint] Creating role 'replane'..."
    runuser -u postgres -- createuser -l replane
    runuser -u postgres -- psql -c "ALTER ROLE replane PASSWORD 'replane';"
  else
    echo "[entrypoint] Role 'replane' already exists"
  fi

  # Create database if not exists
  if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'replane'" | grep -q 1; then
    echo "[entrypoint] Creating database 'replane'..."
    runuser -u postgres -- createdb -O replane replane
  else
    echo "[entrypoint] Database 'replane' already exists"
  fi

  # Grant privileges
  echo "[entrypoint] Granting privileges..."
  runuser -u postgres -- psql -c "GRANT ALL PRIVILEGES ON DATABASE replane TO replane;"

  export DATABASE_URL="postgres://replane:replane@localhost:5432/replane"
  echo "[entrypoint] Set DATABASE_URL=${DATABASE_URL}"
else
  echo "[entrypoint] External DB configuration detected (at least one DATABASE_* env var present). Skipping internal PostgreSQL."
fi

# ---------- SIGNAL HANDLER ----------
term_handler() {
  echo "[entrypoint] Caught termination signal, stopping services..."

  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    echo "[entrypoint] Stopping app (PID $APP_PID)..."
    kill "$APP_PID" || true
    wait "$APP_PID" || true
    sleep 1 # give the app a moment to exit
    echo "[entrypoint] App stopped"
  fi

  stop_postgres
  exit 0
}

trap term_handler SIGTERM SIGINT

# ---------- START APP ----------
if [ "$#" -eq 0 ]; then
  echo "[entrypoint] No command provided to run. Exiting."
  stop_postgres
  exit 1
fi

echo "[entrypoint] Starting app: $*"
"$@" &
APP_PID=$!

# If app exits, shut everything down
wait "$APP_PID"
APP_EXIT=$?

echo "[entrypoint] App exited with code $APP_EXIT"
stop_postgres

exit "$APP_EXIT"
