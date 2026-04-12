"""
VajraKavach - Deception Service
Hidden honeypot scoring, adaptive response, and persistence.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.security_state import DeceptionActorState, DeceptionEvent
from app.services.auth_service import decode_token
from app.utils.ip import get_client_ip

# Scoring weights
ACCESS_SCORE = max(0, int(settings.DECEPTION_ACCESS_SCORE))
SUBMIT_SCORE = max(0, int(settings.DECEPTION_SUBMIT_SCORE))
REPEAT_SCORE = max(0, int(settings.DECEPTION_REPEAT_SCORE))

# Progressive response thresholds
WARNING_THRESHOLD = max(1, int(settings.DECEPTION_WARNING_THRESHOLD))
DELAY_THRESHOLD = max(WARNING_THRESHOLD, int(settings.DECEPTION_DELAY_THRESHOLD))
TIMEOUT_THRESHOLD = max(DELAY_THRESHOLD, int(settings.DECEPTION_TIMEOUT_THRESHOLD))

# Timing controls
REPEAT_WINDOW_SECONDS = max(1, int(settings.DECEPTION_REPEAT_WINDOW_SECONDS))
DECAY_POINTS = max(0, int(settings.DECEPTION_DECAY_POINTS))
DECAY_INTERVAL_MINUTES = max(1, int(settings.DECEPTION_DECAY_INTERVAL_MINUTES))
TIMEOUT_MINUTES = max(1, int(settings.DECEPTION_TIMEOUT_MINUTES))
PAYLOAD_HASH_MAX_LEN = max(256, int(settings.DECEPTION_PAYLOAD_HASH_MAX_LEN))


@dataclass
class ActorContext:
    actor_id: str
    user_id: Optional[uuid.UUID]
    session_fingerprint: Optional[str]
    ip_address: str


@dataclass
class DeceptionOutcome:
    actor_id: str
    threat_score: int
    warning: bool
    should_delay: bool
    blocked: bool
    timeout_until: Optional[datetime]


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()


def _hash_payload(payload_value: Optional[str]) -> Optional[str]:
    if not payload_value:
        return None
    # Bound attacker-controlled payload size before hashing to avoid expensive work.
    return _hash_value(payload_value[:PAYLOAD_HASH_MAX_LEN])


def _extract_token(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip() or None
    return request.cookies.get("access_token")


def _session_fingerprint(request: Request, token: Optional[str]) -> Optional[str]:
    # Prefer long-lived refresh token as session anchor, fallback to access token/bearer token.
    session_source = request.cookies.get("refresh_token") or request.cookies.get("access_token") or token
    if not session_source:
        return None
    return _hash_value(session_source)[:32]


def resolve_actor_context(request: Request) -> ActorContext:
    ip = get_client_ip(request)
    token = _extract_token(request)
    user_id: Optional[uuid.UUID] = None
    if token:
        payload = decode_token(token)
        if payload and payload.get("sub"):
            try:
                user_id = uuid.UUID(str(payload.get("sub")))
            except (ValueError, TypeError):
                user_id = None

    session_fp = _session_fingerprint(request, token)
    actor_seed = f"{str(user_id) if user_id else 'anon'}|{session_fp or 'no-session'}|{ip}"
    actor_id = _hash_value(actor_seed)

    return ActorContext(
        actor_id=actor_id,
        user_id=user_id,
        session_fingerprint=session_fp,
        ip_address=ip,
    )


def _apply_score_decay(score: int, last_event_at: Optional[datetime], now: datetime) -> int:
    if score <= 0 or not last_event_at:
        return max(0, score)

    elapsed_seconds = max(0, (now - last_event_at).total_seconds())
    intervals = int(elapsed_seconds // (DECAY_INTERVAL_MINUTES * 60))
    if intervals <= 0:
        return score

    return max(0, score - (intervals * DECAY_POINTS))


def _timeout_remaining_seconds(timeout_until: Optional[datetime], now: datetime) -> int:
    if not timeout_until or timeout_until <= now:
        return 0
    return int((timeout_until - now).total_seconds())


def _header_snapshot(request: Request) -> dict:
    return {
        "origin": request.headers.get("origin"),
        "referer": request.headers.get("referer"),
        "accept": request.headers.get("accept"),
        "x-forwarded-for": request.headers.get("x-forwarded-for"),
        "x-real-ip": request.headers.get("x-real-ip"),
    }


async def _get_or_create_actor_state(
    db: AsyncSession,
    ctx: ActorContext,
    endpoint: str,
) -> DeceptionActorState:
    result = await db.execute(
        select(DeceptionActorState).where(DeceptionActorState.actor_id == ctx.actor_id)
    )
    state = result.scalar_one_or_none()
    if state:
        return state

    state = DeceptionActorState(
        actor_id=ctx.actor_id,
        user_id=ctx.user_id,
        session_fingerprint=ctx.session_fingerprint,
        ip_address=ctx.ip_address,
        threat_score=0,
        total_events=0,
        last_event_at=datetime.utcnow(),
        last_endpoint=endpoint,
    )
    db.add(state)
    await db.flush()
    return state


def threat_level(score: int) -> str:
    if score >= TIMEOUT_THRESHOLD:
        return "high"
    if score >= DELAY_THRESHOLD:
        return "medium"
    return "low"


async def get_enforcement_outcome(db: AsyncSession, request: Request) -> DeceptionOutcome:
    now = datetime.utcnow()
    ctx = resolve_actor_context(request)

    result = await db.execute(
        select(DeceptionActorState).where(DeceptionActorState.actor_id == ctx.actor_id)
    )
    state = result.scalar_one_or_none()

    if not state:
        return DeceptionOutcome(
            actor_id=ctx.actor_id,
            threat_score=0,
            warning=False,
            should_delay=False,
            blocked=False,
            timeout_until=None,
        )

    decayed = _apply_score_decay(state.threat_score, state.last_event_at, now)
    if decayed != state.threat_score:
        state.threat_score = decayed
        await db.flush()

    blocked = _timeout_remaining_seconds(state.timeout_until, now) > 0
    return DeceptionOutcome(
        actor_id=ctx.actor_id,
        threat_score=state.threat_score,
        warning=state.threat_score >= WARNING_THRESHOLD,
        should_delay=state.threat_score >= DELAY_THRESHOLD,
        blocked=blocked,
        timeout_until=state.timeout_until,
    )


async def register_honeypot_event(
    db: AsyncSession,
    request: Request,
    endpoint: str,
    event_type: str,
    payload_value: Optional[str] = None,
) -> DeceptionOutcome:
    now = datetime.utcnow()
    ctx = resolve_actor_context(request)
    state = await _get_or_create_actor_state(db, ctx, endpoint)

    state.threat_score = _apply_score_decay(state.threat_score, state.last_event_at, now)

    if event_type == "credential_submit":
        delta = SUBMIT_SCORE
    else:
        delta = ACCESS_SCORE

    repeated = state.last_event_at and (now - state.last_event_at).total_seconds() <= REPEAT_WINDOW_SECONDS
    if repeated:
        delta += REPEAT_SCORE

    score_after = max(0, state.threat_score + delta)

    timeout_until = state.timeout_until
    if score_after >= TIMEOUT_THRESHOLD:
        candidate = now + timedelta(minutes=TIMEOUT_MINUTES)
        if not timeout_until or candidate > timeout_until:
            timeout_until = candidate

    state.user_id = ctx.user_id
    state.session_fingerprint = ctx.session_fingerprint
    state.ip_address = ctx.ip_address
    state.threat_score = score_after
    state.total_events += 1
    state.timeout_until = timeout_until
    state.last_event_at = now
    state.last_endpoint = endpoint

    event = DeceptionEvent(
        actor_id=ctx.actor_id,
        user_id=ctx.user_id,
        session_fingerprint=ctx.session_fingerprint,
        ip_address=ctx.ip_address,
        endpoint=endpoint,
        method=request.method,
        event_type=event_type if not repeated else f"{event_type}_repeat",
        score_delta=delta,
        score_after=score_after,
        payload_digest=_hash_payload(payload_value),
        user_agent=(request.headers.get("user-agent") or "")[:512],
        headers_snapshot=_header_snapshot(request),
    )
    db.add(event)
    await db.flush()

    return DeceptionOutcome(
        actor_id=ctx.actor_id,
        threat_score=score_after,
        warning=score_after >= WARNING_THRESHOLD,
        should_delay=score_after >= DELAY_THRESHOLD,
        blocked=_timeout_remaining_seconds(timeout_until, now) > 0,
        timeout_until=timeout_until,
    )
