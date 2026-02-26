#!/usr/bin/env bash
# ============================================================================
#  VajraKavach — Stop Script
#  Stops the backend (FastAPI) and frontend (Vite) development servers.
#  Usage: ./stop.sh
# ============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE_BACKEND="$PROJECT_DIR/.backend.pid"
PIDFILE_FRONTEND="$PROJECT_DIR/.frontend.pid"

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

stop_pid_tree() {
    local PID=$1
    # Kill all children first, then the parent — avoids process-group kill
    local CHILDREN
    CHILDREN=$(pgrep -P "$PID" 2>/dev/null || true)
    for CHILD in $CHILDREN; do
        stop_pid_tree "$CHILD"
    done
    kill "$PID" 2>/dev/null || true
}

if [[ -f "$PIDFILE_BACKEND" ]]; then
    BACKEND_PID=$(cat "$PIDFILE_BACKEND")
    if kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo -e "${YELLOW}■  Stopping backend (PID $BACKEND_PID)...${NC}"
        # Kill pid tree (parent + children) — SSH-safe, no process-group kill
        stop_pid_tree "$BACKEND_PID"
        # Wait for it to terminate
        for i in $(seq 1 10); do
            if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
                break
            fi
            sleep 0.5
        done
        # Force kill if still alive
        if kill -0 "$BACKEND_PID" 2>/dev/null; then
            echo -e "${RED}   Force killing backend...${NC}"
            kill -9 "$BACKEND_PID" 2>/dev/null || true
        fi
        echo -e "${GREEN}✔  Backend stopped${NC}"
        STOPPED_SOMETHING=true
    else
        echo -e "${YELLOW}⚠  Backend PID $BACKEND_PID is no longer running${NC}"
    fi
    rm -f "$PIDFILE_BACKEND"
else
    echo -e "${YELLOW}⚠  No backend PID file found${NC}"
fi

# ── Stop Frontend ─────────────────────────────────────────────────────

if [[ -f "$PIDFILE_FRONTEND" ]]; then
    FRONTEND_PID=$(cat "$PIDFILE_FRONTEND")
    if kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo -e "${YELLOW}■  Stopping frontend (PID $FRONTEND_PID)...${NC}"
        stop_pid_tree "$FRONTEND_PID"
        for i in $(seq 1 10); do
            if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
                break
            fi
            sleep 0.5
        done
        if kill -0 "$FRONTEND_PID" 2>/dev/null; then
            echo -e "${RED}   Force killing frontend...${NC}"
            kill -9 "$FRONTEND_PID" 2>/dev/null || true
        fi
        echo -e "${GREEN}✔  Frontend stopped${NC}"
        STOPPED_SOMETHING=true
    else
        echo -e "${YELLOW}⚠  Frontend PID $FRONTEND_PID is no longer running${NC}"
    fi
    rm -f "$PIDFILE_FRONTEND"
else
    echo -e "${YELLOW}⚠  No frontend PID file found${NC}"
fi

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
cleanup_port 5173 "frontend"

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
