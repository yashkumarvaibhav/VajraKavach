"""
VajraKavach — TOTP Service
Generates TOTP secrets and QR codes, verifies TOTP tokens.
Uses pyotp (RFC 6238). Per-account lockout is DB-backed (survives restarts).
"""

import pyotp
import qrcode
import io
import base64
import logging
import time
from cryptography.fernet import Fernet, InvalidToken
from app.config import settings

logger = logging.getLogger(__name__)

_fernet = None

# ── Per-IP TOTP attempt tracking (in-memory fast path + DB persistence) ──
# In-memory cache; DB is source of truth and synced periodically
# Value: (attempts, first_attempt_time, locked_until, lockout_level)
_totp_attempts: dict[str, tuple[int, float, float, int]] = {}
TOTP_MAX_ATTEMPTS = 3            # Failed TOTP attempts before lockout
TOTP_WINDOW_SECONDS = 300        # 5-minute sliding window for attempt counting
TOTP_BASE_LOCKOUT_MINUTES = 60   # First lockout: 60 minutes
TOTP_LOCKOUT_MULTIPLIER = 5     # Each subsequent lockout ×5: 60, 300, 1500, ...


def _lockout_duration(level: int) -> float:
    """Compute lockout duration in seconds for a given lockout level."""
    return TOTP_BASE_LOCKOUT_MINUTES * (TOTP_LOCKOUT_MULTIPLIER ** level) * 60


def check_totp_lockout(identifier: str) -> bool:
    """Check if an IP is locked out from TOTP attempts. Returns True if locked."""
    entry = _totp_attempts.get(identifier)
    if not entry:
        return False
    attempts, first_time, locked_until, level = entry
    now = time.time()
    if locked_until and now < locked_until:
        return True
    # Window expired — reset attempts but keep lockout level
    if now - first_time > TOTP_WINDOW_SECONDS:
        _totp_attempts[identifier] = (0, now, 0, level)
        return False
    return False


def record_totp_failure(identifier: str) -> bool:
    """Record a failed TOTP attempt. Returns True if IP is now locked out."""
    now = time.time()
    entry = _totp_attempts.get(identifier)
    if entry:
        attempts, first_time, locked_until, level = entry
        # If still locked, stay locked
        if locked_until and now < locked_until:
            return True
        # Window expired — start fresh attempt count (keep level)
        if now - first_time > TOTP_WINDOW_SECONDS:
            _totp_attempts[identifier] = (1, now, 0, level)
            return False
        attempts += 1
        if attempts >= TOTP_MAX_ATTEMPTS:
            new_level = level + 1
            duration = _lockout_duration(level)
            _totp_attempts[identifier] = (attempts, first_time, now + duration, new_level)
            return True
        _totp_attempts[identifier] = (attempts, first_time, 0, level)
        return False
    else:
        _totp_attempts[identifier] = (1, now, 0, 0)
        return False


def clear_totp_attempts(identifier: str):
    """Clear attempt counter on successful TOTP verification (keeps lockout level)."""
    entry = _totp_attempts.get(identifier)
    if entry:
        _, _, _, level = entry
        # Keep the level so progressive lockout persists across successes
        _totp_attempts[identifier] = (0, time.time(), 0, level)
    # If no entry, nothing to clear


async def sync_totp_lockout_to_db(db):
    """Persist TOTP lockout state to database for restart survival."""
    from app.models.security_state import TOTPLockout
    from sqlalchemy import select
    for identifier, (attempts, first_time, locked_until, level) in dict(_totp_attempts).items():
        existing = await db.execute(
            select(TOTPLockout).where(TOTPLockout.identifier == identifier)
        )
        row = existing.scalar_one_or_none()
        if row:
            row.attempts = attempts
            row.first_attempt_at = first_time
            row.locked_until = locked_until
            row.lockout_level = level
        else:
            db.add(TOTPLockout(
                identifier=identifier,
                attempts=attempts,
                first_attempt_at=first_time,
                locked_until=locked_until,
                lockout_level=level,
            ))
    await db.flush()


async def load_totp_lockout_from_db(db):
    """Load TOTP lockout state from database on startup."""
    from app.models.security_state import TOTPLockout
    from sqlalchemy import select, delete
    now = time.time()
    # Clean expired entries
    await db.execute(
        delete(TOTPLockout).where(
            TOTPLockout.locked_until < now,
            TOTPLockout.locked_until > 0,
        )
    )
    result = await db.execute(select(TOTPLockout))
    for row in result.scalars().all():
        level = getattr(row, 'lockout_level', 0) or 0
        if row.locked_until and now < row.locked_until:
            _totp_attempts[row.identifier] = (row.attempts, row.first_attempt_at, row.locked_until, level)
        elif now - row.first_attempt_at <= TOTP_WINDOW_SECONDS:
            _totp_attempts[row.identifier] = (row.attempts, row.first_attempt_at, row.locked_until, level)
    await db.flush()


def _get_fernet():
    global _fernet
    if _fernet is None and settings.FERNET_SECRET_KEY:
        _fernet = Fernet(settings.FERNET_SECRET_KEY.encode() if isinstance(settings.FERNET_SECRET_KEY, str) else settings.FERNET_SECRET_KEY)
    return _fernet


def encrypt_totp_secret(plaintext_secret: str) -> str:
    """Encrypt a TOTP secret with Fernet. Returns base64 ciphertext."""
    f = _get_fernet()
    if f is None:
        return plaintext_secret
    return f.encrypt(plaintext_secret.encode()).decode()


def decrypt_totp_secret(stored_secret: str) -> str:
    """Decrypt a Fernet-encrypted TOTP secret. Falls back to plaintext for legacy values."""
    f = _get_fernet()
    if f is None:
        return stored_secret
    try:
        return f.decrypt(stored_secret.encode()).decode()
    except (InvalidToken, Exception):
        # Legacy plaintext secret — return as-is
        return stored_secret


def generate_totp_secret() -> str:
    """Generate a new random TOTP secret (base32)."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str) -> str:
    """Build the otpauth:// URI for QR code provisioning."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=settings.TOTP_ISSUER)


def generate_qr_code_base64(uri: str) -> str:
    """Generate a QR code as a base64-encoded PNG string."""
    img = qrcode.make(uri)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")


def verify_totp(secret: str, token: str) -> bool:
    """
    Verify a TOTP token against the secret.
    Allows a window of +/-1 time step (30 seconds each) to handle clock drift.
    """
    totp = pyotp.TOTP(secret)
    return totp.verify(token, valid_window=1)
