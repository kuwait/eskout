#!/bin/bash
# scripts/test-migrations.sh
# Migration smoke test — verify all SQL migrations run cleanly on a fresh database
# Requires: psql, TEST_DATABASE_URL env var pointing to a disposable test DB
# RELEVANT FILES: supabase/migrations/, docs/test-strategy.md

set -euo pipefail

DB_URL="${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a disposable test database}"
MIGRATIONS_DIR="supabase/migrations"

echo "🔍 Testing ${MIGRATIONS_DIR}/ against ${DB_URL%%@*}@***"

# Count migration files
MIGRATION_COUNT=$(ls -1 "${MIGRATIONS_DIR}"/*.sql 2>/dev/null | wc -l | tr -d ' ')
echo "📦 Found ${MIGRATION_COUNT} migration files"

if [ "$MIGRATION_COUNT" -eq 0 ]; then
  echo "⚠️  No migration files found in ${MIGRATIONS_DIR}/"
  exit 1
fi

# Run each migration in order
PASSED=0
FAILED=0

for file in "${MIGRATIONS_DIR}"/*.sql; do
  name=$(basename "$file")
  if psql "$DB_URL" -f "$file" -v ON_ERROR_STOP=1 > /dev/null 2>&1; then
    echo "  ✅ ${name}"
    PASSED=$((PASSED + 1))
  else
    echo "  ❌ ${name}"
    # Show the error
    psql "$DB_URL" -f "$file" -v ON_ERROR_STOP=1 2>&1 | tail -5
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Results: ${PASSED} passed, ${FAILED} failed out of ${MIGRATION_COUNT}"

if [ "$FAILED" -gt 0 ]; then
  echo "❌ Migration smoke test FAILED"
  exit 1
fi

echo "✅ All migrations applied successfully"
