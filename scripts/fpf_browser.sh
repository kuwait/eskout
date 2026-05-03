#!/bin/bash
# scripts/fpf_browser.sh
# Relaunch the user's REAL Brave with --remote-debugging-port=9222 so Playwright
# can attach via CDP. Uses the user's actual profile dir → all cookies, history,
# logged-in sessions, and Cloudflare cf_clearance from manual browsing remain intact.
# Cloudflare doesn't block this because the browser is launched + driven the same way
# the user normally does — Playwright never spawns its own process.
# RELEVANT FILES: src/actions/scraping/fpf-playwright.ts

set -e

PORT=9222
BRAVE_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
# User's REAL profile dir — same place Brave normally reads/writes
USER_PROFILE_DIR="$HOME/Library/Application Support/BraveSoftware/Brave-Browser"

if [ ! -x "$BRAVE_BIN" ]; then
  echo "❌ Brave não encontrado em: $BRAVE_BIN"
  exit 1
fi

# Already running with debug port?
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✅ Brave debug já a correr na porta $PORT — pronto para scraping."
  exit 0
fi

# Check if Brave is currently running on that profile (debug port disabled)
if pgrep -f "Brave Browser" >/dev/null 2>&1; then
  echo "⚠️  Brave já está a correr SEM debug port."
  echo ""
  echo "   Para o scraping FPF funcionar, é preciso relançar o Brave com debug port."
  echo "   Vais perder as tabs abertas (Brave restaura-as ao reabrir)."
  echo ""
  read -p "   Fechar Brave e relançar com debug port? [y/N] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "   Cancelado."
    exit 1
  fi
  echo "🛑 A fechar Brave…"
  pkill -f "Brave Browser" || true
  sleep 2
fi

echo "🚀 A lançar Brave com debug port $PORT…"
echo "   Profile real: $USER_PROFILE_DIR"
echo "   Mantém esta janela aberta enquanto usas o scraping."
echo ""

exec "$BRAVE_BIN" \
  --remote-debugging-port=$PORT \
  --user-data-dir="$USER_PROFILE_DIR" \
  --restore-last-session
