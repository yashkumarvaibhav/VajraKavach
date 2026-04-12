"""
VajraKavach — Authentication Service
Handles password hashing (Argon2), JWT token creation/verification,
and DB-backed token blocklist for revocation (survives server restarts).
"""

import hashlib
import time
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings

# Argon2 password hashing context
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# In-memory cache of revoked token hashes (warm cache; DB is source of truth)
_revoked_cache: set[str] = set()
_cache_last_refresh: float = 0.0


def _hash_token(token: str) -> str:
    """SHA-256 hash a token for storage (don't store raw JWTs in DB)."""
    return hashlib.sha256(token.encode()).hexdigest()


def revoke_token(token: str):
    """Add a token to the persistent blocklist via DB.
    Falls back to in-memory if DB isn't available in this context."""
    token_hash = _hash_token(token)
    _revoked_cache.add(token_hash)
    # DB write happens asynchronously in revoke_token_db() called from routes
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        exp = payload.get("exp", time.time() + 3600)
    except JWTError:
        exp = time.time() + 3600
    # Store expiry for cleanup — but actual DB insert is done by the async helper
    _pending_revocations[token_hash] = exp


# Pending DB writes (token_hash -> expiry_timestamp)
_pending_revocations: dict[str, float] = {}


async def flush_pending_revocations(db):
    """Write pending revocations to the database. Called from middleware or routes."""
    if not _pending_revocations:
        return
    from app.models.security_state import RevokedToken
    pending = dict(_pending_revocations)
    _pending_revocations.clear()
    for token_hash, exp_ts in pending.items():
        from sqlalchemy import select
        existing = await db.execute(
            select(RevokedToken).where(RevokedToken.token_hash == token_hash)
        )
        if not existing.scalar_one_or_none():
            db.add(RevokedToken(
                token_hash=token_hash,
                expires_at=datetime.utcfromtimestamp(exp_ts),
            ))
    await db.flush()


async def load_revoked_cache(db):
    """Load active revoked tokens from DB into memory cache."""
    global _cache_last_refresh
    now = time.time()
    if now - _cache_last_refresh < 30:
        return
    from app.models.security_state import RevokedToken
    from sqlalchemy import select
    result = await db.execute(
        select(RevokedToken.token_hash).where(
            RevokedToken.expires_at > datetime.utcnow()
        )
    )
    _revoked_cache.clear()
    for row in result.scalars().all():
        _revoked_cache.add(row)
    _cache_last_refresh = now


async def cleanup_expired_tokens(db):
    """Remove expired tokens from DB."""
    from app.models.security_state import RevokedToken
    from sqlalchemy import delete
    await db.execute(
        delete(RevokedToken).where(RevokedToken.expires_at < datetime.utcnow())
    )
    await db.flush()


def is_token_revoked(token: str) -> bool:
    """Check if a token has been revoked (memory cache check)."""
    return _hash_token(token) in _revoked_cache


def hash_password(password: str) -> str:
    """Hash a plaintext password with Argon2id."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against the stored Argon2 hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a short-lived JWT access token."""
    to_encode = data.copy()
    now = datetime.utcnow()
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": now, "type": "access"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Create a long-lived JWT refresh token."""
    to_encode = data.copy()
    now = datetime.utcnow()
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "iat": now, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token. Returns payload or None if invalid/revoked."""
    if is_token_revoked(token):
        return None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
