"""
VajraKavach — Main Application Entry Point
FastAPI application with all routes, middleware, and startup events.
"""

import os
import logging
import asyncio
import socket
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html

from app.config import settings
from app.database import init_db
from app.middleware.security import SecurityHeadersMiddleware, RequestIDMiddleware, RateLimitMiddleware
from app.middleware.audit import AuditMiddleware

# Routes
from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.routes.companies import router as companies_router
from app.routes.jobs import router as jobs_router
from app.routes.applications import router as applications_router
from app.routes.messages import router as messages_router
from app.routes.resumes import router as resumes_router
from app.routes.admin import router as admin_router
from app.routes.reports import router as reports_router
from app.routes.websocket import router as ws_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vajrakavach")


def _sd_notify(state: str):
    """Send a notification to systemd via the NOTIFY_SOCKET (sd_notify protocol)."""
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return
    if addr[0] == "@":
        addr = "\0" + addr[1:]
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        sock.connect(addr)
        sock.sendall(state.encode())
        sock.close()
    except Exception:
        pass


async def _watchdog_loop():
    """Periodically send watchdog keepalive to systemd.
    If this loop stops (process hangs), systemd kills and restarts the process."""
    interval = int(os.environ.get("WATCHDOG_USEC", "0")) / 1_000_000 / 2
    if interval <= 0:
        return  # Watchdog not configured
    logger.info(f"Watchdog keepalive active (every {interval:.0f}s)")
    while True:
        _sd_notify("WATCHDOG=1")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup & shutdown events."""
    logger.info("🚀 VajraKavach starting up...")

    # Create upload directory
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Create certs directory
    os.makedirs("certs", exist_ok=True)

    # Generate self-signed TLS cert if not present
    cert_path = settings.PKI_CERTIFICATE_PATH
    key_path = settings.PKI_PRIVATE_KEY_PATH
    if not os.path.exists(cert_path) or not os.path.exists(key_path):
        logger.info("Generating self-signed TLS certificates...")
        from app.services.pki_service import generate_self_signed_cert
        generate_self_signed_cert(
            common_name="vajrakavach.local",
            cert_path=cert_path,
            key_path=key_path,
        )
        logger.info("TLS certificates generated.")

    # Generate Fernet key if placeholder
    if not settings.FERNET_SECRET_KEY or settings.FERNET_SECRET_KEY.startswith("placeholder"):
        from cryptography.fernet import Fernet
        new_key = Fernet.generate_key().decode()
        logger.warning("No Fernet key configured — generated a new one. Set FERNET_SECRET_KEY in .env to persist it.")
        # Update the in-memory setting
        settings.FERNET_SECRET_KEY = new_key

    # Initialize database (create tables)
    await init_db()
    logger.info("Database tables created/verified.")

    # Load persistent security state from DB (survives restarts)
    from app.database import async_session
    from app.services.auth_service import load_revoked_cache, cleanup_expired_tokens
    from app.services.totp_service import load_totp_lockout_from_db
    async with async_session() as db:
        try:
            await load_revoked_cache(db)
            await load_totp_lockout_from_db(db)
            await cleanup_expired_tokens(db)
            await db.commit()
            logger.info("Persistent security state loaded from database.")
        except Exception as e:
            logger.warning(f"Could not load security state from DB (tables may not exist yet): {e}")
            await db.rollback()

    # Notify systemd that startup is complete
    _sd_notify("READY=1")

    # Start watchdog keepalive task
    watchdog_task = asyncio.create_task(_watchdog_loop())

    yield

    # Cancel watchdog
    watchdog_task.cancel()
    try:
        await watchdog_task
    except asyncio.CancelledError:
        pass

    # Notify systemd we're stopping
    _sd_notify("STOPPING=1")

    # Persist security state on shutdown
    from app.services.auth_service import flush_pending_revocations
    from app.services.totp_service import sync_totp_lockout_to_db
    async with async_session() as db:
        try:
            await flush_pending_revocations(db)
            await sync_totp_lockout_to_db(db)
            await db.commit()
            logger.info("Security state persisted to database.")
        except Exception:
            await db.rollback()

    logger.info("VajraKavach shutting down.")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description="Secure Job Search & Professional Networking Platform",
    lifespan=lifespan,
    docs_url=None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

# Mount static files for local Swagger UI assets
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")

if settings.DEBUG:
    @app.get("/api/docs", include_in_schema=False)
    async def custom_swagger_ui():
        return get_swagger_ui_html(
            openapi_url="/openapi.json",
            title=f"{settings.APP_TITLE} - Swagger UI",
            swagger_js_url="/static/swagger-ui-bundle.js",
            swagger_css_url="/static/swagger-ui.css",
        )

# ── Middleware (order matters: last added = first executed) ───────────

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"^https://192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Security headers: handled by nginx reverse proxy (add_header ... always)
# SecurityHeadersMiddleware kept as class but not registered to avoid duplicate headers.
# Defense-in-depth: nginx binds to 443, backend binds to 127.0.0.1:8000 only.

# Request ID tracing (internal only — not exposed in response headers)
app.add_middleware(RequestIDMiddleware)

# Rate limiting (60 req/min per IP, 5 req/min on auth endpoints)
app.add_middleware(RateLimitMiddleware, requests_per_minute=60, auth_requests_per_minute=5)

# Audit logging
app.add_middleware(AuditMiddleware)

# ── Routers ──────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(companies_router)
app.include_router(jobs_router)
app.include_router(applications_router)
app.include_router(messages_router)
app.include_router(resumes_router)
app.include_router(admin_router)
app.include_router(reports_router)
app.include_router(ws_router)


# ── Root endpoint ────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "app": settings.APP_TITLE,
        "status": "running",
    }


@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
