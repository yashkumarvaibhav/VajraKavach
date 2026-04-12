"""
VajraKavach — Security Middleware
CSRF protection, security headers, rate limiting basics.
"""

import logging
from fastapi import Request, Response
from app.utils.ip import get_client_ip
from starlette.middleware.base import BaseHTTPMiddleware
import time
import uuid
import asyncio
from datetime import datetime
from app.config import settings
from app.database import async_session
from app.services.deception_service import get_enforcement_outcome

logger = logging.getLogger("vajrakavach.security")
DECEPTION_DELAY_SECONDS = max(0, min(5, int(settings.DECEPTION_DELAY_SECONDS)))


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Security headers are handled by nginx reverse proxy (server-level add_header).
    This middleware is kept as a defense-in-depth fallback for direct backend access."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        # Only add headers if nginx hasn't already (defense-in-depth)
        if "X-Content-Type-Options" not in response.headers:
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; "
                "frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
            )
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to every request for internal traceability.
    The ID is stored in request.state for logging but NOT exposed in response headers."""

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        # X-Request-ID intentionally NOT set in response to avoid information leakage
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP rate limiter with periodic cleanup and stricter limits for auth endpoints."""

    AUTH_PATHS = {"/api/auth/login", "/api/auth/verify-totp", "/api/auth/forgot-password",
                  "/api/auth/register", "/api/auth/setup-verify", "/api/auth/change-password",
                  "/api/auth/delete-account", "/api/auth/verify-password"}

    def __init__(self, app, requests_per_minute: int = 30, auth_requests_per_minute: int = 5):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.auth_requests_per_minute = auth_requests_per_minute
        self.request_counts: dict = {}
        self.auth_counts: dict = {}
        self._last_cleanup = time.time()

    def _cleanup(self, now: float):
        """Remove entries older than 60 seconds every 60 seconds."""
        if now - self._last_cleanup < 60:
            return
        window_start = now - 60
        for store in (self.request_counts, self.auth_counts):
            stale = [ip for ip, entries in store.items() if not entries or entries[-1][0] < window_start]
            for ip in stale:
                del store[ip]
        self._last_cleanup = now

    async def dispatch(self, request: Request, call_next):
        client_ip = get_client_ip(request)
        now = time.time()
        window_start = now - 60

        self._cleanup(now)

        # Global rate limit
        if client_ip in self.request_counts:
            self.request_counts[client_ip] = [
                (ts, c) for ts, c in self.request_counts[client_ip]
                if ts > window_start
            ]
        else:
            self.request_counts[client_ip] = []

        total = sum(c for _, c in self.request_counts[client_ip])

        if total >= self.requests_per_minute:
            from starlette.responses import JSONResponse
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please try again later."},
            )

        # Stricter limit for auth endpoints
        path = request.url.path.rstrip("/")
        if path in self.AUTH_PATHS:
            if client_ip in self.auth_counts:
                self.auth_counts[client_ip] = [
                    (ts, c) for ts, c in self.auth_counts[client_ip]
                    if ts > window_start
                ]
            else:
                self.auth_counts[client_ip] = []

            auth_total = sum(c for _, c in self.auth_counts[client_ip])
            if auth_total >= self.auth_requests_per_minute:
                from starlette.responses import JSONResponse
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many authentication attempts. Please try again later."},
                )
            self.auth_counts[client_ip].append((now, 1))

        self.request_counts[client_ip].append((now, 1))
        return await call_next(request)


class DeceptionEnforcementMiddleware(BaseHTTPMiddleware):
    """Adaptive enforcement for actors flagged by deception/honeypot detections."""

    EXEMPT_PATHS = {"/health", "/api/health"}

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path in self.EXEMPT_PATHS:
            return await call_next(request)

        # Apply only on API/decoy paths; avoid overhead on static frontend assets.
        if not (path.startswith("/api") or path.startswith("/dev/")):
            return await call_next(request)

        try:
            async with async_session() as db:
                outcome = await get_enforcement_outcome(db, request)

                if outcome.should_delay and DECEPTION_DELAY_SECONDS > 0:
                    request.state.deception_delay_applied = True
                    await asyncio.sleep(DECEPTION_DELAY_SECONDS)

                if outcome.blocked:
                    from starlette.responses import JSONResponse
                    retry_after = 60
                    if outcome.timeout_until:
                        retry_after = max(1, int((outcome.timeout_until - datetime.utcnow()).total_seconds()))
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "Forbidden"},
                        headers={
                            "Retry-After": str(retry_after),
                            "Cache-Control": "no-store",
                        },
                    )

                await db.commit()
        except Exception as exc:
            # Fail-open on enforcement failures so availability is unaffected.
            logger.warning("Deception enforcement failed; allowing request: %s", exc)

        return await call_next(request)
