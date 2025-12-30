#!/bin/bash
set -e

if [ -n "${SWAP_SIZE}" ]; then
  fallocate -l ${SWAP_SIZE} /swapfile
  chmod 0600 /swapfile
  mkswap /swapfile
  echo 10 > /proc/sys/vm/swappiness
  swapon /swapfile
  echo 1 > /proc/sys/vm/overcommit_memory
fi

: "${PGDATA:=/var/lib/postgresql/data}"
: "${PG_LOG:=$PGDATA/server.log}"

# Check if external database is configured
has_external_db=0
if [ -n "${DATABASE_URL}${DATABASE_USER}${DATABASE_PASSWORD}${DATABASE_HOST}${DATABASE_PORT}${DATABASE_NAME}" ]; then
  has_external_db=1
fi

# Decide whether to use internal PostgreSQL
use_internal_pg=0
if [ "$EMBEDDED_POSTGRES" = "true" ] && [ "$has_external_db" -eq 0 ]; then
  use_internal_pg=1
elif [ "$EMBEDDED_POSTGRES" != "true" ] && [ "$has_external_db" -eq 0 ]; then
  echo "ERROR: This is a slim image without bundled database."
  echo "You must provide DATABASE_URL or DATABASE_HOST/DATABASE_USER/DATABASE_PASSWORD/DATABASE_NAME environment variables."
  echo ""
  echo "Example:"
  echo "  docker run -e DATABASE_URL=postgres://user:pass@host:5432/dbname replane/replane:slim"
  echo ""
  echo "If you need a standalone deployment with bundled database, use the full image:"
  echo "  docker pull replane/replane:latest"
  exit 1
fi

# Log function that only prints when using internal PostgreSQL
log() {
  if [ "$use_internal_pg" -eq 1 ]; then
    echo "[entrypoint] $*"
  fi
}

# Find PostgreSQL bin directory (only needed when using internal PostgreSQL)
if [ "$use_internal_pg" -eq 1 ]; then
  PG_BIN=$(find /usr/lib/postgresql -name bin -type d 2>/dev/null | head -n1)
  if [ -z "$PG_BIN" ]; then
    # Fallback: check if pg_ctl is already in PATH
    if command -v pg_ctl >/dev/null 2>&1; then
      PG_BIN=$(dirname "$(command -v pg_ctl)")
    else
      echo "ERROR: PostgreSQL binaries not found but EMBEDDED_POSTGRES=true"
      exit 1
    fi
  fi
  export PATH="$PG_BIN:$PATH"
  log "Using PostgreSQL binaries from: $PG_BIN"
fi

stop_postgres() {
  if [ "$use_internal_pg" -eq 1 ]; then
    log "Stopping PostgreSQL..."
    runuser -u postgres -- pg_ctl -D "$PGDATA" -m fast stop || true
  fi
}

# ---------- INIT & START POSTGRES (IF INTERNAL) ----------
if [ "$use_internal_pg" -eq 1 ]; then
  log "No external DB env detected, using internal PostgreSQL"

  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    log "Initializing PostgreSQL data dir in $PGDATA"
    runuser -u postgres -- initdb -D "$PGDATA"
  fi

  log "Starting PostgreSQL..."
  runuser -u postgres -- pg_ctl -D "$PGDATA" -l "$PG_LOG" -w start

  # Create role if not exists
  if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'replane'" | grep -q 1; then
    log "Creating role 'replane'..."
    runuser -u postgres -- createuser -l replane
    runuser -u postgres -- psql -c "ALTER ROLE replane PASSWORD 'replane';"
  else
    log "Role 'replane' already exists"
  fi

  # Create database if not exists
  if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'replane'" | grep -q 1; then
    log "Creating database 'replane'..."
    runuser -u postgres -- createdb -O replane replane
  else
    log "Database 'replane' already exists"
  fi

  # Grant privileges
  log "Granting privileges..."
  runuser -u postgres -- psql -c "GRANT ALL PRIVILEGES ON DATABASE replane TO replane;"

  export DATABASE_URL="postgres://replane:replane@localhost:5432/replane"
  log "Set DATABASE_URL=${DATABASE_URL}"
fi

# ---------- SIGNAL HANDLER ----------
term_handler() {
  log "Caught termination signal, stopping services..."

  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    log "Stopping app (PID $APP_PID)..."
    kill "$APP_PID" || true
    wait "$APP_PID" || true
    sleep 3 # give the app a moment to exit
    log "App stopped"
  fi

  stop_postgres
  exit 0
}

trap term_handler SIGTERM SIGINT


# ---------- START APP ----------
if [ "$#" -eq 0 ]; then
  log "No command provided to run. Exiting."
  stop_postgres
  exit 1
fi

CMD_ARGS=("$@")

log "Starting app: ${CMD_ARGS[*]}"
"${CMD_ARGS[@]}" &
APP_PID=$!

# If app exits, shut everything down
wait "$APP_PID"
APP_EXIT=$?

log "App exited with code $APP_EXIT"
stop_postgres

exit "$APP_EXIT"
