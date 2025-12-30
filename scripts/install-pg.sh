#!/bin/bash

# if PGDATA is not set, exit
if [ -z "$PGDATA" ]; then
  echo "PGDATA is not set"
  exit 1
fi

if [ "$EMBEDDED_POSTGRES" = "true" ]; then
  apt-get update \
    && apt-get install -y --no-install-recommends postgresql \
    && rm -rf /var/lib/postgresql /var/lib/apt/lists/*

  mkdir -p "$PGDATA" \
    && chown -R postgres:postgres "$PGDATA"
fi
