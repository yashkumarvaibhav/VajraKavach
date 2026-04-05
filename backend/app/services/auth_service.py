"""
VajraKavach — Authentication Service
Handles password hashing (Argon2), JWT token creation/verification,
and in-memory token blocklist for revocation.
"""

import time
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings

# Argon2 password hashing context
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# In-memory JWT blocklist: {token_jti_or_raw: expiry_timestamp}
_token_blocklist: dict[str, float] = {}
_blocklist_last_cleanup: float = 0.0


def _cleanup_blocklist():
    """Remove expired entries from the blocklist periodically."""
    global _blocklist_last_cleanup
    now = time.time()
    if now - _blocklist_last_cleanup < 300:
        return
    expired = [k for k, exp in _token_blocklist.items() if exp < now]
    for k in expired:
        del _token_blocklist[k]
    _blocklist_last_cleanup = now


def revoke_token(token: str):
    """Add a token to the blocklist. It will remain until it naturally expires."""
    _cleanup_blocklist()
    try:
        # Decode without verification to get expiry
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        exp = payload.get("exp", time.time() + 3600)
    except JWTError:
        exp = time.time() + 3600
    _token_blocklist[token] = exp


def is_token_revoked(token: str) -> bool:
    """Check if a token has been revoked."""
    return token in _token_blocklist


def hash_password(password: str) -> str:
    """Hash a plaintext password with Argon2id."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against the stored Argon2 hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a short-lived JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Create a long-lived JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
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
