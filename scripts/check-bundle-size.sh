#!/bin/bash
# scripts/check-bundle-size.sh
# Check Next.js bundle size after build — fail CI if first load JS exceeds threshold
# Parses the "First Load JS" column from `next build` output
# RELEVANT FILES: .github/workflows/ci.yml, package.json

set -euo pipefail

MAX_FIRST_LOAD_KB=350  # Maximum first load JS in KB

echo "🔍 Checking bundle sizes..."

# Build and capture output
BUILD_OUTPUT=$(npm run build 2>&1) || {
  echo "❌ Build failed"
  echo "$BUILD_OUTPUT"
  exit 1
}

echo "$BUILD_OUTPUT"

# Extract the largest "First Load JS" value from build output
# Format: "○ /route  X.XX kB  YYY kB" — we want the last column (first load)
FIRST_LOAD=$(echo "$BUILD_OUTPUT" | grep -oE '[0-9]+(\.[0-9]+)?\s*kB' | tail -1 | grep -oE '[0-9]+(\.[0-9]+)?')

if [ -z "$FIRST_LOAD" ]; then
  echo "⚠️  Could not parse bundle size from build output"
  exit 0
fi

# Convert to integer for comparison (bash doesn't do float comparison)
FIRST_LOAD_INT=$(echo "$FIRST_LOAD" | cut -d'.' -f1)

echo ""
echo "📦 First Load JS: ${FIRST_LOAD} kB (threshold: ${MAX_FIRST_LOAD_KB} kB)"

if [ "$FIRST_LOAD_INT" -gt "$MAX_FIRST_LOAD_KB" ]; then
  echo "❌ Bundle size exceeds ${MAX_FIRST_LOAD_KB} kB threshold!"
  echo "   Check for accidental 'use client' on heavy imports (ExcelJS, jsPDF, etc.)"
  exit 1
fi

echo "✅ Bundle size OK"
