#!/usr/bin/env bash
# Valida migrações + políticas RLS num Postgres local (sem Docker/Supabase).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=contentflow_test
psql -q -c "drop database if exists $DB" -c "create database $DB"
for f in supabase/tests/00_supabase_stub.sql supabase/migrations/*.sql supabase/tests/01_rls_test.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" > /dev/null
done
psql -q -c "drop database $DB"
echo "Todos os testes de banco passaram."
