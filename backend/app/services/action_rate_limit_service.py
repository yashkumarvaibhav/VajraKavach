"""
VajraKavach — Action Rate Limit Service
Enforces daily/weekly limits on user actions to prevent abuse.
"""

import uuid
from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.action_rate_limit import ActionRateLimit


# ── Limits: {action: (daily_limit, weekly_limit)} ────────────────────
ACTION_LIMITS = {
    "register":               (3,   5),
    "login":                  (50,  200),
    "forgot_password":        (5,   15),
    "password_change":        (3,   10),
    "connection_request":     (30,  100),
    "job_create":             (10,  30),
    "company_create":         (3,   10),
    "job_apply":              (20,  80),
    "message_send":           (200, 1000),
    "group_create":           (5,   15),
    "report_create":          (5,   20),
    "resume_upload":          (10,  30),
    "profile_picture_upload": (10,  30),
    "token_refresh":          (60,  300),
    "search_query":           (200, 800),
    "profile_view":           (100, 500),
}


async def check_action_rate_limit(
    db: AsyncSession,
    action: str,
    identifier: str,
):
    """
    Check if the action is within rate limits. Raises 429 if exceeded.
    Call this BEFORE performing the action.
    """
    limits = ACTION_LIMITS.get(action)
    if not limits:
        return  # No limit defined for this action

    daily_limit, weekly_limit = limits
    today = date.today()

    # Daily check
    daily_result = await db.execute(
        select(func.coalesce(func.sum(ActionRateLimit.count), 0)).where(
            ActionRateLimit.identifier == identifier,
            ActionRateLimit.action == action,
            ActionRateLimit.action_date == today,
        )
    )
    daily_count = daily_result.scalar()

    if daily_count >= daily_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily limit reached for this action ({daily_limit}/day). Try again tomorrow.",
        )

    # Weekly check (Monday–Sunday)
    week_start = today - timedelta(days=today.weekday())
    weekly_result = await db.execute(
        select(func.coalesce(func.sum(ActionRateLimit.count), 0)).where(
            ActionRateLimit.identifier == identifier,
            ActionRateLimit.action == action,
            ActionRateLimit.action_date >= week_start,
        )
    )
    weekly_count = weekly_result.scalar()

    if weekly_count >= weekly_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Weekly limit reached for this action ({weekly_limit}/week). Try again next week.",
        )


async def record_action(
    db: AsyncSession,
    action: str,
    identifier: str,
):
    """
    Record an action occurrence. Call this AFTER the action succeeds.
    Upserts the count for today.
    """
    today = date.today()

    result = await db.execute(
        select(ActionRateLimit).where(
            ActionRateLimit.identifier == identifier,
            ActionRateLimit.action == action,
            ActionRateLimit.action_date == today,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.count += 1
    else:
        db.add(ActionRateLimit(
            id=uuid.uuid4(),
            identifier=identifier,
            action=action,
            action_date=today,
            count=1,
        ))

    await db.flush()
