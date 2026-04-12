"""
VajraKavach — Persistent Security State Models
DB-backed token blocklist and TOTP lockout (survives server restarts).
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, Float, JSON
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


class DeceptionActorState(Base):
    """Persistent threat state for an actor fingerprint (user/session/IP)."""
    __tablename__ = "deception_actor_states"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    session_fingerprint = Column(String(64), nullable=True, index=True)
    ip_address = Column(String(64), nullable=False, index=True)
    threat_score = Column(Integer, default=0, nullable=False)
    total_events = Column(Integer, default=0, nullable=False)
    timeout_until = Column(DateTime, nullable=True)
    last_event_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_endpoint = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DeceptionEvent(Base):
    """Immutable log of honeypot/deception interactions."""
    __tablename__ = "deception_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id = Column(String(64), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    session_fingerprint = Column(String(64), nullable=True, index=True)
    ip_address = Column(String(64), nullable=False, index=True)
    endpoint = Column(String(255), nullable=False)
    method = Column(String(16), nullable=False)
    event_type = Column(String(64), nullable=False, index=True)
    score_delta = Column(Integer, nullable=False)
    score_after = Column(Integer, nullable=False)
    payload_digest = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    headers_snapshot = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
