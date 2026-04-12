#!/usr/bin/env bash
# ============================================================================
#  VajraKavach — Start Script
#  Starts the backend (FastAPI) and frontend (Vite) development servers.
#  Usage: ./start.sh
# ============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PIDFILE_BACKEND="$PROJECT_DIR/.backend.pid"
LOG_DIR="$PROJECT_DIR/logs"
BACKEND_HEALTH_URL="http://127.0.0.1:8000/health"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         🛡️  VajraKavach — Starting          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

healthcheck_ok() {
    local URL=$1
    if command -v curl >/dev/null 2>&1; then
        curl -skf "$URL" >/dev/null 2>&1
    else
        return 1
    fi
}

wait_for_healthcheck() {
    local URL=$1
    local ATTEMPTS=${2:-20}
    for _ in $(seq 1 "$ATTEMPTS"); do
        if healthcheck_ok "$URL"; then
            return 0
        fi
        sleep 1
    done
    return 1
}

# Create log directory
mkdir -p "$LOG_DIR"

# ── Pre-flight checks ────────────────────────────────────────────────

# Check if servers are already running
if [[ -f "$PIDFILE_BACKEND" ]] && kill -0 "$(cat "$PIDFILE_BACKEND")" 2>/dev/null; then
    echo -e "${YELLOW}⚠  Backend is already running (PID $(cat "$PIDFILE_BACKEND"))${NC}"
    BACKEND_RUNNING=true
elif healthcheck_ok "$BACKEND_HEALTH_URL"; then
    echo -e "${YELLOW}⚠  Backend is already running on port 8000 (no PID file found)${NC}"
    BACKEND_RUNNING=true
else
    BACKEND_RUNNING=false
    rm -f "$PIDFILE_BACKEND"
fi

# Check PostgreSQL
if command -v pg_isready &>/dev/null; then
    if pg_isready -q 2>/dev/null; then
        echo -e "${GREEN}✔  PostgreSQL is running${NC}"
    else
        echo -e "${RED}✘  PostgreSQL is not running. Please start it first:${NC}"
        echo -e "   sudo systemctl start postgresql"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠  pg_isready not found, skipping PostgreSQL check${NC}"
fi

# Check Python venv
if [[ ! -d "$BACKEND_DIR/venv" ]]; then
    echo -e "${RED}✘  Python venv not found at $BACKEND_DIR/venv${NC}"
    echo -e "   Run: cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Build frontend if dist doesn't exist
if [[ ! -d "$FRONTEND_DIR/dist" ]]; then
    echo -e "${YELLOW}⚠  Frontend build not found. Building...${NC}"
    if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
        cd "$FRONTEND_DIR" && npm install
    fi
    cd "$FRONTEND_DIR" && npm run build
fi

# ── Start Backend (systemd-managed with auto-restart) ────────────────

if [[ "$BACKEND_RUNNING" = false ]]; then
    echo -e "${CYAN}▶  Starting backend via systemd (auto-restarts on crash)...${NC}"
    sudo systemctl start vajrakavach-backend

    if wait_for_healthcheck "$BACKEND_HEALTH_URL" 20; then
        echo -e "${GREEN}✔  Backend started (systemd: vajrakavach-backend.service)${NC}"
        echo -e "   Logs: ${CYAN}journalctl -u vajrakavach-backend -f${NC}"
    else
        echo -e "${RED}✘  Backend failed to start. Check: journalctl -u vajrakavach-backend${NC}"
        exit 1
    fi
fi

# ── Frontend (served as static files by nginx) ──────────────────────

if [[ -d "$FRONTEND_DIR/dist" ]]; then
    echo -e "${GREEN}✔  Frontend built (static files in frontend/dist/)${NC}"
    echo -e "   Served by nginx at ${CYAN}https://192.168.3.44${NC}"
else
    echo -e "${RED}✘  Frontend dist/ not found. Run: cd frontend && npm run build${NC}"
fi

# ── Summary ───────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       🛡️  VajraKavach is running!            ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  App URL:   https://192.168.3.44             ║${NC}"
echo -e "${GREEN}║  Backend:   http://127.0.0.1:8000            ║${NC}"
echo -e "${GREEN}║  Frontend:  Static (nginx serves dist/)      ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Stop with: ./stop.sh                       ║${NC}"
echo -e "${GREEN}║  Logs in:   ./logs/                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
