#!/usr/bin/env bash
# Starts a project-local PostgreSQL cluster on port 5434 (trust auth, dev only) using an installed PostgreSQL.
# Usage: scripts/dev-db.sh [start|stop|status]   — set PG_BIN if PostgreSQL binaries are elsewhere.
set -euo pipefail
PG_BIN="${PG_BIN:-/c/Program Files/PostgreSQL/18/bin}"
DATA="$(cd "$(dirname "$0")/.." && pwd)/.pgdata"
case "${1:-start}" in
  start)
    [ -d "$DATA" ] || "$PG_BIN/initdb" -D "$DATA" -U sathi -A trust -E UTF8 >/dev/null
    "$PG_BIN/pg_ctl" -D "$DATA" -o "-p 5434" -l "$DATA/log.txt" status >/dev/null 2>&1 || "$PG_BIN/pg_ctl" -D "$DATA" -o "-p 5434" -l "$DATA/log.txt" start >/dev/null
    for db in sathi sathi_it; do "$PG_BIN/createdb" -h localhost -p 5434 -U sathi "$db" 2>/dev/null || true; done
    echo "Postgres ready: postgresql://sathi@localhost:5434/sathi (tests use sathi_it)";;
  stop) "$PG_BIN/pg_ctl" -D "$DATA" stop;;
  status) "$PG_BIN/pg_ctl" -D "$DATA" status;;
esac
