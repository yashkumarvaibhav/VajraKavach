"""
VajraKavach — Persistent Security State Models
DB-backed token blocklist and TOTP lockout (survives server restarts).
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, Float
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class RevokedToken(Base):
    """Persistent JWT blocklist — tokens survive server restarts."""
    __tablename__ = "revoked_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, default=datetime.utcnow)


class TOTPLockout(Base):
    """Persistent per-account TOTP attempt tracking — survives server restarts."""
    __tablename__ = "totp_lockouts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    identifier = Column(String(255), unique=True, nullable=False, index=True)
    attempts = Column(Integer, default=0)
    first_attempt_at = Column(Float, nullable=False)
    locked_until = Column(Float, default=0)
    lockout_level = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
