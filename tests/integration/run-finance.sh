#!/usr/bin/env bash
# Finans integration suite. Date-bound suites run with the app on a FIXED clock
# (2026-11-07 09:00 UTC = 12:00 Istanbul) so the 7-day digest window and month
# views never depend on the day the tests run; the cron suite runs on the real
# clock (it computes its own dates). Requires: setup-db.sh, a built app
# (npm run build), npm --prefix tests/integration install, npx playwright install chromium.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
OUT=${ITEST_OUT:-/tmp/yoca-itest-out}; mkdir -p "$OUT"; export ITEST_OUT="$OUT"
export NODE_PATH="$HERE/node_modules:$ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"
TSX="$HERE/node_modules/.bin/tsx"; [ -x "$TSX" ] || TSX="npx tsx"
FAIL=0
run() { local name=$1; shift; local line; line=$("$@" 2>&1 | tee "$OUT/$name.log" | grep -E "^[0-9]+/[0-9]+ passed" | tail -1); echo "$name: ${line:-HATA (bkz. $OUT/$name.log)}"; case "$line" in *passed*) set -- $line; [ "${1%/*}" = "${1#*/}" ] || FAIL=1 ;; *) FAIL=1 ;; esac; }
cd "$ROOT"; set -a; . "$HERE/.env.itest"; set +a
FAKE_NOW="2026-11-07 09:00:00" bash "$HERE/start.sh"
run month-ui node "$HERE/finance/month-ui.cjs" "$OUT"
run expenses-e2e $TSX "$HERE/finance/expenses-e2e.mts" "$OUT"
run expenses-ui node "$HERE/finance/expenses-ui.cjs" "$OUT" "$(node -e "console.log(require('$OUT/fin-e2e.json').opsPeriod)")"
run v25-verify env MODE=new $TSX "$HERE/finance/v25-verify.mts" "$OUT"
run income-e2e $TSX "$HERE/finance/income-e2e.mts"
run income-ui node "$HERE/finance/income-ui.cjs" "$OUT"
bash "$HERE/start.sh"
run cron $TSX "$HERE/finance/cron-roll.mts"
exit $FAIL
