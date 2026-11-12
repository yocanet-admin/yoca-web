#!/usr/bin/env bash
# Yoca — LOCAL integration tests only: a fresh PostgreSQL cluster with every repo
# migration applied in order, plus synthetic test users. Never use against Supabase.
#   ITEST_DIR   cluster directory (default /var/tmp/yoca-itest)   — deleted and recreated
#   ITEST_PORT  port (default 54339), socket in $ITEST_DIR
#   ITEST_DB    database name (default itest)
#   PG_BIN      PostgreSQL 16 binaries (default /usr/lib/postgresql/16/bin)
set -euo pipefail
cd "$(dirname "$0")/../.."
ITEST_DIR=${ITEST_DIR:-/var/tmp/yoca-itest}; ITEST_PORT=${ITEST_PORT:-54339}; ITEST_DB=${ITEST_DB:-itest}
PG_BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
AS=""; if [ "$(id -u)" = "0" ]; then AS=1; fi
run() { if [ -n "$AS" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

if [ -f "$ITEST_DIR/data/postmaster.pid" ]; then run "$PG_BIN/pg_ctl -D $ITEST_DIR/data stop -m fast" >/dev/null || true; fi
rm -rf "$ITEST_DIR"; mkdir -p "$ITEST_DIR"; [ -n "$AS" ] && chown postgres "$ITEST_DIR"
run "$PG_BIN/initdb -D $ITEST_DIR/data -U postgres -A trust" >/dev/null
run "$PG_BIN/pg_ctl -D $ITEST_DIR/data -o \"-k $ITEST_DIR -p $ITEST_PORT -c listen_addresses=''\" -l $ITEST_DIR/pg.log start" >/dev/null
for i in $(seq 1 20); do pg_isready -q -h "$ITEST_DIR" -p "$ITEST_PORT" && break; sleep 0.5; done
psql -h "$ITEST_DIR" -p "$ITEST_PORT" -U postgres -qc "create database $ITEST_DB"
P="psql -h $ITEST_DIR -p $ITEST_PORT -U postgres -d $ITEST_DB -v ON_ERROR_STOP=1 -q"

$P -f tests/integration/db/stubs.sql
# fresh database → fresh test Auth users (only the built-in test accounts)
rm -f "${ITEST_STATE:-/var/tmp/yoca-itest-gw}/auth-users.json"
for f in supabase/schema.sql $(ls supabase/upgrade-v*.sql | sort -V); do
  # v12 refuses an empty admin list; v25 adds the role column
  case "$f" in *upgrade-v12-*) $P -c "insert into public.admin_users (email, note) values ('admin@test.local', 'TEST yönetici') on conflict do nothing" ;; esac
  if ! out=$($P -f "$f" 2>&1); then echo "$out" | grep -v NOTICE; echo "FAIL $f"; exit 1; fi
  case "$f" in *upgrade-v25-*) $P -c "insert into public.admin_users (email, note, role) values ('finance@test.local', 'TEST finans sorumlusu', 'finance') on conflict do nothing" ;; esac
  # v30 adds the editor role (a ready test editor; invited users are created by the users suite)
  case "$f" in *upgrade-v30-*) $P -c "insert into public.admin_users (email, note, role, name) values ('editor@test.local', 'TEST içerik editörü', 'editor', 'TEST Editör') on conflict do nothing" ;; esac
  echo "ok $f"
done
echo "ready: host=$ITEST_DIR port=$ITEST_PORT db=$ITEST_DB"
