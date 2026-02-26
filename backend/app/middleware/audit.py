"""
VajraKavach — Audit Middleware
Logs all incoming requests for audit trail.
"""

from fastapi import Request
from app.utils.ip import get_client_ip
from starlette.middleware.base import BaseHTTPMiddleware
import time
import logging

logger = logging.getLogger("vajrakavach.audit")


class AuditMiddleware(BaseHTTPMiddleware):
    """Log all API requests with timing info."""

    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration = time.time() - start

        logger.info(
            f"{request.method} {request.url.path} "
            f"status={response.status_code} "
            f"duration={duration:.3f}s "
            f"ip={get_client_ip(request)}"
        )

        return response
