"""
VajraKavach — Audit Service
Tamper-evident logging with SHA-256 hash chaining.
"""

import hashlib
import json
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, text
from app.models.audit import AuditLog


GENESIS_HASH = "0" * 64


def _compute_entry_hash(
    action: str,
    user_id: str,
    resource: str,
    resource_id: str,
    details: str,
    ip_address: str,
    previous_hash: str,
    timestamp: str,
) -> str:
    """Compute SHA-256 hash of the audit entry concatenated with previous hash."""
    payload = f"{previous_hash}|{action}|{user_id}|{resource}|{resource_id}|{details}|{ip_address}|{timestamp}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def get_last_hash(db: AsyncSession, lock: bool = False) -> str:
    """Retrieve the hash of the most recent audit log entry.
    When lock=True, uses SELECT ... FOR UPDATE to prevent race conditions."""
    stmt = (
        select(AuditLog.entry_hash)
        .order_by(desc(AuditLog.created_at))
        .limit(1)
    )
    if lock:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    return row if row else GENESIS_HASH


async def create_audit_log(
    db: AsyncSession,
    action: str,
    user_id: Optional[str] = None,
    resource: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    previous_hash = await get_last_hash(db, lock=True)

    # CRITICAL: Use the SAME datetime object for both hash and DB field
    now = datetime.utcnow()
    timestamp = now.isoformat()
    details_str = json.dumps(details) if details else ""

    entry_hash = _compute_entry_hash(
        action=action,
        user_id=str(user_id) if user_id else "",
        resource=resource or "",
        resource_id=str(resource_id) if resource_id else "",
        details=details_str,
        ip_address=ip_address or "",
        previous_hash=previous_hash,
        timestamp=timestamp,
    )

    log_entry = AuditLog(
        id=uuid.uuid4(),
        user_id=user_id,
        action=action,
        resource=resource,
        resource_id=str(resource_id) if resource_id else None,
        details=details_str,
        ip_address=ip_address,
        entry_hash=entry_hash,
        previous_hash=previous_hash,
        created_at=now,  # Same object used for hash computation
    )

    db.add(log_entry)
    await db.flush()
    return log_entry


async def verify_audit_chain(db: AsyncSession) -> dict:
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at)
    )
    logs = result.scalars().all()

    if not logs:
        return {"valid": True, "broken_at": None, "total_entries": 0}

    expected_prev = GENESIS_HASH
    for log in logs:
        recomputed = _compute_entry_hash(
            action=log.action,
            user_id=str(log.user_id) if log.user_id else "",
            resource=log.resource or "",
            resource_id=log.resource_id or "",
            details=log.details or "",
            ip_address=log.ip_address or "",
            previous_hash=log.previous_hash,
            timestamp=log.created_at.isoformat(),
        )

        if log.previous_hash != expected_prev:
            return {"valid": False, "broken_at": str(log.id), "total_entries": len(logs)}

        if log.entry_hash != recomputed:
            return {"valid": False, "broken_at": str(log.id), "total_entries": len(logs)}

        expected_prev = log.entry_hash

    return {"valid": True, "broken_at": None, "total_entries": len(logs)}
