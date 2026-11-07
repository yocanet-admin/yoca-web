#!/usr/bin/env bash
# Starts the test gateway (:54331) and the built app (:3190) for the integration tests.
#   FAKE_NOW="2026-11-07 09:00:00"  → the app runs on a fixed clock (libfaketime; UTC).
#   APP_DIR=<path>                  → another checkout/worktree to run (default: this repo).
# The database comes from setup-db.sh (ITEST_DIR / ITEST_PORT / ITEST_DB).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
APP_DIR=${APP_DIR:-$ROOT}
[ -f "$HERE/.env.itest" ] || node "$HERE/make-env.mjs" >/dev/null
pkill -f "tests/integration/gateway/server.js" 2>/dev/null || true
pkill -f "next start -p 3190" 2>/dev/null || true; pkill -f "next-server" 2>/dev/null || true; sleep 1
(cd "$HERE" && nohup node gateway/server.js > "${ITEST_STATE:-/var/tmp/yoca-itest-gw}.log" 2>&1 &)
FAKETIME_LIB=${FAKETIME_LIB:-$(ls /usr/lib/*/faketime/libfaketimeMT.so.1 /usr/local/lib/faketime/libfaketimeMT.so.1 /opt/homebrew/lib/faketime/libfaketimeMT.1.dylib 2>/dev/null | head -1 || true)}
(
  cd "$APP_DIR"; set -a; . "$HERE/.env.itest"; set +a
  if [ -n "${FAKE_NOW:-}" ]; then
    [ -n "$FAKETIME_LIB" ] || { echo "FAKE_NOW needs libfaketime (apt install faketime / brew install libfaketime)"; exit 1; }
    if [ "$(uname)" = "Darwin" ]; then export DYLD_INSERT_LIBRARIES="$FAKETIME_LIB" DYLD_FORCE_FLAT_NAMESPACE=1; else export LD_PRELOAD="$FAKETIME_LIB"; fi
    export FAKETIME="@$FAKE_NOW" TZ=UTC
  fi
  nohup npx next start -p 3190 > "${ITEST_STATE:-/var/tmp/yoca-itest-gw}.app.log" 2>&1 &
)
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:3190/ && break; sleep 0.5; done
echo "gateway :54331 · app :3190 ${FAKE_NOW:+(sabit saat $FAKE_NOW UTC)}"
