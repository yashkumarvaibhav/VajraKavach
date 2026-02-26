"""
VajraKavach — Main Application Entry Point
FastAPI application with all routes, middleware, and startup events.
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vajrakavach")


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
        logger.info(f"TLS cert: {cert_path}, key: {key_path}")

    # Generate Fernet key if placeholder
    if settings.FERNET_SECRET_KEY.startswith("placeholder"):
        from cryptography.fernet import Fernet
        new_key = Fernet.generate_key().decode()
        logger.warning(f"Generated new Fernet key (persist this!): {new_key}")
        # Update the in-memory setting
        settings.FERNET_SECRET_KEY = new_key

    # Initialize database (create tables)
    await init_db()
    logger.info("Database tables created/verified.")

    yield

    logger.info("VajraKavach shutting down.")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description="Secure Job Search & Professional Networking Platform",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ── Middleware (order matters: last added = first executed) ───────────

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers
app.add_middleware(SecurityHeadersMiddleware)

# Request ID tracing
app.add_middleware(RequestIDMiddleware)

# Rate limiting (60 req/min per IP)
app.add_middleware(RateLimitMiddleware, requests_per_minute=60)

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


# ── Root endpoint ────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "app": settings.APP_TITLE,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/api/docs",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
