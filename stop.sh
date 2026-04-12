#!/usr/bin/env bash
# ============================================================================
#  VajraKavach — Stop Script
#  Stops the backend (FastAPI) and frontend (Vite) development servers.
#  Usage: ./stop.sh
# ============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE_BACKEND="$PROJECT_DIR/.backend.pid"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         🛡️  VajraKavach — Stopping           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

STOPPED_SOMETHING=false

# ── Stop Backend ──────────────────────────────────────────────────────

echo -e "${YELLOW}■  Stopping backend (systemd service)...${NC}"
if sudo systemctl is-active --quiet vajrakavach-backend; then
    sudo systemctl stop vajrakavach-backend
    echo -e "${GREEN}✔  Backend stopped${NC}"
    STOPPED_SOMETHING=true
else
    echo -e "${YELLOW}⚠  Backend service was not running${NC}"
fi
rm -f "$PIDFILE_BACKEND"

# Frontend is static — no process to stop
echo -e "${GREEN}✔  Frontend is static (served by nginx) — no process to stop${NC}"

# ── Cleanup orphaned processes on known ports ─────────────────────────

cleanup_port() {
    local PORT=$1
    local NAME=$2
    local PIDS
    PIDS=$(lsof -ti :"$PORT" 2>/dev/null || true)
    if [[ -n "$PIDS" ]]; then
        echo -e "${YELLOW}■  Cleaning up orphaned $NAME processes on port $PORT...${NC}"
        for P in $PIDS; do
            kill "$P" 2>/dev/null || kill -9 "$P" 2>/dev/null || true
        done
        echo -e "${GREEN}✔  Port $PORT cleared${NC}"
        STOPPED_SOMETHING=true
    fi
}

cleanup_port 8000 "backend"

# ── Summary ───────────────────────────────────────────────────────────

echo ""
if [[ "$STOPPED_SOMETHING" = true ]]; then
    echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     🛡️  VajraKavach servers stopped.         ║${NC}"
    echo -e "${GREEN}║     Start again with: ./start.sh            ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
else
    echo -e "${YELLOW}Nothing to stop — servers were not running.${NC}"
fi
