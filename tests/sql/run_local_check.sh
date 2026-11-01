#!/usr/bin/env bash
# 로컬 Postgres(16)로 마이그레이션·RLS·원가 격리를 검증한다. Docker/Supabase CLI 없이 동작.
# 사용: pnpm db:check   (환경: PG_BIN=/usr/lib/postgresql/16/bin 기본)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
DATA="${PGDATA_DIR:-/tmp/osle-pg}"
PORT="${PGPORT_LOCAL:-54329}"
DB=osle_check

cleanup() { "$PG_BIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$DATA"; mkdir -p "$DATA"
"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1" -l "$DATA/log" start >/dev/null
export PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=postgres
createdb $DB

psql -q -v ON_ERROR_STOP=1 -d $DB -f "$ROOT/tests/sql/00_local_auth_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "apply $(basename "$f")"; psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d $DB -f "$ROOT/supabase/seed.sql"
echo "--- checks"
if psql -q -v ON_ERROR_STOP=1 -d $DB -f "$ROOT/tests/sql/10_checks.sql" > "$DATA/out" 2>&1; then
  grep -E "PASS" "$DATA/out" | sed 's/^psql:.*NOTICE:  //;s/^NOTICE:  //'
  echo "ALL CHECKS PASSED"
else
  grep -E "PASS|FAIL|ERROR" "$DATA/out" | sed 's/^psql:.*NOTICE:  //;s/^NOTICE:  //'
  echo "CHECKS FAILED"; exit 1
fi
