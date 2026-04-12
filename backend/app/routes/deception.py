"""
VajraKavach - Deception Routes (Honeypots)
Hidden decoy endpoints for detecting unauthorized probing behavior.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.deception_service import DeceptionOutcome, register_honeypot_event

router = APIRouter(tags=["Deception"])
DELAY_SECONDS = max(0, min(5, int(settings.DECEPTION_DELAY_SECONDS)))
NO_STORE_HEADERS = {"Cache-Control": "no-store"}


def _fake_restricted_page() -> str:
    return """
<!doctype html>
<html>
  <head>
    <title>Restricted Developer Console</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="font-family:Arial, sans-serif;background:#0f172a;color:#e2e8f0;padding:24px;">
    <div style="max-width:560px;margin:40px auto;background:#111827;padding:20px;border-radius:12px;border:1px solid #374151;">
      <h2 style="margin:0 0 8px 0;">Developer Secure Access</h2>
      <p style="margin:0 0 14px 0;color:#cbd5e1;">Restricted endpoint. Provide your private key to continue.</p>
      <form method="post" action="/dev/secure-access">
        <label for="private_key" style="display:block;margin-bottom:6px;font-size:13px;color:#cbd5e1;">Private Key</label>
        <input id="private_key" name="private_key" type="password" autocomplete="off"
               style="width:100%;padding:10px;border-radius:8px;border:1px solid #4b5563;background:#0b1220;color:#e2e8f0;" />
        <button type="submit"
                style="margin-top:12px;padding:10px 14px;border:none;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;">
          Validate Key
        </button>
      </form>
    </div>
  </body>
</html>
"""


def _not_found_response() -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content={"detail": "Not found"},
        headers=NO_STORE_HEADERS,
    )


def _forbidden_response(outcome: DeceptionOutcome | None = None) -> JSONResponse:
    headers = dict(NO_STORE_HEADERS)
    if outcome and outcome.blocked and outcome.timeout_until:
        retry_after = max(1, int((outcome.timeout_until - datetime.utcnow()).total_seconds()))
        headers["Retry-After"] = str(retry_after)
    return JSONResponse(
        status_code=403,
        content={"detail": "Forbidden"},
        headers=headers,
    )


@router.get("/dev/secure-access", include_in_schema=False, response_class=HTMLResponse)
async def honeypot_dev_secure_access(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    outcome = await register_honeypot_event(
        db=db,
        request=request,
        endpoint="/dev/secure-access",
        event_type="endpoint_access",
    )

    if outcome.should_delay and DELAY_SECONDS > 0 and not getattr(request.state, "deception_delay_applied", False):
        await asyncio.sleep(DELAY_SECONDS)
        request.state.deception_delay_applied = True

    if not settings.DECEPTION_DEMO_MODE:
        return _not_found_response()

    return HTMLResponse(_fake_restricted_page(), status_code=200, headers=NO_STORE_HEADERS)


@router.post("/dev/secure-access", include_in_schema=False)
async def honeypot_dev_secure_access_submit(
    request: Request,
    private_key: str = Form(default=""),
    db: AsyncSession = Depends(get_db),
):
    outcome = await register_honeypot_event(
        db=db,
        request=request,
        endpoint="/dev/secure-access",
        event_type="credential_submit",
        payload_value=private_key,
    )

    if outcome.should_delay and DELAY_SECONDS > 0 and not getattr(request.state, "deception_delay_applied", False):
        await asyncio.sleep(DELAY_SECONDS)
        request.state.deception_delay_applied = True

    return _forbidden_response(outcome=outcome)


@router.get("/api/internal/debug", include_in_schema=False)
async def honeypot_internal_debug(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    outcome = await register_honeypot_event(
        db=db,
        request=request,
        endpoint="/api/internal/debug",
        event_type="endpoint_access",
    )

    if outcome.should_delay and DELAY_SECONDS > 0 and not getattr(request.state, "deception_delay_applied", False):
        await asyncio.sleep(DELAY_SECONDS)
        request.state.deception_delay_applied = True

    return _not_found_response()


@router.post("/api/internal/debug", include_in_schema=False)
async def honeypot_internal_debug_submit(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    payload = await request.body()
    outcome = await register_honeypot_event(
        db=db,
        request=request,
        endpoint="/api/internal/debug",
        event_type="credential_submit",
        payload_value=payload.decode("utf-8", errors="ignore") if payload else None,
    )

    if outcome.should_delay and DELAY_SECONDS > 0 and not getattr(request.state, "deception_delay_applied", False):
        await asyncio.sleep(DELAY_SECONDS)
        request.state.deception_delay_applied = True

    return _forbidden_response(outcome=outcome)
