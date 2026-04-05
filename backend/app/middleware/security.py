"""
VajraKavach — Security Middleware
CSRF protection, security headers, rate limiting basics.
"""

from fastapi import Request, Response
from app.utils.ip import get_client_ip
from starlette.middleware.base import BaseHTTPMiddleware
import time
import uuid


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        # Prevent XSS
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Content Security Policy
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "font-src 'self'; "
            "connect-src 'self'"
        )

        # Strict Transport Security (for HTTPS)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions Policy
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

        return response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to every request for traceability."""

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP rate limiter with periodic cleanup and stricter limits for auth endpoints."""

    AUTH_PATHS = {"/api/auth/login", "/api/auth/verify-totp", "/api/auth/forgot-password",
                  "/api/auth/register", "/api/auth/setup-verify"}

    def __init__(self, app, requests_per_minute: int = 60, auth_requests_per_minute: int = 15):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.auth_requests_per_minute = auth_requests_per_minute
        self.request_counts: dict = {}
        self.auth_counts: dict = {}
        self._last_cleanup = time.time()

    def _cleanup(self, now: float):
        """Remove entries older than 60 seconds every 5 minutes."""
        if now - self._last_cleanup < 300:
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
