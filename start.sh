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
PIDFILE_FRONTEND="$PROJECT_DIR/.frontend.pid"
LOG_DIR="$PROJECT_DIR/logs"

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

# Create log directory
mkdir -p "$LOG_DIR"

# ── Pre-flight checks ────────────────────────────────────────────────

# Check if servers are already running
if [[ -f "$PIDFILE_BACKEND" ]] && kill -0 "$(cat "$PIDFILE_BACKEND")" 2>/dev/null; then
    echo -e "${YELLOW}⚠  Backend is already running (PID $(cat "$PIDFILE_BACKEND"))${NC}"
    BACKEND_RUNNING=true
else
    BACKEND_RUNNING=false
    rm -f "$PIDFILE_BACKEND"
fi

if [[ -f "$PIDFILE_FRONTEND" ]] && kill -0 "$(cat "$PIDFILE_FRONTEND")" 2>/dev/null; then
    echo -e "${YELLOW}⚠  Frontend is already running (PID $(cat "$PIDFILE_FRONTEND"))${NC}"
    FRONTEND_RUNNING=true
else
    FRONTEND_RUNNING=false
    rm -f "$PIDFILE_FRONTEND"
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

# Check Node modules
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo -e "${YELLOW}⚠  node_modules not found. Installing dependencies...${NC}"
    cd "$FRONTEND_DIR" && npm install
fi

# ── Start Backend ─────────────────────────────────────────────────────

if [[ "$BACKEND_RUNNING" = false ]]; then
    echo -e "${CYAN}▶  Starting backend (FastAPI on port 8000)...${NC}"
    cd "$BACKEND_DIR"
    source venv/bin/activate
    setsid nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload \
        > "$LOG_DIR/backend.log" 2>&1 &
    BACKEND_PID=$!
    echo "$BACKEND_PID" > "$PIDFILE_BACKEND"
    
    # Wait a moment and verify it started
    sleep 2
    if kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo -e "${GREEN}✔  Backend started (PID $BACKEND_PID)${NC}"
        echo -e "   API docs: ${CYAN}http://localhost:8000/api/docs${NC}"
        echo -e "   Log file: ${CYAN}$LOG_DIR/backend.log${NC}"
    else
        echo -e "${RED}✘  Backend failed to start. Check $LOG_DIR/backend.log${NC}"
        exit 1
    fi
fi

# ── Start Frontend ────────────────────────────────────────────────────

if [[ "$FRONTEND_RUNNING" = false ]]; then
    echo -e "${CYAN}▶  Starting frontend (Vite on port 5173)...${NC}"
    cd "$FRONTEND_DIR"
    setsid nohup npx vite --host 0.0.0.0 --port 5173 \
        > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo "$FRONTEND_PID" > "$PIDFILE_FRONTEND"
    
    # Wait a moment and verify it started
    sleep 3
    if kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo -e "${GREEN}✔  Frontend started (PID $FRONTEND_PID)${NC}"
        echo -e "   App URL:  ${CYAN}http://localhost:5173${NC}"
        echo -e "   Log file: ${CYAN}$LOG_DIR/frontend.log${NC}"
    else
        echo -e "${RED}✘  Frontend failed to start. Check $LOG_DIR/frontend.log${NC}"
        exit 1
    fi
fi

# ── Summary ───────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       🛡️  VajraKavach is running!            ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Frontend:  http://localhost:5173            ║${NC}"
echo -e "${GREEN}║  Backend:   http://localhost:8000            ║${NC}"
echo -e "${GREEN}║  API Docs:  http://localhost:8000/api/docs   ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Stop with: ./stop.sh                       ║${NC}"
echo -e "${GREEN}║  Logs in:   ./logs/                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
