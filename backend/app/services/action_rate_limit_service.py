"""
VajraKavach — Action Rate Limit Service
Enforces daily/weekly limits on user actions to prevent abuse.
"""

from datetime import date, timedelta
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.action_rate_limit import ActionRateLimit


# ── Rate Limit Configuration ────────────────────────────────────────
# Format: (daily_limit, weekly_limit)
# identifier type: "user" means user_id, "ip" means client IP
ACTION_LIMITS = {
    # Action name              daily  weekly  identifier_type
    "register":               (3,     5,      "ip"),       # account creation per IP (strict)
    "connection_request":     (30,    100,    "user"),     # connection requests per user
    "job_create":             (10,    30,     "user"),     # job postings per recruiter
    "company_create":         (3,     10,     "user"),     # company creation per recruiter
    "job_apply":              (20,    80,     "user"),     # job applications per user
    "message_send":           (200,   1000,   "user"),     # messages per user
    "group_create":           (5,     15,     "user"),     # group creation per user
    "report_create":          (5,     20,     "user"),     # reports per user
    "resume_upload":          (10,    30,     "user"),     # resume uploads per user
    "profile_picture_upload": (10,    30,     "user"),     # profile picture changes per user
    "password_change":        (3,     10,     "user"),     # password changes per user
    "forgot_password":        (5,     15,     "ip"),       # password resets per IP
    "login":                  (50,    200,    "ip"),       # login attempts per IP (slow brute force)
    "token_refresh":          (60,    300,    "user"),     # token refreshes per user
    "search_query":           (200,   800,    "user"),     # search queries per user (anti-scraping)
    "profile_view":           (100,   500,    "user"),     # profile views per user (anti-stalking)
}


async def check_action_rate_limit(
    db: AsyncSession,
    action: str,
    identifier: str,
) -> None:
    """
    Check if the action is within rate limits. Raises 429 if exceeded.
    Call this BEFORE performing the action.
    """
    limits = ACTION_LIMITS.get(action)
    if not limits:
        return  # No limit configured for this action

    daily_limit, weekly_limit, _ = limits
    today = date.today()
    week_start = today - timedelta(days=today.weekday())  # Monday of current week

    # Check daily count
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

    # Check weekly count
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
) -> None:
    """
    Record an action occurrence. Call this AFTER the action succeeds.
    Upserts the count for today.
    """
    today = date.today()

    # Try to find existing record for today
    result = await db.execute(
        select(ActionRateLimit).where(
            ActionRateLimit.identifier == identifier,
            ActionRateLimit.action == action,
            ActionRateLimit.action_date == today,
        )
    )
    record = result.scalar_one_or_none()

    if record:
        record.count += 1
    else:
        record = ActionRateLimit(
            identifier=identifier,
            action=action,
            action_date=today,
            count=1,
        )
        db.add(record)

    # Flush so the count is visible within the same transaction
    await db.flush()
